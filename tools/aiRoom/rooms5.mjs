// AI-ROOMS, batch 5: ROOMS WITH VERTICAL STRUCTURE. Stairs and ramps between several heights, galleries over halls,
// pits and shafts with a way down and a rail at the edge, a catwalk crossing a hall (a second layer), a stepped sanctum.
// Rises are 3.2 m a storey; ramps climb at most 0.45 (a 3.2 m rise takes 5 cells, 6.4 m takes 10). See rooms2.mjs.
import { RoomSpec, A, B } from './dsl.mjs';

/** Atrium (interior, both floors): a spiral stair up the walls of a 19 m shaft, a balcony over it. */
export function atrium() {
  const r = new RoomSpec('Atrium', { kind: 'interior', theme: 123, seed: 81, note: 'Three flights climb the walls of a deep shaft, from its floor (12.8) to a balcony (32.0) that looks down into it.' });
  const low = r.floor(B), l192 = r.floor(19.2), l256 = r.floor(25.6), top = r.floor(A), shaft = r.floor(B, { clear: 22.4 }), strip = r.floor(A, { rail: true });
  r.rect(11, 11, 20, 20, shaft);                                  // the shaft's floor
  r.rect(21, 21, 22, 22, low).rect(20, 21, 20, 22, low);          // the foot of the stair, one step from the shaft
  r.rect(11, 21, 19, 22, r.ramp('-x', { rail: true }));           // flight 1, west along the south wall: 12.8 -> 19.2
  r.rect(9, 21, 10, 22, l192);
  r.rect(9, 11, 10, 20, r.ramp('-z', { rail: true }));            // flight 2, north along the west wall: 19.2 -> 25.6
  r.rect(9, 9, 10, 10, l256);
  r.rect(11, 9, 20, 10, r.ramp('+x', { rail: true }));            // flight 3, east along the north wall: 25.6 -> 32.0
  r.rect(21, 9, 22, 10, top);
  r.rect(21, 11, 22, 19, strip);                                  // the balcony down the east side, over the shaft
  r.port('S', 'B', 9, low); r.port('E', 'B', 9, low); r.port('E', 'A', 9, top);
  r.prop('altar', 16, 16); for (const [x, z] of [[12.5, 12.5], [19.5, 12.5], [12.5, 19.5], [19.5, 19.5]]) r.prop('statue', x, z);
  r.prop('statue', 22, 15, { rot: 270 });
  r.light(16, 16, { up: 9, radius: 170 }).light(16, 16, { up: 19, radius: 170 }).light(22, 15, { up: 2.3, radius: 100 });
  r.joinsLevels = true;
  return r.autoLights(5, { radius: 95 }).populate({ enemies: 9, loot: 4, quest: 2, seed: 81 });
}

/** Overlook Hall (interior, A): a hall as high as three floors, a gallery down each long side, stairs up to both. */
export function overlookHall() {
  const r = new RoomSpec('Overlook Hall', { kind: 'interior', theme: 124, seed: 82, note: 'A tall hall with galleries along its north and south walls, reached by flights at their ends; columns 9.6 m high.' });
  const hall = r.floor(A, { clear: 9.6 }), gal = r.floor(35.2, { clear: 6.4, rail: true }), gap = r.floor(A);
  r.rect(6, 8, 25, 23, hall);
  r.rect(6, 5, 25, 7, gal).rect(6, 24, 25, 26, gal);
  r.rect(9, 5, 10, 7, gap).rect(9, 24, 10, 26, gap);              // the north and south doors pass under the galleries' gaps
  r.rect(7, 8, 8, 12, r.ramp('-z', { clear: 6.4 })).rect(23, 8, 24, 12, r.ramp('-z', { clear: 6.4 }));
  r.rect(7, 19, 8, 23, r.ramp('+z', { clear: 6.4 })).rect(23, 19, 24, 23, r.ramp('+z', { clear: 6.4 }));
  r.port('N', 'A', 5, gap); r.port('S', 'A', 5, gap); r.port('W', 'A', 6, gap); r.port('E', 'A', 6, gap);
  for (const x of [12.5, 16, 19.5]) { r.prop('pillar-huge', x, 12.5); r.prop('pillar-huge', x, 19.5); }
  r.prop('altar', 16, 16); r.prop('statue', 13, 6.2); r.prop('statue', 19, 6.2, { rot: 0 }); r.prop('statue', 13, 25, { rot: 180 }); r.prop('statue', 19, 25, { rot: 180 });
  return r.autoLights(4, { radius: 120 }).populate({ enemies: 9, loot: 5, quest: 2, seed: 82 });
}

