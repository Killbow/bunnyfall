// Bakes the townsfolk outfits for the Morrowind body from the committed export, paintings, and retail skeleton.
// Run: node tools/bakeTownsfolk.mjs.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFbx } from './fbxRead.mjs';
import { bakeMesh, objectMaterials } from './fbxMesh.mjs';
import { mipChain, writeDds } from './meshTexture.mjs';
import { skinnedMeshesToNif } from './nifWrite.mjs';
import { jointWeights } from './skinWeights.mjs';
import { readPng } from './pngIO.mjs';
import { isMain } from './lib/isMain.mjs';
import { RETAIL_SKELETON, plateBind, rigSegments, objectTree, BOX_SLACK, HELM_LIFT, SCENE_BODY } from './bakeSteelPlate.mjs';

export const SOURCE = 'src/assets/mw/source/Townsfolk.fbx';

export const PAINTINGS = Object.freeze({
  tunic_bretonnpc: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Tunic_Bretonnpc.png', named: 'bretonnpc/Material.019_2D_View_<UDIM>.png' }),
  hose_bretonnpc: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Hose_Bretonnpc.png', named: 'bretonnpc/Material.020_2D_View_<UDIM>.png' }),
  sleeves_bretonnpc: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Sleeves_Bretonnpc.png', named: 'bretonnpc/Material.018_2D_View_<UDIM>.png' }),
  tunic_nord1: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Tunic_Nord1.png', named: 'nord1/Material.019_2D_View_<UDIM>.png' }),
  breeches_nord1: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Breeches_Nord1.png', named: 'nord1/Material.020_2D_View_<UDIM>.png' }),
  tunic_nord2: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Tunic_Nord2.png', named: 'nord2/Material.019_2D_View_<UDIM>.png' }),
  tunic_nord3: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Tunic_Nord3.png', named: 'NORD3/Material.019_2D_View_<UDIM>.png' }),
  shoulders_nord3: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Shoulders_Nord3.png', named: 'NORD3/Material.018_2D_View_<UDIM>.png' }),
  kit_redguard1: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Kit_Redguard1.png', named: 'redguard1/DefaultMaterial_2D_View_<UDIM>.png' }),
  skirt_redguard2: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Skirt_Redguard2.png', named: 'Redguard2/Material.007_2D_View_<UDIM>.png' }),
  boots_redguard2: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Boots_Redguard2.png', named: 'Redguard2/14124.png' }),
  robe_redguard3: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Robe_Redguard3.png', named: 'redguard3/tunic_2D_View_<UDIM>.png' }),
  robe_redguard4: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Robe_Redguard4.png', named: 'redguard4/tunic_2D_View_<UDIM>.png' }),
  dress_redguardwoman1: Object.freeze({ png: 'src/assets/mw/source/Townsfolk_Dress_Redguardwoman1.png', named: 'redguardwoman1/DefaultMaterial_2D_View_<UDIM>.png' }),
});

export const textureName = (paint) => `townsfolk_${paint}.dds`;
export const meshFile = (archive) => `src/assets/mw/meshes/townsfolk_${archive}.nif`;
export const textureFile = (paint) => `src/assets/mw/textures/townsfolk_${paint}.dds`;

