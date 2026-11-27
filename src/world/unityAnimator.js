// @ts-check

import { quatMultiply, quatAngleAxis } from './quat.js';

const f = Math.fround;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const utf8 = new TextEncoder();
export function pathHash(path) {
  const bytes = utf8.encode(path);
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function sampleComponent(comp, t, clip = null) {
  if ('constant' in comp) return comp.constant;
  if (comp.streamed) {
    const keys = comp.streamed;
    let lo = 0, hi = keys.length - 1, k = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (keys[mid][0] <= t) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    const [t0, a, b, c, d] = keys[k];
    if (a === 0 && b === 0 && c === 0) return d;
    const dt = f(t - t0);
    return f(f(f(f(f(f(a * dt) + b) * dt) + c) * dt) + d);
  }
  const s = comp.dense;
  const rate = clip?.denseRate ?? 0;
  if (!s?.length || !(rate > 0)) return 0;
  const x = (t - (clip?.denseBegin ?? 0)) * rate;
  if (x <= 0) return s[0];
  const i = Math.floor(x);
  if (i >= s.length - 1) return s[s.length - 1];
  const u = x - i;
  return f(s[i] + f(f(s[i + 1] - s[i]) * u));
}

export const clipLength = (clip) => (clip ? Math.max(0, clip.stop - clip.start) : 0);

export function clipTime(clip, normalizedTime) {
  const len = clipLength(clip);
  let u = normalizedTime;
  if (clip.loop) u -= Math.floor(u);
  else u = Math.min(1, Math.max(0, u));
  return clip.start + u * len;
}

export function quatEuler(x, y, z) {
  return quatMultiply(quatAngleAxis(y, [0, 1, 0]), quatMultiply(quatAngleAxis(x, [1, 0, 0]), quatAngleAxis(z, [0, 0, 1])));
}

const ATTR = Object.freeze({ position: 'position', rotation: 'rotation', euler: 'rotation', scale: 'scale' });

export function blendPoses(props, poses, weights) {
  const out = new Array(props.length);
  for (let i = 0; i < props.length; i++) {
    if (props[i].attr === 'rotation') {
      let x = 0, y = 0, z = 0, w = 0, ref = null;
      for (let k = 0; k < poses.length; k++) {
        const wt = weights[k];
        if (!(wt > 0)) continue;
        const q = poses[k][i];
        ref ??= q;
        const s = (ref[0] * q[0] + ref[1] * q[1] + ref[2] * q[2] + ref[3] * q[3]) < 0 ? -wt : wt;
        x += q[0] * s; y += q[1] * s; z += q[2] * s; w += q[3] * s;
      }
      const l = Math.hypot(x, y, z, w);
      out[i] = l > 0 ? [x / l, y / l, z / l, w / l] : [...props[i].def];
    } else {
      const v = [0, 0, 0];
      let any = false;
      for (let k = 0; k < poses.length; k++) {
        const wt = weights[k];
        if (!(wt > 0)) continue;
        const p = poses[k][i];
        v[0] += p[0] * wt; v[1] += p[1] * wt; v[2] += p[2] * wt;
        any = true;
      }
      out[i] = any ? v : [...props[i].def];
    }
  }
  return out;
}

export function weights1D(thresholds, v) {
  const n = thresholds.length;
  const w = new Array(n).fill(0);
  if (n === 0) return w;
  if (n === 1 || v <= thresholds[0]) { w[0] = 1; return w; }
  if (v >= thresholds[n - 1]) { w[n - 1] = 1; return w; }
  for (let i = 0; i < n - 1; i++) {
    const a = thresholds[i], b = thresholds[i + 1];
    if (v >= a && v <= b) {
      const u = b > a ? (v - a) / (b - a) : 0;
      w[i] = 1 - u; w[i + 1] = u;
      return w;
    }
  }
  return w;
}

export function weights2DDirectional(positions, x, y) {
  const n = positions.length;
  const w = new Array(n).fill(0);
  const centre = positions.findIndex((p) => p[0] === 0 && p[1] === 0);
  if (x === 0 && y === 0) {
    if (centre >= 0) { w[centre] = 1; return w; }
    for (let i = 0; i < n; i++) w[i] = 1 / n;
    return w;
  }
  const around = [];
  for (let i = 0; i < n; i++) if (i !== centre) around.push({ i, a: Math.atan2(positions[i][1], positions[i][0]) });
  around.sort((p, q) => p.a - q.a);
  const ang = Math.atan2(y, x);
  let A = null, B = null;
  if (around.length === 1) { A = around[0]; }
  else {
    for (let k = 0; k < around.length; k++) {
      const p = around[k], q = around[(k + 1) % around.length];
      let lo = p.a, hi = q.a;
      if (k === around.length - 1) hi += 2 * Math.PI;
      let t = ang;
      if (t < lo) t += 2 * Math.PI;
      if (t >= lo && t <= hi) { A = p; B = q; break; }
    }
  }
  if (!A) return w;
  if (!B) {
    const pa = positions[A.i];
    const s = Math.max(0, (x * pa[0] + y * pa[1]) / (pa[0] * pa[0] + pa[1] * pa[1]));
    const a = Math.min(1, s);
    w[A.i] = a; if (centre >= 0) w[centre] = 1 - a; else w[A.i] = 1;
    return w;
  }
  const pa = positions[A.i], pb = positions[B.i];
  const det = pa[0] * pb[1] - pa[1] * pb[0];
  let a, b;
  if (Math.abs(det) < 1e-12) { a = 1; b = 0; }
  else { a = (x * pb[1] - y * pb[0]) / det; b = (pa[0] * y - pa[1] * x) / det; }
  a = Math.max(0, a); b = Math.max(0, b);
  const sum = a + b;
  if (sum > 1 || centre < 0) { w[A.i] = a / (sum || 1); w[B.i] = b / (sum || 1); return w; }
  w[A.i] = a; w[B.i] = b; w[centre] = 1 - sum;
  return w;
}

export function resolveController(animation, ref) {
  const override = animation.overrides?.[ref];
  const controller = animation.controllers?.[override ? override.base : ref];
  if (!controller) return null;
  const swap = new Map(override?.clips ?? []);
  const clipOf = (name) => (name == null ? null : animation.clips?.[swap.get(name) ?? name] ?? null);
  return { name: ref, controller, clipOf };
}

function leaves(motion, clipOf, at = 0, out = []) {
  const m = motion?.[at];
  if (!m) return out;
  if (m.clip != null || !m.children?.length) out.push([at, clipOf(m.clip)]);
  else for (const c of m.children) leaves(motion, clipOf, c, out);
  return out;
}

/**
 * @param {import('./prefabNode.js').PrefabNode} node
 * @param {any} component
 * @param {any} animation
 */
export function createAnimator(node, component, animation) {
  const ref = component?.m_Controller?.controller ?? null;
  const resolved = ref != null ? resolveController(animation, ref) : null;
  const layer0 = resolved?.controller.layers?.[0] ?? null;
  if (resolved && component.m_ApplyRootMotion) throw new Error(`${ref}: root motion is not restated`);
  if (resolved && (resolved.controller.layers?.length ?? 0) > 1) throw new Error(`${ref}: one layer is restated`);
  const states = layer0?.states ?? [];
  const stateByName = new Map();
  for (const s of states) { stateByName.set(s.name, s); if (s.fullPath) stateByName.set(s.fullPath, s); }
  const clipOf = resolved?.clipOf ?? (() => null);

  const nodeByHash = new Map();
  for (const n of node.walk()) nodeByHash.set(pathHash(n.pathFrom(node)), n);
  const props = [];
  const propIndex = new Map();
  for (const s of states) {
    for (const [, clip] of leaves(s.motion, clipOf)) {
      for (const cv of clip?.curves ?? []) {
        const target = nodeByHash.get(cv.path);
        const attr = ATTR[cv.attribute];
        if (!target || !attr) continue;
        const key = `${cv.path}:${attr}`;
        if (propIndex.has(key)) continue;
        propIndex.set(key, props.length);
        props.push({ node: target, attr, def: null });
      }
    }
  }

  const params = new Map();
  const resetParams = () => {
    params.clear();
    for (const p of resolved?.controller.params ?? []) params.set(p.name, { type: p.type, value: p.type === 'Bool' || p.type === 'Trigger' ? !!p.default : Number(p.default) });
  };
  resetParams();

  /** @type {any} */
  const a = {
    node, component, controllerName: ref, props,
    _internals: null,
    /** @type {null | { state: any, time: number }} */ current: null,
    /** @type {null | { state: any, time: number }} */ next: null,
    /** @type {null | { duration: number, elapsed: number, snapshot: any[] | null }} */ transition: null,
    /** @type {null | { state: any, duration: number }} */ pending: null,
    bound: false,
    wasEnabled: false,
    lastPose: null,

    GetBool(name) { const p = params.get(name); return p ? !!p.value : false; },
    SetBool(name, v) { const p = params.get(name); if (p) p.value = !!v; },
    GetFloat(name) { const p = params.get(name); return p ? Number(p.value) : 0; },
    SetFloat(name, v) { const p = params.get(name); if (p) p.value = f(v); },
    CrossFade(stateName, normalizedTransitionDuration) {
      const s = stateByName.get(stateName) ?? stateByName.get(`${layer0?.name}.${stateName}`) ?? null;
      if (!s) return;
      a.pending = { state: s, duration: normalizedTransitionDuration };
    },
    Play(stateName, layer = -1, normalizedTime = 0) {
      const s = stateByName.get(stateName) ?? stateByName.get(`${layer0?.name}.${stateName}`) ?? null;
      if (!s) return;
      a.pending = { state: s, duration: 0, play: true, time: normalizedTime };
    },
    get stateName() { return a.current?.state.name ?? layer0?.defaultState ?? null; },
    get nextStateName() { return a.next?.state.name ?? null; },
    get enabled() { return component?.m_Enabled !== 0 && component?.m_Enabled !== false; },
    update(dt) { animatorUpdate(a, dt); },
  };

  const motionLength = (state) => {
    const m = state?.motion;
    if (!m?.length) return 0;
    return treeLength(m, 0);
  };
  const treeLength = (m, at) => {
    const node0 = m[at];
    if (node0.clip != null || !node0.children?.length) return clipLength(clipOf(node0.clip));
    const w = treeWeights(m, at);
    let len = 0;
    node0.children.forEach((c, k) => { if (w[k] > 0) len += w[k] * treeLength(m, c); });
    return len;
  };
  const treeWeights = (m, at) => {
    const node0 = m[at];
    if (node0.type === 1) return weights2DDirectional(node0.positions, a.GetFloat(node0.param), a.GetFloat(node0.paramY));
    return weights1D(node0.thresholds, a.GetFloat(node0.param));
  };
  const clipBinds = new Map();
  const bindsOf = (clip) => {
    let b = clipBinds.get(clip);
    if (!b) {
      const binds = [];
      for (const cv of clip.curves) {
        const i = propIndex.get(`${cv.path}:${ATTR[cv.attribute]}`);
        if (i != null) binds.push(i, cv, cv.attribute === 'euler');
      }
      b = { binds, constant: clip.curves.every((cv) => cv.components.every((c) => 'constant' in c)), pose: null };
      clipBinds.set(clip, b);
    }
    return b;
  };
  const leafPose = (clip, normalizedTime) => {
    if (!clip) return props.map((p) => [...p.def]);
    const b = bindsOf(clip);
    if (b.pose) return b.pose;
    const pose = props.map((p) => [...p.def]);
    const t = clipTime(clip, normalizedTime);
    const binds = b.binds;
    for (let k = 0; k < binds.length; k += 3) {
      const cv = binds[k + 1];
      const v = cv.components.map((c) => sampleComponent(c, t, clip));
      pose[binds[k]] = binds[k + 2] ? quatEuler(v[0], v[1], v[2]) : v;
    }
    if (b.constant) b.pose = pose;
    return pose;
  };
  const treePose = (m, at, normalizedTime) => {
    const node0 = m[at];
    if (node0.clip != null || !node0.children?.length) return leafPose(clipOf(node0.clip), normalizedTime);
    const w = treeWeights(m, at);
    const poses = [], ws = [];
    node0.children.forEach((c, k) => { if (w[k] > 0) { poses.push(treePose(m, c, normalizedTime)); ws.push(w[k]); } });
    return poses.length ? blendPoses(props, poses, ws) : props.map((p) => [...p.def]);
  };
  const statePose = (entry) => (entry.state.motion?.length ? treePose(entry.state.motion, 0, entry.time) : props.map((p) => [...p.def]));
  const leafClips = (m, at = 0, w = 1, out = []) => {
    const node0 = m?.[at];
    if (!node0) return out;
    if (node0.clip != null || !node0.children?.length) { out.push([clipOf(node0.clip), w]); return out; }
    const tw = treeWeights(m, at);
    node0.children.forEach((c, k) => { if (tw[k] > 0) leafClips(m, c, w * tw[k], out); });
    return out;
  };
  const eventsCrossed = (entry, from, to, closedStart) => {
    const out = [];
    if (!(to > from) && !(closedStart && to === from)) return out;
    for (const [clip] of leafClips(entry.state.motion)) {
      const len = clipLength(clip);
      if (!(len > 0) || !clip.events?.length) continue;
      for (const ev of clip.events) {
        const e = (ev.time - clip.start) / len;
        const kMax = clip.loop ? Math.floor(to - e) : 0;
        for (let k = clip.loop ? Math.max(0, Math.ceil(from - e)) : 0; k <= kMax; k++) {
          const at = k + e;
          if (at > to || at < from || (at === from && !closedStart)) continue;
          out.push({ at, ev, clip });
        }
      }
    }
    return out.sort((x, y) => x.at - y.at);
  };
  const speedOf = (state) => (state.speed ?? 1) * (state.speedParam ? a.GetFloat(state.speedParam) : 1);

  const conditionsHold = (t) => (t.conditions ?? []).every((c) => {
    const p = params.get(c.param);
    if (!p) return false;
    switch (c.mode) {
      case 'If': return !!p.value;
      case 'IfNot': return !p.value;
      case 'Greater': return Number(p.value) > c.threshold;
      case 'Less': return Number(p.value) < c.threshold;
      case 'Equals': return Number(p.value) === c.threshold;
      case 'NotEqual': return Number(p.value) !== c.threshold;
      default: return false;
    }
  });
  const exitCrossed = (exit, before, after) => {
    if (exit < 1) {
      let at = Math.floor(before) + exit;
      if (at <= before) at += 1;
      return at <= after;
    }
    return before < exit && exit <= after;
  };

  a._internals = { motionLength, statePose, speedOf, conditionsHold, exitCrossed, stateByName, layer0, resetParams, eventsCrossed };
  return a;
}

function animatorUpdate(a, dt) {
  const on = a.enabled && a.node.activeInHierarchy && a._internals.layer0;
  if (!on) { a.wasEnabled = false; a.pending = null; return; }
  const I = a._internals;
  if (!a.bound) {
    for (const p of a.props) p.def = p.attr === 'position' ? [...p.node.localPosition] : p.attr === 'rotation' ? [...p.node.localRotation] : [...p.node.localScale];
    a.bound = true;
  }
  if (!a.wasEnabled) {
    const def = I.stateByName.get(I.layer0.defaultState) ?? I.layer0.states[0] ?? null;
    a.current = def ? { state: def, time: 0, fresh: true } : null;
    a.next = null; a.transition = null;
    if (a.lastPose) I.resetParams();
    a.wasEnabled = true;
  }
  if (!a.current) return;

  if (a.pending) {
    const { state, duration, play, time } = a.pending;
    a.pending = null;
    const playing = a.transition ? a.next.state : a.current.state;
    if (play) { a.current = { state, time: time ?? 0, fresh: true }; a.next = null; a.transition = null; }
    else if (state !== playing) {
      const srcLen = I.motionLength(a.current.state);
      const snapshot = a.transition ? (a.lastPose ?? I.statePose(a.current)) : null;
      a.next = { state, time: 0, fresh: true };
      a.transition = { duration: duration * srcLen, elapsed: 0, snapshot };
    }
  }

  const advance = (entry) => {
    const len = I.motionLength(entry.state);
    const before = entry.time;
    entry.time += len > 0 ? (dt * I.speedOf(entry.state)) / len : 0;
    return before;
  };
  const before = advance(a.current);
  const nextBefore = a.next ? advance(a.next) : null;
  const fired = [[a.current, before], ...(a.next ? [[a.next, nextBefore]] : [])];
  for (const [entry, from] of fired) {
    const crossed = I.eventsCrossed(entry, from, entry.time, !!entry.fresh);
    entry.fresh = false;
    for (const { ev } of crossed) for (const comp of a.node.components ?? []) if (typeof comp?.[ev.functionName] === 'function') comp[ev.functionName](ev);
  }

  if (a.transition) {
    a.transition.elapsed += dt;
    if (a.transition.elapsed >= a.transition.duration) { a.current = a.next; a.next = null; a.transition = null; }
  } else {
    for (const t of a.current.state.transitions ?? []) {
      if (!I.conditionsHold(t)) continue;
      if (t.hasExitTime && !I.exitCrossed(t.exitTime, before, a.current.time)) continue;
      const to = I.stateByName.get(t.to);
      if (!to) continue;
      const srcLen = I.motionLength(a.current.state);
      a.next = { state: to, time: t.offset ?? 0, fresh: true };
      a.transition = { duration: t.hasFixedDuration ? t.duration : t.duration * srcLen, elapsed: 0, snapshot: null };
      if (!(a.transition.duration > 0)) { a.current = a.next; a.next = null; a.transition = null; }
      break;
    }
  }

  let pose = I.statePose(a.current);
  if (a.transition) {
    const w = Math.min(1, a.transition.elapsed / a.transition.duration);
    const src = a.transition.snapshot ?? pose;
    pose = blendPoses(a.props, [src, I.statePose(a.next)], [1 - w, w]);
  }
  a.lastPose = pose;
  a.props.forEach((p, i) => {
    if (p.attr === 'position') p.node.localPosition = [...pose[i]];
    else if (p.attr === 'rotation') p.node.localRotation = [...pose[i]];
    else p.node.localScale = [...pose[i]];
  });
}
