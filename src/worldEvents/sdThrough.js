// @ts-check

import { createSdEnd } from './sdEnd.js';
import { sdThroughPlace, SD_THROUGH_TEXT, SD_THROUGH_NEAR_RIFT_M } from '../world/sdDungeon.js';

export const SD_THROUGH_KEY = 'sdrift:1';
export const SD_THROUGH_ASK_MS = 1000;
// Beyond this distance the ring gives up its light, so it does not take a slot from a nearby torch in the dungeon
// light list.
export const SD_THROUGH_LIGHT_M = 30;
const NONE = Object.freeze([]);

export function sdVeilModelOf(eye, through, end) {
  const b = end?.window?.model ?? end?.bay?.model ?? null, a = through?.window?.model ?? null;
  if (!a || !b || !eye) return a ?? b;
  return far2(a, eye) <= far2(b, eye) ? a : b;
}
function far2(m, eye) { return (m[12] - eye[0]) ** 2 + (m[13] - eye[1]) ** 2 + (m[14] - eye[2]) ** 2; }
// Orders the two rings far to near for a pass that writes no depth. Returns a shared array that the next call
// overwrites.
export function sdRingsFarFirst(eye, through, end) {
  const nearIsThrough = !!through?.window?.model && sdVeilModelOf(eye, through, end) === through.window.model;
  _pair[0] = nearIsThrough ? end : through; _pair[1] = nearIsThrough ? through : end;
  return _pair;
}
const _pair = [null, null];

/** @param {{ renderer?: any, audio?: any, now?: () => number, word?: () => any, look?: () => any, clock?: (() => number) | null, onStep?: () => (boolean|null|void), say?: (text: string) => void, probe?: any, riftOf?: () => any, dynamicDraws?: any[] | null }} [deps] */
export function createSdThrough({ renderer = null, audio = null, now = () => performance.now(), word = () => null, look = () => null, clock = null, onStep = () => {}, say = () => {}, probe = null, riftOf = () => null, dynamicDraws = null } = {}) {
  // The ring is press-only because it sits where players walk, and its press yields to any firm target behind it,
  // such as a door.
  const end = createSdEnd({ renderer, audio, now, onRift: onStep, riftKey: SD_THROUGH_KEY, riftTitle: () => SD_THROUGH_TEXT.title, riftTo: () => SD_THROUGH_TEXT.to, riftCount: () => word()?.count ?? null, look, clock, walkIn: false, riftYields: true });
  let stood = false, out = false, askAt = -Infinity;
  const me = [0, 0, 0];
  let hasMe = false, ringAt = null;
  return {
    frame(feet, yaw = 0, eye = null) {
      const t = now();
      if (feet) { me[0] = feet[0]; me[1] = feet[1]; me[2] = feet[2]; hasMe = true; }
      if (!out && feet && t >= askAt) {
        askAt = t + SD_THROUGH_ASK_MS;
        const w = word();
        if (stood) { if (w && !w.returns) { end.clear(); out = true; ringAt = null; } }
        else if (w?.through && w.word == null && probe) {
          const at = riftOf()?.at;
          const near = !!at && Math.hypot(feet[0] - at[0], feet[2] - at[2]) < SD_THROUGH_NEAR_RIFT_M && Math.abs(feet[1] - at[1]) < SD_THROUGH_NEAR_RIFT_M;
          const place = near ? null : sdThroughPlace(feet, yaw, probe);
          if (place && end.stand({ rift: place, retAt: null, dynamicDraws, probe })) { stood = true; ringAt = place.at; say(SD_THROUGH_TEXT.opens); }
        }
      }
      return end.frame(feet, eye);
    },
    get stands() { return !!end.rift; },
    get rift() { return end.rift; },
    targets: () => end.targets(),
    hoverName: (key) => end.hoverName(key),
    press: (key) => end.press(key),
    look: (eye, sky, hour) => end.look(eye, sky, hour),
    halos: () => end.halos(),
    lights() {
      const r = ringAt;
      if (r && hasMe && (r[0] - me[0]) ** 2 + (r[1] - me[1]) ** 2 + (r[2] - me[2]) ** 2 > SD_THROUGH_LIGHT_M * SD_THROUGH_LIGHT_M) return NONE;
      return end.lights();
    },
    clear() { end.clear(); out = true; ringAt = null; },
  };
}