const object = (materials, box) => Object.freeze({ materials: Object.freeze(materials), box: Object.freeze(box) });
const MW = 'Morrowind_TPose_Models (2)/Morrowind_Symmetric_TPose_Models';
export const OBJECTS = Object.freeze({
  'Breton_Male.018': object(['bretonnpc/Material.020_2D_View_<UDIM>.png', 'bretonnpc/Material.019_2D_View_<UDIM>.png', 'bretonnpc/Material.018_2D_View_<UDIM>.png',
    `${MW}/Breton_Male/textures/tx_b_n_breton_m_ll.png`, `${MW}/Breton_Male/textures/tx_b_n_breton_m_ul.png`, `${MW}/Breton_Male/textures/tx_b_n_breton_m_ll.png`,
    `${MW}/Breton_Male/textures/tx_b_n_generic_m_g00.png`, 'redguard1/DefaultMaterial_2D_View_<UDIM>.png'], [[-47.91, -12.08, 0], [47.91, 14.84, 119.46]]),
  'Breton_Male.028': object(['nord2/Material.019_2D_View_<UDIM>.png', 'bretonnpc/Material.020_2D_View_<UDIM>.png', 'bretonnpc/Material.019_2D_View_<UDIM>.png',
    'bretonnpc/Material.018_2D_View_<UDIM>.png', `${MW}/Breton_Male/textures/tx_b_n_breton_m_ll.png`, `${MW}/Breton_Male/textures/tx_b_n_breton_m_ul.png`,
    `${MW}/Breton_Male/textures/tx_b_n_breton_m_ll.png`, `${MW}/Breton_Male/textures/tx_b_n_generic_m_g00.png`, 'redguard1/DefaultMaterial_2D_View_<UDIM>.png'],
  [[-20.87, -12.08, 0], [20.87, 14.84, 136.16]]),
  'Breton_Male.038': object(['nord1/Material.019_2D_View_<UDIM>.png', 'nord1/Material.020_2D_View_<UDIM>.png', 'bretonnpc/Material.020_2D_View_<UDIM>.png',
    'bretonnpc/Material.019_2D_View_<UDIM>.png', 'bretonnpc/Material.018_2D_View_<UDIM>.png', `${MW}/Breton_Male/textures/tx_b_n_breton_m_ll.png`,
    `${MW}/Breton_Male/textures/tx_b_n_breton_m_ul.png`, `${MW}/Breton_Male/textures/tx_b_n_breton_m_ll.png`, `${MW}/Breton_Male/textures/tx_b_n_generic_m_g00.png`,
    'redguard1/DefaultMaterial_2D_View_<UDIM>.png', 'Redguard2/14124.png'], [[-60.41, -12.08, 0], [60.41, 14.84, 119.46]]),
  'Plane Remeshed': object(['redguardwoman1/DefaultMaterial_2D_View_<UDIM>.png'], [[-25.28, -13.25, 0.44], [25.28, 16.84, 135.76]]),
  'Redguard_Male.002': object(['redguard1/DefaultMaterial_2D_View_<UDIM>.png'], [[-44.13, -10.48, 5.42], [44.13, 11.8, 116.46]]),
  'Redguard_Male.003': object(['Redguard2/Material.007_2D_View_<UDIM>.png', `${MW}/Breton_Male/textures/tx_b_n_breton_m_ll.png`, `${MW}/Breton_Male/textures/tx_b_n_breton_m_ul.png`,
    `${MW}/Breton_Male/textures/tx_b_n_breton_m_ll.png`, `${MW}/Breton_Male/textures/tx_b_n_generic_m_g00.png`, 'redguard1/DefaultMaterial_2D_View_<UDIM>.png',
    'NORD3/Material.018_2D_View_<UDIM>.png', 'NORD3/Material.019_2D_View_<UDIM>.png'], [[-60.41, -11.54, 0], [60.41, 14.84, 119.46]]),
  'Redguard_Male.007': object(['Redguard2/Material.007_2D_View_<UDIM>.png'], [[-16.06, -11.74, 0], [15.96, 14.84, 88.34]]),
  'Redguard_Male.010': object([`${MW}/Redguard_Male/textures/tx_b_n_redguard_m_ll.png`, `${MW}/Redguard_Male/textures/tx_b_n_redguard_m_lf.png`,
    'redguard1/DefaultMaterial_2D_View_<UDIM>.png', `${MW}/Redguard_Male/textures/tx_b_n_redguard_m_uf.png`, `${MW}/Redguard_Male/textures/tx_b_n_redguard_m_ll.png`,
    `${MW}/Redguard_Male/textures/tx_b_n_redguard_m_ul.png`, 'npc guy/material_6_2D_View_<UDIM>.png', 'redguard4/tunic_2D_View_<UDIM>.png'], [[-25.95, -12.08, 5.42], [25.95, 12.37, 119.12]]),
  'Redguard_Male.028': object(['redguard1/DefaultMaterial_2D_View_<UDIM>.png', 'redguard3/tunic_2D_View_<UDIM>.png'], [[-25.95, -12.08, 5.42], [25.95, 12.37, 119.12]]),
});

