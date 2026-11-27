---
slug: "classic-skill-advancement-and-leveling-order"
title: "Classic Skill Advancement, Virtue Leveling, and Entity Order"
domain: "characters"
kind: "subcard"
parent: "classic-systems-spine-overview"
files:
  - "src/characters/advancement.js"
  - "src/characters/oblivionLeveling.js"
  - "src/characters/skills.js"
  - "src/characters/playerEntity.js"
  - "src/characters/statMods.js"
routes: []
tables: []
replacesBible: []
related:
  - "level-cap-45-and-latch-release"
  - "growth-level-page-and-bonus-pool"
invariants:
  - "`addSkillProgress` runs before `entity.skills[i] += 1`, because the virtue leveling handler reads the value the skill is leaving. It sits inside the cap gate, so a refused raise banks no progress."
  - "`raiseSkills` calls `onRaise` and `onMastery` inside the skill loop and `onLevelUp` after it, in classic order. A host that shows raises after the call returns puts the mastery box over the level-up sheet."
  - "Past skill 100 a raise is bought as fractional progress in `entity.skillProgress`, which the save stores. One point lands per pass, and the unspent remainder carries to the next pass."
  - "`commitVirtueLevelUp` rolls hit points before the attribute deltas land, using the endurance the character came in with. This matches the Daggerfall path, so both lanes give equal health."
  - "The player entity literal must carry `skillUses` from construction. Skill tallies return early without it, so training on a pre-chargen entity would take gold and teach nothing."
traps:
  - "`raiseSkills` re-checks `alreadyMasteredASkill` before every raise, so a primary skill reaching 100 mid-pass blocks later raises at 95 and above in the same pass, as in classic. Master Skills skips the lock."
  - "The level-up check at the end of `raiseSkills` runs on every pass that clears the 360-minute gate, even with no raise, so a level still below the calculated level is offered again."
  - "`addSkillProgress` adds nothing when the skill is already at 100, and the bar rolls over only when progress strictly exceeds `LEVELUP_TOTAL`. It runs before the raise lands, so it reads the value the skill is leaving."
  - "`checkForVirtueLevelUp` must not return early when `readyToLevelUp` is already set. It re-announces an owed level each pass, because the overlay slot can be busy. It returns false while `oghmaLevelUp` is set."
  - "`setSkillRecentlyIncreased` ends with `>>> 0` because bit 31 (Axe) makes `1 << 31` negative in JavaScript, and the stored word must stay unsigned like the C# `uint`."
  - "The zero-live-stat kill skips any stat missing from `entity.stats`. Enemies and fixtures carry partial blocks, and reading a missing stat as 0 would kill each of them on its first frame."
dfu: []
tags:
  - "advancement"
  - "leveling"
  - "skills"
---

# Classic Skill Advancement, Virtue Leveling, and Entity Order

Skill raises and level-ups follow the classic `raiseSkills` pass in `src/characters/advancement.js`, which runs when the 360-minute gate clears. Virtue leveling (`src/characters/oblivionLeveling.js`) banks skill progress toward a level bar instead of summing skills, and both lanes give equal health.

- **Raise pass:** each skill is checked for its raise, the host callbacks fire in classic order, and the level check runs at the end of every pass.
- **Past 100:** raises are bought as fractional progress stored in the save.
- **Entity shape:** `src/characters/playerEntity.js` builds the pre-chargen entity that chargen mutates in place, and `src/characters/statMods.js` holds the live stat layer with drains.
