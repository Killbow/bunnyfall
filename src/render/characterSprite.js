// @ts-check
import { multiply, ortho, lookAt, perspective, transformPoint, trs } from '../world/mat4.js';
import { CHAR_PIXEL, CHAR_SPRITE_RT_SIZE, MW_ARM_PIXEL } from './renderer.js';
import { getPref } from '../ui/uiPrefs.js';
import { glowPad } from './weaponGlowGlsl.js';

const WORLD_UP = Object.freeze([0, 1, 0]);
const imageTexel = (span, pixel) => (span ? Math.max(1, Math.round(pixel * span[0] / span[1])) : pixel);
const levelHeading = (view) => { const x = -view[2], z = -view[10], l = Math.hypot(x, z) || 1; return [x / l, 0, z / l]; };
export const PICTURE_NEAR = 0.1;

export function drawCharacterSprite(renderer, canvas, rig, rigMat, proj, view, eye) {
  const s = rig.scale;
  const b = rig.liveBounds;
  const worldH = (b.maxY - b.minY) * s;
  const halfH = worldH / 2;
  const halfW = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) * s / 2;
  const center = transformPoint(rigMat, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  return drawRigSpriteBox(renderer, canvas, rig.mesh, rigMat, { center, halfW, halfH }, proj, view, eye);
}

// With an anchor the quad sits where the anchor's image lands, so gear that shifts the box cannot resize the body.
export function bodyFxPad(fx) {
  if (!fx || fx.dissolve?.[0] > 0) return 0;
  if (fx.elite > 0) return 20;
  return fx.elite < 0 || fx.glint?.[3] > 0 ? 2 : 0;
}

export function drawRigSpriteBox(renderer, canvas, mesh, rigMat, { center, halfW: boxW, halfH: boxH, anchor = null, hitFlash = 0, conceal = null, up = null, fx = null, also = null, glowLook = null }, proj, view, eye, pixel = CHAR_PIXEL) {
  const aim = anchor && Math.hypot(anchor[0] - eye[0], anchor[1] - eye[1], anchor[2] - eye[2]) > 1e-6 ? anchor : center;
  const flat = up == null && !!getPref('mwBillboardLook');
  const dx = aim[0] - eye[0], dy = flat ? 0 : aim[1] - eye[1], dz = aim[2] - eye[2];
  const lvl = Math.hypot(dx, dz);
  const dist = flat ? lvl : Math.max(0.5, Math.hypot(dx, dy, dz));
  const camDir = flat && !(lvl > 1e-6) ? levelHeading(view) : [dx / dist, dy / dist, dz / dist];
  // The picture is an ortho along the pitched ray, so the window grows by halfW * tilt to hold the box's far top.
  const tilt = Math.min(1, Math.abs(dy) / (Math.hypot(dx, dy, dz) || 1));
  let halfW = boxW;
  let halfH = boxH * Math.sqrt(1 - tilt * tilt) + halfW * tilt;
  const rl = Math.hypot(camDir[0], camDir[2]) || 1;
  const right = [-camDir[2] / rl, 0, camDir[0] / rl];
  // The quad leans by the picture's own up, so the eye does not foreshorten the body twice.
  const qUp = up ?? (flat ? WORLD_UP : pictureUp(camDir));
  const at = aim === center ? center : landAnchor(center, anchor, camDir, right, qUp);
  const pvS = multiply(proj, view);
  const prjY = (x, y, z) => { const w = pvS[3]*x + pvS[7]*y + pvS[11]*z + pvS[15]; return (pvS[1]*x + pvS[5]*y + pvS[9]*z + pvS[13]) / w; };
  // Under retro mode a texel is a whole number of the image's pixels, so the sprite does not shimmer.
  const span = renderer.retroImageSpan ?? null;
  const texel = imageTexel(span, pixel);
  const screenPxH = Math.abs(prjY(at[0] + qUp[0] * halfH, at[1] + qUp[1] * halfH, at[2] + qUp[2] * halfH) - prjY(at[0] - qUp[0] * halfH, at[1] - qUp[1] * halfH, at[2] - qUp[2] * halfH)) * (span ? span[0] : canvas.clientHeight) / 2;
  const rows = span ? span[0] : canvas.clientHeight;
  const cap = renderer.charSpriteRoom?.(Math.min(Math.round(screenPxH / texel), Math.ceil(rows / texel))) ?? CHAR_SPRITE_RT_SIZE;
  let ph = Math.min(cap, Math.max(2, Math.round(screenPxH / texel)));
  const pad = Math.max(bodyFxPad(fx), ...(Array.isArray(glowLook) ? glowLook : glowLook ? [glowLook] : []).map((l) => glowPad(l, ph)), 0);
  if (pad) {
    const grow = (2 * pad) / ph;
    halfW += halfH * grow; halfH *= 1 + grow;
    ph = Math.min(cap, ph + 2 * pad);
  }
  const pw = Math.min(cap, Math.max(2, Math.round(ph * halfW / halfH)));
  // The picture's depth range holds the whole box, so a body the travel view grows is not sliced.
  const reach = Math.max(4, halfW + boxH + 1);
  const miniEye = [center[0] - camDir[0] * reach, center[1] - camDir[1] * reach, center[2] - camDir[2] * reach];
  const sProj = ortho(halfW, halfH, PICTURE_NEAR, 2 * reach), sView = lookAt(miniEye, center, [0, 1, 0]);
  const depth = up == null && qUp !== WORLD_UP ? pictureDepth(camDir, center, at, reach) : null;
  if (renderer.characterSpriteBatchOpen) {
    renderer.queueCharacterSprite({ mesh, model: rigMat, also, proj: sProj, view: sView, pw, ph, tx: 0, ty: 0, quad: { at, halfW, halfH, right, hitFlash, conceal, up: qUp, fx, depth } });
    return { center: at, halfW, halfH, pw, ph };
  }
  const sTex = also ? renderer.renderCharacterSprite(mesh, rigMat, sProj, sView, pw, ph, { also }) : renderer.renderCharacterSprite(mesh, rigMat, sProj, sView, pw, ph);
  const rt = renderer.charSpriteEdge ?? CHAR_SPRITE_RT_SIZE;
  renderer.drawCharacterSpriteQuad(sTex, at, halfW, halfH, right, pw / rt, ph / rt, hitFlash, conceal, qUp, null, fx, depth);
  return { center: at, halfW, halfH, pw, ph };
}

