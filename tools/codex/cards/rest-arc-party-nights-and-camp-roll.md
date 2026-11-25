---
slug: rest-arc-party-nights-and-camp-roll
title: "Party Night Sharing and Camp Roll Election"
domain: systems
kind: subcard
parent: rest-arc-overview
files:
  - src/party/partyRestLaw.js
  - src/party/partyWorld.js
  - src/systems/survival/restAct.js
  - src/net/wire.js
  - src/scenes/shared.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Rest-Arc.md"
related:
  - rest-arc-overview
  - rest-arc-rest-act-channel-and-yield
  - room-engine-and-hub-sharding
invariants:
  - "A night slept whole is broadcast as a pose stamp whose last three digits mark its kind (PARTY_NIGHT_MARKS rough 775, camp 776, bed 777). CAMP_MARKS open 774 and done 773 mark the camp channel."
  - "createNightWatch answers one member's night stamp only above its high-water mark, no older than PARTY_NIGHT_FRESH_MS (30 s), and at most once per PARTY_NIGHT_GAP_MS (60 s) unless my own night is due."
  - "carriedNightAction returns carry/busy/town/far/null. Nothing is carried when restWithParty is off, when the rester rests alone (nr), in a tavern, temple, or guild hall, or when dead."
  - "carriedRestKind sleeps the better of my spot and the rester's (rough < camp < bed)."
  - "When several members open a rest at once, they elect the lowest account id as the single encounter roller. The others wait. After CAMP_WAIT_MS (15 s), a waiter rolls its own night (fail-open)."
traps:
  - "Strangers (players not in the party) never block a rest (STRANGER-REST1). A party mate resting separately nearby gives REST_APART_TEXT."
  - "Party reach is 15 m (carriedFar text). A party member beyond 15 m receives a notification and is not carried."
dfu: []
tags:
  - party
  - rest
  - wire
  - camp-roll
---

# Party Night Sharing and Camp Roll Election

Party members synchronize long rests and coordinate encounter rolls over pose frames without dedicated rest RPCs (`src/party/partyRestLaw.js`, `src/party/partyWorld.js`, `src/net/wire.js`).

## Pose Stamps and Carried Nights

- **Pose encoding (`src/party/partyRestLaw.js`, `src/net/wire.js`):** Poses carry `restStartedAt`, `rs`, and `restEnemyAt`, with `wire.js` validating `PARTY_REST_KINDS` (`bed`, `camp`, `rough`). Completed nights encode their tier in the low three digits via `PARTY_NIGHT_MARKS` (`rough` `775`, `camp` `776`, `bed` `777`), while `CAMP_MARKS` (`open` `774`, `done` `773`) marks channel state within `CAMP_OPEN_FRESH_MS` (`40000` ms), `STAMP_SLACK_MS` (`5000` ms), and `PARTY_READY_TIMEOUT_MS` (`60000` ms).
- **High-water watch and eligibility (`src/party/partyRestLaw.js`, `src/scenes/shared.js`):** `createNightWatch` accepts a member stamp above the high-water mark, within `PARTY_NIGHT_FRESH_MS` (`30` s), and spaced by `PARTY_NIGHT_GAP_MS` (`60` s) unless a local night is due. `carriedNightAction` returns `carry`, `busy`, `town`, `far`, or `null`, refusing carry when `restWithParty` is off, when solo (`nr`), inside a tavern, temple, or guild hall, when dead, or past `15` m (`carriedFar`). Eligible members rest at `carriedRestKind`, taking the higher tier between the local and initiator spots (`rough < camp < bed`).

## Camp Roll Election and Non-Party Isolation

- **Fail-open election (`src/party/partyRestLaw.js`):** Simultaneous resters elect the lowest account id to roll encounters while peers wait up to `CAMP_WAIT_MS` (`15` s) before failing open locally.
- **Stranger isolation (`STRANGER-REST1`):** Non-party players never block or join a rest; a mate resting separately nearby triggers `REST_APART_TEXT`.
