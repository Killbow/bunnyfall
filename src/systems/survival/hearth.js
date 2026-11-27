// @ts-check
export const HEARTH_ARCHIVE = 210;

// Box half-width that cuts the walk of a host's lights; it must clear both BY_FIRE_REACH and the activation reach.
export const HEARTH_NEAR = 16;

// The fire bowl (0), the flame a camp's own fire uses (1), and the brazier (20). Wall torches are a real flame but
// hang at head height, so they are left out.
export const HEARTH_RECORDS = Object.freeze([0, 1, 20]);

const HEARTH_SET = new Set(HEARTH_RECORDS);

export function isHearthFlat(archive, record) {
  return archive === HEARTH_ARCHIVE && HEARTH_SET.has(record);
}

/**
 * @param {Array<{record?: number, archive?: number, x: number, y: number, z: number, foot?: number, w?: number, h?: number}>} flats
 * @returns {Array<{x: number, y: number, z: number, foot?: number, w?: number, h?: number}>}
 */
export function collectHearths(flats) {
  const out = [];
  for (const f of flats ?? []) {
    if (!f) continue;
    if (!isHearthFlat(f.archive ?? HEARTH_ARCHIVE, f.record)) continue;
    out.push({ x: f.x, y: f.y, z: f.z, foot: f.foot, w: f.w, h: f.h });
  }
  return out;
}

// The box is the sprite standing on `foot`, because a hearth's y is where its light sits, never its foot.
// A hearth with no size has no box.
/**
 * @param {{x: number, z: number, foot?: number, w?: number, h?: number}} hearth
 * @returns {{min: number[], max: number[]} | null}
 */
export function hearthAabb(hearth) {
  const { x, z, foot, w, h } = hearth ?? {};
  if (![x, z, foot, w, h].every(Number.isFinite) || !(w > 0) || !(h > 0)) return null;
  const r = w / 2;
  return { min: [x - r, foot, z - r], max: [x + r, foot + h, z + r] };
}

export function nearestHearth(hearths, pos, reach, n = -1) {
  let best = null, bestD = reach;
  const len = n < 0 ? (hearths?.length ?? 0) : Math.min(n, hearths?.length ?? 0);
  for (let i = 0; i < len; i++) {
    const h = hearths[i];
    const d = Math.hypot(h.x - pos[0], h.y - pos[1], h.z - pos[2]);
    if (d <= bestD) { best = h; bestD = d; }
  }
  return best;
}

// Stops at the first fire in reach, because byFire runs every frame over lantern lists hundreds long.
export function hearthNear(hearths, pos, reach, n = -1) {
  const len = n < 0 ? (hearths?.length ?? 0) : Math.min(n, hearths?.length ?? 0);
  for (let i = 0; i < len; i++) {
    const h = hearths[i];
    const dx = h.x - pos[0], dy = h.y - pos[1], dz = h.z - pos[2];
    if (dx * dx + dy * dy + dz * dz <= reach * reach) return true;
  }
  return false;
}

/** @param {{x:number,y:number,z:number,foot?:number,w?:number,h?:number}[]|null|undefined} fireplaces */
export function fireplaceHearths(fireplaces) {
  return (fireplaces ?? []).filter(Boolean).map((f) => ({ x: f.x, y: f.y, z: f.z, foot: f.foot, w: f.w, h: f.h }));
}
