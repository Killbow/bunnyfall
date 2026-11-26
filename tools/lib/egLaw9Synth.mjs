// Builds synthetic law 9 Elite Gates halls for tools and tests; nothing in a live breach uses them.
import { egSpecGive, egSeed, EG_STEP, EG_BAND_PIECES, EG_HALL_PITCH, egFirstHallOf } from '../../src/net/eliteGates/egLaw.js';
import { egSpanOf, egSpanProof } from '../../src/net/eliteGates/egSpanLaw.js';
import { sdRng } from '../../src/net/sdBrain.js';

const SYNTH_SALT = 0x0e9a90;
const piecesOf = (band) => EG_BAND_PIECES[band].filter((k) => k !== 'crumble' && k !== 'drop' && k !== 'riser');
const m = (cm) => cm / 100;

/**
 * @param {number} seed
 * @param {number} h
 * @param {{ band?: number, slot?: number, c?: number, geo?: number, pitches?: number[]|null, prove?: boolean }} [o]
 */
export function egSynth9Hall(seed, h, { band = 0, slot = 1, c = 1, geo = 0, pitches = null, prove = true } = {}) {
  for (let at = 0; at < 24; at++) {
    const spec = lay(seed, h, band, slot, c, geo, at, pitches);
    if (!prove || egSpanProof(spec).ok) return spec;
  }
  throw new Error(`tools/lib/egLaw9Synth.mjs: no synthetic hall stands for seed ${seed} hall ${h}`);
}

