---
slug: arcane-path-choice-awake-and-judge
title: "Arcane Path Choice, Awake Gate, Prompt, and Judge"
domain: magic
kind: subcard
parent: arcane-specializations-overview
files:
  - src/characters/arcanePaths.js
  - src/characters/masterSkills.js
  - src/scenes/shared.js
  - src/ui/charsheet.js
  - src/saves/save.js
  - server-account/src/judge.js
  - src/items/sigilDuelState.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Arcane-Specialisations.md"
related:
  - arcane-specializations-overview
  - growth-specialization-guide-and-reset
  - economy-ledger-and-item-judge
  - integrity-pvp-duel-and-wild-referees
invariants:
  - "`pathChoices(entity)` is empty unless Master Skills is in force (`masterSkillsActive`) and no path is held; it lists paths whose two schools are both in `masteredSkills`."
  - "`choosePath` writes `entity.arcanePath` only after `pathRefusal` returns null; nothing in arcanePaths.js clears it (only `resetSpec` in src/characters/specReset.js)."
  - "`pathHeld` requires my own player entity (`isPlayer`, no `peer`), Master Skills active, and both schools mastered; `pathAwake` also returns null while `_mentor` is set; `awakePathId` (arcanePowers.js) also returns null while `sigilDueling()` is true."
  - "`pathFindings(save)` returns `{ code: 'path', at: 'id' }` for an unknown id and `{ code: 'path', at: 'schools' }` when either school is missing from `save.masteredSkills`; `characterFindings` in server-account/src/judge.js appends these. Signature spells themselves are never judged."
traps:
  - "`pathPossible` uses `masterableCount(entity, MAGIC_SKILLS) >= 2` (remaining mastery slots), not current mastery; it only decides whether to show the card."
  - "The prompt (src/scenes/shared.js) fires once (`pathPrompted = true`): exactly one open path shows a Yes/No `pathChoiceRows` box, several show an OK-only `pathsOpenRows` box pointing to the Growth tab (enhanced skin) or skill screen."
  - "A save from an older build with no `arcanePath` key restores the path through `pathWitnessed(spells, masteredSkills)` only if its signature spells name exactly one path with both schools mastered, and only if `career.arcaneMirror` did not already decide it."
dfu: []
tags:
  - arcane-paths
  - mastery
  - mentoring
  - duel
  - judge
  - save-compat
---

# Arcane Path Choice, Awake Gate, Prompt, and Judge

Path selection, awake gating, one-shot prompting, and save verification span `src/characters/arcanePaths.js`, `src/scenes/shared.js`, `src/saves/save.js`, and `server-account/src/judge.js`.

- **Eligibility and claiming:** `pathPossible` checks `masterableCount(entity, MAGIC_SKILLS) >= 2` (`src/characters/masterSkills.js`) to decide whether UI surfaces (`src/ui/charsheet.js` and the Growth tab) show the Arcane path card. `pathChoices(entity)` returns open paths only when `masterSkillsActive` holds, no path is currently claimed, and both of a path's schools appear in `masteredSkills`. `choosePath` sets `entity.arcanePath` once `pathRefusal` returns `null`.
- **Held versus awake gates:** `pathHeld` requires the local player (`isPlayer` without `peer`), active Master Skills, and both pair schools mastered. `pathAwake` also returns `null` while `_mentor` is active, so a mentored mage keeps `pathHeld` (preserving signature spell purchase and path cast-school pricing) while all passives and riders sleep. In `src/characters/arcanePowers.js`, `awakePathId` also returns `null` during `sigilDueling()` (`src/items/sigilDuelState.js`, kept separate from `arcanePaths.js` so `spellcost.js` imports remain acyclic).
- **Prompt, legacy migration, and judge:** `src/scenes/shared.js` prompts once (`pathPrompted = true`), showing a Yes/No `pathChoiceRows` modal when one path opens or an OK-only `pathsOpenRows` notice when several open. On load, `src/saves/save.js` calls `pathWitnessed(spells, masteredSkills)` to recover a missing `arcanePath` from signature spells unless `career.arcaneMirror` already recorded a decision. At checkpoint, `characterFindings` (`server-account/src/judge.js`) appends `pathFindings(save)`, flagging `{ code: 'path', at: 'id' }` or `{ code: 'path', at: 'schools' }` while leaving signature spell records unjudged.