export const CUT = Object.freeze({ 'Breton_Male.018': Object.freeze([6]) });

const outfit = (archive, obj, shapes) => Object.freeze({ archive, object: obj, shapes: Object.freeze(shapes.map(([material, paint]) => Object.freeze({ material, paint }))) });
export const OUTFITS = Object.freeze([
  outfit(381, 'Redguard_Male.028', [[0, 'kit_redguard1'], [1, 'robe_redguard3']]),
  outfit(382, 'Redguard_Male.002', [[0, 'kit_redguard1']]),
  outfit(383, 'Redguard_Male.010', [[2, 'kit_redguard1'], [7, 'robe_redguard4']]),
  outfit(384, 'Redguard_Male.007', [[0, 'skirt_redguard2']]),
  outfit(385, 'Breton_Male.018', [[0, 'hose_bretonnpc'], [1, 'tunic_bretonnpc'], [2, 'sleeves_bretonnpc'], [7, 'kit_redguard1']]),
  outfit(386, 'Breton_Male.038', [[0, 'tunic_nord1'], [1, 'breeches_nord1'], [9, 'kit_redguard1'], [10, 'boots_redguard2']]),
  outfit(387, 'Redguard_Male.003', [[0, 'skirt_redguard2'], [5, 'kit_redguard1'], [6, 'shoulders_nord3'], [7, 'tunic_nord3']]),
  outfit(388, 'Breton_Male.028', [[0, 'tunic_nord2'], [1, 'hose_bretonnpc']]),
  outfit(389, 'Breton_Male.028', [[0, 'tunic_nord1'], [1, 'hose_bretonnpc']]),
  outfit(390, 'Breton_Male.038', [[0, 'tunic_nord1'], [1, 'breeches_nord1'], [9, 'kit_redguard1'], [10, 'skirt_redguard2']]),
  outfit(398, 'Plane Remeshed', [[0, 'dress_redguardwoman1']]),
]);

export const RECOLOURS = Object.freeze({ 389: Object.freeze([0]), 390: Object.freeze([10]) });

export function outfitFrame(mesh) {
  const t = mesh.bake.sceneTranslation;
  const off = (v, k) => +(k < 2 ? v - t[k] : v).toFixed(6);
  return { ...mesh, positions: mesh.positions.map((v, i) => off(v, i % 3)), bounds: { min: mesh.bounds.min.map(off), max: mesh.bounds.max.map(off) } };
}

export function materialMesh(tree, name, material) {
  return outfitFrame(bakeMesh(objectTree(tree, name), { name: `${name} ${material}`, placement: 'scene', forward: '+y', up: '+z', material }));
}

export function checkObject(tree, name) {
  const want = OBJECTS[name];
  if (!want) throw new Error(`no object "${name}" is read for an outfit`);
  const names = objectMaterials(tree, name);
  if (JSON.stringify(names) !== JSON.stringify(want.materials)) {
    throw new Error(`"${name}" names ${JSON.stringify(names)} on its materials, not ${JSON.stringify(want.materials)} - re-read the export before baking it`);
  }
  const whole = outfitFrame(bakeMesh(objectTree(tree, name), { name, placement: 'scene', forward: '+y', up: '+z' }));
  const off = [0, 1, 2].flatMap((k) => [Math.abs(whole.bounds.min[k] - want.box[0][k]), Math.abs(whole.bounds.max[k] - want.box[1][k])]);
  if (Math.max(...off) > BOX_SLACK) throw new Error(`"${name}" stands at ${JSON.stringify(whole.bounds)}, not where it was read (${JSON.stringify(want.box)}) - re-read the export before baking it`);
  return names;
}

export const PACK_ARM_FALL = 0.5;

const rotY = (ang) => { const c = Math.cos(ang), s = Math.sin(ang); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const mul3 = (r, a) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => r[i * 3] * a[j] + r[i * 3 + 1] * a[3 + j] + r[i * 3 + 2] * a[6 + j]));
const turn = (r, p, t) => { const d = [t[0] - p[0], t[1] - p[1], t[2] - p[2]]; return [0, 1, 2].map((i) => p[i] + r[i * 3] * d[0] + r[i * 3 + 1] * d[1] + r[i * 3 + 2] * d[2]); };

