// @ts-check
import { LARGE_BOAT_ARCHIVE, TEX, LARGE_BOAT_TILE, BANDS } from './largeBoatArt.js';
import { MeshBench, colliderOf, prism, box, planarUv, sub, add, dot } from './galleonMesh.js';
import { bakedPartGeometry, benchPart, mastCap, mergeGeometries, chaserGeometry, RUDDER_DEG } from './galleonModel.js';
import { nodeOf, yaw, clone, findNode, constClip, eulerCurve, partOf, prefabBench, inArchive } from './shipKit.js';
import { buildLargeBoatRig, VARIANT_COUNT } from './largeBoatRig.js';
import { CAPSULE_HEIGHT } from '../player/motor.js';

export const LARGE_BOAT_PREFAB_ID = 112411;
// The hull node must hold the tree's first MeshCollider, because the boat takes that collider's node as its frame
// (Boat.MeshObject).
export const LARGE_BOAT_HULL_NODE = 'NewLargeBoat';
const GALLEON_ID = 112412;

export const MEASURED = Object.freeze({
  deckY: 0.9032, gunwaleY: 2.2488, keelY: -0.6147,
  innerX: 1.5214, outerX: 2.0271, capOuterX: 1.8869,
  stemHead: Object.freeze([0, 2.2488, 6.2388]), stemKnee: Object.freeze([0, 1.1773, 5.659]),
  postFoot: Object.freeze([0, -0.6147, -5.907]), postHead: Object.freeze([0, 1.1773, -6.2427]),
  sternRail: Object.freeze({ capY: 2.5939, z0: -5.8977, z1: -3.1467 }),
  // The mast axis sits 1.7 cm to port of the centerline, as the baked model draws it.
  mast: Object.freeze({ x: -0.0171, z: -0.5993, footY: 0.8116, topY: 6.3471 }),
});

export const RUDDER = Object.freeze({ clear: 0.04, y0: 0.08, y1: 1.72, chord: Object.freeze([0.52, 0.4]), t: 0.07, stockR: 0.045, stockTop: 3.42, tiller: 1.68 });
const POST_UP = (() => { const d = sub(MEASURED.postHead, MEASURED.postFoot), l = Math.hypot(...d); return Object.freeze(d.map((v) => v / l)); })();
export const POST_RAKE_DEG = (Math.atan2(POST_UP[2], POST_UP[1]) * 180) / Math.PI;
export const STEP = Object.freeze({ topY: 1.55, z0: -5.0, z1: -3.9, halfX: 1.15, treadY: 1.2266, treadZ1: -3.6 });
// DrivePosition is half a capsule over the step because Come Sail Away places the capsule's center there.
export const HELM = Object.freeze({ stand: Object.freeze([0, STEP.topY + CAPSULE_HEIGHT / 2, -4.4]), trigger: Object.freeze([0, 2.75, -5.1]) });

export const ANCHOR_Z = 3.4;

export const LANTERNS = Object.freeze({ bow: Object.freeze([0.85, 4.6]), bowYaw: -123 });

export const SWIVELS = Object.freeze({ z: Object.freeze([-2.3, 0.3, 2.3]), postX: 1.7, y: 2.62, muzzle: 0.95, bow: Object.freeze([-0.35, 5.3]) });
export const LARGE_BOAT_BATTERIES = Object.freeze({
  broadside: Object.freeze(SWIVELS.z.map((z) => Object.freeze([SWIVELS.postX + SWIVELS.muzzle, SWIVELS.y, z]))),
  bow: Object.freeze([Object.freeze([SWIVELS.bow[0], SWIVELS.y, SWIVELS.bow[1] + SWIVELS.muzzle])]),
});

