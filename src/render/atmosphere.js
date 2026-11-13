// @ts-check
// ATMO1 (2026-11-13, Killbunny: "life and light" for the open land) - THE AIR'S SMALL LIFE: fireflies at dusk, butterflies
// by day, petals / fluff / leaves on the wind, dust in the light, shafts of sun, and far flocks of birds. Visual only:
// it reads no collision data, writes none, and sends nothing over the network. Every effect is a flat sprite or strip
// drawn by one program in two instanced draws (an additive one and an alpha one), simulated on the CPU around the eye.
//
// WHAT IT TAKES FROM THE HOST (scenes/atmosphereHost.js): the eye, the ground's height, the sun, the wind the flora lean
// by (WIND3's `windV` and `gust`), the calendar's season, the weather's wetness. It owns no clock: its `t` is the sum of
// the frames it was given, so a paused game holds it.
//
// THE PICTURES are painted here once into an 8-tile atlas (no files): a soft glow, a petal, a butterfly's wings, a leaf,
// a flake, a mote and a bird with its wings up and down. Colour comes from the instance, the shape from the tile.
//
// AN INSTANCE is 12 floats: x y z size | r g b a | rotation, tile, p1, p2 (p1 a butterfly's flap phase / a shaft's width).

import { buildProgram } from './glProgram.js';

export const TILE = Object.freeze({ glow: 0, petal: 1, butterfly: 2, leaf: 3, flake: 4, mote: 5, birdUp: 6, birdDown: 7, shaft: 99 });
const TILES = 8, TILE_PX = 32, F = 12, MAX_INSTANCES = 700;
const TAU = Math.PI * 2;

const VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aPlace;   // x y z size (a shaft: its length)
layout(location=2) in vec4 aColor;
layout(location=3) in vec4 aMisc;    // rotation, tile, p1, p2
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uSun;
uniform vec3 uEye;
uniform float uFar;
out vec2 vUV;
out vec4 vColor;
out float vShaft;
void main() {
  float tile = aMisc.y;
  vec3 world;
  vShaft = 0.0;
  float dist = distance(aPlace.xyz, uEye);
  float fade = 1.0 - smoothstep(uFar * 0.72, uFar, dist);
  if (tile > 50.0) {
    vec3 axis = normalize(uSun);
    vec3 side = normalize(cross(axis, uEye - aPlace.xyz) + vec3(0.0001));
    float widen = 1.35 - 0.55 * aCorner.y;
    world = aPlace.xyz + axis * (aCorner.y * aPlace.w) + side * ((aCorner.x - 0.5) * aMisc.z * widen);
    vUV = aCorner;
    vShaft = 1.0;
    fade *= smoothstep(2.0, 7.0, dist);
  } else {
    vec2 c = aCorner - 0.5;
    if (tile > 1.5 && tile < 2.5) c.x *= 0.18 + 0.82 * abs(cos(aMisc.z));   // a butterfly's flap closes its wings
    float s = sin(aMisc.x), k = cos(aMisc.x);
    vec2 r = vec2(c.x * k - c.y * s, c.x * s + c.y * k) * aPlace.w;
    world = aPlace.xyz + uRight * r.x + uUp * r.y;
    vUV = vec2((tile + aCorner.x) / ${TILES}.0, 1.0 - aCorner.y);
    fade *= smoothstep(0.6, 2.5, dist);
  }
  vColor = vec4(aColor.rgb, aColor.a * fade);
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
in float vShaft;
uniform sampler2D uTex;
uniform vec3 uLight;
uniform float uLit;   // 1 for the alpha group (lit by the flats' light), 0 for the additive one
out vec4 outColor;
void main() {
  if (vShaft > 0.5) {
    float across = abs(vUV.x - 0.5) * 2.0;
    float a = pow(clamp(1.0 - across, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.18, vUV.y) * (1.0 - smoothstep(0.55, 1.0, vUV.y));
    outColor = vec4(vColor.rgb, vColor.a * a);
    return;
  }
  vec4 t = texture(uTex, vUV);
  float a = t.a * vColor.a;
  if (a < 0.01) discard;
  vec3 lightMul = mix(vec3(1.0), uLight, uLit);
  outColor = vec4(t.rgb * vColor.rgb * lightMul, a);
}`;

/** The atlas, painted. Browser only (none in node). */
function paintAtlas() {
  const c = document.createElement('canvas');
  c.width = TILES * TILE_PX; c.height = TILE_PX;
  const g = c.getContext('2d');
  if (!g) return null;
  const tile = (i, fn) => { g.save(); g.translate(i * TILE_PX, 0); g.beginPath(); g.rect(0, 0, TILE_PX, TILE_PX); g.clip(); fn(); g.restore(); };
  const soft = (r, stops) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, r); for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.fillRect(0, 0, TILE_PX, TILE_PX); };
  tile(TILE.glow, () => soft(16, [[0, 1], [0.2, 0.6], [0.5, 0.14], [1, 0]]));
  tile(TILE.mote, () => soft(8, [[0, 1], [0.5, 0.5], [1, 0]]));
  tile(TILE.flake, () => soft(12, [[0, 1], [0.6, 0.85], [1, 0]]));
  tile(TILE.petal, () => {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 11, 6.5, -0.4, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(14, 17, 6, 2.5, -0.4, 0, TAU); g.fill();
  });
  tile(TILE.leaf, () => {
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(3, 16); g.quadraticCurveTo(15, 3, 29, 16); g.quadraticCurveTo(15, 29, 3, 16); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(3, 16); g.lineTo(27, 16); g.stroke();
  });
  tile(TILE.butterfly, () => {
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1.2;
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(16 + s * 7.5, 11, 7.5, 8.5, s * -0.45, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(16 + s * 5.5, 21.5, 5, 5.5, s * 0.45, 0, TAU); g.fill(); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(15, 6, 2, 20);
  });
  const bird = (i, up) => tile(i, () => {
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
    const y = up ? 6 : 24, mid = up ? 11 : 17;
    g.moveTo(2, y); g.quadraticCurveTo(10, mid, 16, 16); g.quadraticCurveTo(22, mid, 30, y); g.stroke();
  });
  bird(TILE.birdUp, true); bird(TILE.birdDown, false);
  return c;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const noise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i) + (hash(i + 1) - hash(i)) * u) * 2 - 1; };

const MAX_PET = 150, MAX_FLY = 90, MAX_BUT = 18, MAX_SHAFT = 14, MOTES_PER = 8;
const AREA = 26;   // metres: the radius about the eye the life is kept in
const BUT_COLS = [[1, 0.62, 0.16], [0.4, 0.65, 1], [1, 0.92, 0.45], [1, 1, 1], [0.95, 0.45, 0.7]];
const PET_COLS = {
  spring: [[1, 0.76, 0.82], [1, 0.84, 0.88], [0.97, 0.66, 0.76]],
  summer: [[0.96, 0.97, 0.85], [0.85, 0.92, 0.65]],
  autumn: [[0.84, 0.43, 0.14], [0.7, 0.25, 0.14], [0.87, 0.66, 0.2], [0.5, 0.43, 0.16]],
};

export class Atmosphere {
  /** @param {WebGL2RenderingContext|null} gl @param {{ random?: () => number }} [opts] */
  constructor(gl, { random = Math.random } = {}) {
    this.gl = gl; this.R = random; this.t = 0;
    this.live = { shafts: 0, motes: 0, fireflies: 0, butterflies: 0, petals: 0, birds: 0 };
    const R = random;
    this.pet = Array.from({ length: MAX_PET }, () => ({ x: 0, y: 0, z: 0, ph: R() * 20, spin: (R() - 0.5) * 5, rot: R() * TAU, size: 0.1, ci: 0, ready: false }));
    this.fly = Array.from({ length: MAX_FLY }, () => ({ x: 0, y: 0, z: 0, a: R() * TAU, sp: 0.3 + R() * 0.5, ph: R() * TAU, rate: 1.2 + R() * 2.2, size: 0.8 + R() * 0.5, ready: false }));
    this.but = Array.from({ length: MAX_BUT }, (_, i) => ({ x: 0, y: 0, z: 0, a: R() * TAU, sp: 0.8 + R() * 0.8, ph: R() * TAU, col: BUT_COLS[i % BUT_COLS.length], size: 0.26 + R() * 0.1, ready: false }));
    this.flocks = [];
    this.nextFlock = 3;
    this.inst = new Float32Array(MAX_INSTANCES * F);
    if (!gl) return;
    this.prog = buildProgram(gl, VS, FS, 'atmosphere');
    const u = (n) => gl.getUniformLocation(this.prog, n);
    this.loc = { proj: u('uProj'), view: u('uView'), right: u('uRight'), up: u('uUp'), sun: u('uSun'), eye: u('uEye'), far: u('uFar'), tex: u('uTex'), light: u('uLight'), lit: u('uLit') };
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    for (let a = 1; a <= 3; a++) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, F * 4, (a - 1) * 16); gl.vertexAttribDivisor(a, 1); }
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    const atlas = typeof document !== 'undefined' ? paintAtlas() : null;
    if (atlas) {
      this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  /** Somewhere in the ring about the eye (never closer than `min` metres). */
  _ring(eye, min, max) {
    const a = this.R() * TAU, d = Math.sqrt(min * min + this.R() * (max * max - min * min));
    return [eye[0] + Math.cos(a) * d, eye[2] + Math.sin(a) * d];
  }
  /** A thing that wandered out of the area comes back in on the far side. */
  _wrap(p, eye) {
    const dx = p.x - eye[0], dz = p.z - eye[2];
    if (dx * dx + dz * dz > AREA * AREA) { p.x = eye[0] - dx * 0.92; p.z = eye[2] - dz * 0.92; return true; }
    return false;
  }

  /**
   * The frame. `f` { eye [x,y,z], groundY(x,z), sun [x,y,z] (toward the sun), windV [x,z], gust, season ('spring'|'summer'|
   * 'autumn'|'winter'), rainy, density, fx { shafts, fireflies, butterflies, petals, birds } }.
   */
  step(f, dt) {
    const d = Math.min(0.1, Math.max(0, dt)); this.t += d;
    const t = this.t, R = this.R, eye = f.eye, gy = f.groundY;
    this.f = f;
    const elev = f.sun[1];
    const day = smooth(-0.06, 0.28, elev), night = 1 - smooth(-0.3, 0.04, elev), dusk = Math.exp(-(((elev - 0.04) / 0.2) ** 2));
    const dryK = f.rainy ? 0 : 1, dens = Math.min(2, Math.max(0.25, f.density ?? 1));
    this.env = { day, night, dusk, elev };
    const wx = Math.max(-10, Math.min(10, f.windV[0] * 0.9)), wz = Math.max(-10, Math.min(10, f.windV[1] * 0.9)), gust = f.gust ?? 0;

    // ---- petals, fluff, leaves ----
    const season = f.season;
    const cfg = season === 'spring' ? { n: 130, fall: 0.55, size: [0.13, 0.22], tile: TILE.petal, flut: 1 }
      : season === 'summer' ? { n: 34, fall: 0.2, size: [0.07, 0.12], tile: TILE.mote, flut: 1.4 }
      : season === 'autumn' ? { n: 80, fall: 0.95, size: [0.2, 0.32], tile: TILE.leaf, flut: 1.2 } : { n: 0, fall: 0, size: [0, 0], tile: TILE.flake, flut: 0 };
    this.petCfg = cfg;
    const pn = f.fx.petals ? Math.min(MAX_PET, Math.round(cfg.n * dens * (f.rainy ? 0.25 : 1))) : 0;
    this.live.petals = pn;
    for (let i = 0; i < pn; i++) {
      const p = this.pet[i];
      if (!p.ready) {
        const [x, z] = this._ring(eye, 0, AREA);
        p.x = x; p.z = z; p.y = gy(x, z) + R() * 9; p.ready = true;
        p.size = cfg.size[0] + (cfg.size[1] - cfg.size[0]) * R(); p.ci = (R() * 4) | 0;
      }
      const fl = noise(t * 0.8 + p.ph) * cfg.flut;
      p.x += (wx * 0.55 + fl * 0.7) * d; p.z += (wz * 0.55 + noise(t * 0.7 + p.ph * 3) * cfg.flut * 0.7) * d;
      p.y += (-cfg.fall + Math.sin(t * 1.9 + p.ph) * 0.25 * cfg.flut + gust * 0.5) * d;
      p.rot += p.spin * d * (0.4 + Math.hypot(wx, wz) * 0.15);
      this._wrap(p, eye);
      const g = gy(p.x, p.z);
      if (p.y < g + 0.04) { p.y = g + 4 + R() * 6; p.size = cfg.size[0] + (cfg.size[1] - cfg.size[0]) * R(); }
      if (p.y > eye[1] + 14) p.y = g + 6;
    }
    for (let i = pn; i < MAX_PET; i++) this.pet[i].ready = false;

    // ---- fireflies ----
    const warm = season === 'winter' ? 0 : season === 'autumn' ? 0.35 : season === 'spring' ? 0.7 : 1;
    this.flyVis = f.fx.fireflies ? Math.min(1, night * 1.25 + dusk * 0.55) * warm * dryK : 0;
    const fn = this.flyVis > 0.02 ? Math.min(MAX_FLY, Math.round(60 * dens * Math.min(1, this.flyVis * 1.5))) : 0;
    this.live.fireflies = fn;
    for (let i = 0; i < fn; i++) {
      const p = this.fly[i];
      if (!p.ready) { const [x, z] = this._ring(eye, 3, AREA); p.x = x; p.z = z; p.y = gy(x, z) + 0.4 + R() * 2; p.ready = true; }
      p.a += noise(t * 0.7 + p.ph * 9) * 3.2 * d;
      p.x += (Math.cos(p.a) * p.sp + wx * 0.12) * d; p.z += (Math.sin(p.a) * p.sp + wz * 0.12) * d;
      const g = gy(p.x, p.z);
      p.y += (Math.sin(t * 1.1 + p.ph) * 0.18 + ((g + 0.5 + (Math.sin(p.ph * 3) + 1) * 0.9) - p.y) * 0.3) * d;
      p.ph += p.rate * d;
      this._wrap(p, eye);
    }
    for (let i = fn; i < MAX_FLY; i++) this.fly[i].ready = false;

    // ---- butterflies ----
    const bk = (season === 'spring' || season === 'summer' ? 1 : season === 'autumn' ? 0.3 : 0) * day * dryK * (1 - Math.min(1, Math.max(0, Math.hypot(wx, wz) - 5) / 4));
    const bn = f.fx.butterflies && bk > 0.05 ? Math.min(MAX_BUT, Math.round(MAX_BUT * 0.6 * dens * bk)) : 0;
    this.live.butterflies = bn;
    for (let i = 0; i < bn; i++) {
      const p = this.but[i];
      if (!p.ready) { const [x, z] = this._ring(eye, 4, AREA); p.x = x; p.z = z; p.y = gy(x, z) + 1; p.ready = true; }
      p.a += noise(t * 1.1 + i * 13) * 5 * d; p.ph += d * 24;
      const sp = p.sp * (0.7 + 0.5 * (noise(t * 0.8 + i * 7) + 1));
      p.x += (Math.cos(p.a) * sp + wx * 0.25) * d; p.z += (Math.sin(p.a) * sp + wz * 0.25) * d;
      const dx = p.x - eye[0], dz = p.z - eye[2], dd = Math.hypot(dx, dz);
      if (dd < 3.5 && dd > 0.01) { p.x += dx / dd * 2.6 * d; p.z += dz / dd * 2.6 * d; p.a = Math.atan2(dz, dx); }   // it keeps clear of the player
      const target = gy(p.x, p.z) + 0.8 + Math.sin(t * 0.9 + i) * 0.4;
      p.y += (target - p.y) * Math.min(1, d * 1.5) + Math.sin(p.ph * 0.15) * 0.3 * d;
      this._wrap(p, eye);
    }
    for (let i = bn; i < MAX_BUT; i++) this.but[i].ready = false;

    // ---- shafts of sun (fixed to the land by a cell hash, so they stay where they are as you walk) ----
    this.shafts = [];
    const shaftK = f.fx.shafts && !f.rainy ? smooth(0.1, 0.4, elev) * (1 - smooth(0.85, 0.99, elev)) : 0;
    if (shaftK > 0.02) {
      const CELL = 20, cx = Math.floor(eye[0] / CELL), cz = Math.floor(eye[2] / CELL);
      for (let ix = cx - 2; ix <= cx + 2 && this.shafts.length < MAX_SHAFT; ix++) for (let iz = cz - 2; iz <= cz + 2 && this.shafts.length < MAX_SHAFT; iz++) {
        const h = hash(ix * 91.7 + iz * 317.3);
        if (h > 0.34 * Math.min(1.6, dens)) continue;
        const x = (ix + 0.2 + hash(h * 53.1) * 0.6) * CELL, z = (iz + 0.2 + hash(h * 97.7) * 0.6) * CELL;
        const flick = 0.65 + 0.35 * noise(t * 0.3 + h * 40);
        this.shafts.push({ x, y: gy(x, z) - 0.2, z, len: 16 + hash(h * 7.3) * 9, w: 3.4 + hash(h * 11.9) * 4.2, a: flick * shaftK, ph: h * 40 });
      }
    }
    this.live.shafts = this.shafts.length;
    this.live.motes = f.fx.shafts ? this.shafts.length * MOTES_PER : 0;

    // ---- birds ----
    const birdsOk = f.fx.birds && (day > 0.3 || dusk > 0.3) && dryK;
    this.nextFlock -= d;
    if (birdsOk && this.nextFlock <= 0 && this.flocks.length < 2) { this._spawnFlock(eye); this.nextFlock = (14 + R() * 12) / dens; }
    if (!f.fx.birds) this.flocks.length = 0;
    for (const fl of this.flocks) {
      fl.age += d;
      for (const b of fl.birds) {
        b.x += (fl.vx + noise(t * 0.5 + b.ph) * 1.5) * d; b.z += (fl.vz + noise(t * 0.45 + b.ph * 2) * 1.5) * d;
        b.y += noise(t * 0.4 + b.ph * 3) * 1.2 * d; b.ph += d * 7.5;
        b.x += (fl.cx - b.x) * 0.05 * d; b.z += (fl.cz - b.z) * 0.05 * d;   // the flock holds together
      }
      fl.cx += fl.vx * d; fl.cz += fl.vz * d;
    }
    this.flocks = this.flocks.filter((fl) => Math.hypot(fl.cx - eye[0], fl.cz - eye[2]) < 260 && fl.age < 90);
    this.live.birds = this.flocks.reduce((s, fl) => s + fl.birds.length, 0);
  }

  _spawnFlock(eye) {
    const R = this.R, a = R() * TAU, dist = 130, h = 30 + R() * 30;
    const cx = eye[0] + Math.cos(a) * dist, cz = eye[2] + Math.sin(a) * dist;
    const dir = a + Math.PI + (R() - 0.5) * 1.2, sp = 9 + R() * 5;
    const n = 7 + ((R() * 7) | 0);
    const fl = { cx, cz, vx: Math.cos(dir) * sp, vz: Math.sin(dir) * sp, age: 0, birds: [] };
    for (let i = 0; i < n; i++) fl.birds.push({ x: cx + (R() - 0.5) * 14, z: cz + (R() - 0.5) * 14, y: eye[1] + h + (R() - 0.5) * 8, ph: R() * TAU });
    this.flocks.push(fl);
  }

  /** The floating origin moved the scene by `o`: everything stays where it was on the land. */
  offsetOrigin(o) {
    for (const list of [this.pet, this.fly, this.but]) for (const p of list) { p.x += o[0]; p.y += o[1]; p.z += o[2]; }
    for (const fl of this.flocks) { fl.cx += o[0]; fl.cz += o[2]; for (const b of fl.birds) { b.x += o[0]; b.y += o[1]; b.z += o[2]; } }
  }

  _put(n, x, y, z, size, r, g, b, a, rot, tile, p1, p2) {
    if (n >= MAX_INSTANCES) return n;
    const o = n * F, i = this.inst;
    i[o] = x; i[o + 1] = y; i[o + 2] = z; i[o + 3] = size; i[o + 4] = r; i[o + 5] = g; i[o + 6] = b; i[o + 7] = a; i[o + 8] = rot; i[o + 9] = tile; i[o + 10] = p1; i[o + 11] = p2;
    return n + 1;
  }

  /** Draw. Answers whether anything was drawn (the host marks the foreign pass). */
  draw(proj, view, right, up, light) {
    const gl = this.gl, f = this.f;
    if (!gl || !f || !this.tex) return false;
    const { day, dusk } = this.env, t = this.t, P = this._put.bind(this);
    let n = 0;
    // the additive group: shafts, motes, fireflies
    const warmK = Math.min(1, dusk * 1.2 + (1 - Math.min(1, f.sun[1] * 2)) * 0.5);
    const sc = [1, 0.94 - 0.2 * warmK, 0.78 - 0.34 * warmK];
    for (const s of this.shafts) n = P(n, s.x, s.y, s.z, s.len, sc[0], sc[1], sc[2], 0.8 * s.a, 0, TILE.shaft, s.w, 0);
    if (f.fx.shafts) {
      for (const s of this.shafts) for (let k = 0; k < MOTES_PER; k++) {
        const h = hash(s.ph + k * 7.7), u = (h * 3 + t * 0.012 * (1 + k * 0.3)) % 1, lat = (hash(h * 51.3) - 0.5) * s.w * (1.1 - 0.5 * u);
        const ax = f.sun[0], ay = f.sun[1], az = f.sun[2], al = Math.hypot(ax, az) || 1;
        const px = s.x + ax * u * s.len + (-az / al) * lat + Math.sin(t * 0.6 + h * 30) * 0.2, py = s.y + ay * u * s.len + Math.cos(t * 0.5 + h * 20) * 0.15, pz = s.z + az * u * s.len + (ax / al) * lat;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + h * 40));
        n = P(n, px, py, pz, 0.09, sc[0], sc[1], sc[2], 1.0 * s.a * tw * smooth(0, 0.2, u) * (1 - smooth(0.8, 1, u)), 0, TILE.mote, 0, 0);
      }
    }
    for (let i = 0; i < this.live.fireflies; i++) {
      const p = this.fly[i], b = Math.pow(Math.max(0, Math.sin(p.ph)), 3) * this.flyVis;
      if (b < 0.03) continue;
      n = P(n, p.x, p.y, p.z, 1.15 * p.size, 0.72, 1, 0.3, 0.9 * b, 0, TILE.glow, 0, 0);
      n = P(n, p.x, p.y, p.z, 0.14 * p.size, 0.96, 1, 0.8, b, 0, TILE.mote, 0, 0);
    }
    const nAdd = n;
    // the alpha group: petals / fluff / leaves, butterflies, birds
    const cfg = this.petCfg, pal = PET_COLS[f.season];
    if (pal) for (let i = 0; i < this.live.petals; i++) {
      const p = this.pet[i], c = pal[p.ci % pal.length];
      n = P(n, p.x, p.y, p.z, p.size, c[0], c[1], c[2], f.season === 'summer' ? 0.6 : 0.95, p.rot, cfg.tile, 0, 0);
    }
    for (let i = 0; i < this.live.butterflies; i++) {
      const p = this.but[i];
      n = P(n, p.x, p.y, p.z, p.size, p.col[0], p.col[1], p.col[2], 1, 0, TILE.butterfly, p.ph, 0);
    }
    const bc = day > 0.2 ? [0.1, 0.1, 0.13] : [0.25, 0.14, 0.12];
    for (const fl of this.flocks) for (const b of fl.birds) n = P(n, b.x, b.y, b.z, 3.2, bc[0], bc[1], bc[2], 0.9, 0, Math.sin(b.ph) > 0 ? TILE.birdUp : TILE.birdDown, 0, 0);
    if (n === 0) return false;

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.proj, false, proj); gl.uniformMatrix4fv(this.loc.view, false, view);
    gl.uniform3f(this.loc.right, right[0], right[1], right[2]); gl.uniform3f(this.loc.up, up[0], up[1], up[2]);
    gl.uniform3f(this.loc.sun, f.sun[0], f.sun[1], f.sun[2]); gl.uniform3f(this.loc.eye, f.eye[0], f.eye[1], f.eye[2]);
    gl.uniform3f(this.loc.light, light[0], light[1], light[2]);
    gl.uniform1i(this.loc.tex, 0);
    gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, n * F);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND);
    const setPointers = (first) => { for (let a = 1; a <= 3; a++) gl.vertexAttribPointer(a, 4, gl.FLOAT, false, F * 4, first * F * 4 + (a - 1) * 16); };
    if (nAdd > 0) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.uniform1f(this.loc.lit, 0); gl.uniform1f(this.loc.far, 90);
      setPointers(0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nAdd);
    }
    if (n > nAdd) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(this.loc.lit, 1); gl.uniform1f(this.loc.far, 300);
      setPointers(nAdd); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n - nAdd);
    }
    setPointers(0);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    return true;
  }

  /** EVERY ALLOCATION HAS AN OWNER: the program, the buffers, the vertex array, the atlas. */
  dispose() {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    if (this.tex) gl.deleteTexture(this.tex);
    gl.deleteBuffer(this.quad); gl.deleteBuffer(this.buf); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.prog);
    this.tex = null;
  }
}
