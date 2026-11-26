// @ts-check
// Past NEAR_LIFE_M from the viewer, a ship's animators and particle systems step once every FAR_LIFE_EVERY frames
// with the time they missed. The naval host, the boat pool, peer boats, and Come Sail Away's boats all use it.
import { prefabShapeStamp, prefabSwitchStamp } from '../../world/prefabNode.js';
import { boatAnimators, boatParticleSystems } from './comeSailAwayBoat.js';

export const NEAR_LIFE_M = 600;
export const FAR_LIFE_EVERY = 4;

export const farLife = (n) => ({ lifeN: n % FAR_LIFE_EVERY, lifeDt: 0, shape: -1, on: -1 });

/**
 * @param {{ lifeN: number, lifeDt: number }} life
 * @param {number} dt
 * @param {ArrayLike<number> | null} pos
 * @param {ArrayLike<number> | null} eye
 * @returns {number | null}
 */
export function farLifeStep(life, dt, pos, eye) {
  life.lifeDt += dt;
  if (eye && pos && Math.hypot(pos[0] - eye[0], pos[2] - eye[2]) > NEAR_LIFE_M && (life.lifeN = (life.lifeN + 1) % FAR_LIFE_EVERY) !== 0) return null;
  const lived = life.lifeDt;
  life.lifeDt = 0;
  return lived;
}

// A ship whose tree was reshaped or switched since she last lived steps this frame at any range, so a far ship
// never shows a stale pose or switch state.
/**
 * @param {{ lifeN: number, lifeDt: number, shape: number, on: number }} life
 * @param {number} dt
 * @param {any} root
 * @param {ArrayLike<number> | null} pos
 * @param {ArrayLike<number> | null} eye
 * @returns {number | null}
 */
export function farTreeStep(life, dt, root, pos, eye) {
  const shape = prefabShapeStamp(root), on = prefabSwitchStamp(root);
  const lived = farLifeStep(life, dt, life.shape === shape && life.on === on ? pos : null, eye);
  life.shape = shape; life.on = on;
  return lived;
}

/** @param {{ eye?: () => ArrayLike<number> | null }} [deps] */
export function createBoatLives({ eye = () => null } = {}) {
  const lives = new WeakMap();
  let seq = 0;
  return {
    animate(boats, dt) {
      const at = eye();
      for (const boat of boats) {
        let life = lives.get(boat);
        if (!life) { life = { ...farLife(seq++), lived: null }; lives.set(boat, life); }
        const root = boat.GameObject;
        life.lived = farTreeStep(life, dt, root, root.localPosition, at);
        if (life.lived !== null) for (const a of boatAnimators(boat)) a.update(life.lived);
      }
    },
    particles(boats) {
      for (const boat of boats) {
        const lived = lives.get(boat)?.lived ?? null;
        if (lived !== null) for (const system of (boat.particleSystems ??= boatParticleSystems(boat))) system.step(lived);
      }
    },
  };
}
