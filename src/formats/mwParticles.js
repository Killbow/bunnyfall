// Builds and runs NIF particle systems the way OpenMW and osgParticle do. NiBSPArrayController emission at a
// target's vertices is refused with a note, and NiParticleBomb is skipped.

import { deref } from './mwNifFile.js';
import { resolveMaterial, composeTransform, mat33Apply, flattenNif, VERTEX_COLOR_MODE } from './mwNifMesh.js';
import { affineOfTransform, AFFINE_IDENTITY, affineMul, affineApply, affineRotate } from './mwAffine.js';
import { sampleKeyGroup } from './mwKeys.js';

export const PARTICLE_FLAG_AUTOPLAY = 0x0020;
export const PARTICLE_FLAG_LOCAL_SPACE = 0x0080;
export const CONTROLLER_FLAG_ACTIVE = 0x0008;
export const EXTRAPOLATION = Object.freeze({ Cycle: 0, Reverse: 2, Constant: 4 });
export const EMIT_FLAG_NO_AUTO_ADJUST = 0x1;
export const BSP_AT_NODE = 0x8;
export const BSP_AT_VERTEX = 0x10;
export const FORCE_TYPE = Object.freeze({ Wind: 0, Point: 1 });
export const GRAVITY_MAGIC = 1.6;

const IDENTITY_T = Object.freeze({ rotation: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), translation: [0, 0, 0], scale: 1 });

export { affineOfTransform, AFFINE_IDENTITY, affineMul, affineApply, affineRotate };
export function affineInverse(m) {
  const a = m.a;
  const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const d = det !== 0 ? 1 / det : 0;
  const inv = new Float32Array([
    (a[4] * a[8] - a[5] * a[7]) * d, (a[2] * a[7] - a[1] * a[8]) * d, (a[1] * a[5] - a[2] * a[4]) * d,
    (a[5] * a[6] - a[3] * a[8]) * d, (a[0] * a[8] - a[2] * a[6]) * d, (a[2] * a[3] - a[0] * a[5]) * d,
    (a[3] * a[7] - a[4] * a[6]) * d, (a[1] * a[6] - a[0] * a[7]) * d, (a[0] * a[4] - a[1] * a[3]) * d,
  ]);
  const [tx, ty, tz] = mat33Apply(inv, m.t[0], m.t[1], m.t[2]);
  return { a: inv, t: [-tx, -ty, -tz] };
}
export function affineScale(m) {
  return Math.hypot(m.a[0], m.a[3], m.a[6]);
}
export function affineOrthoNormalize(m) {
  const s = affineScale(m) || 1;
  const a = new Float32Array(9);
  for (let i = 0; i < 9; i++) a[i] = m.a[i] / s;
  return { a, t: [m.t[0], m.t[1], m.t[2]] };
}

const PARENTS = new WeakMap();
function parentMap(nif) {
  let m = PARENTS.get(nif);
  if (m) return m;
  m = new Map();
  nif.records.forEach((rec, i) => {
    if (rec && Array.isArray(rec.children)) for (const c of rec.children) if (c >= 0) m.set(c, i);
  });
  PARENTS.set(nif, m);
  return m;
}
export function nodeWorldTransform(nif, ref) {
  const parents = parentMap(nif);
  const chain = [];
  const seen = new Set();
  for (let r = ref; r !== undefined && r >= 0 && !seen.has(r); r = parents.get(r)) {
    seen.add(r);
    const rec = deref(nif, r);
    if (!rec || !rec.rotation) break;
    chain.push(rec);
  }
  let world = IDENTITY_T;
  for (let i = chain.length - 1; i >= 0; i--) world = composeTransform(world, chain[i]);
  return world;
}

function particleController(nif, rec) {
  let found = null;
  const seen = new Set();
  for (let ref = rec.controller; ref >= 0 && !seen.has(ref);) {
    seen.add(ref);
    const c = deref(nif, ref);
    if (!c) break;
    if ((c.type === 'NiParticleSystemController' || c.type === 'NiBSPArrayController') && (c.flags & CONTROLLER_FLAG_ACTIVE)) found = c;
    ref = c.next;
  }
  return found;
}