/** Sunken Court (border, B): a fighting floor sunk 3.2 m in a terrace, a wide stair down from each side. */
export function sunkenCourt() {
  const r = new RoomSpec('Sunken Court', { kind: 'border', theme: 120, seed: 83, note: 'A terrace round a sunken court, four stairs down, a rail along the rim.' });
  const terr = r.floor(B, { clear: 6.4, rail: true }), court = r.floor(9.6, { clear: 9.6 });
  r.rect(4, 4, 27, 27, terr).rect(11, 11, 20, 20, court);
  r.rect(14, 6, 17, 10, r.ramp('-z', { clear: 6.4 })).rect(14, 21, 17, 25, r.ramp('+z', { clear: 6.4 }));
  r.rect(6, 14, 10, 17, r.ramp('-x', { clear: 6.4 })).rect(21, 14, 25, 17, r.ramp('+x', { clear: 6.4 }));
  r.port('N', 'B', 4); r.port('S', 'B', 4); r.port('W', 'B', 4); r.port('E', 'B', 4);
  r.prop('altar', 16, 16);
  for (const [x, z] of [[11.5, 7], [20.5, 7], [11.5, 24], [20.5, 24], [7, 11.5], [7, 20.5], [24, 11.5], [24, 20.5]]) r.prop('pillar-round-tall', x, z);
  r.prop('bone-pile', 13, 13); r.prop('bone-pile', 19, 19);
  return r.autoLights(4, { radius: 100 }).populate({ enemies: 9, loot: 4, quest: 2, seed: 83 });
}

/** Tower (interior, A): four gentle flights wind up round a hall to a summit that overlooks where you began. */
export function tower() {
  const r = new RoomSpec('Tower', { kind: 'interior', theme: 122, seed: 84, note: 'Flights climb four sides of a central hall, 9.6 m in all; the summit balcony looks down on the start.' });
  const hall = r.floor(A, { clear: 12.8 }), f0 = r.floor(A), f1 = r.floor(35.2), f2 = r.floor(38.4), f3 = r.floor(41.6), summit = r.floor(41.6, { rail: true });
  r.rect(11, 11, 20, 20, hall).rect(10, 11, 10, 11, f0);          // the hall, entered from the foot of the stair
  r.rect(8, 8, 10, 10, f0);
  r.rect(11, 8, 20, 10, r.ramp('+x', { rail: true })); r.rect(21, 8, 23, 10, f1);
  r.rect(21, 11, 23, 20, r.ramp('+z', { rail: true })); r.rect(21, 21, 23, 23, f2);
  r.rect(11, 21, 20, 23, r.ramp('-x', { rail: true })); r.rect(8, 21, 10, 23, f3);
  r.rect(8, 12, 10, 20, summit);
  r.port('N', 'A', 8, f0); r.port('W', 'A', 8, f0);
  r.prop('altar', 16, 16); r.prop('statue', 9.2, 22.4); r.prop('statue', 9.2, 13); r.prop('statue', 22.6, 9.4);
  r.light(16, 16, { up: 7, radius: 150 });
  return r.autoLights(5, { radius: 105 }).populate({ enemies: 8, loot: 5, quest: 2, seed: 84 });
}

/** Pit Cathedral (interior, A): a nave round a pit 6.4 m deep, a long ramp down each side of it. */
export function pitCathedral() {
  const r = new RoomSpec('Pit Cathedral', { kind: 'interior', theme: 123, seed: 85, note: 'A nave with a great pit in its middle; two ramps go down to its floor, and what is kept there.' });
  const nave = r.floor(A, { clear: 9.6, rail: true }), pit = r.floor(25.6, { clear: 16 });
  r.rect(4, 6, 27, 25, nave).rect(10, 11, 21, 22, pit);
  r.rect(10, 10, 11, 19, r.ramp('-z', { clear: 9.6, rail: true })).rect(20, 10, 21, 19, r.ramp('-z', { clear: 9.6, rail: true }));
  r.port('N', 'A', 7); r.port('S', 'A', 7); r.port('W', 'A', 5); r.port('E', 'A', 5);
  r.prop('sarcophagus', 16, 15.5, { rot: 90 }); r.prop('altar', 16, 20); r.prop('bone-pile', 13.5, 14); r.prop('bone-pile', 18.5, 21.5);
  for (const [x, z] of [[6, 8], [26, 8], [6, 24], [26, 24], [6, 16], [26, 16]]) r.prop('pillar-huge', x, z);
  r.prop('statue', 16, 7.4); r.prop('statue', 16, 24.4, { rot: 180 });
  return r.autoLights(4, { radius: 115 }).populate({ enemies: 9, loot: 5, quest: 2, seed: 85 });
}

