// Sits between the autopilot and the motor: the autopilot owns the target and arrival, and this module picks only
// the heading and force cap. `input`, `output`, and the probe scratch are allocated once and reused every frame.

import { rectDistance } from './travelAutopilot.js';
import { FIXED_DT, MAX_FRAME_DT, STEP_OFFSET, SLOPE_LIMIT_DEG } from '../player/motor.js';

const DEG = Math.PI / 180;
const REF = -1;
const NONE = -2;

export const TRAVEL_STEER = Object.freeze({
  body: 0.45,
  standoff: 1.0,
  minStep: 0.5,
  minLook: 8,
  lookFrames: 2,
  feelerMax: 24,
  pastCap: 64,
  exitMargin: 2,
  pursuit: 8,
  onLine: 0.25,
  offsets: Object.freeze([5, 10, 20, 30, 45, 60, 75, 90, 105, 120, 150, 180]),
  sideSpan: 5,
  maxFeelers: 16,
  detourBudget: 200,
  commitMetres: 40,
  grindWindow: 6,
  grindSteps: 3,
  grindRatio: 0.25,
  grindWindows: 3,
  headwayBudget: 400,
  headwayGain: 1,
  jumpMin: 64,
  jumpReaches: 4,
});

// An upper bound, not an estimate: the extra fixed step covers what the accumulator can carry over. Feelers must
// reach this far, or a long frame at x100 walks through what they missed.
export function travelFrameReach(speed, dt, scale, maxFrameDt = MAX_FRAME_DT, fixedDt = FIXED_DT) {
  return Math.max(0, speed) * Math.max(0, scale) * (Math.min(Math.max(0, dt), maxFrameDt) + fixedDt);
}

