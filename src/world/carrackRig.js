// @ts-check
// Sail names, kinds, and sizes match the mod's carrack so `GetSailPower` and the trim read her as hull 4. The
// auto-trim braces square yards to 45 degrees and the lateen to 90. So the shrouds lead well aft, and the mizzen
// carries no shroud or backstay for the lateen to cut.
import { MeshBench, prism, rope, box, add, scl, norm, lerp3 } from './galleonMesh.js';
import { CARRACK_ARCHIVE, TEX, CARRACK_TILE } from './carrackArt.js';
import { nodeOf, inArchive } from './shipKit.js';
import { rigBench, squareSailPose, yardGeometry, YARD_R, GRID, lateenBoomY, lateenSailPose, lateenSparsGeometry } from './galleonRig.js';
import { FIX_DEFORMATIONS_INTERVAL } from './skinnedBake.js';

export const CARRACK_RIG = Object.freeze({
  masts: Object.freeze({
    fore: Object.freeze({ z: 17.2475, top: 16.7586 }),
    main: Object.freeze({ z: 8.9293, top: 20.0783 }),
    mizzen: Object.freeze({ z: -1.279, top: 20.0783 }),
  }),
  footY: 1.6016, footR: 0.8, headR: 0.5116,
  deckY: 7.8082, railY: 8.6343, railCap: Object.freeze([5.807, 6.086]),
  bowsprit: Object.freeze({
    heel: Object.freeze([0, 8.4136, 22.714]), end: Object.freeze([0, 10.818, 30.652]), heelR: 0.515, endR: 0.369,
    underHeel: Object.freeze([0, 8.028, 22.872]), underEnd: Object.freeze([0, 10.531, 30.731]),
  }),
  stem: Object.freeze([0, 2.2, 23.83]),
  flagY: 21.75,
});
const MASTS = CARRACK_RIG.masts;
function mastRadius(mast, y) {
  const R = CARRACK_RIG;
  return R.footR + (R.headR - R.footR) * (y - R.footY) / (MASTS[mast].top - R.footY);
}
function mastSideFace(mast, y, s) {
  const r = mastRadius(mast, y);
  return [s * 0.7694 * r, y, MASTS[mast].z - 0.25 * r];
}
export const bowspritUnder = (t) => lerp3(CARRACK_RIG.bowsprit.underHeel, CARRACK_RIG.bowsprit.underEnd, t);
export function bowspritUnderAt(z) {
  const { underHeel: a, underEnd: b } = CARRACK_RIG.bowsprit;
  return bowspritUnder((z - a[2]) / (b[2] - a[2]));
}

// Order matches the order Come Sail Away's walk finds the sails, and the mod reads each sail's kind and size from
// its node name.
export const SAILS = Object.freeze([
  Object.freeze({ key: 'Spritsail', kind: 'square', size: 'Small', mast: 'bowsprit', z: 28.4, yardY: 9.35, drop: 3.0, headW: 6.0, footW: 7.0, yardSpan: 7.0, belly: 0.12, aback: 0.2 }),
  Object.freeze({ key: 'ForeCourse', kind: 'square', size: 'Large', mast: 'fore', yardY: 15.5, drop: 4.55, headW: 10.2, footW: 11.4, yardSpan: 11.4, belly: 0.15, aback: 0.18 }),
  Object.freeze({ key: 'MainCourse', kind: 'square', size: 'Large', mast: 'main', yardY: 15.2, drop: 3.75, headW: 10.4, footW: 11.2, yardSpan: 11.2, belly: 0.15, aback: 0.18 }),
  Object.freeze({ key: 'MainTopsail', kind: 'square', size: '', mast: 'main', yardY: 18.9, drop: 3.25, headW: 7.6, footW: 9.4, yardSpan: 8.8, belly: 0.075, aback: 0.12 }),
  Object.freeze({ key: 'Mizzen', kind: 'lateen', size: '', mast: 'mizzen', fore: Object.freeze([0, 12.55, 3.4]), aft: Object.freeze([0, 21.3, -10.3]), side: 0.85, footY: 12.4, clewZ: -9.6,
    yardR: Object.freeze([0.19, 0.08]), throat: 1.2, peakIn: 0.4, belly: 1.1, pin: 2.0 }),
]);
export { GRID };
const SAIL_CLIP_S = 1;
const BAKE = Object.freeze({ rope: Object.freeze({ everyFrame: true }), canvasTimer: (k) => Math.fround(k * FIX_DEFORMATIONS_INTERVAL / SAILS.length) });

