// Bakes an authored hero fragment FBX into its rule record and its mesh; marker objects are named by their role.
// Run: node tools/fragBake.mjs --list <in.fbx> to print how the bake reads each object.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFbx, nodeAt, childNamed, property70 } from './fbxRead.mjs';
import { layerReader, cornerWelder } from './fbxMesh.mjs';
import { sceneObjects, assertBlenderFill, fillFace, round4 } from './shipBake.mjs';
import { isMain } from './lib/isMain.mjs';
import { EG_FRAGS, EG_HAZARDS, EG_HAZARD_SHAPES, EG_FRAG_ANCHORS, EG_FRAG_LIGHTS, EG_FRAG_SEALS, EG_ALCOVE_HOLDS, EG_FRAG_V, EG_FRAG_SOCKET_TOL_CM, EG_SLAG_LANE_CM, egFragArea2, egFragInPoly, egFragRecordFault, egFragSteps, egFragSwept, egFragHazardPlan } from '../src/net/eliteGates/egFragLaw.js';
import { EG_STEP } from '../src/net/eliteGates/egLaw.js';
import { egSpanProof, egRoadCross, EG_DRUM_MPS, EG_MOON_EVERY_S, EG_SLAG_CYCLE_S } from '../src/net/eliteGates/egSpanLaw.js';
import { EG_DRESS } from '../src/world/eliteGates/egBandArt.js';

export const FRAG_REF_WRITER = 'daggerfall-js-source tools/egRefFragScene.mjs';
export const FRAG_MARKERS = Object.freeze(['floor', 'ramp', 'ceil', 'open', 'socket', 'node', 'edge', 'anchor', 'hazard', 'course', 'alcove', 'light', 'collider']);
export const FRAG_COURSE_CLOCK = Object.freeze({
  drift: { need: ['amp', 'per'], may: ['ph'] }, rail: { need: ['amp', 'per'], may: ['ph'] }, pend: { need: ['per'], may: ['ph'] }, vent: { need: ['per'], may: ['ph'] },
  gust: { need: ['per'], may: ['ph'] }, drum: { need: ['amp'], may: ['ph'] }, moon: { need: [], may: ['ph', 'beat'] }, beat: { need: [], may: ['beat'] }, slag: { need: [], may: ['ph'] },
});
export const FRAG_ROUND_CM = 10;

const LABEL = /^[A-Za-z0-9_-]+$/;
const BLENDER_COPY = /\.\d{3}$/;
// Rounds half away from zero, since Math.round(-350.5) rounds up, and never returns -0.
const cm = (m) => Math.sign(m) * Math.round(Math.abs(m) * 100) + 0;
const round6 = (v) => Math.round(v * 1e6) / 1e6 + 0;

export function assertFragSource(tree) {
  const info = nodeAt(tree.nodes, 'FBXHeaderExtension', 'SceneInfo');
  const names = ['Original', 'LastSaved'].map((at) => String((info && property70(info, `${at}|ApplicationName`)?.[0]) ?? ''));
  if (names.every((n) => n === FRAG_REF_WRITER)) return 'port';
  assertBlenderFill(tree);
  return 'blender';
}

