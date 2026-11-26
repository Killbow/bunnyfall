---
slug: identity-tokens-and-relay-seam
title: Identity Tokens, Signed Orders, and the Relay Seam
domain: multiplayer
kind: overview
files:
  - src/net/identityToken.js
  - server-account/src/signing.js
  - server-account/src/index.js
  - server/src/index.js
  - server-account/src/routes/accountRoutes.js
  - tools/mintGateKeys.mjs
routes:
  - /v1/auth/token
  - /v1/pubkey
related:
  - account-routes-and-gate-wall
  - room-engine-and-hub-sharding
  - wire-protocol-and-frame-dispatch
invariants:
  - "`server/` and `server-account/` share trust only through Ed25519 signatures; the relay holds no D1 binding and never calls `server-account/` for authentication."
  - "`verifyToken` verifies `TOKEN_V` and the 64-byte signature before parsing JSON, enforces `MAX_TTL_S` (`300` s) and `SKEW_S` (`30` s), and rejects unsanitized names."
  - Each `Room` Durable Object tracks spent token signatures to block same-room replay.
  - "For a staff account with a live staff session and Hide me on, `/v1/auth/token` returns the token from `hiddenToken` instead of the normal one; a lapsed hidden session gets HTTP `409` and no token."
  - "A gate receipt starts with `r1` (`RECEIPT_V`) and an identity token with `v1` (`TOKEN_V`); each verifier rejects the other's prefix, so a receipt never verifies as a token or the reverse."
traps:
  - Signed orders require an explicit `kind` in `verifyOrder` and forbid identity fields (`n`, `k`) while requiring `o`, preventing cross-type signature reuse.
  - Because `src/net/identityToken.js` sits in the relay bundle graph, editing it bumps `RELAY_VERSION` and disconnects connected rooms on deploy.
  - "The mint drops only the house claim when adding it would push the token past `TOKEN_MAX_CHARS` or its body past `TOKEN_BODY_MAX`; every other claim stays."
  - "`tools/mintGateKeys.mjs` emits both halves of one Ed25519 pair in one run. `GATE_PUBLIC_KEY` goes on the account service as a Worker secret, not a var, because every deploy rewrites vars."
tags:
  - auth
  - tokens
  - ed25519
  - orders
  - relay
---

# Identity Tokens, Signed Orders, and the Relay Seam

`server/` (WebSocket relay) and `server-account/` (HTTP, D1, and R2) run as separate Workers because deploying `server/` restarts Durable Objects and drops every connected room. The relay holds no D1 binding and never calls `server-account/` for authentication; trust crosses the seam solely through Ed25519 signatures (`server-account/src/signing.js`).

- **Pinned `v1` tokens (`src/net/identityToken.js`):** `mintToken` (called by `POST /v1/auth/token` in `server-account/src/index.js`) seals `v1.<base64url(claims)>.<base64url(sig)>` under `IDENTITY_PRIVATE_KEY`. `verifyToken` checks `TOKEN_V` and the 64-byte signature before parsing JSON, enforces a 5-minute `MAX_TTL_S` (`300` s) and `SKEW_S` (`30` s), refuses unsanitized names rather than repairing them, and records spent signatures per room in `server/src/index.js` to block same-room replay.
- **Derived claims:** Titles (`TITLES`), glyphs (`GLYPHS`), auras (`AURAS`), icons (`ICONS`), guild tags, Renown `lv`, and realm status (`rc`) derive from D1 at mint time (`TOKEN_BODY_MAX` `864`, `TOKEN_MAX_CHARS` `1024`), expiring within five minutes without relay database reads.
- **Signed live orders:** Mid-session updates processed by `Room` (`server/src/index.js`) use 60-second signed orders (`ORDER_TTL_S` `60`, `verifyOrder` with explicit `kind`), including `mute`, `ban`, `renown`, `guild`, `guildout`, and `home`. Orders forbid identity fields (`n`, `k`) and require `o`, preventing cross-type confusion.