const yardOffset = (sail) => (sail.mast === 'bowsprit' ? 0 : mastRadius(sail.mast, sail.yardY) + 0.24);
export const boomPivot = (sail) => [0, sail.yardY, sail.mast === 'bowsprit' ? sail.z : MASTS[sail.mast].z];
function liftHead(sail) {
  if (sail.mast === 'bowsprit') return [0, bowspritUnderAt(sail.z)[1] - sail.yardY, 0];
  return [0, MASTS[sail.mast].top - 0.12 - sail.yardY, 0];
}

export const MIZZEN = Object.freeze({ z: MASTS.mizzen.z, top: MASTS.mizzen.top, radius: (y) => mastRadius('mizzen', y) });

const CHANNELS = Object.freeze({
  fore: Object.freeze({ feet: Object.freeze([10.75, 11.4, 12.05]), headY: 16.1, inX: 6.1075, plateX: Object.freeze([6.1698, 6.1744, 6.179]) }),
  main: Object.freeze({ feet: Object.freeze([1.2, 1.8, 2.4, 3.0]), headY: 19.3, inX: 6.0858, plateX: Object.freeze([6.1022, 6.1064, 6.1107, 6.1149]) }),
  topY: 8.4, thick: 0.14, width: 0.52, deadeyeR: 0.11, deadeyeH: 0.22, chainDrop: 0.42,
});
function shroudLines() {
  const lines = [];
  const C = CHANNELS;
  for (const s of [-1, 1]) {
    for (const mast of /** @type {const} */ (['main', 'fore'])) {
      const xd = C[mast].inX + C.width - C.deadeyeR;
      for (const [k, z] of C[mast].feet.entries()) {
        const deadeye = [s * xd, C.topY, z];
        lines.push({ mast, side: s, head: mastSideFace(mast, C[mast].headY, s), foot: [s * xd, C.topY + C.deadeyeH, z], deadeye, plate: [s * C[mast].plateX[k], C.topY - C.thick - C.chainDrop, z] });
      }
    }
  }
  return lines;
}
function ratlineLines() {
  const out = [];
  const lines = shroudLines();
  for (const mast of ['main', 'fore']) for (const s of [-1, 1]) {
    const set = lines.filter((l) => l.mast === mast && l.side === s);
    for (let k = 0; k + 1 < set.length; k++) {
      const a = set[k], b = set[k + 1];
      const at = (l, y) => lerp3(l.foot, l.head, (y - l.foot[1]) / (l.head[1] - l.foot[1]));
      for (let y = 9.05; y < Math.min(a.head[1], b.head[1]) - 1.6; y += 0.42) out.push({ mast, side: s, a: at(a, y), b: at(b, y) });
    }
  }
  return out;
}
function stayLines() {
  const foreHead = 16.6, mainHead = 19.9, mainFoot = 13.4, mizzenHead = 19.9, mizzenFoot = 14.1;
  const B = CARRACK_RIG.bowsprit;
  const endTop = add(B.end, scl(norm([0, B.end[2] - B.heel[2], -(B.end[1] - B.heel[1])]), B.endR));
  return {
    forestay: { head: [0, foreHead, MASTS.fore.z + mastRadius('fore', foreHead)], foot: endTop, r: 0.045 },
    mainstay: { head: [0, mainHead, MASTS.main.z + mastRadius('main', mainHead)], foot: [0, mainFoot, MASTS.fore.z - 0.809 * mastRadius('fore', mainFoot)], r: 0.05 },
    mizzenstay: { head: [0, mizzenHead, MASTS.mizzen.z + mastRadius('mizzen', mizzenHead)], foot: [0, mizzenFoot, MASTS.main.z - 0.809 * mastRadius('main', mizzenFoot)], r: 0.04 },
    bobstay: { head: bowspritUnderAt(27.0), foot: [...CARRACK_RIG.stem], r: 0.04 },
  };
}

