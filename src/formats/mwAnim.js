
import { deref, KEY_TYPE } from './mwNifFile.js';
import { allWeaponShortGroups } from './mwFirstPerson.js';
import { segment, sampleKeyGroup } from './mwKeys.js';

export function collectTextKeys(nif) {
  const keys = [];
  for (const rec of nif.records) {
    if (rec.type === 'NiTextKeyExtraData') keys.push(...rec.keys);
  }
  return keys.slice().sort((a, b) => a.time - b.time);
}

/** @returns {Map<string, {start:number, stop:number, loopStart:number|null, loopStop:number|null}>} */
export function parseAnimGroups(textKeys) {
  const groups = new Map();
  for (const { time, text } of textKeys) {
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([^:]+?)\s*:\s*(.+?)\s*$/.exec(line);
      if (!m) continue;
      const name = m[1];
      const marker = m[2].toLowerCase();
      let g = groups.get(name);
      if (!g) {
        g = { start: null, stop: null, loopStart: null, loopStop: null, markers: new Map() };
        groups.set(name, g);
      }
      g.markers.set(marker, time);
      if (marker === 'start') g.start = time;
      else if (marker === 'stop') g.stop = time;
      else if (marker === 'loop start') g.loopStart = time;
      else if (marker === 'loop stop') g.loopStop = time;
    }
  }
  for (const [name, g] of groups) {
    if (g.start == null || g.stop == null) groups.delete(name);
  }
  return groups;
}

export function findAnimGroup(groups, name) {
  if (!groups || !name) return null;
  const direct = groups.get(name);
  if (direct) return direct;
  const want = String(name).toLowerCase();
  for (const [key, g] of groups) if (key.toLowerCase() === want) return g;
  return null;
}

export function trackFromController(nif, ctrl) {
  const data = deref(nif, ctrl.data);
  if (!data || data.type !== 'NiKeyframeData') return null;
  return {
    startTime: ctrl.startTime,
    stopTime: ctrl.stopTime,
    frequency: ctrl.frequency,
    phase: ctrl.phase,
    rotationType: data.rotationType,
    axisOrder: data.axisOrder ?? 0,
    rotationKeys: data.rotationKeys,
    xyzRotations: data.xyzRotations,
    translations: data.translations,
    scales: data.scales,
  };
}

/** @returns {Map<string, object>} */
export function extractTracks(nif) {
  const tracks = new Map();
  const helper = nif.roots.map((r) => deref(nif, r)).find(
    (r) => r && r.type === 'NiSequenceStreamHelper',
  );
  if (helper) {
    const names = [];
    for (let e = deref(nif, helper.extra); e; e = deref(nif, e.next)) {
      if (e.type === 'NiStringExtraData') names.push(e.string);
    }
    let i = 0;
    for (let c = deref(nif, helper.controller); c; c = deref(nif, c.next)) {
      if (c.type !== 'NiKeyframeController') continue;
      const name = names[i++];
      const track = trackFromController(nif, c);
      if (name && track) tracks.set(name.toLowerCase(), track);
    }
    return tracks;
  }
  for (const rec of nif.records) {
    if (!rec.name || rec.controller == null || rec.controller < 0) continue;
    for (let c = deref(nif, rec.controller); c; c = deref(nif, c.next)) {
      if (c.type === 'NiKeyframeController') {
        const track = trackFromController(nif, c);
        if (track) tracks.set(rec.name.toLowerCase(), track);
        break;
      }
    }
  }
  return tracks;
}

function slerp(a, b, u) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bw = b;
  if (dot < 0) {
    bw = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    const out = [
      a[0] + u * (bw[0] - a[0]),
      a[1] + u * (bw[1] - a[1]),
      a[2] + u * (bw[2] - a[2]),
      a[3] + u * (bw[3] - a[3]),
    ];
    const n = Math.hypot(...out);
    return out.map((v) => v / n);
  }
  const theta = Math.acos(dot);
  const s = Math.sin(theta);
  const wa = Math.sin((1 - u) * theta) / s;
  const wb = Math.sin(u * theta) / s;
  return [
    wa * a[0] + wb * bw[0],
    wa * a[1] + wb * bw[1],
    wa * a[2] + wb * bw[2],
    wa * a[3] + wb * bw[3],
  ];
}

function axisQuat(axis, angle) {
  const h = angle / 2;
  const s = Math.sin(h);
  const q = [Math.cos(h), 0, 0, 0];
  q[1 + axis] = s;
  return q;
}

function quatMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

const AXIS_ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 2, 0],
  [1, 0, 2],
  [2, 0, 1],
  [2, 1, 0],
  [0, 1, 0],
  [1, 2, 1],
  [2, 0, 2],
];

