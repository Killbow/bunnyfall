---
slug: "gate-beacon-seams-and-morrowind-hand-overview"
title: "Unbuilt Gate Beacons, Overweight Swim Exit, and Dungeon Mesh Seams"
domain: "world"
kind: "overview"
parent: null
files:
  - "src/systems/quest/questShare.js"
  - "src/ui/pauseDoor.js"
  - "src/systems/quest/onlineGuard.js"
  - "src/world/lampKeeper.js"
  - "src/combat/weaponRig.js"
  - "src/combat/fpArm.js"
  - "src/underwater/deepWatersPlayer.js"
  - "src/net/peerRiders.js"
  - "src/worldEvents/gatePool.js"
  - "src/worldEvents/gateSite.js"
  - "src/render/gatePass.js"
  - "src/world/gatesWorld.js"
  - "src/world/arch3dSeams.js"
  - "src/scenes/dataPipeline.js"
  - "src/homes/decorBase.js"
routes: []
tables:
  - "home_hidden"
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-26.md"
related:
  - "quest-share-shape-pause-hooks-and-rest-sync"
  - "decor-built-in-hiding-wall-mounts-and-gold-drops"
  - "balance-arc-lycanthropy-and-vampirism"
  - "deep-waters-swim-driver-and-forge"
  - "online-coop-death-rest-and-room-lanes"
invariants:
  - "On an unbuilt terrain pixel, an Oblivion gate renders only its beacon (`beaconOnly` in `src/render/gatePass.js`, grounded by `gateGroundAt` in `src/world/gatesWorld.js`) with no collider, step, or countdown."
  - "`src/worldEvents/gateSite.js` scans only base game location rows so clients roll identical gate coordinates even when town or location mods are loaded."
  - "`src/underwater/deepWatersPlayer.js` checks `OVER_ENCUMBERED_LIMIT` so an overweight swimmer dragged below the surface can still exit onto shore."
  - "`followHeldHand` (`src/combat/weaponRig.js`, `src/combat/playerWeapon.js`) keeps the 3D arm on a held weapon rather than an empty hand, `setStandIn` (`src/combat/fpArm.js`, `src/player/mwView.js`) steps the 3D body aside during beast form, and `patchSeams` (`src/world/arch3dSeams.js`) stitches ARCH3D slit vertices in `src/scenes/dataPipeline.js`."
traps:
  - "Vampire stat penalties (`vampireStatMod` in `src/afflictions/vampirism.js`) apply `-20` only in direct sunlight (`playerInSunlight`), not by clock hour alone."
  - "Gate site selection must never read modded location records or clients diverge on gate placement."
  - "A `SEAM_RULES` change moves collider and nav-mesh positions; bump `NAV_BAKE_VERSION` in `src/ai/navClient.js` with it."
dfu: []
tags:
  - "oblivion-gate"
  - "morrowind-rig"
  - "werewolf"
  - "swimming"
  - "dungeon-seams"
---

# Unbuilt Gate Beacons, Overweight Swim Exit, and Dungeon Mesh Seams

In `src/worldEvents/gatePool.js`, `src/worldEvents/gateSite.js`, `src/render/gatePass.js`, and `src/world/gatesWorld.js`, an Oblivion gate on an unbuilt terrain pixel renders only its beacon (`beaconOnly`, grounded by `gateGroundAt`) without a collider, step, or countdown. Site selection scans only base-game location rows; reading modded records would cause clients to roll divergent gate coordinates.

In `src/underwater/deepWatersPlayer.js`, shore exit evaluates `OVER_ENCUMBERED_LIMIT` so an overweight swimmer dragged below the surface can climb onto shore. In `src/combat/weaponRig.js`, `src/combat/playerWeapon.js`, `src/combat/fpArm.js`, and `src/player/mwView.js`, `followHeldHand` keeps the 3D arm attached to a held weapon rather than an empty hand, `setStandIn` steps the 3D body aside during beast form, and `bowSound` is shared with `src/combat/weaponWidget.js` so each shot plays once.

In `src/world/arch3dSeams.js` and `src/scenes/dataPipeline.js`, `patchSeams` stitches ARCH3D slit vertices at load time. In `src/world/lampKeeper.js`, `standPerson` decodes variant shopkeeper textures before upload so shopkeepers never fall back to the lamp-post sprite. In `src/afflictions/vampirism.js`, `vampireStatMod` applies `-20` only in direct sunlight (`playerInSunlight`) rather than by clock hour alone.
