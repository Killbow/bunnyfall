// @ts-check
import { lwSeed, textSeed } from '../systems/livingWorld/seed.js';

// The `fam:` prefix holds a colon, which relay ids (`ID_RE` in net/wire.js) never contain, so a member id never
// matches a peer id.
export const familyPeerId = (resId) => `fam:${resId}`;

export const familyShown = (feet, yaw, moving, st = 0) => ({ x: feet[0], y: feet[1], z: feet[2], yaw: Number.isFinite(yaw) ? yaw : 0, mv: moving ? 1 : 0, ...(st > 0 ? { st } : {}) });
const sceneOf = (/** @type {any} */ s) => [s.x, s.y, s.z];

/** @param {{ dolls: any, bodies?: any }} layers */
export function createFamilyBodies({ dolls, bodies = null }) {
  /** @type {any[]} */
  const peers = [];
  return {
    begin() { peers.length = 0; },
    /**
     * @param {any} res
     * @param {number[]} feet
     * @param {number} yaw
     * @param {boolean} moving
     * @param {number} [st]
     */
    stand(res, feet, yaw, moving, st = 0) {
      if (!res?.look || !feet) return false;
      peers.push({ id: familyPeerId(res.id), look: res.look, shown: familyShown(feet, yaw, moving, st) });
      return true;
    },
    end(/** @type {number} */ dt, /** @type {number[]|null} */ eye) {
      bodies?.sync(peers, sceneOf, dt, eye);
      dolls.sync(peers, sceneOf, { bodyHeight: (/** @type {string} */ id) => bodies?.heightOf(id) ?? 0, dt, eye });
    },
    batches: () => dolls.batches(),
    draw(/** @type {any} */ canvas, /** @type {any} */ o) { bodies?.draw(canvas, o); },
    offsetAll(/** @type {number[]} */ o) {
      for (const b of dolls.batches()) { b.origin[0] += o[0]; b.origin[1] += o[1]; b.origin[2] += o[2]; }
      bodies?.offsetAll(o);
    },
    clear() { peers.length = 0; dolls.sync([], sceneOf); bodies?.destroy(); },
    // Releases every doll texture too, unlike `clear`, which keeps the doll cache for the next visit; call this
    // when the layer is dropped.
    destroy() { peers.length = 0; dolls.destroy?.(); bodies?.destroy(); },
    get size() { return peers.length; },
  };
}

/**
 * @param {any} sprites
 * @param {ReturnType<typeof createFamilyBodies>} family
 * @param {any} [living]
 */
export function familyRoomSprites(sprites, family, living = null) {
  /** @type {{ person: any, pos: number[] }[]} */
  const seats = [];
  const persons = new Map();
  const personOf = (key, res, feet, yaw) => {
    let p = persons.get(key);
    if (!p || p.living.res !== res) {
      p = { nameNPC: res.name, personFaceRecordId: res.face, _talkSeed: lwSeed(textSeed(res.id), 0x74616c6b) & 0x7fffffff,
        living: { id: res.id, res, town: living }, pos: [0, 0, 0], facingYaw: 0, guard: false, archive: res.archive, pickpocketAttempted: false };
      persons.set(key, p);
    }
    p.pos = feet; p.facingYaw = yaw;
    return p;
  };
  return {
    /**
     * @param {any[]} list
     * @param {any} [o]
     */
    sync(list, o = {}) {
      family.begin();
      seats.length = 0;
      const rest = [];
      const here = new Set();
      for (const m of list ?? []) {
        if (m?.res && m.feet && family.stand(m.res, m.feet, m.yaw, !!m.moving)) {
          here.add(m.key);
          seats.push({ person: personOf(m.key, m.res, m.feet, m.yaw), pos: m.feet });
          continue;
        }
        rest.push(m);
      }
      for (const key of [...persons.keys()]) if (!here.has(key)) persons.delete(key);
      sprites.sync(rest, o);
      family.end(o.dt ?? 0, o.eye ?? null);
    },
    batches: () => [...sprites.batches(), ...family.batches()],
    persons: () => [...sprites.persons(), ...seats],
    bodyOf: (/** @type {string} */ key) => sprites.bodyOf?.(key) ?? null,
    drawBodies(canvas, proj, view, eye, dt) { sprites.drawBodies?.(canvas, proj, view, eye, dt); },
    clear() { sprites.clear(); family.clear(); seats.length = 0; persons.clear(); },
    get size() { return (sprites.size ?? 0) + family.size; },
  };
}
