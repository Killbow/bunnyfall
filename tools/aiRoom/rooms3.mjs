// AI-ROOMS, batch 3: the rest of the interiors. See rooms2.mjs.
import { RoomSpec, A, B, rng } from './dsl.mjs';
import { blobs, link } from './lib.mjs';

/** Ossuary (interior, B): a low barrow of skulls, tables laid with bones, a coffin at either end. */
export function ossuary() {
  const r = new RoomSpec('Ossuary', { kind: 'interior', theme: 123, seed: 41, note: 'A long low hall, bones heaped on every side.' });
  const f = r.floor(B), h = r.floor(B, { clear: 4.8 });
  r.port('N', 'B', 18, f); r.port('S', 'B', 6, f); r.port('W', 'B', 3, f); r.port('E', 'B', 3, f);
  r.rect(2, 18, 29, 25, h); r.rect(4, 14, 8, 17, h); r.rect(23, 14, 27, 17, h); r.rect(4, 26, 8, 29, h); r.rect(23, 26, 27, 29, h);
  for (const [x, z] of [[6, 15.5], [25, 15.5], [6, 27.5], [25, 27.5]]) r.prop('sarcophagus', x, z, { rot: 90 });
  for (const x of [11, 15, 19]) { r.prop('stone-table', x, 20.2, { rot: 0 }); r.prop('bone-pile', x, 23.4); }
  r.prop('bone-pile', 3.5, 19.5); r.prop('bone-pile', 28.5, 24.5); r.prop('pillar-round', 13, 22); r.prop('pillar-round', 17, 22);
  return r.autoLights(4, { radius: 85 }).populate({ enemies: 9, loot: 3, quest: 2, seed: 41 });
}

/** Library of Slabs (interior, A): rows of lecterns and tables in a columned reading hall. */
export function library() {
  const r = new RoomSpec('Library of Slabs', { kind: 'interior', theme: 124, seed: 42, note: 'Reading stands and slab tables in ordered rows.' });
  const f = r.floor(A), h = r.floor(A, { clear: 4.8 });
  for (const e of 'NSWE') r.port(e, 'A', 7, f);
  r.rect(7, 7, 24, 24, h);
  r.rect(25, 12, 28, 19, h);           // a side study
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) { const x = 10.5 + col * 3.6, z = 10.5 + row * 4.6; r.prop(col % 2 ? 'lectern' : 'stone-table', x, z, { rot: col % 2 ? 0 : 90 }); }
  r.prop('pillar-square', 8.5, 8.5); r.prop('pillar-square', 23.5, 8.5); r.prop('pillar-square', 8.5, 23.5); r.prop('pillar-square', 23.5, 23.5);
  r.prop('statue', 26.8, 14.8); r.prop('altar', 26.5, 18.2, { rot: 90 });
  return r.autoLights(4, { radius: 95 }).populate({ enemies: 7, loot: 5, quest: 2, seed: 42 });
}

/** Pit Hall (interior, A): a hall with a sunken pit in the middle, reached by a ramp. */
export function pitHall() {
  const r = new RoomSpec('Pit Hall', { kind: 'interior', theme: 120, seed: 43, note: 'A walled-in pit with its own ramp: the loot is below.' });
  const f = r.floor(A), h = r.floor(A, { clear: 4.8 }), pit = r.floor(A - 3.2, { clear: 4.8 + 3.2 }), rp = r.ramp('+z', { clear: 4.8 });
  for (const e of 'NSWE') r.port(e, 'A', 7, f);
  r.rect(7, 7, 24, 24, h);
  r.rect(11, 12, 20, 21, pit);                      // the pit (floor 28.8)
  r.rect(14, 10, 17, 11, h);                        // landing at its head
  r.rect(14, 12, 17, 12, ' ');                      // (kept solid: the ramp starts below)
  r.rect(14, 12, 17, 16, rp);                       // the ramp: from the hall down into the pit, 3.2 m over 5 cells
  r.rect(14, 17, 17, 21, pit);
  for (const [x, z] of [[9.5, 9.5], [22.5, 9.5], [9.5, 22.5], [22.5, 22.5]]) r.prop('statue', x, z);
  r.prop('bone-pile', 12.5, 19.5); r.prop('bone-pile', 19, 14); r.prop('rubble', 18.5, 20);
  return r.autoLights(4).populate({ enemies: 8, loot: 4, quest: 2, seed: 43 });
}