function modifierChain(nif, first) {
  const out = [];
  const seen = new Set();
  for (let ref = first; ref >= 0 && !seen.has(ref);) {
    seen.add(ref);
    const m = deref(nif, ref);
    if (!m) break;
    out.push(m);
    ref = m.next;
  }
  return out;
}

export function particleSystemOf(nif, bundle) {
  const { ref, rec, world, props, animFlags } = bundle;
  const ctrl = particleController(nif, rec);
  if (!ctrl) return null;
  const data = rec.data >= 0 ? deref(nif, rec.data) : null;
  // Particles always count as having vertex colors, as in OpenMW, because each particle's color fills that role.
  const material = resolveMaterial(nif, props, true);
  const modifiers = [];
  for (const m of modifierChain(nif, ctrl.particleModifier)) {
    switch (m.type) {
      case 'NiParticleGrowFade': modifiers.push({ type: 'growFade', grow: m.grow, fade: m.fade }); break;
      case 'NiGravity':
        modifiers.push({ type: 'gravity', decay: m.decay, force: m.force, fieldType: m.fieldType, position: [...m.position], direction: [...m.direction] });
        break;
      case 'NiParticleColorModifier': {
        const cd = m.colorData >= 0 ? deref(nif, m.colorData) : null;
        if (cd && cd.data && cd.data.keys && cd.data.keys.length) modifiers.push({ type: 'color', keys: cd.data.keys.map((k) => ({ time: k.time, value: [...k.value], inTan: k.inTan ? [...k.inTan] : null, outTan: k.outTan ? [...k.outTan] : null, tbc: k.tbc ? [...k.tbc] : null })), interpolation: cd.data.type });
        break;
      }
      case 'NiParticleRotation': break;
      case 'NiParticleBomb': modifiers.push({ type: 'bomb', unsupported: true }); break;
      default: break;
    }
  }
  const colliders = [];
  for (const c of modifierChain(nif, ctrl.particleCollider)) {
    if (c.type === 'NiPlanarCollider') {
      colliders.push({ type: 'planar', bounce: c.bounce, height: c.height, width: c.width, position: [...c.position], xVector: [...c.xVector], yVector: [...c.yVector], normal: [...c.plane.normal], constant: c.plane.constant });
    } else if (c.type === 'NiSphericalCollider') {
      colliders.push({ type: 'spherical', bounce: c.bounce, radius: c.radius, position: [...c.position] });
    }
  }
  const emitterRef = ctrl.emitter;
  const emitterWorld = emitterRef >= 0 ? nodeWorldTransform(nif, emitterRef) : null;
  const numParticles = data && data.numParticles ? data.numParticles : (ctrl.particles ? ctrl.particles.length : 0);
  return {
    kind: 'particles',
    name: rec.name || '',
    ref,
    world: { rotation: Float32Array.from(world.rotation), translation: [...world.translation], scale: world.scale },
    localSpace: (animFlags & PARTICLE_FLAG_LOCAL_SPACE) !== 0,
    autoPlay: (animFlags & PARTICLE_FLAG_AUTOPLAY) !== 0,
    controller: {
      type: ctrl.type,
      flags: ctrl.flags, frequency: ctrl.frequency, phase: ctrl.phase, startTime: ctrl.startTime, stopTime: ctrl.stopTime,
      extrapolation: ctrl.flags & 0x6,
      speed: ctrl.speed, speedVariation: ctrl.speedVariation,
      declination: ctrl.declination, declinationVariation: ctrl.declinationVariation,
      planarAngle: ctrl.planarAngle, planarAngleVariation: ctrl.planarAngleVariation,
      initialColor: [...ctrl.initialColor], initialSize: ctrl.initialSize,
      emitStart: ctrl.emitStartTime, emitStop: ctrl.emitStopTime,
      birthRate: ctrl.birthRate, lifetime: ctrl.lifetime, lifetimeVariation: ctrl.lifetimeVariation,
      emitFlags: ctrl.useBirthRate | 0,
      emitterDimensions: [...ctrl.emitterDimensions],
      bspFlags: ctrl.type === 'NiBSPArrayController' ? (ctrl.flags & (BSP_AT_NODE | BSP_AT_VERTEX)) : 0,
      particles: (ctrl.particles ?? []).map((p) => ({ velocity: [...p.velocity], age: p.age, lifeSpan: p.lifeSpan, code: p.code })),
    },
    emitter: emitterWorld ? { ref: emitterRef, world: { rotation: Float32Array.from(emitterWorld.rotation), translation: [...emitterWorld.translation], scale: emitterWorld.scale } } : null,
    data: data ? {
      numParticles,
      numActive: data.numActive | 0,
      vertices: data.vertices ? Float32Array.from(data.vertices) : null,
      sizes: data.sizes ? Float32Array.from(data.sizes) : null,
      radius: data.particleRadius ?? 0,
    } : { numParticles, numActive: 0, vertices: null, sizes: null, radius: 0 },
    modifiers,
    colliders,
    material,
  };
}

