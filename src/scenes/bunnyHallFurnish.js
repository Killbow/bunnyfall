// @ts-check
// BUNNY-GUILDS (2026-11-04, the owner: "distinctive interiors that read as established institutions"): A HALL'S FURNISHING.
// A hall is a converted house, and its arms hang on the wall behind the clerk (bunnyHallDress.js). The rest of what makes
// it an institution is put about the same spot, measured in the room's own collider as the crown's throne room is
// (systems/crownHall.js crownHallPlan), so every client stands it in the same place:
//   - a brazier either side of the arms, outside the banners (Daggerfall's own brazier torch, archive 210 record 20, which
//     lights the room as any other lamp does);
//   - the roster board and the stores chest (the same two models the crown's hall keeps), a few paces into the room.
// Decor, not a service: nothing here is pressed. A room with no wall in reach of the clerk, or no clerk, gets none of it.
// The plan is pure (people and the collider's ray in, positions out); `furnishBunnyHall` stands it in a built room.
import { crownHallPlan } from '../systems/crownHall.js';
import { bunnyGuildOfKey } from '../systems/guild/bunnyGuilds.js';
import { collectInteriorLights } from '../world/interior/interiorLights.js';

/** Daggerfall's lights archive and its brazier torch. */
export const HALL_BRAZIER = Object.freeze({ archive: 210, record: 20 });
/** Metres: how far outside a banner its brazier stands (along the wall), and how far off the wall. */
export const HALL_BRAZIER_SIDE_M = 1.1;
export const HALL_BRAZIER_OFF_M = 0.55;
/** A brazier's floor may differ from the room's by this much, or it is not set. */
export const HALL_BRAZIER_STEP_M = 0.3;

/**
 * The hall's furnishing about its clerk: `{ braziers: [{x,y,z}], pieces: [{ model, pos, yawDeg, k }] }`, or null where the
 * room gives nothing to hang it on. All in the frame `people` and `ray(origin, dir, max)` are in.
 * @param {any[]} people @param {string | null | undefined} key @param {(o: number[], d: number[], max: number) => number} ray
 */
export function bunnyHallPlan(people, key, ray) {
  const guild = key ? bunnyGuildOfKey(key) : null;
  const clerk = guild ? (people ?? []).find((pn) => pn?.bunnyClerk === key) : null;
  if (!clerk) return null;
  const plan = crownHallPlan(clerk, ray);
  if (!plan) return null;
  const braziers = [];
  const [a, b] = plan.banners;
  if (a && b) {
    const mid = [(a.top[0] + b.top[0]) / 2, (a.top[2] + b.top[2]) / 2];
    for (const bn of plan.banners) {
      let dx = bn.top[0] - mid[0], dz = bn.top[2] - mid[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const x = bn.top[0] + dx * HALL_BRAZIER_SIDE_M + bn.out[0] * HALL_BRAZIER_OFF_M;
      const z = bn.top[2] + dz * HALL_BRAZIER_SIDE_M + bn.out[2] * HALL_BRAZIER_OFF_M;
      const under = ray([x, plan.floor + 1.2, z], [0, -1, 0], 1.2 + HALL_BRAZIER_STEP_M);
      if (!Number.isFinite(under) || Math.abs(plan.floor + 1.2 - under - plan.floor) > HALL_BRAZIER_STEP_M) continue;   // no floor of the room's under it
      const back = ray([x, plan.floor + 1.2, z], [-bn.out[0], 0, -bn.out[2]], HALL_BRAZIER_OFF_M + 0.4);
      if (!Number.isFinite(back)) continue;   // no wall behind it: it would stand in the middle of the room
      braziers.push({ x, y: plan.floor + 1.2 - under, z });
    }
  }
  const pieces = [['board', plan.board], ['chest', plan.chest]].filter(([, p]) => p).map(([k, p]) => ({ ...(/** @type {any} */ (p)), k }));
  return { braziers, pieces };
}

/**
 * Stand the plan in a room being built. `env`: `key`, `people`, `ray`, and the room's own seams - `renderer`, `getTexture`,
 * `uploadRecord(archive, record)`, `billboardSize(texture, record)`, `getGpuMesh(id)`, `cpuModels`, `collider`, `drawList`,
 * `billboardBatches`, `lights` (the room's list, pushed to), `trs`, `worldAabb`. Everything lands in the room's frame.
 * @param {any} env
 */
export async function furnishBunnyHall(env) {
  const plan = bunnyHallPlan(env.people, env.key, env.ray);
  if (!plan) return;
  const { archive, record } = HALL_BRAZIER;
  const t = plan.braziers.length ? await env.getTexture(archive) : null;
  if (t && record < t.recordCount) {
    env.uploadRecord(archive, record);
    const size = env.billboardSize(t, record);
    const batch = env.renderer.createBillboardBatch(archive, record, size, plan.braziers.map((p) => [p.x, p.y, p.z]));
    env.billboardBatches.push(batch);
    env.lights.push(...collectInteriorLights(plan.braziers.map((p) => ({ archive, record, x: p.x, y: p.y, z: p.z })), () => size));   // already in the room's frame
  }
  for (const p of plan.pieces) {
    const gpu = await env.getGpuMesh(p.model);
    const cpu = env.cpuModels.get(p.model);
    if (!gpu || !cpu) continue;
    const matrix = env.trs(p.pos[0], p.pos[1], p.pos[2], 0, p.yawDeg, 0);
    const aabb = env.worldAabb(cpu.positions, matrix);
    env.drawList.push({ mesh: gpu, matrix, key: `int:bunny:${p.k}`, aabb });
    env.collider.addMesh('interior', cpu.positions, cpu.indices, matrix);
  }
}
