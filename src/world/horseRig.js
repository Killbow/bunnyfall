// @ts-check
// One baked stream serves every horse on a renderer. Each horse needs its own skin palette because a queued
// sprite-batch picture is drawn at the flush, with whatever palette it holds then.
import { HORSE_MODEL_URL, HORSE_PICTURE_URLS, horseSkinStream, horsePaletteShape, horsePoseScratch, horseGait, stepHorseGait, writeHorsePalette, startTexelMap, rgbaMips, horseHide } from './horseModel.js';
import { dyeHorseTexelRows, horseLookCode, horseLookOfCode } from '../travel/horseCoats.js';
import { drawBodyPicture, mwModelPixel } from '../render/characterSprite.js';
import { CHAR_SPRITE_RT_SIZE } from '../render/renderer.js';
import { decodePng } from '../render/textureReplacement.js';
import { multiply, trs, transformPoint } from './mat4.js';

export const HORSE3D_LOOKS_KEPT = 12;
export const DYE_ROWS = 32;
export const LOOK_ASK_STALE = 30;
const Z_UP_TO_PASS = trs(0, 0, 0, -90, 0, 0);
export function outOfView(c, r, view, proj) {
  if (!view || view.length !== 16) return false;
  const vx = view[0] * c[0] + view[4] * c[1] + view[8] * c[2] + view[12];
  const vy = view[1] * c[0] + view[5] * c[1] + view[9] * c[2] + view[13];
  const vz = view[2] * c[0] + view[6] * c[1] + view[10] * c[2] + view[14];
  if (vz > r) return true;
  if (!proj || proj.length !== 16 || proj[11] === 0) return false;
  const sx = proj[0], sy = proj[5];
  return Math.abs(vx) * sx + vz > r * Math.hypot(1, sx) || Math.abs(vy) * sy + vz > r * Math.hypot(1, sy);
}
export const HORSE_SEAT = Object.freeze([0, 0.1, 1.68]);
export const HORSE_SEAT_BONE = 'Spine';

const rigs = new WeakMap();
export function horseRigFor(renderer, opts = {}) {
  let r = rigs.get(renderer);
  if (!r) { r = createHorseRig({ renderer, ...opts }); rigs.set(renderer, r); }
  return r;
}

