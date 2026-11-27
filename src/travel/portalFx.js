// @ts-check

export const PORTAL_ARCHIVE = 'fxportal';
export const PORTAL_FRAMES = 12;
export const PORTAL_FPS = 14;
export const PORTAL_TEX = Object.freeze({ w: 48, h: 72 });
export const PORTAL_SIZE = Object.freeze({ w: 1.6, h: 2.5 });
export const PORTAL_MS = Object.freeze({ open: 360, hold: 700, close: 420, shortHold: 260 });
export const PORTAL_BACK = 0.35;
export const PORTAL_SOUND = 349;
export const PORTAL_SOUND_GAP_MS = 1500;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const NONE = Object.freeze([]);

/**
 * Rows run from the bottom up, the color32 order world billboards use, with v = 0 at the foot.
 * @returns {{ width: number, height: number, colors: Uint8ClampedArray }}
 */
export function portalFrame(k, n = PORTAL_FRAMES, w = PORTAL_TEX.w, h = PORTAL_TEX.h) {
  const out = new Uint8ClampedArray(w * h * 4);
  const phase = (k / n) * Math.PI * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * 2 - 1, v = ((y + 0.5) / h) * 2 - 1;
      const r = Math.hypot(u, v);
      const o = (y * w + x) * 4;
      if (r > 1) continue;
      const a = Math.atan2(v, u);
      const arms = 0.5 + 0.5 * Math.sin(a * 3 + r * 9 - phase * 2);
      const rim = clamp01((r - 0.78) / 0.14) * (1 - clamp01((r - 0.94) / 0.06));
      const core = clamp01(1 - r / 0.32);
      const swirl = clamp01(arms * (0.35 + 0.65 * r));
      const flick = 0.85 + 0.15 * Math.sin(a * 7 + phase * 3);
      let R = 40 + 120 * swirl + 215 * rim * flick;
      let G = 14 + 70 * swirl + 190 * rim * flick;
      let B = 80 + 150 * swirl + 175 * rim * flick;
      R *= 1 - 0.65 * core; G *= 1 - 0.75 * core; B *= 1 - 0.45 * core;
      out[o] = R; out[o + 1] = G; out[o + 2] = B;
      out[o + 3] = Math.round(255 * clamp01(0.55 + 0.45 * Math.max(swirl, rim) + 0.25 * core) * clamp01((1 - r) / 0.05));
    }
  }
  return { width: w, height: h, colors: out };
}

const _uploaded = new WeakSet();
export function ensurePortalArt(renderer) {
  if (!renderer || _uploaded.has(renderer) || typeof renderer.uploadTexture !== 'function') return;
  _uploaded.add(renderer);
  for (let k = 0; k < PORTAL_FRAMES; k++) {
    const c32 = portalFrame(k);
    renderer.uploadTexture(PORTAL_ARCHIVE, String(k), c32);
    renderer.uploadEmissionTexture?.(PORTAL_ARCHIVE, String(k), c32, { white: true });
  }
}

export function portalOpenAt(t, { short = false, holdMs = null } = {}) {
  const hold = Number.isFinite(holdMs) ? Math.max(0, holdMs) : short ? PORTAL_MS.shortHold : PORTAL_MS.hold;
  if (t < 0) return { open: 0, done: false };
  if (t < PORTAL_MS.open) { const x = t / PORTAL_MS.open; return { open: Math.min(1.06, 1 - Math.pow(1 - x, 3) * (1 - 0.4 * x) + 0.06 * Math.sin(x * Math.PI)), done: false }; }
  if (t < PORTAL_MS.open + hold) return { open: 1, done: false };
  const c = (t - PORTAL_MS.open - hold) / PORTAL_MS.close;
  if (c >= 1) return { open: 0, done: true };
  return { open: 1 - c * c, done: false };
}
export const portalLife = ({ short = false, holdMs = null } = {}) => PORTAL_MS.open + (Number.isFinite(holdMs) ? Math.max(0, holdMs) : short ? PORTAL_MS.shortHold : PORTAL_MS.hold) + PORTAL_MS.close;

/** @param {{ renderer: any, audio?: any, now?: () => number }} deps */
export function createPortalSet({ renderer, audio = null, now = () => performance.now() }) {
  /** @type {{ at: number, feet: number[], short: boolean, holdMs: number | null, fixed: boolean, batch: any, origin: number[] }[]} */
  const list = [];
  let eye = null;
  let soundAt = -Infinity;
  function open(feet, { short = false, quiet = false, holdMs = null, fixed = false } = {}) {
    if (!renderer?.createBillboardBatch || !feet) return null;
    ensurePortalArt(renderer);
    const at = [feet[0], feet[1] - 0.05, feet[2]];
    const batch = renderer.createBillboardBatch(PORTAL_ARCHIVE, '0', { w: PORTAL_SIZE.w, h: PORTAL_SIZE.h }, [[0, 0, 0]], { dynamic: true });
    batch.origin = [at[0], at[1], at[2]];
    batch.noShadow = true;
    batch.conceal = { mode: 3, alpha: 0, t: 0, phase: 0 };
    const p = { at: now(), feet: at, short, holdMs: Number.isFinite(holdMs) ? holdMs : null, fixed, batch, origin: batch.origin };
    list.push(p);
    // `play3dId` takes a DAGGER.SND sound ID, not a clip index.
    if (!quiet && p.at - soundAt >= PORTAL_SOUND_GAP_MS) { soundAt = p.at; try { audio?.play3dId?.(PORTAL_SOUND, at, 0.9, { maxDistance: 24 }); } catch { } }
    return p;
  }
  function tick(viewEye = null) {
    if (viewEye) eye = viewEye;
    const t = now();
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const age = t - p.at;
      const { open: k, done } = portalOpenAt(age, { short: p.short, holdMs: p.holdMs });
      if (done) { try { renderer.destroyBillboardBatch(p.batch); } catch { } list.splice(i, 1); continue; }
      const w = PORTAL_SIZE.w * Math.max(0.04, Math.min(1, k * 1.25 - 0.1)), hgt = PORTAL_SIZE.h * Math.max(0.12, Math.min(1.06, 0.35 + k * 0.7));
      p.batch.size = { w, h: hgt };
      p.batch.record = String(Math.floor((age / 1000) * PORTAL_FPS) % PORTAL_FRAMES);
      p.batch.conceal.alpha = clamp01(k * 1.15);
      if (p.fixed) { p.origin[0] = p.feet[0]; p.origin[2] = p.feet[2]; }
      else if (eye) {
        const dx = p.feet[0] - eye[0], dz = p.feet[2] - eye[2], L = Math.hypot(dx, dz) || 1;
        p.origin[0] = p.feet[0] + (dx / L) * PORTAL_BACK; p.origin[2] = p.feet[2] + (dz / L) * PORTAL_BACK;
      }
      p.origin[1] = p.feet[1] + (PORTAL_SIZE.h - hgt) * 0.5;
    }
  }
  return {
    open,
    tick,
    batches: () => (list.length ? list.map((p) => p.batch) : NONE),
    offsetAll(o) { for (const p of list) { p.feet[0] += o[0]; p.feet[1] += o[1]; p.feet[2] += o[2]; } },
    remove(p) { const i = list.indexOf(p); if (i < 0) return; try { renderer.destroyBillboardBatch(p.batch); } catch { } list.splice(i, 1); },
    get count() { return list.length; },
    clear() { for (const p of list) { try { renderer.destroyBillboardBatch(p.batch); } catch { } } list.length = 0; },
  };
}
