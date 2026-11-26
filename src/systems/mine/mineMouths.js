// @ts-check
// BUNNYFALL (2026-11-25, caverns): MINE MOUTHS IN THE WILDS - stood on every streamed pixel whose roll holds one
// (net/mine/mineSites.js mineAt), from Daggerfall's own flats: the mountain nature set's arched rock as the portal, a boulder
// either side and a standing torch. Walking into the arch takes the player in (the Sky-Ketch's lift is boarded the same
// way, systems/ketch/ketchSky.js), and the way back out lands them before it, so the mouth waits until they have stepped
// away before it takes them again. A sealed mouth (collapsed, net/mine/mineBrain.js) says how long it has left instead.
//
// The flats go into the pixel's own batches, drawn with it and torn down with it; nothing here outlives a pixel.
import { mineAt } from '../../net/mine/mineSites.js';
import { groundAt } from '../../world/terrainNature.js';
import { TERRAIN_SIZE } from '../../world/terrainSampler.js';
import { t } from '../../ui/textManager.js';
import { multiply, trs, transformPoint } from '../../world/mat4.js';

/** The mountain nature archive and its records: the arched rock, two boulders. The standing torch (TEXTURE.210). */
export const MOUTH_ROCKS = Object.freeze({ archive: 510, arch: 3, left: 2, right: 6 });
export const MOUTH_TORCH = Object.freeze({ archive: 210, record: 6 });
/** The arch's scale over its own picture, and how far the boulders and the torch stand from it (m). */
export const MOUTH_ARCH_SCALE = 2.6;
export const MOUTH_SIDE_M = 4.5;
/** How near the arch's foot a body walks in (m, across and up), how far it must step away before it is taken again, and
 *  how near a mouth is first said. */
export const MOUTH_ENTER_M = 2.2;
export const MOUTH_REARM_M = 8;
export const MOUTH_SPOT_M = 120;
/** The entrance model's walk-in point: this far into its portal from its door (m). */
export const MOUTH_MODEL_IN_M = 1.6;
/** A mouth's press key (`mine:mouth:<px>,<py>`), how near its dark is pressed (m), and how far its box reaches past it. */
export const MOUTH_KEY = 'mine:mouth:';
export const MOUTH_PRESS_M = 4;
const MOUTH_DARK_PAD_M = 0.15;
/** The entrance model's turn on a pixel: a quarter turn of four, by the pixel (degrees). */
export const mouthYaw = (/** @type {number} */ px, /** @type {number} */ py) => (((px * 7 + py * 13) % 4) + 4) % 4 * 90;
/** How often the streamed pixels are walked for mouths (s). */
const SCAN_S = 0.5;

export const MOUTH_TEXT = Object.freeze({
  spotted: () => t('mine.spotted', 'You spot the mouth of a mine.'),
  relayOld: () => t('mine.relayOld', 'The mines open after the next server update.'),
  title: () => t('mine.mouthTitle', 'Mine entrance'),
  enter: () => t('mine.mouthEnter', 'Enter the mine'),
  info: () => t('mine.mouthInfo', 'A mine shaft runs into the rock here. Its timbers still hold.'),
  mapLabel: () => t('mine.mapLabel', 'Mine'),
  sealed: (/** @type {number} */ m) => t('mine.sealed', 'The mouth is choked with rubble. It reopens in about {m} minutes.', { m }),
});