export function particleSystemsOf(nif, opts = {}) {
  const effects = [];
  flattenNif(nif, { ...opts, effects });
  const out = [];
  for (const bundle of effects) {
    const d = particleSystemOf(nif, bundle);
    if (d) out.push(d);
  }
  return out;
}

export function controllerTime(c, value) {
  const time = c.frequency * value + c.phase;
  if (time >= c.startTime && time <= c.stopTime) return time;
  const delta = c.stopTime - c.startTime;
  switch (c.extrapolation) {
    case EXTRAPOLATION.Cycle: {
      if (delta <= 0) return c.startTime;
      const cycles = (time - c.startTime) / delta;
      return c.startTime + (cycles - Math.floor(cycles)) * delta;
    }
    case EXTRAPOLATION.Reverse: {
      if (delta <= 0) return c.startTime;
      const cycles = (time - c.startTime) / delta;
      const remainder = (cycles - Math.floor(cycles)) * delta;
      return (Math.abs(Math.floor(cycles)) % 2) === 0 ? c.startTime + remainder : c.stopTime - remainder;
    }
    default:
      return Math.min(c.stopTime, Math.max(c.startTime, time));
  }
}

export function interpColorKey(keys, time, interpolation = 1) {
  if (!keys || !keys.length) return [1, 1, 1, 1];
  return sampleKeyGroup({ keys, type: interpolation }, 4, time);
}

// Matches osgParticle's shooter: the +Z direction turns about Y by the vertical angle first, then about Z by the
// horizontal angle.
export function shootDirection(hdir, vdir) {
  const x1 = Math.sin(vdir), y1 = 0, z1 = Math.cos(vdir);
  const ch = Math.cos(hdir), sh = Math.sin(hdir);
  return [x1 * ch - y1 * sh, x1 * sh + y1 * ch, z1];
}

