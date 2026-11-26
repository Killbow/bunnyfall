// @ts-check
// Builds the galleon as Come Sail Away's hull 2 prefab. The mod's boat code finds nodes by name, so every node it
// reads must keep the name it reads it by.
import { GALLEON_ARCHIVE, TEX, GALLEON_TILE, BANDS } from './galleonArt.js';
import { MeshBench, colliderOf, prism, rope, box, planarUv, newell, sub, add, scl, dot, cross, norm, len } from './galleonMesh.js';
import { buildRig, RIG } from './galleonRig.js';
import { nodeOf, yaw, clone, findNode, constClip, eulerCurve, pointsOf, prefabBench } from './shipKit.js';
import { CAPSULE_HEIGHT } from '../player/motor.js';

export const GALLEON_PREFAB_ID = 112412;
export const GALLEON_HULL_NODE = 'NewGalleon';

export const MEASURED = Object.freeze({
  mainDeckY: 6.202, mainDeckUnderY: 5.943, gunDeckY: 1.0829, railY: 6.923,
  castleRoofY: 11.018, castleCeilingY: 10.577, castleFrontZ: -10.2965, castleFrontInnerZ: -10.4961, castleAftZ: -19.9049,
  hullOuterX: 5.859, hullInnerX: 5.11,
  portZ: Object.freeze([-7.595, -4.417, -0.714, 2.8105, 6.5135]), portHalfW: 0.371, portSillY: 1.561, portTopY: 2.926,
  hatchAft: Object.freeze({ z0: -5.971, z1: -3.178, halfX: 1.071 }), hatchFore: Object.freeze({ z0: 3.318, z1: 6.111, halfX: 1.071 }),
  gangway: Object.freeze({ z0: -0.5818, z1: 1.5781, sillY: 6.3156 }),
  castleDoor: Object.freeze({ halfX: 0.7745, y0: 6.1784, y1: 8.7713, z: -10.3963 }),
  bulkheadDoor: Object.freeze({ halfX: 0.7804, y0: 1.0829, y1: 3.6785, z: -10.158 }),
  rudderPivotZ: -18.8472,
  knuckleY: 2.484, railCapY: 12.297, hatchCoverUnderY: 6.09,
  beams: Object.freeze({ z: Object.freeze([-12.857, -6.912, -1.89, 2.208, 7.107, 10.469]), halfZ: 0.387, underY: 5.221, halfX: 5.079 }),
});

// Normal y range of the castle stair-well ramps. The collider leaves them out so the treads are the walking
// surface.
export const WELL_RAMP_NY = Object.freeze([0.75, 0.9]);
// `stand` is DrivePosition, and Come Sail Away pins the player capsule's center there, so it sits half a capsule
// height over the roof.
export const HELM = Object.freeze({ hub: Object.freeze([0, MEASURED.castleRoofY + 0.72, -12.9]), stand: Object.freeze([0, MEASURED.castleRoofY + CAPSULE_HEIGHT / 2, -14.25]), wheelR: 0.4 });
// Come Sail Away's drive trigger is a 1 m cube on this node at any scale. The node sits forward of the hub so the
// cube holds the wheel and pedestal.
export const DRIVE_TRIGGER_AT = Object.freeze([HELM.hub[0], HELM.hub[1], HELM.hub[2] + 0.25]);
export const ANCHOR = Object.freeze({ yawDeg: -31, weighed: Object.freeze([5.452, 5.85, 15.9]), letGo: Object.freeze([5.366, 5.85, 15.9]) });
export const LID = Object.freeze({
  rows: Object.freeze([MEASURED.portTopY + 0.07, MEASURED.knuckleY, MEASURED.portSillY, MEASURED.portTopY + 0.07 - 1.554]),
  cols: Object.freeze([-0.434, -0.217, 0, 0.217, 0.434]),
  thick: 0.098, gap: 0.003, eyeR: 0.04,
});
const frozen = (a) => Object.freeze(a.map((x) => (Array.isArray(x) ? frozen(x) : x)));
export const LID_FIT = frozen([
  [[5.788, 5.795, 5.795, 5.795, 5.795], [5.858, 5.858, 5.858, 5.858, 5.858], [5.773, 5.773, 5.774, 5.775, 5.775], [5.757, 5.758, 5.758, 5.758, 5.758]],
  [[5.795, 5.795, 5.795, 5.795, 5.795], [5.858, 5.858, 5.858, 5.858, 5.858], [5.775, 5.775, 5.775, 5.775, 5.775], [5.758, 5.758, 5.758, 5.758, 5.758]],
  [[5.795, 5.795, 5.795, 5.795, 5.795], [5.858, 5.858, 5.858, 5.858, 5.858], [5.775, 5.775, 5.775, 5.775, 5.775], [5.758, 5.758, 5.758, 5.758, 5.758]],
  [[5.795, 5.795, 5.795, 5.795, 5.795], [5.858, 5.858, 5.858, 5.858, 5.858], [5.775, 5.775, 5.775, 5.775, 5.775], [5.758, 5.758, 5.758, 5.758, 5.758]],
  [[5.795, 5.797, 5.797, 5.797, 5.797], [5.858, 5.857, 5.855, 5.853, 5.852], [5.775, 5.767, 5.759, 5.751, 5.743], [5.758, 5.741, 5.623, 5.505, 5.387]],
]);
export const BOARD_X = 7.4;
export const BED_OVER_DECK = 0.262;
export const STOVE = Object.freeze({ headGap: 0.136, cowlTop: 0.54, r: 0.14, seat: 0.03 });
export const GUN = Object.freeze({ muzzleX: 1.75, runOutX: 4.16, runInX: 3.06, axisY: 2.2435, chaserY: 7.45 });
export const GALLEON_BATTERIES = Object.freeze({
  broadside: Object.freeze(MEASURED.portZ.map((z) => Object.freeze([MEASURED.hullOuterX + 0.09, GUN.axisY, z]))),
  bow: Object.freeze([Object.freeze([-1.15, GUN.chaserY, 19.15]), Object.freeze([1.15, GUN.chaserY, 19.15])]),
  stern: Object.freeze([Object.freeze([0, 5.4, -20.6])]),
});

