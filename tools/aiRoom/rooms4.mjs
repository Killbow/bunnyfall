// AI-ROOMS, batch 4: eight more border rooms and twelve more interiors. See rooms2.mjs for the conventions.
import { RoomSpec, A, B, transpose } from './dsl.mjs';
import { blobs, link, switchbackCore } from './lib.mjs';

/** Colonnade Gallery (border, A): a wide hall between two rows of columns. */
export function colonnadeGallery() {
  const r = new RoomSpec('Colonnade Gallery', { kind: 'border', theme: 120, seed: 51, note: 'A broad east-west hall, two rows of columns.' });
  const f = r.floor(A), h = r.floor(A, { clear: 4.8 });
  r.port('N', 'A', 12, f); r.port('S', 'A', 12, f); r.port('W', 'A', 4, f); r.port('E', 'A', 4, f);
  r.corridor(0, 9, 6, 12, f); r.corridor(31, 9, 25, 12, f);
  r.rect(5, 12, 26, 19, h);
  for (const x of [7, 13, 16, 19, 22, 25]) { r.prop('pillar-round', x, 13.2); r.prop('pillar-round', x, 18.8); }
  r.prop('statue', 5.8, 16); r.prop('statue', 25.8, 16);
  return r.autoLights(4).populate({ enemies: 7, loot: 3, quest: 2, seed: 51 });
}

/** Terraced Cavern (border, B): a cave that steps up in three rings. */
export function terracedCavern() {
  const r = new RoomSpec('Terraced Cavern', { kind: 'border', theme: 120, seed: 52, note: 'Rock in three terraces, each 0.4 m above the last.' });
  const f = r.floor(B), t0 = r.floor(B, { clear: 4.8 }), t1 = r.floor(B + 0.4, { clear: 4.8 }), t2 = r.floor(B + 0.8, { clear: 4.8 });
  r.port('N', 'B', 12, f); r.port('W', 'B', 12, f); r.port('S', 'B', 3, f); r.port('E', 'B', 3, f);
  r.disc(21.5, 21.5, 10, 10, t0).disc(21.5, 21.5, 7, 7, t1).disc(21.5, 21.5, 4, 4, t2);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.5; r.prop('stalagmites', 21.5 + Math.cos(a) * 8.6, 21.5 + Math.sin(a) * 8.6, { rot: k * 50 }); r.prop('stalactites', 21.5 + Math.cos(a + 0.5) * 5.4, 21.5 + Math.sin(a + 0.5) * 5.4, { up: 4.8 }); }
  r.prop('altar', 21.5, 21.5);
  return r.autoLights(5, { radius: 85, torches: false }).populate({ enemies: 8, loot: 3, quest: 2, seed: 52 });
}

/** Causeway (border, A): a hall over a deep pit crossed by two stone causeways. */
export function causeway() {
  const r = new RoomSpec('Causeway', { kind: 'border', theme: 124, seed: 53, note: 'Two causeways cross a pit 3.2 m deep; a ramp leads down into each of its four corners.' });
  const f = r.floor(A), h = r.floor(A, { clear: 6.4 }), pit = r.floor(A - 3.2, { clear: 9.6 });
  r.port('N', 'A', 5, f); r.port('S', 'A', 5, f); r.port('W', 'A', 5, f); r.port('E', 'A', 5, f);
  r.rect(4, 4, 27, 27, h).rect(8, 8, 23, 23, pit);
  r.rect(8, 14, 23, 17, h).rect(14, 8, 17, 23, h);                       // the causeways
  r.rect(8, 9, 12, 10, r.ramp('-x', { clear: 6.4 }));                      // a ramp from the hall down into each corner of the pit
  r.rect(19, 21, 23, 22, r.ramp('+x', { clear: 6.4 }));
  r.rect(19, 8, 20, 12, r.ramp('-z', { clear: 6.4 }));
  r.rect(11, 19, 12, 23, r.ramp('+z', { clear: 6.4 }));
  for (const [x, z] of [[14.5, 14.5], [17.5, 14.5], [14.5, 17.5], [17.5, 17.5]]) r.prop('pillar-square', x, z);
  r.prop('statue', 5.5, 5.5); r.prop('statue', 26.5, 26.5); r.prop('bone-pile', 10.5, 12.5); r.prop('rubble', 21, 12.5);
  return r.autoLights(4, { radius: 100 }).populate({ enemies: 8, loot: 4, quest: 2, seed: 53 });
}