export function createParticleSystem(desc, { rolls = Math.random } = {}) {
  const c = desc.controller;
  const quota = Math.max(0, desc.data.numParticles | 0);
  const particles = [];
  let carry = 0;
  let frozen = !desc.autoPlay;
  let enabled = true;
  const unsupported = desc.controller.bspFlags & BSP_AT_VERTEX ? 'NiBSPArrayController emits at a target’s vertices, which this port does not draw' : null;

  const noAutoAdjust = (c.emitFlags & EMIT_FLAG_NO_AUTO_ADJUST) !== 0;
  const rate = noAutoAdjust ? c.birthRate
    : (c.lifetime === 0 && c.lifetimeVariation === 0) ? 0
      : c.particles.length / (c.lifetime + c.lifetimeVariation / 2);
  const minSpeed = c.speed - c.speedVariation * 0.5;
  const maxSpeed = c.speed + c.speedVariation * 0.5;
  const hdim = [c.emitterDimensions[0] / 2, c.emitterDimensions[1] / 2, c.emitterDimensions[2] / 2];

  const psWorld = affineOfTransform(desc.world);
  const emitterToPs = desc.emitter
    ? affineOrthoNormalize(affineMul(affineInverse(psWorld), affineOfTransform(desc.emitter.world)))
    : AFFINE_IDENTITY;

  const d = desc.data;
  if (d.vertices) {
    let i = 0;
    for (const p of c.particles) {
      if (i++ >= d.numActive) break;
      if (p.lifeSpan <= 0) continue;
      if (p.code * 3 + 2 >= d.vertices.length) continue;
      if (particles.length >= quota) break;
      let size = c.initialSize;
      if (d.sizes && p.code < d.sizes.length) size *= d.sizes[p.code];
      particles.push({
        pos: [d.vertices[p.code * 3], d.vertices[p.code * 3 + 1], d.vertices[p.code * 3 + 2]],
        vel: [p.velocity[0], p.velocity[1], p.velocity[2]],
        age: Math.max(0, p.age), life: p.lifeSpan, size,
        color: [c.initialColor[0], c.initialColor[1], c.initialColor[2]], colorA: c.initialColor[3], alpha: 1,
      });
    }
  }

  const growFade = desc.modifiers.find((m) => m.type === 'growFade') ?? null;
  const colour = desc.modifiers.find((m) => m.type === 'color') ?? null;
  const gravities = desc.modifiers.filter((m) => m.type === 'gravity');

  function count(dt) {
    const v = dt * rate;
    let n = Math.trunc(v);
    carry += v - n;
    if (carry > 1) { n++; carry -= 1; }
    return Math.max(0, n);
  }

  function shoot(p) {
    const hdir = c.planarAngle + c.planarAngleVariation * (2 * rolls() - 1);
    const vdir = c.declination + c.declinationVariation * (2 * rolls() - 1);
    const dir = shootDirection(hdir, vdir);
    const vel = minSpeed + (maxSpeed - minSpeed) * rolls();
    p.vel = [dir[0] * vel, dir[1] * vel, dir[2] * vel];
    p.life = Math.max(Number.EPSILON, c.lifetime + c.lifetimeVariation * rolls());
  }

  function emit(dt, frame, eToPs = emitterToPs) {
    if (!enabled || frozen) return 0;
    const n = count(dt);
    let made = 0;
    for (let i = 0; i < n && particles.length < quota; i++) {
      const p = {
        pos: [(2 * rolls() - 1) * hdim[0], (2 * rolls() - 1) * hdim[1], (2 * rolls() - 1) * hdim[2]],
        vel: [0, 0, 0], age: 0, life: 0, size: c.initialSize,
        color: [c.initialColor[0], c.initialColor[1], c.initialColor[2]], colorA: c.initialColor[3], alpha: 1,
      };
      shoot(p);
      p.pos = affineApply(eToPs, p.pos[0], p.pos[1], p.pos[2]);
      p.vel = affineRotate(eToPs, p.vel[0], p.vel[1], p.vel[2]);
      if (frame) { p.pos = affineApply(frame, p.pos[0], p.pos[1], p.pos[2]); p.vel = affineRotate(frame, p.vel[0], p.vel[1], p.vel[2]); }
      particles.push(p);
      made++;
    }
    return made;
  }

  function operate(dt, frame) {
    const inv = frame ? affineInverse(frame) : null;
    for (const p of particles) {
      if (growFade) {
        // Scales from the controller initial size rather than the current particle size, as OpenMW does in
        // GrowFadeAffector.
        let size = c.initialSize;
        if (p.age < growFade.grow && growFade.grow !== 0) size *= p.age / growFade.grow;
        if (p.life - p.age < growFade.fade && growFade.fade !== 0) size *= (p.life - p.age) / growFade.fade;
        p.size = size;
      }
      if (colour) {
        const k = interpColorKey(colour.keys, p.age / p.life, colour.interpolation);
        p.color = [k[0], k[1], k[2]]; p.colorA = 1; p.alpha = k[3];
      }
      for (const g of gravities) {
        const pos = g.position, dir = normalize(g.direction);
        const q = inv ? affineApply(inv, p.pos[0], p.pos[1], p.pos[2]) : p.pos;
        if (g.fieldType === FORCE_TYPE.Wind) {
          let decay = 1;
          if (g.decay !== 0) {
            const dist = Math.abs(dir[0] * (q[0] - pos[0]) + dir[1] * (q[1] - pos[1]) + dir[2] * (q[2] - pos[2]));
            decay = Math.exp(-g.decay * dist);
          }
          const k = g.force * dt * decay * GRAVITY_MAGIC;
          const w = frame ? affineRotate(frame, dir[0], dir[1], dir[2]) : dir;
          p.vel[0] += w[0] * k; p.vel[1] += w[1] * k; p.vel[2] += w[2] * k;
        } else {
          const diff = [pos[0] - q[0], pos[1] - q[1], pos[2] - q[2]];
          const len = Math.hypot(diff[0], diff[1], diff[2]);
          const decay = g.decay !== 0 ? Math.exp(-g.decay * len) : 1;
          const n = len > 0 ? [diff[0] / len, diff[1] / len, diff[2] / len] : [0, 0, 0];
          const k = g.force * dt * decay * GRAVITY_MAGIC;
          const w = frame ? affineRotate(frame, n[0], n[1], n[2]) : n;
          p.vel[0] += w[0] * k; p.vel[1] += w[1] * k; p.vel[2] += w[2] * k;
        }
      }
      for (const col of desc.colliders) {
        const q = inv ? affineApply(inv, p.pos[0], p.pos[1], p.pos[2]) : p.pos;
        const v = inv ? affineRotate(inv, p.vel[0], p.vel[1], p.vel[2]) : p.vel;
        const r = col.type === 'planar' ? planarCollide(col, q, v, dt) : sphericalCollide(col, q, v, dt);
        if (r) p.vel = frame ? affineRotate(frame, r[0], r[1], r[2]) : r;
      }
    }
  }

  // The age is checked before it advances, as in osgParticle, so removal lags one step behind the lifetime.
  function age(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const x = p.life > 0 ? p.age / p.life : 0;
      p.age += dt;
      if (x > 1) { particles.splice(i, 1); continue; }
      p.pos[0] += p.vel[0] * dt; p.pos[1] += p.vel[1] * dt; p.pos[2] += p.vel[2] * dt;
    }
  }

  return {
    desc,
    unsupported,
    get particles() { return particles; },
    get quota() { return quota; },
    get rate() { return rate; },
    get emitterToPs() { return emitterToPs; },
    get frozen() { return frozen; },
    get enabled() { return enabled; },
    update(dt, clock = null, frame = null, emitterFrame = null) {
      if (clock === null || clock === undefined) { frozen = true; return; }
      const t = controllerTime(c, clock);
      frozen = false;
      enabled = t >= c.emitStart && t < c.emitStop;
      if (unsupported) return;
      emit(dt, frame, emitterFrame ? affineOrthoNormalize(emitterFrame) : emitterToPs);
      operate(dt, frame);
      age(dt);
    },
    quads() {
      return particles.map((p) => ({ pos: [p.pos[0], p.pos[1], p.pos[2]], size: p.size, color: p.color, alpha: p.colorA * p.alpha }));
    },
  };
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// OpenMW builds the collider plane from the negated normal, so the negation here is intentional.
export function planarCollide(col, pos, vel, dt) {
  const n = [-col.normal[0], -col.normal[1], -col.normal[2]];
  const dist = n[0] * pos[0] + n[1] * pos[1] + n[2] * pos[2] + col.constant;
  const velDot = vel[0] * n[0] + vel[1] * n[1] + vel[2] * n[2];
  if (dist * velDot >= 0) return null;
  const next = dist + velDot * dt;
  if (dist * next > 0) return null;
  const rel = [pos[0] - col.position[0], pos[1] - col.position[1], pos[2] - col.position[2]];
  const xd = rel[0] * col.xVector[0] + rel[1] * col.xVector[1] + rel[2] * col.xVector[2];
  const yd = rel[0] * col.yVector[0] + rel[1] * col.yVector[1] + rel[2] * col.yVector[2];
  if (-col.width * 0.5 > xd || col.width * 0.5 < xd) return null;
  if (-col.height * 0.5 > yd || col.height * 0.5 < yd) return null;
  const k = 2 * velDot;
  return [(vel[0] - n[0] * k) * col.bounce, (vel[1] - n[1] * k) * col.bounce, (vel[2] - n[2] * k) * col.bounce];
}