export function packBind(skeletonBytes) {
  const bind = plateBind(skeletonBytes);
  for (const S of ['R', 'L']) {
    const arm = [...bind.keys()].filter((n) => n.startsWith(`Bip01 ${S} `) && !/(Thigh|Calf|Foot|Toe)/.test(n));
    const sgn = S === 'R' ? 1 : -1;
    const C = bind.get(`Bip01 ${S} Clavicle`).t;
    const U0 = bind.get(`Bip01 ${S} UpperArm`).t;
    const a = Math.atan2(C[2] - U0[2], Math.abs(U0[0] - C[0]));
    const Ra = rotY(-sgn * a);
    for (const n of arm) { const m = bind.get(n); bind.set(n, { a: mul3(Ra, m.a), t: turn(Ra, C, m.t) }); }
    const U = bind.get(`Bip01 ${S} UpperArm`).t;
    const H = bind.get(`Bip01 ${S} Hand`).t;
    const now = Math.atan2(U[2] - H[2], Math.abs(H[0] - U[0]));
    const want = Math.asin(PACK_ARM_FALL / Math.hypot(H[0] - U[0], H[2] - U[2]));
    const Rb = rotY(sgn * (want - now));
    for (const n of arm.filter((x) => x !== `Bip01 ${S} Clavicle`)) { const m = bind.get(n); bind.set(n, { a: mul3(Rb, m.a), t: turn(Rb, U, m.t) }); }
  }
  return bind;
}

const bone = (name, to, joint = null) => Object.freeze({ name, to, ...(joint ? { parent: joint[0], blend: joint[1] } : {}) });
const PELVIS = bone('Bip01 Pelvis', 'Bip01 Spine');
const SPINE = Object.freeze([
  PELVIS,
  bone('Bip01 Spine', 'Bip01 Spine1', ['Bip01 Pelvis', 3]),
  bone('Bip01 Spine1', 'Bip01 Spine2', ['Bip01 Spine', 3]),
  bone('Bip01 Spine2', 'Bip01 Neck', ['Bip01 Spine1', 3]),
  bone('Bip01 Neck', 'Bip01 Head', ['Bip01 Spine2', 2]),
]);
const side = (S) => {
  const b = (n) => `Bip01 ${S} ${n}`;
  return {
    clavicle: (joint) => bone(b('Clavicle'), b('UpperArm'), joint),
    upperArm: bone(b('UpperArm'), b('Forearm'), [b('Clavicle'), 2.5]),
    arm: [
      bone(b('Forearm'), b('Hand'), [b('UpperArm'), 2.5]),
      bone(b('Hand'), { mid: [b('Finger1'), b('Finger2')] }, [b('Forearm'), 1.5]),
      bone(b('Finger0'), b('Finger01'), [b('Hand'), 1]), bone(b('Finger01'), { local: [2.5, 0, 0] }, [b('Finger0'), 0.75]),
      bone(b('Finger1'), b('Finger11'), [b('Hand'), 1]), bone(b('Finger11'), { local: [2.5, 0, 0] }, [b('Finger1'), 0.75]),
      bone(b('Finger2'), b('Finger21'), [b('Hand'), 1]), bone(b('Finger21'), { local: [2.5, 0, 0] }, [b('Finger2'), 0.75]),
    ],
    thigh: bone(b('Thigh'), b('Calf'), ['Bip01 Pelvis', 3]),
    leg: [bone(b('Calf'), b('Foot'), [b('Thigh'), 3]), bone(b('Foot'), { local: [5.5, 9, 0] }, [b('Calf'), 2])],
  };
};
const R = side('R');
const L = side('L');
export const ARM_REACH = 6;
export const ARM_FADE = 1.5;
const reaching = (b) => Object.freeze({ ...b, reach: ARM_REACH, fade: ARM_FADE });
const TORSO = Object.freeze([...SPINE, reaching(R.clavicle(['Bip01 Spine2', 2])), reaching(L.clavicle(['Bip01 Spine2', 2])), reaching(R.upperArm), reaching(L.upperArm)]);
export const HANG_TOP = 84;
export const HANG_SHARE = 1;
export const HANG_CENTRE = 4;
export const KNEE_BLEND = 3;
export function hangOf(bind) {
  const hip = (bind.get('Bip01 L Thigh').t[2] + bind.get('Bip01 R Thigh').t[2]) / 2;
  const knee = (bind.get('Bip01 L Calf').t[2] + bind.get('Bip01 R Calf').t[2]) / 2;
  return { mode: 'over', root: 'Bip01 Pelvis', legs: ['Bip01 L Thigh', 'Bip01 R Thigh'], top: HANG_TOP, bottom: hip, share: HANG_SHARE, centre: HANG_CENTRE,
    calves: ['Bip01 L Calf', 'Bip01 R Calf'], knee, kneeBlend: KNEE_BLEND };
}

