// Samples NIF key groups the way OpenMW's ValueInterpolator does, for bone tracks and particle color ramps alike.
// It imports only mwNifFile.js so mwParticles.js stays out of the mwAnim.js and mwFirstPerson.js import cycle.

import { KEY_TYPE } from './mwNifFile.js';

function hermite(v0, out0, v1, in1, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h1 = 2 * t3 - 3 * t2 + 1;
  const h2 = -2 * t3 + 3 * t2;
  const h3 = t3 - 2 * t2 + t;
  const h4 = t3 - t2;
  return h1 * v0 + h2 * v1 + h3 * out0 + h4 * in1;
}

/**
 * Matches OpenMW's generateTCBTangents: end keys use half the neighboring delta, interior keys weight by time span
 * rather than 0.5, and a zero span leaves both tangents at 0.
 * @returns {[number, number]}
 */
function tcbTangents(keys, i, dim, axis) {
  const val = (k) => (dim === 1 ? k.value : k.value[axis]);
  if (keys.length <= 1) return [0, 0];
  const [t, c, b] = keys[i].tbc || [0, 0, 0];
  const A = (1 - t) * (1 - c) * (1 + b);
  const B = (1 - t) * (1 + c) * (1 - b);
  const C = (1 - t) * (1 + c) * (1 + b);
  const D = (1 - t) * (1 - c) * (1 - b);
  if (i === 0 || i === keys.length - 1) {
    const delta = i === 0 ? val(keys[1]) - val(keys[0]) : val(keys[i]) - val(keys[i - 1]);
    return [delta * ((A + B) * 0.5), delta * ((C + D) * 0.5)];
  }
  const prev = keys[i - 1];
  const cur = keys[i];
  const next = keys[i + 1];
  const timeSpan = next.time - prev.time;
  if (timeSpan === 0) return [0, 0];
  const prevDelta = val(cur) - val(prev);
  const nextDelta = val(next) - val(cur);
  return [
    (prevDelta * A + nextDelta * B) * ((cur.time - prev.time) / timeSpan),
    (prevDelta * C + nextDelta * D) * ((next.time - cur.time) / timeSpan),
  ];
}

export function segment(keys, time) {
  if (time <= keys[0].time) return [0, 0, 0];
  const last = keys.length - 1;
  if (time >= keys[last].time) return [last, last, 0];
  let lo = 1;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  const span = keys[i + 1].time - keys[i].time;
  return [i, i + 1, span > 0 ? (time - keys[i].time) / span : 0];
}

export function sampleKeyGroup(group, dim, time) {
  const { keys, type } = group;
  if (!keys.length) return null;
  const [i0, i1, u] = segment(keys, time);
  const k0 = keys[i0];
  const k1 = keys[i1];
  const comp = (axis) => {
    const v0 = dim === 1 ? k0.value : k0.value[axis];
    const v1 = dim === 1 ? k1.value : k1.value[axis];
    if (i0 === i1) return v0;
    // Constant keys switch at the segment midpoint, as OpenMW does, rather than holding the left key.
    if (type === KEY_TYPE.constant) return u > 0.5 ? v1 : v0;
    if (type === KEY_TYPE.quadratic) {
      const out0 = dim === 1 ? k0.outTan : k0.outTan[axis];
      const in1 = dim === 1 ? k1.inTan : k1.inTan[axis];
      return hermite(v0, out0, v1, in1, u);
    }
    if (type === KEY_TYPE.tbc) {
      const [, out0] = tcbTangents(keys, i0, dim, axis);
      const [in1] = tcbTangents(keys, i1, dim, axis);
      return hermite(v0, out0, v1, in1, u);
    }
    return v0 + (v1 - v0) * u;
  };
  if (dim === 1) return comp(0);
  const out = new Array(dim);
  for (let axis = 0; axis < dim; axis++) out[axis] = comp(axis);
  return out;
}
