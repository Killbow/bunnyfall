import assert from 'node:assert/strict';
import test from 'node:test';
import { GROVE_SIZE, groveOf, groveHeart } from '../src/professions/groves.js';
import { trees } from '../src/net/nodeLaw.js';
import { CLIMATES } from '../src/formats/mapsTables.js';

const SIZE = 819.2;
/** A deterministic scatter of forest flats. */
function forest(n) {
  let s = 12345;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return Array.from({ length: n }, (_, id) => ({ id, x: r() * SIZE, z: r() * SIZE }));
}
/** Stand the day's trees: each takes the nearest unclaimed flat to `pointOf(tree)`. */
function stand(law, flats, pointOf) {
  const claimed = new Set(), out = [];
  for (const t of law) {
    const [px, pz] = pointOf(t);
    let best = null, bd = Infinity;
    for (const f of flats) { if (claimed.has(f.id)) continue; const d = (f.x - px) ** 2 + (f.z - pz) ** 2; if (d < bd) { bd = d; best = f; } }
    claimed.add(best.id); out.push(best);
  }
  return out;
}
/** The walk of a greedy nearest-next route through the stood trees. */
function walk(stood) {
  const left = [...stood]; let at = left.shift(), total = 0;
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((f, i) => { const d = Math.hypot(f.x - at.x, f.z - at.z); if (d < bd) { bd = d; bi = i; } });
    total += bd; at = left.splice(bi, 1)[0];
  }
  return total;
}

test('a grove is GROVE_SIZE slots and shares its first tree\'s point', () => {
  assert.equal(groveOf(0), 0); assert.equal(groveOf(GROVE_SIZE - 1), 0); assert.equal(groveOf(GROVE_SIZE), 1);
  const law = trees({ x: 100, y: 100, day: 20000, climate: CLIMATES.Woodlands });
  assert.ok(law.length > 0);
  for (const t of law) {
    const h = groveHeart(law, t);
    assert.equal(groveOf(h.slot), groveOf(t.slot));
  }
});

test('groves cut the walk between a Woodlands pixel\'s trees to a fraction of the scattered walk', () => {
  const flats = forest(900);
  let scattered = 0, grouped = 0, days = 0;
  for (let day = 20000; day < 20040; day++) {
    const law = trees({ x: 100, y: 100, day, climate: CLIMATES.Woodlands });
    if (law.length < 8) continue;
    days++;
    scattered += walk(stand(law, flats, (t) => [t.u * SIZE, t.v * SIZE]));
    grouped += walk(stand(law, flats, (t) => { const h = groveHeart(law, t); return [h.u * SIZE, h.v * SIZE]; }));
  }
  assert.ok(days > 10);
  assert.ok(grouped < scattered * 0.7, `grouped ${grouped.toFixed(0)} m vs scattered ${scattered.toFixed(0)} m`);
});