export function faceSkin(role, n, c) {
  const tiled = (rec) => ({ rec, uv: (p) => planarUv(p, n, GALLEON_TILE[keyOf(rec)]) });
  const banded = (name) => ({ band: BANDS[name], u: (p) => planarUv(p, n, [GALLEON_TILE[name][0], 1])[0] });
  const up = n[1] > 0.7, down = n[1] < -0.7;
  switch (role) {
    case 'hull': {
      if (c[1] > 1.4 && c[1] < 3.1 && Math.abs(c[0]) > 4.9 && Math.abs(c[0]) < 6.1 && Math.abs(n[0]) < 0.3) return tiled(TEX.dark);
      if (up) return tiled(c[1] > 6.3 ? TEX.trim : TEX.hullInner);
      const core = [0, c[1], Math.max(-14, Math.min(14, c[2]))];
      if (dot(n, sub(core, c)) > 0) return tiled(TEX.hullInner);
      if (n[1] < -0.55) return tiled(TEX.hullBottom);
      return banded('hullSide');
    }
    case 'rudder': return tiled(TEX.hullBottom);
    case 'deckBeam': return { rec: TEX.trim, uv: (p) => [p[0] / GALLEON_TILE.trim[0], (Math.abs(n[1]) > 0.7 ? p[2] : p[1]) / GALLEON_TILE.trim[1]] };
    case 'gunDeck': return tiled(TEX.deck);
    case 'mainDeck': return tiled(up ? TEX.deck : down ? TEX.underDeck : TEX.trim);
    case 'castle': {
      const out = dot(n, sub(c, [0, 8.4, -15.1])) > 0;
      if (Math.abs(c[0]) < 0.85 && c[2] > -10.6 && Math.abs(n[2]) < 0.3 && c[1] < 9.2) return tiled(TEX.trim);
      if (Math.abs(n[0]) > 0.9 && Math.abs(c[0]) > 3 && Math.abs(c[0]) < 5 && c[1] > 8) return tiled(TEX.hullInner);
      if (out) {
        if (up) return tiled(TEX.deck);
        if (n[2] < -0.25 && c[1] > 7.6) return banded('sternWindows');
        if (down) return tiled(TEX.hullInner);
        return banded('castle');
      }
      return tiled(down ? TEX.beams : up ? TEX.deck : TEX.hullInner);
    }
    case 'castleRail': case 'castleParapet': {
      const out = dot(n, sub(c, [0, c[1], -15.0])) > 0;
      if (up || down) return tiled(TEX.trim);
      return out ? banded('castle') : tiled(TEX.trim);
    }
    case 'stairsPort': case 'stairsStarboard': return tiled(up ? TEX.deck : TEX.trim);
    case 'bulkhead': return tiled(Math.abs(c[0]) < 0.85 && Math.abs(n[2]) < 0.3 ? TEX.trim : TEX.hullInner);
    case 'mainMast': case 'foreMast': case 'bowsprit': return tiled(TEX.spar);
    case 'crowsNest': return tiled(up ? TEX.deck : TEX.trim);
    case 'hatchAft': case 'hatchFore': return tiled(up || down ? TEX.grate : TEX.trim);
    default: return tiled(TEX.trim);
  }
}
const keyOf = (rec) => Object.keys(TEX).find((k) => TEX[k] === rec);

export function bakedPartGeometry(part, { offset = [0, 0, 0], role = Array.isArray(part) ? part[0].role : part.role, keep = null, skin = faceSkin, archive = GALLEON_ARCHIVE } = {}) {
  const bench = new MeshBench(archive);
  for (const one of Array.isArray(part) ? part : [part]) benchPart(bench, one, { offset, role, keep, skin });
  return bench.finish();
}
// Each face of a livery part is cut at the livery's slice heights, banded or not, after splitting triangles at
// corners on their edges. This leaves no T-junctions on shared edges.
export function benchPart(bench, part, { offset, role, keep, skin: skinOf = faceSkin }) {
  const pts = pointsOf(part).map((p) => sub(p, offset));
  const faces = part.polygons.map((poly) => {
    const ring = poly.map((i) => pts[i]);
    const n = norm(newell(ring));
    const c = scl(ring.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / ring.length);
    return { n, skin: skinOf(role, n, add(c, offset)) };
  });
  const cuts = sliceCuts(faces.map((f) => f.skin));
  for (const [k, a, b, cc] of splitAtCorners(part, pts)) {
    const { n, skin } = faces[k];
    if (keep && !keep(n)) continue;
    for (const piece of slabs([a, b, cc], offset[1], cuts)) {
      if ('band' in skin) bandPiece(bench, skin, n, offset, piece);
      else for (let i = 1; i + 1 < piece.length; i++) bench.tri(skin.rec, piece[0], piece[i], piece[i + 1], skin.uv(add(piece[0], offset)), skin.uv(add(piece[i], offset)), skin.uv(add(piece[i + 1], offset)), n, [n, n, n]);
    }
  }
}

function sliceCuts(skins) {
  const out = new Set();
  for (const s of skins) {
    if (!('band' in s)) continue;
    const S = s.band.recs.length, h = (s.band.y1 - s.band.y0) / S;
    for (let k = 1; k < S; k++) out.add(s.band.y1 - k * h);
  }
  return [...out].sort((a, b) => a - b);
}

function splitAtCorners(part, pts) {
  const out = [];
  const onEdge = (p, q, v) => {
    const d = sub(q, p), L2 = dot(d, d);
    if (!(L2 > 1e-12)) return null;
    const t = dot(sub(v, p), d) / L2;
    if (t <= 1e-6 || t >= 1 - 1e-6) return null;
    return len(sub(add(p, scl(d, t)), v)) < 2e-5 ? t : null;
  };
  const split = (k, tri) => {
    for (let e = 0; e < 3; e++) {
      const p = tri[e], q = tri[(e + 1) % 3], r = tri[(e + 2) % 3];
      for (const v of pts) {
        if (onEdge(p, q, v) == null) continue;
        split(k, [p, v, r]); split(k, [v, q, r]);
        return;
      }
    }
    out.push([k, ...tri]);
  };
  for (let t = 0; t < part.triangleOf.length; t++) split(part.triangleOf[t], [part.triangles[t * 3], part.triangles[t * 3 + 1], part.triangles[t * 3 + 2]].map((i) => pts[i]));
  return out;
}

function slabs(tri, dy, cuts) {
  const out = [];
  let rest = tri;
  for (const y of cuts) {
    const below = clipY(rest, dy, y, -1);
    if (below.length >= 3) out.push(below);
    rest = clipY(rest, dy, y, 1);
    if (rest.length < 3) return out;
  }
  out.push(rest);
  return out;
}

