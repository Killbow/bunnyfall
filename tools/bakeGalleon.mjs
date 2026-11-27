// Bakes the galleon model out of its committed Blender FBX into src/assets/galleon/galleon.json.
// Run: node tools/bakeGalleon.mjs [--fbx=<path>] [--out=<path>] [--list].

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readFbx } from './fbxRead.mjs';
import { bakeScene, bakePart, bakeJson, toBoat as sceneToBoat, listScene, sourcePath, ROOT } from './shipBake.mjs';
import { isMain } from './lib/isMain.mjs';
export { EXPORT_AXES, BOX_SLACK, round4, sceneObjects, fillFace, sourcePath } from './shipBake.mjs';

export const SOURCE_FBX = 'src/assets/galleon/source/New_Ship.fbx';
export const OUT = 'src/assets/galleon/galleon.json';

export const FRAME = Object.freeze({ scale: 0.7, waterline: 3, midship: 2.7, centreline: 36.24673828125 });

export const ROLES = Object.freeze({
  Cube: Object.freeze({ role: 'hull', box: [[-28.597, 27.878, -3.634], [34.033, 44.616, 13.367]] }),
  'Cube.001': Object.freeze({ role: 'gunDeck', box: [[-23.233, 28.924, 4.547], [31.592, 43.569, 4.547]] }),
  'Cube.002': Object.freeze({ role: 'mainDeck', box: [[-24.532, 28.657, 11.486], [32.581, 43.837, 11.86]] }),
  'Cube.003': Object.freeze({ role: 'hatchAft', box: [[-6.283, 34.167, 11.925], [-1.439, 37.403, 14.207]] }),
  'Cube.004': Object.freeze({ role: 'hatchFore', box: [[6.913, 34.456, 11.701], [11.757, 38.038, 12.111]] }),
  'Cube.005': Object.freeze({ role: 'castle', box: [[-25.736, 28.652, 11.172], [-12.009, 43.854, 18.74]] }),
  'Cube.006': Object.freeze({ role: 'castleParapet', box: [[-18.434, 31.642, 18.567], [-12.121, 40.867, 19.797]] }),
  'Cube.007': Object.freeze({ role: 'bulkhead', box: [[-12.126, 28.788, 3.959], [-11.498, 43.705, 11.612]] }),
  'Cube.008': Object.freeze({ role: 'stairsStarboard', box: [[-18.272, 29.466, 11.596], [-7.926, 31.507, 18.707]] }),
  'Cube.009': Object.freeze({ role: 'balustradePort', box: [[-14.12, 43.587, 10.114], [-3.083, 43.81, 17.037]] }),
  'Cube.010': Object.freeze({ role: 'stairsPort', box: [[-18.272, 41.027, 11.596], [-7.926, 43.067, 18.707]] }),
  'Cube.011': Object.freeze({ role: 'gunportLid', box: [[-4.215, 44.421, 7.037], [-2.971, 46.646, 7.385]] }),
  'Cube.019': Object.freeze({ role: 'deckBeam', box: [[-16.22, 28.991, 10.458], [-15.114, 43.503, 11.565]] }),
  'Cube.013': Object.freeze({ role: 'deckBeam', box: [[-7.727, 28.991, 10.458], [-6.621, 43.503, 11.565]] }),
  'Cube.012': Object.freeze({ role: 'deckBeam', box: [[-0.553, 28.991, 10.458], [0.553, 43.503, 11.565]] }),
  'Cube.018': Object.freeze({ role: 'deckBeam', box: [[5.301, 28.991, 10.458], [6.408, 43.503, 11.565]] }),
  'Cube.017': Object.freeze({ role: 'deckBeam', box: [[12.299, 28.991, 10.458], [13.405, 43.503, 11.565]] }),
  'Cube.016': Object.freeze({ role: 'deckBeam', box: [[17.102, 28.991, 10.458], [18.209, 43.503, 11.565]] }),
  'Cube.014': Object.freeze({ role: 'balustradeStarboard', box: [[-14.12, 28.684, 10.114], [-3.083, 28.907, 17.037]] }),
  'Cube.015': Object.freeze({ role: 'castleRail', box: [[-25.709, 28.661, 18.567], [-12.345, 43.793, 20.567]] }),
  Cylinder: Object.freeze({ role: 'bowsprit', box: [[32.218, 35.605, 12.134], [42.484, 36.887, 16.067]] }),
  'Cylinder.001': Object.freeze({ role: 'mainMast', box: [[1.617, 35.296, 4.102], [3.427, 37.198, 29.69]] }),
  'Cylinder.002': Object.freeze({ role: 'foreMast', box: [[14.422, 35.296, 4.102], [16.232, 37.198, 27.198]] }),
  'Cylinder.003': Object.freeze({ role: 'mainPartner', box: [[0.901, 34.455, 11.615], [4.312, 38.04, 12.839]] }),
  'Cylinder.004': Object.freeze({ role: 'mainStep', box: [[0.901, 34.455, 4.271], [4.312, 38.04, 6.416]] }),
  'Cylinder.005': Object.freeze({ role: 'foreStep', box: [[13.659, 34.455, 4.271], [17.071, 38.04, 6.416]] }),
  'Cylinder.006': Object.freeze({ role: 'forePartner', box: [[13.659, 34.455, 11.615], [17.071, 38.04, 12.839]] }),
  'Cylinder.007': Object.freeze({ role: 'crowsNest', box: [[0.111, 33.528, 28.901], [5.287, 38.968, 31.255]] }),
});
export const SKIP = Object.freeze({
  'Cube.020': Object.freeze({ minY: 60 }), 'Cube.021': Object.freeze({ minY: 60 }), 'Cube.022': Object.freeze({ minY: 60 }),
  'Cube.023': Object.freeze({ minY: 60 }), 'Cube.029': Object.freeze({ minY: 60 }), 'Cube.038': Object.freeze({ minY: 60 }),
  'Cube.044': Object.freeze({ twin: 'Cube' }), 'Cube.043': Object.freeze({ twin: 'Cube.001' }), 'Cube.042': Object.freeze({ twin: 'Cube.002' }),
  'Cube.041': Object.freeze({ twin: 'Cube.005' }), 'Cube.040': Object.freeze({ twin: 'Cube.006' }), 'Cube.039': Object.freeze({ twin: 'Cube.007' }),
  'Cube.035': Object.freeze({ twin: 'Cube.008' }), 'Cube.034': Object.freeze({ twin: 'Cube.009' }), 'Cube.033': Object.freeze({ twin: 'Cube.010' }),
  'Cube.032': Object.freeze({ twin: 'Cube.012' }), 'Cube.031': Object.freeze({ twin: 'Cube.013' }), 'Cube.030': Object.freeze({ twin: 'Cube.014' }),
  'Cube.028': Object.freeze({ twin: 'Cube.015' }), 'Cube.027': Object.freeze({ twin: 'Cube.016' }), 'Cube.026': Object.freeze({ twin: 'Cube.017' }),
  'Cube.025': Object.freeze({ twin: 'Cube.018' }), 'Cube.024': Object.freeze({ twin: 'Cube.019' }),
  'Cylinder.015': Object.freeze({ twin: 'Cylinder' }), 'Cylinder.014': Object.freeze({ twin: 'Cylinder.001' }),
  'Cylinder.013': Object.freeze({ twin: 'Cylinder.002' }), 'Cylinder.012': Object.freeze({ twin: 'Cylinder.003' }),
  'Cylinder.011': Object.freeze({ twin: 'Cylinder.004' }), 'Cylinder.010': Object.freeze({ twin: 'Cylinder.005' }),
  'Cylinder.009': Object.freeze({ twin: 'Cylinder.006' }), 'Cylinder.008': Object.freeze({ twin: 'Cylinder.007' }),
});
export const RUDDER = Object.freeze({ aftOf: -23.3, halfThickness: 0.2 });

