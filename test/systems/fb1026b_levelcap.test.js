// LEVEL-45 (2026-10-26, the owner: "Also bring the level cap to 45"; bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md):
// the character's level stops at 45, on Daggerfall's sum and on the virtue bar alike, and every readout says so.
// Mutants: tools/mutants/fb1026b_levelcap.json.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../../src/systems/chargen.js';
import { SKILLS, levelUpSkillSum } from '../../src/systems/skills.js';
import { LEVEL_CAP, atLevelCap } from '../../src/systems/levelCap.js';
import { checkForLevelUp, applyLevelUp, raiseSkills, calculatePlayerLevel } from '../../src/systems/advancement.js';
import { initVirtueLeveling, LEVELING_VIRTUE, LEVELUP_TOTAL, checkForVirtueLevelUp, commitVirtueLevelUp } from '../../src/systems/oblivionLeveling.js';
import { masterSkill } from '../../src/systems/masterSkills.js';
import { levelProgressPercent } from '../../src/ui/charsheet.js';
import { levelProgress } from '../../src/ui/levelUp/levelUpView.js';
import { STAT_KEYS_ORDER } from '../../src/systems/statMods.js';

const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const career = {
  name: 'W', hitPointsPerLevel: 12, advancementMultiplier: 1.0,
  strength: 60, intelligence: 40, willpower: 45, agility: 55, endurance: 60, personality: 40, speed: 50, luck: 50,
  primarySkills: [SKILLS.LongBlade, SKILLS.Axe, SKILLS.CriticalStrike],
  majorSkills: [SKILLS.BluntWeapon, SKILLS.Dodging, SKILLS.Jumping],
  minorSkills: [SKILLS.ShortBlade, SKILLS.Archery, SKILLS.Running, SKILLS.Swimming, SKILLS.Climbing, SKILLS.Medical],
};
const made = () => { const p = { isPlayer: true, reflexes: 2, items: [] }; createCharacter(p, career, 16, { rolls: seq(0) }); return p; };
const counted = [...career.primarySkills, ...career.majorSkills, ...career.minorSkills];

test('LEVEL-45 THE CAP: 45, and a sum far past it owes no level at 45 while one below it still does (mutants: the cap unread; the cap one higher)', () => {
  assert.equal(LEVEL_CAP, 45);
  const p = made();
  p.currentLevelUpSkillSum = p.startingLevelUpSkillSum + 2000;
  assert.ok(calculatePlayerLevel(p.startingLevelUpSkillSum, p.currentLevelUpSkillSum) > 100, 'the sum alone would owe a hundred levels');
  p.level = 44;
  assert.equal(checkForLevelUp(p), true);
  assert.equal(p.pendingLevel, 45);
  assert.equal(applyLevelUp(p, () => {}, seq(0.5)), true);
  assert.equal(p.level, 45);
  assert.equal(checkForLevelUp(p), false, 'at the cap: nothing owed');
  assert.equal(p.readyToLevelUp, false);
  assert.equal(atLevelCap(p), true);
});

test('LEVEL-45 THE REACH: a class whose six counted skills are mastered to 200 under the 3/2/1 masteries reaches the cap and stops there (mutant: the cap unread)', () => {
  const p = made();
  p._online = true;
  for (const s of counted) p.skills[s] = 100;
  for (const s of [SKILLS.LongBlade, SKILLS.Axe, SKILLS.CriticalStrike, SKILLS.BluntWeapon, SKILLS.Dodging, SKILLS.ShortBlade]) assert.equal(masterSkill(p, s).ok, true);
  for (const s of counted) p.skills[s] = 200;
  p.currentLevelUpSkillSum = levelUpSkillSum(p);
  const ceiling = calculatePlayerLevel(p.startingLevelUpSkillSum, p.currentLevelUpSkillSum);
  assert.ok(ceiling > LEVEL_CAP, `the 3/2/1 ceiling (${ceiling}) is past the cap, so the cap is what stops the climb`);
  p.level = 1; p.chargenDone = true; p.lastSkillCheckTime = 0;
  for (let i = 0; i < 80; i++) raiseSkills(p, (i + 1) * 1000, seq(0.5));   // headless: one level a pass
  assert.equal(p.level, LEVEL_CAP);
});

test('LEVEL-45 THE VIRTUE BAR: full at the cap owes no level, and a level latched before the cap is not committed at it (mutants: the bar\'s gate dropped; the commit\'s)', () => {
  const p = made();
  initVirtueLeveling(p, LEVELING_VIRTUE);
  p.levelProgress = LEVELUP_TOTAL;
  p.level = 44;
  assert.equal(checkForVirtueLevelUp(p), true);
  p.readyToLevelUp = false;
  p.level = 45;
  assert.equal(checkForVirtueLevelUp(p), false);
  p.readyToLevelUp = true;   // a save from before the cap
  const zero = Object.fromEntries(STAT_KEYS_ORDER.map((k) => [k, 0]));
  assert.equal(commitVirtueLevelUp(p, zero, 0, null, seq(0.5)), false);
  assert.deepEqual([p.level, p.readyToLevelUp], [45, false]);
  const classic = made();
  classic.level = 45; classic.readyToLevelUp = true; classic.pendingLevel = 46;
  assert.equal(applyLevelUp(classic, () => {}, seq(0.5)), false);
  assert.deepEqual([classic.level, classic.readyToLevelUp, classic.pendingLevel], [45, false, null]);
});

test('LEVEL-45 THE READOUTS: the Level box and the level-up bar read whole at the cap, and a level below it reads its own fraction (mutant: a readout left measuring a next level)', () => {
  const p = made();
  p.level = 45;
  p.currentLevelUpSkillSum = p.startingLevelUpSkillSum + 7;
  assert.equal(levelProgressPercent(p), 100);
  assert.deepEqual(levelProgress(p, null), { now: 1, max: 1, carried: 0, label: 'Highest level reached' });
  p.level = 44;
  assert.notEqual(levelProgressPercent(p), 100);
  assert.equal(levelProgress(p, null).label, 'Skill progress to next level');
});