function bandPiece(bench, { band, u }, n, offset, piece) {
  const S = band.recs.length, h = (band.y1 - band.y0) / S;
  const mid = piece.reduce((a, p) => a + p[1], 0) / piece.length + offset[1];
  const k = Math.min(S - 1, Math.max(0, Math.floor((band.y1 - mid) / h)));
  const y0 = band.y1 - (k + 1) * h;
  const uv = (p) => { const w = add(p, offset); return [u(w), Math.min(1, Math.max(0, (w[1] - y0) / h))]; };
  for (let i = 1; i + 1 < piece.length; i++) bench.tri(band.recs[k], piece[0], piece[i], piece[i + 1], uv(piece[0]), uv(piece[i]), uv(piece[i + 1]), n, [n, n, n]);
}
function clipY(poly, dy, y, keep) {
  if (!Number.isFinite(y)) return poly;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = keep * (p[1] + dy - y), sq = keep * (q[1] + dy - y);
    if (sp >= 0) out.push(p);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); }
  }
  return out;
}

export function mastCap(bench, part, skinOf = faceSkin) {
  const pts = pointsOf(part);
  const top = Math.max(...pts.map((p) => p[1]));
  const ring = pts.filter((p) => p[1] > top - 1e-4);
  const c = scl(ring.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / ring.length);
  ring.sort((p, q) => Math.atan2(p[2] - c[2], p[0] - c[0]) - Math.atan2(q[2] - c[2], q[0] - c[0]));
  const n = [0, 1, 0], skin = skinOf(part.role, n, c);
  if ('band' in skin) throw new Error('galleon: a mast wears no livery');
  bench.poly(skin.rec, ring, ring.map((p) => skin.uv(p)), n);
}
export function nestUnderside(bench, part, mast) {
  const pts = pointsOf(part);
  const low = Math.min(...pts.map((p) => p[1]));
  const ring = pts.filter((p) => p[1] < low + 1e-4);
  const mp = pointsOf(mast), mTop = Math.max(...mp.map((p) => p[1])), mBot = Math.min(...mp.map((p) => p[1]));
  const heads = mp.filter((p) => p[1] > mTop - 1e-4), feet = mp.filter((p) => p[1] < mBot + 1e-4);
  const ax = scl(heads.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / heads.length);
  const angle = (p) => Math.atan2(p[2] - ax[2], p[0] - ax[0]);
  const section = heads.map((h) => {
    const f = feet.reduce((best, q) => (Math.hypot(q[0] - h[0], q[2] - h[2]) < Math.hypot(best[0] - h[0], best[2] - h[2]) ? q : best));
    const t = (low - f[1]) / (h[1] - f[1]);
    return [f[0] + (h[0] - f[0]) * t, low, f[2] + (h[2] - f[2]) * t];
  });
  const down = [0, -1, 0], skinD = faceSkin(part.role, down, [ax[0], low, ax[2]]);
  if ('band' in skinD) throw new Error('galleon: a nest wears no livery');
  const outer = [...ring].sort((p, q) => angle(p) - angle(q)), inner = [...section].sort((p, q) => angle(p) - angle(q));
  let i = 0, j = 0;
  const wrap = (a, k) => a[k % a.length], turns = (a, k) => angle(wrap(a, k)) / (2 * Math.PI) + Math.floor(k / a.length);
  while (i < outer.length || j < inner.length) {
    const takeOuter = j >= inner.length || (i < outer.length && turns(outer, i + 1) <= turns(inner, j + 1));
    const a = wrap(outer, i), b = wrap(inner, j), c = takeOuter ? wrap(outer, i + 1) : wrap(inner, j + 1);
    bench.tri(skinD.rec, a, b, c, skinD.uv(a), skinD.uv(b), skinD.uv(c), down, [down, down, down]);
    if (takeOuter) i++; else j++;
  }
  let floor = null;
  part.polygons.forEach((poly, k) => {
    const ring = poly.map((i) => pts[i]);
    if (norm(newell(ring))[1] < 0.99) return;
    const y = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    if (!floor || y < floor.y) floor = { k, ring, y };
  });
  if (!floor) throw new Error('galleon: the crow\'s nest has no floor');
  const n = [0, -1, 0], c = scl(floor.ring.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / floor.ring.length);
  const skin = faceSkin(part.role, n, c);
  if ('band' in skin) throw new Error('galleon: a nest wears no livery');
  for (let t = 0; t < part.triangleOf.length; t++) {
    if (part.triangleOf[t] !== floor.k) continue;
    const [a, b, cc] = [part.triangles[t * 3], part.triangles[t * 3 + 1], part.triangles[t * 3 + 2]].map((i) => pts[i]);
    bench.tri(skin.rec, a, b, cc, skin.uv(a), skin.uv(b), skin.uv(cc), n, [n, n, n]);
  }
}

export const RUDDER_CLEAR = 0.04;
export function rudderBlade(part, cutZ) {
  const pts = pointsOf(part);
  const positions = [], polygons = [], triangles = [], triangleOf = [];
  const at = (p) => {
    for (let i = 0; i < positions.length; i += 3) if (Math.hypot(positions[i] - p[0], positions[i + 1] - p[1], positions[i + 2] - p[2]) < 1e-7) return i / 3;
    positions.push(p[0], p[1], p[2]);
    return positions.length / 3 - 1;
  };
  const face = (ring) => {
    const k = polygons.length;
    polygons.push(ring.map(at));
    for (let i = 1; i + 1 < ring.length; i++) { triangles.push(polygons[k][0], polygons[k][i], polygons[k][i + 1]); triangleOf.push(k); }
  };
  const section = [];
  for (const poly of part.polygons) {
    const ring = poly.map((i) => pts[i]), out = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      if (p[2] <= cutZ) out.push(p);
      if ((p[2] < cutZ && q[2] > cutZ) || (p[2] > cutZ && q[2] < cutZ)) {
        const t = (cutZ - p[2]) / (q[2] - p[2]);
        const x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, cutZ];
        out.push(x); section.push(x);
      }
    }
    if (out.length >= 3) face(out);
  }
  const ends = section.filter((p, i) => section.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7) === i);
  const c = scl(ends.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / ends.length);
  ends.sort((p, q) => Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(q[1] - c[1], q[0] - c[0]));
  if (dot(newell(ends), [0, 0, 1]) < 0) ends.reverse();
  face(ends);
  return { role: part.role, positions, polygons, triangles, triangleOf };
}

