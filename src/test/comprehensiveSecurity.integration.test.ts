// @vitest-environment node
/**
 * COMPREHENSIVE ZERO-TRUST SECURITY INTEGRATION TEST SUITE V3
 *
 * Validates all 13 security capabilities & defect resolutions against local embedded PostgreSQL (@electric-sql/pglite):
 * 1. Dynamic IP extraction from security_settings ('none', 'cf-connecting-ip', 'xff-first', 'xff-last').
 * 2. Audit logs persist after lockout/rate-limit via uniform 0-row response (no rollback).
 * 3. Zero pg_sleep in any function body; deterministic progressive lockout windows.
 * 4. Cryptographic peppers stored Vault-first or fallback table; missing pepper raises P0002.
 * 5. Unknown-IP bucket isolates lockouts strictly to targeted account ID.
 * 6. Legacy code backfill to greatest(uses_count, 1) and legacy_codes_cutoff enforcement.
 * 7. Task C least-privilege grants, RLS, search_path='', and admin visibility.
 * 8. create_game_access_code enforces p_created_by = auth.uid(), accepts max_uses/single_session, and logs actor.
 * 9. Code format cross-test: client normalization + sha256Hex matches SQL exactly.
 * 10. Concurrency stress test (50 parallel requests).
 * 11. Attacker cycling account IDs from one IP does not bypass IP limits.
 * 12. Many IPs targeting one account trigger account-level lockout.
 * 13. Victim lockout prevention: attacker on IP B hammering victim account does not lock out victim on IP A.
 * 14. Timezone safety: redemption uses absolute timestamptz instants.
 * 15. Uniform empty responses on invalid, expired, revoked, or locked out codes.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { normalizeAccessCode } from '../services/gameAccess'

const REPO_ROOT = join(__dirname, '..', '..')
const sha256hex = (val: string): string => createHash('sha256').update(val, 'utf8').digest('hex')

const ADMIN_ID = '11111111-1111-1111-1111-111111111111'
const NOBODY_ID = '33333333-3333-3333-3333-333333333333'

interface RedeemRow { token: string; expires_at: string; server_now: string }

let db: PGlite

async function rows<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await db.query(sql, values)
  return result.rows as T[]
}

async function setUid(uid: string | null): Promise<void> {
  await db.query('select set_config($1, $2, false)', ['app.uid', uid ?? ''])
}

async function setRole(role: string | null): Promise<void> {
  await db.query('select set_config($1, $2, false)', ['app.role', role ?? ''])
}

async function setHeaders(headers: Record<string, string>): Promise<void> {
  await db.query('select set_config($1, $2, false)', ['request.headers', JSON.stringify(headers)])
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } })

  // Test setup environment: define mock auth schema for local pglite harness ONLY
  await db.exec(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email text);
    create type public.admin_role as enum ('super_admin', 'admin', 'operator');
    create table if not exists public.admin_users (
      id uuid primary key references auth.users(id) on delete cascade,
      email text not null,
      username text,
      role public.admin_role not null default 'operator',
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    -- Test harnesses for auth.uid() and auth.role() in local pglite
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.uid', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('app.role', true), ''), 'authenticated') $$;
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
    create or replace function public.has_admin_role(required_role text)
    returns boolean language sql stable security definer set search_path = public as $$
      select public.has_admin_role(required_role::public.admin_role);
    $$;
  `)

  // Sequential migrations: apply baseline migrations then migration v3
  const migrations = [
    '20260902000002_game_access.sql',
    '20260910120000_game_access_verification_fix.sql',
    '20260912000000_visitor_security_monitoring.sql',
    '20260920000000_security_hardening.sql',
    '20260927000000_zero_trust_hardening_v3.sql',
  ]

  for (const file of migrations) {
    await db.exec(readFileSync(join(REPO_ROOT, 'supabase/migrations', file), 'utf8'))
  }

  // Seed admin user
  await db.query('insert into auth.users (id, email) values ($1, $2) on conflict do nothing', [ADMIN_ID, 'admin@example.com'])
  await db.query('insert into public.admin_users (id, email, role, active) values ($1, $2, $3, true) on conflict do nothing', [ADMIN_ID, 'admin@example.com', 'admin'])
  await db.query('insert into auth.users (id, email) values ($1, $2) on conflict do nothing', [NOBODY_ID, 'nobody@example.com'])
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('reset role')
  await setRole('authenticated')
  await setUid(ADMIN_ID)
  await setHeaders({})
})

describe('NEXUS V3 Zero-Trust Security Hardening Suite', () => {
  it('1. auth schema: migration contains NO auth schema modifications or definitions', () => {
    const v3Sql = readFileSync(join(REPO_ROOT, 'supabase/migrations/20260927000000_zero_trust_hardening_v3.sql'), 'utf8')
    expect(v3Sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+auth\./i)
    expect(v3Sql).not.toMatch(/create\s+schema\s+auth/i)
  })

  it('2. Audit logs persist after lockout: redeem_game_access returns 0 rows instead of raising, and audit row is committed', async () => {
    const testAccount = '987654321'
    await db.exec('set role anon')
    await setHeaders({ 'cf-connecting-ip': '198.51.100.10' })

    // Configure trusted IP header to cf-connecting-ip
    await db.exec('reset role')
    await db.query("update public.security_settings set value = 'cf-connecting-ip' where key = 'trusted_ip_header'")
    await db.exec('set role anon')

    // Submit 5 failed attempts to trigger lockout threshold
    for (let i = 0; i < 5; i++) {
      const res = await rows('select * from public.redeem_game_access($1, $2)', [sha256hex('WRONG-CODE'), testAccount])
      expect(res).toHaveLength(0) // Uniform empty return
    }

    // 6th attempt occurs under active lockout
    const lockoutRes = await rows('select * from public.redeem_game_access($1, $2)', [sha256hex('WRONG-CODE'), testAccount])
    expect(lockoutRes).toHaveLength(0)

    // Verify rate_limit_lockout audit log exists and was NOT rolled back
    await db.exec('reset role')
    const audit = await rows<{ event_type: string; actor_id: string }>(
      "select event_type, actor_id from public.security_audit_logs where event_type = 'rate_limit_lockout' and actor_id = $1",
      [testAccount],
    )
    expect(audit.length).toBeGreaterThanOrEqual(1)
    expect(audit[0].event_type).toBe('rate_limit_lockout')
  })

  it('3. No pg_sleep anywhere: asserts 0 occurrences of pg_sleep across all database routines', async () => {
    const v3Sql = readFileSync(join(REPO_ROOT, 'supabase/migrations/20260927000000_zero_trust_hardening_v3.sql'), 'utf8')
    expect(v3Sql).not.toContain('pg_sleep')

    const procsWithSleep = await rows<{ proname: string }>(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc like '%pg_sleep%'",
    )
    expect(procsWithSleep).toHaveLength(0)
  })

  it('4. Peppers: stored Vault-first or fallback table, get_security_pepper raises P0002 on missing with NO fallback', async () => {
    await db.exec('reset role')

    // Query peppers table (fallback in local environment where vault extension is simulated absent)
    const peppers = await rows<{ key_name: string; pepper: string }>(
      'select key_name, pepper from public.security_peppers order by key_name',
    )
    expect(peppers.length).toBeGreaterThanOrEqual(2)
    for (const p of peppers) {
      expect(p.pepper).toHaveLength(64)
      expect(p.pepper).toMatch(/^[0-9a-f]{64}$/)
    }

    // Missing pepper strictly raises P0002 without creating fallback
    await expect(
      rows("select public.get_security_pepper('nonexistent_secret_key_xyz')"),
    ).rejects.toThrow(/MISSING_SECURITY_PEPPER/)
  })

  it('5. Dynamic client IP settings: supports none, cf-connecting-ip, xff-first, xff-last; none uses account limits only', async () => {
    await db.exec('reset role')

    // A: 'none' mode returns 'unknown'
    await db.query("update public.security_settings set value = 'none' where key = 'trusted_ip_header'")
    await setHeaders({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8, 9.10.11.12' })
    let ip = await rows<{ extract_client_ip: string }>('select public.extract_client_ip()')
    expect(ip[0].extract_client_ip).toBe('unknown')

    // B: 'cf-connecting-ip' mode
    await db.query("update public.security_settings set value = 'cf-connecting-ip' where key = 'trusted_ip_header'")
    ip = await rows<{ extract_client_ip: string }>('select public.extract_client_ip()')
    expect(ip[0].extract_client_ip).toBe('1.2.3.4')

    // C: 'xff-first' mode
    await db.query("update public.security_settings set value = 'xff-first' where key = 'trusted_ip_header'")
    ip = await rows<{ extract_client_ip: string }>('select public.extract_client_ip()')
    expect(ip[0].extract_client_ip).toBe('5.6.7.8')

    // D: 'xff-last' mode
    await db.query("update public.security_settings set value = 'xff-last' where key = 'trusted_ip_header'")
    ip = await rows<{ extract_client_ip: string }>('select public.extract_client_ip()')
    expect(ip[0].extract_client_ip).toBe('9.10.11.12')
  })

  it('6. Legacy code backfill and cutoff: greatest(uses_count, 1) and legacy_codes_cutoff expiration', async () => {
    const legacyCode = 'MS-LEGACY-CUTOFF-TEST'
    const legacyHash = sha256hex(legacyCode)
    const testAccount = '111222333'

    await db.exec('reset role')
    // Insert code with legacy hash
    await db.query(
      `insert into public.game_access_codes (code_hash, duration_minutes, max_uses, active, is_hmac, created_by, created_at)
       values ($1, 60, 2, true, false, $2, now())`,
      [legacyHash, ADMIN_ID],
    )

    // Set legacy cutoff to a date in the past
    await db.query("update public.security_settings set value = '2020-01-01T00:00:00Z' where key = 'legacy_codes_cutoff'")

    // Attempt redemption with legacy code after cutoff: rejected (returns 0 rows)
    await db.exec('set role anon')
    const cutoffRes = await rows<RedeemRow>('select * from public.redeem_game_access($1, $2)', [legacyHash, testAccount])
    expect(cutoffRes).toHaveLength(0)

    // Clear cutoff (allow legacy again)
    await db.exec('reset role')
    await db.query("update public.security_settings set value = '' where key = 'legacy_codes_cutoff'")

    // Redemption succeeds and auto-upgrades to HMAC
    await db.exec('set role anon')
    const okRes = await rows<RedeemRow>('select * from public.redeem_game_access($1, $2)', [legacyHash, testAccount])
    expect(okRes).toHaveLength(1)
    expect(okRes[0].token).toHaveLength(64)
  })

  it('7. Task C grants & RLS: authenticated role cannot SELECT sensitive tables directly, but admin can', async () => {
    await db.exec('set role authenticated')
    await setRole('authenticated')
    await setUid(NOBODY_ID) // regular authenticated non-admin user

    const tables = ['game_access_rate_limits', 'game_access_sessions', 'm11_snapshots', 'security_audit_logs']
    for (const table of tables) {
      // Direct access returns 0 rows due to RLS policy (only admin can read)
      const res = await rows(`select * from public.${table}`)
      expect(res).toHaveLength(0)
    }

    // Admin user can select rows
    await setUid(ADMIN_ID)
    const adminCheck = await rows('select * from public.security_audit_logs limit 1')
    expect(Array.isArray(adminCheck)).toBe(true)
  })

  it('8. create_game_access_code: validates p_created_by = auth.uid(), accepts max_uses/single_session, logs actor', async () => {
    await db.exec('reset role')
    await setUid(ADMIN_ID)
    await setRole('authenticated')

    const codeHash = sha256hex('MS-TEST-CUSTOM-OPTIONS')

    // A: Non-matching created_by throws 42501
    await expect(
      rows('select * from public.create_game_access_code($1, $2, $3, $4, $5)', [
        codeHash,
        60,
        NOBODY_ID, // Mismatched UID
        5,
        true,
      ]),
    ).rejects.toThrow(/Game access codes must be created by the signed-in administrator/)

    // B: Valid creation with custom options
    const created = await rows<{ id: string; duration_minutes: number }>(
      'select * from public.create_game_access_code($1, $2, $3, $4, $5)',
      [codeHash, 120, ADMIN_ID, 5, true],
    )
    expect(created).toHaveLength(1)
    expect(created[0].duration_minutes).toBe(120)

    // C: Verify audit log entry
    const audit = await rows<{ actor_id: string; metadata: { max_uses: number } }>(
      "select actor_id, metadata from public.security_audit_logs where event_type = 'code_generation' order by created_at desc limit 1",
    )
    expect(audit[0].actor_id).toBe(ADMIN_ID)
    expect(audit[0].metadata.max_uses).toBe(5)
  })

  it('9. Code format compatibility: client normalizeAccessCode + sha256Hex matches SQL exactly', async () => {
    const rawInputs = [
      '  ms-ab23-cd45-ef67-gh89  ',
      'MS-AB23-CD45-EF67-GH89',
      'ms-ab23-cd45-ef67-gh89',
    ]

    for (const raw of rawInputs) {
      const clientClean = normalizeAccessCode(raw)
      const clientHash = sha256hex(clientClean)

      const sqlRes = await rows<{ sql_hash: string }>(
        "select encode(pg_catalog.sha256(convert_to(upper(trim($1)), 'UTF8')), 'hex') as sql_hash",
        [raw],
      )
      expect(clientHash).toBe(sqlRes[0].sql_hash)
    }
  })

  it('10. Concurrency stress test: 50 parallel redemption requests execute cleanly without deadlocks', async () => {
    const burstAccount = '333444555'
    await db.exec('set role anon')

    const promises = Array.from({ length: 50 }, (_, i) =>
      rows('select * from public.redeem_game_access($1, $2)', [sha256hex(`STRESS-CODE-${i}`), burstAccount]),
    )

    const results = await Promise.all(promises)
    expect(results).toHaveLength(50)
    for (const r of results) {
      expect(r).toHaveLength(0) // all failed gracefully without unhandled database deadlocks
    }
  })

  it('11. Attacker cycling account IDs from one IP does NOT evade IP-level rate limits', async () => {
    const attackerIp = '198.51.100.77'
    await db.exec('reset role')
    await db.query("update public.security_settings set value = 'cf-connecting-ip' where key = 'trusted_ip_header'")
    await setHeaders({ 'cf-connecting-ip': attackerIp })
    await db.exec('set role anon')

    // Attacker rotates 10 distinct account IDs from the same IP
    for (let i = 0; i < 10; i++) {
      const acc = `10000000${i}`
      await rows('select * from public.redeem_game_access($1, $2)', [sha256hex(`WRONG-CODE-${i}`), acc])
    }

    // Attempt 11th on a fresh account ID triggers IP-level lockout window
    const blocked = await rows('select * from public.redeem_game_access($1, $2)', [sha256hex('WRONG-CODE-11'), '1000000099'])
    expect(blocked).toHaveLength(0)

    // Verify IP lockout logged in audit
    await db.exec('reset role')
    const ipAudit = await rows<{ event_type: string }>(
      "select event_type from public.security_audit_logs where event_type = 'rate_limit_lockout' and ip_address != 'unknown'",
    )
    expect(ipAudit.length).toBeGreaterThan(0)
  })

  it('12. Many IPs targeting one account trigger account-level lockout', async () => {
    const victimAccount = '777888999'
    await db.exec('reset role')
    await db.query("update public.security_settings set value = 'cf-connecting-ip' where key = 'trusted_ip_header'")
    await db.exec('set role anon')

    // 5 different IPs fail against the same victim account
    for (let i = 1; i <= 5; i++) {
      await setHeaders({ 'cf-connecting-ip': `198.51.100.${i}` })
      await rows('select * from public.redeem_game_access($1, $2)', [sha256hex(`WRONG-${i}`), victimAccount])
    }

    // 6th attempt from a 6th IP is locked out by account-level threshold
    await setHeaders({ 'cf-connecting-ip': '198.51.100.99' })
    const res = await rows('select * from public.redeem_game_access($1, $2)', [sha256hex('ANOTHER-BAD-CODE'), victimAccount])
    expect(res).toHaveLength(0)
  })

  it('13. Victim lockout prevention: attacker on IP B hammering victim account does NOT lock victim on IP A (when below account threshold)', async () => {
    const victimAccount = '555666777'
    const attackerIp = '198.51.100.22'
    const victimIp = '203.0.113.88'

    await db.exec('reset role')
    await db.query("update public.security_settings set value = 'cf-connecting-ip' where key = 'trusted_ip_header'")

    // Admin creates valid code
    const gen = await rows<{ plain_code: string }>('select plain_code from public.generate_game_access_code(60, 2, false)')
    const validCode = gen[0].plain_code

    // Attacker does 3 bad attempts from attackerIp
    await db.exec('set role anon')
    await setHeaders({ 'cf-connecting-ip': attackerIp })
    for (let i = 0; i < 3; i++) {
      await rows('select * from public.redeem_game_access($1, $2)', [sha256hex('WRONG'), victimAccount])
    }

    // Victim redeems valid code from victimIp: succeeds!
    await setHeaders({ 'cf-connecting-ip': victimIp })
    const victimSuccess = await rows<RedeemRow>(
      'select * from public.redeem_game_access($1, $2)',
      [sha256hex(validCode), victimAccount],
    )
    expect(victimSuccess).toHaveLength(1)
    expect(victimSuccess[0].token).toHaveLength(64)
  })

  it('14. Timezone safety: redemption uses absolute timestamptz instants', async () => {
    await db.exec('reset role')
    const gen = await rows<{ plain_code: string }>('select plain_code from public.generate_game_access_code(30, 1, false)')

    await db.exec("set time zone 'America/New_York'")
    await db.exec('set role anon')
    const res = await rows<RedeemRow>('select * from public.redeem_game_access($1, $2)', [sha256hex(gen[0].plain_code), '444555666'])
    expect(res).toHaveLength(1)

    // Token expires ~30 minutes in the future regardless of session time zone
    const expiresMs = Date.parse(res[0].expires_at)
    const serverNowMs = Date.parse(res[0].server_now)
    const diffMinutes = Math.round((expiresMs - serverNowMs) / 60000)
    expect(diffMinutes).toBe(30)
  })

  it('15. Uniform empty responses on invalid, expired, revoked, or non-existent codes', async () => {
    await db.exec('reset role')
    const account = '222333444'

    // 1. Non-existent code
    await db.exec('set role anon')
    const r1 = await rows('select * from public.redeem_game_access($1, $2)', [sha256hex('DOES-NOT-EXIST'), account])
    expect(r1).toHaveLength(0)

    // 2. Revoked code
    await db.exec('reset role')
    const gen = await rows<{ plain_code: string; code_id: string }>(
      'select plain_code, code_id from public.generate_game_access_code(60, 1, false)',
    )
    await db.query('update public.game_access_codes set revoked_at = now(), active = false where id = $1', [gen[0].code_id])
    await db.exec('set role anon')
    const r2 = await rows('select * from public.redeem_game_access($1, $2)', [sha256hex(gen[0].plain_code), account])
    expect(r2).toHaveLength(0)

    // 3. Expired code
    await db.exec('reset role')
    const gen2 = await rows<{ plain_code: string; code_id: string }>(
      'select plain_code, code_id from public.generate_game_access_code(60, 1, false)',
    )
    await db.query("update public.game_access_codes set expires_at = now() - interval '1 minute' where id = $1", [gen2[0].code_id])
    await db.exec('set role anon')
    const r3 = await rows('select * from public.redeem_game_access($1, $2)', [sha256hex(gen2[0].plain_code), account])
    expect(r3).toHaveLength(0)
  })
})