export const RIGS = Object.freeze({
  hood: Object.freeze({ bones: Object.freeze([bone('Bip01 Neck', 'Bip01 Head'), bone('Bip01 Head', { local: [10, 0, 0] }, ['Bip01 Neck', 2])]) }),
  'arm:R': Object.freeze({ bones: Object.freeze([R.clavicle(), R.upperArm, ...R.arm]) }),
  'arm:L': Object.freeze({ bones: Object.freeze([L.clavicle(), L.upperArm, ...L.arm]) }),
  'leg:R': Object.freeze({ bones: Object.freeze([PELVIS, R.thigh, ...R.leg]) }),
  'leg:L': Object.freeze({ bones: Object.freeze([PELVIS, L.thigh, ...L.leg]) }),
  torso: Object.freeze({ bones: TORSO }),
  skirt: Object.freeze({ bones: Object.freeze([...TORSO, bone('Bip01 L Thigh', 'Bip01 L Calf'), bone('Bip01 R Thigh', 'Bip01 R Calf'),
    bone('Bip01 L Calf', 'Bip01 L Foot'), bone('Bip01 R Calf', 'Bip01 R Foot')]), hang: true }),
  hip: Object.freeze({ bones: Object.freeze([PELVIS, bone('Bip01 Spine', 'Bip01 Spine1', ['Bip01 Pelvis', 3])]) }),
});

export const HIP_JOINTS = 76;
export function islandClass({ min, max }) {
  if (min[2] > 112 && max[2] > SCENE_BODY.head.max[2] && Math.max(-min[0], max[0]) < 12) return 'hood';
  if (min[2] > 100 && min[0] > 6) return 'arm:R';
  if (min[2] > 100 && max[0] < -6) return 'arm:L';
  if (min[0] < -3 && max[0] > 3) return min[2] < HIP_JOINTS ? 'skirt' : 'torso';
  if (min[2] < 70) return min[0] + max[0] > 0 ? 'leg:R' : 'leg:L';
  return min[2] < HIP_JOINTS ? 'skirt' : 'hip';
}

export function islandsOf(mesh) {
  const n = mesh.positions.length / 3;
  const key = (v) => `${Math.round(mesh.positions[v * 3] * 1e4)},${Math.round(mesh.positions[v * 3 + 1] * 1e4)},${Math.round(mesh.positions[v * 3 + 2] * 1e4)}`;
  const at = new Map(); const rep = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = key(v); if (!at.has(k)) at.set(k, at.size); rep[v] = at.get(k); }
  const parent = Array.from({ length: at.size }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = find(rep[mesh.indices[i]]);
    for (const k of [1, 2]) { const b = find(rep[mesh.indices[i + k]]); if (a !== b) parent[b] = a; }
  }
  const groups = new Map();
  for (let v = 0; v < n; v++) { const g = find(rep[v]); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(v); }
  return [...groups.values()].map((verts) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const v of verts) for (let k = 0; k < 3; k++) { const x = mesh.positions[v * 3 + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
    return { verts, min, max };
  }).sort((p, q) => p.verts[0] - q.verts[0]);
}

