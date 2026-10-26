// JEWEL-KIN (2026-10-26, Discord #feature-feedback "jewelcrafting, roll chances not equal (h2h, critical)": "i crafted
// around 100 rare rings (gold and platinum, handcraft not auto) and h2h or critical not roll on them";
// bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md): jewellery's skill lines lean to Hand-to-Hand and Critical Strike
// beside the mind's thirteen. Measured through the real mint (systems/smithItems.js mintPiece) the report's own rings
// went through - a record of MINT_V_JEWEL_KIN, as the service stamps now, and one of 2, as every ring made before.
// Mutants: tools/mutants/fb1026b_jewelkin.json.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import * as LR from '../../src/systems/loot/lootRarity.js';
import { MINT_VERSION, MINT_V_JEWEL_KIN, MINT_V_LINES } from '../../src/net/productRecord.js';
import { mintPiece } from '../../src/systems/smithItems.js';
import { SKILLS } from '../../src/systems/skills.js';
import { mintCondition } from '../../src/systems/item/itemTemplates.js';

const on = () => { _resetForTests(); setPref('lootRarity', true); };
const seedOf = (i) => (Math.imul(i + 1, 2654435761) >>> 0);
/** Every skill line of `n` hand-made Masterwork rings of each metal the report names, at record version `version`. */
function ringSkills(version, n) {
  const out = [];
  for (const recipe of ['ring:gold', 'ring:platinum']) {
    for (let i = 0; i < n; i++) {
      const it = mintPiece({ recipe, quality: 4, seed: seedOf(i), maker: null, version }, '0123456789abcdef');
      assert.equal(it.rarity, 'rare');
      for (const a of it.affixes ?? []) if (a.id === 'skill') out.push(a.param);
    }
  }
  return out;
}
const share = (list, s) => list.filter((x) => x === s).length / list.length;

test('JEWEL-KIN THE REPORT\'S RINGS: a Masterwork gold or platinum ring made now carries Hand-to-Hand and Critical Strike as often as a mind skill - each about one skill line in sixteen, where the old lean gave each one in two hundred (mutants: the bare hand\'s two left out; the version unread)', () => {
  on();
  assert.equal(MINT_VERSION, MINT_V_JEWEL_KIN, 'the craft stamps the new lean');
  const now = ringSkills(MINT_VERSION, 1500);
  assert.ok(now.length > 5000, `enough skill lines (${now.length})`);
  const h2h = share(now, SKILLS.HandToHand), crit = share(now, SKILLS.CriticalStrike), mind = share(now, SKILLS.Illusion);
  assert.ok(h2h > 0.045 && h2h < 0.08, `Hand-to-Hand ${(h2h * 100).toFixed(2)}% of skill lines`);
  assert.ok(crit > 0.045 && crit < 0.08, `Critical Strike ${(crit * 100).toFixed(2)}%`);
  assert.ok(Math.abs(h2h - mind) < 0.02 && Math.abs(crit - mind) < 0.02, `each about a mind skill's (Illusion ${(mind * 100).toFixed(2)}%)`);
  // a hundred Rare rings: a Hand-to-Hand line among them all but certainly (the report saw none)
  const perRing = now.length / 3000;
  assert.ok((1 - h2h) ** (perRing * 100) < 0.001, 'none in a hundred rings is a one-in-a-thousand chance now');
});

test('JEWEL-KIN A RING ALREADY MADE KEEPS ITS LINES: a record of 2 mints on the mind\'s lean as it always did - the bare hand\'s two at the open share alone (mutant: the version unread)', () => {
  on();
  const old = ringSkills(MINT_V_LINES, 1500);
  assert.ok(share(old, SKILLS.HandToHand) < 0.012 && share(old, SKILLS.CriticalStrike) < 0.012, `the old lean (${(share(old, SKILLS.HandToHand) * 100).toFixed(2)}%, ${(share(old, SKILLS.CriticalStrike) * 100).toFixed(2)}%)`);
  // and the version is the only thing that moved it: a record's ring of 2 and of 3 differ only where a skill line's skill does
  let moved = 0;
  for (let i = 0; i < 200; i++) {
    const at = (v) => mintPiece({ recipe: 'ring:gold', quality: 4, seed: seedOf(i), maker: null, version: v }, '0123456789abcdef');
    const a = at(MINT_V_LINES), b = at(MINT_V_JEWEL_KIN);
    assert.deepEqual(a.affixes.map((x) => x.id), b.affixes.map((x) => x.id), 'the same kinds of line');
    assert.deepEqual(a.affixes.filter((x) => x.id !== 'skill'), b.affixes.filter((x) => x.id !== 'skill'), 'every other line its own');
    if (JSON.stringify(a.affixes) !== JSON.stringify(b.affixes)) moved++;
  }
  assert.ok(moved > 0, 'some skill lines moved');
});

test('JEWEL-KIN A FOUND RING LEANS THE SAME: a loot door\'s jewellery takes the new lean (mutant: the bare hand\'s two left out)', () => {
  on();
  let rolls = 12345;
  const rng = () => { rolls = (rolls * 1103515245 + 12345) & 0x7fffffff; return (rolls >>> 8) / 0x800000; };
  const lines = [];
  for (let i = 0; i < 3000; i++) {
    const ring = mintCondition({ group: 'Jewellery', templateIndex: 135, name: 'Ring', flags: 0 });
    for (const a of LR.rollAffixes(ring, 'rare', rng)) if (a.id === 'skill') lines.push(a.param);
  }
  assert.ok(share(lines, SKILLS.HandToHand) > 0.045 && share(lines, SKILLS.CriticalStrike) > 0.045, `${(share(lines, SKILLS.HandToHand) * 100).toFixed(2)}%, ${(share(lines, SKILLS.CriticalStrike) * 100).toFixed(2)}%`);
});
