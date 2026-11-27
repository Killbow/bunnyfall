// @ts-check
// Every value here is pure over the fight state and the relay clock, so every client draws the same arena. Results
// go into reused module records and lists, so callers must copy anything they keep past the next call.
import { SD_ARENA, SD_REALM_ORIGIN } from '../net/sdBrain.js';
import { SD_BLOWS, SD_REM, SD_ECHO } from '../net/sdRemnant.js';
import { markShape } from '../render/gateTelegraph.js';
import { sdPillarDials, pillarCentre } from '../world/sdPillarModel.js';
import { SD_REMNANT_BODY, remnantScale } from '../world/sdRemnantModel.js';
import { sdTick } from '../world/sdLook.js';
import { remnantPose, echoPose, SD_HEART_LIGHT, SD_KNEEL_M } from './sdRemnant.js';
import { SD_BLOW_COLOR } from './sdRemnantBlows.js';
import { clearOfPillars } from './sdSpoils.js';

export const SD_WATCH_LAG_S = 1;
export const SD_WATCH_HOME_Y = 1.6;
export const SD_RESET_DIM = Object.freeze({ to: 0.4, inMs: 1500, outMs: 400 });
export const SD_MARK_COLOR = Object.freeze({ remnant: SD_BLOW_COLOR.stomp, echoes: SD_HEART_LIGHT.echo });

const RESET = SD_BLOWS.reset, RESET_ID = RESET.id, RESET_WINDUP = RESET.windup, TAU = Math.PI * 2;
const DIM_TO = SD_RESET_DIM.to, DIM_IN = SD_RESET_DIM.inMs, DIM_OUT = SD_RESET_DIM.outMs;
const ECHO_SCALE = remnantScale(true);
const AX = SD_REALM_ORIGIN[0] + SD_ARENA.x, AY = SD_REALM_ORIGIN[1], AZ = SD_REALM_ORIGIN[2] + SD_ARENA.z;
const _pose = { x: 0, z: 0, yw: 0, sink: 0, shown: false };
const _at = new Float64Array(3), _home = new Float64Array(3);
let _homeOf = NaN;
const PILLARS = [0, 1, 2, 3].map((k) => { const [x, z] = pillarCentre(k); return [x - SD_ARENA.x, z - SD_ARENA.z]; });

const _watch = { how: 0, one: new Float64Array(3), echo: new Float64Array(6), up: new Uint8Array(2) };
function watchAt(s, tau) {
  const W = _watch;
  if (s.fi > 0 && s.fell && !s.lost) {
    if (s.fell.at !== _homeOf) { _homeOf = s.fell.at; const [x, z] = clearOfPillars(s.rem.x, s.rem.z); _home[0] = AX + x; _home[1] = AY + SD_WATCH_HOME_Y; _home[2] = AZ + z; }
    W.one[0] = _home[0]; W.one[1] = _home[1]; W.one[2] = _home[2]; W.how = 1;
    return W;
  }
  const p = remnantPose(s, tau, _pose);
  if (p.shown) { W.one[0] = AX + p.x; W.one[1] = AY + SD_REMNANT_BODY.heartY - p.sink; W.one[2] = AZ + p.z; W.how = 1; return W; }
  W.how = 0;
  for (let e = 0; e < 2; e++) {
    const q = echoPose(s, e, tau, _pose);
    W.up[e] = q.shown ? 1 : 0;
    if (!q.shown) continue;
    W.echo[3 * e] = AX + q.x; W.echo[3 * e + 1] = AY + SD_REMNANT_BODY.heartY * ECHO_SCALE - q.sink; W.echo[3 * e + 2] = AZ + q.z; W.how = 2;
  }
  return W;
}
function watchedBy(W, k, out) {
  if (W.how === 1) { out[0] = W.one[0]; out[1] = W.one[1]; out[2] = W.one[2]; return true; }
  if (W.how === 0) return false;
  const px = AX + PILLARS[k][0], pz = AZ + PILLARS[k][1];
  let best = Infinity, e0 = -1;
  for (let e = 0; e < 2; e++) {
    if (!W.up[e]) continue;
    const dx = W.echo[3 * e] - px, dz = W.echo[3 * e + 2] - pz, d = dx * dx + dz * dz;
    if (d < best) { best = d; e0 = e; }
  }
  out[0] = W.echo[3 * e0]; out[1] = W.echo[3 * e0 + 1]; out[2] = W.echo[3 * e0 + 2];
  return true;
}
export const sdWatchedAt = (s, tau, k, out) => watchedBy(watchAt(s, tau), k, out);
export const handToward = (d, at) => Math.atan2((at[0] - d.at[0]) * d.right[0] + (at[2] - d.at[2]) * d.right[2], at[1] - d.at[1]);