export function createTravelSteer(params = TRAVEL_STEER) {
  const P = params;
  const N = P.offsets.length;
  const s = {
    key: null,
    tx: NaN, tz: NaN,
    ox: 0, oz: 0,
    hasLast: false, lastX: 0, lastZ: 0, lastYaw: 0,
    episode: false,
    ref: 0,
    side: 0,
    sideK: 0,
    k: NONE,
    scanNext: -1,
    scanBest: -1, scanBestC: 0,
    flipped: false,
    sBlock: 0,
    sStart: 0,
    goStart: 0,
    walked: 0,
    commitSide: 0, commitLeft: 0,
    winAsked: 0, winMoved: 0, grind: 0,
    bestDist: Infinity,
    noGain: 0,
    lastReach: 0,
    probes: 0,
    episodes: 0, flips: 0, holds: 0,
  };
  const input = { key: null, x: 0, z: 0, tx: 0, tz: 0, yaw: 0, goal: Infinity, reach: 0, quantum: 0, asked: 0, manual: false, pathed: false };
  const output = { yaw: 0, forward: 1, stop: null, deflected: false };
  const f = { probe: null, want: 0, ux: 0, uz: 1, along: 0, lat: 0, reachFan: 0 };

  function endEpisode() {
    s.episode = false; s.k = NONE; s.side = 0; s.scanNext = -1;
  }

  function reset() {
    s.key = null; s.tx = NaN; s.tz = NaN; s.hasLast = false;
    endEpisode(); s.flipped = false; s.walked = 0;
    s.commitSide = 0; s.commitLeft = 0;
    s.winAsked = 0; s.winMoved = 0; s.grind = 0;
    s.bestDist = Infinity; s.noGain = 0;
  }

  function feel(h, lateral, dist) {
    s.probes++;
    const c = f.probe(Math.sin(h), Math.cos(h), lateral, dist);
    return c < dist ? c : dist;
  }

  function corridor(h, dist, cut) {
    let c = feel(h, 0, dist);
    if (c < cut) return c;
    const l = feel(h, -P.body, dist);
    if (l < c) c = l;
    if (c < cut) return c;
    const r = feel(h, P.body, dist);
    return r < c ? r : c;
  }

  function past(h, leaving) {
    if (!s.episode) return 0;
    const left = s.sBlock + P.exitMargin - f.along;
    if (left <= 0) return 0;
    const fwd = Math.sin(h) * f.ux + Math.cos(h) * f.uz;
    if (fwd <= 0.05) return leaving ? Infinity : 0;
    const d = left / fwd;
    if (d > P.pastCap) return leaving ? Infinity : P.pastCap;
    return d;
  }

  function headingAt(k, side = s.side) {
    return k === REF ? s.ref : s.ref + side * P.offsets[k] * DEG;
  }

  function openAt(k, side) {
    const h = headingAt(k, side);
    const req = Math.max(f.reachFan, past(h, false));
    const c = corridor(h, req, req);
    return c >= req ? c : -1;
  }

  function go(out, inp, heading, clear, reach) {
    out.forward = reach > 0 ? Math.max(0, Math.min(1, (clear - P.standoff) / reach)) : 1;
    out.yaw = heading;
    out.deflected = heading !== inp.yaw;
    s.lastYaw = heading;
    return out;
  }

  function hold(out, inp) {
    s.holds++;
    out.forward = 0;
    out.yaw = s.lastYaw;
    out.deflected = out.yaw !== inp.yaw;
    return out;
  }

  function stopWith(out, inp, why) {
    out.stop = why;
    out.yaw = inp.yaw;
    out.forward = 0;
    out.deflected = false;
    endEpisode();
    return out;
  }

  // `inp.x`/`inp.z` are world coordinates, so floating-origin shifts never reach the steering. `probe` returns
  // `maxDist` or more when the feeler is clear. Writes `out` and returns it.
  function step(inp, probe, out = output) {
    out.stop = null;
    out.deflected = false;
    s.probes = 0;
    f.probe = probe;
    if (inp.key !== s.key) { reset(); s.key = inp.key; s.lastYaw = inp.yaw; }
    if (inp.tx !== s.tx || inp.tz !== s.tz) {
      s.tx = inp.tx; s.tz = inp.tz; s.ox = inp.x; s.oz = inp.z;
      endEpisode();
      s.bestDist = Infinity; s.noGain = 0;
    }

    let moved = 0;
    if (s.hasLast) {
      moved = Math.hypot(inp.x - s.lastX, inp.z - s.lastZ);
      if (moved > Math.max(P.jumpMin, P.jumpReaches * s.lastReach)) {
        moved = 0;
        s.ox = inp.x; s.oz = inp.z;
        endEpisode();
        s.commitLeft = 0; s.winAsked = 0; s.winMoved = 0; s.bestDist = Infinity; s.noGain = 0;
      }
      if (s.episode) s.walked += moved;
      s.commitLeft -= moved;
      s.winAsked += inp.asked;
      s.winMoved += moved;
      if (s.winAsked >= Math.max(P.grindWindow, P.grindSteps * inp.quantum)) {
        s.grind = s.winMoved < P.grindRatio * s.winAsked ? s.grind + 1 : 0;
        s.winAsked = 0; s.winMoved = 0;
      }
    }
    s.hasLast = true; s.lastX = inp.x; s.lastZ = inp.z; s.lastReach = Math.max(0, inp.reach);
    if (s.grind >= P.grindWindows) return stopWith(out, inp, 'stuck');
    if (inp.manual) {
      s.ox = inp.x; s.oz = inp.z;
      if (s.episode) endEpisode();
      s.bestDist = Infinity; s.noGain = 0;
    }
    const toGo = Math.hypot(s.tx - inp.x, s.tz - inp.z);
    if (toGo < s.bestDist - P.headwayGain) { s.bestDist = toGo; s.noGain = 0; }
    else s.noGain += moved;
    if (s.noGain > P.headwayBudget) return stopWith(out, inp, 'stuck');

    const lx = s.tx - s.ox, lz = s.tz - s.oz;
    const len = Math.hypot(lx, lz);
    f.ux = len > 1e-6 ? lx / len : Math.sin(inp.yaw);
    f.uz = len > 1e-6 ? lz / len : Math.cos(inp.yaw);
    const rx = inp.x - s.ox, rz = inp.z - s.oz;
    f.along = rx * f.ux + rz * f.uz;
    f.lat = rx * f.uz - rz * f.ux;

    f.want = inp.yaw;
    if (!inp.pathed && (s.episode || Math.abs(f.lat) > P.onLine)) {
      const ahead = len > 1e-6 ? Math.min(len, f.along + P.pursuit) : f.along + P.pursuit;
      const ax = s.ox + f.ux * ahead - inp.x, az = s.oz + f.uz * ahead - inp.z;
      if (ax * ax + az * az > 1e-8) f.want = Math.atan2(ax, az);
    }

    const reach = Math.max(0, inp.reach);
    const need = reach + P.standoff;
    const look = Math.max(P.minLook, P.lookFrames * reach) + P.standoff;
    const lookWant = Math.min(look, Math.max(0, inp.goal) + (inp.pathed ? 0 : P.standoff));
    f.reachFan = Math.min(look, P.feelerMax);
    const pass = P.standoff + P.minStep;
    const keep = Math.max(pass, 0.5 * Math.min(need, f.reachFan));

    const leaveNeed = past(f.want, true);
    if (leaveNeed !== Infinity) {
      const openWant = Math.max(lookWant, leaveNeed, pass);
      const cw = corridor(f.want, Math.max(openWant, need), inp.manual ? 0 : openWant);
      if (inp.manual) return go(out, inp, f.want, cw, reach);
      // A detour ends only at or past where it began, or no farther from the target, so a brief open view while
      // backing out does not restart the same detour.
      if (cw >= openWant && (!s.episode || f.along >= s.sStart || toGo <= s.goStart)) {
        if (s.episode) { s.commitSide = s.side || s.commitSide; s.commitLeft = P.commitMetres; endEpisode(); }
        return go(out, inp, f.want, cw, reach);
      }
      if (!s.episode) {
        s.episode = true; s.episodes++;
        s.walked = 0; s.sStart = f.along; s.goStart = toGo; s.flipped = false;
        s.ref = f.want; s.k = NONE; s.scanNext = -1;
        s.sBlock = f.along + cw * Math.max(0, Math.sin(f.want) * f.ux + Math.cos(f.want) * f.uz);
        if (s.commitLeft > 0 && s.commitSide) { s.side = s.commitSide; s.scanNext = 0; s.scanBest = -1; s.scanBestC = 0; }
        else { s.side = 0; s.sideK = 0; }
      }
    }

    // On a tie the side turns back toward the line, or right when on the line, so a replay walks the same way.
    let chosen = NONE, cc = 0;
    if (s.side === 0) {
      for (; s.sideK < Math.min(P.sideSpan, N); s.sideK++) {
        if (s.probes + 6 > P.maxFeelers) return hold(out, inp);
        const r = openAt(s.sideK, 1), l = openAt(s.sideK, -1);
        if (r >= 0 || l >= 0) {
          s.side = r >= 0 && l >= 0 ? (f.lat > P.onLine ? -1 : 1) : (r >= 0 ? 1 : -1);
          chosen = s.sideK; cc = s.side > 0 ? r : l;
          break;
        }
      }
      if (s.side === 0) { s.side = 1; s.scanNext = s.sideK; s.scanBest = -1; s.scanBestC = 0; }
      s.k = NONE;
    }

    if (chosen === NONE && s.scanNext < 0) {
      if (s.k !== REF) {
        const c = openAt(REF, s.side);
        if (c >= 0) { chosen = REF; cc = c; }
      }
      if (chosen === NONE && s.k >= 1) {
        const c = openAt(s.k - 1, s.side);
        if (c >= 0) { chosen = s.k - 1; cc = c; }
      }
      if (chosen === NONE && s.k !== NONE) {
        const c = corridor(headingAt(s.k), Math.max(f.reachFan, need), keep);
        if (c >= keep) { chosen = s.k; cc = c; }
        else if (s.k === REF) {
          const fw = Math.sin(s.ref) * f.ux + Math.cos(s.ref) * f.uz;
          if (fw > 0.05) s.sBlock = Math.max(s.sBlock, f.along + c * fw);
        }
      }
      if (chosen === NONE) { s.scanNext = s.k >= 0 ? s.k + 1 : 0; s.scanBest = -1; s.scanBestC = 0; }
    }
    if (chosen === NONE) {
      for (; s.scanNext < N; s.scanNext++) {
        if (s.probes + 3 > P.maxFeelers) return hold(out, inp);
        const k = s.scanNext, h = headingAt(k), req = Math.max(f.reachFan, past(h, false));
        const c = corridor(h, req, req);
        if (c >= req) { chosen = k; cc = c; break; }
        if (c > s.scanBestC) { s.scanBest = k; s.scanBestC = c; }
      }
      if (chosen === NONE && s.scanBest >= 0 && s.scanBestC >= pass) {
        if (s.probes + 3 > P.maxFeelers) return hold(out, inp);
        const c = corridor(headingAt(s.scanBest), Math.max(f.reachFan, need), pass);
        if (c >= pass) { chosen = s.scanBest; cc = c; }
      }
      s.scanNext = -1;
    }
    if (chosen === NONE) {
      if (s.flipped) return stopWith(out, inp, 'blocked');
      s.flipped = true; s.flips++; s.side = -s.side; s.k = NONE;
      s.scanNext = 0; s.scanBest = -1; s.scanBestC = 0;
      return hold(out, inp);
    }
    s.k = chosen;
    if (s.walked - (f.along - s.sStart) > P.detourBudget) return stopWith(out, inp, 'blocked');
    return go(out, inp, headingAt(chosen), cc, reach);
  }

  return { step, reset, input, output, state: s, params: P };
}

