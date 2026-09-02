/**
 * Real-database verification of the Apple of Fortune game-access flow.
 *
 * Runs the ACTUAL repository migrations inside an embedded PostgreSQL
 * (PGlite, a real Postgres build) arranged to match a fresh Supabase project:
 *   - pgcrypto pre-installed in the `extensions` schema (NOT `public`),
 *   - `anon` / `authenticated` / `service_role` roles,
 *   - an `auth` schema with `auth.users` and `auth.uid()`.
 *
 * It reproduces the exact failure timeline from the field:
 *   1. migrations 00-02     -> redeem fails (42702, column ambiguity) and
 *                              create fails (42883, has_admin_role keyword);
 *   2. migration 03 applied -> redeem still fails with 42702 (digest fix
 *                              alone cannot make the flow work);
 *   3. migration 04 applied -> full flow passes (create -> redeem -> check ->
 *                              session -> invalid/expired/revoked cases).
 *
 * Usage:  npm run verify:game-access-db
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = [
  '20260902000000_magic_script_control_plane.sql',
  '20260902000001_magic_script_least_privilege_grants.sql',
  '20260902000002_game_access.sql',
  '20260902000003_game_access_verification_fix.sql',
  '20260902000004_game_access_runtime_fix.sql',
]

const ADMIN_ID = 'aaaaaaaa-1111-4111-8222-aaaaaaaaaaaa'
const ACCOUNT_ID_9 = '123456789'
const ACCOUNT_ID_10 = '1234567890'
const ACCOUNT_ID_11 = '12345678901'

let failures = 0
let checks = 0

function ok(label) {
  checks += 1
  console.log(`  PASS  ${label}`)
}
function fail(label, detail) {
  checks += 1
  failures += 1
  console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
}
function expect(condition, label, detail) {
  if (condition) ok(label)
  else fail(label, detail)
}
function errorCode(error) {
  return error && typeof error.code === 'string' ? error.code : ''
}
function errorMessage(error) {
  return error ? String(error.message ?? '') : ''
}

function hashOf(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

async function run(db, sql, params = []) {
  return db.query(sql, params)
}

async function runRole(db, role, fn) {
  await db.exec(`set role ${role};`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role;')
  }
}

async function runRoleSafe(db, role, fn) {
  let value = null
  let error = null
  await runRole(db, role, async () => {
    try {
      value = await fn()
    } catch (cause) {
      error = cause
    }
  })
  return { value, error }
}

async function legacyCreateCode(db, plain) {
  const codeHash = hashOf(plain)
  // What create_game_access_code would store: code_hash, duration, expiry.
  await run(db, `insert into public.game_access_codes (code_hash, duration_minutes, expires_at) values ($1, 60, now() + interval '60 minutes')`, [codeHash])
  return codeHash
}

async function createCodeNow(db, durationMinutes, plain) {
  const codeHash = hashOf(plain)
  await run(db, `select set_config('request.jwt.claim.sub', $1, false)`, [ADMIN_ID])
  let created = null
  let error = null
  await runRole(db, 'authenticated', async () => {
    try {
      const rows = await run(db, 'select * from public.create_game_access_code($1::text, $2::int, $3::uuid)', [
        codeHash,
        durationMinutes,
        ADMIN_ID,
      ])
      created = rows.rows[0]
    } catch (cause) {
      error = cause
    }
  })
  return { plain, codeHash, created, error }
}

async function redeem(db, codeHash, accountId) {
  const { value, error } = await runRoleSafe(db, 'anon', async () =>
    run(db, 'select * from public.redeem_game_access($1::text, $2::text)', [codeHash, accountId]),
  )
  return { result: value, error }
}

async function checkToken(db, tokenHash) {
  const { value, error } = await runRoleSafe(db, 'anon', async () =>
    run(db, 'select * from public.check_game_access($1::text)', [tokenHash]),
  )
  return { result: value, error }
}

async function functionDef(db, name) {
  const rows = await run(
    db,
    `select pg_get_functiondef(p.oid) as def
     from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = $1`,
    [name],
  )
  return rows.rows[0]?.def ?? ''
}

async function main() {
  console.log('Booting embedded PostgreSQL (PGlite) — real Postgres, Supabase-like layout…')
  const db = new PGlite({ extensions: { pgcrypto } })
  const version = (await run(db, 'select version() as v')).rows[0].v
  console.log(`  ${version}\n`)

  await db.exec(`
    create schema if not exists auth;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;

    create role anon;
    create role authenticated;
    create role service_role;

    grant usage on schema auth to anon, authenticated;

    create table auth.users (
      id uuid primary key,
      email text not null,
      created_at timestamptz not null default timezone('utc', now())
    );

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $fn$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $fn$;

    grant execute on function auth.uid() to anon, authenticated;
  `)

  const ext = await run(db, `
    select e.extname, n.nspname as schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto'
  `)
  expect(ext.rows[0]?.schema === 'extensions', 'pgcrypto is pre-installed in the extensions schema (fresh Supabase behavior)')

  // ---- Stage 1: migrations 00-02 (the original state) --------------------
  console.log('\n== Stage 1: migrations 00–02 ==')
  for (const name of MIGRATIONS.slice(0, 3)) {
    await db.exec(readFileSync(join(root, 'supabase/migrations', name), 'utf8'))
  }
  await run(db, `insert into auth.users (id, email) values ($1, 'admin@example.com')`, [ADMIN_ID])
  await run(db, `insert into public.admin_users (id, email, username, role) values ($1, 'admin@example.com', 'primary-admin', 'super_admin')`, [ADMIN_ID])

  const def02 = await functionDef(db, 'redeem_game_access')
  expect(/digest\s*\(/.test(def02), 'migration 02 built with pgcrypto digest() (the first latent issue)')

  const stage1Create = await createCodeNow(db, 60, 'MS-STAGE1-CREATE')
  expect(
    errorCode(stage1Create.error) === '42883' && /name = admin_role/.test(errorMessage(stage1Create.error)),
    'original code: create_game_access_code fails with 42883 (has_admin_role CURRENT_ROLE keyword collision)',
    `${errorCode(stage1Create.error)} ${errorMessage(stage1Create.error)}`,
  )

  const stage1Hash = await legacyCreateCode(db, 'MS-STAGE1-REDEEM')
  const stage1Redeem = await redeem(db, stage1Hash, ACCOUNT_ID_9)
  expect(
    errorCode(stage1Redeem.error) === '42702' && /ambiguous/.test(errorMessage(stage1Redeem.error)),
    'original code: redeem_game_access fails with 42702 (rowtype column ambiguity on PG14+)',
    `${errorCode(stage1Redeem.error)} ${errorMessage(stage1Redeem.error)}`,
  )

  // ---- Stage 2: migration 03 applied (what the user reported) -------------
  console.log('\n== Stage 2: migration 03 applied ==')
  await db.exec(readFileSync(join(root, 'supabase/migrations', MIGRATIONS[3]), 'utf8'))

  const def03 = await functionDef(db, 'redeem_game_access')
  expect(!/digest\s*\(/.test(def03) && /sha256\s*\(/.test(def03), 'migration 03 replaces digest() with built-in sha256()')

  const stage2Create = await createCodeNow(db, 60, 'MS-STAGE2-CREATE')
  expect(
    errorCode(stage2Create.error) === '42883' && /name = admin_role/.test(errorMessage(stage2Create.error)),
    'after migration 03: creation STILL fails with 42883 (has_admin_role not fixed by the digest fix)',
    `${errorCode(stage2Create.error)} ${errorMessage(stage2Create.error)}`,
  )

  const stage2Hash = await legacyCreateCode(db, 'MS-STAGE2-REDEEM')
  const stage2Redeem = await redeem(db, stage2Hash, ACCOUNT_ID_9)
  expect(
    errorCode(stage2Redeem.error) === '42702' && /ambiguous/.test(errorMessage(stage2Redeem.error)),
    'after migration 03: redeem STILL fails with 42702 (ambiguity) — the hidden error behind "Access could not be verified right now."',
    `${errorCode(stage2Redeem.error)} ${errorMessage(stage2Redeem.error)}`,
  )

  // ---- Stage 3: migration 04 applied (the complete fix) -------------------
  console.log('\n== Stage 3: migration 04 applied ==')
  await db.exec(readFileSync(join(root, 'supabase/migrations', MIGRATIONS[4]), 'utf8'))

  const funcs = await run(db, `
    select p.proname, count(*)::int as n
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('has_admin_role', 'redeem_game_access', 'check_game_access', 'create_game_access_code')
    group by p.proname
  `)
  for (const row of funcs.rows) {
    expect(row.n === 1, `exactly one ${row.proname} function exists (no duplicates)`)
  }
  const roleDef = await functionDef(db, 'has_admin_role')
  expect(!/(?<!v_)current_role\s+public\.admin_role/.test(roleDef) && /v_current_role\s+public\.admin_role/.test(roleDef), 'has_admin_role no longer uses the current_role keyword as a variable')
  const def04 = await functionDef(db, 'redeem_game_access')
  expect(/now\(\)/.test(def04), 'redeem returns timestamptz server_now via now()')

  const anonGrant = await run(db, `select has_function_privilege('anon', 'public.redeem_game_access(text, text)', 'EXECUTE') as can`)
  expect(anonGrant.rows[0].can === true, 'anon retains EXECUTE on redeem_game_access')
  const anonCheckGrant = await run(db, `select has_function_privilege('anon', 'public.check_game_access(text)', 'EXECUTE') as can`)
  expect(anonCheckGrant.rows[0].can === true, 'anon retains EXECUTE on check_game_access')

  // ---- Full flow ----------------------------------------------------------
  console.log('\n== Full flow against migrations 00–04 ==')
  const created = await createCodeNow(db, 60, 'MS-NEW-CODE-12345')
  expect(!created.error && created.created, '1. admin creates a NEW game access code', `${errorCode(created.error)} ${errorMessage(created.error)}`)
  expect(
    created.created?.duration_minutes === 60 && created.created?.expires_at != null,
    '2. code is stored (hash only) with server-computed expiry',
    JSON.stringify(created.created),
  )
  const codeRow = await run(db, `select code_hash, duration_minutes, active, expires_at from public.game_access_codes where code_hash = $1`, [created.codeHash])
  expect(codeRow.rows[0]?.active === true && codeRow.rows[0]?.duration_minutes === 60, '3. stored row is active with the requested duration')

  // Identifier-only rule: any valid 9/10/11-digit numeric ID is accepted.
  for (const accountId of [ACCOUNT_ID_9, ACCOUNT_ID_10, ACCOUNT_ID_11]) {
    const redeemed = await redeem(db, created.codeHash, accountId)
    expect(
      !redeemed.error && redeemed.result?.rows?.[0]?.token?.length > 0,
      `4. valid-format Account ID accepted (${accountId.length} digits; identifier-only, code NOT account-bound)`,
      `${errorCode(redeemed.error)} ${errorMessage(redeemed.error)}`,
    )
    const sessions = await run(db, `select count(*)::int as n from public.game_access_sessions where account_id = $1`, [accountId])
    expect(sessions.rows[0].n === 1, '5. game session row created for this Account ID')
  }

  const token = (await redeem(db, created.codeHash, ACCOUNT_ID_9)).result?.rows?.[0]?.token
  const tokenHash = hashOf(token ?? '')
  const storedHash = await run(db, `select token_hash from public.game_access_sessions where token_hash = $1`, [tokenHash])
  expect(storedHash.rows[0]?.token_hash === tokenHash, '6. plaintext token is NEVER stored — only its SHA-256 hash')
  const storedPlain = await run(db, `select count(*)::int as n from public.game_access_sessions where token_hash = $1`, [token ?? ''])
  expect(storedPlain.rows[0].n === 0, '7. no session row ever holds the plaintext token')

  const check = await checkToken(db, tokenHash)
  expect(!check.error && check.result?.rows?.[0]?.valid === true, '8. check_game_access(valid token) -> valid=true', `${errorCode(check.error)} ${errorMessage(check.error)}`)
  expect(check.result?.rows?.[0]?.account_id === ACCOUNT_ID_9, '9. check_game_access returns the bound Account ID')

  const badHash = hashOf('MS-NOT-A-REAL-CODE')
  const bad = await redeem(db, badHash, ACCOUNT_ID_9)
  expect(bad.error && /ACCESS_CODE_UNAVAILABLE/.test(errorMessage(bad.error)), '10. invalid code -> ACCESS_CODE_UNAVAILABLE', errorMessage(bad.error))
  const badAccount = await redeem(db, created.codeHash, '12345678')
  expect(badAccount.error && /INVALID_ACCOUNT_ID/.test(errorMessage(badAccount.error)), '11. 8-digit Account ID -> INVALID_ACCOUNT_ID', errorMessage(badAccount.error))
  const nonNumeric = await redeem(db, created.codeHash, '12345678a')
  expect(nonNumeric.error && /INVALID_ACCOUNT_ID/.test(errorMessage(nonNumeric.error)), '12. non-numeric Account ID -> INVALID_ACCOUNT_ID', errorMessage(nonNumeric.error))

  // Expiry uses the database clock.
  const short = await createCodeNow(db, 1, 'MS-SHORT-LIVED')
  const beforeExpiry = await redeem(db, short.codeHash, ACCOUNT_ID_9)
  expect(!beforeExpiry.error && beforeExpiry.result?.rows?.[0]?.token?.length > 0, '13. 1-minute code redeems before expiry', errorMessage(beforeExpiry.error))
  await run(db, `update public.game_access_codes set expires_at = now() - interval '2 minutes' where code_hash = $1`, [short.codeHash])
  const afterExpiry = await redeem(db, short.codeHash, ACCOUNT_ID_9)
  expect(afterExpiry.error && /ACCESS_CODE_UNAVAILABLE/.test(errorMessage(afterExpiry.error)), '14. expired code -> ACCESS_CODE_UNAVAILABLE (DB clock)', errorMessage(afterExpiry.error))

  // Revocation kills derived sessions.
  await run(db, `update public.game_access_codes set active = false, revoked_at = now() where code_hash = $1`, [created.codeHash])
  const revokedCheck = await checkToken(db, tokenHash)
  expect(!revokedCheck.error && revokedCheck.result?.rows?.[0]?.valid === false, '15. revoked parent code -> check_game_access valid=false', errorMessage(revokedCheck.error))
  const revokedRedeem = await redeem(db, created.codeHash, ACCOUNT_ID_9)
  expect(revokedRedeem.error && /ACCESS_CODE_UNAVAILABLE/.test(errorMessage(revokedRedeem.error)), '16. revoked code -> ACCESS_CODE_UNAVAILABLE', errorMessage(revokedRedeem.error))

  // Least privilege: anon executes RPCs but has no direct table access.
  const anonTable = await runRoleSafe(db, 'anon', () => run(db, 'select count(*)::int as n from public.game_access_codes'))
  expect(Boolean(anonTable.error), '17. anon has NO direct table access (least privilege intact)')
  const anonCreate = await runRoleSafe(db, 'anon', () => run(db, 'select * from public.create_game_access_code($1::text, $2::int, $3::uuid)', [hashOf('x'), 60, ADMIN_ID]))
  expect(Boolean(anonCreate.error), '18. anon cannot create codes (admin-only RPC)')

  await db.close()

  console.log(`\n${checks - failures}/${checks} checks passed${failures ? '' : ' — real database flow verified'}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((cause) => {
  console.error('Verification harness crashed:', cause)
  process.exit(1)
})