function lay(seed, h, band, slot, c, geo, at, own) {
  const r = sdRng(egSeed(seed, SYNTH_SALT + h * 64 + at)), between = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const P = { discs: [], bands: [], lanes: [], ramps: [], islands: [], climbs: [], nodes: [], links: [], main: [] };
  const disc = (x, y, z, rad, role) => { const d = { x, y, z, r: rad, role }; P.discs.push(d); return d; };
  const lane = (ax, az, bx, bz, hw, y, role = 'walk') => { P.lanes.push({ ax, az, bx, bz, hw, role, y }); };
  const node = (x, y, z) => { P.nodes.push([x, y, z]); return P.nodes.length - 1; };
  const link = (a, b, kind, road = 0) => {
    const p = P.nodes[a], q = P.nodes[b], dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], plan = Math.sqrt(dx * dx + dz * dz);
    P.links.push({ a, b, kind, road, len: kind === 'climb' || kind === 'drop' ? Math.abs(dy) + plan : Math.sqrt(dx * dx + dy * dy + dz * dz) });
    return b;
  };
  const A0 = node(0, 0, 0);
  const arrive = disc(0, 0, 0, 500, 'arrive');
  const zA = between(1400, 2000);
  lane(0, 450, 0, zA, 200, 0);
  const zc = zA + 250;
  disc(0, 0, zc, 350, 'landing');
  let n = link(A0, node(0, 0, zA), 'walk');
  n = link(n, node(0, 0, zc), 'walk');
  const xB = between(1400, 2200), rise = between(300, 500), run = Math.ceil((rise * 5) / 3) + between(0, 200);
  lane(300, zc, xB, zc, 200, 0);
  n = link(n, node(xB, 0, zc), 'walk');
  P.ramps.push({ ax: xB, az: zc, bx: xB + run, bz: zc, hw: 200, y0: 0, y1: rise });
  n = link(n, node(xB + run, rise, zc), 'stair');
  const x5 = xB + run + 300, y5 = rise;
  disc(x5, y5, zc, 300, 'landing');
  const A5 = link(n, node(x5, y5, zc), 'walk');
  const drawn = r() < 0.5 ? [between(250, 290)] : [between(250, 290), between(250, 290)], pitches = own ?? drawn;
  const zf = zc + between(1200, 1500), D = 120, y7 = y5 + pitches.reduce((s, p) => s + p, 0), zTop = zf + D * (pitches.length - 1);
  lane(x5, zc + 250, x5, zf, 200, y5);
  const foot = link(A5, node(x5, y5, zf - 60), 'walk');
  if (pitches.length === 2) lane(x5 - 250, zf + D / 2, x5 + 250, zf + D / 2, D / 2, y5 + pitches[0], 'ledge');
  P.climbs.push({ x0: x5 - 250, z0: zf, x1: x5 + 250, z1: zf, y0: y5, y1: y7, ledges: pitches.length === 2 ? [y5 + pitches[0]] : [], face: [0, -1], d: D, road: 0 });
  P.bands.push({ x: x5 + 300, y: y7, z0: zTop, z1: zTop + 1000, halfW: 600, role: 'gallery' });
  const lip = link(foot, node(x5, y7, zTop + 50), 'climb');
  const xL = x5 + 600, run1 = Math.ceil(((y7 - y5) * 5) / 3), zR0 = zTop - run1;
  lane(x5 + 250, zc, xL, zc, 150, y5);
  lane(xL, zc, xL, zR0, 150, y5);
  P.ramps.push({ ax: xL, az: zR0, bx: xL, bz: zTop, hw: 150, y0: y5, y1: y7 });
  let b = link(A5, node(xL, y5, zc), 'walk', 1);
  b = link(b, node(xL, y5, zR0), 'walk', 1);
  b = link(b, node(xL, y7, zTop), 'stair', 1);
  link(b, node(xL, y7, zTop + 50), 'walk', 1);
  link(P.nodes.length - 1, lip, 'walk', 1);
  const zV = zTop + 500;
  P.climbs.push({ x0: x5 + 900, z0: zV - 200, x1: x5 + 900, z1: zV + 200, y0: y7, y1: y7 + 700, ledges: [], face: [-1, 0], d: D, road: 2 });
  disc(x5 + 1150, y7 + 700, zV, 250, 'vantage');
  const v0 = link(lip, node(x5 + 840, y7, zV), 'walk', 2);
  link(v0, node(x5 + 1150, y7 + 700, zV), 'climb', 2);
  const dd = between(300, 450), y8 = y7 - dd, zG = zTop + 1000;
  n = link(lip, node(x5, y7, zG - 50), 'walk');
  lane(x5, zG + 100, x5, zG + 600, 200, y8);
  n = link(n, node(x5, y8, zG + 300), 'drop');
  const zs = zG + 900;
  disc(x5, y8, zs, 300, 'island');
  P.islands.push({ x: x5, y: y8, z: zs, r: 300, road: 0 });
  n = link(n, node(x5, y8, zs), 'walk');
  const S = egSpanOf(seed, h, band, { r, sizes: EG_STEP, start: { x: x5, y: y8, z: zs, r: 300 }, checkR: 300 });
  const kinds = piecesOf(band);
  let edge = zs + 300, y = y8;
  for (let k = 0; k < 2; k++) {
    S.at(edge, y); S.run(kinds[between(0, kinds.length - 1)], between(3, 4), x5); edge = S.edge; y = S.y;
    S.at(edge, y);
    const z = S.check(S.gap());
    disc(x5, y, z, 300, 'island');
    P.islands.push({ x: x5, y, z, r: 300, road: 0 });
    n = link(n, node(x5, y, z), 'span');
    edge = S.edge;
  }
  lane(x5, edge - 50, x5, edge + 500, 200, y);
  const zE = edge + 1000, end = disc(x5, y, zE, 500, 'end');
  n = link(n, node(x5, y, edge + 500), 'walk');
  n = link(n, node(x5, y, zE), 'walk');
  const main = [];
  for (let k = 0, at0 = A0; ; k++) {
    main.push(at0);
    const l = P.links.find((q) => q.a === at0 && (q.road ?? 0) === 0);
    if (!l || k > 64) break;
    at0 = l.b;
  }
  const steps = S.lay();
  for (const s of steps) {
    const far = s.z + s.d / 2, next = steps.find((q) => q.road === s.road && q.i > s.i);
    if (next && Math.abs(next.z - next.d / 2 - next.gap - far) < 1) continue;
    let best = Infinity, bestY = s.y;
    for (const d of P.discs) if (Math.abs(d.x - s.x) <= d.r + s.w && d.z - d.r >= far - 1 && Math.abs(d.y - s.y) < 600 && d.z - d.r - far < best) { best = d.z - d.r - far; bestY = d.y; }
    for (const l of P.lanes) { const lz = Math.min(l.az, l.bz); if (Math.abs(l.ax - s.x) <= l.hw + s.w && lz >= far - 1 && Math.abs(l.y - s.y) < 600 && lz - far < best) { best = lz - far; bestY = l.y; } }
    s.after = Number.isFinite(best) ? Math.max(0, best) : 0;
    s.ya = bestY;
  }
  const pt = (q) => ({ ...q, x: m(q.x), y: m(q.y), z: m(q.z), r: m(q.r) });
  return {
    v: 9, law: 9, seed, h, c, slot, kind: 'span', variant: null, twist: null, band, geo, lord: null, champ: null,
    name: 'The Ascent (synthetic)', objective: 'Cross.', x0: (slot - 1) * EG_HALL_PITCH, len: m(zE + 500),
    arrive: pt(arrive), end: pt(end), discs: P.discs.map(pt),
    bands: P.bands.map((q) => ({ x: m(q.x), y: m(q.y), z0: m(q.z0), z1: m(q.z1), halfW: m(q.halfW), role: q.role })),
    lanes: P.lanes.map((l) => ({ ax: m(l.ax), az: m(l.az), bx: m(l.bx), bz: m(l.bz), hw: m(l.hw), role: l.role, y: m(l.y) })),
    steps: steps.map((s) => ({ i: s.i, kind: s.kind, span: s.span, x: m(s.x), y: m(s.y), z: m(s.z), w: m(s.w), d: m(s.d), amp: m(s.amp), period: s.period / 1000, phase: s.phase / 1000, beat: s.kind === 'moon' ? m(s.beat) : s.beat / 1000, gap: m(s.gap), road: s.road, kit: s.kit, after: m(s.after), ya: m(s.ya) })),
    islands: P.islands.map(pt), caves: [], frags: [], hazards: [],
    ramps: P.ramps.map((q) => ({ ax: m(q.ax), az: m(q.az), bx: m(q.bx), bz: m(q.bz), hw: m(q.hw), y0: m(q.y0), y1: m(q.y1) })),
    engines: [], alcoves: [], vignettes: [], lights: [], tube: null, fork: null, fl: [], fight: null, foe: null, ring: null, spots: {}, chamber: 0,
    deco: [], rifts: [], vents: [], gate: null, walk: null, waystones: [],
    route: { nodes: P.nodes.map((p) => p.map(m)), links: P.links.map((l) => ({ ...l, len: m(l.len) })), main },
    climbs: P.climbs.map((q) => ({ x0: m(q.x0), z0: m(q.z0), x1: m(q.x1), z1: m(q.z1), y0: m(q.y0), y1: m(q.y1), ledges: q.ledges.map(m), face: q.face, d: m(q.d), road: q.road })),
    voids: [], rooms: [], laid: at,
  };
}

export function egSynth9Give(seed, c, geo = 0, band = 0, o = {}) {
  const out = [];
  for (let s = 1; s <= 5; s++) {
    const spec = egSynth9Hall(seed, egFirstHallOf(c) + s - 1, { band, slot: s, c, geo, ...(o[s] ?? {}) });
    egSpecGive(spec);
    out.push(spec);
  }
  return out;
}