export function sphericalCollide(col, pos, vel, dt) {
  const cent = [pos[0] - col.position[0], pos[1] - col.position[1], pos[2] - col.position[2]];
  const r2 = col.radius * col.radius;
  const c2 = cent[0] * cent[0] + cent[1] * cent[1] + cent[2] * cent[2];
  const inside = c2 <= r2;
  const cv = cent[0] * vel[0] + cent[1] * vel[1] + cent[2] * vel[2];
  if (!inside && cv >= 0) return null;
  const v2 = vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2];
  if (v2 === 0) return null;
  const b = -cv / v2;
  const u = [cent[0] + vel[0] * b, cent[1] + vel[1] * b, cent[2] + vel[2] * b];
  const u2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
  if (!inside && u2 >= r2) return null;
  const d = (r2 - u2) / v2;
  const k = inside ? Math.sqrt(d) + b : b - Math.sqrt(d);
  if (k >= dt) return null;
  const contact = [pos[0] + vel[0] * k, pos[1] + vel[1] * k, pos[2] + vel[2] * k];
  const n = normalize([contact[0] - col.position[0], contact[1] - col.position[1], contact[2] - col.position[2]]);
  const dot = vel[0] * n[0] + vel[1] * n[1] + vel[2] * n[2];
  return [(vel[0] - n[0] * 2 * dot) * col.bounce, (vel[1] - n[1] * 2 * dot) * col.bounce, (vel[2] - n[2] * 2 * dot) * col.bounce];
}