export function hatchCoverGeometry(cover, drop = 0) {
  const bench = new MeshBench();
  const [hx, hy, hz] = cover.half;
  box(bench, TEX.grate, [-hx, drop - hy, 0], [hx, hy, hz], { tile: GALLEON_TILE.grate, skip: [0, 1, 4, 5] });
  box(bench, TEX.trim, [-hx, drop - hy, 0], [hx, hy, hz], { tile: GALLEON_TILE.trim, skip: [2, 3] });
  for (const s of [-1, 1]) box(bench, TEX.trim, [-hx, drop + 0.02, s * (hz - 0.08)], [hx - 0.04, 0.02, 0.08], { tile: GALLEON_TILE.trim });
  prism(bench, TEX.iron, [-hx * 2 + 0.25, drop, 0], [-hx * 2 + 0.25, drop + 0.06, 0], 0.09, 0.09, 6);
  return bench.finish();
}
export function hatchHingeDrop(g, over, clear = 0.002, deg = HATCH_OPEN_DEG) {
  const s = Math.sin((deg * Math.PI) / 180), c = Math.cos((deg * Math.PI) / 180);
  let low = Infinity;
  for (let i = 0; i < g.positions.length; i += 3) low = Math.min(low, g.positions[i] * s + g.positions[i + 1] * c);
  return (over + low - clear) / (1 - c);
}

export const DOOR_THICK = 0.08;
export function doorLeafGeometry(w, h, t = DOOR_THICK) {
  const bench = new MeshBench();
  box(bench, TEX.door, [w / 2, h / 2, t / 2], [w / 2, h / 2, t / 2], { uvFace: (fi, k) => {
    const q = [[0, 0], [0, 1], [1, 1], [1, 0]][k];
    return fi === 4 ? [1 - q[0], q[1]] : fi === 5 ? q : [q[0] * 0.08, q[1]];
  } });
  return bench.finish();
}

export function lidGeometry(s, fit) {
  const bench = new MeshBench();
  const R = LID.rows.length, K = LID.cols.length, t = LID.thick;
  const xh = Math.max(...fit[0]);
  const inner = LID.rows.map((y, r) => LID.cols.map((dz, k) => [s * (fit[r][k] + LID.gap - xh), y - LID.rows[0], dz]));
  const quadN = (r, k) => { const n = norm(cross(sub(inner[r + 1][k + 1], inner[r][k]), sub(inner[r][k + 1], inner[r + 1][k]))); return n[0] * s < 0 ? scl(n, -1) : n; };
  const outer = inner.map((row, r) => row.map((p, k) => {
    let n = [0, 0, 0];
    for (const [rr, kk] of [[r - 1, k - 1], [r - 1, k], [r, k - 1], [r, k]]) if (rr >= 0 && kk >= 0 && rr < R - 1 && kk < K - 1) n = add(n, quadN(rr, kk));
    return add(p, scl(norm(n), t));
  }));
  const uv = (r, k) => [s > 0 ? k / (K - 1) : 1 - k / (K - 1), (LID.rows[r] - LID.rows[R - 1]) / (LID.rows[0] - LID.rows[R - 1])];
  for (let r = 0; r < R - 1; r++) for (let k = 0; k < K - 1; k++) {
    const n = quadN(r, k), at = [[r, k], [r, k + 1], [r + 1, k + 1], [r + 1, k]];
    bench.quad(TEX.lid, ...at.map(([a, b]) => outer[a][b]), at.map(([a, b]) => uv(a, b)), n);
    bench.quad(TEX.lid, ...at.map(([a, b]) => inner[a][b]), at.map(([a, b]) => uv(a, b)), scl(n, -1));
  }
  const edge = (a, b, c, d, out) => bench.quad(TEX.lid, a, b, c, d, [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]], out);
  for (let k = 0; k < K - 1; k++) {
    edge(inner[0][k], inner[0][k + 1], outer[0][k + 1], outer[0][k], sub(inner[0][k], inner[1][k]));
    edge(inner[R - 1][k], inner[R - 1][k + 1], outer[R - 1][k + 1], outer[R - 1][k], sub(inner[R - 1][k], inner[R - 2][k]));
  }
  for (let r = 0; r < R - 1; r++) {
    edge(inner[r][0], inner[r + 1][0], outer[r + 1][0], outer[r][0], sub(inner[r][0], inner[r][1]));
    edge(inner[r][K - 1], inner[r + 1][K - 1], outer[r + 1][K - 1], outer[r][K - 1], sub(inner[r][K - 1], inner[r][K - 2]));
  }
  for (const z of [-0.26, 0.26]) prism(bench, TEX.iron, [0, 0, z - 0.07], [0, 0, z + 0.07], LID.eyeR, LID.eyeR, 6);
  // No collider face may lie within 30 degrees of level, or the deck bake in navalDeck.js treats it as floor.
  const solid = new MeshBench();
  for (let r = 0; r < 2; r++) for (let k = 0; k < K - 1; k++) {
    const n = quadN(r, k), at = [[r, k], [r, k + 1], [r + 1, k + 1], [r + 1, k]];
    solid.quad(TEX.lid, ...at.map(([a, b]) => outer[a][b]), at.map(() => [0, 0]), n);
    solid.quad(TEX.lid, ...at.map(([a, b]) => inner[a][b]), at.map(() => [0, 0]), scl(n, -1));
  }
  return { geometry: bench.finish(), xh, collider: solid.finish() };
}

