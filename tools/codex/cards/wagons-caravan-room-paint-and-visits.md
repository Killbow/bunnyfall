---
slug: wagons-caravan-room-paint-and-visits
title: "Caravan Room, Wagon Paint, and Online Caravan Visits"
domain: travel
kind: subcard
parent: wagons-kinds-and-hitching-overview
files:
  - src/travel/caravanRoom.js
  - src/travel/caravanRoomHost.js
  - src/world/caravanRoomModel.js
  - src/travel/wagonLooks.js
  - src/travel/caravanVisit.js
  - src/net/caravanVisitLink.js
  - src/net/privateInterior.js
  - src/net/wire.js
  - server/src/message/frames/caravan.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Wagons.md"
related:
  - wagons-kinds-and-hitching-overview
  - arena-relay-rooms-and-private-sessions
  - homes-camps-guilds-and-territories
  - room-engine-and-hub-sharding
invariants:
  - "Paint is `wagonLook {o,w,f,c}` (outside, walls, floor, ceiling) with LOOK_COUNT = 6 choices each. On the wire `wl` = o + 6w + 36f + 216c, at most WAGON_LOOK_CODE_MAX = 1295. Art records use LOOK_RECORD_STRIDE = 100, and the live room uses CARAVAN_LIVE_CHOICE = 9."
  - "The relay room for a caravan is `caravan:<k>` (caravanRoomOf), where k is the owner park key. Only the owner may write the `caravan` frame { p, h } (checked with parkKeyOf), and `h` holds at most DECOR_HIDDEN_CAP = 200 entries."
  - "Each room accepts at most one decor document per CARAVAN_DOC_MIN_MS = 1000. The fan-out is charged to the room's act bytes. The stored document expires after PARK_TTL_MS = 72 h."
  - "`hv.we`: absent means the owner only, 1 party, 2 anyone, 3 guild. With guild, `wg` carries the guild tag."
traps:
  - "The relay gates joins only for 'owned:' rooms. Any client can join a caravan:<k> room, so 'Only me' is enforced on the client only."
  - "Visitors see the decor as the owner last published it online."
  - "Check relaySupportsCaravan before sending the frame, because an older relay closes the socket on it."
dfu: []
tags:
  - caravan
  - interior
  - paint
  - visits
  - relay
  - decor
---

# Caravan Room, Wagon Paint, and Online Caravan Visits

A parked Caravan provides an enterable room (`CARAVAN_ROOM_MODEL_ID` `-38181` in `CARAVAN_BLOCK` `'CARAVAN [WAGONS2]'`), four-channel paint, and online visits (`src/travel/caravanRoom.js`, `src/travel/caravanRoomHost.js`, `src/world/caravanRoomModel.js`, `src/scenes/worldModes.js`).

- **Room heading, exit, and paint (`src/world/caravanRoomModel.js`, `src/travel/caravanRoom.js`, `src/travel/wagonLooks.js`):** `turnCaravanScene` rotates the interior (`CARAVAN_STANDS_TURN` `15`) to the parked heading, and `caravanStepOut` places the player behind the rear door or on the nearest open ground if blocked. `wagonLook` (`{ o, w, f, c }` for outside, walls, floor, and ceiling) offers `LOOK_COUNT` (`6`) choices per channel, encoded on the wire as `wl = o + 6w + 36f + 216c` (`WAGON_LOOK_CODE_MAX` `1295`). Art records use `LOOK_RECORD_STRIDE` (`100`) with `CARAVAN_LIVE_CHOICE` (`9`) for the live room.
- **Relay rooms and visit permissions (`src/travel/caravanVisit.js`, `src/net/caravanVisitLink.js`, `src/net/privateInterior.js`, `src/net/wire.js`, `server/src/message/frames/caravan.js`):** Each caravan maps to relay room `caravan:<k>` via `caravanRoomOf` using the owner park key (`parkKeyOf`). Only the owner publishes the `caravan` decor frame `{ p, h }` (`h` capped at `DECOR_HIDDEN_CAP` `200`, throttled to one document per `CARAVAN_DOC_MIN_MS` `1000`, charged to room act bytes, and expiring after `PARK_TTL_MS` `72` h). Callers check `relaySupportsCaravan` (`CARAVAN_RELAY_MIN` in `src/net/wire.js` for `wk`, `wh`, `wl`, `we`, and `wg`). Park field `hv.we` sets visit scope (absent for owner only, `1` party, `2` anyone, `3` guild with `wg`), though the relay gates only `'owned:'` joins so `'Only me'` is client-enforced.
