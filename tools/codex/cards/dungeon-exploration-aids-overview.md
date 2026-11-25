---
slug: dungeon-exploration-aids-overview
title: "Dungeon Exploration Aids: Sense, Echoes, Way Out, Guidance, and Sizing"
domain: world
kind: overview
parent: null
files:
  - src/world/dungeonSense.js
  - src/world/dungeonEcho.js
  - src/world/actionSystem.js
  - src/render/nodeGlow.js
  - src/render/nodeGlint.js
  - src/scenes/dungeonContext.js
  - src/scenes/dungeon.js
  - src/scenes/shared.js
  - src/systems/quest/questGuidance.js
  - src/scenes/worldModes.js
  - src/ui/automapSheet.js
  - src/ui/inkAutomap.js
  - src/ui/questMarks.js
  - src/ui/worldTooltips.js
routes: []
tables: []
replacesBible:
  - `01-Overview/audits/Audit-Delve.md`
  - `03-World/Delve-Arc.md`
related:
  - dungeon-trail-and-way-out
  - dungeon-sizing-and-online-quest-relay
  - held-map-overview
  - professions-gathering-nodes-and-motherlodes
invariants:
  - "`SENSE_MAX` is `NODE_GLOW_MAX` (`16`, `src/render/nodeGlow.js`): a sense pulse lights at most the budget of the glow pass, nearest first. `src/render/nodeGlint.js` throws if `GLINT_MAX` drifts from `NODE_GLOW_MAX`."
  - "`ECHO_CHAIN_MAX` is `PLAY_DEPTH_MAX` (`32`), exported from `src/world/actionSystem.js`. The echo chain walk and `IsPlaying` share one depth bound."
  - "`src/world/dungeonSense.js` reads trigger admission from `TRIGGER_GATE` in `src/world/actionSystem.js` rather than keeping a duplicate table."
  - "Each sense kind (`use`, `door`, `find`, and `secret`) has a distinct `SENSE_FORM` (`halo`, `shimmer`, and `motes` weights) as well as a `SENSE_CSS` color, so protan and deutan players can tell kinds apart without color."
  - "Interaction-mode presses ignore key repeats (where `e.repeat` is `false`, dungeon audit B6), so a held key does not re-ask the mode."
  - "A quickload in the same dungeon calls `forgetDelveRun()`, clearing echoes, sense glow, and the way-out field."
  - "Guidance tiers (`'journal'`, `'town'`, and `'exact'`) are a preference on the enhanced skin. `'journal'` is the default, and Clairvoyance forces `'exact'` while active."
traps:
  - "Do not hardcode `16` or `32` in the sense and echo modules. Import `NODE_GLOW_MAX` and `PLAY_DEPTH_MAX`."
  - "On the solid map, marks from other storeys carry a middle-dot `<floor label>` suffix (dungeon audit D1). Do not drop `floorOf` when adding mark kinds."
  - "A quest that is complete, tombstoned, or shelved draws no Exact-tier marks (`questEnded`)."
  - "World tooltips query action targets before door targets so secret walls are not labeled Door (`src/ui/worldTooltips.js`)."
dfu: []
tags:
  - dungeon
  - dungeon-audit
  - sense
  - echo
  - quest-guidance
  - accessibility
  - SENSE1
  - ECHO1
  - GUIDE8
---

Dungeon exploration aids cover five audit lenses (A: fidelity, B: runtime wiring, C: modules and tests, D: map, HUD, and plaque, and E: online, party, saves, and quests), pairing sense pulses and action echoes with trail pathfinding (`dungeon-trail-and-way-out`) and sizing (`dungeon-sizing-and-online-quest-relay`).

## Sense, Echoes, and Reset

- **Sense (`SENSE1`, `src/world/dungeonSense.js`):** Scans within `SENSE_M` (`8` m, `SENSE_HOLD_S` `6` s, `SENSE_FADE_S` `1.5` s) via `TRIGGER_GATE` (`src/world/actionSystem.js`), capping targets at `SENSE_MAX` (`NODE_GLOW_MAX` `16` in `src/render/nodeGlow.js`; `GLINT_MAX` in `src/render/nodeGlint.js` asserts parity; see `professions-gathering-nodes-and-motherlodes`). `SENSE_FORM` sets `[halo, shimmer, motes]` weights alongside `SENSE_CSS`: `use` `[1,1,0]`, `door` `[1.2,0,0]`, `find` `[0.4,0,1]`, and `secret` `[0.25,1.6,0.35]`. Under `DETECT-FINDS` (`src/scenes/shared.js`), a find on a searched object counts as a loot container for Detect.
- **Echoes (`ECHO1`, `src/world/dungeonEcho.js`):** Walks chains up to `ECHO_CHAIN_MAX` (`PLAY_DEPTH_MAX` `32` in `src/world/actionSystem.js`), omits words inside `ECHO_NEAR_M` (`3` m), tracks `ECHO_MAP_MAX` (`8`) unfound echoes, and checks gaze over `ECHO_LOOK_S` (`0.25` s).
- **Input and Quickload (`src/scenes/dungeon.js`, `src/scenes/dungeonContext.js`):** Mode presses check `!e.repeat` (also in `src/talk/townTalk.js`). Same-dungeon quickloads call `forgetDelveRun()` to clear echoes, sense glow, and the way-out field.

## Quest Guidance and Map Marks

`guidanceTier()` (`src/systems/quest/questGuidance.js`) reads `GUIDANCE_PREF` (`'quest-guidance'`, `GUIDANCE_TIERS` `['journal', 'town', 'exact']`) on the enhanced skin (`src/scenes/worldModes.js`) and forces `'exact'` under Clairvoyance. When `!questEnded`, `townQuestBuildings` rings buildings in `'town'`, while `'exact'` uses `questCompassPick` and `interiorQuestMarksHere`. Maps (`src/ui/automapSheet.js`, `src/ui/inkAutomap.js`, `src/ui/questMarks.js`, `held-map-overview`) use `QUEST_MARK_LIFT` (`17`), ink names with `PLAN_PEN.note` (`10.5:1` contrast), and append `<floor label>` via `floorOf`.
