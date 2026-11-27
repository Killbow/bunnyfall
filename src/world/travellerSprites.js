// @ts-check
import { MobileUnit } from '../characters/mobileUnit.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { ResidentWalker } from '../characters/residentWalker.js';
import { mobileBillboardSize } from './rmbFlats.js';
import { bandSpriteReach, stepBandAlpha, BAND_SPRITE_FAR_M } from './bandSprites.js';
import { lwSeed, textSeed } from '../systems/livingWorld/seed.js';
import { FlatAnim } from '../render/flatAnimation.js';
import { createPopulationLane } from '../characters/npcBodies.js'; import { residentLook, rosterActor } from '../characters/rosterBodies.js';

export const TRAVELLER_FAR_M = BAND_SPRITE_FAR_M;
const ALPHA_MIN = 0.02;
const PLAIN_BLEND_MODE = 3;

/** @param {any} res */
export function classLookOf(res) {
  const basics = res?.cls != null ? ENEMY_BASICS[res.cls] : null;
  if (!basics) return null;
  const archive = res.sex === 'female' && basics.femaleTexture ? basics.femaleTexture : basics.maleTexture;
  return archive ? { mobileType: res.cls, basics, archive } : null;
}

/**
 * @param {{ renderer: any, getTexture: (archive: number) => Promise<any>, uploadRecordFrame: (archive: number, record: number, frame: number) => void,
 *   living?: any, laneName?: string, wantBodies?: () => boolean, makeBodies?: (() => any) | null }} deps
 */
