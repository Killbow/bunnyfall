// @ts-check
import { NAVAL_SFX } from './navalSounds.js';
import { boxGap, NEAR_MISS_M } from './navalShots.js';
import { quatRotate } from '../../world/quat.js';

export const NEAR_SPLASH_M = 6;
export const NEAR_SHAKE = 0.7;
export const DRENCH_FEET_M = 2;
export const BLOW_S = 1.4;
export const MAGAZINE_CHANCE = 0.55;
export const MAGAZINE_DELAY = Object.freeze([1.5, 4.5]);
export const MAGAZINE_SHAKE_M = 160;
export const MAGAZINE_SHAKE = 2.4;
// Keep these equal to SMOKE_FROM and SMOKE_SPAN in navalHost.js, which smoke the sea ships.
export const MY_SMOKE_FROM = 0.6;
export const MY_SMOKE_SPAN = 0.6;

export const seedShare = (seed, salt) => {
  let h = (Math.imul((seed >>> 0) ^ salt, 0x9e3779b1) >>> 0);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};
export function blowSide(fwd, dir) {
  const fl = Math.hypot(fwd[0], fwd[2]) || 1, f = [fwd[0] / fl, fwd[2] / fl];
  const from = [-(dir[0] ?? 0), -(dir[2] ?? 0)];
  const ahead = from[0] * f[0] + from[1] * f[1];
  const beam = from[0] * f[1] - from[1] * f[0];
  if (Math.abs(ahead) >= Math.abs(beam)) return ahead >= 0 ? 'bow' : 'stern';
  return beam >= 0 ? 'starboard' : 'port';
}
export function magazineOf(seed) {
  if (seedShare(seed, 0x6a91) >= MAGAZINE_CHANCE) return null;
  return MAGAZINE_DELAY[0] + seedShare(seed, 0x2b7) * (MAGAZINE_DELAY[1] - MAGAZINE_DELAY[0]);
}

export function deckLine(pose, build) {
  const f = quatRotate(pose.rotation, [0, 0, 1]);
  const fl = Math.hypot(f[0], f[2]) || 1, fw = [f[0] / fl, f[2] / fl];
  const y = pose.position[1] + build.deck + 0.5;
  const at = (z) => [pose.position[0] + fw[0] * z * MY_SMOKE_SPAN, y, pose.position[2] + fw[1] * z * MY_SMOKE_SPAN];
  return { a: at(build.aftZ), b: at(build.bowZ) };
}

/**
 * @param {{ effects: any, sound: (key: string, pos: number[], vol?: number, opts?: any) => void, shake?: (k: number) => void,
 *   mine: (shooter: any) => boolean, myHulls: () => { id: string, box: any }[], feet: () => number[],
 *   myBoats?: () => { pose: any, build: any, hull: number, fighting: boolean }[] }} deps
 */
export function createNavalFeel(deps) {
  let clock = 0;
  let lastBlow = null;
  const magazines = new Map();

  // `mine` is true for any player's ball, so only ships' balls whistle: players do not fight at sea.
  function passed(e) {
    if (deps.mine(e.shooter) || !e.point) return;
    const k = Math.max(0, 1 - (Number(e.gap) || 0) / NEAR_MISS_M);
    deps.sound(NAVAL_SFX.whistle, e.point, 0.55 + 0.45 * k);
  }
  function splashed(point) {
    let best = null;
    for (const h of deps.myHulls()) {
      const gap = boxGap(h.box, point);
      if (gap <= NEAR_SPLASH_M && (!best || gap < best.gap)) best = { h, gap };
    }
    if (!best) return false;
    const k = 1 - best.gap / NEAR_SPLASH_M;
    deps.effects.drench(point, best.h.box.c, k);
    const feet = deps.feet?.();
    if (feet && boxGap(best.h.box, feet) <= DRENCH_FEET_M) deps.shake?.(NEAR_SHAKE * (0.4 + 0.6 * k));
    return true;
  }
  function struck(fwd, dir) {
    if (!fwd || !dir) return;
    lastBlow = { side: blowSide(fwd, dir), at: clock };
  }
  const blow = () => (lastBlow && clock - lastBlow.at < BLOW_S ? lastBlow.side : null);
  function sinking(entry, seed, burning) {
    if (!burning || magazines.has(entry)) return;
    const after = magazineOf(seed);
    if (after != null) magazines.set(entry, clock + after);
  }
  /** @param {number} dt @param {(entry: any) => number[] | null} posOf */
  function frame(dt, posOf = () => null) {
    clock += Math.max(0, dt);
    for (const [entry, at] of magazines) {
      if (clock < at) continue;
      magazines.delete(entry);
      const p = posOf(entry);
      if (!p) continue;
      deps.effects.blast(p);
      deps.sound(NAVAL_SFX.blast, p, 1);
      const f = deps.feet();
      const d = Math.hypot(p[0] - f[0], p[2] - f[2]);
      if (d < MAGAZINE_SHAKE_M) deps.shake?.(MAGAZINE_SHAKE * (1 - d / MAGAZINE_SHAKE_M));
    }
    for (const m of deps.myBoats?.() ?? []) {
      const k = (MY_SMOKE_FROM - m.hull) / MY_SMOKE_FROM;
      if (k <= 0 || !m.fighting || !m.pose || !m.build) continue;
      const deck = deckLine(m.pose, m.build);
      deps.effects.smolder(deck.a, deck.b, dt, Math.min(1, k));
    }
  }
  return { passed, splashed, struck, blow, sinking, frame, clear() { lastBlow = null; magazines.clear(); }, get clock() { return clock; } };
}