function standingRiggingGeometry() {
  const lines = shroudLines(), rungs = ratlineLines();
  const C = CHANNELS;
  const shrouds = (mast) => {
    const bench = new MeshBench(CARRACK_ARCHIVE);
    for (const l of lines.filter((q) => q.mast === mast)) {
      rope(bench, TEX.rope, [l.foot, l.head], 0.032);
      prism(bench, TEX.trim, l.deadeye, l.foot, C.deadeyeR, C.deadeyeR, 6, { smooth: true });
      prism(bench, TEX.iron, add(l.deadeye, [0, 0.05, 0]), l.plate, 0.03, 0.03, 4);
    }
    for (const r of rungs.filter((q) => q.mast === mast)) rope(bench, TEX.rope, [r.a, r.b], 0.014, { sides: 3 });
    const feet = C[mast].feet, z0 = Math.min(...feet) - 0.35, z1 = Math.max(...feet) + 0.35;
    for (const s of [-1, 1]) box(bench, TEX.trim, [s * (C[mast].inX + C.width / 2), C.topY - C.thick / 2, (z0 + z1) / 2], [C.width / 2, C.thick / 2, (z1 - z0) / 2], { tile: CARRACK_TILE.trim });
    return bench.finish();
  };
  const S = stayLines();
  const stays = new MeshBench(CARRACK_ARCHIVE);
  for (const k of ['forestay', 'mainstay', 'mizzenstay', 'bobstay']) rope(stays, TEX.rope, [S[k].head, S[k].foot], S[k].r);
  const flagstaff = new MeshBench(CARRACK_ARCHIVE);
  prism(flagstaff, TEX.spar, [0, MASTS.main.top - 0.05, MASTS.main.z], [0, CARRACK_RIG.flagY + 0.15, MASTS.main.z], 0.09, 0.05, 6, { smooth: true, tileV: 2 });
  return { mainShrouds: shrouds('main'), foreShrouds: shrouds('fore'), stays: stays.finish(), flagstaff: flagstaff.finish() };
}

const BELAYS = Object.freeze({
  spritBrace: Object.freeze([2.5, 9.29, 21.0]),
  foreBrace: Object.freeze([5.95, CARRACK_RIG.railY, 7.4]),
  foreSheet: Object.freeze([5.95, CARRACK_RIG.railY, 13.5]),
  mainBrace: Object.freeze([5.95, CARRACK_RIG.railY, -2.0]),
  mainTopBrace: Object.freeze([5.95, CARRACK_RIG.railY, -2.6]),
  mainSheet: Object.freeze([5.95, CARRACK_RIG.railY, 5.2]),
});

