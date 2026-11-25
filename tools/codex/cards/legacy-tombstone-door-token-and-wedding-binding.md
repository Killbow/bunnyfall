---
slug: "legacy-tombstone-door-token-and-wedding-binding"
title: "Tombstone 410 Route Door, Token rc and ci Claims, and Wedding Character Binding"
domain: "legacy"
kind: "subcard"
parent: "legacy-arc-overview"
files:
  - "server-account/src/legacy.js"
  - "server-account/src/index.js"
  - "server-account/src/guilds.js"
  - "server-account/src/routes/accountRoutes.js"
  - "src/net/identityToken.js"
  - "src/net/wire.js"
  - "src/net/onlineWorld.js"
  - "server-account/migrations/0084_legacy.sql"
routes:
  - "/v1/auth/token"
tables:
  - "realm_unions"
  - "realm_wed_halves"
replacesBible:
  - "01-Overview/audits/Audit-Legacy-III.md"
related:
  - "legacy-arc-overview"
  - "legacy-online-death-hold-and-revival"
  - "legacy-courtship-and-online-wedding"
  - "legacy-lineage-merge-and-payload-bounds"
invariants:
  - "Tombstoned characters receive `410 dead` at the `server-account/src/index.js` route door before route handlers execute."
  - "Identity token claim `ci` is valid only alongside `rc === 1` (`rc: 0` is sent explicitly, never omitted), and both token minting and relay `hello` enforce `TOKEN_BODY_MAX` (`864` in `src/net/identityToken.js`)."
  - "`entombLineDead` tombstones a realm character when lineage records their death, `afterTomb` transfers guild seats via `guildMemberDead`, and `renownHeldSql` excludes tombstoned characters."
  - "Online weddings bind `partner_char` from the relay-stamped character in `realm_unions` and `realm_wed_halves`, while `wedAsk` waits for `overlayHeld` to clear and `wedCan` reports busy while dead."
traps:
  - "Tombstone `dead_why` allows transitioning only from `retired` to `fell` and never clears back to alive."
  - "Read `TOKEN_BODY_MAX` from `src/net/identityToken.js` rather than hardcoding an older byte ceiling."
dfu: []
tags:
  - "legacy"
  - "tombstone"
  - "identity-token"
  - "wedding"
---

# Tombstone 410 Route Door, Token rc and ci Claims, and Wedding Character Binding

Account route admission, identity token character claims, guild tombstone handoffs, and online wedding bindings prevent dead or mismatched characters from mutating realm state.

## Tombstone Route Door and Token Claims

At the `server-account/src/index.js` route door, tombstoned characters receive `410` (`dead`) before route handlers execute. In `server-account/src/legacy.js` (`server-account/migrations/0084_legacy.sql`), `entombLineDead` tombstones a realm character when lineage records their death, `dead_why` transitions only from `retired` to `fell` (never clearing back to alive), `afterTomb` transfers guild seats via `guildMemberDead` (`server-account/src/guilds.js`), and `renownHeldSql` excludes tombstoned characters. On `/v1/auth/token` (`server-account/src/routes/accountRoutes.js`, `src/net/identityToken.js`, `src/net/wire.js`), claim `ci` is valid only alongside `rc` set to `1` (`rc: 0` is sent explicitly, never omitted), and both token minting and relay `hello` enforce `TOKEN_BODY_MAX` (`864`).

## Online Wedding Character Binding

- **Relay-stamped partner binding (`server-account/src/legacy.js`, `src/net/onlineWorld.js`):** Online weddings bind `partner_char` from the relay-stamped character across `realm_unions` and `realm_wed_halves`.
- **Proposal UI guards (`src/net/onlineWorld.js`):** `wedAsk` waits for `overlayHeld` to clear before opening a proposal, and `wedCan` reports busy while a character is dead.
