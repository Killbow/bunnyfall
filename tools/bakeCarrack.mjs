// Bakes the carrack's parts from the committed Blender scene into src/assets/ships/carrack.json.
// Run with `node tools/bakeCarrack.mjs [--fbx=<path>] [--out=<path>] [--list]`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readFbx } from './fbxRead.mjs';
import { bakeScene, bakePart, bakeJson, listScene, sourcePath, ROOT } from './shipBake.mjs';
import { isMain } from './lib/isMain.mjs';

export const SOURCE_FBX = 'src/assets/ships/source/Tiny_Ship.fbx';
export const OUT = 'src/assets/ships/carrack.json';

export const FRAME = Object.freeze({ scale: 0.8, waterline: 2.1, midship: 4.07, centreline: 11.98037353515625 });

export const BAND = Object.freeze([3, 23]);

const role = (r, box) => Object.freeze({ role: r, box });
export const ROLES = Object.freeze({
  'Cube.001': role('hull', [[-28.597, 3.612, -3.634], [36.745, 20.349, 14.284]]),
  'Cube.002': role('gunDeck', [[-23.233, 4.658, 4.547], [31.592, 19.303, 4.547]]),
  'Cube.005': role('mainDeck', [[-24.532, 4.39, 11.486], [32.581, 19.57, 11.86]]),
  Cube: role('houseAft', [[-21.78, 7.892, 11.768], [-15.696, 15.942, 16.54]]),
  'Cube.006': role('houseMid', [[-7.057, 9.849, 11.768], [-0.973, 14.113, 16.3]]),
  'Cube.007': role('houseFore', [[6.804, 9.109, 11.768], [12.139, 15.274, 16.3]]),
  'Cube.008': role('houseDoor', [[-1.294, 10.029, 11.483], [-1.048, 13.93, 15.486]]),
  'Cube.016': role('sternRail', [[-25.07, 4.181, 12.047], [-11.49, 19.738, 14.047]]),
  'Cube.037': role('gunportLid', [[-4.558, 19.771, 7.037], [-1.047, 21.996, 7.385]]),
  'Cube.036': role('deckBeam', [[-16.22, 4.724, 10.458], [-15.114, 19.236, 11.565]]),
  'Cube.014': role('deckBeam', [[-7.727, 4.724, 10.458], [-6.621, 19.236, 11.565]]),
  'Cube.013': role('deckBeam', [[-0.553, 4.724, 10.458], [0.553, 19.236, 11.565]]),
  'Cube.019': role('deckBeam', [[5.301, 4.724, 10.458], [6.408, 19.236, 11.565]]),
  'Cube.018': role('deckBeam', [[12.299, 4.724, 10.458], [13.405, 19.236, 11.565]]),
  'Cube.017': role('deckBeam', [[17.102, 4.724, 10.458], [18.209, 19.236, 11.565]]),
  'Cylinder.001': role('bowsprit', [[32.218, 11.339, 12.134], [42.484, 12.621, 16.067]]),
  'Cylinder.019': role('foreMast', [[24.819, 11.03, 4.102], [26.629, 12.932, 23.048]]),
  'Cylinder.016': role('forePartner', [[24.057, 10.189, 11.615], [27.468, 13.774, 12.839]]),
  'Cylinder.018': role('foreStep', [[24.057, 10.189, 4.271], [27.468, 13.774, 6.416]]),
  'Cylinder.003': role('mainMast', [[14.422, 11.03, 4.102], [16.232, 12.932, 27.198]]),
  'Cylinder.007': role('mainPartner', [[13.659, 10.189, 11.615], [17.071, 13.774, 12.839]]),
  'Cylinder.006': role('mainStep', [[13.659, 10.189, 4.271], [17.071, 13.774, 6.416]]),
  'Cylinder.005': role('mizzenMast', [[1.661, 11.03, 4.102], [3.471, 12.932, 27.198]]),
  'Cylinder.002': role('mizzenPartner', [[0.899, 10.189, 11.615], [4.31, 13.774, 12.839]]),
  'Cylinder.004': role('mizzenStep', [[0.899, 10.189, 4.271], [4.31, 13.774, 6.416]]),
  'Cylinder.017': role('aftStep', [[-13.403, 10.189, 4.271], [-9.991, 13.774, 6.416]]),
});

const off = Object.freeze({ band: true });
export const SKIP = Object.freeze(Object.fromEntries([
  ...['Cube.003', 'Cube.004', 'Cube.011', 'Cube.024', 'Cube.025', 'Cube.026', 'Cube.027', 'Cube.028', 'Cube.030', 'Cube.031',
    'Cube.032', 'Cube.033', 'Cube.034', 'Cube.035', 'Cube.039', 'Cube.040', 'Cube.041', 'Cube.042', 'Cube.043', 'Cube.044',
    'Cylinder.008', 'Cylinder.009', 'Cylinder.010', 'Cylinder.011', 'Cylinder.012', 'Cylinder.013', 'Cylinder.014', 'Cylinder.015',
    'Cube.009', 'Cube.012', 'Cube.045', 'Cube.053', 'Cylinder.026', 'Cylinder.027', 'Cylinder.030',
    'Cube.020', 'Cube.021', 'Cube.022', 'Cube.023', 'Cube.029', 'Cube.038', 'Cube.051'].map((n) => [n, off]),
  ['Cube.055', Object.freeze({ empty: true })],
]));

export const RUDDER = Object.freeze({ aftOf: -23.3, halfThickness: 0.2 });

export const CARRACK_SPEC = Object.freeze({
  bake: 'tools/bakeCarrack.mjs', source: SOURCE_FBX, frame: FRAME, roles: ROLES, skip: SKIP, band: BAND, hull: 'hull',
  cut(o, all) {
    const rudder = all.filter((k) => o.polygons[k].every((vi) => o.scene[vi][0] < RUDDER.aftOf && Math.abs(o.scene[vi][1] - FRAME.centreline) <= RUDDER.halfThickness));
    if (rudder.length !== 5) throw new Error(`her rudder was five faces aft of ${RUDDER.aftOf} and ${rudder.length} were found`);
    return [bakePart('hull', o, all.filter((k) => !rudder.includes(k)), FRAME), bakePart('rudder', o, rudder, FRAME)];
  },
});

export const bakeCarrack = (fbxBytes, tree = readFbx(fbxBytes), source = SOURCE_FBX) => bakeScene(fbxBytes, CARRACK_SPEC, tree, source);

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
  const fbx = resolve(opt('fbx', resolve(ROOT, SOURCE_FBX)));
  const out = resolve(opt('out', resolve(ROOT, OUT)));
  const bytes = readFileSync(fbx);
  if (args.includes('--list')) for (const line of listScene(bytes, CARRACK_SPEC)) console.log(line);
  else {
    const baked = bakeCarrack(bytes, readFbx(bytes), sourcePath(fbx));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bakeJson(baked));
    console.log(`${fbx} -> ${out}`);
    for (const p of baked.parts) console.log(`  ${p.role.padEnd(20)} ${p.object.padEnd(14)} ${String(p.positions.length / 3).padStart(4)} vertices ${String(p.polygons.length).padStart(3)} polygons ${String(p.triangles.length / 3).padStart(4)} triangles${p.split ? ` (${p.split} cut)` : ''}`);
  }
}
