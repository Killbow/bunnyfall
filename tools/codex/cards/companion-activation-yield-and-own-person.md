---
slug: companion-activation-yield-and-own-person
title: "Companion Activation Yield and Own-Person Seed"
domain: gameplay
kind: subcard
parent: salvage-cargo-companion-yield-and-seat-overview
files:
  - src/player/activate.js
  - src/player/activationRace.js
  - src/player/mobileEnemyActivate.js
  - src/scenes/worldModes.js
  - src/characters/foeBodies.js
  - src/systems/naval/crewAshore.js
  - src/revenants/revenant.js
  - src/revenants/revenantCompanions.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12d.md"
related:
  - salvage-cargo-companion-yield-and-seat-overview
  - naval-living-crew-companions-and-repairs
  - sworn-companion-errands-and-clock
  - revenants-lifecycle-overview
invariants:
  - "`allyYields(foe, behind) = isCompanion(foe) && answersPress(behind)`; answersPress requires a firm pick (not yieldsRay) with distance <= its own reach."
  - "The press (tryMobileEnemyActivate, behind = the ladder's _pick) and the plaque (raceWinner over the ally-marked hit) ask the same answersPress, in every mode."
  - "`foeSeed` reads ownPerson before the stand's seed, so a companion or revenant is drawn as one person everywhere and on the wire."
traps:
  - "Yielding to anything on the ray made the companion unreachable indoors and answered 'You are too far away' from a distant shelf."
  - "Only companions (when `f.companion` is non-null) carry the ally mark; hostile enemies never yield."
  - "Each host calls `tryMobileEnemyActivate` once, at the ray's reach, with `nearerThan` set to the ladder's winning distance. A second call or a missing `nearerThan` lets a distant enemy take the click from a nearer door."
dfu: []
tags:
  - activation
  - companion
  - ally-yields
  - ally-race
  - revenant
  - visual-seed
---

# Companion Activation Yield and Own-Person Seed

Companion click pass-through and visual identity seeds live in `src/player/activate.js`, `src/player/activationRace.js`, `src/player/mobileEnemyActivate.js`, `src/scenes/worldModes.js`, `src/characters/foeBodies.js`, `src/systems/naval/crewAshore.js`, `src/revenants/revenant.js`, and `src/revenants/revenantCompanions.js`.

- **Companion Yield (`ALLY-YIELDS` and `ALLY-RACE`):** `liveFoeTargets` tags companion bodies (where `f.companion` is non-null) with `ally: true`, and `peacefulFoePass` preserves that mark while hostile enemies never yield. Under `allyYields(foe, behind) = isCompanion(foe) && answersPress(behind)`, a companion yields to a target behind it only when `answersPress(behind)` confirms a firm pick (not `yieldsRay`) within that target's own activation reach. Both the interaction press (`tryMobileEnemyActivate`, where `behind` is the activation ladder's `_pick`) and the hover plaque (`raceWinner` comparing the `ally`-marked hit against the next candidate) evaluate `answersPress` across every player mode. Yielding to any ray hit without checking reach previously made companions unreachable indoors and triggered `"You are too far away"` from distant shelves.
- **Persistent Visual Seed (`ownPerson`):** `foeSeed` checks `ownPerson` before falling back to the stand seed so a companion or revenant renders with a single appearance across scenes and over the network wire. For living crew and companions, `companionPerson` uses the member record's integer `person` field or falls back to the FNV-1a hash of `companionKeyOf` (`key` or `boat:name`). For revenants, `revenantPerson` is minted from `foeSeed` of the felling body record and persisted on `revenantStamp`.
