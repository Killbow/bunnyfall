---
slug: account-routes-and-gate-wall
title: Account Routes, Session Passes, and the Gate Wall
domain: account
kind: overview
files:
  - server-account/src/index.js
  - server-account/src/service.js
  - server-account/src/sessionPass.js
  - server-account/src/staffFreeze.js
  - tools/routesCheck.mjs
routes:
  - /v1/auth/token
  - /v1/auth/logout
  - /v1/account
  - /v1/heartbeat
  - /v1/saves
  - /v1/realm
tables:
  - players
  - sessions
related:
  - identity-tokens-and-relay-seam
  - realm-saves-and-mod-save-hooks
  - selfhost-runtime-and-updater
invariants:
  - Static account routes must appear in both `ROUTES` in `server-account/src/service.js` and `service.route()` in `server-account/src/index.js`, enforced by `tools/routesCheck.mjs`.
  - Session secrets arrive in `Authorization: Bearer` headers or POST `body.secret`, never in URL query strings.
  - Banned accounts receive 403 `banned` on every authenticated route except `/v1/auth/logout`.
traps:
  - Hot routes that accept `x-session-pass` skip the initial D1 lookup, so checkpoint and heartbeat writes must still check session, ban, and freeze columns in SQL.
  - Only `AdmitGate` and `default` may be exported from `server-account/src/index.js`; placing constants there breaks `workerd` entrypoint validation.
tags:
  - account
  - routes
  - sessions
  - auth
---

# Account Routes, Session Passes, and the Gate Wall

`server-account/src/index.js` handles all HTTP routes inside `service.route()` and exports only `AdmitGate` and `default` (`fetch` and `scheduled`), storing route sets and constants in `server-account/src/service.js` so `workerd` accepts the Worker entrypoint.

- **Two-place route registration:** Static paths must appear in `ROUTES` (`server-account/src/service.js`) and in `service.route()`, while parameterized paths match `savePathOf`, `realmPathOf`, or `poiPathOf`. Unlisted paths return 404 `not-found`, and `tools/routesCheck.mjs` validates `index.js` literals and `src/` client callers against `ROUTES`.
- **Session passes (`server-account/src/sessionPass.js`):** Credentials travel in `Authorization: Bearer` or POST `body.secret` (never query strings). Hot routes (`PASS_PATHS` plus checkpoint `PUT /v1/realm/<id>/data`) accept a 5-minute HMAC `x-session-pass` minted from primary D1 reads; checkpoint (`checkpointRealm`) and heartbeat (`creditPlay`) writes still check session, ban, and freeze state in SQL.
- **Sanction and guest walls:** After session lookup, `index.js` blocks frozen accounts (`freezeRefusal`, 403 `frozen` outside `FREEZE_ALLOWED` and realm reads), banned accounts (403 `banned` except `/v1/auth/logout`), and tombstoned characters (410 `dead`). Guests receive relay tokens and online realm characters, whereas cloud saves, homes, camps, guilds, mail, market, and professions require `linked` accounts.