export const mwModelPixel = () => (getPref('mwModelDetail') === 'sharp' ? 1 : MW_ARM_PIXEL);

const WINDOW_DEPTH = Object.freeze({ window: true });
const CROP_PV = new Float32Array(16);
const CROP_CORNERS = new Float64Array(24);
// The window is rounded out to whole texels counted from the image corner, so a pixelated body's grid never slides.
/**
 * @param {ArrayLike<number>} proj @param {ArrayLike<number>} view
 * @param {{ center: number[], halfW: number, halfH: number }} box
 * @param {number} texel
 * @param {number[]} image
 * @param {(rows: number) => number} [padOf]
 * @param {number} [cap]
 * @returns {{ proj: Float32Array, pw: number, ph: number, texel: number, ndc: [number, number, number, number] } | null}
 */
export function cropPicture(proj, view, { center, halfW, halfH }, texel, [W, H], padOf = () => 0, cap = Infinity) {
  const pv = multiply(proj, view, CROP_PV);
  const near = proj[14] / (proj[10] - 1);
  const clip = CROP_CORNERS;
  for (let i = 0; i < 8; i++) {
    const x = center[0] + (i & 1 ? halfW : -halfW), y = center[1] + (i & 2 ? halfH : -halfH), z = center[2] + (i & 4 ? halfW : -halfW);
    clip[i * 3] = pv[0] * x + pv[4] * y + pv[8] * z + pv[12];
    clip[i * 3 + 1] = pv[1] * x + pv[5] * y + pv[9] * z + pv[13];
    clip[i * 3 + 2] = pv[3] * x + pv[7] * y + pv[11] * z + pv[15];
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (x, y, w) => { const nx = x / w, ny = y / w; x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny); };
  for (let i = 0; i < 8; i++) {
    const a = i * 3, aIn = clip[a + 2] >= near;
    if (aIn) take(clip[a], clip[a + 1], clip[a + 2]);
    for (let bit = 1; bit <= 4; bit <<= 1) {
      if (i & bit) continue;
      const b = (i | bit) * 3;
      if (aIn === (clip[b + 2] >= near)) continue;
      const t = (near - clip[a + 2]) / (clip[b + 2] - clip[a + 2]);
      take(clip[a] + t * (clip[b] - clip[a]), clip[a + 1] + t * (clip[b + 1] - clip[a + 1]), near);
    }
  }
  const px = [(x0 + 1) / 2 * W, (y0 + 1) / 2 * H, (x1 + 1) / 2 * W, (y1 + 1) / 2 * H];
  if (!(px[2] > 0 && px[3] > 0 && px[0] < W && px[1] < H)) return null;
  const grid = (t, pad) => {
    const k0 = Math.max(0, Math.floor(px[0] / t) - pad), r0 = Math.max(0, Math.floor(px[1] / t) - pad);
    return { t, k0, r0, pw: Math.min(Math.ceil(W / t), Math.ceil(px[2] / t) + pad) - k0, ph: Math.min(Math.ceil(H / t), Math.ceil(px[3] / t) + pad) - r0 };
  };
  const padded = (t) => grid(t, padOf(grid(t, 0).ph));
  let g = padded(Math.max(1, Math.round(texel)));
  while (g.pw > cap || g.ph > cap) g = padded(Math.max(g.t + 1, Math.ceil(g.t * Math.max(g.pw, g.ph) / cap)));
  const nx0 = (2 * g.k0 * g.t) / W - 1, nx1 = (2 * (g.k0 + g.pw) * g.t) / W - 1;
  const ny0 = (2 * g.r0 * g.t) / H - 1, ny1 = (2 * (g.r0 + g.ph) * g.t) / H - 1;
  const sx = 2 / (nx1 - nx0), sy = 2 / (ny1 - ny0);
  const crop = new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, -(nx1 + nx0) / (nx1 - nx0), -(ny1 + ny0) / (ny1 - ny0), 0, 1]);
  return { proj: multiply(crop, proj), pw: g.pw, ph: g.ph, texel: g.t, ndc: [nx0, ny0, nx1, ny1] };
}