function faceSkin(role, n, c) {
  const tiled = (rec, key = keyOf(rec)) => ({ rec, uv: (p) => planarUv(p, n, LARGE_BOAT_TILE[key]) });
  const banded = (name) => ({ band: BANDS[name], u: (p) => planarUv(p, n, [LARGE_BOAT_TILE[name][0], 1])[0] });
  const up = n[1] > 0.7, down = n[1] < -0.7;
  switch (role) {
    case 'hull': {
      if (up) return tiled(TEX.trim);
      const core = [0, c[1], Math.max(-4.5, Math.min(4, c[2]))];
      if (dot(n, sub(core, c)) > 0) return tiled(TEX.hullInner);
      if (n[1] < -0.55) return tiled(TEX.hullBottom);
      if (n[2] < -0.6 && c[1] > 0.4) return banded('transom');
      return banded('hullSide');
    }
    case 'deck': return tiled(up ? TEX.deck : down ? TEX.underDeck : TEX.trim);
    case 'mast': case 'bowsprit': return tiled(TEX.spar);
    default: return tiled(TEX.trim);
  }
}
const keyOf = (rec) => Object.keys(TEX).find((k) => TEX[k] === rec);
const drawn = (part, opts = {}) => bakedPartGeometry(part, { ...opts, skin: faceSkin, archive: LARGE_BOAT_ARCHIVE });