// Writes `drive` in place: the yaw only when the steering turned it, and the force scaled by the stand-off cap.
// `worldX`/`worldZ` are mod world units (32768 per map pixel).
export function steerDrive(steer, drive, worldX, worldZ, autopilot, frame, probe) {
  const r = frame.ratio;
  const inp = steer.input;
  inp.key = autopilot;
  inp.x = worldX / r; inp.z = worldZ / r;
  const to = autopilot.steerTarget ?? autopilot.destinationCentre;
  inp.tx = to.x / r;
  inp.tz = to.z / r;
  inp.pathed = !!autopilot.path;
  // A pathed leg limits its look-ahead to the end of the current run, since a street turns because a building sits
  // at the corner.
  inp.goal = (inp.pathed ? Math.hypot(to.x - worldX, to.z - worldZ) : rectDistance(autopilot.destinationWorldRect, worldX, worldZ)) / r;
  inp.manual = !!frame.strafe;
  // While strafe is held on a pathed leg, the drive uses `runYaw`, so line pursuit does not pull the body back
  // toward the path.
  if (inp.manual && inp.pathed && autopilot.runYaw != null) drive.yaw = autopilot.runYaw;
  inp.yaw = drive.yaw * DEG;
  const force = Math.max(0, drive.forward);
  inp.reach = travelFrameReach(frame.speed, frame.dt, frame.scale) * force;
  inp.quantum = Math.max(0, frame.speed) * Math.max(0, frame.scale) * FIXED_DT * force;
  inp.asked = frame.asked;
  const out = steer.step(inp, probe, steer.output);
  if (out.deflected) drive.yaw = out.yaw / DEG;
  drive.forward *= out.forward;
  return out.stop;
}