export function createTravellerSprites({ renderer, getTexture, uploadRecordFrame, living = null, laneName = 'roads', wantBodies = undefined, makeBodies = null }) {
  const bodiesLane = createPopulationLane({ laneName, renderer, ...(wantBodies ? { want: wantBodies } : {}), make: makeBodies });
  const shown = [];
  let _ground = false, _ids = 0;
  const texs = new Map();
  const bodies = new Map();
  const drawn = [];
  /** @type {{ person: any, pos: number[] }[]} */
  const seats = [];

  function texOf(archive) {
    if (texs.has(archive)) return texs.get(archive);
    const p = Promise.resolve(getTexture?.(archive)).then((t) => { texs.set(archive, t ?? null); }).catch(() => { texs.set(archive, null); });
    texs.set(archive, p);
    return p;
  }

  function drop(key) {
    const b = bodies.get(key);
    if (b?.batch) renderer?.destroyBillboardBatch?.(b.batch);
    bodies.delete(key);
  }

  function make(res, tex, look, flat = null, talk = true) {
    const talkSeed = lwSeed(textSeed(res.id), 0x74616c6b) & 0x7fffffff;
    if (flat) {
      const person = talk ? { nameNPC: res.name, personFaceRecordId: res.face, _talkSeed: talkSeed, living: { id: res.id, res, town: living },
        pos: [0, 0, 0], facingYaw: 0, guard: false, archive: flat.archive, pickpocketAttempted: false } : null;
      return { res, archive: flat.archive, tex, unit: null, walker: null, person, flat, anim: new FlatAnim(flat.archive, Math.max(1, tex.getFrameCount?.(flat.record) ?? 1)), batch: null, alpha: 0 };
    }
    if (look) {
      const unit = new MobileUnit(look.mobileType, look.basics, (rec) => tex.getFrameCount(rec), Math.random, res.sex ?? 'male');
      const person = { nameNPC: res.name, personFaceRecordId: res.face, _talkSeed: talkSeed, living: { id: res.id, res, town: living },
        pos: [0, 0, 0], facingYaw: 0, guard: false, archive: look.archive, pickpocketAttempted: false };
      return { res, archive: look.archive, tex, unit, walker: null, person, flat: null, batch: null, alpha: 0 };
    }
    const archive = res.civvies ?? res.archive;
    const walker = new ResidentWalker({}, { archive, frameCount: (rec) => tex.getFrameCount(rec), groundY: () => 0 });
    walker.nameNPC = res.name; walker.personFaceRecordId = res.face; walker._talkSeed = talkSeed;
    walker.living = { id: res.id, res, town: living };
    return { res, archive, tex, unit: null, walker, person: walker, flat: null, batch: null, alpha: 0 };
  }

  /**
   * @param {Array<{ key: string, res: any, feet: number[], yaw: number, moving: boolean, distM: number, striking?: boolean, talk?: boolean, flat?: { archive: number, record: number } | null, body?: boolean }>} list
   * @param {{ dt?: number, eye?: number[]|null, grow?: number, fade?: number, ground?: boolean }} [o]
   */
  function sync(list, { dt = 0, eye = null, grow = 1, fade = 1, ground = true } = {}) {
    drawn.length = 0;
    seats.length = 0;
    shown.length = 0; _ground = !!ground;
    const seen = new Set();
    for (const m of list ?? []) {
      if (!m?.feet || !m.res) continue;
      const flat = m.flat ?? null;
      const look = flat ? null : classLookOf(m.res);
      const archive = flat ? flat.archive : look ? look.archive : (m.res.civvies ?? m.res.archive);
      const tex = texOf(archive);
      if (!tex || typeof tex.then === 'function') continue;
      seen.add(m.key);
      let b = bodies.get(m.key);
      if (!b || b.res.id !== m.res.id || b.archive !== archive || !!b.flat !== !!flat || (flat && b.flat.record !== flat.record)) {
        if (b) drop(m.key);
        b = make(m.res, tex, look, flat, m.talk !== false);
        Object.assign(b, { id: `${laneName}:${++_ids}`, yaw: 0, moving: false, swings: 0, striking: false, talk: m.talk !== false, roll: 1 + (textSeed(String(m.res.id)) % 3), look: undefined });
        bodies.set(m.key, b);
      }
      b.yaw = m.yaw; b.moving = !!m.moving; b.body = m.body !== false;
      if (m.striking && !b.striking) b.swings++;
      b.striking = !!m.striking;
      const target = ground ? 1 : bandSpriteReach(m.distM) * Math.max(0, Math.min(1, fade));
      b.alpha = ground ? 1 : stepBandAlpha(b.alpha, target, dt);
      if (b.alpha < ALPHA_MIN) continue;
      const f = m.feet;
      let out;
      if (b.flat) {
        out = { record: b.flat.record, frame: b.anim ? b.anim.tick(dt) : 0, flip: false };
        if (b.person) { b.person.pos = f; b.person.facingYaw = m.yaw; }
      }
      else if (b.unit) {
        out = b.unit.update(dt, { moving: !!m.moving, striking: !!m.striking }, m.yaw, f, eye && eye.length === 3 ? eye : f);
        b.person.pos = f; b.person.facingYaw = m.yaw;
      } else {
        const w = b.walker;
        w.pos = [f[0], f[1], f[2]]; w.yaw = m.yaw; w.moving = !!m.moving;
        out = w.update(dt, eye && eye.length === 3 ? eye : f, false);
      }
      const rkey = `${out.record}#${out.frame}`;
      if (!renderer?.textures?.has?.(`${b.archive}_${rkey}`)) uploadRecordFrame?.(b.archive, out.record, out.frame);
      const sz = mobileBillboardSize(b.tex, out.record);
      const g = Math.max(1, grow || 1);
      const size = { w: (out.flip ? -sz.w : sz.w) * g, h: sz.h * g };
      if (!b.batch) {
        b.batch = renderer?.createBillboardBatch?.(b.archive, rkey, size, [[0, 0, 0]]) ?? null;
        if (!b.batch) continue;
        b.batch.origin = [0, 0, 0];
      } else {
        b.batch.record = rkey;
        b.batch.size = size;
      }
      b.batch.origin[0] = f[0]; b.batch.origin[1] = f[1]; b.batch.origin[2] = f[2];
      b.batch.conceal = b.alpha >= 0.99 ? null : { mode: PLAIN_BLEND_MODE, alpha: b.alpha, t: 0, phase: 0 };
      drawn.push(b.batch);
      shown.push(b);
      if (ground && b.person && m.talk !== false) seats.push({ person: b.person, pos: f });
    }
    for (const key of [...bodies.keys()]) if (!seen.has(key)) drop(key);
  }

  /**
   * @param {any} canvas
   * @param {Float32Array} proj
   * @param {Float32Array} view
   * @param {number[]} eye
   * @param {number} dt
   */
  function drawBodies(canvas, proj, view, eye, dt) {
    bodiesLane.frame();
    if (_ground) {
      for (const b of shown) {
        if (!b.body) continue;
        if (b.look === undefined) b.look = residentLook(b, b.res, { still: !!b.flat && b.talk });
        if (!b.look) continue;
        bodiesLane.offer(rosterActor(b, { id: b.id, look: b.look, feet: b.batch.origin, yaw: b.yaw, moving: b.moving, swingKey: b.swings || null,
          dead: b.flat && !b.talk ? b.roll : 0, drawn: !!b.unit }), b.batch);
      }
    } else {
      for (const b of shown) if (b.batch) b.batch.castOnly = false;
    }
    bodiesLane.draw(canvas, proj, view, eye, dt);
  }

  return {
    sync,
    drawBodies,
    /** @param {number[]} o */
    offsetBodies(o) { bodiesLane.offsetAll(o); },
    drawVeiledBodies() { bodiesLane.drawVeiled(); },
    batches: () => drawn,
    persons: () => seats,
    /** @param {string} key */
    bodyOf: (key) => bodies.get(key) ?? null,
    /** @param {(body: any) => boolean} test */
    someBody(test) { for (const b of bodies.values()) if (test(b)) return true; return false; },
    clear() { for (const key of [...bodies.keys()]) drop(key); drawn.length = 0; seats.length = 0; shown.length = 0; bodiesLane.destroy(); },
    get size() { return bodies.size; },
  };
}
