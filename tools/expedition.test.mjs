import assert from 'node:assert/strict';
import test from 'node:test';
import { CLIMATES } from '../src/formats/mapsTables.js';
import { dungeonVeins, dungeonVeinCount } from '../src/net/nodeLaw.js';
import {
  cavernKind, CAVERN_KINDS, richSeam, RICH_ORES, RICH_ONE_IN, seamSlot, seamRefusal, leadOf, compassWord, cavernNotePay,
} from '../src/net/expeditionLaw.js';

const DAY = 20_400;

test('only a dungeon with two or more veins has a seam, and it is the last slot', () => {
  assert.equal(seamSlot(1), -1);
  assert.equal(seamSlot(2), 1);
  assert.equal(seamSlot(4), 3);
  for (let dungeon = 1; dungeon < 400; dungeon++) {
    const veins = dungeonVeins({ dungeon, day: DAY, climate: CLIMATES.Woodlands, confirmed: true });
    const seams = veins.filter((v) => v.seam);
    assert.equal(seams.length, dungeonVeinCount(dungeon, DAY) >= 2 ? 1 : 0);
    if (seams.length) assert.equal(seams[0].slot, dungeonVeinCount(dungeon, DAY) - 1);
  }
});

test('a cavern keeps its kind for good, and every kind turns up', () => {
  const seen = new Set();
  for (let dungeon = 0; dungeon < 600; dungeon++) {
    const kind = cavernKind(dungeon);
    assert.ok(CAVERN_KINDS.includes(kind));
    assert.equal(cavernKind(dungeon), kind);
    seen.add(kind);
  }
  assert.equal(seen.size, CAVERN_KINDS.length);
});

test('about one seam in eight is rich, a magical ore, and a rich seam is the better find', () => {
  let rich = 0, total = 0, richTier = 0, plainTier = 0, plainN = 0;
  for (let dungeon = 1; dungeon < 3000; dungeon++) {
    const seam = dungeonVeins({ dungeon, day: DAY, climate: CLIMATES.Mountain, confirmed: true }).find((v) => v.seam);
    if (!seam) continue;
    total++;
    assert.equal(seam.rich, richSeam(dungeon, DAY));
    if (seam.rich) { rich++; richTier += seam.tier; assert.ok(RICH_ORES.includes(seam.material)); } else { plainN++; plainTier += seam.tier; }
  }
  const share = rich / total;
  assert.ok(Math.abs(share - 1 / RICH_ONE_IN) < 0.03, `rich share ${share}`);
  assert.ok(richTier / rich > plainTier / plainN, 'a rich seam runs a higher tier');
});

test('a seam runs richer than the traces beside it', () => {
  let seamTier = 0, traceTier = 0, seams = 0, traces = 0;
  for (let dungeon = 1; dungeon < 3000; dungeon++) {
    for (const v of dungeonVeins({ dungeon, day: DAY, climate: CLIMATES.Woodlands, confirmed: true })) {
      if (v.seam && !v.rich) { seamTier += v.tier; seams++; } else if (!v.seam) { traceTier += v.tier; traces++; }
    }
  }
  assert.ok(seamTier / seams > traceTier / traces);
});

test('each kind asks for its own tool and only that', () => {
  assert.equal(seamRefusal('dry', {}), null);
  assert.ok(seamRefusal('dark', {}));
  assert.equal(seamRefusal('dark', { light: true }), null);
  assert.ok(seamRefusal('sheer', { light: true }));
  assert.equal(seamRefusal('sheer', { hook: true }), null);
  assert.ok(seamRefusal('shored', { hook: true, light: true }));
  assert.equal(seamRefusal('shored', { partner: true }), null);
});

test('a lead names the heading and the paces', () => {
  assert.equal(compassWord(0, 10), 'north');
  assert.equal(compassWord(10, 0), 'east');
  assert.equal(compassWord(-10, -10), 'south-west');
  const lead = leadOf([0, 0, 0], [30, 5, 0]);
  assert.equal(lead.heading, 'east');
  assert.equal(lead.paces, 40);
});

test('cavern notes pay more for a rich seam, a harder cavern and a higher rank', () => {
  const plain = cavernNotePay({ tier: 4, rich: false, kind: 'dry' }, -1);
  assert.ok(cavernNotePay({ tier: 4, rich: true, kind: 'dry' }, -1) > plain * 2);
  assert.ok(cavernNotePay({ tier: 4, rich: false, kind: 'sheer' }, -1) > plain);
  assert.ok(cavernNotePay({ tier: 4, rich: false, kind: 'dry' }, 3) > plain);
});
