---
slug: instance-owner-digest-and-party-kin-door
title: "Instance Owner Digest and Hub Party Kin Door"
domain: multiplayer
kind: subcard
parent: instances-retired-public-place-rooms
files:
  - src/net/instanceRoom.js
  - src/net/privateInterior.js
  - server/src/world/wdun.js
  - server/src/room/doors.js
  - server/src/world/ketch.js
  - server/src/index.js
  - src/net/ketch/ketchLaw.js
  - src/systems/ketch/ketchClient.js
routes:
  - /internal/instance/kin
tables: []
replacesBible:
  - "11-Multiplayer/Instances.md"
related:
  - instances-retired-public-place-rooms
  - sky-ketch-voyage-clock-and-boarding
  - sky-ketch-raid-overview
  - room-engine-and-hub-sharding
  - identity-tokens-and-relay-seam
invariants:
  - "`instanceOwnerOf(account)` is `digest('instance:account:<account>', 8)`: 16 lowercase hex (`INSTANCE_OWNER_HEX = 16`), or null for an invalid id (`/^[A-Za-z0-9_-]{4,64}$/`)."
  - "Epoch spelling is 8 lowercase hex (`INSTANCE_EPOCH_HEX = 8`, `isInstanceEpoch`)."
  - "`INSTANCE_INTERNAL_KIN` (`/internal/instance/kin`) routes in `server/src/room/doors.js` to `_instanceKinInternal`, loading the party of the subject via `_myParty` and answering `partyHoldsOwner(members, a, o)`."
  - "`_instanceKinOf` (server/src/world/wdun.js) POSTs `{ a, o }` to the social hub room with `ROOM_CALL_MS` timeout; only a `true` is cached, for `INSTANCE_KIN_KEEP_MS` (15000 ms), in a map capped at 512 entries."
  - "A hub failure returns null; Sky-Ketch `_ktHello` maps null to a busy refusal, never to admission."
  - "Ketch admission order: staff, owner (digest match), then party via kin; `_battleHelloGate` runs first."
traps:
  - "Never cache a negative kin answer; a newly invited member must be admitted at once."
  - "The owner is always compared against the token-verified subject, never a hello field."
dfu: []
tags:
  - instances
  - party
  - kin
  - sky-ketch
  - admission
  - relay-internal
---

# Instance Owner Digest and Hub Party Kin Door

While place instances retired under `ONLINE-PUBLIC` (`instances-retired-public-place-rooms`), owner digests and the hub party kin door remain active for Sky-Ketch boarding admission (`sky-ketch-voyage-clock-and-boarding`, `src/net/instanceRoom.js`, `server/src/world/ketch.js`).

## Owner Digest and Epoch Formatting

- **Account digest (`src/net/instanceRoom.js`, `src/net/privateInterior.js`):** `instanceOwnerOf(account)` computes `digest('instance:account:<account>', 8)` as `16` lowercase hex characters (`INSTANCE_OWNER_HEX = 16`), or `null` when the account ID fails `/^[A-Za-z0-9_-]{4,64}$/`. Epoch strings require `8` lowercase hex characters (`INSTANCE_EPOCH_HEX = 8`, `isInstanceEpoch`).
- **Ketch usage (`src/net/ketch/ketchLaw.js`, `src/systems/ketch/ketchClient.js`):** Client and relay ketch code import `INSTANCE_OWNER_HEX` and `instanceOwnerOf` to match the token-verified subject against the captain digest. `instanceAdmission` returns `'staff'`, `'owner'`, `'party'`, or `null` with no caller.

## Hub Party Kin Door and Caching

- **Internal kin route (`server/src/room/doors.js`, `server/src/world/wdun.js`):** `_instanceKinOf` POSTs `{ a, o }` to `INSTANCE_INTERNAL_KIN` (`/internal/instance/kin`) on the social hub with `ROOM_CALL_MS` timeout. `_instanceKinInternal` loads the subject party through `_myParty` and checks `partyHoldsOwner(members, a, o)`.
- **Positive cache and Ketch hello (`server/src/index.js`, `server/src/world/ketch.js`):** `this._instanceKin` (`subject|owner` to `{ kin, at }`, `512` cap) caches only `true` answers for `INSTANCE_KIN_KEEP_MS` (`15000` ms). Hub failures return `null`, which `_ktHello` maps to a busy refusal after `_battleHelloGate`, staff, and owner checks.