/** Octagon Chapel (border, B): an eight-sided chapel, an altar at its heart. */
export function octagonChapel() {
  const r = new RoomSpec('Octagon Chapel', { kind: 'border', theme: 123, seed: 54, note: 'An eight-sided chapel with an altar and eight columns.' });
  const f = r.floor(B), h = r.floor(B, { clear: 5.6 });
  r.port('N', 'B', 15, f); r.port('W', 'B', 15, f); r.port('S', 'B', 4, f); r.port('E', 'B', 4, f);
  r.octagon(21.5, 21.5, 8, h);
  r.prop('altar', 21.5, 21.5);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; r.prop('pillar-round', 21.5 + Math.cos(a) * 6.6, 21.5 + Math.sin(a) * 6.6); }
  for (const [x, z] of [[17.5, 17.5], [25.5, 17.5], [17.5, 25.5], [25.5, 25.5]]) r.prop('statue', x, z);
  return r.autoLights(4, { radius: 100 }).populate({ enemies: 6, loot: 3, quest: 2, seed: 54 });
}

/** Four Shrines (border, A): corridors crossing, a shrine chamber in each corner of the crossing. */
export function fourShrines() {
  const r = new RoomSpec('Four Shrines', { kind: 'border', theme: 124, seed: 55, note: 'Cross corridors with a small shrine off each quarter.' });
  const f = r.floor(A), s = r.floor(A, { clear: 4.8 });
  r.rect(9, 0, 10, 31, f).rect(0, 9, 31, 10, f);
  for (const e of 'NSWE') r.port(e, 'A', 3, f);
  r.rect(12, 2, 17, 7, s).rect(11, 4, 11, 5, f);        // north-east
  r.rect(12, 13, 17, 18, s).rect(11, 15, 11, 16, f);    // south-east
  r.rect(2, 13, 7, 18, s).rect(8, 15, 8, 16, f);        // south-west
  r.rect(2, 2, 7, 7, s).rect(8, 4, 8, 5, f);            // north-west
  r.prop('altar', 15, 4); r.prop('altar', 15, 16, { rot: 0 }); r.prop('altar', 5, 16); r.prop('statue', 5, 4.6);
  r.prop('lectern', 13, 6.2); r.prop('lectern', 6.2, 14); r.prop('statue', 16.5, 14.2);
  return r.autoLights(4, { radius: 90 }).populate({ enemies: 7, loot: 4, quest: 2, seed: 55 });
}

/** Ruined Crossing (border, B): a round hall at the crossing of the lower corridors, half fallen in. */
export function ruinedCrossing() {
  const r = new RoomSpec('Ruined Crossing', { kind: 'border', theme: 122, seed: 56, note: 'A round hall at the crossing, its roof and columns half down.' });
  const f = r.floor(B), h = r.floor(B, { clear: 4.8 });
  r.rect(21, 0, 22, 31, f).rect(0, 21, 31, 22, f);
  for (const e of 'NSWE') r.port(e, 'B', 3, f);
  r.disc(22, 22, 6, 6, h);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.8; r.prop(k % 2 ? 'pillar-round' : 'pillar-broken', 22 + Math.cos(a) * 4, 22 + Math.sin(a) * 4); }
  r.prop('rubble', 19.2, 19.2); r.prop('rubble', 25, 24.5, { rot: 50 }); r.prop('bone-pile', 24.5, 19);
  r.prop('stalactites', 22, 22, { up: 4.8 });
  return r.autoLights(4, { radius: 85 }).populate({ enemies: 7, loot: 3, quest: 2, seed: 56 });
}