function sampleRotation(track, time) {
  if (track.rotationType === KEY_TYPE.xyz) {
    const [gx, gy, gz] = track.xyzRotations;
    const angles = [
      sampleKeyGroup(gx, 1, time) ?? 0,
      sampleKeyGroup(gy, 1, time) ?? 0,
      sampleKeyGroup(gz, 1, time) ?? 0,
    ];
    const order = AXIS_ORDERS[track.axisOrder ?? 0] ?? AXIS_ORDERS[0];
    let q = axisQuat(order[0], angles[order[0]]);
    q = quatMul(axisQuat(order[1], angles[order[1]]), q);
    q = quatMul(axisQuat(order[2], angles[order[2]]), q);
    return q;
  }
  const keys = track.rotationKeys;
  if (!keys || !keys.length) return null;
  const [i0, i1, u] = segment(keys, time);
  if (i0 === i1) return keys[i0].value.slice();
  // Quaternion keys either take the nearer key (constant) or slerp. The reference has no quadratic or TCB
  // quaternion interpolation.
  if (track.rotationType === KEY_TYPE.constant) {
    return (u > 0.5 ? keys[i1] : keys[i0]).value.slice();
  }
  return slerp(keys[i0].value, keys[i1].value, u);
}

/** @returns {{rotation:number[]|null, translation:number[]|null, scale:number|null}} */
export function sampleTrack(track, time) {
  return {
    rotation: sampleRotation(track, time),
    translation: sampleKeyGroup(track.translations, 3, time),
    scale: sampleKeyGroup(track.scales, 1, time),
  };
}

export function asciiLower(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
}

// Splits on each CR or LF character, so a CRLF blob yields empty pieces that are dropped after the split. Every
// piece keeps the key's time, and duplicate times are valid.
export function normalizeTextKeys(textKeys) {
  const out = [];
  for (const { time, text } of textKeys ?? []) {
    for (const piece of String(text ?? '').split(/[\r\n]/)) {
      const line = asciiLower(piece.trim());
      if (line) out.push({ time, text: line });
    }
  }
  return out;
}

export function textKeyGroup(text) {
  const s = String(text ?? '');
  const at = s.indexOf(': ');
  return at < 0 ? null : s.slice(0, at);
}

export function clipGroups(keys) {
  const set = new Set();
  for (const k of keys ?? []) {
    const g = textKeyGroup(k.text);
    if (g) set.add(g);
  }
  return [...set].sort();
}

// A forward prefix match where the first hit wins. Returns -1 when missing, not null, because callers compare and
// do arithmetic on the result.
export function getTextKeyTime(keys, textKey) {
  const want = String(textKey ?? '');
  for (const k of keys ?? []) if (k.text.startsWith(want)) return k.time;
  return -1;
}

// Takes the last start and loop stop keys in a reverse scan, as the reference does, and counts only horizontal
// travel, since Morrowind z is vertical.
export function animVelocity(keys, track, group) {
  if (!keys || !keys.length || !track) return 0;
  const g = String(group || '').toLowerCase();
  let starttime = null;
  let stoptime = null;
  for (let i = keys.length - 1; i >= 0; i--) {
    const t = keys[i].text;
    if (t === `${g}: start` || t === `${g}: loop start`) { starttime = keys[i].time; break; }
  }
  for (let i = keys.length - 1; i >= 0; i--) {
    const t = keys[i].text;
    if (t === `${g}: stop`) stoptime = keys[i].time;
    else if (t === `${g}: loop stop`) { stoptime = keys[i].time; break; }
  }
  if (starttime == null || stoptime == null || !(stoptime > starttime)) return 0;
  const a = track.translations ? sampleKeyGroup(track.translations, 3, starttime) : null;
  const b = track.translations ? sampleKeyGroup(track.translations, 3, stoptime) : null;
  if (!a || !b) return 0;
  return Math.hypot(a[0] - b[0], a[1] - b[1]) / (stoptime - starttime);
}

export const LOOPING_ANIMATIONS = Object.freeze([
  'walkforward', 'walkback', 'walkleft', 'walkright',
  'swimwalkforward', 'swimwalkback', 'swimwalkleft', 'swimwalkright',
  'runforward', 'runback', 'runleft', 'runright',
  'swimrunforward', 'swimrunback', 'swimrunleft', 'swimrunright',
  'sneakforward', 'sneakback', 'sneakleft', 'sneakright',
  'turnleft', 'turnright', 'swimturnleft', 'swimturnright',
  'spellturnleft', 'spellturnright', 'torch',
  'idle', 'idle2', 'idle3', 'idle4', 'idle5', 'idle6', 'idle7',
  'idle8', 'idle9', 'idlesneak', 'idlestorm', 'idleswim', 'jump',
  'inventoryhandtohand', 'inventoryweapononehand', 'inventoryweapontwohand',
  'inventoryweapontwowide',
]);
const LOOPING_SET = new Set(LOOPING_ANIMATIONS);

// The longest weapon short-group suffix is stripped, so 'bow' never wins over 'crossbow'.
export function isLoopingAnimation(keys, group) {
  const g = asciiLower(String(group ?? ''));
  if (getTextKeyTime(keys, `${g}: loop start`) >= 0) return true;
  let suffixLength = 0;
  for (const suffix of allWeaponShortGroups()) {
    if (suffix.length > suffixLength && g.endsWith(suffix)) suffixLength = suffix.length;
  }
  return LOOPING_SET.has(suffixLength ? g.slice(0, g.length - suffixLength) : g);
}

