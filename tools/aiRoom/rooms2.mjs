// AI-ROOMS, batch 2: border rooms (they ring a dungeon) and the first interiors. Cells are 1.6 m; port A's corridor
// is columns/rows 9-10 on the floor at 32.0, port B's 21-22 at 12.8. See dsl.mjs and shell.mjs.
import { RoomSpec, A, B, rng } from './dsl.mjs';
import { blobs, link, switchbackCore } from './lib.mjs';

/** Cistern (border, B): a round dry cistern, a well at its heart and a ring of columns. */
export function cistern() {
  const r = new RoomSpec('Cistern', { kind: 'border', theme: 123, seed: 21, note: 'A round vaulted cistern; the four lower corridors run into it.' });
  const f = r.floor(B), h = r.floor(B, { clear: 4.8 });
  for (const e of 'NSWE') r.port(e, 'B', 14, f);
  r.disc(21.5, 21.5, 8.5, 8.5, h);
  r.prop('well', 21.5, 21.5);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.39; r.prop('pillar-round', 21.5 + Math.cos(a) * 6, 21.5 + Math.sin(a) * 6); }
  r.prop('bone-pile', 17.2, 17.3); r.prop('bone-pile', 26, 26, { rot: 40 });
  return r.autoLights(4).populate({ enemies: 6, loot: 3, quest: 2, seed: 21 });
}

/** Cavern Mouth (border, A): a cave opening off all four corridors, fangs above and below. */
export function cavernMouth() {
  const r = new RoomSpec('Cavern Mouth', { kind: 'border', theme: 120, seed: 22, note: 'Natural rock: a chain of chambers with stalagmites.' });
  const f = r.floor(A, { clear: 4.8 }), c = r.floor(A);
  const blob = blobs(r, f, 16, 16, { n: 9, rmin: 3, rmax: 5.2, step: 4.5, seed: 22 });
  for (const e of 'NSWE') r.port(e, 'A', 3, c);
  link(r, 'N', 'A', 16, 16, f); link(r, 'S', 'A', 16, 16, f); link(r, 'W', 'A', 16, 16, f); link(r, 'E', 'A', 16, 16, f);
  blob.slice(1, 6).forEach(([x, z], k) => { r.prop('stalagmites', Math.floor(x) + 0.5, Math.floor(z) + 0.5, { rot: k * 60 }); r.prop('stalactites', Math.floor(x) + 1.5, Math.floor(z) + 0.5, { up: 4.8 }); });
  return r.autoLights(5, { radius: 80, torches: false }).populate({ enemies: 7, loot: 3, quest: 2, seed: 22 });
}

/** Bone Gallery (border, A): a long barrow with sarcophagus alcoves down both sides. */
export function boneGallery() {
  const r = new RoomSpec('Bone Gallery', { kind: 'border', theme: 123, seed: 23, note: 'A barrow hall, a coffin in every alcove.' });
  const f = r.floor(A), h = r.floor(A, { clear: 4.8 });
  r.port('N', 'A', 12, f); r.port('S', 'A', 12, f); r.port('W', 'A', 4, f); r.port('E', 'A', 4, f);
  r.corridor(0, 9, 3, 12, f); r.corridor(31, 9, 28, 12, f);
  r.rect(2, 12, 29, 19, h);
  for (const i of [5, 13, 17, 21, 25]) { r.rect(i, 10, i + 1, 11, f).rect(i, 20, i + 1, 21, f); r.prop('sarcophagus', i + 1, 10.7, { rot: 90 }); r.prop('sarcophagus', i + 1, 21.3, { rot: 90 }); }
  r.prop('bone-pile', 15.5, 15.5); r.prop('pillar-round', 8, 15.9); r.prop('pillar-round', 24, 15.9);
  return r.autoLights(4).populate({ enemies: 8, loot: 3, quest: 2, seed: 23 });
}

/** Switchback Stair (border, both floors): a double flight joins the upper corridors to the lower. */
export function switchbackStair() {
  const r = new RoomSpec('Switchback Stair', { kind: 'border', theme: 122, seed: 24, note: 'A double flight down 19.2 m: upper ports N and W, lower ports N, S and E.' });
  switchbackCore(r);
  return r.autoLights(4, { radius: 100 }).populate({ enemies: 6, loot: 3, quest: 2, seed: 24 });
}

/** Ruined Cloister (border, A): an open court inside a fallen colonnade. */
export function ruinedCloister() {
  const r = new RoomSpec('Ruined Cloister', { kind: 'border', theme: 124, seed: 25, note: 'A square court, columns half down.' });
  const f = r.floor(A), h = r.floor(A, { clear: 4.8 });
  for (const e of 'NSWE') r.port(e, 'A', 6, f);
  r.rect(6, 6, 25, 25, h);
    for (let k = 0; k < 5; k++) { const p = 8 + k * 4; r.prop(k % 2 ? 'pillar-broken' : 'pillar-round', p, 7.5); r.prop(k % 2 ? 'pillar-round' : 'pillar-broken', p, 24.5); r.prop(k % 2 ? 'pillar-broken' : 'pillar-round', 7.5, p); r.prop(k % 2 ? 'pillar-round' : 'pillar-broken', 24.5, p); }
  r.prop('rubble', 15, 15); r.prop('rubble', 17, 17.5, { rot: 70 }); r.prop('statue', 16, 12.5);
  return r.autoLights(4).populate({ enemies: 7, loot: 3, quest: 2, seed: 25 });
}

