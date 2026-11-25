---
slug: account-passwords-recovery-codes-and-rate-limits
title: "Passwords, Recovery Code Sets, and Rate Limits"
domain: account
kind: subcard
parent: accounts-and-cloud-saves-overview
files:
  - server-account/src/password.js
  - server-account/src/accounts.js
  - server-account/migrations/0002_passwords.sql
  - src/ui/accountFlow.js
  - src/net/accountClient.js
routes:
  - /v1/auth/login
  - /v1/auth/recover
  - /v1/auth/register
  - /v1/account/password
  - /v1/account/recovery-codes
  - /v1/account/email
tables:
  - players
  - sessions
  - rate_limits
replacesBible:
  - "06-Systems/Accounts-And-Cloud-Saves-Arc.md"
related:
  - accounts-and-cloud-saves-overview
  - account-routes-and-gate-wall
  - scale-arc-d1-write-diet-and-cron
invariants:
  - "`PBKDF2_ITERS` equals `PBKDF2_CAP` (100000) because production Workers reject higher PBKDF2 counts; hashes are self-describing so iterations can upgrade on login."
  - "Credential writes (`changePassword`, login, `openSession`, recover) are conditioned on the verified hash or standing session so concurrent races lose cleanly."
  - "Password change revokes other sessions but keeps the current one; recovery revokes all sessions."
  - "`hashPassword` throws on empty input; `timingSafeEqual` rejects non-`Uint8Array` inputs and length mismatches."
traps:
  - "Authenticated per-account limits (`ACCOUNT_MAX` 240, `overAccountRate`) live in isolate memory; moving them to D1 caused a write-overload outage. Only `login:` and `ip:` keys stay in `rate_limits`."
  - "Making a new recovery set requires the current password plus one current code; the code display cannot be dismissed until acknowledged."
dfu: []
tags:
  - account
  - passwords
  - recovery-codes
  - rate-limits
  - security
---

# Passwords, Recovery Code Sets, and Rate Limits

Password hashing, recovery code sets, and authentication rate limits live in `server-account/src/password.js` and `server-account/src/accounts.js`, backed by `players`, `sessions`, and `rate_limits` (`server-account/migrations/0002_passwords.sql`).

- **PBKDF2 bounds and constant-time checks:** `PASSWORD_MIN` is 8 characters, and account email (`/v1/account/email`) is optional. `PBKDF2_ITERS` matches `PBKDF2_CAP` (100000) to stay within production Worker WebCrypto limits, and self-describing hash strings allow future iteration upgrades on login. `hashPassword` throws on empty input, while `timingSafeEqual` rejects non-`Uint8Array` values and length mismatches.
- **Recovery code sets:** Each recovery set holds `RECOVERY_SET_SIZE` (8) single-use codes hashed at `RECOVERY_CODE_ITERS` (10000). On `/v1/auth/recover`, `matchRecoveryCode` spends the matched code and automatically mints a fresh set when the last code is spent. Rotating codes manually via `/v1/account/recovery-codes` (`newRecoveryCodes` in `src/net/accountClient.js`) requires the current password plus one valid recovery code, and `src/ui/accountFlow.js` blocks dismissal until the player acknowledges the new set.
- **Session revocation and race guards:** Credential mutations (`changePassword` on `/v1/account/password`, `/v1/auth/login`, `openSession`, and `/v1/auth/recover`) condition SQL writes on the verified hash or standing session. Changing a password revokes other sessions while keeping the current session alive; recovery revokes all sessions.
- **Isolate versus D1 rate limits:** Unauthenticated `login:` and `ip:` buckets persist in D1 `rate_limits`, whereas authenticated per-account limits (`ACCOUNT_MAX` 240 via `overAccountRate`) stay in isolate memory to avoid D1 write saturation.