export const GALLEON_SPEC = Object.freeze({
  bake: 'tools/bakeGalleon.mjs', source: SOURCE_FBX, frame: FRAME, roles: ROLES, skip: SKIP, hull: 'hull',
  cut(o, all) {
    const rudder = all.filter((k) => o.polygons[k].every((vi) => o.scene[vi][0] < RUDDER.aftOf && Math.abs(o.scene[vi][1] - FRAME.centreline) <= RUDDER.halfThickness));
    if (rudder.length !== 5) throw new Error(`the hull's rudder was five faces aft of ${RUDDER.aftOf} and ${rudder.length} were found`);
    return [bakePart('hull', o, all.filter((k) => !rudder.includes(k)), FRAME), bakePart('rudder', o, rudder, FRAME)];
  },
});

export const toBoat = (p, frame = FRAME) => sceneToBoat(p, frame);

export const bakeGalleon = (fbxBytes, tree = readFbx(fbxBytes), source = SOURCE_FBX) => bakeScene(fbxBytes, GALLEON_SPEC, tree, source);

export const galleonJson = bakeJson;

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
  const fbx = resolve(opt('fbx', resolve(ROOT, SOURCE_FBX)));
  const out = resolve(opt('out', resolve(ROOT, OUT)));
  const bytes = readFileSync(fbx);
  if (args.includes('--list')) {
    for (const line of listScene(bytes, GALLEON_SPEC)) console.log(line);
  } else {
    const baked = bakeGalleon(bytes, readFbx(bytes), sourcePath(fbx));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, galleonJson(baked));
    console.log(`${fbx} -> ${out}`);
    for (const p of baked.parts) console.log(`  ${p.role.padEnd(20)} ${p.object.padEnd(14)} ${String(p.positions.length / 3).padStart(4)} vertices ${String(p.polygons.length).padStart(3)} polygons ${String(p.triangles.length / 3).padStart(4)} triangles${p.split ? ` (${p.split} cut)` : ''}`);
  }
}