export function fragMarker(name) {
  const t = name.replace(BLENDER_COPY, '').split('.');
  if (!FRAG_MARKERS.includes(t[0])) return null;
  const bad = (why) => { throw new Error(`${name}: ${why} - see the marker names in tools/fragBake.mjs`); };
  const label = (s) => (s !== undefined && LABEL.test(s) ? s : bad(`"${s ?? ''}" is no label (letters, digits, _ and -)`));
  const only = (n) => { if (t.length !== n) bad(`a ${t[0]} marker is ${n} words`); };
  const of = (list) => (list.includes(t[1]) ? t[1] : bad(`"${t[1] ?? ''}" is not one of ${list.join(', ')}`));
  const words = (from, may) => {
    const o = {};
    for (const w of t.slice(from)) {
      const m = /^(amp|per|ph|beat)(\d+)$/.exec(w);
      if (!m || !may.includes(m[1])) bad(may.length ? `"${w}" is not one of ${may.map((k) => `${k}<n>`).join(', ')}` : `"${w}": a ${t[1]} says no clock words`);
      if (m[1] in o) bad(`"${m[1]}" said twice`);
      o[m[1]] = Number(m[2]);
    }
    return o;
  };
  switch (t[0]) {
    case 'floor':
      if (t[1] === 'fight') { only(3); return { kind: 'floor', fight: 1, label: label(t[2]) }; }
      only(2); return { kind: 'floor', fight: 0, label: label(t[1]) };
    case 'socket':
      if (t[1] === 'in') { only(2); return { kind: 'socket', out: 0, label: 'in' }; }
      if (t[1] !== 'out') bad('a socket is socket.in or socket.out.<label>');
      only(3); return { kind: 'socket', out: 1, label: label(t[2]) };
    case 'anchor': only(3); return { kind: 'anchor', of: of(EG_FRAG_ANCHORS), label: label(t[2]) };
    case 'light': only(3); return { kind: 'light', of: of(EG_FRAG_LIGHTS), label: label(t[2]) };
    case 'alcove': {
      only(4);
      const seal = of(EG_FRAG_SEALS);
      return { kind: 'alcove', seal, holds: EG_ALCOVE_HOLDS.includes(t[2]) ? t[2] : bad(`"${t[2] ?? ''}" is not one of ${EG_ALCOVE_HOLDS.join(', ')}`), label: label(t[3]) };
    }
    case 'hazard': {
      const k = of(Object.keys(EG_HAZARDS));
      const clock = words(3, ['per', 'ph']);
      if (EG_HAZARD_SHAPES[k] === 'path' && !('per' in clock)) bad(`a ${k} says its cycle (per<ms>)`);
      return { kind: 'hazard', of: k, label: label(t[2]), clock };
    }
    case 'course': {
      const k = of(Object.keys(EG_STEP));
      const c = FRAG_COURSE_CLOCK[k] ?? { need: [], may: [] };
      const clock = words(3, [...c.need, ...c.may]);
      for (const w of c.need) if (!(w in clock)) bad(`a ${k} says its ${w}<n>`);
      return { kind: 'course', of: k, label: label(t[2]), clock };
    }
    default: only(2); return { kind: t[0], label: label(t[1]) };
  }
}

const cmPoints = (o, toFrag) => o.scene.map((p) => toFrag(p).map(cm));
function extentOf(pts) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p[k]); b[k + 3] = Math.max(b[k + 3], p[k]); }
  return b;
}
const snapped = (b, k) => [Math.round((b[k] + b[k + 3]) / 2), 2 * Math.round((b[k + 3] - b[k]) / 2)];

function islandsOf(o, pts) {
  const key = (vi) => pts[vi].join(',');
  const parent = o.polygons.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const first = new Map();
  o.polygons.forEach((poly, f) => { for (const vi of poly) { const k = key(vi); if (first.has(k)) { const a = find(first.get(k)), b = find(f); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); } else first.set(k, f); } });
  const groups = new Map();
  o.polygons.forEach((_, f) => { const r = find(f); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });
  return [...groups.values()];
}

