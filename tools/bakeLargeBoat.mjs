// Bakes the Large Boat model out of its committed Blender FBX into src/assets/ships/largeBoat.json.
// Run: node tools/bakeLargeBoat.mjs [--fbx=<path>] [--out=<path>] [--list].

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readFbx } from './fbxRead.mjs';
import { bakeScene, bakeJson, listScene, sourcePath, ROOT } from './shipBake.mjs';
import { isMain } from './lib/isMain.mjs';
import { SOURCE_FBX as SCENE_FBX } from './bakeCarrack.mjs';

export const SOURCE_FBX = SCENE_FBX;
export const OUT = 'src/assets/ships/largeBoat.json';

export const FRAME = Object.freeze({ scale: 0.72, waterline: 1.6, midship: 6.24, centreline: -10.091069946289062 });

export const BAND = Object.freeze([-14, -6]);

const role = (r, box) => Object.freeze({ role: r, box });
export const ROLES = Object.freeze({
  'Cube.009': role('hull', [[-2.431, -12.906, 0.746], [14.906, -7.276, 4.723]]),
  'Cube.053': role('deck', [[-1.893, -12.776, 2.854], [13.678, -7.359, 2.854]]),
  'Cube.045': role('sternRail', [[-1.951, -12.651, 4.603], [1.869, -7.499, 5.203]]),
  'Cylinder.026': role('mast', [[5.178, -10.419, 2.727], [5.692, -9.715, 10.415]]),
  'Cylinder.027': role('mastStep', [[4.961, -10.73, 2.775], [5.93, -9.404, 3.384]]),
  'Cylinder.030': role('bowsprit', [[13.856, -10.305, 4.33], [16.772, -9.831, 5.447]]),
});

const off = Object.freeze({ band: true });
export const SKIP = Object.freeze(Object.fromEntries([
  ...['Cube', 'Cube.001', 'Cube.002', 'Cube.005', 'Cube.006', 'Cube.007', 'Cube.008', 'Cube.013', 'Cube.014', 'Cube.016', 'Cube.017',
    'Cube.018', 'Cube.019', 'Cube.036', 'Cube.037', 'Cylinder.001', 'Cylinder.002', 'Cylinder.003', 'Cylinder.004', 'Cylinder.005',
    'Cylinder.006', 'Cylinder.007', 'Cylinder.016', 'Cylinder.017', 'Cylinder.018', 'Cylinder.019',
    'Cube.003', 'Cube.004', 'Cube.011', 'Cube.024', 'Cube.025', 'Cube.026', 'Cube.027', 'Cube.028', 'Cube.030', 'Cube.031',
    'Cube.032', 'Cube.033', 'Cube.034', 'Cube.035', 'Cube.039', 'Cube.040', 'Cube.041', 'Cube.042', 'Cube.043', 'Cube.044',
    'Cylinder.008', 'Cylinder.009', 'Cylinder.010', 'Cylinder.011', 'Cylinder.012', 'Cylinder.013', 'Cylinder.014', 'Cylinder.015',
    'Cube.012', 'Cube.020', 'Cube.021', 'Cube.022', 'Cube.023', 'Cube.029', 'Cube.038', 'Cube.051'].map((n) => [n, off]),
  ['Cube.055', Object.freeze({ empty: true })],
]));

export const LARGE_BOAT_SPEC = Object.freeze({ bake: 'tools/bakeLargeBoat.mjs', source: SOURCE_FBX, frame: FRAME, roles: ROLES, skip: SKIP, band: BAND, hull: 'hull' });

export const bakeLargeBoat = (fbxBytes, tree = readFbx(fbxBytes), source = SOURCE_FBX) => bakeScene(fbxBytes, LARGE_BOAT_SPEC, tree, source);

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
  const fbx = resolve(opt('fbx', resolve(ROOT, SOURCE_FBX)));
  const out = resolve(opt('out', resolve(ROOT, OUT)));
  const bytes = readFileSync(fbx);
  if (args.includes('--list')) for (const line of listScene(bytes, LARGE_BOAT_SPEC)) console.log(line);
  else {
    const baked = bakeLargeBoat(bytes, readFbx(bytes), sourcePath(fbx));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bakeJson(baked));
    console.log(`${fbx} -> ${out}`);
    for (const p of baked.parts) console.log(`  ${p.role.padEnd(20)} ${p.object.padEnd(14)} ${String(p.positions.length / 3).padStart(4)} vertices ${String(p.polygons.length).padStart(3)} polygons ${String(p.triangles.length / 3).padStart(4)} triangles${p.split ? ` (${p.split} cut)` : ''}`);
  }
}
