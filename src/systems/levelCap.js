// @ts-check
// LEVEL-45 (2026-10-26, the owner: "Also bring the level cap to 45"; bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md):
// THE CHARACTER'S LEVEL STOPS AT 45. A LEAF, read by advancement.js (Daggerfall's sum) and oblivionLeveling.js (the
// virtue bar), which import each other's neighbours, so neither grows a cycle.
//
// DFU HAS NO CAP: PlayerEntity.CheckForLevelUp raises the flag whenever FormulaHelper.CalculatePlayerLevel's
// floor((current - starting + 28) / 15) passes the level, and the sum stops only because six counted skills stop at
// 100 - a character made with a sum of 156 tops out at 31 (Field-Bugs-2026-10-20g, SWAP-CYCLE). The port's skills
// climb past 100 where they are mastered (masterSkills.js), each point a quarter of one in the sum (skillSoftcap.js
// effectiveSkill: 200 reads 140), so the ceiling moved with the masteries: 44 at 2/2/1 every mastered skill at 200, 47
// at MASTER-THREE's 3/2/1. The cap is the ceiling named: 45 for every character, on either lane, reached at the end of
// the long climb past 100 and never passed. A DEPARTURE from CheckForLevelUp, offline and online.
//
// A character already past it (a level earned before the cap, SWAP-CYCLE's ladder) keeps its level: nothing lowers a
// level, the cap only stops the next one.

/** The highest level a character reaches. */
export const LEVEL_CAP = 45;

/** Whether `entity` stands at (or past) the cap - no level is owed it. */
export const atLevelCap = (entity) => (entity?.level ?? 1) >= LEVEL_CAP;
