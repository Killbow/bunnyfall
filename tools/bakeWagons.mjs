// Bakes the cart, open wagon, and caravan models out of the committed Blender FBX.
// Run: node tools/bakeWagons.mjs [--fbx=<path>] [--list].

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { readFbx, childNamed } from './fbxRead.mjs';
import { sceneObjects, assertBlenderFill, bakePart, bakeJson, boxOf, mm, listScene, sourcePath, ROOT, BOX_SLACK } from './shipBake.mjs';
import { isMain } from './lib/isMain.mjs';

export const SOURCE_FBX = 'src/assets/wagons/source/Wagon_Cart_Tiny_1.fbx';
export const SCALE = 0.45;

export function toWagon([x, y, z], frame) {
  const s = frame.scale;
  if (frame.forward === '-Y') return [(frame.centre - x) * s, (z - frame.ground) * s, (frame.rear - y) * s];
  if (frame.forward === '+Y') return [(x - frame.centre) * s, (z - frame.ground) * s, (y - frame.rear) * s];
  throw new Error(`a wagon is pulled toward -Y or +Y in Mac's scene, not ${frame.forward}`);
}

const role = (r, box) => Object.freeze({ role: r, box });
const off = Object.freeze({ band: true });
const joined = Object.freeze({ minY: 15 });

const STATION_X = Object.freeze({ caravan: [-10, 10], second: [10, 34], open: [34, 50], cart: [50, 66], tiny: [66, 82] });

export const CARAVAN = Object.freeze({
  key: 'caravan', out: 'src/assets/wagons/caravan.json', band: STATION_X.caravan,
  frame: Object.freeze({ scale: SCALE, forward: '-Y', centre: 0, rear: 4.166549072265625, ground: -3.8911753456700353 }),
  roles: Object.freeze({
    Cube: role('body', [[-3.021, -7.203, -1.797], [3.021, 5.739, 3.923]]),
    'Cube.001': role('bench', [[-2.975, -9.028, -1.693], [2.975, -6.517, 1.806]]),
    'Cube.002': role('step', [[-2.799, -9.728, -1.656], [2.799, -8.894, 0.379]]),
    'Cylinder.001': role('axleRear', [[-3.562, 3.963, -2.286], [3.562, 4.393, -1.834]]),
    'Cylinder.006': role('axleFront', [[-3.562, -4.617, -2.286], [3.562, -4.186, -1.834]]),
    'Cylinder.002': role('wheelRearRight', [[-3.479, 2.562, -3.891], [-3.252, 5.947, -0.42]]),
    'Cylinder.003': role('wheelRearLeft', [[3.248, 2.562, -3.891], [3.475, 5.947, -0.42]]),
    'Cylinder.004': role('wheelFrontLeft', [[3.248, -6.017, -3.891], [3.475, -2.632, -0.42]]),
    'Cylinder.005': role('wheelFrontRight', [[-3.479, -6.017, -3.891], [-3.252, -2.632, -0.42]]),
  }),
});

export const OPEN_WAGON = Object.freeze({
  key: 'openWagon', out: 'src/assets/wagons/openWagon.json', band: STATION_X.open,
  frame: Object.freeze({ scale: SCALE, forward: '-Y', centre: 41.188896484375, rear: 4.166549072265625, ground: -3.8911753456700353 }),
  roles: Object.freeze({
    'Cube.004': role('body', [[38.168, -7.441, -1.797], [44.21, 5.739, 3.926]]),
    'Cube.006': role('bench', [[38.39, -8.391, -1.761], [43.988, -6.731, -0.434]]),
    'Cylinder.013': role('axleRear', [[37.627, 3.963, -2.286], [44.751, 4.393, -1.834]]),
    'Cylinder.018': role('axleFront', [[37.627, -4.617, -2.286], [44.751, -4.186, -1.834]]),
    'Cylinder.014': role('wheelRearRight', [[37.71, 2.562, -3.891], [37.937, 5.947, -0.42]]),
    'Cylinder.015': role('wheelRearLeft', [[44.437, 2.562, -3.891], [44.664, 5.947, -0.42]]),
    'Cylinder.016': role('wheelFrontLeft', [[44.437, -6.017, -3.891], [44.664, -2.632, -0.42]]),
    'Cylinder.017': role('wheelFrontRight', [[37.71, -6.017, -3.891], [37.937, -2.632, -0.42]]),
  }),
});

export const CART = Object.freeze({
  key: 'cart', out: 'src/assets/wagons/cart.json', band: STATION_X.cart,
  frame: Object.freeze({ scale: SCALE, forward: '+Y', centre: 56.990771484375, rear: -4.424051208496094, ground: -2.9596500751362784 }),
  roles: Object.freeze({
    'Cube.007': role('body', [[54.415, -5.502, -2.637], [59.566, 0.858, 0.897]]),
    'Cube.009': role('shaftRight', [[58.104, 0.288, -2.99], [58.384, 2.554, -2.32]]),
    'Cube.010': role('shaftLeft', [[55.263, 0.288, -2.99], [55.543, 2.554, -2.32]]),
    'Cylinder.019': role('axleRear', [[54.156, -4.632, -1.889], [59.904, -4.185, -1.444]]),
    'Cylinder.020': role('wheelRearLeft', [[54.223, -5.69, -2.96], [54.407, -3.13, -0.437]]),
    'Cylinder.021': role('wheelRearRight', [[59.65, -5.69, -2.96], [59.834, -3.13, -0.437]]),
  }),
});

export const WAGONS = Object.freeze([CART, OPEN_WAGON, CARAVAN]);

