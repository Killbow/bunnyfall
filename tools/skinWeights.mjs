// Computes per-vertex bone weights for armor meshes at bake time, which tools/nifWrite.mjs writes into the NIF.
// It uses only +, *, /, and sqrt so the bake produces the same bytes on every machine.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.sqrt(dot(a, a)); return [a[0] / l, a[1] / l, a[2] / l]; };

export const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function segmentDistance(p, a, b) {
  const d = sub(b, a);
  const len2 = dot(d, d);
  let t = len2 > 0 ? dot(sub(p, a), d) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = p[0] - a[0] - d[0] * t, y = p[1] - a[1] - d[1] * t, z = p[2] - a[2] - d[2] * t;
  return Math.sqrt(x * x + y * y + z * z);
}

export function weldGroups(positions) {
  const n = positions.length / 3;
  const at = new Map();
  const rep = new Int32Array(n);
  const first = [];
  for (let v = 0; v < n; v++) {
    const k = `${Math.round(positions[v * 3] * 1e4)},${Math.round(positions[v * 3 + 1] * 1e4)},${Math.round(positions[v * 3 + 2] * 1e4)}`;
    let g = at.get(k);
    if (g === undefined) { g = first.length; at.set(k, g); first.push(v); }
    rep[v] = g;
  }
  return { rep, first };
}

export function jointWeights(positions, bones, { hang = null } = {}) {
  if (!bones?.length) throw new Error('no bones to weight to');
  const index = new Map(bones.map((b, i) => [b.name, i]));
  for (const b of bones) if (b.parent && !index.has(b.parent)) throw new Error(`"${b.name}" blends with "${b.parent}", which is not one of the bones`);
  if (hang) for (const n of [hang.root, ...hang.legs, ...(hang.calves ?? [])]) if (!index.has(n)) throw new Error(`the hang names "${n}", which is not one of the bones`);
  if (hang?.calves && !(hang.mode === 'over' && Number.isFinite(hang.knee) && hang.kneeBlend > 0)) throw new Error('a hang with calves hangs over its joints, from a knee height and a blend');
  const axis = bones.map((b) => unit(sub(b.to, b.from)));
  const children = bones.map((b) => bones.flatMap((c, j) => (c.parent === b.name ? [j] : [])));
  const across = (p, c) => { const L = bones[c].blend ?? 1; return smoothstep((dot(sub(p, bones[c].from), axis[c]) + L) / (2 * L)); };
  const over = hang?.mode === 'over';
  if (hang && hang.mode != null && !over) throw new Error(`a hang's mode is 'over' or none, not "${hang.mode}"`);
  const legIndex = over ? new Set([...hang.legs, ...(hang.calves ?? [])].map((n) => index.get(n))) : null;
  for (const b of bones) if (b.reach != null && !(b.reach >= 0 && b.fade > 0)) throw new Error(`"${b.name}" reaches ${b.reach} with no fade past it`);
  const reaches = bones.some((b) => b.reach != null);
  if (reaches && bones.every((b, i) => b.reach != null || legIndex?.has(i))) throw new Error('every bone reaches - nothing claims what they do not');
  const joint1 = (p, bare) => {
    const d = bones.map((b) => segmentDistance(p, b.from, b.to) - (b.bias ?? 0));
    const can = bones.map((b, i) => !legIndex?.has(i) && !(bare && b.reach != null));
    let k = -1;
    for (let i = 0; i < d.length; i++) if (can[i] && (k < 0 || d[i] < d[k])) k = i;
    const b = bones[k];
    if (b.parent && !legIndex?.has(index.get(b.parent))) {
      const L = b.blend ?? 1;
      if (dot(sub(p, b.from), axis[k]) < L) { const w = across(p, k); return [[k, w], [index.get(b.parent), 1 - w]]; }
    }
    let c = -1;
    for (const j of children[k]) {
      if (!can[j]) continue;
      const L = bones[j].blend ?? 1;
      if (dot(sub(p, bones[j].from), axis[j]) > -L && (c < 0 || d[j] < d[c])) c = j;
    }
    if (c >= 0) { const w = across(p, c); return [[c, w], [k, 1 - w]]; }
    return [[k, 1]];
  };
  const joint = (p) => {
    if (!reaches) return joint1(p, false);
    let claim = 0;
    bones.forEach((b) => { if (b.reach != null) claim = Math.max(claim, 1 - smoothstep((segmentDistance(p, b.from, b.to) - b.reach) / b.fade)); });
    if (claim >= 1) return joint1(p, false);
    const bare = joint1(p, true);
    if (claim <= 0) return bare;
    const out = new Map();
    for (const [i, w] of joint1(p, false)) out.set(i, (out.get(i) ?? 0) + w * claim);
    for (const [i, w] of bare) out.set(i, (out.get(i) ?? 0) + w * (1 - claim));
    return [...out];
  };
  const weigh = (p) => {
    if (!hang) return joint(p);
    const legs = smoothstep((hang.top - p[2]) / (hang.top - hang.bottom)) * hang.share;
    const right = smoothstep((p[0] + hang.centre) / (2 * hang.centre));
    const low = hang.calves ? smoothstep((hang.knee + hang.kneeBlend - p[2]) / (2 * hang.kneeBlend)) : 0;
    const shares = [[index.get(hang.legs[0]), legs * (1 - right) * (1 - low)], [index.get(hang.legs[1]), legs * right * (1 - low)],
      ...(hang.calves ? [[index.get(hang.calves[0]), legs * (1 - right) * low], [index.get(hang.calves[1]), legs * right * low]] : [])];
    if (!over) return [[index.get(hang.root), 1 - legs], ...shares];
    return [...joint(p).map(([i, w]) => [i, w * (1 - legs)]), ...shares];
  };
  const { rep, first } = weldGroups(positions);
  const lists = first.map((v) => {
    const kept = weigh([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]).filter(([, w]) => w > 1e-4);
    const sum = kept.reduce((s, [, w]) => s + w, 0);
    return kept.map(([i, w]) => [bones[i].name, w / sum]).sort((x, y) => y[1] - x[1] || index.get(x[0]) - index.get(y[0]));
  });
  return Array.from({ length: positions.length / 3 }, (_, v) => lists[rep[v]]);
}