export const FEELER_HEIGHT = STEP_OFFSET + 0.1;
export const FEELER_LEG = 8;
export const WALKABLE_NY = Math.cos(SLOPE_LIMIT_DEG * DEG);
const ON_STRUCTURE = 0.5;
export const FEELER_RIDES = 4;
const RIDE_NUDGE = 0.01;

// The terrain is not in the collider's buckets, so feelers follow `collider.heightAt`; a level ray would pass
// through a hill. `o`, `d`, and `hit` are reused every call.
export function createColliderProbe({ collider, feet, height = FEELER_HEIGHT, leg = FEELER_LEG }) {
  const o = [0, 0, 0];
  const d = [0, 0, 0];
  const hit = { dist: Infinity, key: null, normal: [0, 0, 0] };
  return function probe(dirX, dirZ, lateral, maxDist) {
    const at = feet();
    // Right of (dirX, dirZ) is (dirZ, -dirX), matching screen-right in motor.js.
    const sx = at[0] + dirZ * lateral, sz = at[2] - dirX * lateral;
    const g0 = collider.heightAt(at[0], at[2]);
    // Written as a negated `<=` so a missing ground height (NaN or -Infinity) also reads as a structure.
    const level = !(at[1] - g0 <= ON_STRUCTURE);
    let y0 = at[1] + height;
    let a = 0;
    while (a < maxDist) {
      const b = Math.min(maxDist, a + leg);
      const x1 = sx + dirX * b, z1 = sz + dirZ * b;
      let y1 = y0;
      if (!level) {
        const g1 = collider.heightAt(x1, z1);
        if (Number.isFinite(g1)) y1 = g1 + height;
      }
      let ox = sx + dirX * a, oy = y0, oz = sz + dirZ * a;
      for (let rides = 0; ; rides++) {
        const ex = x1 - ox, ey = y1 - oy, ez = z1 - oz;
        const span = Math.hypot(ex, ey, ez);
        if (!(span > 1e-9)) break;
        o[0] = ox; o[1] = oy; o[2] = oz;
        d[0] = ex / span; d[1] = ey / span; d[2] = ez / span;
        collider.raycastHit(o, d, span, null, hit);
        if (!(hit.dist <= span)) break;
        const hx = ox + d[0] * hit.dist, hy = oy + d[1] * hit.dist, hz = oz + d[2] * hit.dist;
        const along = (hx - sx) * dirX + (hz - sz) * dirZ;
        if (Math.abs(hit.normal[1]) < WALKABLE_NY) return along;
        if (rides >= FEELER_RIDES || along + RIDE_NUDGE >= b) break;
        if (hit.normal[1] > 0) {
          oy = hy + height;
          if (y1 < oy) y1 = oy;
          ox = hx + dirX * RIDE_NUDGE; oz = hz + dirZ * RIDE_NUDGE;
        } else {
          ox = hx + d[0] * RIDE_NUDGE; oy = hy + d[1] * RIDE_NUDGE; oz = hz + d[2] * RIDE_NUDGE;
        }
      }
      a = b; y0 = y1;
    }
    return Infinity;
  };
}
