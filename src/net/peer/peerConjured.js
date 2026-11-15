// @ts-check
// Shares this player's Meteor (`mt`) and Wall of Earth (`ew`) on the pose and plays other players' copies in the live
// cast engine. The relay checks only shape and bounds, so the reach, rate, and lifetime checks are made here. The
// caller passes frame() the whole drawable list, not the draw-distance cut. It reads `pose`, never the drawn `shown`.
// A peer seen for the first time has its meteor skipped and its standing wall placed whole, with no reach check.
import { METEOR_HOLD_S, WALL_PICTURE_KINDS } from '../conjuredLaw.js';
import { WALL_REACH_M, METEOR_HEIGHT_M } from '../../systems/spell/bunnySpellLaw.js';
import { placePictureSource, GROUND_TILE_M, ROCK_TILE_M } from '../../world/placePicture.js';
import { placeNow } from '../../systems/placeClimate.js';

const WALL_REACH = WALL_REACH_M + 4, METEOR_REACH = 90, METEOR_FALL_MAX = 100;
const NEW_GAP_S = 1, WALL_LIFE_S = 240, GONE_S = 2;

const r2 = (v) => Math.round(v * 100) / 100;
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * @param {{ engine: () => any, toWire: (p: number[]) => number[], toScene: (p: { x: number, y: number, z: number }) => number[],
 *   me?: (() => { feet: ArrayLike<number>, radius: number, height: number } | null) | null, moveTo?: ((p: number[]) => void) | null }} deps
 */
export function createPeerConjured({ engine, toWire, toScene, me = null, moveTo = null }) {
  const peers = new Map();
  let clock = 0, tick = 0, live = null;

  const unitsPerM = () => { const a = toWire([0, 0, 0]), b = toWire([1, 0, 0]); return Math.hypot(b[0] - a[0], b[2] - a[2]) || 1; };
  function wirePoint(p) {
    const q = toWire([p[0], p[1], p[2]]);
    if (!q || !q.every(Number.isFinite)) return null;
    const whole = unitsPerM() > 4;
    return [whole ? Math.round(q[0]) : r2(q[0]), r2(q[1]), whole ? Math.round(q[2]) : r2(q[2])];
  }

  function out() {
    const e = engine();
    const fields = {};
    const m = e?.meteorOut?.();
    if (m && m.age < METEOR_HOLD_S) {
      const a = wirePoint(m.from), b = wirePoint(m.to);
      if (a && b) fields.mt = [m.n, ...a, ...b, Math.max(0, Math.min(4, m.el | 0)), m.seed];
    }
    const w = e?.wallOut?.();
    const foot = w && wirePoint(w.at), ahead = w && toWire([w.at[0] + w.f[0], w.at[1], w.at[2] + w.f[2]]);
    if (foot && ahead?.every(Number.isFinite)) {
      const at = toWire([w.at[0], w.at[1], w.at[2]]), kind = WALL_PICTURE_KINDS.indexOf(w.src?.kind);
      const yaw = Math.round(Math.atan2(ahead[0] - at[0], ahead[2] - at[2]) * 1e4) / 1e4;
      fields.ew = [w.id, ...foot, yaw, w.warn ? 1 : 0, kind < 0 ? 2 : kind, Math.max(0, Math.min(1023, w.src?.archive | 0)), Math.max(0, Math.min(255, w.src?.record | 0))];
    }
    return fields;
  }

  function wallSpec(ew) {
    const at = toScene({ x: ew[1], y: ew[2], z: ew[3] }), u = unitsPerM();
    const b = toScene({ x: ew[1] + Math.sin(ew[4]) * u, y: ew[2], z: ew[3] + Math.cos(ew[4]) * u });
    const l = Math.hypot(b[0] - at[0], b[2] - at[2]) || 1;
    const kind = WALL_PICTURE_KINDS[ew[6]] ?? 'rock', here = placePictureSource(placeNow(at));
    const src = here.kind === kind && here.archive === ew[7] && here.record === ew[8] ? here : { kind, archive: ew[7], record: ew[8], tile: kind === 'ground' ? GROUND_TILE_M : ROCK_TILE_M };
    return { at, f: [(b[0] - at[0]) / l, 0, (b[2] - at[2]) / l], src };
  }

  function meteorOf(id, s, pose, fresh, e) {
    const mt = pose.mt, n = mt ? mt[0] : s.mn;
    if (fresh || !mt || n === s.mn) { s.mn = n; return; }
    s.mn = n;
    if (clock - s.meteorT < NEW_GAP_S) return;
    const from = toScene({ x: mt[1], y: mt[2], z: mt[3] }), to = toScene({ x: mt[4], y: mt[5], z: mt[6] });
    if (flat(to, toScene(pose)) > METEOR_REACH || dist(from, to) > METEOR_FALL_MAX) return;
    s.meteorT = clock;
    // Mirrors meteorPath: only a drop from under something overhead falls straight down from below METEOR_HEIGHT_M.
    const indoor = flat(from, to) < 0.05 && from[1] - to[1] < METEOR_HEIGHT_M - 0.15;
    e.peerMeteor(id, { from, to, element: mt[7], seed: mt[8], indoor });
  }

  function wallOf(id, s, pose, fresh, e) {
    const ew = pose.ew;
    if (!ew) { if (s.wall?.up) e.peerWallEnd(id); s.wall = null; return; }
    if (s.wall?.id !== ew[0]) {
      if (s.wall?.up) e.peerWallEnd(id);
      const rise = !fresh, ok = !rise || (flat(wallSpec(ew).at, toScene(pose)) <= WALL_REACH && clock - s.wallT >= NEW_GAP_S);
      s.wall = { id: ew[0], up: ok, rise, born: clock, warn: false };
      if (ok && rise) s.wallT = clock;
    }
    const w = s.wall, warn = ew[5] === 1;
    if (!w.up) return;
    if (clock - w.born > WALL_LIFE_S) { w.up = false; e.peerWallEnd(id); return; }
    if (!e.peerWallUp(id, w.id)) {
      const moved = e.peerWall(id, { ...wallSpec(ew), id: w.id, warn, risen: !w.rise }, me?.() ?? null);
      w.rise = false; w.warn = warn;
      if (moved) moveTo?.(moved);
    } else if (warn && !w.warn) { w.warn = true; e.peerWallWarn(id); }
  }

  function frame(list, dt) {
    clock += dt > 0 ? dt : 0;
    tick++;
    const e = engine();
    if (e !== live) { live?.peerClear?.(); live = e; }
    if (!e) return;
    for (const p of list ?? []) {
      const pose = p?.pose;
      if (!p?.id || !pose) continue;
      let s = peers.get(p.id);
      const fresh = !s || s.tick < tick - 1;
      if (!s) peers.set(p.id, (s = { tick, seen: clock, mn: 0, wall: null, wallT: -Infinity, meteorT: -Infinity }));
      s.tick = tick; s.seen = clock;
      meteorOf(p.id, s, pose, fresh, e);
      wallOf(p.id, s, pose, fresh, e);
    }
    for (const [id, s] of peers) {
      if (s.tick === tick || clock - s.seen <= GONE_S) continue;
      if (s.wall?.up) e.peerWallEnd(id);
      peers.delete(id);
    }
  }

  return { out, frame };
}