/** Collapsed Passage (interior, A): a cave in a worked tunnel, rubble and broken columns everywhere. */
export function collapsedPassage() {
  const r = new RoomSpec('Collapsed Passage', { kind: 'interior', theme: 122, seed: 44, note: 'A tunnel broken into caves, half of it fallen.' });
  const f = r.floor(A), c = r.floor(A, { clear: 4.8 });
  const blob = blobs(r, c, 16, 16, { n: 7, rmin: 2.4, rmax: 4.2, step: 4, seed: 44 });
  for (const e of 'NSWE') r.port(e, 'A', 3, f);
  for (const e of 'NSWE') link(r, e, 'A', 16, 16, f);
  blob.forEach(([x, z], k) => { r.prop(k % 2 ? 'rubble' : 'pillar-broken', Math.floor(x) + 0.5, Math.floor(z) + 0.5, { rot: k * 50 }); });
  r.prop('stalactites', 16.5, 16.5, { up: 4.8 });
  return r.autoLights(5, { radius: 80 }).populate({ enemies: 8, loot: 3, quest: 2, seed: 44 });
}

/** Prison Block (interior, B): a long corridor between cells, cages in the cells, barred gates on their doors. */
export function prisonBlock() {
  const r = new RoomSpec('Prison Block', { kind: 'interior', theme: 124, seed: 45, note: 'A cellblock: gated cells off a long passage.' });
  const f = r.floor(B);
  r.port('N', 'B', 21, f); r.port('S', 'B', 10, f); r.port('W', 'B', 3, f); r.port('E', 'B', 3, f);
  r.rect(0, 21, 31, 22, f);
  for (const x of [3, 9, 15, 26]) { r.rect(x, 15, x + 3, 19, f).rect(x + 1, 20, x + 2, 20, f); r.prop('cage', x + 2, 16.6); r.prop('arch', x + 2, 20.4, { rot: 0 }); }
  for (const x of [3, 9, 15, 26]) { r.rect(x, 24, x + 3, 28, f).rect(x + 1, 23, x + 2, 23, f); r.prop('cage', x + 2, 27.4); r.prop('arch', x + 2, 23.6, { rot: 0 }); }
  return r.autoLights(4, { radius: 85 }).populate({ enemies: 9, loot: 4, quest: 2, seed: 45 });
}

/** Cruciform Chapel (interior, A): a nave and transept crossing at an altar. */
export function cruciformChapel() {
  const r = new RoomSpec('Cruciform Chapel', { kind: 'interior', theme: 124, seed: 46, note: 'A high-roofed cross: nave north-south, transept east-west, an altar at the crossing.' });
  const f = r.floor(A), h = r.floor(A, { clear: 6.4 });
  for (const e of 'NSWE') r.port(e, 'A', 3, f);
  r.rect(9, 3, 22, 28, h); r.rect(3, 9, 28, 22, h);
  r.rect(9, 0, 10, 3, f); r.rect(9, 28, 10, 31, f); r.rect(0, 9, 3, 10, f); r.rect(28, 9, 31, 10, f);
  r.prop('altar', 16, 16); 
  for (const [x, z] of [[11.5, 11.5], [20.5, 11.5], [11.5, 20.5], [20.5, 20.5]]) r.prop('pillar-round-tall', x, z);
  r.prop('statue', 15, 4.5); r.prop('statue', 17, 27.5, { rot: 180 }); r.prop('statue', 4.5, 17, { rot: 90 }); r.prop('statue', 27.5, 15, { rot: 270 });
  return r.autoLights(4, { radius: 100 }).populate({ enemies: 7, loot: 4, quest: 2, seed: 46 });
}

