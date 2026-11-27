---
slug: home-decorator-lists-writes-and-doorways
title: "Home Decorator Room Lists, Piece Writes, Names, and Doorway Doors"
domain: world
kind: subcard
parent: homes-camps-guilds-and-territories
files:
  - src/homes/decorRoom.js
  - src/homes/decorTool.js
  - src/homes/decorCatalogue.js
  - src/homes/decorMods.js
  - src/homes/decorDoorways.js
  - src/scenes/worldModes.js
routes: []
tables: []
related:
  - decor-built-in-hiding-wall-mounts-and-gold-drops
  - yard-decor-culling-and-shadow-cubes
  - decor-grants-wait-and-shared-chest-open
invariants:
  - "`askDecorList` shows an online room only from an answer whose `data.pieces` is a list; a refusal or no answer shows nothing and asks again with a doubling wait from `DECOR_LIST_RETRY_MS` up to `DECOR_LIST_RETRY_MAX_MS`, because a room shown empty would overwrite the service list on the first removal."
  - "`pieceWrite` starts each write of a placed piece only after the previous write of that piece settles, because every change sends the whole piece record and two writes in flight could land in either order and undo each other."
  - "`decorCatalogue` numbers a shared name within each `DECOR_FROM` place after every earlier place's pieces, and `addDecorMods` adds every mod piece whichever mods are switched on (`decorRoomEntries` filters them per offer), so no existing name changes when a later place is added or a mod is switched."
  - "What storage pieces hold (`itemsSnapshot`) and the items the owner placed from their pack (`ownSnapshot`) always belong to the save, even in an online home whose pieces belong to the account service; they are restored and written back with the room scene."
traps:
  - "`decorDoorFit` returns `yaw` in degrees as the piece's `rot[0]` turn, using the `trs` convention (`world = Ry(yaw) * local`: local Z goes to `(sin, 0, cos)`, local X to `(cos, 0, -sin)`)."
  - "The doorway search looks for the far face of the wall back from past the thickest wall (`DOORWAY_DEPTH_MAX`), because a floor in the doorway may sit inside the wall thickness; the fitted door hangs in the middle of the wall."
dfu: []
tags:
  - homes
  - decor
  - online
  - doors
---

# Home Decorator Room Lists, Piece Writes, Names, and Doorway Doors

The home decorator places, moves, and removes pieces in a player house, ship, or online home. `src/homes/decorRoom.js` shows the placed pieces in the room, `src/homes/decorTool.js` handles the player's edits and sends them to the account service, and `src/homes/decorCatalogue.js` builds the list of pieces a player can place.

An online home's piece list belongs to the account service, so the room shows nothing until the service returns a real list. Writes for one piece run one after another. Catalog names stay stable as new sources and mods are added.

`src/homes/decorDoorways.js` finds doorways in a room's walls by ray casts and fits a placed door model to the opening.
