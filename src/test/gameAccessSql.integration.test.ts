// @vitest-environment node
/**
 * REAL ACCESS-CODE LIFECYCLE — database integration test.
 *
 * Runs the repository's ACTUAL Supabase migrations against an embedded
 * PostgreSQL (@electric-sql/pglite, a real Postgres compiled to WASM) in a
 * Supabase-like environment:
 *
 *  - pgcrypto is installed into the `extensions` schema (Supabase NEVER
 *    installs extensions into `public`),
 *  - the `anon` / `authenticated` roles and the `auth.uid()` plumbing exist,
 *  - the migrations are applied verbatim from supabase/migrations.
 *
 * This exercises the production path end to end:
 *   admin creates code → code waits (timer NOT started)
 *   → public redemption → session created (expiry = activation + duration)
 *   → validation → revocation / expiry / authorization.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const REPO_ROOT = join(__dirname, '..', '..')
const sha256hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex')

const ADMIN_ID = '11111111-1111-1111-1111-111111111111'
const OPERATOR_ID = '22222222-2222-2222-2222-222222222222'
const NOBODY_ID = '33333333-3333-3333-3333-333333333333'

interface CreatedCodeRow { id: string; expires_at: DbTime; created_at: DbTime }
interface RedeemRow { token: string; expires_at: DbTime; server_now: DbTime }
interface CheckRow { valid: boolean; expires_at: DbTime; server_now: DbTime; account_id: string }

/** pglite surfaces timestamptz as JS Date; accept either for comparisons. */
type DbTime = Date | string

let db: PGlite

/** Typed rows helper — the queries below are the production SQL statements. */
async function rows<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await db.query(sql, values)
  return result.rows as T[]
}

function ms(value: DbTime): number {
  return value instanceof Date ? value.getTime() : Date.parse(value)
}

async function setUid(uid: string | null): Promise<void> {
  await db.query('select set_config($1, $2, false)', ['app.uid', uid ?? ''])
}

/** Creates a code exactly like the Admin Dashboard does (via the RPC). */
async function createCode(plainCode: string, durationMinutes = 60, createdBy = ADMIN_ID): Promise<CreatedCodeRow> {
  const result = await rows<CreatedCodeRow>(
    'select * from public.create_game_access_code($1, $2, $3)',
    [sha256hex(plainCode), durationMinutes, createdBy],
  )
  return result[0]
}

/** Redeems exactly like the Public Game Login does (via the RPC). */
async function redeem(plainCode: string, accountId = '123456789'): Promise<RedeemRow> {
  const result = await rows<RedeemRow>('select * from public.redeem_game_access($1, $2)', [sha256hex(plainCode), accountId])
  return result[0]
}

async function check(token: string): Promise<CheckRow> {
  const result = await rows<CheckRow>('select * from public.check_game_access($1)', [sha256hex(token)])
  return result[0]
}

async function expectRpcError(statement: string, values: unknown[], expected: { code?: string; message?: string }): Promise<void> {
  try {
    await db.query(statement, values)
    expect.unreachable(`expected the RPC to fail (${statement})`)
  } catch (error) {
    const err = error as { code?: string; message?: string }
    if (expected.code) expect(err.code).toBe(expected.code)
    if (expected.message) expect(err.message).toBe(expected.message)
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } })

  // --- Supabase-shaped environment -----------------------------------------
  await db.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;  -- Supabase keeps pgcrypto OUT of public
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create type public.admin_role as enum ('super_admin', 'admin', 'operator');
    create table public.admin_users (
      id uuid primary key references auth.users(id) on delete cascade,
      email text not null,
      username text,
      role public.admin_role not null default 'operator',
      active boolean not null default true,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.uid', true), '')::uuid $$;
    create or replace function public.current_admin_role() returns public.admin_role
    language sql stable security definer set search_path = public as $$
      select role from public.admin_users where id = (select auth.uid()) and active = true limit 1 $$;
    -- The control-plane migration normally provides has_admin_role first; it is
    -- restated here VERBATIM (original body) so the repo's migrations below
    -- produce the exact final state, including the fixed version.
    create or replace function public.has_admin_role(required_role public.admin_role)
    returns boolean
    language plpgsql
    stable
    security definer
    set search_path = public
    as $$
    declare
      current_role public.admin_role := public.current_admin_role();
    begin
      if current_role is null then return false; end if;
      if current_role = 'super_admin' then return true; end if;
      if required_role = 'operator' then return true; end if;
      return current_role = required_role;
    end;
    $$;
  `)

  // --- The repo's REAL migrations, verbatim ---------------------------------
  await db.exec(readFileSync(join(REPO_ROOT, 'supabase/migrations/20260902000002_game_access.sql'), 'utf8'))
  await db.exec(readFileSync(join(REPO_ROOT, 'supabase/migrations/20260910120000_game_access_verification_fix.sql'), 'utf8'))

  // --- Administrators --------------------------------------------------------
  for (const [id, role] of [[ADMIN_ID, 'admin'], [OPERATOR_ID, 'operator']] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@example.com`])
    await db.query('insert into public.admin_users (id, email, role, active) values ($1, $2, $3, true)', [id, `${id}@example.com`, role])
  }
  await db.query('insert into auth.users (id, email) values ($1, $2)', [NOBODY_ID, `${NOBODY_ID}@example.com`])
}, 180_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  // Fresh identity per test: an authenticated administrator session.
  await db.exec('reset role')
  await setUid(ADMIN_ID)
})