export function liftHoods(mesh) {
  const up = new Set(islandsOf(mesh).filter((isl) => islandClass(isl) === 'hood').flatMap((isl) => isl.verts));
  if (!up.size) return mesh;
  const positions = mesh.positions.map((v, i) => (i % 3 === 2 && up.has((i - 2) / 3) ? +(v + HELM_LIFT).toFixed(6) : v));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  positions.forEach((v, i) => { const k = i % 3; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; });
  return { ...mesh, positions, bounds: { min, max } };
}

export function shapeWeights(mesh, bind) {
  const weights = new Array(mesh.positions.length / 3);
  const used = new Set();
  const hanging = hangOf(bind);
  for (const isl of islandsOf(mesh)) {
    const rig = RIGS[islandClass(isl)];
    const hang = rig.hang ? hanging : null;
    const pos = isl.verts.flatMap((v) => [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]]);
    const lists = jointWeights(pos, rigSegments(rig.bones, bind), { hang });
    isl.verts.forEach((v, k) => { weights[v] = lists[k]; for (const [b] of lists[k]) used.add(b); });
  }
  return { weights, used };
}

const ALL_BONES = [...new Set(Object.values(RIGS).flatMap((r) => r.bones.map((b) => b.name)))];

export function bakeTownsfolk({ source, pngs, skeleton }) {
  if (!skeleton) throw new Error('no skeleton to skin the outfits in - the bake reads its bind (RETAIL_SKELETON)');
  const tree = readFbx(Buffer.from(source));
  const bind = packBind(skeleton);
  for (const name of Object.keys(OBJECTS)) checkObject(tree, name);
  const meshes = new Map();
  const meshOf = (name, material) => {
    const k = `${name}|${material}`;
    if (!meshes.has(k)) meshes.set(k, liftHoods(materialMesh(tree, name, material)));
    return meshes.get(k);
  };
  const outfits = OUTFITS.map((o) => {
    const shapes = o.shapes.map((s, i) => {
      if (CUT[o.object]?.includes(s.material)) throw new Error(`${o.archive}: material ${s.material} of "${o.object}" is Morrowind's own skin, cut from the export - no outfit wears it`);
      const mesh = meshOf(o.object, s.material);
      const { weights, used } = shapeWeights(mesh, bind);
      return { mesh, texture: textureName(s.paint), name: `Tri Chest ${i}`, weights, used };
    });
    const bones = ALL_BONES.filter((n) => shapes.some((s) => s.used.has(n))).map((name) => ({ name, bind: bind.get(name) }));
    const nif = skinnedMeshesToNif(shapes.map(({ mesh, texture, name, weights }) => ({ mesh, texture, name, weights })), { node: `Townsfolk ${o.archive}`, bones });
    return { archive: o.archive, shapes, nif };
  });
  const textures = Object.keys(PAINTINGS).map((paint) => {
    if (!pngs[paint]) throw new Error(`no painting for ${paint}`);
    const png = readPng(pngs[paint]);
    return { paint, png, dds: writeDds(mipChain({ width: png.width, height: png.height, data: png.data })) };
  });
  return { outfits, textures, bind };
}

const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };

if (isMain(import.meta.url)) {
  const missing = Object.entries(PAINTINGS).filter(([, p]) => !existsSync(p.png)).map(([paint]) => paint);
  if (missing.length) { console.error(`no painting yet for: ${missing.join(', ')}`); process.exit(1); }
  const r = bakeTownsfolk({
    source: readFileSync(SOURCE),
    pngs: Object.fromEntries(Object.entries(PAINTINGS).map(([paint, p]) => [paint, readFileSync(p.png)])),
    skeleton: readFileSync(RETAIL_SKELETON),
  });
  for (const o of r.outfits) {
    save(meshFile(o.archive), o.nif);
    const tris = o.shapes.reduce((n, s) => n + s.mesh.indices.length / 3, 0);
    console.log(`  ${String(o.archive).padEnd(4)} ${String(tris).padStart(5)} triangles, ${o.shapes.length} shapes -> ${meshFile(o.archive)}  ${o.nif.length} bytes`);
  }
  for (const t of r.textures) {
    save(textureFile(t.paint), t.dds);
    console.log(`  ${t.paint.padEnd(22)} ${t.png.width}x${t.png.height} -> ${textureFile(t.paint)}  ${t.dds.length} bytes`);
  }
}
