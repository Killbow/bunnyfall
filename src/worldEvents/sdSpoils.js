// @ts-check
import { SD_ARENA, SD_PILLAR_W, realmToDungeon } from '../net/sdBrain.js';
import { SD_REM, SD_PILLARS } from '../net/sdRemnant.js';
import { readSdReceipt } from '../net/sdReceipt.js';
import { remnantPose } from './sdRemnant.js';
import { spoilsLevel } from './spoilsPool.js';
import { sdSpoilsDay, sdSpoilsList, SD_SPOILS_TEXT } from './sdSpoilsRoll.js';

export const SD_SPEW_AT_MS = 1200;
export const SD_RECEIPT_WAIT_MS = 4000;
export const SD_SPEW_CHEST = 0.55;
export const SD_SPEW_LOW_M = 1;
export const SD_SPEW_RIM_M = 2;
export const SD_PILLAR_CLEAR_M = 1.2;
// The Remnant walks through pillars, so its fall position can be inside one. This moves the point out of the pillar
// square the shortest way.
export function clearOfPillars(x, z, margin = SD_PILLAR_CLEAR_M) {
  const half = SD_PILLAR_W / 2 + margin;
  for (const [px, pz] of SD_PILLARS) {
    const dx = x - px, dz = z - pz;
    if (Math.abs(dx) >= half || Math.abs(dz) >= half) continue;
    if (half - Math.abs(dx) < half - Math.abs(dz)) x = px + (dx < 0 ? -half : half);
    else z = pz + (dz < 0 ? -half : half);
  }
  return [x, z];
}
export const SD_SPOILS_KEEP = Object.freeze({ centre: Object.freeze(realmToDungeon(SD_ARENA.x, 0, SD_ARENA.z)), r: SD_ARENA.r - SD_SPEW_RIM_M, floorY: realmToDungeon(0, 0, 0)[1] });

/** @param {{ link: any, pool: any, slot: () => (number|null), receipt: (slot: number) => (string|null), level: () => number, feet?: () => (number[]|null), say?: (text: string) => void }} deps */
export function createSdSpoils({ link, pool, slot, receipt, level, feet = () => null, say = () => {} }) {
  let spewedFi = 0, saidFi = 0;
  return {
    frame() {
      const s = link?.state?.(), t = link?.now?.() ?? 0, here = slot();
      if (s?.fell && here != null && spewedFi !== s.fi && t >= s.fell.at + SD_SPEW_AT_MS) {
        const r = receipt(here), c = r ? readSdReceipt(r) : null;
        if (c && c.d === here) {
          spewedFi = s.fi;
          const pose = remnantPose(s, s.fell.at + SD_SPEW_AT_MS);
          const [px, pz] = clearOfPillars(pose.x, pose.z, 0.3);
          const at = realmToDungeon(SD_ARENA.x + px, Math.max(SD_SPEW_LOW_M, SD_REM.h * SD_SPEW_CHEST - pose.sink), SD_ARENA.z + pz);
          const f = feet();
          const bearing = f ? Math.atan2(f[0] - at[0], f[2] - at[2]) : pose.yw;
          const lv = spoilsLevel(level(), c.l);
          if (pool.spew({ day: sdSpoilsDay(c.d), seed: c.c, level: lv, at, bearing, acct: c.s, keep: SD_SPOILS_KEEP, roll: () => sdSpoilsList(c.c, lv) })) say(SD_SPOILS_TEXT.spilled);
        } else if (saidFi !== s.fi && t >= s.fell.at + SD_RECEIPT_WAIT_MS && link.counted?.()) {
          saidFi = s.fi;
          say(SD_SPOILS_TEXT.none);
        }
      }
      pool.frame();
    },
    leave() {
      spewedFi = 0; saidFi = 0;
      return pool.gather();
    },
    state: () => ({ spewedFi, saidFi }),
  };
}