describe('game access lifecycle (real SQL, Supabase-shaped)', () => {
  it('creates a code that waits: no session timer has started at creation', async () => {
    const code = await createCode('MS-LIFECYCLE-TEST-0001', 60)

    expect(code.expires_at).toBeNull() // no redeem-by deadline → waits until revoked
    const sessions = await rows<unknown>('select * from public.game_access_sessions')
    expect(sessions).toHaveLength(0)
  })

  it('lets a freshly created code redeem successfully and starts the timer AT redemption', async () => {
    // The code "sits" for hours before the player finds it (creation pushed back).
    const code = await createCode('MS-LIFECYCLE-TEST-0002', 60)
    await db.query("update public.game_access_codes set created_at = now() - interval '4 hours' where id = $1", [code.id])

    const before = await rows<{ redeemed_at: string | null; uses_count: number }>(
      'select redeemed_at, uses_count from public.game_access_codes where id = $1', [code.id])
    expect(before[0].redeemed_at).toBeNull()
    expect(before[0].uses_count).toBe(0)

    const redeemed = await redeem('MS-LIFECYCLE-TEST-0002', '987654321')

    expect(redeemed.token).toMatch(/^[0-9a-f]{64}$/)
    const waited = ms(redeemed.expires_at) - ms(redeemed.server_now)
    // Expires ~60 minutes AFTER REDEMPTION — not 60 minutes after creation
    // (which would already be in the past after the 4-hour wait).
    expect(waited).toBeGreaterThan(59 * 60_000)
    expect(waited).toBeLessThanOrEqual(60 * 60_000)

    const codeRow = await rows<{ redeemed_at: DbTime; account_id: string; uses_count: number; active: boolean; revoked_at: string | null }>(
      'select redeemed_at, account_id, uses_count, active, revoked_at from public.game_access_codes where id = $1', [code.id])
    expect(codeRow[0].uses_count).toBe(1)
    expect(codeRow[0].account_id).toBe('987654321')
    expect(codeRow[0].active).toBe(true)
    expect(codeRow[0].revoked_at).toBeNull()
    // Activation = redemption moment; session deadline = activation + duration.
    const redeemedAt = ms(codeRow[0].redeemed_at)
    expect(redeemedAt).toBeGreaterThan(Date.now() - 60_000)
    expect(Math.abs(ms(redeemed.expires_at) - (redeemedAt + 60 * 60_000))).toBeLessThan(2_000)
  })

  it('creates a valid access session whose stored hash is the SHA-256 of the returned token', async () => {
    await createCode('MS-LIFECYCLE-TEST-0003', 30)
    const redeemed = await redeem('MS-LIFECYCLE-TEST-0003', '123456789')

    const verified = await check(redeemed.token)
    expect(verified.valid).toBe(true)
    expect(verified.account_id).toBe('123456789')
    expect(Math.abs(ms(verified.expires_at) - ms(redeemed.expires_at))).toBeLessThan(1_000)

    const stored = await rows<{ token_hash: string }>('select token_hash from public.game_access_sessions')
    expect(stored.some((row) => row.token_hash === sha256hex(redeemed.token))).toBe(true)
    // Only hashes are persisted — the plaintext token never touches storage.
    expect(JSON.stringify(stored)).not.toContain(redeemed.token)
  })

  it('rejects sessions once they expire, and expiry follows the activation time', async () => {
    await createCode('MS-LIFECYCLE-TEST-0004', 15)
    const redeemed = await redeem('MS-LIFECYCLE-TEST-0004', '123456789')
    expect((await check(redeemed.token)).valid).toBe(true)

    // Simulate the deadline passing (server-side state, as time would).
    await db.exec("update public.game_access_sessions set expires_at = now() - interval '1 second'")
    const verified = await check(redeemed.token)
    expect(verified.valid).toBe(false)
    expect(ms(verified.expires_at)).toBeLessThanOrEqual(ms(verified.server_now))
  })

  it('rejects revoked codes and cuts off their live sessions', async () => {
    const code = await createCode('MS-LIFECYCLE-TEST-0005', 60)
    const redeemed = await redeem('MS-LIFECYCLE-TEST-0005', '123456789')

    // Exactly what revokeGameAccessCode() writes through the RLS-protected table.
    await db.query("update public.game_access_codes set active = false, revoked_at = now() where id = $1", [code.id])

    await expectRpcError('select * from public.redeem_game_access($1, $2)',
      [sha256hex('MS-LIFECYCLE-TEST-0005'), '123456789'],
      { code: '28000', message: 'ACCESS_CODE_UNAVAILABLE' })

    expect((await check(redeemed.token)).valid).toBe(false)
  })

  it('rejects disabled (inactive, unrevoked) codes', async () => {
    const code = await createCode('MS-LIFECYCLE-TEST-0006', 60)
    await db.query('update public.game_access_codes set active = false where id = $1', [code.id])
    await expectRpcError('select * from public.redeem_game_access($1, $2)',
      [sha256hex('MS-LIFECYCLE-TEST-0006'), '123456789'],
      { code: '28000', message: 'ACCESS_CODE_UNAVAILABLE' })
  })

  it('enforces an optional redeem-by deadline without starting the session timer', async () => {
    const code = await createCode('MS-LIFECYCLE-TEST-0007', 60)
    // Deadline in the past → can never be activated.
    await db.query("update public.game_access_codes set expires_at = now() - interval '1 minute' where id = $1", [code.id])
    await expectRpcError('select * from public.redeem_game_access($1, $2)',
      [sha256hex('MS-LIFECYCLE-TEST-0007'), '123456789'],
      { code: '28000', message: 'ACCESS_CODE_UNAVAILABLE' })

    // Deadline in the future → redeemable, and the session STILL runs the full
    // duration from activation (the deadline only gates redemption).
    const code2 = await createCode('MS-LIFECYCLE-TEST-0008', 60)
    await db.query("update public.game_access_codes set expires_at = now() + interval '1 hour' where id = $1", [code2.id])
    const redeemed = await redeem('MS-LIFECYCLE-TEST-0008', '123456789')
    expect(ms(redeemed.expires_at) - ms(redeemed.server_now)).toBeGreaterThan(59 * 60_000)
  })

  it('validates inputs server-side with the documented sentinels', async () => {
    await expectRpcError('select * from public.redeem_game_access($1, $2)', [sha256hex('X'), '123'], { code: '22023', message: 'INVALID_ACCOUNT_ID' })
    await expectRpcError('select * from public.redeem_game_access($1, $2)', ['not-a-hash', '123456789'], { code: '22023', message: 'INVALID_ACCESS_CODE' })
    await expectRpcError('select * from public.create_game_access_code($1, $2, $3)', [sha256hex('X'), 20_000, ADMIN_ID], { code: '22023', message: 'INVALID_DURATION' })
  })

  it('lets anonymous visitors redeem and validate but never touch the tables directly', async () => {
    await createCode('MS-LIFECYCLE-TEST-0009', 60)

    await setUid(null)
    await db.exec('set role anon')
    // RPC surface is granted to anon…
    const redeemed = await redeem('MS-LIFECYCLE-TEST-0009', '123456789')
    expect(redeemed.token).toMatch(/^[0-9a-f]{64}$/)
    expect((await check(redeemed.token)).valid).toBe(true)
    // …but the tables themselves are not readable or writable by anon.
    await expect(db.query('select id from public.game_access_codes')).rejects.toMatchObject({ code: '42501' })
    await expect(db.query('select id from public.game_access_sessions')).rejects.toMatchObject({ code: '42501' })
  })

  it('blocks unauthorized users from creating codes (RLS helper + parameter guard)', async () => {
    await setUid(NOBODY_ID)
    await expectRpcError('select * from public.create_game_access_code($1, $2, $3)',
      [sha256hex('MS-NOPE'), 60, NOBODY_ID],
      { code: '42501', message: 'Only administrators can create game access codes.' })

    // Even a signed-in admin cannot mint codes on behalf of someone else.
    await setUid(ADMIN_ID)
    await expectRpcError('select * from public.create_game_access_code($1, $2, $3)',
      [sha256hex('MS-NOPE'), 60, NOBODY_ID],
      { code: '42501', message: 'Game access codes must be created by the signed-in administrator.' })
  })

  it('lets authorized admins read code records but never the stored hash', async () => {
    await createCode('MS-LIFECYCLE-TEST-0010', 60)

    await db.exec('set role authenticated')
    const listed = await rows<Record<string, unknown>>(
      'select id, duration_minutes, active, expires_at, created_at, created_by, revoked_at, uses_count, account_id, redeemed_at from public.game_access_codes',
    )
    expect(listed.length).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(listed)).not.toContain('code_hash')

    // The hash column is not even granted to administrators.
    await expect(db.query('select code_hash from public.game_access_codes')).rejects.toMatchObject({ code: '42501' })
  })

  it('blocks non-admin accounts from reading game access codes (RLS)', async () => {
    await createCode('MS-LIFECYCLE-TEST-0011', 60)

    await db.exec('set role authenticated')
    await setUid(OPERATOR_ID) // operator — below the admin role gate
    const visible = await rows<{ id: string }>('select id from public.game_access_codes')
    expect(visible).toHaveLength(0)
  })

  it('lets authorized admins revoke a code through the RLS-protected update', async () => {
    const code = await createCode('MS-LIFECYCLE-TEST-0012', 60)
    const redeemed = await redeem('MS-LIFECYCLE-TEST-0012', '123456789')

    await db.exec('set role authenticated')
    const updated = await rows<{ id: string }>(
      'update public.game_access_codes set active = false, revoked_at = now() where id = $1 returning id',
      [code.id],
    )
    expect(updated).toHaveLength(1)

    expect((await check(redeemed.token)).valid).toBe(false)
  })
})
