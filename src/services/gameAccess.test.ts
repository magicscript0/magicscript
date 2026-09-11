import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  GameAccessError,
  classifyGameAccessError,
  createGameAccessCode,
  describeAccessCodeIssue,
  describeAccountIdIssue,
  formatDurationMinutes,
  gameAccessCodeStatus,
  gameAccessSessionEndsAt,
  isValidAccountId,
  normalizeAccountId,
  redeemGameAccess,
} from './gameAccess'
import { requireClient } from './supabase'
import { sha256Hex } from '../utils/crypto'

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireClient: vi.fn(),
}))

const requireClientMock = vi.mocked(requireClient)

describe('Account ID rules', () => {
  it('accepts 9, 10, and 11 digit identifiers', () => {
    expect(isValidAccountId('123456789')).toBe(true)
    expect(isValidAccountId('1234567890')).toBe(true)
    expect(isValidAccountId('12345678901')).toBe(true)
  })

  it('rejects empty, short, long, and non-numeric identifiers', () => {
    expect(isValidAccountId('')).toBe(false)
    expect(isValidAccountId('12345678')).toBe(false)
    expect(isValidAccountId('123456789012')).toBe(false)
    expect(isValidAccountId('12345678a')).toBe(false)
    expect(isValidAccountId('123-456-789')).toBe(false)
  })

  it('normalizes surrounding whitespace but keeps the digits', () => {
    expect(normalizeAccountId(' 123 456 789 ')).toBe('123456789')
  })

  it('explains each invalid shape without technical detail', () => {
    expect(describeAccountIdIssue('')).toBe('Enter your Account ID.')
    expect(describeAccountIdIssue('12345678')).toBe('The Account ID must be 9–11 digits.')
    expect(describeAccountIdIssue('123456789012')).toBe('The Account ID must be 9–11 digits.')
    expect(describeAccountIdIssue('12345abc9')).toBe('The Account ID can contain numbers only.')
    expect(describeAccountIdIssue('123456789')).toBeNull()
  })
})

describe('Access Code rules', () => {
  it('requires a non-empty, reasonably sized code', () => {
    expect(describeAccessCodeIssue('')).toBe('Enter your Access Code.')
    expect(describeAccessCodeIssue('   ')).toBe('Enter your Access Code.')
    expect(describeAccessCodeIssue('x'.repeat(161))).toBe('This Access Code is too long to be valid.')
    expect(describeAccessCodeIssue('MS-ABCDE-FGHIJ-KLMNP-QRSTU')).toBeNull()
  })
})

describe('game access code status', () => {
  const now = Date.parse('2026-09-02T12:00:00.000Z')
  // A created-but-never-redeemed code: the session timer has NOT started.
  const waiting = { active: true, expires_at: null, revoked_at: null, redeemed_at: null, duration_minutes: 60 }
  // A redeemed code whose session (redeemed_at + 60 min) is still running.
  const running = { ...waiting, redeemed_at: '2026-09-02T11:30:00.000Z' }

  it('reports active, expired, revoked, and inactive states', () => {
    expect(gameAccessCodeStatus(running, now)).toBe('active')
    expect(gameAccessCodeStatus({ ...running, redeemed_at: '2026-09-02T10:00:00.000Z' }, now)).toBe('expired')
    expect(gameAccessCodeStatus({ ...running, revoked_at: '2026-09-02T11:00:00.000Z' }, now)).toBe('revoked')
    expect(gameAccessCodeStatus(waiting, now)).toBe('inactive')
    expect(gameAccessCodeStatus({ ...waiting, active: false }, now)).toBe('inactive')
  })

  it('treats the exact session end as expired (server activation + duration)', () => {
    expect(gameAccessCodeStatus({ ...running, redeemed_at: '2026-09-02T11:00:00.000Z' }, now)).toBe('expired')
  })

  it('an unredeemed code waits as inactive — creation never starts the timer', () => {
    expect(gameAccessCodeStatus({ ...waiting, expires_at: null }, now)).toBe('inactive')
    // A redeem-by deadline still in the future does not start anything either.
    expect(gameAccessCodeStatus({ ...waiting, expires_at: '2026-09-02T12:59:00.000Z' }, now)).toBe('inactive')
  })

  it('an unredeemed code past its redeem-by deadline can never activate', () => {
    expect(gameAccessCodeStatus({ ...waiting, expires_at: '2026-09-02T12:00:00.000Z' }, now)).toBe('expired')
  })

  it('derives the session end from the recorded activation time plus the duration', () => {
    expect(gameAccessSessionEndsAt(running)).toBe(Date.parse('2026-09-02T12:30:00.000Z'))
    expect(gameAccessSessionEndsAt(waiting)).toBeNull()
    expect(gameAccessSessionEndsAt({ ...running, duration_minutes: 1440 })).toBe(Date.parse('2026-09-03T11:30:00.000Z'))
  })
})

describe('duration formatting', () => {
  it('formats presets human-readably', () => {
    expect(formatDurationMinutes(15)).toBe('15 minutes')
    expect(formatDurationMinutes(60)).toBe('1 hour')
    expect(formatDurationMinutes(120)).toBe('2 hours')
    expect(formatDurationMinutes(1440)).toBe('1 day')
    expect(formatDurationMinutes(2880)).toBe('2 days')
    expect(formatDurationMinutes(45)).toBe('45 minutes')
  })
})

/* ------------------------------------------------------------------ */
/* Real RPC contracts (Supabase remains the only authority)            */
/* ------------------------------------------------------------------ */