export function buildCarrackRig(cx) {
  const kids = [];
  const { clips, overrides, meshNode, sailNode, running } = rigBench(cx, { ship: 'carrack', clipPrefix: 'carrack2', timerOf: (key) => BAKE.canvasTimer(SAILS.findIndex((x) => x.key === key)) });
  const own = (geometry) => inArchive(geometry, CARRACK_ARCHIVE);

  // The auto-trim reads the first child of each boom, so the sail goes first.
  const squares = {};
  for (const s of SAILS.filter((x) => x.kind === 'square')) {
    const d = yardOffset(s), mastR = s.mast === 'bowsprit' ? 0 : mastRadius(s.mast, s.yardY);
    const poses = { stowed: squareSailPose(s, d, mastR, 'stowed'), left: squareSailPose(s, d, mastR, 'aback'), center: squareSailPose(s, d, mastR, 'center'), right: squareSailPose(s, d, mastR, 'full') };
    const { sail, bones } = sailNode(`${s.key}Square${s.size}Sail`, poses, GRID.square, 'Sail Controller', s.key);
    const yard = meshNode(`${s.key}Yard`, `carrack:yard:${s.key}`, own(yardGeometry(s.yardSpan, d, liftHead(s))));
    const armP = nodeOf(`${s.key}YardArmPort`, { p: [-(s.yardSpan / 2 - 0.2), 0, d] });
    const armS = nodeOf(`${s.key}YardArmStarboard`, { p: [s.yardSpan / 2 - 0.2, 0, d] });
    const boom = nodeOf(`${s.key}SquareBoom`, { p: boomPivot(s), kids: [sail, yard, armP, armS] });
    kids.push(boom);
    squares[s.key] = { s, boom, sail, bones, armP, armS };
  }
  const l = SAILS.find((x) => x.kind === 'lateen');
  const lPoses = { stowed: lateenSailPose(l, MIZZEN, 'stowed'), left: lateenSailPose(l, MIZZEN, 'left'), center: lateenSailPose(l, MIZZEN, 'center'), right: lateenSailPose(l, MIZZEN, 'right') };
  const lSail = sailNode(`${l.key}Lateen${l.size}Sail`, lPoses, GRID.lateen, 'Sail Controller', l.key);
  const lSpars = meshNode(`${l.key}LateenYard`, 'carrack:lateen', lateenSparsGeometry(l, MIZZEN, CARRACK_ARCHIVE));
  kids.push(nodeOf(`${l.key}LateenBoom`, { p: [0, lateenBoomY(l, MIZZEN), MIZZEN.z], kids: [lSail.sail, lSpars] }));

  const standing = standingRiggingGeometry();
  for (const [name, key] of [['MainShrouds', 'mainShrouds'], ['ForeShrouds', 'foreShrouds'], ['Stays', 'stays'], ['Flagstaff', 'flagstaff']]) kids.push(meshNode(name, `carrack:rigging:${key}`, standing[key]));

  const railBone = (name, p) => { const n = nodeOf(name, { p }); kids.push(n); return { bone: n, world: p }; };
  const local = (boom, child) => add(boom.position, child.position);
  const sided = (p, s) => [s * p[0], p[1], p[2]];
  const braceTo = { Spritsail: BELAYS.spritBrace, ForeCourse: BELAYS.foreBrace, MainCourse: BELAYS.mainBrace, MainTopsail: BELAYS.mainTopBrace };
  for (const { s, boom, armP, armS } of Object.values(squares)) {
    for (const [arm, side] of [[armP, -1], [armS, 1]]) {
      const name = `${s.key}Brace${side > 0 ? 'Starboard' : 'Port'}`;
      kids.push(running(name, { bone: arm, world: local(boom, arm) }, railBone(`${name}Belay`, sided(braceTo[s.key], side))));
    }
  }
  // The sheets hang under the sail node so a course struck from sight hides them too.
  const [NU, NV] = GRID.square;
  for (const [key, belay] of [['ForeCourse', BELAYS.foreSheet], ['MainCourse', BELAYS.mainSheet]]) {
    const { boom, sail, bones } = squares[key];
    for (const [k, side] of [[(NV - 1) * NU, -1], [NV * NU - 1, 1]]) {
      const name = `${key}Sheet${side > 0 ? 'Starboard' : 'Port'}`;
      sail.children.push(running(name, { bone: bones[k], world: add(boom.position, bones[k].position) }, railBone(`${name}Belay`, sided(belay, side)), boom.position));
    }
  }
  return { kids, clips, overrides };
}

export { YARD_R };