/** Barrow Gate (border, A): a walled gate court, an arch at each of its four mouths. */
export function barrowGate() {
  const r = new RoomSpec('Barrow Gate', { kind: 'border', theme: 123, seed: 57, note: 'A square court with an arch at each entrance and a well in the middle.' });
  const f = r.floor(A), h = r.floor(A, { clear: 4.8 });
  r.port('N', 'A', 9, f); r.port('S', 'A', 9, f); r.port('W', 'A', 9, f); r.port('E', 'A', 9, f);
  r.rect(8, 8, 23, 23, h);
  r.prop('arch', 10, 6.5); r.prop('arch', 10, 25.5); r.prop('arch', 6.5, 10, { rot: 90 }); r.prop('arch', 25.5, 10, { rot: 90 });
  r.prop('well', 16, 16);
  for (const [x, z] of [[9.5, 15], [22.5, 15], [15, 9.5], [15, 22.5]]) r.prop('statue', x, z);
  return r.autoLights(4, { radius: 95 }).populate({ enemies: 7, loot: 3, quest: 2, seed: 57 });
}

/** Lantern Hall (border, B): a hall of braziers and lamps. */
export function lanternHall() {
  const r = new RoomSpec('Lantern Hall', { kind: 'border', theme: 124, seed: 58, note: 'Braziers burn all along a wide lower hall.' });
  const f = r.floor(B), h = r.floor(B, { clear: 5.6 });
  r.port('N', 'B', 13, f); r.port('S', 'B', 4, f); r.port('W', 'B', 7, f); r.port('E', 'B', 6, f);
  r.rect(6, 12, 26, 28, h);
  for (let k = 0; k < 6; k++) { r.flat('brazier', 8 + k * 3.4, 13.2); r.flat('brazier', 8 + k * 3.4, 27.2); }
  for (const x of [9, 14, 25]) { r.prop('pillar-square', x, 16.5); r.prop('pillar-square', x, 24.5); }
  r.prop('altar', 16, 20); r.prop('stone-table', 11, 20.5, { rot: 90 });
  return r.autoLights(3, { radius: 110, torches: false }).populate({ enemies: 7, loot: 4, quest: 2, seed: 58 });
}

/** Tomb of Kings (interior, A): a great hall round a stepped platform and a royal coffin. */
export function tombOfKings() {
  const r = new RoomSpec('Tomb of Kings', { kind: 'interior', theme: 123, seed: 61, note: 'A high hall; on its stepped platform a great sarcophagus guarded by statues.' });
  const f = r.floor(A), h = r.floor(A, { clear: 6.4 }), s1 = r.floor(A + 0.4, { clear: 6.4 }), s2 = r.floor(A + 0.8, { clear: 6.4 });
  r.port('N', 'A', 6, f); r.port('S', 'A', 6, f); r.port('W', 'A', 8, f); r.port('E', 'A', 8, f);
  r.rect(7, 5, 24, 26, h).rect(11, 9, 20, 22, s1).rect(13, 12, 18, 19, s2);
  r.prop('sarcophagus', 16, 15.5, { rot: 90 });
  for (const [x, z] of [[11.6, 9.6], [20.4, 9.6], [11.6, 21.4], [20.4, 21.4]]) r.prop('statue', x, z);
  for (const [x, z] of [[8.5, 6.5], [23.5, 6.5], [8.5, 24.5], [23.5, 24.5]]) r.prop('pillar-round-tall', x, z);
  return r.autoLights(4, { radius: 105 }).populate({ enemies: 8, loot: 5, quest: 2, seed: 61 });
}