export function gunGeometry() {
  const bench = new MeshBench();
  const axis = GUN.axisY - MEASURED.gunDeckY;
  for (const s of [-1, 1]) box(bench, TEX.trim, [-0.05, axis * 0.46, s * 0.27], [0.62, axis * 0.42, 0.07], { tile: GALLEON_TILE.trim });
  box(bench, TEX.trim, [-0.05, 0.26, 0], [0.6, 0.06, 0.22], { tile: GALLEON_TILE.trim });
  for (const x of [-0.48, 0.38]) prism(bench, TEX.trim, [x, 0.17, -0.38], [x, 0.17, 0.38], 0.17, 0.17, 8, { smooth: true });
  prism(bench, TEX.iron, [-0.62, axis, 0], [GUN.muzzleX, axis, 0], 0.2, 0.13, 10, { smooth: true, tileV: 1 });
  for (const [x, r] of [[-0.5, 0.215], [0.15, 0.19], [0.8, 0.165]]) prism(bench, TEX.iron, [x, axis, 0], [x + 0.08, axis, 0], r, r, 10, { smooth: true });
  prism(bench, TEX.iron, [GUN.muzzleX - 0.16, axis, 0], [GUN.muzzleX, axis, 0], 0.165, 0.16, 10, { smooth: true });
  prism(bench, TEX.iron, [-0.62, axis, 0], [-0.8, axis, 0], 0.09, 0.05, 8, { smooth: true });
  prism(bench, TEX.iron, [0.2, axis, -0.33], [0.2, axis, 0.33], 0.065, 0.065, 8, { smooth: true });
  for (const s of [-1, 1]) rope(bench, TEX.rope, [[-0.8, axis, 0], [-0.4, axis - 0.1, s * 0.5], [0.9, axis - 0.15, s * 0.62]], 0.03);
  return bench.finish();
}

export function chaserGeometry(height) {
  const bench = new MeshBench();
  prism(bench, TEX.trim, [0, 0, 0], [0, height - 0.12, 0], 0.11, 0.09, 6);
  box(bench, TEX.iron, [0, height - 0.06, 0], [0.16, 0.06, 0.06], { tile: GALLEON_TILE.iron });
  prism(bench, TEX.iron, [0, height, -0.55], [0, height, 0.95], 0.11, 0.08, 8, { smooth: true });
  prism(bench, TEX.iron, [0, height, -0.55], [0, height + 0.04, -0.9], 0.03, 0.03, 4);
  return bench.finish();
}

export function wheelGeometry(R = HELM.wheelR) {
  const bench = new MeshBench();
  const N = 16;
  const ringOf = (r, w, d, rec) => {
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      const p = (a, rr, z) => [Math.cos(a) * rr, Math.sin(a) * rr, z];
      const o0 = p(a0, r + w, -d), o1 = p(a1, r + w, -d), i0 = p(a0, r - w, -d), i1 = p(a1, r - w, -d);
      const O0 = p(a0, r + w, d), O1 = p(a1, r + w, d), I0 = p(a0, r - w, d), I1 = p(a1, r - w, d);
      const mid = (a0 + a1) / 2, out = [Math.cos(mid), Math.sin(mid), 0];
      const uv = [[k / N * 4, 0], [(k + 1) / N * 4, 0], [(k + 1) / N * 4, 0.1], [k / N * 4, 0.1]];
      bench.quad(rec, o0, o1, O1, O0, uv, out);
      bench.quad(rec, i0, i1, I1, I0, uv, scl(out, -1));
      bench.quad(rec, o0, o1, i1, i0, uv, [0, 0, -1]);
      bench.quad(rec, O0, O1, I1, I0, uv, [0, 0, 1]);
    }
  };
  ringOf(R, 0.045, 0.05, TEX.trim);
  ringOf(R * 0.5, 0.025, 0.035, TEX.trim);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, d = [Math.cos(a), Math.sin(a), 0];
    prism(bench, TEX.trim, scl(d, 0.1), scl(d, R + 0.05), 0.028, 0.024, 6, { smooth: true });
    prism(bench, TEX.trim, scl(d, R + 0.05), scl(d, R + 0.22), 0.032, 0.026, 6, { smooth: true });
    prism(bench, TEX.gilt, scl(d, R + 0.22), scl(d, R + 0.26), 0.036, 0.0, 6, { smooth: true, caps: [true, false] });
  }
  prism(bench, TEX.trim, [0, 0, -0.1], [0, 0, 0.1], 0.13, 0.13, 10, { smooth: true });
  prism(bench, TEX.gilt, [0, 0, -0.1], [0, 0, -0.16], 0.08, 0.04, 10, { smooth: true });
  return bench.finish();
}

export function helmPedestalGeometry() {
  const bench = new MeshBench();
  const [hx, hy, hz] = HELM.hub;
  const y0 = MEASURED.castleRoofY;
  box(bench, TEX.trim, [hx, y0 + 0.48, hz + 0.42], [0.26, 0.48, 0.22], { tile: GALLEON_TILE.trim });
  box(bench, TEX.gilt, [hx, y0 + 0.99, hz + 0.42], [0.28, 0.03, 0.24], { tile: GALLEON_TILE.gilt });
  prism(bench, TEX.iron, [hx, hy, hz + 0.2], [hx, hy, hz + 0.05], 0.05, 0.05, 6, { smooth: true });
  prism(bench, TEX.gilt, [hx, y0 + 1.02, hz + 0.42], [hx, y0 + 1.3, hz + 0.42], 0.16, 0.06, 8, { smooth: true });
  return bench.finish();
}

export const MANROPE = Object.freeze({ r: 0.03, clear: 0.02 });

export function stoveFlueGeometry(foot, length) {
  const bench = new MeshBench();
  prism(bench, TEX.iron, foot, add(foot, [0, length, 0]), STOVE.r, STOVE.r, 8, { smooth: true, caps: [false, false], tileV: GALLEON_TILE.iron[1] });
  return bench.finish();
}

export function companionGeometry(topZ, dir, halfX = 0.72, pitch = 48, holeHalfX = MEASURED.hatchFore.halfX) {
  const bench = new MeshBench();
  const top = MEASURED.mainDeckY, bottom = MEASURED.gunDeckY;
  const rise = 0.3, steps = Math.round((top - bottom) / rise);
  const r = (top - bottom) / steps, run = r / Math.tan((pitch * Math.PI) / 180);
  for (let i = 1; i <= steps; i++) {
    const y = top - i * r, z0 = topZ + dir * (i - 1) * run, z1 = topZ + dir * i * run;
    box(bench, TEX.deck, [0, y - 0.04, (z0 + z1) / 2], [halfX, 0.04, Math.abs(z1 - z0) / 2 + 0.02], { tile: GALLEON_TILE.deck });
  }
  const zEnd = topZ + dir * steps * run;
  const headY = MEASURED.hatchCoverUnderY - MANROPE.clear - MANROPE.r;
  for (const s of [-1, 1]) {
    const a = [s * (halfX + 0.05), top - 0.1, topZ], b = [s * (halfX + 0.05), bottom + 0.1, zEnd];
    prism(bench, TEX.trim, a, b, 0.09, 0.09, 4, { tileV: 2, twist: Math.PI / 4 });
    const foot = add(b, [0, 0.95, 0]), line = add(a, [0, 0.95, 0]);
    const t = (headY - foot[1]) / (line[1] - foot[1]);
    const head = [foot[0], headY, foot[2] + (line[2] - foot[2]) * t];
    rope(bench, TEX.rope, [foot, head, [s * holeHalfX, headY, head[2]]], MANROPE.r);
  }
  return { geometry: bench.finish(), bottomZ: zEnd, steps, rise: r, run };
}

