// @ts-check
// Draws and plays sound only: the caster's hidden missile deals the damage, so another player's game can replay the
// same fall from the same few inputs.
import { groundAt } from '../player/groundRay.js';
import { flatMesh, flatModel, seededRandom } from '../world/flatMesh.js';
import { placePictureSource, placePicture, rockPictureSource } from '../world/placePicture.js';
import { placeNow } from '../weather/placeClimate.js';
import { missileArchive, EXPLOSION_RADIUS } from '../magic/spellcast.js';
import { elementFxKind } from '../render/spellImpactFx.js';
import { spellArt } from '../render/spellArt.js';
import { createSpellDebris } from '../magic/spellDebris.js';

export const METEOR_FALL_S = 1;
const DROP_G = 16;
const ROCK_M = 1, CRATER_R = 2, CRATER_S = 20, CRATER_FADE_S = 4, CRATERS = 8;
const DUST = { archive: 380, record: 2 };
const TAIL = [[0.7, 2], [1.5, 1.5], [2.4, 1.1]], TRAIL_M = 0.4, TRAIL_MAX = 6, TRAIL_ALPHA = 0.6;
const PLAIN = { kind: 'rock', archive: 47, record: 0 };

export function fallSeconds(from, to, indoor) {
  if (!indoor) return METEOR_FALL_S;
  return Math.min(METEOR_FALL_S, Math.max(0.35, Math.sqrt((2 * Math.max(0, from[1] - to[1])) / DROP_G)));
}

function rockModel(seed, art) {
  const rnd = seededRandom(seed), t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const mids = new Map(), mid = (a, b) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (!mids.has(k)) { v.push([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]); mids.set(k, v.length - 1); }
    return mids.get(k);
  };
  f = f.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
  v = v.map((p) => { const l = Math.hypot(...p), k = (ROCK_M / 2) * (0.78 + rnd() * 0.3) / l; return [p[0] * k, p[1] * k * 0.85, p[2] * k]; });
  const b = flatMesh(0.6);
  for (const [a, c, d] of f) b.tri(v[a], v[c], v[d], [v[a][0] + v[c][0] + v[d][0], v[a][1] + v[c][1] + v[d][1], v[a][2] + v[c][2] + v[d][2]]);
  return flatModel(b, art);
}

function craterModel(seed, art, floorAt) {
  const rnd = seededRandom(seed), N = 24, RINGS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.88, 1];
  const rim = Array.from({ length: N }, () => 0.88 + rnd() * 0.22);
  const pt = (k, i) => {
    const a = (i / N) * Math.PI * 2, r = CRATER_R * RINGS[k] * (k === RINGS.length - 1 ? rim[i % N] : 1);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    return [x, floorAt(x, z), z];
  };
  const b = flatMesh(1, (p) => [0.5 + p[0] / (2 * CRATER_R * 1.1), 0.5 + p[2] / (2 * CRATER_R * 1.1)]);
  const c = [0, floorAt(0, 0), 0];
  for (let i = 0; i < N; i++) {
    b.tri(c, pt(0, i), pt(0, i + 1), [0, 1, 0]);
    for (let k = 1; k < RINGS.length; k++) b.quad(pt(k - 1, i), pt(k, i), pt(k, i + 1), pt(k - 1, i + 1), [0, 1, 0]);
  }
  return flatModel(b, art);
}

function scorch(pic, tint) {
  const { width: w, height: h } = pic, src = pic.colors, out = new Uint8ClampedArray(w * h * 4);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = Math.hypot((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5) * 2.2;
    const burn = 1 - smooth(0.25, 1, r), lum = (src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11) / 255;
    const dark = 0.3 + 0.35 * (1 - burn);
    for (let c = 0; c < 3; c++) out[i + c] = (src[i + c] * (1 - 0.6 * burn) + tint[c] * lum * 1.5 * 0.6 * burn) * dark;
    out[i + 3] = 255 * (1 - smooth(0.82, 1, r));
  }
  return { width: w, height: h, colors: out };
}

async function elementTint(getTexture, el) {
  try {
    const t = await getTexture(missileArchive(el)), c = t.getColor32(t.getDFBitmap(1, 0), 0).colors;
    const s = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < c.length; i += 4) if (c[i + 3]) { s[0] += c[i]; s[1] += c[i + 1]; s[2] += c[i + 2]; n++; }
    const m = Math.max(...s) / Math.max(1, n) || 1;
    return s.map((v) => (v / Math.max(1, n)) * (255 / m));
  } catch { return [255, 160, 90]; }
}