describe('redeemGameAccess', () => {
  const rpc = vi.fn()

  beforeEach(() => {
    requireClientMock.mockReturnValue({ rpc } as unknown as ReturnType<typeof requireClient>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends ONLY the SHA-256 hash plus the Account ID to the redeem RPC — never the plaintext code', async () => {
    rpc.mockResolvedValue({
      data: [{ token: 'opaque-token', expires_at: '2026-09-02T14:00:00.000Z', server_now: '2026-09-02T12:00:00.000Z' }],
      error: null,
    })

    const result = await redeemGameAccess(' 123 456 789 ', '  MS-CODE-VALUE  ')

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('redeem_game_access', {
      p_code_hash: await sha256Hex('MS-CODE-VALUE'),
      p_account_id: '123456789',
    })
    const sent = JSON.stringify(rpc.mock.calls[0])
    expect(sent).not.toContain('MS-CODE-VALUE')
    expect(result).toEqual({
      token: 'opaque-token',
      expiresAt: '2026-09-02T14:00:00.000Z',
      serverNow: '2026-09-02T12:00:00.000Z',
      accountId: '123456789',
    })
  })

  it('maps a raw, unmapped database failure to the safe unknown verdict', async () => {
    // The exact failure a broken server function produces (e.g. an
    // unresolvable helper): none of the sentinel messages match.
    rpc.mockRejectedValue({ message: 'function digest(text, unknown) does not exist' })

    await expect(redeemGameAccess('123456789', 'MS-CODE')).rejects.toMatchObject({
      kind: 'unknown',
      message: 'Access could not be verified right now. Try again shortly.',
    })
  })

  it('maps the server sentinels to their friendly categories', async () => {
    rpc.mockRejectedValue({ message: 'ACCESS_CODE_UNAVAILABLE' })
    await expect(redeemGameAccess('123456789', 'MS-CODE')).rejects.toMatchObject({ kind: 'unavailable' })

    rpc.mockRejectedValue({ message: 'INVALID_ACCOUNT_ID' })
    await expect(redeemGameAccess('123456789', 'MS-CODE')).rejects.toMatchObject({ kind: 'invalid_account' })
  })

  it('rejects codes the server did not accept without inventing a session', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await expect(redeemGameAccess('123456789', 'MS-CODE')).rejects.toMatchObject({ kind: 'unavailable' })
    expect(requireClientMock).toHaveBeenCalled()
  })

  it('validates the Account ID and code locally before any network call', async () => {
    await expect(redeemGameAccess('12345', 'MS-CODE')).rejects.toMatchObject({ kind: 'invalid_account' })
    await expect(redeemGameAccess('123456789', '   ')).rejects.toMatchObject({ kind: 'invalid_code' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('createGameAccessCode', () => {
  const rpc = vi.fn()

  beforeEach(() => {
    requireClientMock.mockReturnValue({ rpc } as unknown as ReturnType<typeof requireClient>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates the code server-side and treats it as inactive until activation', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'code-1', expires_at: null, created_at: '2026-09-02T12:00:00.000Z', duration_minutes: 120 }],
      error: null,
    })

    const { record, plainCode } = await createGameAccessCode(120, 'admin-1')

    // The hash of the generated plaintext is what reaches the database.
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('create_game_access_code', {
      p_code_hash: await sha256Hex(plainCode),
      p_duration_minutes: 120,
      p_created_by: 'admin-1',
    })
    // No expiry and no redemption yet: the session timer must not have started.
    expect(record).toEqual({
      id: 'code-1',
      duration_minutes: 120,
      active: true,
      expires_at: null,
      created_at: '2026-09-02T12:00:00.000Z',
      created_by: 'admin-1',
      revoked_at: null,
      uses_count: 0,
      account_id: null,
      redeemed_at: null,
    })
    expect(gameAccessCodeStatus(record)).toBe('inactive')
  })

  it('keeps an optional redeem-by deadline when the server returns one', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'code-2', expires_at: '2026-09-09T12:00:00.000Z', created_at: '2026-09-02T12:00:00.000Z', duration_minutes: 60 }],
      error: null,
    })
    const { record } = await createGameAccessCode(60, 'admin-1')
    expect(record.expires_at).toBe('2026-09-09T12:00:00.000Z')
  })

  it('rejects out-of-range durations before contacting the server', async () => {
    await expect(createGameAccessCode(4, 'admin-1')).rejects.toThrow(/between 5 and 10080/)
    await expect(createGameAccessCode(10081, 'admin-1')).rejects.toThrow(/between 5 and 10080/)
    await expect(createGameAccessCode(12.5, 'admin-1')).rejects.toThrow(/between 5 and 10080/)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('server error classification', () => {
  it('maps expired/revoked/unknown code verdicts to a safe message', () => {
    const unavailable = classifyGameAccessError({ message: 'ACCESS_CODE_UNAVAILABLE' })
    expect(unavailable).toBeInstanceOf(GameAccessError)
    expect(unavailable.kind).toBe('unavailable')
    expect(unavailable.message).not.toMatch(/expired|revoked|supabase|rls/i)
  })

  it('maps invalid account and invalid code verdicts', () => {
    expect(classifyGameAccessError({ message: 'INVALID_ACCOUNT_ID' }).kind).toBe('invalid_account')
    expect(classifyGameAccessError({ message: 'INVALID_ACCESS_CODE' }).kind).toBe('invalid_code')
  })

  it('maps network failures to a retryable message', () => {
    expect(classifyGameAccessError(new TypeError('Failed to fetch')).kind).toBe('network')
  })
})