export const SKIP = Object.freeze(Object.fromEntries([
  ...['Cube.003', 'Cube.005', 'Cylinder.007', 'Cylinder.008', 'Cylinder.009', 'Cylinder.010', 'Cylinder.011', 'Cylinder.012',
    'Cube.012', 'Cube.013', 'Cube.014', 'Cube.015', 'Cube.016', 'Cylinder.022', 'Cylinder.023', 'Cylinder.024'].map((n) => [n, off]),
  ...['Cube.008', 'Cube.011', 'Cube.017'].map((n) => [n, joined]),
]));

function skipFault(o, skip, wagons = WAGONS) {
  const b = boxOf(o.scene);
  if (skip.band) {
    const inside = wagons.find((w) => !(b.max[0] < w.band[0] || b.min[0] > w.band[1]));
    return inside ? `${o.name} was to be another station's and stands in the ${inside.key}'s (X ${b.min[0].toFixed(2)} to ${b.max[0].toFixed(2)})` : null;
  }
  return !(b.min[1] > skip.minY) ? `${o.name} was to be a joined copy beyond Y ${skip.minY} and stands at Y ${b.min[1].toFixed(2)}` : null;
}

function assertFrame(spec, byName) {
  const wheels = Object.entries(spec.roles).filter(([, r]) => r.role.startsWith('wheelRear')).map(([n]) => byName.get(n));
  if (wheels.length !== 2) throw new Error(`the ${spec.key} has ${wheels.length} rear wheels`);
  for (const w of wheels) {
    if (w.origin[1] !== spec.frame.rear) throw new Error(`the ${spec.key}'s ${w.name} turns about scene Y ${w.origin[1]} and its frame's rear is ${spec.frame.rear}`);
    const low = boxOf(w.scene).min[2];
    if (low !== spec.frame.ground) throw new Error(`the ${spec.key}'s ${w.name} stands on scene Z ${low} and its frame's ground is ${spec.frame.ground}`);
  }
  const body = byName.get(Object.entries(spec.roles).find(([, r]) => r.role === 'body')[0]);
  if (body.origin[0] !== spec.frame.centre) throw new Error(`the ${spec.key}'s body stands at scene X ${body.origin[0]} and its frame's centre is ${spec.frame.centre}`);
}

export function bakeWagons(fbxBytes, tree = readFbx(fbxBytes), source = SOURCE_FBX, wagons = WAGONS, skips = SKIP) {
  assertBlenderFill(tree);
  const objects = sceneObjects(tree);
  const byName = new Map(objects.map((o) => [o.name, o]));
  const sha256 = createHash('sha256').update(fbxBytes).digest('hex');
  const creator = childNamed(tree.nodes, 'Creator')?.props[0] ?? null;
  for (const o of objects) {
    const skip = skips[o.name];
    const readers = wagons.filter((w) => w.roles[o.name]);
    if (skip && readers.length) throw new Error(`${o.name} is both skipped and read by the ${readers[0].key}`);
    if (skip) { const fault = skipFault(o, skip, wagons); if (fault) throw new Error(fault); continue; }
    if (readers.length !== 1) throw new Error(`${o.name} plays no part on any wagon - name it in a wagon's roles (or SKIP) after reading the scene`);
  }
  const out = {};
  for (const spec of wagons) {
    for (const n of Object.keys(spec.roles)) if (!byName.has(n)) throw new Error(`the scene has no ${n} (the ${spec.key}'s ${spec.roles[n].role})`);
    assertFrame(spec, byName);
    const place = (p) => toWagon(p, spec.frame);
    const parts = Object.entries(spec.roles).map(([name, r]) => {
      const o = byName.get(name);
      const b = boxOf(o.scene);
      const far = Math.max(...[b.min, b.max].flatMap((end, e) => end.map((v, k) => Math.abs(v - r.box[e][k]))));
      if (!(far <= BOX_SLACK)) throw new Error(`${name} (the ${spec.key}'s ${r.role}) was read standing in the box ${JSON.stringify(r.box)} and stands in ${JSON.stringify(mm(b))}; read the scene again (--list) before re-baking`);
      const part = bakePart(r.role, o, o.polygons.map((_, k) => k), place);
      return { ...part, origin: place(o.origin).map((v) => Math.round(v * 1e4) / 1e4 + 0) };
    });
    out[spec.key] = { bake: 'tools/bakeWagons.mjs', source, sha256, creator, wagon: spec.key, frame: { ...spec.frame }, parts };
  }
  return out;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
  const fbx = resolve(opt('fbx', resolve(ROOT, SOURCE_FBX)));
  const bytes = readFileSync(fbx);
  if (args.includes('--list')) {
    const spec = { roles: Object.fromEntries(WAGONS.flatMap((w) => Object.entries(w.roles).map(([n, r]) => [n, { role: `${w.key}.${r.role}` }]))), skip: SKIP };
    for (const line of listScene(bytes, spec)) console.log(line);
  } else {
    const baked = bakeWagons(bytes, readFbx(bytes), sourcePath(fbx));
    for (const spec of WAGONS) {
      const out = resolve(ROOT, spec.out);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, bakeJson(baked[spec.key]));
      console.log(`${fbx} -> ${out}`);
      for (const p of baked[spec.key].parts) console.log(`  ${p.role.padEnd(16)} ${p.object.padEnd(14)} ${String(p.positions.length / 3).padStart(4)} vertices ${String(p.polygons.length).padStart(3)} polygons ${String(p.triangles.length / 3).padStart(4)} triangles${p.split ? ` (${p.split} cut)` : ''}`);
    }
  }
}