function toPost(p) {
  const d = sub(p, MEASURED.postFoot), a = (-POST_RAKE_DEG * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [d[0], d[1] * c - d[2] * s, d[1] * s + d[2] * c];
}
export function rudderGeometry() {
  const bench = new MeshBench(LARGE_BOAT_ARCHIVE);
  const R = RUDDER;
  const at = (y, back) => [0, y, -(R.clear + back)];
  const [c0, c1] = R.chord;
  const f0 = at(R.y0, 0), f1 = at(R.y1, 0), a0 = at(R.y0, c0), a1 = at(R.y1, c1);
  const th = R.t / 2, ta = R.t * 0.3;
  const sides = (s) => [[s * th, ...f0.slice(1)], [s * th, ...f1.slice(1)], [s * ta, ...a1.slice(1)], [s * ta, ...a0.slice(1)]];
  const uvs = [[0, 0], [0, 1.6], [0.5, 1.6], [0.5, 0]];
  for (const s of [1, -1]) bench.quad(TEX.hullBottom, ...sides(s), uvs, [s, 0, 0]);
  const [pS, pP] = [sides(1), sides(-1)];
  bench.quad(TEX.hullBottom, pS[0], pP[0], pP[1], pS[1], uvs, [0, 0, 1]);
  bench.quad(TEX.hullBottom, pS[3], pS[2], pP[2], pP[3], uvs, [0, 0, -1]);
  bench.quad(TEX.hullBottom, pS[1], pP[1], pP[2], pS[2], uvs, [0, 1, 0]);
  bench.quad(TEX.hullBottom, pS[0], pS[3], pP[3], pP[0], uvs, [0, -1, 0]);
  for (const y of [R.y0 + 0.3, (R.y0 + R.y1) / 2, R.y1 - 0.25]) box(bench, TEX.iron, [0, y, -(R.clear + 0.12)], [th + 0.01, 0.03, 0.14], { tile: LARGE_BOAT_TILE.iron });
  prism(bench, TEX.spar, [0, R.y1 - 0.15, -R.clear - 0.05], [0, R.stockTop, -R.clear - 0.05], R.stockR, R.stockR * 0.9, 8, { smooth: true, tileV: LARGE_BOAT_TILE.spar[1] });
  const head = toPostInverse([0, R.stockTop, -R.clear - 0.05]);
  const end = [0, head[1] + 0.05, head[2] + R.tiller];
  prism(bench, TEX.spar, toPost(head), toPost(end), 0.05, 0.035, 8, { smooth: true, tileV: LARGE_BOAT_TILE.spar[1] });
  prism(bench, TEX.iron, [0, R.stockTop - 0.06, -R.clear - 0.05], [0, R.stockTop + 0.07, -R.clear - 0.05], 0.07, 0.07, 8, { smooth: true });
  return bench.finish();
}
export function toPostInverse(q) {
  const a = (POST_RAKE_DEG * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return add([q[0], q[1] * c - q[2] * s, q[1] * s + q[2] * c], MEASURED.postFoot);
}
export function tillerEnd() {
  const head = toPostInverse([0, RUDDER.stockTop, -RUDDER.clear - 0.05]);
  return [0, head[1] + 0.05, head[2] + RUDDER.tiller];
}

export function helmStepGeometry() {
  const bench = new MeshBench(LARGE_BOAT_ARCHIVE);
  const S = STEP, y0 = MEASURED.deckY;
  box(bench, TEX.grate, [0, (y0 + S.topY) / 2, (S.z0 + S.z1) / 2], [S.halfX, (S.topY - y0) / 2, (S.z1 - S.z0) / 2], { tile: LARGE_BOAT_TILE.grate, skip: [0, 1, 3, 4, 5] });
  box(bench, TEX.trim, [0, (y0 + S.topY) / 2, (S.z0 + S.z1) / 2], [S.halfX, (S.topY - y0) / 2, (S.z1 - S.z0) / 2], { tile: LARGE_BOAT_TILE.trim, skip: [2, 3] });
  box(bench, TEX.deck, [0, (y0 + S.treadY) / 2, (S.z1 + S.treadZ1) / 2], [S.halfX * 0.6, (S.treadY - y0) / 2, (S.treadZ1 - S.z1) / 2], { tile: LARGE_BOAT_TILE.deck, skip: [3] });
  return bench.finish();
}

const swivelGeometry = () => inArchive(chaserGeometry(SWIVELS.y - MEASURED.gunwaleY), LARGE_BOAT_ARCHIVE);

export function largeBoatClips() {
  const clips = {}, overrides = {};
  const at = (deg) => [eulerCurve('RudderPost/HelmRudder', [0, deg, 0])];
  const swaps = [];
  for (const [state, deg] of [['Rudder Sailing Left', RUDDER_DEG], ['Rudder Sailing Right', -RUDDER_DEG], ['Rudder Rowing Left', RUDDER_DEG], ['Rudder Rowing Right', -RUDDER_DEG], ['Rudder Rowing Center', 0], ['Rudder Rowing Forward', 0], ['Rudder Rowing Backward', 0]]) {
    const name = `largeboat2/${state}`;
    clips[name] = constClip(name, at(deg));
    swaps.push([`clips/${state}`, name]);
  }
  overrides['largeboat2/Rudder'] = { base: 'Rudder Controller', clips: swaps };
  return { clips, overrides };
}

/**
 * @param {any} bake
 * @param {{ prefabs: Record<string, any>, components: any[] }} csa
 * @param {number} [base]
 */
export function largeBoatPrefab(bake, csa, base = csa.components.length) {
  const { comp, mesh, renderer, meshNode, animator, skinned, finish, meshes } = prefabBench(base, 'largeBoat');
  const cx = { archive: LARGE_BOAT_ARCHIVE, mesh, comp, skinned, meshes, geometryOf: (key) => meshes[key], modBoat: csa.prefabs[String(LARGE_BOAT_PREFAB_ID)] };
  const part = (role) => partOf(bake, role, 'largeBoat');
  const fromPrefab = (id, ship) => (name, at = {}) => {
    const n = clone(findNode(csa.prefabs[String(id)], name));
    if (!n) throw new Error(`largeBoat: Come Sail Away's ${ship} has no ${name}`);
    if (at.p) n.position = [...at.p];
    if (at.r) n.rotation = [...at.r];
    if (at.name) n.name = at.name;
    return n;
  };
  const fromBoat = fromPrefab(LARGE_BOAT_PREFAB_ID, 'large boat'), fromGalleon = fromPrefab(GALLEON_ID, 'galleon');
  const M = MEASURED, D = M.deckY;
  const kids = [];
  const hull = part('hull');

  kids.push(nodeOf('DriveTrigger', { p: HELM.trigger }));
  kids.push(nodeOf('DrivePosition', { p: HELM.stand }));

  kids.push(meshNode('SternRail', 'largeBoat:sternRail', drawn(part('sternRail'))));
  const solid = (role, name, extra = null) => {
    const plain = drawn(part(role));
    if (!extra) return meshNode(name, `largeBoat:${role}`, plain, { collider: true });
    const bench = new MeshBench(LARGE_BOAT_ARCHIVE);
    benchPart(bench, part(role), { offset: [0, 0, 0], role, keep: null, skin: faceSkin });
    extra(bench, part(role));
    return meshNode(name, `largeBoat:${role}`, bench.finish(), { collider: true, colliderGeometry: plain });
  };
  kids.push(solid('deck', 'Deck'));
  kids.push(solid('mast', 'Mast', (b, p) => mastCap(b, p, faceSkin)));
  kids.push(solid('mastStep', 'MastStep'));
  kids.push(solid('bowsprit', 'Bowsprit'));
  kids.push(meshNode('HelmStep', 'largeBoat:helmStep', helmStepGeometry(), { collider: true }));

  mesh('largeBoat:swivel', swivelGeometry());
  const swivel = (name, p, deg) => nodeOf(name, { p, r: yaw(deg), c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'largeBoat:swivel' } }), renderer(meshes['largeBoat:swivel'])] });
  for (const [side, s] of /** @type {const} */ ([['Starboard', 1], ['Port', -1]])) SWIVELS.z.forEach((z, i) => kids.push(swivel(`Swivel${side}${i}`, [s * SWIVELS.postX, M.gunwaleY, z], s > 0 ? 90 : -90)));
  kids.push(swivel('SwivelBow', [SWIVELS.bow[0], M.gunwaleY, SWIVELS.bow[1]], 0));

  mesh('largeBoat:rudder', rudderGeometry());
  kids.push(nodeOf('RudderObject', {
    c: [animator('largeboat2/Rudder')],
    kids: [nodeOf('RudderPost', { p: M.postFoot, r: [Math.sin((POST_RAKE_DEG * Math.PI) / 360), 0, 0, Math.cos((POST_RAKE_DEG * Math.PI) / 360)], kids: [
      nodeOf('HelmRudder', { c: [comp({ type: 'MeshFilter', m_Mesh: { mesh: 'largeBoat:rudder' } }), renderer(meshes['largeBoat:rudder'])] }),
    ] })],
  }));

  const rig = buildLargeBoatRig(cx);
  kids.push(nodeOf('Variants', { kids: rig.variants }));
  kids.push(...rig.kids);
  kids.push(nodeOf('VariantTrigger', { p: [M.mast.x, 1.95, M.mast.z] }));

  kids.push(nodeOf('ActiveObject', { kids: [fromBoat('SkiffAnchor', { p: [0, D + 0.034, ANCHOR_Z] })] }));
  const board = [0, 0.75, 6.75];
  kids.push(nodeOf('IdleObject', { kids: [
    fromBoat('BillboardHelper-253_015:2', { p: [0, M.gunwaleY + 0.08, M.stemHead[2] + 0.05] }),
    nodeOf('BoardTrigger', { p: board, s: [1, 3, 1], kids: [nodeOf('BoardPosition', { p: [0, (D + 0.05 - board[1]) / 3, 4.0 - board[2]], r: yaw(180) })] }),
  ] }));
  kids.push(fromBoat('SkiffCargo', { p: [0, D, 1.5] }));
  kids.push(nodeOf('CargoTrigger', { p: [0, D + 0.85, 1.5] }));
  kids.push(fromBoat('FireObject'), fromBoat('BedObject'));
  kids.push(fromBoat('LanternHookStandPoleTall', { p: [LANTERNS.bow[0], M.gunwaleY, LANTERNS.bow[1]], r: yaw(LANTERNS.bowYaw) }));
  kids.push(fromGalleon('LanternHookStandPoleShort', { p: [-1.735, M.sternRail.capY + 0.003, -4.1], r: yaw(90) }));

  const hullGeometry = drawn(hull);
  mesh('largeBoat:hull:collider', colliderOf(mergeGeometries([hullGeometry, meshes['largeBoat:sternRail']])));
  const hullNode = meshNode(LARGE_BOAT_HULL_NODE, 'largeBoat:hull', hullGeometry, { kids, c: [comp({ type: 'MeshCollider', m_Enabled: true, m_IsTrigger: false, m_Convex: false, m_Mesh: { mesh: 'largeBoat:hull:collider' } })] });
  const root = nodeOf(String(LARGE_BOAT_PREFAB_ID), { kids: [fromBoat('WakeObject'), hullNode, fromBoat('Modifiers')] });
  if (rig.variants.length !== VARIANT_COUNT) throw new Error(`largeBoat: ${rig.variants.length} sail plans where the mod's boat has ${VARIANT_COUNT}`);

  const { components } = finish(root);
  const own = largeBoatClips();
  return {
    prefab: root, components, meshes,
    animation: { clips: { ...own.clips, ...rig.clips }, overrides: { ...own.overrides, ...rig.overrides } },
  };
}