export function ropeLadderGeometry(s = 1) {
  const bench = new MeshBench();
  const g = MEASURED.gangway, zc = (g.z0 + g.z1) / 2;
  const path = (dz) => [[s * 5.38, g.sillY + 0.15, zc + dz], [s * 5.93, 2.45, zc + dz], [s * 5.93, 0.05, zc + dz]];
  for (const dz of [-0.24, 0.24]) rope(bench, TEX.rope, path(dz), 0.03);
  for (let y = 0.35; y < g.sillY - 0.1; y += 0.34) {
    const x = y > 2.45 ? 5.93 - ((y - 2.45) / (g.sillY + 0.15 - 2.45)) * (5.93 - 5.38) : 5.93;
    box(bench, TEX.trim, [s * (x + 0.04), y, zc], [0.03, 0.025, 0.25], { tile: GALLEON_TILE.trim });
  }
  return bench.finish();
}

// Two degrees short of flat, because the clip blend takes the shortest turn and must swing the cover over to
// starboard, never back through the hatchway.
export const HATCH_OPEN_DEG = -178;
export const LID_OPEN_DEG = 84;
export const WHEEL_TURNS = 1.25;
export const RUDDER_DEG = 35;

export function galleonClips() {
  const clips = {}, overrides = {};
  const pair = (ov, closed, opened) => {
    clips[`${ov} Closed`] = constClip(`${ov} Closed`, [eulerCurve('', closed)]);
    clips[`${ov} Opened`] = constClip(`${ov} Opened`, [eulerCurve('', opened)]);
    overrides[ov] = { base: 'Door Controller', clips: [['Door Closed', `${ov} Closed`], ['Door Opened', `${ov} Opened`]] };
  };
  pair('galleon2/Hatch', [0, 0, 0], [0, 0, HATCH_OPEN_DEG]);
  pair('galleon2/Gunport', [0, 0, 0], [0, 0, LID_OPEN_DEG]);
  pair('galleon2/GunportPort', [0, 0, 0], [0, 0, -LID_OPEN_DEG]);
  const swaps = [];
  for (const [side, sign] of /** @type {const} */ ([['Left', -1], ['Right', 1]])) {
    for (let i = 0; i < 5; i++) {
      const t = sign * (0.2 + 0.2 * i);
      const name = `galleon2/Rudder Sailing ${side} ${i}`;
      clips[name] = constClip(name, [eulerCurve('HelmWheel', [0, 0, -t * WHEEL_TURNS * 360]), eulerCurve('HelmRudder', [0, -t * RUDDER_DEG, 0])]);
      swaps.push([`Rudder Wheel Sailing ${side} ${i}`, name]);
    }
  }
  overrides['galleon2/Rudder'] = { base: 'Rudder Wheel Controller', clips: swaps };
  return { clips, overrides };
}

/**
 * @param {any} bake
 * @param {{ prefabs: Record<string, any>, components: any[] }} csa
 */