/** @param {{ collider: any, getTexture?: ((archive: number) => Promise<any>) | null, flats?: { fly: (archive: number, pos: number[], o?: any) => any, puff: (archive: number, record: number, pos: number[], o?: any) => any } | null, glow?: ((kind: string, pos: number[], o?: any) => void) | null, thud?: ((pos: number[], o?: any) => void) | null }} deps */
export function createMeteorFall(deps) {
  const { collider } = deps;
  const falls = [], craters = [], later = [];
  const stones = createSpellDebris({ collider });
  let stoneSrc = null, stoneArt = null;
  const read = (s) => placePicture(s, deps.getTexture);
  const fly = (archive, pos, o) => { try { return deps.flats?.fly(archive, pos, o) ?? null; } catch { return null; } };
  const puff = (archive, record, pos, o) => { try { deps.flats?.puff(archive, record, pos, o); } catch {} };
  const rot = (m, axis, ang, s, p) => {
    const [x, y, z] = axis, c = Math.cos(ang), sn = Math.sin(ang), t = 1 - c;
    m.set([(t * x * x + c) * s, (t * x * y + sn * z) * s, (t * x * z - sn * y) * s, 0, (t * x * y - sn * z) * s, (t * y * y + c) * s, (t * y * z + sn * x) * s, 0,
      (t * x * z + sn * y) * s, (t * y * z - sn * x) * s, (t * z * z + c) * s, 0, p[0], p[1], p[2], 1]);
  };
  function freeMesh(o) { if (o.mesh) { try { o.gpu?.destroyMesh?.(o.mesh); } catch {} } o.mesh = null; }

  function launch({ from, to, element = 0, seed = 1, indoor = false }) {
    const el = Math.max(0, Math.min(4, element | 0)), rnd = seededRandom(seed), len = fallSeconds(from, to, indoor);
    const axis = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], al = Math.hypot(...axis) || 1;
    const f = { from: [...from], to: [...to], el, seed, indoor, len, age: 0, pos: [...from], trail: [...from], axis: axis.map((a) => a / al),
      spin: 5 + rnd() * 4, mat: new Float32Array(16), mesh: null, gpu: null, artKey: null, src: rockPictureSource(placeNow(to)),
      aura: fly(missileArchive(el), from, { record: 0, fps: 12, scale: 2.6 }), tail: TAIL.map(([, s]) => fly(missileArchive(el), from, { record: 0, fps: 12, scale: s })) };
    falls.push(f);
    if (indoor) {
      for (let i = 0; i < 8; i++) stones.throw([from[0] + (rnd() - 0.5) * 1.6, from[1], from[2] + (rnd() - 0.5) * 1.6], [(rnd() - 0.5) * 1.5, -rnd(), (rnd() - 0.5) * 1.5], 0.06 + rnd() * 0.1, to[1]);
      for (let i = 0; i < 5; i++) puff(DUST.archive, DUST.record, [from[0] + (rnd() - 0.5) * 2, from[1] - 0.2, from[2] + (rnd() - 0.5) * 2], { fps: 7, scale: 4 + rnd() * 2 });
      stoneSrc = placePictureSource(placeNow(to));
    } else deps.thud?.(to, { sound: 'meteorFall', heard: 90 });
    return len;
  }

  function impact(f) {
    const at = f.to, rnd = seededRandom(f.seed * 31 + 7), arch = missileArchive(f.el);
    f.aura?.retire();
    for (const h of f.tail) h?.retire();
    freeMesh(f);
    stoneSrc = placePictureSource(placeNow(at));
    puff(arch, 1, [at[0], at[1] + 1, at[2]], { fps: 11, scale: 4.5 });
    try { deps.glow?.(elementFxKind(f.el), [at[0], at[1] + 0.3, at[2]], { power: 1.3, area: EXPLOSION_RADIUS, areaFrom: at, scale: 1.4 }); } catch {}
    deps.thud?.(at, { sound: 'meteorImpact', heard: 80, shake: 5 });
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, out = 2 + rnd() * 6;
      stones.throw([at[0] + Math.cos(a) * 0.4, at[1] + 0.2, at[2] + Math.sin(a) * 0.4], [Math.cos(a) * out, 3 + rnd() * 6, Math.sin(a) * out], 0.1 + rnd() * 0.22, at[1]);
    }
    [[0, 0.8, 6], [0.12, 1.7, 8], [0.28, 2.7, 10], [0.5, 3.6, 12], [0.8, 4.3, 12]].forEach(([t, r, n], k) => {
      for (let i = 0; i < n; i++) {
        const a = ((i + rnd()) / n) * Math.PI * 2, x = at[0] + Math.cos(a) * r, z = at[2] + Math.sin(a) * r, g = groundAt(collider, x, z);
        const y = (Number.isFinite(g) && Math.abs(g - at[1]) < 2 ? g : at[1]) + 0.5 + rnd() * 0.4;
        later.push({ t, archive: DUST.archive, record: DUST.record, pos: [x, y, z], fps: 8 - k, scale: 4 + k + rnd() * 2 });
      }
    });
    for (let i = 0; i < 5; i++) later.push({ t: 0.1 + i * 0.12, archive: arch, record: 1, pos: [at[0] + (rnd() - 0.5) * 1.5, at[1] + 1.2 + i * 0.5, at[2] + (rnd() - 0.5) * 1.5], fps: 7, scale: 3 + rnd() });
    const floorY = at[1];
    craters.push({ at: [...at], el: f.el, seed: f.seed, age: 0, src: stoneSrc, mesh: null, gpu: null, artKey: null, mat: new Float32Array(16),
      floorAt: (x, z) => { const g = groundAt(collider, at[0] + x, at[2] + z); return (Number.isFinite(g) && Math.abs(g - floorY) < 1.5 ? g : floorY) - floorY + 0.06; } });
    while (craters.length > CRATERS) freeMesh(craters.shift());
  }

  function step(dt) {
    for (let i = falls.length - 1; i >= 0; i--) {
      const f = falls[i];
      f.age += dt;
      const k = Math.min(1, f.age / f.len), s = f.indoor ? k * k : k;
      for (let c = 0; c < 3; c++) f.pos[c] = f.from[c] + (f.to[c] - f.from[c]) * s;
      f.aura?.move(f.pos);
      const back = [f.from[0] - f.to[0], f.from[1] - f.to[1], f.from[2] - f.to[2]], bl = Math.hypot(...back) || 1;
      TAIL.forEach(([m], j) => { const b = Math.min(m, Math.hypot(f.pos[0] - f.from[0], f.pos[1] - f.from[1], f.pos[2] - f.from[2])); f.tail[j]?.move(f.pos.map((v, c) => v + (back[c] / bl) * b)); });
      const gap = Math.hypot(f.pos[0] - f.trail[0], f.pos[1] - f.trail[1], f.pos[2] - f.trail[2]);
      for (let n = Math.min(TRAIL_MAX, Math.floor(gap / TRAIL_M)), j = 1; k < 1 && j <= n; j++) {
        const at = f.trail.map((v, c) => v + (f.pos[c] - v) * (j / n));
        puff(missileArchive(f.el), 1, at, { fps: 18, scale: 1, alpha: TRAIL_ALPHA });
        if (j === n) f.trail = at;
      }
      if (k >= 1) { falls.splice(i, 1); impact(f); }
    }
    for (let i = later.length - 1; i >= 0; i--) {
      const p = later[i];
      if ((p.t -= dt) > 0) continue;
      later.splice(i, 1);
      puff(p.archive, p.record, p.pos, { fps: p.fps, scale: p.scale });
    }
    for (let i = craters.length - 1; i >= 0; i--) if ((craters[i].age += dt) >= CRATER_S) freeMesh(craters.splice(i, 1)[0]);
    stones.step(dt);
  }

  const artFor = (r, src) => spellArt(r, src, read, PLAIN);
  function craterArt(r, c) {
    const src = { kind: `scorch${c.el}-${c.src.kind}`, archive: c.src.archive, record: c.src.record };
    return spellArt(r, src, async () => {
      const [pic, tint] = await Promise.all([read(c.src), elementTint(deps.getTexture, c.el)]);
      return pic?.colors ? scorch(pic, tint) : null;
    });
  }
  function build(r, o, art, model) {
    if (o.mesh && o.artKey === art.key && o.gpu === r) return true;
    freeMesh(o);
    try { o.mesh = r.createMesh(model()); o.gpu = r; o.artKey = art.key; return true; } catch (e) { console.warn('[spells] Failed to build meteor or crater mesh', e?.message ?? e); return false; }
  }
  function draw(r) {
    if ((!falls.length && !craters.length && !stones.count) || !r?.createMesh || !r.drawMesh) return false;
    let drew = false;
    for (const f of falls) {
      const a = artFor(r, f.src);
      if (!a || !build(r, f, a, () => rockModel(f.seed, a.art))) continue;
      rot(f.mat, f.axis, f.age * f.spin, 1, f.pos);
      r.drawMesh(f.mesh, f.mat);
      drew = true;
    }
    const sa = stoneSrc && artFor(r, stoneSrc);
    if (sa) stoneArt = sa;
    if (stoneArt && stones.draw(r, stoneArt.key, stoneArt.art)) drew = true;
    for (const c of craters) {
      const a = craterArt(r, c);
      if (!a || !build(r, c, a, () => craterModel(c.seed, a.art, c.floorAt))) continue;
      c.mat.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, c.at[0], c.at[1], c.at[2], 1]);
      r.drawMesh(c.mesh, c.mat, null, { translucent: Math.min(1, (CRATER_S - c.age) / CRATER_FADE_S) });
      drew = true;
    }
    return drew;
  }

  function shift(o) {
    for (const p of [...falls.flatMap((f) => [f.from, f.to, f.pos, f.trail]), ...craters.map((c) => c.at), ...later.map((l) => l.pos)]) { p[0] += o[0]; p[1] += o[1]; p[2] += o[2]; }
    stones.shift(o);
  }
  function clear() {
    for (const f of falls) { f.aura?.retire(); for (const h of f.tail) h?.retire(); freeMesh(f); }
    for (const c of craters) freeMesh(c);
    falls.length = 0; craters.length = 0; later.length = 0;
    stones.clear(); stoneArt = null;
  }

  return { launch, step, draw, shift, clear, get falling() { return falls.length; }, get craters() { return craters.length; } };
}
