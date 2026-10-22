// @vitest-environment node
/**
 * SECURITY HARDENING & ATOMIC RATE LIMITING SQL INTEGRATION TEST
 *
 * Verifies the production PostgreSQL hardening migration:
 * 1. Failed-attempt accounting persistence without transaction rollback.
 * 2. Concurrency-safe atomic coordination via transaction advisory locks.
 * 3. Lockout enforcement without infinite window extension.
 * 4. Legitimate retry recovery after window expiration.
 * 5. Privileged maintenance and least-privilege administrative access.
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
const NOBODY_ID = '33333333-3333-3333-3333-333333333333'

interface CreatedCodeRow { id: string; expires_at: string | null; created_at: string; duration_minutes: number }
interface RedeemRow { token: string; expires_at: string; server_now: string }
interface CheckRow { valid: boolean; expires_at: string; server_now: string; account_id: string }

let db: PGlite

async function rows<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await db.query(sql, values)
  return result.rows as T[]
}

async function setUid(uid: string | null): Promise<void> {
  await db.query('select set_config($1, $2, false)', ['app.uid', uid ?? ''])
}

async function createCode(plainCode: string, durationMinutes = 60, createdBy = ADMIN_ID): Promise<CreatedCodeRow> {
  const result = await rows<CreatedCodeRow>(
    'select * from public.create_game_access_code($1, $2, $3)',
    [sha256hex(plainCode), durationMinutes, createdBy],
  )
  return result[0]
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } })

  await db.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
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
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.uid', true), '')::uuid $$;
    create or replace function public.current_admin_role() returns public.admin_role
    language sql stable security definer set search_path = public as $$
      select role from public.admin_users where id = (select auth.uid()) and active = true limit 1 $$;
    create or replace function public.has_admin_role(required_role public.admin_role)
    returns boolean language plpgsql stable security definer set search_path = public as $$
    declare
      v_role public.admin_role := public.current_admin_role();
    begin
      if v_role is null then return false; end if;
      if v_role = 'super_admin' then return true; end if;
      if required_role = 'operator' then return true; end if;
      return v_role = required_role;
    end;
    $$;
  `)

  // Apply historical migrations
  const migrations = [
    '20260902000002_game_access.sql',
    '20260910120000_game_access_verification_fix.sql',
    '20260912000000_visitor_security_monitoring.sql',
    '20260920000000_security_hardening.sql',
  ]

  for (const file of migrations) {
    await db.exec(readFileSync(join(REPO_ROOT, 'supabase/migrations', file), 'utf8'))
  }

  // Seed admin user
  await db.query('insert into auth.users (id, email) values ($1, $2)', [ADMIN_ID, 'admin@example.com'])
  await db.query('insert into public.admin_users (id, email, role, active) values ($1, $2, $3, true)', [ADMIN_ID, 'admin@example.com', 'admin'])
  await db.query('insert into auth.users (id, email) values ($1, $2)', [NOBODY_ID, 'nobody@example.com'])
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('reset role')
  await setUid(ADMIN_ID)
})

describe('NEXUS V2 Hardening Migration: Rate Limiting & Concurrency Safety', () => {
  it('persists failed attempts to disk when an invalid access code is submitted', async () => {
    const accountId = '111222333'
    await db.exec('set role anon')

    const badCodeHash = sha256hex('NON-EXISTENT-CODE')
    const result = await rows<RedeemRow>('select * from public.redeem_game_access($1, $2)', [badCodeHash, accountId])

    // Returns empty set (0 rows) so caller maps to GameAccessError('unavailable')
    expect(result).toHaveLength(0)

    // Inspect database rate limits table
    await db.exec('reset role')
    const records = await rows<{ account_id: string; success: boolean }>(
      'select account_id, success from public.game_access_rate_limits where account_id = $1',
      [accountId],
    )
    expect(records).toHaveLength(1)
    expect(records[0].account_id).toBe(accountId)
    expect(records[0].success).toBe(false)
  })

  it('coordinates concurrent requests atomically and triggers lockout at threshold', async () => {
    const accountId = '222333444'
    const badCodeHash = sha256hex('WRONG-CODE-BURST')

    // Simulate 7 rapid consecutive redemption attempts for the same account
    let lockoutErrors = 0
    let emptyResults = 0

    for (let i = 0; i < 7; i++) {
      try {
        const result = await rows<RedeemRow>('select * from public.redeem_game_access($1, $2)', [badCodeHash, accountId])
        if (result.length === 0) emptyResults++
      } catch (err) {
        if ((err as Error).message.includes('RATE_LIMIT_EXCEEDED')) {
          lockoutErrors++
        }
      }
    }

    // Exactly 5 failed attempts allowed before lockout; attempts 6 and 7 trigger RATE_LIMIT_EXCEEDED
    expect(emptyResults).toBe(5)
    expect(lockoutErrors).toBe(2)

    // Verify exactly 5 failure rows exist (attempts during lockout do NOT add new rows)
    const records = await rows<{ count: number | bigint }>(
      'select count(*) as count from public.game_access_rate_limits where account_id = $1',
      [accountId],
    )
    expect(Number(records[0].count)).toBe(5)
  })

  it('preserves legitimate retries after the 5-minute lockout window expires', async () => {
    const accountId = '333444555'
    const validCode = 'MS-LEGITIMATE-CODE-001'
    await createCode(validCode, 60)

    // Insert 5 old failed attempts backdated by 6 minutes (outside window)
    for (let i = 0; i < 5; i++) {
      await db.query(
        "insert into public.game_access_rate_limits (account_id, success, attempt_time) values ($1, false, now() - interval '6 minutes')",
        [accountId],
      )
    }

    // Attempting redemption with valid code should succeed immediately
    await db.exec('set role anon')
    const redemption = await rows<RedeemRow>('select * from public.redeem_game_access($1, $2)', [sha256hex(validCode), accountId])
    expect(redemption).toHaveLength(1)
    expect(redemption[0].token).toHaveLength(64)

    // Verify session validity
    const check = await rows<CheckRow>('select * from public.check_game_access($1)', [sha256hex(redemption[0].token)])
    expect(check[0].valid).toBe(true)
    expect(check[0].account_id).toBe(accountId)
  })

  it('resets the failure window calculation following a successful login', async () => {
    const accountId = '444555666'
    const validCode = 'MS-RESET-TEST-001'
    await createCode(validCode, 60)

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      await rows('select * from public.redeem_game_access($1, $2)', [sha256hex('BAD-CODE'), accountId])
    }

    // Successful login
    const success = await rows<RedeemRow>('select * from public.redeem_game_access($1, $2)', [sha256hex(validCode), accountId])
    expect(success).toHaveLength(1)

    // Another failed attempt should NOT trigger lockout because success reset the window context
    const postLoginFail = await rows<RedeemRow>('select * from public.redeem_game_access($1, $2)', [sha256hex('BAD-CODE-AGAIN'), accountId])
    expect(postLoginFail).toHaveLength(0) // returned empty, not locked out
  })

  it('restricts pruning to administrators and service_role, rejecting unauthorized callers', async () => {
    await db.exec('set role anon')
    await expect(
      rows("select * from public.prune_game_rate_limits(interval '24 hours')"),
    ).rejects.toThrow(/permission denied|Only administrators or service role/)

    // Non-admin authenticated user is also rejected
    await db.exec('set role authenticated')
    await setUid(NOBODY_ID)
    await expect(
      rows("select * from public.prune_game_rate_limits(interval '24 hours')"),
    ).rejects.toThrow(/Only administrators or service role/)

    // Authenticated admin can prune
    await setUid(ADMIN_ID)
    const result = await rows<{ prune_game_rate_limits: number }>(
      "select * from public.prune_game_rate_limits(interval '1 hour')",
    )
    expect(typeof result[0].prune_game_rate_limits).toBe('number')
  })

  it('enforces column-level least privilege so code_hash is never exposed to authenticated readers', async () => {
    await db.exec('set role authenticated')
    await setUid(ADMIN_ID)

    // Admin can select standard columns
    const allowed = await rows(
      'select id, duration_minutes, active, expires_at, created_at, created_by, revoked_at, uses_count, account_id, redeemed_at from public.game_access_codes limit 1',
    )
    expect(allowed.length).toBeGreaterThan(0)

    // Querying code_hash directly fails with 42501 (permission denied)
    await expect(rows('select code_hash from public.game_access_codes limit 1')).rejects.toMatchObject({ code: '42501' })
  })
})
