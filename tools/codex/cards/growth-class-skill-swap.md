---
slug: growth-class-skill-swap
title: "Paid Class Skill Swap and the Level-Sum Guard"
domain: characters
kind: subcard
parent: growth-tab-overview
files:
  - src/characters/skillSwap.js
  - src/ui/growth/specGuide.js
  - src/characters/specReset.js
  - src/characters/skills.js
  - src/characters/masterSkills.js
  - src/systems/legacy/family.js
routes: []
tables: []
replacesBible:
  - "10-UI/Growth.md"
related:
  - growth-specialization-guide-and-reset
  - growth-tab-overview
  - legacy-family-records-and-heir-birth
invariants:
  - "`SKILL_SWAP_GOLD` (`100_000` in `src/characters/skillSwap.js`) is charged per swap from the same funds as a specialization reset (`resetGold` and `payUndoable` in `src/characters/specReset.js`)."
  - "`skillSwapRefusal` rejects swapping out any mastered class skill (`'A mastered skill stays in your class'`) and requires the incoming skill to sit outside the current class, inheriting the outgoing skill's tier (Primary, Major, or Minor)."
  - "`swappedCareer` returns a cloned career object flagged with `swapped: true`, which `careerFields` and `isCustomCareer` in `src/systems/legacy/family.js` preserve across family records and heir creation."
traps:
  - "To prevent level-cycling exploits, `swapSkill` advances `startingLevelUpSkillSum` and `currentLevelUpSkillSum` only when the post-swap skill sum exceeds `heldSum`; a swap that lowers the class skill sum leaves both baselines unchanged so the character must make up `swapShortfall` points before leveling resumes."
  - "Swapping a class skill never modifies any skill score, the character's current level, or the count of spent mastery slots (`src/characters/masterSkills.js`)."
dfu: []
tags:
  - skill-swap
  - career
  - class-skills
  - gold
  - level-sum
---

# Paid Class Skill Swap and the Level-Sum Guard

`src/characters/skillSwap.js` and `drawSkillSwap` (`src/ui/growth/specGuide.js`) let a player replace an unmastered Primary, Major, or Minor class skill with a non-class skill so characters whose original class layout locked them out of an Arcane or Martial specialization can unlock a path without restarting.

## Eligibility, Cost, and Career Persistence

`skillSwapRefusal` enforces three rules before `swapSkill` executes:

- **Unmastered outgoing skill:** the outgoing skill must sit in the character's Primary, Major, or Minor lists (`src/characters/skills.js`) and must not be mastered (`src/characters/masterSkills.js`).
- **Non-class incoming skill:** the incoming skill must sit outside all three class tiers and takes the outgoing skill's slot.
- **100,000-gold fee:** `swapSkill` deducts `SKILL_SWAP_GOLD` (`100,000` gold) through `resetGold` and `payUndoable` (`src/characters/specReset.js`).

`swappedCareer` returns an updated career copy marked `swapped: true` so `isCustomCareer` and `careerFields` (`src/systems/legacy/family.js`) persist the modified lists for family records and heirs (`legacy-family-records-and-heir-birth`). In the specialization guide, `swapOpens(entity, out, inn, possible)` flags whether one swap would unlock a family (`f.swapOpens`).

## Level-Sum Exploit Guard

Swapping a high class skill for a low non-class skill and raising it again could otherwise farm levels. `swapSkill` compares the new class sum against `heldSum`: if the swap raises the sum, `startingLevelUpSkillSum` and `currentLevelUpSkillSum` shift up by the delta; if the swap lowers the sum, neither baseline drops, and `swapShortfall` reports how many points the class must recover before progress toward the next level resumes.
