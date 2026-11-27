---
slug: "relay-stand-in-whole-health-dot-ticks-and-chain-numbers"
title: "Relay Stand-In Whole Health, DoT Tick Guards, and Chain Follow-Up Numbers"
domain: "combat"
kind: "subcard"
parent: "enchantment-side-once-duel-vitality-and-questor-notices-overview"
files:
  - "src/world/gateBoss.js"
  - "src/net/gateBrain.js"
  - "src/worldEvents/standInSpell.js"
  - "src/worldEvents/gateCourt.js"
  - "src/scenes/dungeonContext.js"
  - "src/scenes/world.js"
  - "src/systems/eliteGates/egFight.js"
  - "src/net/eliteGates/egBrain.js"
  - "src/ui/eliteGates/egHud.js"
  - "src/items/lootPowers.js"
  - "src/items/artifactEffects.js"
  - "src/net/wire.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19f.md"
related:
  - "enchantment-side-once-duel-vitality-and-questor-notices-overview"
  - "breach-boss-brain-and-courts"
  - "elite-breach-landed-word-damage-numbers"
  - "boss-traits-carriers-wire-and-hud"
invariants:
  - "A relay stand-in's maxHealth and health are STAND_IN_WHOLE = HIT_CAP_X * dpsRef(LV_MAX) * EG_BUCKET_X_MAX (12 * 65 * 1.25 = 975), a count every wire validator accepts (GATE_DMG_WIRE_MAX = 100000); never 1e9."
  - "Shown numbers on a stand-in are capped by standInBlowCap and standInShown, never past STAND_IN_WHOLE."
  - "Elite Breach lasting-harm ticks call hostHit with tick = true: no Momentum, no Arcane Echo."
traps:
  - "Mehrunes Razor returns `null` on `spareGear` stand-ins (`src/items/artifactEffects.js`) because Strikes weapon wear cannot ride relay stand-ins."
  - "Always compute `STAND_IN_WHOLE` from `HIT_CAP_X * dpsRef(LV_MAX) * EG_BUCKET_X_MAX` rather than hardcoding `975`."
  - "`STAND_IN_WHOLE` (975) must stay under the smallest wire damage ceiling, the 10,000 that `validArenaIn` allows, or a Disintegrate on a stand-in is refused by that relay."
dfu:
  - "Assets/Scripts/Game/MagicAndEffects/Effects/Destruction/Disintegrate.cs"
tags:
  - "relay"
  - "stand-in"
  - "spells"
  - "dot"
  - "elite-breach"
  - "floating-numbers"
---

# Relay Stand-In Whole Health, DoT Tick Guards, and Chain Follow-Up Numbers

Relay stand-in health scaling, continuous damage ticks, gauntlet silence plates, and chained follow-up damage numbers span `src/world/gateBoss.js`, `src/worldEvents/standInSpell.js`, `src/systems/eliteGates/egFight.js`, and `src/items/lootPowers.js`.

- **Stand-in whole health and blow caps:** Relay stand-ins in `src/world/gateBoss.js` and `src/net/gateBrain.js` derive `maxHealth` and `health` from `STAND_IN_WHOLE = HIT_CAP_X * dpsRef(LV_MAX) * EG_BUCKET_X_MAX` (`12 * 65 * 1.25 = 975`) rather than `1e9`, keeping whole-health effects such as Disintegrate within `GATE_DMG_WIRE_MAX` (`100000` in `src/net/wire.js`). `src/worldEvents/standInSpell.js` exports `createStandInSpell`, `createStandInRounds`, `createSerpentSpell`, `carriedOnStandIn`, `countOnStandIn`, and `standInShown`, clamping displayed hit numbers via `standInBlowCap` and `standInShown`. On `spareGear` stand-ins, Mehrunes Razor (`src/items/artifactEffects.js`) returns `null` because weapon wear cannot ride relay stand-ins.
- **DoT tick guards and gauntlet plates:** Continuous damage on boss stand-ins ticks on `COURT_ROUND_MS` (`src/worldEvents/gateCourt.js`, `src/scenes/dungeonContext.js`, `src/scenes/world.js`). In `src/systems/eliteGates/egFight.js`, lasting-harm ticks invoke `hostHit` with `tick = true` so ticks never trigger Momentum or Arcane Echo. For gauntlet silence plates, `src/net/eliteGates/egBrain.js` populates `P.silenced` per plate, `egFight.js` renders plates via `gauntletPlates` and `egPlateY`, and `src/ui/eliteGates/egHud.js` describes both silence sources using `EG_SILENCE_MS = 3000`.
- **Chain follow-up numbers:** In `src/items/lootPowers.js`, `reachOn` routes Chain Lightning, Earthshaker, and Dragonfire secondary reaches through `showFollowUp` to raise floating damage numbers.
