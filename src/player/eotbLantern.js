// The lantern hung on an Eye of the Beholder sprite, shared by the local and peer bodies.
import { RECORD_OFFSETS, ORIENTATIONS } from './eotbBillboard.js';
import { createLanternSwing, stepLanternSwing, lanternSwingDown, HIP_LANTERN_HEIGHT } from './lanternSwing.js';
import { LANTERN_TEMPLATE } from './playerTorch.js';
import { templateByIndex } from '../items/itemTemplates.js';
import { wrapAngle } from '../world/mat4.js';

export const BACK_RECORD = 4;
export function isRearView(orientation) {
  if (!Number.isInteger(orientation)) return false;
  return RECORD_OFFSETS[((orientation % ORIENTATIONS) + ORIENTATIONS) % ORIENTATIONS] === BACK_RECORD;
}

export const HIP_LANTERN_SPRITE = Object.freeze({ heightFraction: 0.5, side: 0.2, towardEye: 0.06, height: HIP_LANTERN_HEIGHT, minLength: 0.6 });
export const LANTERN_ART_KEY = 'htwaist-lantern';

export async function loadLanternArt() {
  const t = templateByIndex(LANTERN_TEMPLATE);
  const archive = t?.worldTextureArchive, record = t?.worldTextureRecord;
  if (!Number.isInteger(archive) || !Number.isInteger(record)) return null;
  try {
    const [{ TextureFile, texName }, { DFPalette }, { changeMask }, { getBytes }] = await Promise.all([
      import('../formats/textureFile.js'), import('../formats/dfPalette.js'), import('../formats/baseImageFile.js'), import('../scenes/dataSource.js'),
    ]);
    const pal = new DFPalette();
    pal.load(await getBytes('ART_PAL.COL'), 'ART_PAL.COL');
    const file = new TextureFile();
    file.load(await getBytes(texName(archive)), texName(archive), pal);
    return file.getColor32(changeMask(file.getDFBitmap(record, 0)), 0);
  } catch (e) {
    console.warn('[eotb] the lantern picture is unavailable; the lantern at the waist lights without being drawn', e);
    return null;
  }
}

/**
 * @param {() => any} getRenderer
 * @param {() => Promise<{width: number, height: number, colors: any}|null>} [load]
 */
export function createLanternArt(getRenderer, load = loadLanternArt) {
  let art;
  return {
    ensure() {
      if (art !== undefined || !getRenderer()) return art && !(art instanceof Promise) ? art : null;
      const p = Promise.resolve().then(() => load()).then((img) => {
        const renderer = getRenderer();
        if (!img || !renderer) { art = null; return; }
        renderer.uploadTexture(LANTERN_ART_KEY, 0, { width: img.width, height: img.height, colors: img.colors });
        art = { w: img.width, h: img.height };
      }, () => { art = null; });
      art = p;
      return null;
    },
  };
}

const REST = Object.freeze(createLanternSwing());

export function createSpriteLantern() {
  return {
    swing: createLanternSwing(),
    yaw: null,
    motion: { forward: 0, side: 0, yawRate: 0, stride: null },
    batch: null, batchH: 0,
    list: [],
    d: [0, 0, -1], hook: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0], origin: [0, 0, 0], mid: [0, 0, 0],
    w: 0, h: 0, fullH: 0,
  };
}

export function restSpriteLantern(l) {
  Object.assign(l.swing, REST);
  l.yaw = null;
  return l;
}

export function spriteStride(moving, speed, frame, timer, tick, frames) {
  if (!moving || !(frames > 1) || !(speed > 0)) return null;
  return (frame + Math.min(1, tick > 0 ? timer / tick : 0)) / frames;
}

export function stepSpriteLantern(l, dt, fx, fz, speed, stride) {
  const yaw = Math.atan2(fx, fz);
  const m = l.motion;
  m.yawRate = l.yaw != null && dt > 0 ? wrapAngle(yaw - l.yaw) / dt : 0;
  l.yaw = yaw;
  m.forward = speed || 0; m.side = 0; m.stride = stride;
  stepLanternSwing(l.swing, dt, m);
  return l;
}

export function hangSpriteLantern(l, base, spriteH, fx, fz, eye, feet, camYaw, scale, art) {
  const L = HIP_LANTERN_SPRITE;
  const h = L.height * scale, w = h * art.w / art.h;
  const rx = fz, rz = -fx;
  const ex = eye[0] - feet[0], ez = eye[2] - feet[2];
  const el = Math.hypot(ex, ez) || 1;
  const side = L.side * scale;
  const hook = l.hook;
  hook[0] = base[0] + rx * side + ex / el * L.towardEye;
  hook[1] = base[1] + spriteH * L.heightFraction;
  hook[2] = base[2] + rz * side + ez / el * L.towardEye;
  const d = lanternSwingDown(l.swing, l.d);
  const wx = rx * d[0] + fx * d[1], wy = d[2], wz = rz * d[0] + fz * d[1];
  const crx = Math.cos(camYaw), crz = -Math.sin(camYaw);
  const dx = wx * crx + wz * crz;
  const len = Math.hypot(dx, wy);
  const sin = len > 1e-6 ? dx / len : 0, cos = len > 1e-6 ? -wy / len : 1;
  const right = l.right, up = l.up;
  right[0] = crx * cos; right[1] = sin; right[2] = crz * cos;
  up[0] = -crx * sin; up[1] = cos; up[2] = -crz * sin;
  const drawnH = h * Math.max(L.minLength, Math.min(1, len));
  l.w = w; l.h = drawnH; l.fullH = h;
  l.origin[0] = hook[0] - up[0] * drawnH; l.origin[1] = hook[1] - up[1] * drawnH; l.origin[2] = hook[2] - up[2] * drawnH;
  l.mid[0] = hook[0] - up[0] * drawnH * 0.5; l.mid[1] = hook[1] - up[1] * drawnH * 0.5; l.mid[2] = hook[2] - up[2] * drawnH * 0.5;
  return l;
}

export function mintSpriteLantern(l, renderer) {
  if (l.batch && l.batchH !== l.fullH) dropSpriteLantern(l, renderer);
  if (!l.batch) {
    l.batch = renderer.createBillboardBatch(LANTERN_ART_KEY, 0, { w: l.w, h: l.fullH }, [[0, 0, 0]]);
    l.batch.origin = [0, 0, 0];
    l.batchH = l.fullH;
    l.list[0] = l.batch;
  }
  const b = l.batch;
  b.size.w = l.w; b.size.h = l.h;
  b.origin[0] = l.origin[0]; b.origin[1] = l.origin[1]; b.origin[2] = l.origin[2];
  return b;
}

export function dropSpriteLantern(l, renderer) {
  if (!l?.batch) return;
  renderer?.destroyBillboardBatch?.(l.batch);
  l.batch = null;
  l.list.length = 0;
}
