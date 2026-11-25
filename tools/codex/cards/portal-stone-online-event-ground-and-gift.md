---
slug: "portal-stone-online-event-ground-and-gift"
title: "Portal Stone Online Sync, Event-Gate Ground, and Login Gift"
domain: "multiplayer"
kind: "subcard"
parent: "portal-stone-overview"
files:
  - "src/travel/portalGates.js"
  - "src/travel/portalStone.js"
  - "src/travel/travelMapWorld.js"
  - "src/characters/exteriorFoes.js"
  - "src/maps/mapDirectory.js"
  - "src/worldEvents/eventGround.js"
  - "src/worldEvents/gatePool.js"
  - "src/systems/eliteGates/egArch.js"
  - "src/systems/eliteGates/egCall.js"
  - "src/systems/starfall/starfallHost.js"
  - "src/travel/horseCartPool.js"
  - "src/worldEvents/gateSpoils.js"
  - "src/saves/save.js"
  - "src/scenes/frame/inputFrame.js"
  - "src/scenes/world.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Portal-Stone.md"
related:
  - "portal-stone-overview"
  - "world-events-and-signed-receipts"
  - "room-engine-and-hub-sharding"
invariants:
  - "The full enemies frame of the opener carries `pg` (`portalWire`: `i` id, `p` world position, `d` destination pixel, `r` ms left) only within `PORTAL_SAY_REACH = 32` m; the relay reads none of it."
  - "`applyOwner` accepts a peer record only if `validPortalRecord` passes, the destination pixel resolves via `locationSummaryAt` (`src/maps/mapDirectory.js`), and the portal stands within `PORTAL_PEER_REACH = 40` m of the opener."
  - "One portal per opener: a different id while one stands is refused; a repeated id can only shorten `until`, never extend it. Peer copies run out on their own timer."
  - "A peer portal snaps to local ground found within `PORTAL_REGROUND = 4` m of the reported height."
  - "No Portal Stone portal opens, is believed, or survives within `EVENT_GROUND_M = 40` m of an event gate registered via `setEventGround` (`'gate'`, `'arch'`, `'star'`); `portalStonePlace` returns `{ refused: 'event' }` with nothing spent."
traps:
  - "The Elite Breach call pool in `egCall.js` passes `eventGround: false`, since its portal is the way into the event."
  - "Another player's deployed wagon inside event ground is hidden and unclickable (`offGround` in `src/travel/horseCartPool.js`)."
  - "An already-open portal inside newly risen event ground is dropped during `tick` and takes nobody."
dfu: []
tags:
  - "portal-stone"
  - "multiplayer"
  - "event-gate"
  - "gift"
  - "wire"
---

# Portal Stone Online Sync, Event-Gate Ground, and Login Gift

In multiplayer (`src/travel/portalGates.js` and `src/characters/exteriorFoes.js`), the opener attaches a `pg` record (`portalWire` containing id `i`, world position `p`, destination pixel `d`, and remaining milliseconds `r`) to full enemies frames sent to peers within `PORTAL_SAY_REACH = 32` m, while the relay remains oblivious. On receive, `applyOwner` accepts the record only if `validPortalRecord` passes, `locationSummaryAt` (`src/maps/mapDirectory.js`) resolves the destination pixel, and the gate lies within `PORTAL_PEER_REACH = 40` m of the opener. Each opener may hold one active portal: a new id while one stands is rejected, a repeated id can only shorten `until`, and accepted peer portals snap to local terrain within `PORTAL_REGROUND = 4` m.

Event exclusion zones in `src/worldEvents/eventGround.js` block portals within `EVENT_GROUND_M = 40` m of active `'gate'`, `'arch'`, or `'star'` anchors registered via `setEventGround`: `portalStonePlace` returns `{ refused: 'event' }` without spending a stone, and `tick` drops any standing portal caught inside newly risen event ground. By contrast, `src/systems/eliteGates/egCall.js` passes `eventGround: false` so players can enter Elite Breach calls, while remote deployed wagons inside event ground become hidden and unclickable via `offGround` (`src/travel/horseCartPool.js`).

For existing saves, `givePortalGift` in `restorePlayer` (`src/saves/save.js`) grants `PORTAL_GIFT_STONES = 10` stones once when `entity.portalGift < PORTAL_GIFT` (`1`), whereas `snapshotPlayer` defaults `portalGift` to `PORTAL_GIFT` on new characters and `takePortalGiftNotice` displays `PORTAL_TEXT.gift` in `src/scenes/frame/inputFrame.js`.
