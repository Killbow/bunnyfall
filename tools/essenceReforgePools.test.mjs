import assert from 'node:assert/strict';
import test from 'node:test';
import { AFFIX_KINDS, reforgeChoices, reforgeableLines } from '../src/items/lootRarity.js';

const gauntlets = () => ({
  rarity: 'rare', group: 'Armor', name: 'Habasi test gauntlets',
  affixes: [
    { id: 'armor', value: 6 },
    { id: 'weight', value: 20 },
    { id: 'skill', param: 0, value: 10 },
    { id: 'stat', param: 'strength', value: 5 },
    { id: 'resist', param: 'fire', value: 20 },
  ],
});
const keyOf = (c) => `${c.id}:${c.param ?? ''}`;

test('each slot offers its group legal kinds, never its own kind or another line, and the whole list', () => {
  const item = gauntlets();
  const lines = reforgeableLines(item);
  assert.deepEqual(lines, [0, 1, 2, 3, 4]);
  for (const index of lines) {
    const choices = reforgeChoices(item, index);
    const keys = choices.map(keyOf);
    assert.equal(new Set(keys).size, keys.length, 'no choice twice');
    const old = item.affixes[index];
    assert.ok(!choices.some((c) => c.id === old.id && (AFFIX_KINDS[old.id].params ? c.param === old.param : true)), `slot ${index} never offers itself`);
    for (const c of choices) {
      assert.ok(AFFIX_KINDS[c.id].groups.includes('Armor'), `${c.id} fits armor`);
      assert.ok(!AFFIX_KINDS[c.id].proc, 'a number line is replaced by a number line');
    }
    for (const other of item.affixes.filter((_, i) => i !== index)) {
      assert.ok(!choices.some((c) => keyOf(c) === keyOf(other)), `slot ${index} never duplicates ${keyOf(other)}`);
    }
  }
});

test('a skill slot lists attributes and resistances, and an armor slot the skills', () => {
  const item = gauntlets();
  const kinds = new Set(reforgeChoices(item, 2).map((c) => c.id));
  assert.ok(kinds.has('stat') && kinds.has('resist'), 'attributes and resistances');
  assert.ok(reforgeChoices(item, 0).some((c) => c.id === 'skill'), 'an armor slot may take a skill');
  assert.ok(reforgeChoices(item, 2).length > 7, 'longer than one attribute page, so the list must scroll');
});

test('pools differ by slot: each slot leaves out the kinds the other lines hold', () => {
  const item = gauntlets();
  assert.ok(reforgeChoices(item, 0).every((c) => c.id !== 'weight'), 'armor slot cannot take the held carrying capacity');
  assert.ok(reforgeChoices(item, 1).every((c) => c.id !== 'armor' && c.id !== 'weight'), 'carry slot cannot take armor or itself');
  const skills = reforgeChoices(item, 2).filter((c) => c.id === 'skill');
  assert.ok(skills.length > 5 && skills.every((c) => c.param !== 0), 'a skill slot offers the other skills, never its own Medical');
  const stats = reforgeChoices(item, 3).filter((c) => c.id === 'stat');
  assert.ok(stats.length > 3 && stats.every((c) => c.param !== 'strength'), 'an attribute slot offers the other attributes');
  assert.ok(reforgeChoices(item, 3).some((c) => c.id === 'skill' && c.param === 1), 'an attribute slot offers the other skills');
  assert.ok(reforgeChoices(item, 3).every((c) => !(c.id === 'skill' && c.param === 0)), 'but not the Medical the piece holds');
});
