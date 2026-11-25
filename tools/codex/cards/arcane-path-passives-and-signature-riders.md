---
slug: arcane-path-passives-and-signature-riders
title: "Arcane Path Passives, Signature Records, and Riders"
domain: magic
kind: subcard
parent: arcane-specializations-overview
files:
  - src/characters/arcanePowers.js
  - src/characters/arcanePaths.js
  - src/magic/signatureSpells.js
  - src/magic/spellMaker.js
  - src/magic/hostMagic.js
  - src/worldEvents/standInSpell.js
  - src/characters/playerEntity.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Arcane-Specialisations.md"
related:
  - arcane-specializations-overview
  - arcane-school-potency-past-100
  - magic-bundles-and-reflection-quirks
  - loot-arc-legendary-powers-and-proc-caps
invariants:
  - "Signature spell indices are `SIGNATURE_INDEX_BASE - n` with `SIGNATURE_INDEX_BASE = -46100`, giving the pinned band -46101..-46115, below `READY_MADE_INDEX_CEILING = -45000` (src/magic/spellMaker.js); bought copies persist the index, so the band never moves."
  - "`signatureOffers(entity)` returns only the held path record (`pathHeld`), and the Buy Spells shelf in src/scenes/worldModes.js appends it for the local player alone."
  - "All powers register at import under `ARCANE_POWERS = 'arcanePowers'` through named seams: spell power, spell pierce, cast cost, cast speed, entity fold, player damage mod, `registerPlayerBlowEvasion` (Foresight, before any modifier), hurt listener, magic round, kill listener, absorption chance, and `registerSpellLandedListener` (`pathLanded`)."
  - "`pathLanded` ignores reflected or `warded` landings, fires a rider only for `isSignatureSpell(spell) && spell.path === id`, and never against a target with `isPlayer` (duel opponents and party mates get the plain bundle)."
traps:
  - "Rider magnitudes read `took` (what the target could lose, never overkill), falling back to `r.damage`; Unravel and Beguile refunds read `cast.cost`, the magicka actually paid."
  - "Conflux adds one stack per cast token; a landing with `cast === null` (a Cast When Strikes proc) counts as its own cast and does stack."
  - "Slip Away and Absolution fire only when a hurt crosses the threshold (`before >= line && after < line`) and never when `saved` (a death save) is set."
  - "Rider self-bundles go through `castOnPlayer(bundle, { power: true })`; effects.js `powerCast` merges keep the larger Shield pool or ward chance."
dfu:
  - EntityEffectManager.cs
  - CastWhenStrikes.cs
tags:
  - arcane-paths
  - signature-spells
  - riders
  - passives
  - buy-spells
---

# Arcane Path Passives, Signature Records, and Riders

`src/magic/signatureSpells.js` and `src/characters/arcanePowers.js` wire the fifteen signature spell records, their Buy Spells shelf integration, and the awake passives and landing riders.

- **Pinned signature spell indices and offers:** Signature records use `SIGNATURE_INDEX_BASE - n` (`SIGNATURE_INDEX_BASE = -46100`), occupying `-46101..-46115` below `READY_MADE_INDEX_CEILING = -45000` (`src/magic/spellMaker.js`). `signatureOffers(entity)` returns the record for `pathHeld`, and `src/scenes/worldModes.js` appends it to the Buy Spells shelf for the local player.
- **Registered passive and rider seams:** At import, `src/characters/arcanePowers.js` registers hooks under `ARCANE_POWERS = 'arcanePowers'` across `src/magic/hostMagic.js`, `src/worldEvents/standInSpell.js`, and `src/characters/playerEntity.js`: spell power, spell pierce, cast cost, cast speed, entity fold, player damage modifier, `registerPlayerBlowEvasion` (Foresight, before damage modifiers), hurt listener, magic round, kill listener, absorption chance, and `registerSpellLandedListener` (`pathLanded`). Kill passives skip `KNIGHT_CITY_WATCH` and `PlayerAlly` targets (`neverCounts`).
- **Thresholds, cooldowns, and splash riders:** Conflux grants one stack per cast token, counting `cast === null` (Cast When Strikes procs) as separate casts. Slip Away (120 s `slipAway.recover`) and Absolution (180 s `absolution.recover`) trigger only when a single hit crosses the health line (`before >= line && after < line`) without `saved` set; reloads reset cooldowns to ready. `pathLanded` ignores reflected, `warded`, or `isPlayer`-target hits, scales damage riders from `took` (falling back to `r.damage`), refunds magicka from `cast.cost` (Unravel and Beguile), applies self-bundles via `castOnPlayer(bundle, { power: true })`, and splashes Chain Lightning (2 enemies within 8 m at 1/2 damage) and Rift Lance (4 m at 1/3 damage) scaled by `elementShare`.
