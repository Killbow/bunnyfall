---
slug: chat-safety-relay-stamps-and-new-voice-pace
title: "Relay Chat Stamps and New-Voice Pacing"
domain: multiplayer
kind: subcard
parent: chat-safety-overview
files:
  - src/net/safety/chatStamp.js
  - src/net/wire.js
  - server/src/index.js
  - server-account/src/signing.js
  - server-account/src/titles.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Chat-Safety-Arc.md"
related:
  - chat-safety-overview
  - chat-safety-reports-cases-and-auto-mute
  - identity-tokens-and-relay-seam
  - room-engine-and-hub-sharding
invariants:
  - "The relay signs every relayed chat line with `GATE_SIGNING_KEY` as `sg = base64url(Ed25519(\"chat-stamp1\\n\" + JSON.stringify([tab, sub, name, at, text])))`, and the account server verifies it against `GATE_PUBLIC_KEY` with `verifyStamp`."
  - "`STAMP_V` (`'chat-stamp1'`) is domain-separated from identity tokens, live orders, and receipts (`v1.`, `r1.`, and `c1.`), preventing cross-type signature reuse."
  - "The relay signs the masked (starred) text delivered to recipients rather than the sender's raw input."
  - "Guests and sprout accounts younger than `SPROUT_S` (`14` days) are paced to one line per `NEW_VOICE_GAP_MS` (`4000` ms) across `PUBLIC_TABS`, tracked per account per room in `_paces` and refused with `{t: 'slowed', ms}`, while party, guild, and local chat remain unpaced."
traps:
  - "A relay running without `GATE_SIGNING_KEY` broadcasts chat lines without `sg`, and unstamped lines cannot be submitted in player reports."
  - "`stampTabOf` derives the tab from the room key and channel, resolving hub shards through `channelOf` in `src/net/hubShards.js` so the relay and recipients compute identical stamps."
  - "Editing `src/net/safety/chatStamp.js` or `src/net/wire.js` changes the relay bundle and increments the relay version on deploy."
dfu: []
tags:
  - relay
  - ed25519
  - chat-stamp
  - rate-limit
  - guests
---

`src/net/safety/chatStamp.js` and `server/src/index.js` attach Ed25519 witness stamps to relayed chat lines and pace new or unlinked speakers on public channels.

## Ed25519 Witness Stamps

When the relay broadcasts a line across `STAMP_TABS` (`world`, `region`, `lang`, `trade`, `lfg`, `party`, `guild`, `local`, and `whisper`), it signs the masked text that recipients actually read. `signStamp` and `verifyStamp` (`src/net/safety/chatStamp.js`, backed by `server-account/src/signing.js`) sign `"chat-stamp1\n" + JSON.stringify([tab, sub, name, at, text])` under `GATE_SIGNING_KEY` and verify against `GATE_PUBLIC_KEY`. The resulting `sg` field matches `STAMP_RE` (an 86-character base64url Ed25519 signature).

The `STAMP_V` prefix (`'chat-stamp1'`) keeps chat signatures disjoint from `v1.` tokens, `r1.` world receipts, and `c1.` card receipts. `stampTabOf` maps the room key and wire channel to the canonical tab name, normalizing sharded world hubs through `channelOf` (`src/net/hubShards.js`). Without `GATE_SIGNING_KEY`, the relay omits `sg` and those lines cannot be reported.

## New-Voice Pacing

Alongside the per-client `CHAT_HZ_MAX` (`2` Hz) bucket in `src/net/wire.js`, `server/src/index.js` enforces `NEW_VOICE_GAP_MS` (`4000` ms) in `_paces` per account and room across `PUBLIC_TABS` (`world`, `region`, `lang`, `trade`, and `lfg`). The gap applies only to guests and linked accounts younger than `SPROUT_S` (`14` days, `server-account/src/titles.js`), returning `{t: 'slowed', ms}` on early sends while leaving `party`, `guild`, and `local` talk unpaced.
