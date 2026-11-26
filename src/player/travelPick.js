// @ts-check

export const TV_PICK_MAX = 6000;
export const TV_PICK_STEP_MIN = 2;
export const TV_PICK_STEP_SHARE = 0.004;
export const TV_PICK_REFINE = 14;

/**
 * @param {number[]} eye
 * @param {number[]} dir
 * @param {(x:number, z:number) => number} heightAt
 * @returns {{ point: number[]|null, dist: number, unbuilt: boolean }}
 */
export function groundHit(eye, dir, heightAt, { maxDist = TV_PICK_MAX, stepMin = TV_PICK_STEP_MIN, stepShare = TV_PICK_STEP_SHARE, refine = TV_PICK_REFINE } = {}) {
  if (!eye || !dir || typeof heightAt !== 'function') return { point: null, dist: Infinity, unbuilt: false };
  const at = (t) => [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
  const under = (t) => { const p = at(t); const h = heightAt(p[0], p[2]); return Number.isFinite(h) && p[1] <= h; };
  let unbuilt = false;
  let t = 0;
  while (t < maxDist) {
    const t1 = Math.min(maxDist, t + Math.max(stepMin, t * stepShare));
    const p = at(t1);
    const h = heightAt(p[0], p[2]);
    if (!Number.isFinite(h)) unbuilt = true;
    else if (p[1] <= h) {
      let lo = t, hi = t1;
      for (let i = 0; i < refine; i++) { const m = (lo + hi) / 2; if (under(m)) hi = m; else lo = m; }
      const q = at(hi);
      const g = heightAt(q[0], q[2]);
      return { point: [q[0], Number.isFinite(g) ? g : q[1], q[2]], dist: hi, unbuilt };
    }
    t = t1;
  }
  return { point: null, dist: Infinity, unbuilt };
}

export function canvasPoint(clientX, clientY, rect) {
  return [clientX - (rect?.left ?? 0), clientY - (rect?.top ?? 0)];
}

/**
 * @param {{ hit: {point:number[]|null, unbuilt:boolean}|null, place?: any, water?: boolean }} q
 * @returns {{ kind: 'place'|'ground'|'water'|'far'|'none', place?: any }}
 */
export function classifyPick({ hit, place = null, water = false }) {
  if (!hit?.point) return { kind: hit?.unbuilt ? 'far' : 'none' };
  if (place) return { kind: 'place', place };
  if (water) return { kind: 'water' };
  return { kind: 'ground' };
}