/** Hourglass (interior, A): two round chambers joined by a narrow neck. */
export function hourglass() {
  const r = new RoomSpec('Hourglass', { kind: 'interior', theme: 122, seed: 47, note: 'Two round chambers and a narrow neck between them.' });
  const f = r.floor(A), h = r.floor(A, { clear: 5.6 });
  r.disc(16, 8, 6.2, 6.2, h); r.disc(16, 24, 6.2, 6.2, h); r.rect(15, 13, 16, 18, f);
  r.port('N', 'A', 8, f); r.port('S', 'A', 8, f); r.port('W', 'A', 11, f); r.port('E', 'A', 11, f);
  r.rect(0, 22, 0, 22, ' ');
  link(r, 'S', 'A', 16, 24, f);
  r.prop('statue', 16, 8); r.prop('altar', 16, 24.2);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; r.prop('pillar-round', 16 + Math.cos(a) * 4.5, 8 + Math.sin(a) * 4.5); r.prop('pillar-round', 16 + Math.cos(a + 0.5) * 4.5, 24 + Math.sin(a + 0.5) * 4.5); }
  return r.autoLights(4, { radius: 95 }).populate({ enemies: 8, loot: 4, quest: 2, seed: 47 });
}

/** Sump Tunnels (interior, B): low natural tunnels with cold stone fangs. */
export function sumpTunnels() {
  const r = new RoomSpec('Sump Tunnels', { kind: 'interior', theme: 123, seed: 48, note: 'Low wet tunnels in the rock, the lower corridors all meeting here.' });
  const f = r.floor(B), c = r.floor(B, { clear: 3.2 });
  const blob = blobs(r, c, 21.5, 21.5, { n: 10, rmin: 2.2, rmax: 3.8, step: 4.2, seed: 48 });
  for (const e of 'NSWE') r.port(e, 'B', 3, f);
  for (const e of 'NSWE') link(r, e, 'B', 21.5, 21.5, f);
  blob.slice(1).forEach(([x, z], k) => { r.prop('stalagmites', Math.floor(x) + 0.5, Math.floor(z) + 0.5, { rot: k * 40 }); });
  r.prop('stalactites', 21.5, 21.5, { up: 3.2 });
  return r.autoLights(5, { radius: 75, torches: false }).populate({ enemies: 9, loot: 3, quest: 2, seed: 48 });
}

/** Forge Hall (interior, B): a smithy hall of braziers and anvil-slabs, a statue of the smith at the far end. */
export function forgeHall() {
  const r = new RoomSpec('Forge Hall', { kind: 'interior', theme: 120, seed: 49, note: 'Braziers burn along a long hall of slab anvils.' });
  const f = r.floor(B), h = r.floor(B, { clear: 5.6 });
  r.port('N', 'B', 10, f); r.port('S', 'B', 5, f); r.port('W', 'B', 6, f); r.port('E', 'B', 6, f);
  r.rect(6, 10, 25, 27, h); r.rect(25, 20, 29, 23, h); r.rect(2, 20, 6, 23, h);
  for (const x of [9, 13, 17]) { r.prop('stone-table', x, 14.2, { rot: 90 }); r.prop('stone-table', x, 24.8, { rot: 90 }); r.flat('brazier', x + 1.6, 12.2); r.flat('brazier', x + 1.6, 26.2); }
  r.prop('statue', 22.5, 12.5); r.prop('altar', 16, 11.2);
  for (const [x, z] of [[7.5, 11.5], [24.5, 11.5], [7.5, 26.5], [24.5, 26.5]]) r.prop('pillar-square', x, z);
  return r.autoLights(4, { radius: 105 }).populate({ enemies: 8, loot: 4, quest: 2, seed: 49 });
}