export function galleonPrefab(bake, csa) {
  const { comp, mesh, renderer, meshNode, boxCollider, animator, skinned, finish, meshes } = prefabBench(csa.components.length, 'galleon');
  const cx = { archive: GALLEON_ARCHIVE, mesh, comp, skinned };

  const part = (role) => { const p = bake.parts.find((x) => x.role === role); if (!p) throw new Error(`galleon: the bake has no ${role}`); return p; };
  // Extra faces go on the drawing only. The collider stays the baked mesh because the deck bake reads colliders.
  const baked = (role, name, extra = null) => {
    const plain = bakedPartGeometry(part(role));
    if (!extra) return meshNode(name, `galleon:${role}`, plain, { collider: true });
    const bench = new MeshBench();
    benchPart(bench, part(role), { offset: [0, 0, 0], role, keep: null });
    extra(bench, part(role));
    return meshNode(name, `galleon:${role}`, bench.finish(), { collider: true, colliderGeometry: plain });
  };
  const old = csa.prefabs[String(GALLEON_PREFAB_ID)];
  const fromOld = (name, at = {}) => {
    const n = clone(findNode(old, name));
    if (!n) throw new Error(`galleon: Come Sail Away's galleon has no ${name}`);
    if (at.p) n.position = [...at.p];
    if (at.r) n.rotation = [...at.r];
    if (at.name) n.name = at.name;
    return n;
  };
  const M = MEASURED;
  const kids = [];

  // Board triggers go before the doors: the walk files door triggers under BoardTriggers, and BoardTriggers[0] must
  // be a gangway's.
  const g = M.gangway, gz = (g.z0 + g.z1) / 2;
  for (const s of [1, -1]) {
    const t = [s * BOARD_X, 2.4, gz];
    const stand = [s * 4.3, M.mainDeckY + 0.05, gz];
    kids.push(nodeOf('BoardTrigger', { p: t, s: [3, 3, 3], kids: [nodeOf('BoardPosition', { p: scl(sub(stand, t), 1 / 3), r: yaw(s > 0 ? -90 : 90), s: [1 / 3, 1 / 3, 1 / 3] })] }));
  }
  kids.push(nodeOf('DriveTrigger', { p: DRIVE_TRIGGER_AT }));
  kids.push(nodeOf('DrivePosition', { p: HELM.stand }));

  // The castle, rail, and parapet are in the hull collider because its bounds are the cannon target in navalHost.js
  // hullBoxOf.
  for (const [role, name] of [['castle', 'Castle'], ['castleParapet', 'CastleParapet'], ['castleRail', 'CastleRail']]) kids.push(meshNode(name, `galleon:${role}`, bakedPartGeometry(part(role))));
  const extras = { mainMast: mastCap, crowsNest: (bench, p) => nestUnderside(bench, p, part('mainMast')) };
  for (const [role, name] of [['gunDeck', 'GunDeck'], ['mainDeck', 'MainDeck'],
    ['bulkhead', 'Bulkhead'], ['stairsPort', 'StairsPort'], ['stairsStarboard', 'StairsStarboard'], ['balustradePort', 'BalustradePort'], ['balustradeStarboard', 'BalustradeStarboard'],
    ['mainMast', 'MainMast'], ['foreMast', 'ForeMast'], ['mainPartner', 'MainPartner'], ['mainStep', 'MainStep'], ['forePartner', 'ForePartner'], ['foreStep', 'ForeStep'],
    ['crowsNest', 'CrowsNest'], ['bowsprit', 'Bowsprit']]) kids.push(baked(role, name, extras[role] ?? null));
  const beamParts = bake.parts.filter((x) => x.role === 'deckBeam');
  if (!beamParts.length) throw new Error('galleon: the bake has no deckBeam');
  kids.push(meshNode('DeckBeams', 'galleon:deckBeams', bakedPartGeometry(beamParts), { collider: true }));

  const fore = part('hatchFore');
  const fp = pointsOf(fore);
  const fmin = [0, 1, 2].map((k) => Math.min(...fp.map((p) => p[k]))), fmax = [0, 1, 2].map((k) => Math.max(...fp.map((p) => p[k])));
  const cover = { half: [(fmax[0] - fmin[0]) / 2, (fmax[1] - fmin[1]) / 2, (fmax[2] - fmin[2]) / 2] };
  const drop = hatchHingeDrop(hatchCoverGeometry(cover), fmax[1] - M.mainDeckY);
  const coverGeometry = hatchCoverGeometry(cover, drop);
  const hatch = (name, hole) => {
    const zc = (hole.z0 + hole.z1) / 2 + ((fmin[2] + fmax[2]) / 2 - (M.hatchFore.z0 + M.hatchFore.z1) / 2);
    const hinge = [cover.half[0], fmax[1] - drop, zc];
    return meshNode(name, 'galleon:hatchCover', coverGeometry, { collider: true, p: hinge, c: [animator('galleon2/Hatch')], kids: [nodeOf('DoorTrigger')] });
  };
  // Built before the covers so a ray down an open hatch meets the stairs.
  const aftStairs = companionGeometry(M.hatchAft.z1, -1);
  const foreStairs = companionGeometry(M.hatchFore.z1, -1);
  kids.push(meshNode('CompanionAft', 'galleon:companionAft', aftStairs.geometry, { collider: true }));
  kids.push(meshNode('CompanionFore', 'galleon:companionFore', foreStairs.geometry, { collider: true }));
  kids.push(hatch('HatchAft', M.hatchAft));
  kids.push(hatch('HatchFore', M.hatchFore));

  const door = (name, d, floor) => {
    const foot = Math.max(d.y0, floor) + 0.01;
    return meshNode(name, `galleon:door:${name}`, doorLeafGeometry(d.halfX * 2 - 0.04, d.y1 - 0.01 - foot), { collider: true, p: [-d.halfX + 0.02, foot, d.z - DOOR_THICK / 2], c: [animator('Door Controller')], kids: [nodeOf('DoorTrigger')] });
  };
  kids.push(door('CastleDoor', M.castleDoor, M.mainDeckY));
  kids.push(door('BulkheadDoor', M.bulkheadDoor, M.gunDeckY));

  const lidXh = M.portZ.map((z, i) => {
    for (const [s, suffix] of [[1, ''], [-1, 'Port']]) {
      const lid = lidGeometry(s, LID_FIT[i]);
      mesh(`galleon:gunportLid${suffix}${i}`, lid.geometry);
      mesh(`galleon:gunportLid${suffix}${i}:collider`, colliderOf(lid.collider));
    }
    return lidGeometry(1, LID_FIT[i]).xh;
  });
  mesh('galleon:gun', gunGeometry());
  const lidComps = (key) => [comp({ type: 'MeshFilter', m_Mesh: { mesh: key } }), renderer(meshes[key]), comp({ type: 'MeshCollider', m_Enabled: true, m_IsTrigger: false, m_Convex: false, m_Mesh: { mesh: `${key}:collider` } })];
  for (const [sideName, s] of /** @type {const} */ ([['Starboard', 1], ['Port', -1]])) {
    M.portZ.forEach((z, i) => {
      kids.push(nodeOf(`Gunport${sideName}${i}`, { p: [s * lidXh[i], LID.rows[0], z], c: [...lidComps(s > 0 ? `galleon:gunportLid${i}` : `galleon:gunportLidPort${i}`), animator(s > 0 ? 'galleon2/Gunport' : 'galleon2/GunportPort')] }));
      kids.push(nodeOf(`Gun${sideName}${i}`, { p: [s * GUN.runInX, M.gunDeckY, z], r: yaw(s > 0 ? 0 : 180), c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'galleon:gun' } }), renderer(meshes['galleon:gun']), boxCollider([-0.05, 0.55, 0], [1.25, 1.1, 0.8])] }));
    });
  }
  mesh('galleon:chaser', chaserGeometry(GUN.chaserY - M.mainDeckY));
  for (const [i, m] of GALLEON_BATTERIES.bow.entries()) {
    kids.push(nodeOf(`BowChaser${i}`, { p: [m[0], M.mainDeckY, m[2] - 0.95], c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'galleon:chaser' } }), renderer(meshes['galleon:chaser'])] }));
  }

  kids.push(meshNode('HelmPedestal', 'galleon:helmPedestal', helmPedestalGeometry(), { c: [boxCollider([0, M.castleRoofY + 0.6, HELM.hub[2] + 0.42], [0.6, 1.2, 0.5])] }));
  mesh('galleon:wheel', wheelGeometry());
  const rudderPart = rudderBlade(part('rudder'), M.rudderPivotZ - RUDDER_CLEAR);
  const rudderPivot = [0, 0, M.rudderPivotZ];
  mesh('galleon:rudder', bakedPartGeometry(rudderPart, { offset: rudderPivot }));
  kids.push(nodeOf('RudderObject', {
    c: [animator('galleon2/Rudder')],
    kids: [
      nodeOf('HelmWheel', { p: HELM.hub, c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'galleon:wheel' } }), renderer(meshes['galleon:wheel'])] }),
      nodeOf('HelmRudder', { p: rudderPivot, c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'galleon:rudder' } }), renderer(meshes['galleon:rudder'])] }),
    ],
  }));

  const rig = buildRig(cx);
  kids.push(...rig.kids);

  const D = M.mainDeckY, G = M.gunDeckY, R = M.castleRoofY;
  kids.push(nodeOf('ActiveObject', { kids: [fromOld('GalleonAnchor', { p: ANCHOR.weighed, r: yaw(ANCHOR.yawDeg) })] }));
  kids.push(nodeOf('IdleObject', { kids: [
    fromOld('GalleonAnchorDeployed', { p: ANCHOR.letGo, r: yaw(ANCHOR.yawDeg) }),
    meshNode('RopeLadderStarboard', 'galleon:ladderStarboard', ropeLadderGeometry(1)),
    meshNode('RopeLadderPort', 'galleon:ladderPort', ropeLadderGeometry(-1)),
  ] }));
  const crew = (name, flat, at, trigger = null) => nodeOf(name, { p: at, kids: [nodeOf(`BillboardHelper-${flat}:1`), ...(trigger ? [nodeOf(trigger, { p: [0, 1, 0] })] : [])] });
  kids.push(crew('OfficerStanding1', '182_025', [2.1, R, -16.6], 'StatusTrigger'));
  kids.push(crew('Coxswain', '346_006', [-2.1, R, -16.7], 'PositionTrigger'));
  kids.push(crew('Boatswain', '182_035', [-2.6, D, 2.3], 'VariantTrigger'));
  kids.push(crew('Quartermaster', '182_020', [-2.3, D, 7.3], 'CargoTrigger'));
  kids.push(crew('Master-At-Arms', '183_004', [2.4, G, -1.9]));
  kids.push(crew('Cook', '182_008', [-1.6, G, 10.6]));
  kids.push(fromOld('GalleonCargo', { p: [-3.3, D, 6.6], r: yaw(-20) }));
  const stove = fromOld('Stove', { p: [-3.1, G, 11.4], r: yaw(45) });
  const cowl = findNode(stove, 'StovePipe');
  if (!cowl) throw new Error('galleon: Come Sail Away\'s stove has no StovePipe');
  const raise = M.mainDeckUnderY - STOVE.headGap - (G + cowl.position[1] + STOVE.cowlTop);
  stove.children.push(meshNode('StoveFlue', 'galleon:stoveFlue', stoveFlueGeometry([cowl.position[0], cowl.position[1], cowl.position[2]], raise + STOVE.seat)));
  cowl.position = [cowl.position[0], cowl.position[1] + raise, cowl.position[2]];
  kids.push(stove);
  kids.push(nodeOf('BedObject', { p: [3.55, D + BED_OVER_DECK, -16.2], r: yaw(-90) }));
  const lanternFlat = () => nodeOf('BillboardHelper-210_027:2');
  const pole = clone(findNode(old, 'LanternHookStandPoleShort'));
  for (const s of [-1, 1]) kids.push({ ...clone(pole), position: [s * 2.35, M.railCapY + 0.003, -18.7], rotation: yaw(s * -150) });
  const stand = fromOld('LanternHookStandPlank', { p: [0, R, -19.05], r: yaw(180), name: 'LanternHookStandTaffrail' });
  kids.push(stand);
  const hook = clone(findNode(old, 'LanternHook'));
  for (const s of [-1, 1]) kids.push({ ...clone(hook), name: s < 0 ? 'LanternHookDoorPort' : 'LanternHookDoorStarboard', position: [s * 1.45, M.castleDoor.y1 + 0.2, M.castleFrontZ + 0.02], rotation: yaw(180) });
  for (const [i, k] of [1, 2, 4].entries()) kids.push(nodeOf(i ? `LanternHanging (${i})` : 'LanternHanging', { p: [0, M.beams.underY - 0.01, M.beams.z[k]], kids: [lanternFlat()] }));
  kids.push(nodeOf('LanternHanging (3)', { p: [0, M.castleCeilingY - 0.05, -15.4], kids: [lanternFlat()] }));
  kids.push(fromOld('FlagObject', { p: [0, RIG.nestTopY + 1.45, RIG.mainZ + 0.05] }));

  // The hull collider must be the first MeshCollider in the tree: it is Boat.MeshCollider, and its box places the
  // boat and aims the sea fight.
  const hullGeometry = bakedPartGeometry(part('hull'));
  const castleSolid = bakedPartGeometry(part('castle'), { keep: (n) => !(n[1] > WELL_RAMP_NY[0] && n[1] < WELL_RAMP_NY[1]) });
  mesh('galleon:hull:collider', colliderOf(mergeGeometries([hullGeometry, castleSolid, meshes['galleon:castleRail'], meshes['galleon:castleParapet']])));
  const hull = meshNode(GALLEON_HULL_NODE, 'galleon:hull', hullGeometry, { kids, c: [comp({ type: 'MeshCollider', m_Enabled: true, m_IsTrigger: false, m_Convex: false, m_Mesh: { mesh: 'galleon:hull:collider' } })] });
  const root = nodeOf(String(GALLEON_PREFAB_ID), { kids: [
    fromOld('WakeObject', { p: [0, 0.1, 2.2] }),
    hull,
    fromOld('Modifiers'),
  ] });

  const { components } = finish(root);

  const own = galleonClips();
  return {
    prefab: root, components, meshes,
    animation: { clips: { ...own.clips, ...rig.clips }, overrides: { ...own.overrides, ...rig.overrides } },
  };
}

export function mergeGeometries(list) {
  const geos = list.filter(Boolean);
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.vertexCount; ni += g.indices.length; }
  const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2), indices = new Uint32Array(ni);
  let v = 0, i = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const g of geos) {
    positions.set(g.positions, v * 3); normals.set(g.normals, v * 3); uvs.set(g.uvs, v * 2);
    for (let k = 0; k < g.indices.length; k++) indices[i + k] = g.indices[k] + v;
    for (let k = 0; k < g.positions.length; k += 3) for (let d = 0; d < 3; d++) { const x = g.positions[k + d]; if (x < min[d]) min[d] = x; if (x > max[d]) max[d] = x; }
    v += g.vertexCount; i += g.indices.length;
  }
  return { vertexCount: nv, positions, normals, uvs, indices, subMeshes: [{ startIndex: 0, primitiveCount: ni / 3 }], slots: [], blendIndices: null, bindPoses: null,
    aabb: { center: [0, 1, 2].map((d) => (min[d] + max[d]) / 2), extent: [0, 1, 2].map((d) => (max[d] - min[d]) / 2) } };
}

export { len };
