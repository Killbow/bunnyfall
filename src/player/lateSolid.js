// @ts-check
// Keeps a solid that appears late (placed furniture) from closing on a body already inside it.

import { Collider, SKIN } from './collider.js';
import { CAPSULE_HEIGHT, CAPSULE_RADIUS } from './motor.js';
import { heldInSolid } from './enterExit.js';
import { localAabb, transformedAabb } from '../render/frustum.js';

const PROBE = 'late';
const HIT = [0, 0, 0];

function boxMeetsBody(b, feet, height) {
  return b[0] <= feet[0] + CAPSULE_RADIUS && b[3] >= feet[0] - CAPSULE_RADIUS && b[1] <= feet[1] + height && b[4] >= feet[1]
    && b[2] <= feet[2] + CAPSULE_RADIUS && b[5] >= feet[2] - CAPSULE_RADIUS;
}

/**
 * @param {Collider} probe
 * @param {{ pos: number[], height?: number }} body
 */
export function lateSolidCloses(probe, body) {
  const height = body.height ?? CAPSULE_HEIGHT;
  const b = probe.bounds();
  if (!b || !boxMeetsBody([...b.min, ...b.max], body.pos, height)) return false;
  return probe.capsuleContact(body.pos, height, -SKIN, null, HIT) !== null || heldInSolid(probe, body.pos, height);
}


/** @typedef {{ pos: number[], height?: number }} LateBodyShape */
/** @typedef {LateBodyShape | (() => LateBodyShape | null | undefined) | null | undefined} LateBody */
/** @param {LateBody} b */
const bodyNow = (b) => {
  const now = typeof b === 'function' ? b() : b;
  return now?.pos ? now : null;
};

/** @type {WeakMap<object, ReturnType<typeof makeGate>>} */
const GATES = new WeakMap();
const LOCAL_BOX = new WeakMap();
const localBoxOf = (positions) => {
  let b = LOCAL_BOX.get(positions);
  if (!b) { b = localAabb(positions); LOCAL_BOX.set(positions, b); }
  return b;
};

/** @param {any} collider */
export function lateSolidsOf(collider) {
  if (!collider || typeof collider !== 'object') return null;
  let gate = GATES.get(collider);
  if (!gate) {
    gate = makeGate(collider);
    GATES.set(collider, gate);
    if (collider instanceof Collider) collider.late = gate;
  }
  return gate;
}

/** @param {any} collider */
function makeGate(collider) {
  /** @typedef {{ positions: ArrayLike<number>, indices: ArrayLike<number>, matrix: ArrayLike<number>, translation: any, sight: ArrayLike<number> | null, probe: Collider | null, box: number[] | null }} Part */
  /** @type {Map<string, Part[]>} */
  const held = new Map();
  /** @type {LateBody} */
  let guarded = null;
  const partOf = (positions, indices, matrix, translation, sight = null) => ({ positions, indices, matrix, translation: translation ?? null, sight, probe: null, box: null });
  const probeOf = (h) => {
    if (!h.probe) { h.probe = new Collider(); h.probe.addMesh(PROBE, h.positions, h.indices, h.matrix, h.translation, null, false, h.sight); }
    return h.probe;
  };
  const BOX = [0, 0, 0, 0, 0, 0];
  const closes = (h, body) => {
    const b = h.box ??= transformedAabb(localBoxOf(h.positions), h.matrix);
    const t = h.translation ? h.translation() : null;
    for (let i = 0; i < 6; i++) BOX[i] = b[i] + (t ? t[i % 3] : 0);
    return boxMeetsBody(BOX, body.pos, body.height ?? CAPSULE_HEIGHT) && lateSolidCloses(probeOf(h), body);
  };
  const stand = (key, h) => collider.addMesh?.(key, h.positions, h.indices, h.matrix, h.translation, null, false, h.sight);
  return {
    /**
     * @param {string} key
     * @param {ArrayLike<number>} positions
     * @param {ArrayLike<number>} indices
     * @param {ArrayLike<number>} matrix
     * @param {{ body?: LateBody, translation?: any, sight?: ArrayLike<number> | null }} [o]
     */
    add(key, positions, indices, matrix, { body = guarded, translation = null, sight = null } = {}) {
      const h = partOf(positions, indices, matrix, translation, sight);
      const now = bodyNow(body);
      if (!(now && closes(h, now))) { stand(key, h); return true; }
      const parts = held.get(key);
      if (parts) parts.push(h); else held.set(key, [h]);
      return false;
    },
    /**
     * @param {string} key
     * @param {ArrayLike<number>} positions
     * @param {ArrayLike<number>} indices
     * @param {ArrayLike<number>} matrix
     * @param {any} [translation]
     */
    replace(key, positions, indices, matrix, translation = null) {
      const h = partOf(positions, indices, matrix, translation);
      const was = held.has(key);
      collider.removeBucket?.(key);
      if (was) held.set(key, [h]); else stand(key, h);
    },
    /** @param {string} key */
    remove(key) {
      held.delete(key);
      collider.removeBucket?.(key);
    },
    /** @param {string} key */
    forget(key) { held.delete(key); },
    /** @param {LateBody} body */
    settle(body) {
      if (typeof body === 'function' || body?.pos) guarded = body;
      const now = bodyNow(guarded);
      if (!held.size || !now) return 0;
      let n = 0;
      for (const [key, parts] of [...held]) {
        const left = parts.filter((h) => closes(h, now));
        for (const h of parts) if (!left.includes(h)) { stand(key, h); n++; }
        if (left.length) held.set(key, left); else held.delete(key);
      }
      return n;
    },
    /** @param {string} key */
    withheld: (key) => held.has(key),
    size: () => { let n = 0; for (const parts of held.values()) n += parts.length; return n; },
  };
}
