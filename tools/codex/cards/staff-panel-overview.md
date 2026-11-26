---
slug: staff-panel-overview
title: "Staff Panel Status, Sign-In, Audit Log, and Handle Renames"
domain: account
kind: overview
parent: null
files:
  - server-account/src/staffStatus.js
  - server-account/src/staff.js
  - server-account/src/staffPlayers.js
  - server-account/src/cron.js
  - server-account/migrations/0134_handle_rename.sql
  - server-account/migrations/0144_staff_panel.sql
  - src/net/eliteGates/egDurable.js
routes:
  - /v1/staff/status
  - /v1/staff/login
  - /v1/staff/player/rename
tables:
  - staff_sessions
  - staff_audit
related:
  - staff-panel-desk-and-feeds
  - hidden-staff-uncounted-overview
  - accounts-and-cloud-saves-overview
invariants:
  - "`EG_LIVE_PATH` in `server-account/src/staffStatus.js` must equal `EG_LIVE_PATH` in `src/net/eliteGates/egDurable.js`; it is spelled out instead of imported because importing `egDurable.js` would bundle the relay module graph into the account Worker."
  - "The status cache stores only finished answers, never pending promises, because a Worker cannot hand the I/O of one request to another."
  - "Sign-in tries are rate-limited per address and per handle from one address, never per handle alone, so nobody can lock a staff member out by sending tries under their handle."
  - "A handle rename rewrites every `NAME_COPIES` column from migration 0134 in one batch. Where a table keeps an account column beside the name, the entry scope limits the update to rows of the renamed account."
traps:
  - "A refused sign-in where exactly one of the password and the key was right is audited off the response path (`ctx.later`), so response timing cannot reveal a correct password."
  - "The `staff_audit_no_delete` trigger in migration 0144 refuses deleting rows newer than `STAFF_AUDIT_KEEP_S` less one hour (`2588400` s), so the constant and the trigger window must change together."
dfu: []
tags:
  - staff
  - status
  - sign-in
  - audit
  - rename
---

# Staff Panel Status, Sign-In, Audit Log, and Handle Renames

The account service serves the staff panel. Staff sign in with a handle, a password, and a key, and staff acts are written to `staff_audit`.

- **Server status (`/v1/staff/status`, `server-account/src/staffStatus.js`):** Admins only. Four tiles (players, service load, game activity, and health) read data the game already records. A source that does not answer reads `missing`, and one without credentials reads `not-configured`, never zero. Each part is cached in the isolate for its own time: database health and relay `/health` for `STATUS_FAST_S` (`10` s), Analytics Engine and the relay breach list (`EG_LIVE_PATH`) for `STATUS_SLOW_S` (`60` s), and the activity of the last hour for `STATUS_ACTIVITY_S` (`300` s).
- **Sign-in (`/v1/staff/login`, `server-account/src/staff.js`):** Every refused password, key, or account returns `staff-login`; a try over a limit returns `rate`. Tries are limited to `STAFF_IP_MAX` (`30`) per address and `STAFF_TRY_MAX` (`5`) per handle from one address within `STAFF_TRY_WINDOW_S` (`15` minutes).
- **Audit log retention:** The hourly cron job `staff-audit` deletes `staff_audit` rows older than `STAFF_AUDIT_KEEP_S` (`30` days) in `SWEEP_ROWS` pages, and the migration 0144 trigger refuses deleting younger rows.
- **Handle rename (`/v1/staff/player/rename`, `server-account/src/staffPlayers.js`):** Admins only. One batch writes the audit row, the new handle, and every `NAME_COPIES` column. The moderation record and the audit log keep the old name.
