---
slug: weapon-techniques-overview
title: "Weapon Techniques: Overview"
domain: combat
kind: overview
parent: null
files:
  - src/combat/technique/techniqueRoster.js
  - src/combat/techniques.js
  - src/combat/technique/techniqueBlow.js
  - src/combat/technique/techniqueFx.js
  - src/items/lootRarity.js
  - src/combat/weaponRig.js
  - src/ui/inputActions.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Techniques.md"
related:
  - weapon-technique-roster-and-affix-line
  - weapon-technique-runner-and-refusals
  - weapon-technique-blow-shafts-and-feel
  - combat-formulas-and-power-ceiling
  - four-hosts-and-modal-frame
invariants:
  - "A technique is one affix line `{ id: 'technique', param, value }` on a weapon (or Gauntlets for bare hands); the `WeaponTechnique` action (default Mouse3, hold to aim) fires it."
  - "Every technique blow is a multiplier on DFU `CalculateAttackDamage`, never flat damage; a miss stays a miss."
  - "One runner (`stepTechnique` in `src/combat/techniques.js`) holds the player's single cooldown, aim, and flight state, stepped by whichever host weapon rig owns the frame."
  - "Techniques never strike player bodies and are refused in duels (`sigilDueling()`)."
traps:
  - "Code identifiers such as `foeUnderLook` keep the legacy word; prose here says enemy."
  - "Technique lines sleep when Loot rarity is off; a martial path signature (`src/characters/martialPaths.js`) may answer the key instead."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
tags:
  - techniques
  - combat
  - affix
  - tech1
---

Weapon techniques are active combat skills rolled as a single `{ id: 'technique', param, value }` affix line on weapons and Gauntlets, or granted as a martial path signature in `src/characters/martialPaths.js`. Holding and releasing the `WeaponTechnique` input action (`src/ui/inputActions.js`, default `Mouse3`) aims and fires the equipped technique.

## Roster and Mechanics

`src/combat/technique/techniqueRoster.js` defines `TECHNIQUES`, a shared leaf imported by both loot generation (`src/items/lootRarity.js`) and combat execution. The roster covers twelve techniques across six weapon families (`archery`, `longBlade`, `shortBlade`, `axe`, `blunt`, and `handToHand`) and five active mechanics (`rain`, `pierce`, `leap`, `dash`, and `swing`).

## Runner and Damage Scaling

A single runtime runner (`stepTechnique` in `src/combat/techniques.js`) tracks the player's cooldown, aim preview, and airborne flight state across scene hosts, stepped each frame by the active weapon rig (`src/combat/weaponRig.js`). Every technique blow in `src/combat/technique/techniqueBlow.js` scales the underlying `CalculateAttackDamage` roll by a multiplier rather than adding flat damage, so missed or blocked strikes still deal zero damage. For base hit and damage rolls, see `combat-formulas-and-power-ceiling`.

Techniques target only enemies, never strike player bodies, and are refused while dueling (`sigilDueling()`). Multiplayer replication of volley arrows and ground telegraph marks is not implemented.

## Subcards

- `weapon-technique-roster-and-affix-line`: loot roll rates, percentage bands, family mapping, and item validation rules.
- `weapon-technique-runner-and-refusals`: refusal order, fatigue threshold, flight speed caps, and motor state clearing.
- `weapon-technique-blow-shafts-and-feel`: blow multipliers, volley and piercing shafts, telegraph marks, and camera springs.
