// @ts-check
// These pose fields share Meteor and Wall of Earth with other players. `mt` is [count, start xyz, landing xyz,
// element, seed], sent for METEOR_HOLD_S so a pose the relay's far tier skips does not lose the cast. `ew` is [id, foot
// xyz, yaw, warning, picture kind, archive, record] while the wall is up. The relay bundles this file through wire.js,
// so it imports nothing.

export const METEOR_HOLD_S = 2;
export const WALL_PICTURE_KINDS = Object.freeze(['ground', 'dungeon', 'rock']);

const U16 = 65535, SEED_MAX = 0x7fffffff, ELEMENT_MAX = 4, ARCHIVE_MAX = 1023, RECORD_MAX = 255, YAW_MAX = 7;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const placeOk = (a, i, bound, yBound) => finite(a[i]) && finite(a[i + 1]) && finite(a[i + 2])
  && Math.abs(a[i]) <= bound && Math.abs(a[i + 1]) <= yBound && Math.abs(a[i + 2]) <= bound;

export function validMeteor(mt, bound, yBound) {
  if (!Array.isArray(mt) || mt.length !== 9) return null;
  if (!int(mt[0], 1, U16) || !placeOk(mt, 1, bound, yBound) || !placeOk(mt, 4, bound, yBound)) return null;
  if (!int(mt[7], 0, ELEMENT_MAX) || !int(mt[8], 0, SEED_MAX)) return null;
  return mt.slice();
}

export function validWall(ew, bound, yBound) {
  if (!Array.isArray(ew) || ew.length !== 9) return null;
  if (!int(ew[0], 1, SEED_MAX) || !placeOk(ew, 1, bound, yBound) || !finite(ew[4]) || Math.abs(ew[4]) > YAW_MAX) return null;
  if (!int(ew[5], 0, 1) || !int(ew[6], 0, WALL_PICTURE_KINDS.length - 1) || !int(ew[7], 0, ARCHIVE_MAX) || !int(ew[8], 0, RECORD_MAX)) return null;
  return ew.slice();
}

export function conjuredOf(mt, ew, bound, yBound) {
  const m = mt === undefined ? null : validMeteor(mt, bound, yBound), w = ew === undefined ? null : validWall(ew, bound, yBound);
  return { ...(m ? { mt: m } : {}), ...(w ? { ew: w } : {}) };
}

export function conjuredChanged(a, b) {
  return (a.mt?.[0] | 0) !== (b.mt?.[0] | 0) || (a.ew?.[0] | 0) !== (b.ew?.[0] | 0) || (a.ew?.[5] | 0) !== (b.ew?.[5] | 0);
}