/** Chasm Bridge (border, A): a hall split by two deep pits and one narrow bridge, a long ramp down into each. */
export function chasmBridge() {
  const r = new RoomSpec('Chasm Bridge', { kind: 'border', theme: 120, seed: 86, note: 'Two pits 6.4 m deep and a railed bridge between them; ramps lead down into each.' });
  const hall = r.floor(A, { clear: 9.6, rail: true }), pit = r.floor(25.6, { clear: 16 });
  r.rect(3, 3, 28, 28, hall).rect(9, 9, 14, 22, pit).rect(17, 9, 22, 22, pit);
  r.rect(9, 9, 10, 20, r.ramp('-z', { clear: 9.6, rail: true })).rect(21, 9, 22, 20, r.ramp('-z', { clear: 9.6, rail: true }));
  r.port('N', 'A', 3); r.port('S', 'A', 3); r.port('W', 'A', 3); r.port('E', 'A', 3);
  r.prop('statue', 15, 9.2); r.prop('statue', 16, 22.8, { rot: 180 });
  for (const [x, z] of [[5, 5], [26, 5], [5, 26], [26, 26]]) r.prop('pillar-huge', x, z);
  r.prop('bone-pile', 12.5, 15); r.prop('rubble', 19.5, 16); r.prop('stalagmites', 12, 21); r.prop('stalagmites', 20, 12);
  return r.autoLights(4, { radius: 110 }).populate({ enemies: 9, loot: 5, quest: 2, seed: 86 });
}

/** Catwalk Hall (interior, A): a tall hall crossed by a railed catwalk 6.4 m up; a ramp climbs to it from the floor. */
export function catwalkHall() {
  const r = new RoomSpec('Catwalk Hall', { kind: 'interior', theme: 122, seed: 87, note: 'A T of catwalk across a hall, reached by one ramp; two platforms and a high altar.' });
  const hall = r.floor(A, { clear: 12.8 }), plat = r.floor(38.4, { clear: 6.4, rail: true });
  const door = r.floor(38.4, { clear: 6.4 });                      // the platform cells where the catwalk begins: no rail across them
  r.rect(4, 6, 27, 25, hall).rect(4, 6, 7, 9, plat).rect(24, 6, 27, 9, plat).rect(7, 7, 7, 8, door).rect(24, 7, 24, 8, door);
  r.rect(4, 10, 5, 19, r.ramp('-z', { clear: 6.4, rail: true }));
  r.port('N', 'A', 6); r.port('S', 'A', 6);
  r.layer(1);
  const span = r.floor(38.4, { clear: 6.2, edge: 'rail', ends: 'WE' }), branch = r.floor(38.4, { clear: 6.2, edge: 'rail', ends: 'NS' }), spot = r.floor(38.4, { clear: 6.2, edge: 'rail' });
  r.rect(8, 7, 23, 8, span).rect(15, 9, 16, 22, branch).rect(14, 23, 17, 24, spot);
  r.prop('altar', 16, 24);
  r.layer(0);
  r.prop('statue', 25.5, 7.5); r.prop('statue', 5.5, 7.5);
  for (const [x, z] of [[9, 13], [22, 13], [9, 19], [22, 19]]) r.prop('pillar-huge', x, z);
  return r.autoLights(4, { radius: 125 }).populate({ enemies: 8, loot: 5, quest: 2, seed: 87 });
}

/** Stepped Sanctum (interior, A): a grand stair of three levels under one flat roof, an altar at its head. */
export function steppedSanctum() {
  const r = new RoomSpec('Stepped Sanctum', { kind: 'interior', theme: 124, seed: 88, note: 'A hall, a broad stair, a terrace, another stair, a high terrace with the altar: three levels under one roof.' });
  const f = r.floor(A), hall = r.floor(A, { clear: 9.6 }), t1 = r.floor(35.2, { clear: 6.4 }), t2 = r.floor(38.4, { clear: 3.2 });
  r.rect(4, 21, 27, 30, hall).rect(6, 12, 25, 15, t1).rect(9, 3, 22, 6, t2);
  r.rect(12, 16, 19, 20, r.ramp('-z', { clear: 6.4 })).rect(12, 7, 19, 11, r.ramp('-z', { clear: 6.4 }));
  r.port('S', 'A', 3, f);
  r.corridor(0, 9, 3, 22, f); r.corridor(31, 9, 28, 22, f);
  r.portSpecs.push({ edge: 'W', port: 'A', len: 1, ch: f, layer: 0 }); r.ports.push('WA');
  r.portSpecs.push({ edge: 'E', port: 'A', len: 1, ch: f, layer: 0 }); r.ports.push('EA');
  r.prop('altar', 16, 4.6); r.prop('statue', 10.4, 4.4); r.prop('statue', 21.6, 4.4); r.prop('sarcophagus', 9.5, 13.6, { rot: 90 }); r.prop('sarcophagus', 22.5, 13.6, { rot: 90 });
  for (const [x, z] of [[7, 23], [24, 23], [7, 28], [24, 28]]) r.prop('pillar-huge', x, z);
  return r.autoLights(4, { radius: 115 }).populate({ enemies: 8, loot: 5, quest: 2, seed: 88 });
}
