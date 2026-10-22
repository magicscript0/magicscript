# NEXUS V3 Zero-Trust Security Hardening Report

---

## 1. Executive Summary & Concrete Capabilities

This report documents the architecture, threat mitigations, and verification results of **Migration V3** (`supabase/migrations/20260927000000_zero_trust_hardening_v3.sql`). 

All previous draft migrations containing hardcoded fallback secrets or unverified structures (`20260925000000_zero_trust_hardening.sql`) have been neutralized. Migration V3 contains **zero hardcoded secrets**, introduces **Vault-first storage**, removes all database `pg_sleep` calls, guarantees transaction-safe audit log persistence on failed attempts/lockouts, enforces dynamic IP extraction via a dedicated configuration table, and safely backfills legacy codes to `max_uses = greatest(uses_count, 1)`.

> [!NOTE]
> In accordance with strict engineering standards, we do **not** claim "100% security" or "constant-time comparison" inside PL/pgSQL. All mitigations represent defense-in-depth layers designed to eliminate automated exploitation, brute-force scaling, and credential harvesting.

---

## 2. Threat Modeling & Mitigation Matrix

| # | Attack Vector | Technical Vulnerability | Mitigation Mechanism (Migration V3) | Automated Test Name |
|---|---|---|---|---|
| 1 | **Audit Log Rollback Bypass** | Attacker floods failed codes; database throws `RAISE EXCEPTION`, causing PostgreSQL to roll back transaction and discard failure/lockout records. | `redeem_game_access` returns an empty result set (0 rows) on rate limits, invalid codes, or active lockouts instead of raising. Inserts into `game_access_rate_limits` and `security_audit_logs` commit successfully. | `2. Audit logs persist after lockout: redeem_game_access returns 0 rows instead of raising, and audit row is committed` |
| 2 | **Denial of Service via DB Thread Starvation** | Attackers trigger rate limits causing `pg_sleep()` calls, exhausting PostgreSQL max connection pool. | Complete removal of all `pg_sleep` calls. Replaced with immediate rejection (0 rows) and deterministic progressive lockout windows (5 min $\to$ 15 min $\to$ 60 min). | `3. No pg_sleep anywhere: asserts 0 occurrences of pg_sleep across all database routines` |
| 3 | **Database Dump Credential Replay** | Attacker compromises read replica or database backup and extracts access codes. | Legacy plain SHA-256 codes are automatically upgraded to server-side HMAC with a 256-bit pepper upon first redemption. New codes are only ever stored as HMAC. Missing pepper strictly raises `P0002` (no fallback). | `4. Peppers: stored Vault-first or fallback table, get_security_pepper raises P0002 on missing with NO fallback` |
| 4 | **Client IP Header Spoofing & Shared Proxy DoS** | Attacker sends forged `X-Forwarded-For` headers to frame innocent IPs, or a shared proxy IP locks out all visitors behind that NAT gateway. | Configurable `security_settings` table with `trusted_ip_header` (`'none'`, `'cf-connecting-ip'`, `'xff-first'`, `'xff-last'`). Default is `'none'` (unknown IP bucket where lockouts are strictly isolated to the targeted account ID, never global). | `5. Dynamic client IP settings: supports none, cf-connecting-ip, xff-first, xff-last; none uses account limits only` |
| 5 | **Legacy Code Abuse / Replay** | Old codes that lacked `max_uses` could be redeemed indefinitely. | Defaulted legacy rows to `max_uses = greatest(uses_count, 1)`. Optional `legacy_codes_cutoff` setting in `security_settings` completely disables legacy SHA-256 fallback after a specified cutoff date. | `6. Legacy code backfill and cutoff: greatest(uses_count, 1) and legacy_codes_cutoff expiration` |
| 6 | **Unauthorized Direct Table Harvesting** | Malicious authenticated or anonymous actors querying security tables directly via Supabase PostgREST endpoints. | Enabled RLS on all tables (`game_access_rate_limits`, `game_access_sessions`, `m11_snapshots`, `security_audit_logs`, `security_settings`, `security_peppers`). Direct access revoked from `public` and `anon`; authenticated access restricted strictly to administrators via `has_admin_role('admin')`. | `7. Task C grants & RLS: authenticated role cannot SELECT sensitive tables directly, but admin can` |
| 7 | **Unauthorized Code Generation** | A compromised client attempts to pass a spoofed `p_created_by` parameter to mint access codes. | `create_game_access_code` checks `p_created_by = (select auth.uid())` unless called by `service_role`. Accepts `max_uses` and `single_session` parameters, and records `code_generation` in `security_audit_logs`. | `8. create_game_access_code: validates p_created_by = auth.uid(), accepts max_uses/single_session, logs actor` |
| 8 | **Code Normalization Mismatch** | Client and server compute different hashes due to lowercase letters, whitespace, or dash formatting. | Both web clients (`src` and `nexus-v2`) enforce `normalizeAccessCode(code)` (`trim().toUpperCase()`) before hashing. Exact bit-for-bit parity verified against PostgreSQL. | `9. Code format compatibility: client normalizeAccessCode + sha256Hex matches SQL exactly` |
| 9 | **Race Conditions & Concurrency Deadlocks** | 50 concurrent requests for the same code or account attempt to bypass usage limits. | Two-tier transaction advisory locking (`acc_lock` and `ip_lock`) combined with row locks (`for update`) on code records. | `10. Concurrency stress test: 50 parallel redemption requests execute cleanly without deadlocks` |
| 10 | **Account Cycling / Brute Force by One IP** | Attacker tries cycling through thousands of Account IDs from a single IP to bypass account limits. | `redeem_game_access` tracks both account-level failures and IP-level failures. Exceeding 10 failures from the same IP locks that IP across all accounts. | `11. Attacker cycling account IDs from one IP does NOT evade IP-level rate limits` |
| 11 | **Distributed Botnet Targeting Single Account** | Attacker uses a proxy network / botnet to hammer a single victim account from many distinct IPs. | Account-level failure tracking triggers lockout after 5 failures regardless of source IP. | `12. Many IPs targeting one account trigger account-level lockout` |
| 12 | **Targeted DoS / Victim Lockout** | Attacker on IP B deliberately hammers victim's account to lock them out on IP A. | When failure counts are below the threshold, legitimate redemption succeeds immediately without cross-IP contamination. | `13. Victim lockout prevention: attacker on IP B hammering victim account does NOT lock victim on IP A (when below account threshold)` |
| 13 | **Session Expiry Timezone Drift** | PostgreSQL session timezone changes cause code expiration checks to miscalculate remaining validity. | All timestamps use `timestamptz` and PostgreSQL internal clock (`now()`), independent of client session timezone. | `14. Timezone safety: redemption uses absolute timestamptz instants` |
| 14 | **Information Disclosure via Error Messages** | Attacker distinguishes between invalid codes, expired codes, and revoked codes to enumerate valid codes. | All failure modes return a uniform empty result (0 rows). The frontend displays a generic "unavailable or rate limited" message. | `15. Uniform empty responses on invalid, expired, revoked, or non-existent codes` |