function outlineOf(o, pts, faces = o.polygons.map((_, i) => i)) {
  const key = (vi) => pts[vi].join(',');
  const count = new Map(), at = new Map();
  for (const f of faces) {
    const poly = o.polygons[f];
    for (let j = 0; j < poly.length; j++) {
      const a = key(poly[j]), b = key(poly[(j + 1) % poly.length]);
      if (a === b) continue;
      at.set(a, pts[poly[j]]);
      const e = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(e, (count.get(e) ?? 0) + 1);
    }
  }
  const next = new Map();
  for (const [e, n] of count) {
    if (n !== 1) continue;
    const [a, b] = e.split('|');
    for (const [u, v] of [[a, b], [b, a]]) { if (!next.has(u)) next.set(u, []); next.get(u).push(v); }
  }
  if (!next.size) throw new Error(`${o.name}: no outline`);
  for (const [u, vs] of next) if (vs.length !== 2) throw new Error(`${o.name}: not one outline (a corner at ${u} cm meets ${vs.length} edges of it) - one marker, one outline, no hole`);
  const start = [...next.keys()].sort()[0];
  const loop = [start];
  for (let prev = null, cur = start; ;) {
    const nx = next.get(cur).find((v) => v !== prev && (loop.length > 1 || v === next.get(cur).slice().sort()[0]));
    if (nx === start) break;
    if (loop.includes(nx)) throw new Error(`${o.name}: not one outline`);
    loop.push(nx); prev = cur; cur = nx;
  }
  if (loop.length !== next.size) throw new Error(`${o.name}: not one outline (${next.size - loop.length} corners in another loop) - one marker, one outline, no hole`);
  let ring = loop.map((k) => at.get(k));
  if (egFragArea2(ring.map((p) => [p[0], p[2]])) < 0) ring.reverse();
  for (let changed = true; changed && ring.length > 3;) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      if (u[1] * v[2] - u[2] * v[1] === 0 && u[2] * v[0] - u[0] * v[2] === 0 && u[0] * v[1] - u[1] * v[0] === 0) { ring.splice(i, 1); changed = true; break; }
    }
  }
  return ring;
}
function flatY(o, ring) {
  const ys = ring.map((p) => p[1]);
  if (Math.max(...ys) - Math.min(...ys) > 1) throw new Error(`${o.name}: not flat (its corners stand ${Math.min(...ys)} to ${Math.max(...ys)} cm)`);
  return Math.min(...ys);
}
function rectangleOf(o, ring) {
  if (ring.length !== 4) throw new Error(`${o.name}: not a rectangle (${ring.length} corners)`);
  const len = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);
  const e = [0, 1, 2, 3].map((i) => [ring[(i + 1) % 4][0] - ring[i][0], ring[(i + 1) % 4][2] - ring[i][2]]);
  const L = e.map((v) => Math.hypot(v[0], v[1]));
  if (Math.abs(e[0][0] * e[1][0] + e[0][1] * e[1][1]) > (0.02 + 1.5 / Math.min(L[0], L[1])) * L[0] * L[1] || Math.abs(L[0] - L[2]) > 2 || Math.abs(L[1] - L[3]) > 2) throw new Error(`${o.name}: not a rectangle`);
  const alongFirst = L[0] < L[1];
  const [s0, s1] = alongFirst ? [[ring[0], ring[1]], [ring[2], ring[3]]] : [[ring[1], ring[2]], [ring[3], ring[0]]];
  const mid = (a, b) => [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), Math.round((a[2] + b[2]) / 2)];
  let [a, b] = [mid(...s0), mid(...s1)];
  if (b[2] < a[2] || (b[2] === a[2] && b[0] < a[0])) [a, b] = [b, a];
  return { line: [a[0], a[2], b[0], b[2]], w: Math.round(len(...s0)), ya: a[1], yb: b[1] };
}
function discOf(o, pts, faces) {
  const b = extentOf(faces.flatMap((f) => o.polygons[f].map((vi) => pts[vi])));
  if (Math.abs((b[3] - b[0]) - (b[5] - b[2])) > FRAG_ROUND_CM) throw new Error(`${o.name}: not a disc (${b[3] - b[0]} by ${b[5] - b[2]} cm)`);
  return { x: Math.round((b[0] + b[3]) / 2), z: Math.round((b[2] + b[5]) / 2), r: Math.round(Math.max(b[3] - b[0], b[5] - b[2]) / 2), y: b[1] };
}
function laneOf(r) {
  const [ax, az, bx, bz] = r.line, len = Math.hypot(bx - ax, bz - az), k = len > r.w ? r.w / 2 / len : 0.5;
  return [Math.round(ax + (bx - ax) * k), Math.round(az + (bz - az) * k), Math.round(bx - (bx - ax) * k), Math.round(bz - (bz - az) * k)];
}
function oneSize(o, sizes) {
  if (Math.max(...sizes) - Math.min(...sizes) > FRAG_ROUND_CM) throw new Error(`${o.name}: its parts are not one size (${sizes.join(', ')} cm)`);
  return Math.max(...sizes);
}

