// @ts-check
import { carriedPoint, yawDelta } from './comeSailAway.js';
import { deckPose, localOf, poseMatrix } from './comeSailAwayAboard.js';
import { POSE_ABOARD_LOCAL_MAX } from '../../net/wire.js';

// A deck that moves farther than this in one frame was placed, not sailed, so nobody is carried across it.
export const SEA_DECK_JUMP_M = 20;
// Seed and class name the same ship on every client; a player id never starts with this prefix.
export const seaDeckKey = (e) => `~sea:${(e?.ship?.seed ?? 0) >>> 0}:${e?.ship?.cls?.id ?? ''}`;
export const isSeaDeckKey = (key) => typeof key === 'string' && key.startsWith('~sea:');
const r2 = (v) => { const x = Math.round(v * 100) / 100; return x === 0 ? 0 : x; };
const copyPose = (p) => ({ position: [...p.position], rotation: [...p.rotation] });

/** @param {{ standsOn: (boat: any, feet: number[]) => boolean, feet: () => number[], swimming: () => boolean }} opts */
export function createSeaDecks({ standsOn, feet, swimming }) {
  /** @type {{ boat: any, key: string } | null} */
  let aboard = null;
  const held = new Map();
  let rate = 1;

  const live = (e) => !!e?.boat?.GameObject?.activeSelf;
  const on = (boat, me) => { const g = me.ground(boat); return g === 'boat' || (g == null && standsOn(boat, feet())); };
  function leave() { aboard = null; }

  // Call hold before the sea's frame poses its ships and frame after it.
  function hold(entries) {
    held.clear();
    for (const e of entries) if (live(e)) held.set(e.boat, copyPose(deckPose(e.boat)));
  }

  function frame(entries, me, frameRate = 1) {
    rate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 1;
    if (!me || !me.allowed()) { leave(); held.clear(); return null; }
    // The entries can be an iterator, which one walk spends.
    const list = [...entries];
    if (!aboard && !swimming()) {
      for (const e of list) if (live(e) && held.has(e.boat) && on(e.boat, me)) { aboard = { boat: e.boat, key: seaDeckKey(e) }; break; }
    }
    if (aboard) {
      const e = list.find((x) => x.boat === aboard.boat);
      const before = held.get(aboard.boat);
      if (!live(e) || !before) leave();
      else {
        const after = deckPose(e.boat);
        const at = feet();
        const to = carriedPoint(poseMatrix(before), poseMatrix(after), at);
        const delta = [to[0] - at[0], to[1] - at[1], to[2] - at[2]];
        if (Math.hypot(delta[0], delta[1], delta[2]) > SEA_DECK_JUMP_M) leave();
        else {
          const yaw = yawDelta(poseMatrix(before), poseMatrix(after));
          if (delta[0] || delta[1] || delta[2] || yaw) me.carry(delta, yaw);
          if (swimming() || !on(e.boat, me)) leave();
        }
      }
    }
    held.clear();
    return aboard?.boat ?? null;
  }

  function word(at) {
    if (!aboard || !Array.isArray(at)) return null;
    const l = localOf(deckPose(aboard.boat), at);
    if (!l || !l.every((v) => Math.abs(v) <= POSE_ABOARD_LOCAL_MAX)) return null;
    return [aboard.key, 0, r2(l[0]), r2(l[1]), r2(l[2])];
  }

  // The sea poses ships after the online frame places other players, so a reader projects the deck a frame ahead.
  function ahead(entries, key, dt) {
    if (!isSeaDeckKey(key)) return null;
    for (const e of entries) {
      if (!live(e) || seaDeckKey(e) !== key) continue;
      const go = e.boat.GameObject, way = (Number(e.ship?.speed) || 0) * Math.max(0, Number(dt) || 0) * rate, yaw = Number(e.ship?.yaw) || 0;
      return deckPose(e.boat, { position: [go.position[0] + Math.sin(yaw) * way, go.position[1], go.position[2] + Math.cos(yaw) * way], rotation: go.rotation });
    }
    return null;
  }

  return { hold, frame, word, ahead, leave, get boat() { return aboard?.boat ?? null; }, get key() { return aboard?.key ?? null; } };
}
