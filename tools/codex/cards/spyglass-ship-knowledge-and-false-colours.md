---
slug: spyglass-ship-knowledge-and-false-colours
title: "Spyglass Reconnaissance, Ship Knowledge Levels, and False Colors"
domain: world
kind: subcard
parent: captains-sea-overview
files:
  - src/systems/naval/shipKnowledge.js
  - src/ui/spyglassView.js
  - src/ui/gamepadInput.js
  - src/systems/naval/navalHost.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "03-World/Captains-Sea.md"
related:
  - captains-sea-overview
  - naval-shot-kinds-and-combat-feedback
  - ship-livery-flags-and-plaques
invariants:
  - "`KNOW` defines `{ hull: 0, colours: 1, studied: 2 }`; `knowledgeOf` is monotonic and jumps straight to `KNOW.studied` once a vessel is `struck` (sunk, boarded, or taken as a prize)."
  - "A ship reaches `KNOW.colours` via the naked eye within `NAKED_EYE_M` (`220` meters, or `NAKED_EYE_DARK_M = 100` at night), a Lookout within `LOOKOUT_ID_M` (`320` meters), holding the spyglass for `GLASS_STUDY_S` (`0.6` seconds) within `GLASS_FAR_M` (`1800` meters), or firing its guns."
  - "A ship reaches `KNOW.studied` by holding the spyglass on target for `GLASS_STUDY_NEAR_S` (`1.4` seconds) within `GLASS_NEAR_M` (`900` meters) or when `struck`."
  - "`targetCard` returns no target card below `KNOW.colours`, so an unidentified hull cannot be locked."
  - "`glassNear` clamps the camera near plane to `[GLASS_NEAR_MIN, GLASS_NEAR_MAX]` (`[0.2, 120]`), pushing past `ownExtent + GLASS_CLEAR_PAD` while remaining within `GLASS_SEA_SHARE` of camera height above water so the lens never clips the sea."
traps:
  - "A disguised pirate (`falseFlagOf`, rendered as `merchantOfHull`) displays false colors until studied or until it engages; on engagement, `knowStep` sets `e.blackFlag` once and announces the reveal only if the ship is within player sight."
dfu: []
tags:
  - spyglass
  - knowledge
  - false-colors
  - camera
---

# Spyglass Reconnaissance, Ship Knowledge Levels, and False Colors

`src/systems/naval/shipKnowledge.js` and `src/ui/spyglassView.js` govern optical zoom, near-plane sea clearance, progressive target identification, and pirate false-color disguises, wired through `src/systems/naval/navalHost.js` and `src/scenes/world.js`.

- **Knowledge tiers (`shipKnowledge.js`, `navalHost.js`):** `KNOW` progresses monotonically through `hull` (`0`), `colours` (`1`), and `studied` (`2`). A contact reaches `KNOW.colours` within `NAKED_EYE_M` (`220` meters, or `NAKED_EYE_DARK_M = 100` at night), within `LOOKOUT_ID_M` (`320` meters, scaled by the Lookout post in `deckEye` and `hailSails`), after `GLASS_STUDY_S` (`0.6` seconds) under the spyglass within `GLASS_FAR_M` (`1800` meters), or by opening fire. Holding the glass for `GLASS_STUDY_NEAR_S` (`1.4` seconds) within `GLASS_NEAR_M` (`900` meters) reaches `KNOW.studied` and emits a `'study'` ledger event for survey contracts; any `struck` ship also jumps to `KNOW.studied`. Below `KNOW.colours`, `targetCard` hides targeting details.
- **False colors (`shipKnowledge.js`):** Pirates spawned with `falseFlagOf` appear as `merchantOfHull` while `disguisedOf(e)` holds (`!e.blackFlag && knownOf(e) < KNOW.studied && !!falseFlagFor(e)`). Studying the vessel with the glass or watching `knowStep` set `e.blackFlag` when the pirate engages strips the disguise.
- **Lens optics and camera (`spyglassView.js`, `world.js`, `gamepadInput.js`):** `glassFov(fov, lens)` narrows field of view, `glassLookScale` scales look sensitivity by `1 / lens`, and `nextGlassZoom` cycles `2x -> 4x -> 8x -> 2x` (bound to `GLASS_PAD_ZOOM = 'JoystickButton9'`). `glassHolds` tests whether aim stays within the target angular extent or reticle, `glassCard` formats the lens overlay, and `glassNear` advances the near plane past `ownExtent + GLASS_CLEAR_PAD` without exceeding `GLASS_SEA_SHARE` of `glassEyeOverSea`.
