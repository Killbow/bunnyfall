---
slug: legacy-family-records-and-heir-birth
title: "Family Records, Heir Birth, Estate, and Age Toll"
domain: legacy
kind: subcard
parent: legacy-arc-overview
files:
  - src/systems/legacy/family.js
  - src/systems/legacy/legacyLaw.js
  - src/systems/legacy/age.js
  - src/systems/legacy/store.js
  - src/systems/legacy/waitingHouses.js
  - src/characters/chargen.js
  - src/main.js
  - src/ui/legacySuccession.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Legacy-Arc.md"
related:
  - legacy-arc-overview
  - legacy-heirlooms-remains-and-blessing
invariants:
  - "Heirs are fresh chargen characters, never copies of the dead entity; generation is parent `gen + 1`."
  - "Blood bonus per stat is `clamp(round((best parent - 50) / 10), 0, BLOOD_MAX)` with `BLOOD_MAX` `3`."
  - "Hearth bonus per primary and major skill is `clamp(floor(parent / 20), 0, HEARTH_MAX)` with `HEARTH_MAX` `3`."
  - "`RACE_INHERIT_CHANCE` is `0.7`, `CAREER_INHERIT_CHANCE` is `0.5` (else one of the 18 `CLASS_CAREERS`), and `HEIR_CHANCE` is `0.5`."
  - "Estate is `ESTATE_SHARE` (`0.25`) of the fallen purse, capped at `ESTATE_MAX` (`9_900`)."
  - "Enduring death charges `tollYears` of the race span; vampires and lycanthropes pass `ageless` and pay no toll."
traps:
  - "`maxSiblings` of `0` must yield zero siblings; the clamp floor is `0`, not the default `SIBLINGS_MAX_DEFAULT` (`2`)."
  - "With no seat, births fall back to `DEFAULT_BIRTH_PLACE` or where the parent fell; a failed first save must undo `BIRTH_KEY` state."
dfu: []
tags:
  - heir
  - chargen
  - estate
  - age
  - enduring
  - bloodline
---

# Family Records, Heir Birth, Estate, and Age Toll

Succession creates fresh characters derived from parent attributes, transfers a bounded share of gold, and tracks aging penalties (`src/systems/legacy/family.js`, `src/systems/legacy/legacyLaw.js`, and `src/systems/legacy/age.js`).

- **Inheritance rolls and bonuses (`family.js`, `legacyLaw.js`):** Each succession builds a new character at generation `gen + 1` rather than cloning the fallen parent. An heir inherits race at `RACE_INHERIT_CHANCE` (`0.7`) and career at `CAREER_INHERIT_CHANCE` (`0.5`, else one of the 18 `CLASS_CAREERS`), with `HEIR_CHANCE` (`0.5`) governing child creation and `SIBLINGS_MAX_DEFAULT` (`2`, clamping to `0` when `maxSiblings` is `0`) bounding siblings. Each attribute gains a blood bonus of `clamp(round((best parent - 50) / 10), 0, BLOOD_MAX)` (`BLOOD_MAX = 3`) from the higher parent stat, while primary and major skills gain a hearth bonus of `clamp(floor(parent / 20), 0, HEARTH_MAX)` (`HEARTH_MAX = 3`) from the played parent.
- **Estate, birth location, and waiting lines (`waitingHouses.js`, `legacySuccession.js`):** The heir receives `ESTATE_SHARE` (`0.25`) of the fallen purse up to `ESTATE_MAX` (`9_900`). Without a seat, birth location falls back to `DEFAULT_BIRTH_PLACE` or the death site, and `BIRTH_KEY` expires after `BIRTH_MAX_AGE_MS` (`10` minutes) or rolls back if the first save fails. `waitingHouses` lists lines without a living played member so `takeUpLine` can resume them.
- **Enduring age toll (`age.js`):** Under the `enduring` model, death adds `tollYears` scaled to the racial lifespan unless the character is a vampire or lycanthrope (`ageless`).