/** Gallery of Statues (interior, B): a long hall with a figure between every pair of columns. */
export function galleryOfStatues() {
  const r = new RoomSpec('Gallery of Statues', { kind: 'interior', theme: 120, seed: 62, note: 'Statues stand in two rows down a long lower hall.' });
  const f = r.floor(B), h = r.floor(B, { clear: 5.6 });
  r.port('N', 'B', 17, f); r.port('S', 'B', 4, f); r.port('W', 'B', 5, f); r.port('E', 'B', 5, f);
  r.rect(4, 16, 27, 27, h);
  for (const x of [6, 9, 12, 15, 18, 25]) { r.prop('statue', x, 17.2, { rot: 180 }); r.prop('statue', x, 26.2); }
  for (const [x, z] of [[8, 19.2], [14, 24.2], [26, 19.2]]) r.prop('pillar-round', x, z);
  return r.autoLights(4, { radius: 95 }).populate({ enemies: 8, loot: 4, quest: 2, seed: 62 });
}

/** Torture Chamber (interior, B): a central pit-room and cells off the passage, cages and bones. */
export function tortureChamber() {
  const r = new RoomSpec('Torture Chamber', { kind: 'interior', theme: 122, seed: 63, note: 'A central chamber of cages and slabs, small cells off the western passage.' });
  const f = r.floor(B), h = r.floor(B, { clear: 4.8 });
  r.port('N', 'B', 17, f); r.port('S', 'B', 6, f); r.port('W', 'B', 17, f); r.port('E', 'B', 6, f);
  r.rect(17, 17, 26, 26, h);
  r.rect(3, 14, 9, 19, h).rect(5, 20, 6, 20, f);      // a cell above the western passage
  r.rect(3, 24, 9, 29, h).rect(5, 23, 6, 23, f);      // and one below it
  r.prop('cage', 6, 16.5); r.prop('cage', 6, 26.5); r.prop('stone-table', 20, 19, { rot: 0 }); r.prop('stone-table', 24, 24, { rot: 90 });
  r.prop('cage', 19, 24); r.prop('bone-pile', 24.5, 18.5); r.prop('bone-pile', 8, 18); r.prop('bone-pile', 8, 27.5);
  return r.autoLights(4, { radius: 85 }).populate({ enemies: 9, loot: 3, quest: 2, seed: 63 });
}

/** Great Stairwell (interior, both floors): the double flight turned a quarter, in another stone. */
export function greatStairwell() {
  const base = new RoomSpec('base', { kind: 'interior', theme: 120 });
  switchbackCore(base);
  const r = transpose(base, 'Great Stairwell', { kind: 'interior', theme: 120, note: 'A double flight down 19.2 m: upper ports W and N, lower ports W, E and S.' });
  return r.autoLights(4, { radius: 100 }).populate({ enemies: 7, loot: 3, quest: 2, seed: 64 });
}

/** Barracks (interior, A): sleeping rooms off a long passage. */
export function barracks() {
  const r = new RoomSpec('Barracks', { kind: 'interior', theme: 122, seed: 65, note: 'A guardroom passage with small rooms on both sides.' });
  const f = r.floor(A);
  r.rect(0, 9, 31, 10, f);
  r.port('N', 'A', 9, f); r.port('S', 'A', 21, f); r.port('W', 'A', 3, f); r.port('E', 'A', 3, f);
  for (const x of [2, 12, 20]) { r.rect(x, 2, x + 5, 7, f).rect(x + 2, 8, x + 3, 8, f); r.prop('stone-table', x + 2.5, 4.5, { rot: 90 }); }
  for (const x of [2, 12, 20]) { r.rect(x, 13, x + 5, 18, f).rect(x + 2, 11, x + 3, 12, f); r.prop('stone-table', x + 2.5, 15.5, { rot: 90 }); }
  r.prop('lectern', 25.5, 15.5); r.prop('bone-pile', 3.5, 16.8);
  return r.autoLights(4, { radius: 85 }).populate({ enemies: 9, loot: 4, quest: 2, seed: 65 });
}