// Each vertex holds center xyz, corner xy, uv, rgba, and size. The renderer's particle VAO reads this layout, and
// its shader turns the corner into a billboard.
export const PARTICLE_FLOATS = 12;
// DDS textures upload top row first, so the top corners take v 0 and the bottom corners v 1, unlike osgParticle's
// bottom-left origin.
export const PARTICLE_CORNERS = Object.freeze([
  [-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0],
  [-1, -1, 0, 1], [1, 1, 1, 0], [-1, 1, 0, 0],
]);

export function packParticleQuads(quads, out = null, { place = null, sizeScale = 1 } = {}) {
  const need = quads.length * 6 * PARTICLE_FLOATS;
  const buf = out && out.length >= need ? out : new Float32Array(Math.max(need, 6 * PARTICLE_FLOATS));
  let o = 0;
  for (const q of quads) {
    const p = place ? place(q.pos[0], q.pos[1], q.pos[2]) : q.pos;
    const size = q.size * sizeScale;
    for (const [cx, cy, u, v] of PARTICLE_CORNERS) {
      buf[o++] = p[0]; buf[o++] = p[1]; buf[o++] = p[2];
      buf[o++] = cx; buf[o++] = cy;
      buf[o++] = u; buf[o++] = v;
      buf[o++] = q.color[0]; buf[o++] = q.color[1]; buf[o++] = q.color[2]; buf[o++] = q.alpha;
      buf[o++] = size;
    }
  }
  return { packed: buf, count: quads.length * 6 };
}

export function particleDrawState(material) {
  const m = material ?? {};
  return {
    blend: !!m.alphaBlend,
    srcBlend: m.srcBlend ?? 6, dstBlend: m.dstBlend ?? 7,
    alphaCut: m.alphaTest ? (m.alphaThreshold || 0) / 255 : 0,
    depthTest: m.depthTest !== false, depthWrite: m.depthWrite !== false,
    textureFile: m.textureFile ?? null, clampMode: m.clampMode ?? 3,
    emissive: m.vertexColorMode === VERTEX_COLOR_MODE.Emission || (m.emissive && (m.emissive[0] > 0 || m.emissive[1] > 0 || m.emissive[2] > 0)),
  };
}