/** @param {{ renderer: any, fetchJson?: (url: string) => Promise<any>, fetchBytes?: (url: string) => Promise<Uint8Array>, decode?: (bytes: Uint8Array) => Promise<{ width: number, height: number, data: Uint8Array }> }} deps */
export function createHorseRig({ renderer, fetchJson = (u) => fetch(u).then((r) => r.json()), fetchBytes = (u) => fetch(u).then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)), decode = decodePng }) {
  /** @type {any} */ let bake = null;
  let base = null, shape = null, stream = null, hide = null, seatBone = -1, seatLocal = null;
  /** @type {{ width: number, height: number, data: Uint8Array } | null} */ let body = null;
  let hairTex = null, map = null, mapJob = null, failed = null;
  /** @type {Promise<void> | null} */ let loading = null;
  const looks = new Map();
  const asked = new Map();
  let job = null;
  let frame = 0;

  function load() {
    if (loading || !renderer) return loading;
    loading = (async () => {
      const [b, bodyBytes, hairBytes] = await Promise.all([fetchJson(HORSE_MODEL_URL), fetchBytes(HORSE_PICTURE_URLS.body), fetchBytes(HORSE_PICTURE_URLS.hair)]);
      const [bodyImg, hairImg] = await Promise.all([decode(bodyBytes), decode(hairBytes)]);
      bake = b;
      body = bodyImg;
      shape = horsePaletteShape(bake);
      stream = horseSkinStream(bake);
      hide = horseHide(bake);
      seatBone = bake.bones.findIndex((x) => x.name === HORSE_SEAT_BONE);
      if (seatBone >= 0) {
        const inv = bake.bones[seatBone].inverseBind;
        seatLocal = [0, 1, 2].map((r) => inv[r] * HORSE_SEAT[0] + inv[4 + r] * HORSE_SEAT[1] + inv[8 + r] * HORSE_SEAT[2] + inv[12 + r]);
      }
      base = renderer.createSkinnedCharacterMesh(stream.stream, { floats: stream.floats, pairs: stream.pairs, width: shape.width, height: shape.height });
      renderer.releaseCharacterSkin(base);
      looks.set(0, { tex: renderer.createCharacterTexture(rgbaMips(body.width, body.height, body.data)), last: Infinity });
      hairTex = renderer.createCharacterTexture(rgbaMips(hairImg.width, hairImg.height, hairImg.data));
    })().catch((e) => { failed = String(e?.message ?? e); });
    return loading;
  }

  function lookTex(code) {
    const c = Number.isInteger(code) && code > 0 ? code : 0;
    const have = looks.get(c);
    if (have) { have.last = frame; return have.tex; }
    if (job?.code !== c) asked.set(c, frame);
    return looks.get(0)?.tex ?? null;
  }

  function tick() {
    frame++;
    if (!base || !body) return;
    for (const [c, at] of asked) if (frame - at > LOOK_ASK_STALE) asked.delete(c);
    if (!job && asked.size) {
      if (!map) { mapJob ??= startTexelMap(bake, body.width, body.height); if (!mapJob.step()) return; map = mapJob.map; mapJob = null; return; }
      const code = /** @type {number} */ (asked.keys().next().value);
      asked.delete(code);
      job = { code, look: horseLookOfCode(code), out: new Uint8Array(body.data), row: 0 };
    }
    if (job) {
      const r1 = Math.min(body.height, job.row + DYE_ROWS);
      dyeHorseTexelRows(body.data, job.out, body.width, job.look, map, job.row, r1);
      job.row = r1;
      if (r1 >= body.height) {
        looks.set(job.code, { tex: renderer.createCharacterTexture(rgbaMips(body.width, body.height, job.out)), last: frame });
        job = null;
      }
    }
    while (looks.size > HORSE3D_LOOKS_KEPT + 1) {
      let worst = null, at = Infinity;
      // Never evict a look drawn this frame or the last: horses step before this tick, so that texture is already
      // on a mesh.
      for (const [c, l] of looks) if (c && l.last < frame - 2 && l.last < at) { at = l.last; worst = c; }
      if (worst == null) break;
      renderer.releaseCharacterTexture(looks.get(worst).tex);
      looks.delete(worst);
    }
  }

  function horse(seed = 0) {
    if (!base) return null;
    const pal = new Float32Array(shape.width * shape.height * 4);
    const mesh = { vao: base.vao, count: base.count, buffers: [], vbo: base.vbo, floats: base.floats, bounds: null,
      skin: renderer.createSkinPalette({ pairs: stream.pairs, width: shape.width, height: shape.height }),
      ranges: stream.ranges.map((r) => ({ first: r.first, count: r.count, tex: r.texture === 'hair' ? hairTex : null, alphaCut: r.alpha ? 0.5 : 0, hidden: false, part: r.part })) };
    return { seed, gait: horseGait(), scratch: horsePoseScratch(bake), pal, mesh, model: null, feet: [0, 0, 0], yaw: 0, scale: 1, look: 0,
      posed: false, stale: false };
  }

  function release(h) {
    if (h?.mesh?.skin?.tex) renderer.releaseCharacterSkin(h.mesh);
  }

  // The palette depends only on the gait clock, so a pose after skipped frames matches an every-frame horse. A
  // horse never posed is posed whatever `pose` says.
  function step(h, { feet, yaw, speed = 0, dt = 0, look = 0, gallops = true, pose = true }) {
    stepHorseGait(h.gait, bake, speed, dt, h.seed, gallops);
    if (pose || !h.posed) poseNow(h);
    else h.stale = true;
    h.look = horseLookCode(horseLookOfCode(look | 0));
    h.mesh.ranges[0].tex = lookTex(h.look);
    return place(h, feet, yaw);
  }

  function poseNow(h) {
    writeHorsePalette(bake, h.gait, h.pal, h.scratch);
    renderer.updateSkinPalette(h.mesh, h.pal);
    h.posed = true; h.stale = false;
  }
  function pose(h) {
    if (!h || (h.posed && !h.stale)) return false;
    poseNow(h);
    return true;
  }

  function place(h, feet, yaw, scale = 1) {
    h.feet[0] = feet[0]; h.feet[1] = feet[1]; h.feet[2] = feet[2];
    h.yaw = yaw; h.scale = scale;
    // Matches the Morrowind body placement in `drawThird`: heading turned half round, x mirrored, then Z up to Y
    // up.
    h.model = multiply(trs(feet[0], feet[1], feet[2], 0, (yaw * 180) / Math.PI + 180, 0, -scale, scale, scale), Z_UP_TO_PASS);
    return h;
  }

  function picture(h, feet, yaw, scale = 1) {
    if (!h?.model) return null;
    place(h, feet, yaw, scale);
    return { mesh: h.mesh, model: h.model, box: box(h) };
  }

  function seat(h) {
    if (!h?.model || seatBone < 0) return null;
    const W = h.scratch.world, o = seatBone * 12, s = seatLocal;
    const local = [0, 1, 2].map((r) => W[o + r * 4] * s[0] + W[o + r * 4 + 1] * s[1] + W[o + r * 4 + 2] * s[2] + W[o + r * 4 + 3]);
    return transformPoint(h.model, local[0], local[1], local[2]);
  }

  function box(h) {
    const b = bake.frame.bounds, k = h.scale ?? 1;
    const center = transformPoint(h.model, (b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2 + 0.05);
    const halfH = ((b.max[2] - b.min[2]) / 2 + 0.1) * k;
    const halfW = (Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2 + 0.1) * k;
    const anchor = transformPoint(h.model, 0, 0, (b.min[2] + b.max[2]) / 2);
    return { center, halfW, halfH, anchor };
  }

  function seen(h, view, proj, bx = h?.model ? box(h) : null) {
    return !bx || !outOfView(bx.center, Math.hypot(bx.halfW, bx.halfH), view, proj);
  }

  function draw(h, canvas, { proj, view, eye, up = null, conceal = null, hitFlash = 0, fresh = false }) {
    if (!h?.model || !canvas) return false;
    const bx = box(h);
    if (!seen(h, view, proj, bx)) return false;
    if (fresh) pose(h);
    drawBodyPicture(renderer, canvas, h.mesh, h.model, { ...bx, up, conceal, hitFlash }, proj, view, eye);
    return true;
  }

  function drawFirstPerson(h, canvas, { proj, view }) {
    if (!h?.model || !canvas) return false;
    const pixel = mwModelPixel();
    const wantW = canvas.clientWidth / pixel, wantH = canvas.clientHeight / pixel;
    const edge = renderer.charSpriteRoom?.(Math.ceil(Math.max(wantW, wantH))) ?? CHAR_SPRITE_RT_SIZE;
    const s = Math.min(1, edge / wantW, edge / wantH);
    const pw = Math.max(2, Math.round(wantW * s)), ph = Math.max(2, Math.round(wantH * s));
    const tex = renderer.renderCharacterSprite(h.mesh, h.model, proj, view, pw, ph);
    renderer.drawScreenOverlayQuad(tex, pw / edge, ph / edge);
    return true;
  }

  return {
    load, tick, horse, release, step, pose, place, picture, seat, box, seen, draw, drawFirstPerson, lookTex,
    ready: () => !!base,
    failure: () => failed,
    bake: () => bake,
    hide: () => hide,
    kept: () => [...looks.keys()],
    dyeing: () => job?.code ?? null,
  };
}