const _a0 = new Float64Array(16), _a1 = new Float64Array(16), _seen0 = new Uint8Array(4), _seen1 = new Uint8Array(4);
let _handsOf = null, _handsSec = NaN;
function handsAt(s, at, a, seen) {
  const D = sdPillarDials(), W = watchAt(s, at);
  for (let k = 0; k < 4; k++) {
    seen[k] = watchedBy(W, k, _at) ? 1 : 0;
    for (let j = 0; j < 4; j++) a[4 * k + j] = seen[k] ? handToward(D[4 * k + j], _at) : 0;
  }
}
export function sdPillarHandsAt(s, t, out) {
  if (!s) { out.fill(0); return out; }
  const sec = Math.floor(t / 1000);
  if (s !== _handsOf || sec !== _handsSec) {
    if (s === _handsOf && SD_WATCH_LAG_S === 1 && sec === _handsSec + 1) { _a0.set(_a1); _seen0.set(_seen1); }
    else handsAt(s, (sec - SD_WATCH_LAG_S) * 1000, _a0, _seen0);
    _handsOf = s; _handsSec = sec;
    handsAt(s, sec * 1000, _a1, _seen1);
  }
  const e = sdTick(t / 1000) - sec;
  for (let i = 0; i < 16; i++) {
    const k = i >> 2, d = _a1[i] - _a0[i], turn = d - TAU * Math.round(d / TAU);
    out[i] = !_seen1[k] ? 0 : !_seen0[k] ? _a1[i] : _a0[i] + turn * e;
  }
  return out;
}

export function sdLampDimInto(s, t, out) {
  out[0] = 1;
  if (!s || !(s.fi > 0) || s.lost || s.fell) return out;
  let u = -1, from = 1, by = 0;
  if (s.su > t && s.stunAt > 0) { if (t - s.stunAt < DIM_OUT) { u = (t - s.stunAt) / DIM_OUT; from = DIM_TO; by = 1 - DIM_TO; } }
  else {
    const atk = s.rem?.atk;
    if (!atk || atk.a !== RESET_ID) return out;
    const at = atk.at, called = at - RESET_WINDUP;
    if (t < called) return out;
    if (t < at) { if (t - called < DIM_IN) { u = (t - called) / DIM_IN; by = DIM_TO - 1; } else { out[0] = DIM_TO; return out; } }
    else if (t - at < DIM_OUT) { u = (t - at) / DIM_OUT; from = DIM_TO; by = 1 - DIM_TO; }
  }
  if (u >= 0) { const v = u > 1 ? 1 : u; out[0] = from + by * v * v * (3 - 2 * v); }
  return out;
}
const _dim = new Float64Array(1);
export const sdLampDimAt = (s, t) => sdLampDimInto(s, t, _dim)[0];

export function sdPillarLookAt(s, t, look, glow = null) {
  sdPillarHandsAt(s, t, look.hands);
  sdLampDimInto(s, t, look.k);
  look.k[1] = glow?.end ? 1 : 0;
  return look;
}
export const sdPillarLook = () => ({ hands: new Float32Array(16), k: Float64Array.of(1, 0) });

const _marks = [markShape([0, 0], 0, SD_MARK_COLOR.remnant, SD_REM.r), markShape([0, 0], 0, SD_MARK_COLOR.echoes[0], SD_ECHO.r), markShape([0, 0], 0, SD_MARK_COLOR.echoes[1], SD_ECHO.r)];
const _picked = [null, null, null], _markLists = [[], [null], [null, null], [null, null, null]];
const onFloor = (p) => p.shown && p.sink <= SD_KNEEL_M + 1e-6;
export function sdArenaMarksAt(s, t) {
  let n = 0;
  if (s && !s.fell && !(s.fi > 0 && s.lost > 0)) {
    const p = remnantPose(s, t, _pose);
    if (onFloor(p)) { const m = _marks[0]; m.origin[0] = p.x; m.origin[1] = p.z; m.yaw = p.yw; _picked[n++] = m; }
    for (let e = 0; e < 2; e++) {
      if (!(s.ec?.[e]?.h > 0)) continue;
      const q = echoPose(s, e, t, _pose);
      if (onFloor(q)) { const m = _marks[1 + e]; m.origin[0] = q.x; m.origin[1] = q.z; m.yaw = q.yw; _picked[n++] = m; }
    }
  }
  const list = _markLists[n];
  for (let i = 0; i < n; i++) list[i] = _picked[i];
  return list;
}