function hazardOf(o, mk, pts) {
  const shape = EG_HAZARD_SHAPES[mk.of];
  const h = { kind: mk.of, x: 0, y: 0, z: 0, w: 0, r: 0, ring: 0, period: mk.clock.per ?? 0, phase: mk.clock.ph ?? 0, sh: null, spots: null, lanes: null, path: null };
  const isles = islandsOf(o, pts);
  const one = () => { if (isles.length !== 1) throw new Error(`${o.name}: a ${mk.of} is one ${shape} (${isles.length} parts)`); return isles[0]; };
  if (shape === 'sh') { const ring = outlineOf(o, pts, one()); const r = rectangleOf(o, ring); h.sh = laneOf(r); h.w = r.w; h.y = flatY(o, ring); }
  else if (shape === 'lanes') {
    const rs = isles.map((f) => { const ring = outlineOf(o, pts, f); return { ...rectangleOf(o, ring), y: flatY(o, ring) }; }).sort((a, b) => (a.line[1] + a.line[3]) - (b.line[1] + b.line[3]) || (a.line[0] + a.line[2]) - (b.line[0] + b.line[2]));
    h.lanes = rs.map(laneOf); h.w = oneSize(o, rs.map((r) => r.w)); h.y = Math.min(...rs.map((r) => r.y));
  } else if (shape === 'spots') {
    const ds = isles.map((f) => discOf(o, pts, f)).sort((a, b) => a.z - b.z || a.x - b.x);
    h.spots = ds.map((d) => [d.x, d.z]); h.r = oneSize(o, ds.map((d) => d.r)); h.y = Math.min(...ds.map((d) => d.y));
  } else if (shape === 'path') {
    const b = extentOf(pts);
    h.path = [Math.round((b[0] + b[3]) / 2), Math.round((b[2] + b[5]) / 2), Math.round((b[3] - b[0]) / 2), Math.round((b[5] - b[2]) / 2)]; h.y = b[1];
  } else if (shape === 'level') h.y = extentOf(pts)[1];
  else { const d = discOf(o, pts, one()); h.x = d.x; h.z = d.z; h.y = d.y; if (shape === 'disc') h.r = d.r; else h.ring = d.r; }
  return h;
}

export function fragPiece(mk, b) {
  const [x, w] = snapped(b, 0), [z, d] = snapped(b, 2), c = mk.clock;
  const piece = { kind: mk.of, x, y: b[4], z, w, d, amp: c.amp ?? 0, period: c.per ?? 0, phase: c.ph ?? 0, beat: c.beat ?? 0, gap: 0, after: 0 };
  if (mk.of === 'drum') piece.period = Math.trunc((4 * piece.amp * 1000) / (EG_DRUM_MPS * 100));
  if (mk.of === 'moon') piece.period = EG_MOON_EVERY_S * 1000;
  if (mk.of === 'slag') { piece.amp = EG_SLAG_LANE_CM; piece.period = EG_SLAG_CYCLE_S * 1000; }
  return piece;
}

/**
 * @param {Uint8Array} fbxBytes
 * @param {{ id: string, kit: string, class: string, variant: string, play: string[], source: string }} spec
 */