// Right and up are signed so u and v run with the window's x and y, because the world lens is mirrored in x.
/** @returns {{ at: number[], halfW: number, halfH: number, right: number[], up: number[] }} */
export function cropQuad(proj, view, [nx0, ny0, nx1, ny1], at) {
  const r = [view[0], view[4], view[8]], u = [view[1], view[5], view[9]], b = [view[2], view[6], view[10]];
  const eye = [0, 1, 2].map((k) => -(r[k] * view[12] + u[k] * view[13] + b[k] * view[14]));
  const near = proj[14] / (proj[10] - 1), far = proj[14] / (proj[10] + 1);
  const ahead = -(b[0] * (at[0] - eye[0]) + b[1] * (at[1] - eye[1]) + b[2] * (at[2] - eye[2]));
  const d = Math.min(Math.max(ahead, 2 * near), 0.99 * far);
  const vx = (n) => (d * (n + proj[8]) - proj[12]) / proj[0], vy = (n) => (d * (n + proj[9]) - proj[13]) / proj[5];
  const xc = (vx(nx0) + vx(nx1)) / 2, yc = (vy(ny0) + vy(ny1)) / 2, w = vx(nx1) - vx(nx0), h = vy(ny1) - vy(ny0);
  return {
    at: [0, 1, 2].map((k) => eye[k] + r[k] * xc + u[k] * yc - b[k] * d),
    halfW: Math.abs(w) / 2, halfH: Math.abs(h) / 2,
    right: r.map((v) => v * Math.sign(w)), up: u.map((v) => v * Math.sign(h)),
  };
}