---

## 3. What Cannot Be Verified in Local Unit Tests

While our test suite (`comprehensiveSecurity.integration.test.ts`) runs real PostgreSQL statements inside `@electric-sql/pglite`, the following runtime behaviors require verification on a live Supabase staging project:

1. **Supabase Vault (`vault.secrets` / `vault.decrypted_secrets`)**:
   - `pglite` does not compile the proprietary `supabase-vault` C extension. The local test verified the fallback table path (`public.security_peppers`). The Vault read/write path must be verified on staging.
2. **Native Supabase `auth.role()` JWT Claim Resolver**:
   - In production Supabase, `auth.role()` is provided by PostgREST based on the verified JWT claims (`role`). In our local test environment, a test harness stub simulated this claim resolution.
3. **Real Ingress Proxy Headers**:
   - Local environments do not have Cloudflare or AWS ALB reverse proxies in front. The live header structure (`cf-connecting-ip`, `x-forwarded-for`) must be observed using `public.debug_inspect_request_headers()` on staging.

---

## 4. Compromised Secret Analysis & Gitleaks Runbook

### A. Previously Leaked Pepper Strings
The following files in the repository previously contained or referenced static pepper strings (now purged or neutralized):
1. `supabase/migrations/20260925000000_zero_trust_hardening.sql` (neutralized with a no-op comment).
2. Git commit history (`cfad3991c7769be617cf9222f2de7600ed15d2d5`).

### B. Commands to Scan Git History
To verify that no other secrets or tokens exist in your git history, run:

```bash
# 1. Run Gitleaks across full repository git history:
gitleaks detect --source . --verbose --redact

# 2. Run TruffleHog git scanner with active verification:
trufflehog git file://. --only-verified
```

---

## 5. Firebase Dual-Write Security Status

- The configuration flag `VITE_ENABLE_FIREBASE_DUAL_WRITE` defaults to **OFF** (`false`) in production.
- **Risk when ON**: Because account access to `zaem-a8d30` has been lost and Firebase security rules cannot be updated from the console, while dual-write is enabled, the `/m11` prediction node is **publicly readable worldwide without an access code**.
- **Impact when OFF**: Turning dual-write OFF terminates all writes to Firebase. The web clients will read predictions securely from Supabase `m11_snapshots`. However, legacy Android clients that still query `zaem-a8d30.firebaseio.com/m11` will no longer receive live round updates.

---

## 6. Staging Deployment Runbook

### Step 1: Pre-Flight Checklist (Read-Only)
Open the Supabase SQL Editor on your staging project and run `supabase/migrations/preflight_v3_check.sql`:
```bash
# Check counts of active codes, existing policies, and Vault status:
# Run: supabase/migrations/preflight_v3_check.sql
```

### Step 2: Apply Migration V3
Copy the entire contents of `supabase/migrations/20260927000000_zero_trust_hardening_v3.sql` into the SQL Editor and click **Run**.

### Step 3: Inspect Request Headers & Configure IP Extraction
1. As an administrator (`super_admin` or `service_role`), call the debug function:
   ```sql
   select * from public.debug_inspect_request_headers();
   ```
2. Inspect the JSON output:
   - If `cf-connecting-ip` is present and matches your public IP:
     ```sql
     update public.security_settings 
     set value = 'cf-connecting-ip', updated_at = now() 
     where key = 'trusted_ip_header';
     ```
   - If behind a standard proxy providing `x-forwarded-for` and the last hop is reliable:
     ```sql
     update public.security_settings 
     set value = 'xff-last', updated_at = now() 
     where key = 'trusted_ip_header';
     ```
   - If behind a shared corporate/carrier NAT proxy or headers are untrusted:
     ```sql
     update public.security_settings 
     set value = 'none', updated_at = now() 
     where key = 'trusted_ip_header';
     ```
3. Drop the temporary debug function:
   ```sql
   drop function if exists public.debug_inspect_request_headers();
   ```

### Step 4: Verify Live Operations
- Mint a new test access code via the admin console (`Console.tsx`).
- Redeem the code from `GameLogin.tsx`.
- Check `select * from public.security_audit_logs order by created_at desc limit 5;` to verify audit records are being written.
