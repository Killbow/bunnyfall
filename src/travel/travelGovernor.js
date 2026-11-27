// @ts-check

export const TV_GOV_HOLD_S = 0.25;
// After a cut, the next cut waits this long so the lower rate has time to show in the build.
export const TV_GOV_SETTLE_S = 2;
export const TV_GOV_CLEAR_S = 4;
export const TV_GOV_STEP = 5;
export const TV_GOV_FLOOR = 1;

export const stepDown = (n) => Math.max(TV_GOV_FLOOR, Math.floor(n / TV_GOV_STEP) * TV_GOV_STEP);

/** @param {{ max?: number }} [opts] */
export function createLoadGovernor({ max = 100 } = {}) {
  let ceiling = max;
  let dirty = 0;
  let clear = 0;
  let settling = false;
  return {
    get ceiling() { return ceiling; },
    step(dt, { unbuilt = 0, requested = 1, owed = null, feet = null, speedMps = 0 } = {}) {
      const want = Math.max(TV_GOV_FLOOR, requested);
      if (owed) { ceiling = max; dirty = 0; clear = 0; settling = false; return Math.min(want, leadCap(owedMetres(feet, owed), speedMps)); }
      if (unbuilt > 0) {
        clear = 0;
        dirty += dt;
        // No cut at walking pace, because ordinary streaming lag at x1 would set a ceiling of 1 for the next
        // journey.
        if (dirty >= (settling ? TV_GOV_SETTLE_S : TV_GOV_HOLD_S)) { if (want > TV_GOV_FLOOR) { ceiling = stepDown(Math.min(ceiling, want) / 2); settling = true; } dirty = 0; }
      } else {
        dirty = 0;
        if (ceiling < max) {
          clear += dt;
          if (clear >= TV_GOV_CLEAR_S) { ceiling = Math.min(max, Math.floor(ceiling / TV_GOV_STEP) * TV_GOV_STEP + TV_GOV_STEP); clear = 0; settling = false; }
        }
      }
      return Math.min(want, ceiling);
    },
    reset() { ceiling = max; dirty = 0; clear = 0; settling = false; },
  };
}

export function viewReach({ height, pitch, fovY, back = 0, far = Infinity }) {
  const top = pitch + fovY / 2;
  if (top >= -1e-3) return far;
  return Math.min(far, height / Math.tan(-top) - back);
}

export const unbuiltCount = () => ({ gen: -1, x: NaN, y: NaN, r: -1, n: 0, owed: [] });

// The host `isBuilt` returns true for a pixel nothing is building, such as a failed build, so the count is only
// what the stream still owes.
export function unbuiltAround(center, radius, isBuilt, out = null) {
  if (out) out.length = 0;
  let n = 0;
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) if (!isBuilt(x, y)) { n++; out?.push([x, y]); }
  }
  return n;
}

export const TV_GOV_LEAD_S = 4;
const PIXEL_N = 32768;
const N_PER_M = PIXEL_N / 819.2;
export function owedMetres(feet, owed) {
  if (!owed?.length) return Infinity;
  if (!feet) return 0;
  let best = Infinity;
  for (const [x, y] of owed) {
    const x0 = x * PIXEL_N, z0 = (499 - y) * PIXEL_N;
    const dx = Math.max(x0 - feet.x, 0, feet.x - (x0 + PIXEL_N)), dz = Math.max(z0 - feet.z, 0, feet.z - (z0 + PIXEL_N));
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best / N_PER_M;
}
export const travellerPace = (player, boat) => Math.max(player?.speed ?? 0, Number(boat?.way) || 0);

export function leadCap(metres, speedMps, leadS = TV_GOV_LEAD_S) {
  if (!Number.isFinite(metres) || !(speedMps > 0)) return Infinity;
  const n = metres / (speedMps * leadS);
  return n >= TV_GOV_STEP ? Math.floor(n / TV_GOV_STEP) * TV_GOV_STEP : Math.max(TV_GOV_FLOOR, Math.floor(n));
}