export function drawBodyPicture(renderer, canvas, mesh, rigMat, box, proj, view, eye) {
  const pixel = mwModelPixel();
  if (box.up != null || getPref('mwBillboardLook') || !(proj[11] < 0)) return drawRigSpriteBox(renderer, canvas, mesh, rigMat, box, proj, view, eye, pixel);
  const { center, halfW, halfH, anchor = null, hitFlash = 0, conceal = null, fx = null, also = null, glowLook = null } = box;
  const texel = imageTexel(renderer.retroImageSpan ?? null, pixel);
  const image = renderer.worldImageSize ?? [Math.round(canvas.clientHeight * Math.abs(proj[5] / proj[0])), canvas.clientHeight];
  const looks = Array.isArray(glowLook) ? glowLook : glowLook ? [glowLook] : [];
  const padOf = (rows) => Math.max(bodyFxPad(fx), ...looks.map((l) => glowPad(l, rows)), 0);
  const body = { center, halfW, halfH };
  let pic = cropPicture(proj, view, body, texel, image, padOf);
  if (!pic) return { center: anchor ?? center, halfW: 0, halfH: 0, pw: 0, ph: 0 };
  const edge = renderer.charSpriteRoom?.(Math.max(pic.pw, pic.ph)) ?? CHAR_SPRITE_RT_SIZE;
  if (pic.pw > edge || pic.ph > edge) pic = cropPicture(proj, view, body, texel, image, padOf, edge);
  const q = cropQuad(proj, view, pic.ndc, anchor ?? center);
  if (renderer.characterSpriteBatchOpen) renderer.queueCharacterSprite({ mesh, model: rigMat, also, proj: pic.proj, view, pw: pic.pw, ph: pic.ph, tx: 0, ty: 0, quad: { at: q.at, halfW: q.halfW, halfH: q.halfH, right: q.right, hitFlash, conceal, up: q.up, fx, depth: WINDOW_DEPTH } });
  else {
    const sTex = also ? renderer.renderCharacterSprite(mesh, rigMat, pic.proj, view, pic.pw, pic.ph, { also }) : renderer.renderCharacterSprite(mesh, rigMat, pic.proj, view, pic.pw, pic.ph);
    const rt = renderer.charSpriteEdge ?? CHAR_SPRITE_RT_SIZE;
    renderer.drawCharacterSpriteQuad(sTex, q.at, q.halfW, q.halfH, q.right, pic.pw / rt, pic.ph / rt, hitFlash, conceal, q.up, null, fx, WINDOW_DEPTH);
  }
  return { center: q.at, halfW: q.halfW, halfH: q.halfH, pw: pic.pw, ph: pic.ph };
}

// For an eye within half a meter of the aim, dir is short of unit length, so the eye sits |dir| * reach back.
/**
 * @param {number[]} dir @param {number[]} center @param {number[]} at @param {number} reach
 * @returns {{ dir: number[], near: number, range: number, base: number } | null}
 */
export function pictureDepth(dir, center, at, reach, near = PICTURE_NEAR, far = 2 * reach) {
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  if (!(l > 0) || !(reach > 0)) return null;
  const u = [dir[0] / l, dir[1] / l, dir[2] / l];
  const base = l * reach + u[0] * (at[0] - center[0]) + u[1] * (at[1] - center[1]) + u[2] * (at[2] - center[2]);
  return { dir: u, near, range: far - near, base };
}

export function pictureUp(dir) {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const nx = dir[0] / l, ny = dir[1] / l, nz = dir[2] / l;
  const hl = Math.hypot(nx, nz) || 1;
  return [-nx * ny / hl, hl, -nz * ny / hl];
}

export function landAnchor(center, anchor, dir, right, quadUp = WORLD_UP) {
  const up = pictureUp(dir);
  const ax = anchor[0] - center[0], ay = anchor[1] - center[1], az = anchor[2] - center[2];
  const px = ax * right[0] + ay * right[1] + az * right[2];
  const py = ax * up[0] + ay * up[1] + az * up[2];
  return [anchor[0] - right[0] * px - quadUp[0] * py, anchor[1] - right[1] * px - quadUp[1] * py, anchor[2] - right[2] * px - quadUp[2] * py];
}

export function drawFirstPersonViewmodel(renderer, canvas, rig, feet, yaw, eyeHeight) {
  const wantW = canvas.clientWidth / CHAR_PIXEL, wantH = canvas.clientHeight / CHAR_PIXEL;
  const scale = Math.min(1, CHAR_SPRITE_RT_SIZE / wantW, CHAR_SPRITE_RT_SIZE / wantH);
  const pw = Math.max(2, Math.round(wantW * scale));
  const ph = Math.max(2, Math.round(wantH * scale));
  const s = rig.scale;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const back = 0.25;
  const rigX = feet[0] - sinY * back;
  const rigZ = feet[2] - cosY * back;
  const rigMat = trs(rigX, feet[1] - rig.liveFootY * s, rigZ, 0, yaw * 180 / Math.PI, 0, s, s, s);
  const eye = [feet[0], feet[1] + eyeHeight, feet[2]];
  const fwd = [sinY, -0.20, cosY];
  const proj = perspective(Math.PI / 3, pw / ph, 0.05, 12);
  const view = lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 1, 0]);
  const tex = renderer.renderCharacterSprite(rig.mesh, rigMat, proj, view, pw, ph);
  const rt = renderer.charSpriteEdge ?? CHAR_SPRITE_RT_SIZE;
  renderer.drawScreenOverlayQuad(tex, pw / rt, ph / rt);
}