/** Crossroads Pillar (interior, A): an octagonal hall round one vast column. */
export function crossroadsPillar() {
  const r = new RoomSpec('Crossroads Pillar', { kind: 'interior', theme: 124, seed: 66, note: 'An octagonal hall, one huge column in the middle and four about it.' });
  const f = r.floor(A), h = r.floor(A, { clear: 6.4 });
  for (const e of 'NSWE') r.port(e, 'A', 7, f);
  r.octagon(16, 16, 9.5, h);
  r.prop('pillar-round-tall', 16, 16);
  for (const [x, z] of [[11.5, 11.5], [20.5, 11.5], [11.5, 20.5], [20.5, 20.5]]) r.prop('pillar-square-tall', x, z);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; r.prop('statue', 16 + Math.cos(a) * 7.4, 16 + Math.sin(a) * 7.4); }
  return r.autoLights(4, { radius: 105 }).populate({ enemies: 8, loot: 4, quest: 2, seed: 66 });
}

/** Cistern Vaults (interior, B): a low vaulted hall of columns in rows. */
export function cisternVaults() {
  const r = new RoomSpec('Cistern Vaults', { kind: 'interior', theme: 123, seed: 67, note: 'A low square hall, a grid of short columns.' });
  const f = r.floor(B), h = r.floor(B);
  for (const e of 'NSWE') r.port(e, 'B', 4, f);
  r.rect(3, 3, 28, 28, h);
  for (const x of [6, 10, 14, 18, 26]) for (const z of [6, 10, 14, 18, 26]) r.prop('pillar-round', x, z);
  r.prop('well', 24.5, 24.5);
  return r.autoLights(4, { radius: 80 }).populate({ enemies: 9, loot: 3, quest: 2, seed: 67 });
}

/** Altar Cave (interior, A): a cave with a lone altar on its main floor, fangs around it. */
export function altarCave() {
  const r = new RoomSpec('Altar Cave', { kind: 'interior', theme: 120, seed: 68, note: 'Natural rock, an altar and a ring of standing stones.' });
  const f = r.floor(A), c = r.floor(A, { clear: 5.6 }), dais = r.floor(A + 0.4, { clear: 5.6 });
  const blob = blobs(r, c, 16, 16, { n: 8, rmin: 3.2, rmax: 5, step: 4.2, seed: 68 });
  r.disc(blob[0][0], blob[0][1], 2.6, 2.6, dais);
  for (const e of 'NSWE') r.port(e, 'A', 3, f);
  for (const e of 'NSWE') link(r, e, 'A', 16, 16, f);
  r.prop('altar', Math.floor(blob[0][0]) + 0.5, Math.floor(blob[0][1]) + 0.5);
  blob.slice(1).forEach(([x, z], k) => { r.prop('stalagmites', Math.floor(x) + 0.5, Math.floor(z) + 0.5, { rot: k * 45 }); r.prop('stalactites', Math.floor(x) + 1.5, Math.floor(z) + 1.5, { up: 5.6 }); });
  return r.autoLights(5, { radius: 85, torches: false }).populate({ enemies: 8, loot: 4, quest: 2, seed: 68 });
}

/** Round Keep (interior, B): a ring corridor round a small keep with one door. */
export function roundKeep() {
  const r = new RoomSpec('Round Keep', { kind: 'interior', theme: 124, seed: 69, note: 'A ring passage round a drum-shaped keep, entered by one door.' });
  const f = r.floor(B), h = r.floor(B, { clear: 4.8 });
  r.port('N', 'B', 13, f); r.port('W', 'B', 13, f); r.port('S', 'B', 4, f); r.port('E', 'B', 4, f);
  r.annulus(21.5, 21.5, 9.5, 6, h);
  r.disc(21.5, 21.5, 4.5, 4.5, h);
  r.rect(21, 15, 22, 17, f);                       // the keep's door, on its north side
  r.prop('altar', 21.5, 21.5); r.prop('statue', 18.8, 18.8); r.prop('statue', 24.2, 24.2);
  for (const [x, z] of [[21.5, 13.5], [29.5, 21.5], [21.5, 29.5], [13.5, 21.5]]) r.prop('pillar-round', x, z);
  return r.autoLights(4, { radius: 90 }).populate({ enemies: 8, loot: 3, quest: 2, seed: 69 });
}