export function bakeFrag(fbxBytes, spec, tree = readFbx(fbxBytes), source = spec.source) {
  const writer = assertFragSource(tree);
  const objects = sceneObjects(tree).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const marks = objects.map((o) => ({ o, mk: fragMarker(o.name) }));
  const mouths = marks.filter((m) => m.mk?.kind === 'socket' && !m.mk.out);
  if (mouths.length !== 1) throw new Error(`a fragment has one mouth (socket.in) and this scene has ${mouths.length}`);
  const mb = [0, 1, 2].map((k) => [Math.min(...mouths[0].o.scene.map((p) => p[k])), Math.max(...mouths[0].o.scene.map((p) => p[k]))]);
  const origin = [(mb[0][0] + mb[0][1]) / 2, (mb[1][0] + mb[1][1]) / 2, mb[2][0]];
  const toFrag = (p) => [p[0] - origin[0], p[2] - origin[2], p[1] - origin[1]];
  const F = EG_FRAGS[spec.kit];
  if (!F) throw new Error(`kit ${spec.kit}: no such fragment (net/eliteGates/egFragLaw.js EG_FRAGS)`);

  const by = (kind) => marks.filter((m) => m.mk?.kind === kind).map((m) => ({ ...m, pts: cmPoints(m.o, toFrag) }));
  const socketOf = (m, yaw) => {
    const b = extentOf(m.pts);
    if (b[5] - b[2] > 1) throw new Error(`${m.o.name}: a socket stands upright across the course (it runs ${b[5] - b[2]} cm along it)`);
    const [x, w] = snapped(b, 0);
    return { x, y: b[1], z: Math.round((b[2] + b[5]) / 2), yaw, w, h: b[4] - b[1] };
  };
  const sockets = { in: socketOf(by('socket').find((m) => !m.mk.out), 180), out: by('socket').filter((m) => m.mk.out).map((m) => socketOf(m, 0)) };
  const floors = by('floor').map((m) => { const ring = outlineOf(m.o, m.pts); return { y: flatY(m.o, ring), poly: ring.map((p) => [p[0], p[2]]), fight: m.mk.fight }; });
  const ramps = by('ramp').map((m) => { const ring = outlineOf(m.o, m.pts), ys = ring.map((p) => p[1]); return { poly: ring, y0: Math.min(...ys), y1: Math.max(...ys) }; });
  const ceils = by('ceil').map((m) => { const ring = outlineOf(m.o, m.pts); return { y: flatY(m.o, ring), poly: ring.map((p) => [p[0], p[2]]) }; });
  const opens = by('open').map((m) => ({ m, b: extentOf(m.pts), used: 0 }));
  const T = EG_FRAG_SOCKET_TOL_CM;
  const open = [];
  floors.forEach((f, fi) => f.poly.forEach((p, e) => {
    const q = f.poly[(e + 1) % f.poly.length], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const under = opens.filter((u) => [p, q].every((c) => c[0] >= u.b[0] - T && c[0] <= u.b[3] + T && c[1] >= u.b[2] - T && c[1] <= u.b[5] + T) && f.y >= u.b[1] - T && f.y <= u.b[4] + T);
    for (const u of under) u.used++;
    const runsOn = floors.some((g, gi) => gi !== fi && g.y === f.y && [p, q, mid].every((c) => egFragInPoly(g.poly, c[0], c[1])));
    if (under.length || runsOn) open.push([fi, e]);
  }));
  for (const u of opens) if (!u.used) throw new Error(`${u.m.o.name}: opens no floor's edge (both ends of an edge inside it, at the floor's height)`);
  const nodeMarks = by('node');
  const nodes = nodeMarks.map((m) => { const d = discOf(m.o, m.pts, m.o.polygons.map((_, i) => i)); return [d.x, d.y, d.z, d.r]; });
  const edges = by('edge').map((m) => {
    const r = rectangleOf(m.o, outlineOf(m.o, m.pts));
    const ends = [[r.line[0], r.ya, r.line[1]], [r.line[2], r.yb, r.line[3]]].map((p) => {
      const hit = nodes.map((n, i) => (Math.hypot(p[0] - n[0], p[2] - n[2]) <= n[3] && Math.abs(p[1] - n[1]) <= 100 ? i : -1)).filter((i) => i >= 0);
      if (hit.length !== 1) throw new Error(`${m.o.name}: an end of it meets ${hit.length} nodes - an edge runs from one node's disc to another's`);
      return hit[0];
    });
    if (ends[0] === ends[1]) throw new Error(`${m.o.name}: both its ends on one node`);
    return ends[0] < ends[1] ? ends : [ends[1], ends[0]];
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const anchors = Object.fromEntries(EG_FRAG_ANCHORS.map((k) => [k, []]));
  for (const m of by('anchor')) { const b = extentOf(m.pts); anchors[m.mk.of].push([Math.round((b[0] + b[3]) / 2), b[1], Math.round((b[2] + b[5]) / 2)]); }
  const hazards = by('hazard').map((m) => hazardOf(m.o, m.mk, m.pts));
  const course = by('course').map((m) => fragPiece(m.mk, extentOf(m.pts))).sort((a, b) => a.z - b.z);
  const groundEnds = floors.map((f) => { const zs = f.poly.map((p) => p[1]); return [Math.min(...zs), Math.max(...zs)]; });
  course.forEach((c, i) => {
    const near = c.z - c.d / 2, far = c.z + c.d / 2, prev = course[i - 1], next = course[i + 1];
    const before = Math.max(prev ? prev.z + prev.d / 2 : -Infinity, ...groundEnds.map(([, z1]) => (z1 <= near ? z1 : -Infinity)), sockets.in.z <= near ? sockets.in.z : -Infinity);
    const after = Math.min(...groundEnds.map(([z0]) => (z0 >= far ? z0 : Infinity)), ...sockets.out.map((s) => (s.z >= far ? s.z : Infinity)));
    if (!(before > -Infinity)) throw new Error(`course.${c.kind}: nothing before it to leave from`);
    c.gap = near - before;
    if (!next || next.z - next.d / 2 > after) {
      if (!(after < Infinity)) throw new Error(`course.${c.kind}: no ground after it to land on`);
      c.after = after - far;
    }
  });
  const alcoves = by('alcove').map((m) => {
    const b = extentOf(m.pts), x = Math.round((b[0] + b[3]) / 2);
    if (x === 0) throw new Error(`${m.o.name}: an alcove stands to one side of the course`);
    return { x, y: b[1], z: Math.round((b[2] + b[5]) / 2), seal: m.mk.seal, side: x > 0 ? 1 : -1, holds: m.mk.holds };
  });
  const lights = by('light').map((m) => { const b = extentOf(m.pts); return [Math.round((b[0] + b[3]) / 2), Math.round((b[1] + b[4]) / 2), Math.round((b[2] + b[5]) / 2), m.mk.of]; });

  const out = { positions: [], normals: [], uvs: [] };
  const byRecord = new Map();
  let tris = 0;
  for (const { o, mk } of marks) {
    if (mk) continue;
    const readNormal = layerReader(childNamed(o.geo, 'LayerElementNormal'), 3, 'Normals', 'NormalsIndex');
    const readUv = layerReader(childNamed(o.geo, 'LayerElementUV'), 2, 'UV', 'UVIndex');
    if (!readNormal || !readUv) throw new Error(`${o.name}: art carries no ${readNormal ? 'UV map' : 'normals'} - export it with its normals and its UV map`);
    const weld = cornerWelder({ readNormal, readUv, out, position: (i) => toFrag(o.scene[i]), normal: (n) => { const v = o.normal(n); return [v[0], v[2], v[1]]; } });
    let corner = 0;
    o.polygons.forEach((poly, k) => {
      const name = o.polyMaterial[k] >= 0 ? o.materials[o.polyMaterial[k]] : null;
      const dress = name?.replace(BLENDER_COPY, '');
      if (!dress || !Object.hasOwn(EG_DRESS, dress)) throw new Error(`${o.name} polygon #${k}: it wears ${name ? `"${name}"` : 'no material'} - art wears a record of its band's dress (${Object.keys(EG_DRESS).join(', ')}), or name it as a marker`);
      const ring = poly.map((vi, j) => weld.corner(corner + j, vi));
      corner += poly.length;
      const rec = EG_DRESS[dress];
      if (!byRecord.has(rec)) byRecord.set(rec, { name: dress, indices: [] });
      for (const [a, b, c] of fillFace(o, k)) { byRecord.get(rec).indices.push(ring[a], ring[c], ring[b]); tris++; }
    });
  }
  const indices = [], subMeshes = [];
  for (const rec of [...byRecord.keys()].sort((a, b) => a - b)) {
    const g = byRecord.get(rec);
    subMeshes.push({ material: g.name, record: rec, startIndex: indices.length, primitiveCount: g.indices.length / 3 });
    indices.push(...g.indices);
  }
  const collider = [];
  for (const m of by('collider')) {
    const o = m.o;
    o.polygons.forEach((poly, k) => { for (const [a, b, c] of fillFace(o, k)) for (const vi of [poly[a], poly[c], poly[b]]) collider.push(...toFrag(o.scene[vi]).map(round4)); });
  }
  const positions = out.positions.map(round4);
  const drawn = extentOf(Array.from({ length: positions.length / 3 }, (_, i) => positions.slice(i * 3, i * 3 + 3)));

  const all = [];
  for (let i = 0; i < positions.length; i += 3) all.push([cm(positions[i]), cm(positions[i + 1]), cm(positions[i + 2])]);
  for (const { o, mk } of marks) if (mk) all.push(...cmPoints(o, toFrag));
  for (const c of course) { const s = egFragSwept(c); all.push([s[0], s[1], s[2]], [s[3], s[4], s[5]]); }
  for (const s of [sockets.in, ...sockets.out]) all.push([s.x - s.w / 2, s.y, s.z], [s.x + s.w / 2, s.y + s.h, s.z]);
  for (const h of hazards) { const p = egFragHazardPlan(h); if (p) all.push([p[0], h.y, p[1]], [p[2], h.y, p[3]]); }
  const box = extentOf(all).map((v) => Math.round(v) + 0);

  const sha256 = createHash('sha256').update(fbxBytes).digest('hex');
  const law = {
    bake: { tool: 'tools/fragBake.mjs', source, sha256 },
    v: EG_FRAG_V, id: spec.id, kit: spec.kit, band: F.band, class: spec.class, variant: spec.variant, play: [...spec.play],
    sockets, floors, ramps, open, ceil: ceils.length ? ceils : null, graph: { nodes, edges }, anchors, hazards, course, alcoves,
    proof: { crossFast: 0, crossSlow: 0, moves: 0 },
    cost: { tris, collider: collider.length / 9, lights: lights.length, draws: subMeshes.length },
    reverb: F.reverb, lights, box,
  };
  if (course.length) {
    const steps = egFragSteps(law), P = egSpanProof({ steps });
    if (!P.ok) throw new Error(`${spec.id}: its inner course is not proven - ${P.why.join('; ')}`);
    const c = egRoadCross({ steps }, 0);
    law.proof = { crossFast: Math.round(c.fast * 1000), crossSlow: Math.round(c.median * 1000), moves: c.n };
  }
  const faults = egFragRecordFault(law);
  if (faults.length) throw new Error(`${spec.id}: the law half is refused - ${faults.join('; ')}`);
  const mesh = {
    bake: { tool: 'tools/fragBake.mjs', source, sha256, creator: childNamed(tree.nodes, 'Creator')?.props[0] ?? null, writer },
    id: spec.id, band: F.band, origin: origin.map(round4),
    bounds: { min: drawn.slice(0, 3), max: drawn.slice(3) },
    positions, normals: out.normals.map(round4), uvs: out.uvs.map(round6), indices, subMeshes, collider,
  };
  return { law, mesh };
}

export function fragJson(o) {
  return `{\n${Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;
}

export function listFrag(bytes) {
  return sceneObjects(readFbx(bytes)).map((o) => {
    let mk;
    try { mk = fragMarker(o.name); } catch (err) { return `${o.name.padEnd(28)} REFUSED: ${err.message}`; }
    return `${o.name.padEnd(28)} ${mk ? `${mk.kind}${mk.of ? ` ${mk.of}` : ''}${mk.fight ? ' (fight)' : ''}` : `art: ${[...new Set(o.materials)].join(', ') || 'no material'}`}  ${o.polygons.length} faces`;
  });
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!args.includes('--list') || !file) {
    console.error('usage: node tools/fragBake.mjs --list <in.fbx>   (each fragment\'s own bake script bakes it - tools/bakeEgRefFrag.mjs is the reference\'s)');
    process.exit(2);
  }
  for (const line of listFrag(readFileSync(file))) console.log(line);
}
