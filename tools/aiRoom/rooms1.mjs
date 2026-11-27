// AI-ROOMS, batch 1. Each room is authored on the 32 x 32 grid (cells of 1.6 m; a port's corridor is columns/rows 9-10
// for port A (floor 32.0) and 21-22 for port B (floor 12.8)). See dsl.mjs.
import { RoomSpec, A, B } from './dsl.mjs';

/** Gatehouse (border): four A ports lead to a walled guard hall with a pillared cross. */
export function gatehouse() {
  const r = new RoomSpec('Gatehouse', { kind: 'border', theme: 122, seed: 11, note: 'A guard hall where four corridors meet, pillars at the crossing.' });
  const f = r.floor(A), h = r.floor(A, { clear: 6.4 });
  for (const e of 'NSWE') r.port(e, 'A', 8, f);
  r.rect(8, 8, 23, 23, h);          // the hall
  for (const [x, z] of [[11.5, 11.5], [11.5, 20.5], [20.5, 11.5], [20.5, 20.5]]) r.prop('pillar-square-tall', x, z);
  r.prop('statue', 16, 16);
  r.prop('stone-table', 13.5, 16.5, { rot: 90 }); r.prop('stone-table', 18.5, 16.5, { rot: 90 });
  return r.autoLights(4).populate({ enemies: 7, loot: 3, quest: 2, seed: 11 });
}

/** Hall of Pillars (interior): a 6.4 m hall in a 5 x 5 forest of columns, an A corridor on each side. */
export function hallOfPillars() {
  const r = new RoomSpec('Hall of Pillars', { kind: 'interior', theme: 120, seed: 12, note: 'A great hall of columns; the four corridors run into it.' });
  const f = r.floor(A), h = r.floor(A, { clear: 6.4 });
  for (const e of 'NSWE') r.port(e, 'A', 7, f);
  r.rect(7, 7, 24, 24, h);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const ci = 9 + i * 4, cj = 9 + j * 4; r.prop(i % 2 ? 'pillar-round-tall' : 'pillar-round-tall', ci + 1, cj + 1); }
  r.prop('altar', 16, 8.2); r.prop('sarcophagus', 16, 23.8);
  return r.autoLights(4, { radius: 100 }).populate({ enemies: 8, loot: 4, quest: 2, seed: 12 });
}