/** Pier Hall (interior, A): a square hall broken up by four solid piers. */
export function pierHall() {
  const r = new RoomSpec('Pier Hall', { kind: 'interior', theme: 122, seed: 70, note: 'Four massive piers of masonry stand in a square hall.' });
  const f = r.floor(A), h = r.floor(A, { clear: 4.8 });
  for (const e of 'NSWE') r.port(e, 'A', 9, f);
  r.rect(8, 8, 23, 23, h);
  for (const [x, z] of [[12, 12], [18, 12], [12, 18], [18, 18]]) r.rect(x, z, x + 1, z + 1, ' ');
  r.prop('sarcophagus', 16, 15.2, { rot: 0 }); r.prop('altar', 16, 9.2); r.prop('statue', 9.6, 22.2); r.prop('statue', 22.4, 22.2);
  return r.autoLights(4, { radius: 95 }).populate({ enemies: 8, loot: 4, quest: 2, seed: 70 });
}

/** Mausoleum (interior, A): a long aisle with a coffin in every niche and an altar at the head. */
export function mausoleum() {
  const r = new RoomSpec('Mausoleum', { kind: 'interior', theme: 123, seed: 71, note: 'A north-south aisle lined with niches of coffins.' });
  const f = r.floor(A), h = r.floor(A, { clear: 4.8 });
  r.rect(12, 3, 19, 28, h);
  r.port('N', 'A', 3, f); r.port('S', 'A', 3, f); r.port('W', 'A', 12, f); r.port('E', 'A', 12, f);
  r.rect(9, 1, 13, 2, f).rect(9, 29, 13, 30, f);
  for (const row of [4, 13, 17, 21, 25]) { r.rect(9, row, 11, row + 1, f).rect(20, row, 22, row + 1, f); r.prop('sarcophagus', 10.5, row + 1, { rot: 0 }); r.prop('sarcophagus', 21.5, row + 1, { rot: 0 }); }
  r.prop('altar', 16, 4.4); r.prop('statue', 13, 27); r.prop('statue', 19, 27);
  return r.autoLights(4, { radius: 90 }).populate({ enemies: 8, loot: 5, quest: 2, seed: 71 });
}

/** Sinkhole (interior, B): a huge round chamber hung with stalactites, half buried in rubble. */
export function sinkhole() {
  const r = new RoomSpec('Sinkhole', { kind: 'interior', theme: 122, seed: 72, note: 'A vast round cave, stone fangs hanging and rubble heaped below.' });
  const f = r.floor(B), c = r.floor(B, { clear: 7.2 });
  r.disc(21.5, 21.5, 9.2, 9.2, c);
  for (const e of 'NSWE') r.port(e, 'B', 3, f);
  for (const e of 'NSWE') link(r, e, 'B', 21.5, 21.5, f);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; r.prop('stalactites', 21.5 + Math.cos(a) * 6.5, 21.5 + Math.sin(a) * 6.5, { up: 7.2 }); r.prop(k % 2 ? 'rubble' : 'stalagmites', 21.5 + Math.cos(a + 0.5) * 7.4, 21.5 + Math.sin(a + 0.5) * 7.4, { rot: k * 40 }); }
  r.prop('stalactites', 21.5, 21.5, { up: 7.2 });
  return r.autoLights(5, { radius: 90, torches: false }).populate({ enemies: 9, loot: 4, quest: 2, seed: 72 });
}