/** Throne Room (interior, B): a hall with a stepped dais at its head. */
export function throneRoom() {
  const r = new RoomSpec('Throne Room', { kind: 'interior', theme: 124, seed: 31, note: 'A long hall to a throne on a two-step dais.' });
  const f = r.floor(B), h = r.floor(B, { clear: 6.4 }), s1 = r.floor(B + 0.4, { clear: 6.4 }), s2 = r.floor(B + 0.8, { clear: 6.4 });
  r.port('N', 'B', 10, f); r.port('S', 'B', 4, f); r.port('W', 'B', 7, f); r.port('E', 'B', 7, f);
  r.rect(7, 10, 25, 27, h); r.rect(11, 12, 20, 13, s1); r.rect(11, 10, 20, 11, s2);   // the dais stands clear of the doors
  for (const z of [16, 20, 24]) { r.prop('pillar-round-tall', 9, z); r.prop('pillar-round-tall', 24, z); }
  r.prop('throne', 16.5, 10.6); r.prop('statue', 9.6, 11); r.prop('statue', 23.4, 11); r.prop('stone-table', 16.5, 20, { rot: 0 });
  r.flat('brazier', 12.5, 12.6, { up: 0.4 }); r.flat('brazier', 20.5, 12.6, { up: 0.4 });
  return r.autoLights(4, { radius: 100 }).populate({ enemies: 8, loot: 4, quest: 2, seed: 31 });
}

/** Crypt of Niches (interior, A): a ring corridor round a sealed-looking vault. */
export function cryptOfNiches() {
  const r = new RoomSpec('Crypt of Niches', { kind: 'interior', theme: 123, seed: 32, note: 'A ring passage round a vault of coffins; one narrow way in.' });
  const f = r.floor(A), h = r.floor(A, { clear: 4.8 });
  for (const e of 'NSWE') r.port(e, 'A', 7, f);
  r.frame(7, 7, 24, 24, 2, f);
  r.rect(11, 11, 20, 20, h); r.rect(15, 21, 16, 23, f);
  const spots = [[12.5, 12], [15, 12], [18, 12], [12.5, 19.6], [15, 19.6], [18, 19.6]];
  spots.forEach(([x, z], k) => r.prop('sarcophagus', x + 0.5, z + 0.5, { rot: 90 * (k % 2) + 90 }));
  r.prop('altar', 16, 15.8); r.prop('statue', 11.8, 15.8); r.prop('statue', 20.2, 15.8);
  return r.autoLights(4).populate({ enemies: 7, loot: 4, quest: 2, seed: 32 });
}

/** Sunken Arena (interior, B): a round pit-fighters' floor under a ring of seats. */
export function sunkenArena() {
  const r = new RoomSpec('Sunken Arena', { kind: 'interior', theme: 120, seed: 33, note: 'A circular fighting floor, a ring of cages and columns on a step above.' });
  const f = r.floor(B), h = r.floor(B, { clear: 6.4 }), rim = r.floor(B + 0.4, { clear: 6.4 });
  r.port('N', 'B', 13, f); r.port('W', 'B', 13, f); r.port('S', 'B', 3, f); r.port('E', 'B', 3, f);
  r.disc(21.5, 21.5, 10.2, 10.2, rim); r.disc(21.5, 21.5, 7.2, 7.2, h);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.2; r.prop(k % 2 ? 'cage' : 'pillar-round-tall', 21.5 + Math.cos(a) * 8.7, 21.5 + Math.sin(a) * 8.7); }
  r.prop('statue', 21.5, 21.5);
  return r.autoLights(4, { radius: 100 }).populate({ enemies: 9, loot: 3, quest: 2, seed: 33 });
}

/** Warren (interior, A): a lattice of two-wide passages, a maze with a few loops. */
export function warren() {
  const r = new RoomSpec('Warren', { kind: 'interior', theme: 122, seed: 34, note: 'A maze of crossing passages on a four-cell lattice.' });
  const f = r.floor(A), rand = rng(34), node = (k) => 4 * k + 1, seen = new Set(['0,0']), stack = [[0, 0]], edges = [];
  while (stack.length) {
    const [a, b] = stack[stack.length - 1], nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => [a + x, b + y]).filter(([x, y]) => x >= 0 && y >= 0 && x < 8 && y < 8 && !seen.has(`${x},${y}`));
    if (!nb.length) { stack.pop(); continue; }
    const [x, y] = nb[Math.floor(rand() * nb.length)]; seen.add(`${x},${y}`); edges.push([a, b, x, y]); stack.push([x, y]);
  }
  for (let k = 0; k < 9; k++) { const a = Math.floor(rand() * 7), b = Math.floor(rand() * 8); edges.push(rand() < 0.5 ? [a, b, a + 1, b] : [b, a, b, a + 1]); }   // loops
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) r.rect(node(a), node(b), node(a) + 1, node(b) + 1, f);
  for (const [a, b, x, y] of edges) r.rect(node(Math.min(a, x)), node(Math.min(b, y)), node(Math.max(a, x)) + 1, node(Math.max(b, y)) + 1, f);
  for (const e of 'NSWE') r.port(e, 'A', 3, f);
  for (const [x, z] of [[5, 5], [13, 13], [21, 21], [29, 29], [5, 29], [29, 5], [13, 21], [21, 13]]) r.prop('stalactites', x + 1, z + 1, { up: 3.2 });
  return r.autoLights(4, { radius: 80, torches: true }).populate({ enemies: 10, loot: 4, quest: 2, seed: 34 });
}
