import { describe, expect, it, vi } from 'vitest'
import { checkGameAccess, createGameAccessCode, GameAccessError, redeemGameAccess } from './gameAccess'
import { requireClient } from './supabase'
import { sha256Hex } from '../utils/crypto'

/**
 * Client-side contract for the game-access RPCs. These tests run the real
 * service functions (no hook mocks) against a stubbed Supabase client and
 * verify that code creation and redemption hash the SAME plaintext, send the
 * exact argument names the database functions expect, and preserve the
 * reported result shape end to end.
 */

vi.mock('./supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase')>()
  return { ...actual, requireClient: vi.fn() }
})

const requireClientMock = vi.mocked(requireClient)

const ADMIN_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const ACCOUNT_ID = '123456789'
const EXPIRES_AT = '2026-09-02T13:00:00.000Z'
const SERVER_NOW = '2026-09-02T12:00:00.000Z'
const CODE_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const SESSION_TOKEN = 'b0b0b0b0c0c0c0c0d0d0d0d0e0e0e0e0f0f0f0f0a1a1a1a1b2b2b2b2c3c3c3c3d4d4d4d4'

function rpcClient(rpc: unknown) {
  return { rpc } as unknown as ReturnType<typeof requireClient>
}

describe('game access RPC contract', () => {
  it('hashes the created code identically when it is redeemed', async () => {
    const rpc = vi.fn(async (...args: unknown[]) => {
      const name = String(args[0])
      if (name === 'create_game_access_code') {
        return { data: [{ id: CODE_ID, expires_at: EXPIRES_AT, created_at: SERVER_NOW, duration_minutes: 60 }], error: null }
      }
      if (name === 'redeem_game_access') {
        return { data: [{ token: SESSION_TOKEN, expires_at: EXPIRES_AT, server_now: SERVER_NOW }], error: null }
      }
      throw new Error(`unexpected RPC: ${name}`)
    })
    requireClientMock.mockReturnValue(rpcClient(rpc))

    const created = await createGameAccessCode(60, ADMIN_ID)
    const expectedHash = await sha256Hex(created.plainCode)
    expect(created.record.id).toBe(CODE_ID)

    const redeemed = await redeemGameAccess(ACCOUNT_ID, created.plainCode)
    expect(redeemed).toEqual({ token: SESSION_TOKEN, expiresAt: EXPIRES_AT, serverNow: SERVER_NOW, accountId: ACCOUNT_ID })

    const createCall = rpc.mock.calls[0]
    const redeemCall = rpc.mock.calls[1]
    expect(createCall[0]).toBe('create_game_access_code')
    expect(createCall[1]).toMatchObject({ p_code_hash: expectedHash, p_duration_minutes: 60, p_created_by: ADMIN_ID })
    expect(redeemCall[0]).toBe('redeem_game_access')
    expect(redeemCall[1]).toMatchObject({ p_code_hash: expectedHash, p_account_id: ACCOUNT_ID })

    // Only the hash crosses the wire — never the plaintext code.
    expect(JSON.stringify(redeemCall[1])).not.toContain(created.plainCode)
  })

  it('rejects an invalid Account ID before any RPC is sent', async () => {
    const rpc = vi.fn()
    requireClientMock.mockReturnValue(rpcClient(rpc))

    await expect(redeemGameAccess('12345678', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')).rejects.toMatchObject({ kind: 'invalid_account' })
    await expect(redeemGameAccess('123456789012', 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')).rejects.toMatchObject({ kind: 'invalid_account' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps a rejected server verdict (unavailable code) without leaking details', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '28000', message: 'ACCESS_CODE_UNAVAILABLE' } })
    requireClientMock.mockReturnValue(rpcClient(rpc))

    await expect(redeemGameAccess(ACCOUNT_ID, 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('maps a server-side invalid Account ID verdict', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '22023', message: 'INVALID_ACCOUNT_ID' } })
    requireClientMock.mockReturnValue(rpcClient(rpc))

    await expect(redeemGameAccess(ACCOUNT_ID, 'MS-ABCDE-FGHIJ-KLMNP-QRSTU')).rejects.toMatchObject({ kind: 'invalid_account' })
  })

  it('keeps server errors safe: unrecognized failures stay generic', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42883', message: 'function digest(unknown, unknown) does not exist' } })
    requireClientMock.mockReturnValue(rpcClient(rpc))

    const cause = await redeemGameAccess(ACCOUNT_ID, 'MS-ABCDE-FGHIJ-KLMNP-QRSTU').catch((error: unknown) => error)
    expect(cause).toBeInstanceOf(GameAccessError)
    expect((cause as GameAccessError).kind).toBe('unknown')
    expect((cause as GameAccessError).message).toBe('Access could not be verified right now. Try again shortly.')
  })

  it('revalidates a stored session token through check_game_access', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ valid: true, expires_at: EXPIRES_AT, server_now: SERVER_NOW, account_id: ACCOUNT_ID }],
      error: null,
    })
    requireClientMock.mockReturnValue(rpcClient(rpc))

    const check = await checkGameAccess(SESSION_TOKEN)
    expect(check).toEqual({ valid: true, expiresAt: EXPIRES_AT, serverNow: SERVER_NOW, accountId: ACCOUNT_ID })
    expect(rpc).toHaveBeenCalledWith('check_game_access', { p_token_hash: await sha256Hex(SESSION_TOKEN) })
  })
})