export function getStartTime(keys, group) {
  const g = asciiLower(String(group ?? ''));
  for (const k of keys ?? []) {
    if (k.text.startsWith(g) && k.text.slice(g.length, g.length + 2) === ': ') return k.time;
  }
  return -1;
}

const equalsParts = (s, ...parts) => s === parts.join('');

/**
 * Scans backwards from the last key of the group, so a later block of the same group wins. Refuses when a key is
 * missing or start is after stop, instead of guessing a range.
 * @returns {{ok:false, reason:string} | {ok:true, ...ClipState}}
 */
export function resetClip(keys, group, opts = {}) {
  const {
    loopFallback = false, startPoint = 0,
    loopCount = Infinity, loopingEnabled = true, start = 'start', stop = 'stop',
  } = opts;
  const g = asciiLower(String(group ?? ''));
  const list = keys ?? [];
  if (!g) return { ok: false, reason: 'no group name given' };

  let groupend = -1;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].text.startsWith(g) && list[i].text.slice(g.length, g.length + 2) === ': ') {
      groupend = i; break;
    }
  }
  if (groupend < 0) return { ok: false, reason: `no key of group "${g}" - the file names no such animation` };

  let startAt = -1;
  for (let i = groupend; i >= 0; i--) {
    if (equalsParts(list[i].text, g, ': ', start)) { startAt = i; break; }
  }
  if (startAt < 0 && start === 'loop start') {
    for (let i = groupend; i >= 0; i--) {
      if (equalsParts(list[i].text, g, ': start')) { startAt = i; break; }
    }
  }
  if (startAt < 0) return { ok: false, reason: `group "${g}" has no "${g}: ${start}" key` };

  // Only the first group + ': ' + stop characters are compared, so a trailing period such as 'idle3: stop.' still
  // matches.
  const checkLength = g.length + 2 + stop.length;
  let stopAt = -1;
  for (let i = groupend; i >= 0; i--) {
    if (equalsParts(list[i].text.slice(0, checkLength), g, ': ', stop)) { stopAt = i; break; }
  }
  if (stopAt < 0) return { ok: false, reason: `group "${g}" has no "${g}: ${stop}" key` };

  const startTime = list[startAt].time;
  const stopTime = list[stopAt].time;
  if (startTime > stopTime) {
    return { ok: false, reason: `group "${g}" starts at ${startTime} and stops at ${stopTime}` };
  }

  const state = {
    ok: true,
    group: g,
    startTime,
    stopTime,
    loopStartTime: startTime,
    loopStopTime: loopFallback ? stopTime : Infinity,
    time: startTime + (stopTime - startTime) * startPoint,
    playing: true,
    loopCount,
    loopingEnabled,
    nextKey: 0,
  };

  // The scan stops at the start key, so loop keys from an earlier block of the same group do not leak in.
  for (let i = groupend; i > startAt; i--) {
    const k = list[i];
    if (k.time > state.time) continue;
    if (equalsParts(k.text, g, ': loop start')) state.loopStartTime = k.time;
    else if (equalsParts(k.text, g, ': loop stop')) state.loopStopTime = k.time;
  }
  state.nextKey = lowerBound(list, state.time);
  return state;
}

function lowerBound(keys, time) {
  let i = 0;
  while (i < keys.length && keys[i].time < time) i++;
  return i;
}

// Without `loopFallback` and with no loop stop key, `loopStopTime` is Infinity, so the clip plays once.
export function shouldLoop(state) {
  return !!state && state.time >= state.loopStopTime
    && state.loopingEnabled && state.loopCount > 0;
}

// Steps land on each text key and fire `onKey` for every key crossed. The second `shouldLoop` check is not an else,
// since it must run in the same pass that stopped the clip.
export function advanceClip(state, keys, dt, onKey = null) {
  const list = keys ?? [];
  let timepassed = dt;
  // `onKey` receives every key crossed plus a flag for this group. The listener decides, and sound keys fire even
  // for another group.
  const fireTo = () => {
    while (state.nextKey < list.length && list[state.nextKey].time <= state.time) {
      const k = list[state.nextKey++];
      if (equalsParts(k.text, state.group, ': loop start')) state.loopStartTime = k.time;
      else if (equalsParts(k.text, state.group, ': loop stop')) state.loopStopTime = k.time;
      if (onKey) onKey(k.text, k.time, textKeyGroup(k.text) === state.group);
    }
  };
  while (state.playing) {
    if (!shouldLoop(state)) {
      const target = state.time + timepassed;
      const next = list[state.nextKey];
      state.time = !next || next.time > target ? Math.min(target, state.stopTime) : next.time;
      state.playing = state.time < state.stopTime;
      timepassed = target - state.time;
      fireTo();
    }
    if (shouldLoop(state)) {
      state.loopCount--;
      state.time = state.loopStartTime;
      state.playing = true;
      // After a wrap only the keys sitting exactly on the loop start time fire again, not the clip's intro keys.
      state.nextKey = lowerBound(list, state.time);
      fireTo();
      if (state.time >= state.loopStopTime) break;
    }
    if (timepassed <= 0) break;
  }
  return state;
}