/** Where the spotted mouths are remembered, and the most kept (the newest). */
export const MOUTH_SPOTTED_KEY = 'bunnyfall.mines.spotted';
export const MOUTH_SPOTTED_MAX = 64;
function readSpotted(/** @type {any} */ storage) {
  try { const v = JSON.parse(storage?.getItem?.(MOUTH_SPOTTED_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((k) => typeof k === 'string' && /^\d{1,4},\d{1,4}$/.test(k)).slice(-MOUTH_SPOTTED_MAX) : []; } catch { return []; }
}
function writeSpotted(/** @type {any} */ storage, /** @type {Set<string>} */ set) {
  try { storage?.setItem?.(MOUTH_SPOTTED_KEY, JSON.stringify([...set].slice(-MOUTH_SPOTTED_MAX))); } catch { /* a page that keeps nothing still marks this session's */ }
}

/** What this page last heard of each mine it stood in: its reset and its seal, by pixel - the mouths' word on them. */
const _heard = new Map();
/** A mine's state heard (systems/mine/mineHost.js). */
export function noteMineState(/** @type {number} */ px, /** @type {number} */ py, /** @type {any} */ st) {
  if (st && Number.isSafeInteger(st.reset)) _heard.set(`${px},${py}`, { reset: st.reset, sealedUntil: Number(st.sealedUntil) || 0 });
}
/** A mine's last heard reset (0 never heard) and how many seconds its seal has left at `nowS` (0 open). */
export const mineHeardReset = (/** @type {number} */ px, /** @type {number} */ py) => _heard.get(`${px},${py}`)?.reset ?? 0;
export const mineSealLeft = (/** @type {number} */ px, /** @type {number} */ py, /** @type {number} */ nowS) => Math.max(0, (_heard.get(`${px},${py}`)?.sealedUntil ?? 0) - nowS);
/** Where a pixel's mouth stands, pixel-local: its middle, on the ground. */
export const mouthLocal = (/** @type {any} */ entry) => {
  const x = TERRAIN_SIZE / 2, z = TERRAIN_SIZE / 2;
  const y = entry?.samples ? groundAt(entry.samples, x, z) : 0;
  return [x, Number.isFinite(y) ? y : 0, z];
};

/**
 * @param {{ renderer: any, getTexture: (a: number) => Promise<any>, uploadRecord: (a: number, r: number) => void,
 *   billboardSize: (t: any, r: number) => { w: number, h: number }, flatBatchAabb?: ((c: number[][], s: any) => number[]) | null,
 *   built: () => Map<string, any>, climateAt: (px: number, py: number) => number, occupiedAt: (px: number, py: number) => boolean,
 *   pixelTranslation: (px: number, py: number, out: number[]) => number[], feet: () => (number[]|null), outside: () => boolean,
 *   enter: (px: number, py: number) => void, sealedFor: (px: number, py: number) => number, say: (text: string) => void, nowMs?: () => number,
 *   art?: (() => ({ state: 'loading'|'ready'|'none', art: any })) | null, collider?: (() => any) | null, riding?: ((px: number, py: number) => any) | null, storage?: { getItem: (k: string) => (string|null), setItem: (k: string, v: string) => void } | null }} deps
 */
export function createMineMouths(deps) {
  const nowMs = deps.nowMs ?? (() => performance.now());
  /** stood mouths by pixel key: `{ entry, px, py, local, batches }` */
  const stood = new Map();
  const pending = new Set();
  const spotted = new Set(readSpotted(deps.storage));
  let scanAt = -Infinity, armed = true;
  const _t = [0, 0, 0];

  /** Into a mouth, or told how long its seal has left. */
  function goIn(/** @type {any} */ s) {
    const left = deps.sealedFor(s.px, s.py);
    if (left > 0) { deps.say(MOUTH_TEXT.sealed(Math.max(1, Math.ceil(left / 60)))); return; }
    deps.enter(s.px, s.py);
  }

  async function stand(/** @type {any} */ entry) {
    const key = `${entry.px},${entry.py}`;
    if (pending.has(key)) return;
    pending.add(key);
    try {
      const local = mouthLocal(entry);
      // THE OWNER'S ENTRANCE: its door on the mouth's spot, turned by the pixel, its rock solid; the walk-in point inside its portal
      const a = deps.art?.() ?? null;
      if (a?.state === 'ready' && a.art?.entrance) {
        if (deps.built().get(key) !== entry || stood.has(key)) return;
        const E = a.art.entrance, d = E.door.at;
        const L = multiply(trs(local[0], local[1], local[2], 0, mouthYaw(entry.px, entry.py), 0), trs(-d[0], -d[1], -d[2], 0, 0, 0));
        const trig = transformPoint(L, d[0] + E.door.into[0] * MOUTH_MODEL_IN_M, d[1], d[2] + E.door.into[2] * MOUTH_MODEL_IN_M);
        const bucket = `mine:mouth:${key}`;
        try { deps.collider?.()?.addMesh?.(bucket, E.positions, E.indices, L, deps.riding?.(entry.px, entry.py)); } catch (e) { console.warn('[mine] the rock of a mouth', /** @type {any} */ (e)?.message ?? e); }
        const dark = E.dark ? { gpu: E.dark.gpu, corners: E.dark.corners.map((/** @type {number[]} */ c) => transformPoint(L, c[0], c[1], c[2])) } : null;
        stood.set(key, { entry, px: entry.px, py: entry.py, local: [trig[0], local[1], trig[2]], batches: [], model: { L, W: new Float32Array(16), gpu: E.gpu, bucket, dark } });
        return;
      }
      const [rocks, torch] = await Promise.all([deps.getTexture(MOUTH_ROCKS.archive), deps.getTexture(MOUTH_TORCH.archive)]);
      if (deps.built().get(key) !== entry || stood.has(key)) return;
      const batches = [];
      const put = (/** @type {any} */ tex, /** @type {number} */ archive, /** @type {number} */ record, /** @type {number} */ scale, /** @type {number[]} */ at) => {
        if (!tex || record >= tex.recordCount) return;
        deps.uploadRecord(archive, record);
        const base = deps.billboardSize(tex, record), size = { w: base.w * scale, h: base.h * scale };
        const centers = [[at[0], at[1], at[2]]];   // a billboard's centre is its base
        const b = deps.renderer.createBillboardBatch(archive, record, size, centers);
        if (!b) return;
        if (deps.flatBatchAabb) b._box = deps.flatBatchAabb(centers, size);
        entry.batches.push(b);
        batches.push(b);
      };
      const [x, y, z] = local;
      put(rocks, MOUTH_ROCKS.archive, MOUTH_ROCKS.arch, MOUTH_ARCH_SCALE, [x, y, z]);
      put(rocks, MOUTH_ROCKS.archive, MOUTH_ROCKS.left, 1.6, [x - MOUTH_SIDE_M, y, z + 0.6]);
      put(rocks, MOUTH_ROCKS.archive, MOUTH_ROCKS.right, 1.4, [x + MOUTH_SIDE_M, y, z - 0.4]);
      put(torch, MOUTH_TORCH.archive, MOUTH_TORCH.record, 1, [x + 2.2, y, z + 2.4]);
      stood.set(key, { entry, px: entry.px, py: entry.py, local, batches });
    } catch (e) {
      console.warn('[mine] a mouth would not stand', /** @type {any} */ (e)?.message ?? e);
    } finally {
      pending.delete(key);
    }
  }

  function scan() {
    const built = deps.built();
    for (const [key, s] of stood) if (built.get(key) !== s.entry) { stood.delete(key); if (s.model) deps.collider?.()?.removeBucket?.(s.model.bucket); }   // its pixel's teardown took its batches
    if (deps.art && deps.art()?.state === 'loading') return;   // the owner's entrance first, once known - never flats stood a moment before it
    for (const [key, entry] of built) {
      if (stood.has(key) || pending.has(key) || !Number.isSafeInteger(entry?.px)) continue;
      if (!mineAt({ px: entry.px, py: entry.py, climate: deps.climateAt(entry.px, entry.py), occupied: deps.occupiedAt(entry.px, entry.py) })) continue;
      void stand(entry);
    }
  }

  return {
    /** Every frame: the streamed pixels walked now and then; the player's feet against each mouth. */
    frame() {
      const now = nowMs();
      if (now - scanAt >= SCAN_S * 1000) { scanAt = now; scan(); }
      if (!deps.outside()) return;
      const feet = deps.feet();
      if (!feet) return;
      let nearest = Infinity, near = null;
      for (const s of stood.values()) {
        const tr = deps.pixelTranslation(s.px, s.py, _t);
        const dx = feet[0] - (s.local[0] + tr[0]), dz = feet[2] - (s.local[2] + tr[2]), dy = feet[1] - (s.local[1] + tr[1]);
        const d = Math.hypot(dx, dz);
        if (d < MOUTH_SPOT_M && !spotted.has(`${s.px},${s.py}`)) { spotted.add(`${s.px},${s.py}`); writeSpotted(deps.storage, spotted); deps.say(MOUTH_TEXT.spotted()); }
        if (d < nearest && Math.abs(dy) < 4) { nearest = d; near = s; }
      }
      if (nearest > MOUTH_REARM_M) { armed = true; return; }
      if (!armed || nearest > MOUTH_ENTER_M || !near) return;
      armed = false;
      goIn(near);
    },
    /** The dark of each entrance's way in, pressable (the world's press and hover picks, beside Nyx's): boxes where they stand now. */
    targets() {
      const out = [];
      for (const s of stood.values()) {
        const c = s.model?.dark?.corners;
        if (!c) continue;
        const tr = deps.pixelTranslation(s.px, s.py, _t);
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const p of c) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k] + tr[k] - MOUTH_DARK_PAD_M); max[k] = Math.max(max[k], p[k] + tr[k] + MOUTH_DARK_PAD_M); }
        out.push({ key: `${MOUTH_KEY}${s.px},${s.py}`, aabb: { min, max }, distance: MOUTH_PRESS_M * 2, reach: MOUTH_PRESS_M, noSurface: true });
      }
      return out;
    },
    /** What a mouth's dark is called under the crosshair. */
    hoverName: (/** @type {string} */ key) => (String(key).startsWith(MOUTH_KEY) ? { title: MOUTH_TEXT.title(), subs: [MOUTH_TEXT.enter()] } : null),
    /** A press on a mouth's dark: Info names it, anything else goes in. Answers whether the key was a mouth's. */
    activate(/** @type {string} */ key, mode = 'grab') {
      if (!String(key).startsWith(MOUTH_KEY)) return false;
      const s = stood.get(String(key).slice(MOUTH_KEY.length));
      if (!s) return true;
      if (mode === 'info') deps.say(MOUTH_TEXT.info());
      else { armed = false; goIn(s); }
      return true;
    },
    /** The entrances, with the world (world.js's scene frame): each model at its pixel's translation now. */
    draw(/** @type {any} */ r) {
      if (!r?.drawMesh) return 0;
      let n = 0;
      for (const s of stood.values()) {
        if (!s.model?.gpu) continue;
        const tr = deps.pixelTranslation(s.px, s.py, _t);
        multiply(trs(tr[0], tr[1], tr[2], 0, 0, 0), s.model.L, s.model.W);
        r.drawMesh(s.model.gpu, s.model.W, null);
        if (s.model.dark) r.drawMesh(s.model.dark.gpu, s.model.W, null);
        n++;
      }
      return n;
    },
    /** The mouths this player has spotted, for the world maps: `{ px, py, label }` each (ui/poi/poiMapMark.js's shape). */
    mapMarks: () => [...spotted].map((k) => { const [px, py] = k.split(',').map(Number); return { px, py, label: MOUTH_TEXT.mapLabel() }; }).filter((m) => Number.isSafeInteger(m.px) && Number.isSafeInteger(m.py)),
    /** The mouths stood now (probes). */
    stood: () => [...stood.values()].map((s) => ({ px: s.px, py: s.py, local: [...s.local] })),
    /** The way out landed the player before a mouth: wait until they step away. */
    disarm() { armed = false; },
  };
}
