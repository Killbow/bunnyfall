// Bakes the Oblivion gate model out of its committed Blender FBX into src/assets/gate/oblivionGate.json.
// Run: node tools/bakeGate.mjs [--fbx=<path>] [--out=<path>] [--list].

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { readFbx, childNamed } from './fbxRead.mjs';
import { sceneObjects, assertBlenderFill, fillFace, boxOf, mm, round4, bakeJson, sourcePath, ROOT, BOX_SLACK } from './shipBake.mjs';
import { isMain } from './lib/isMain.mjs';

export const SOURCE_FBX = 'src/assets/gate/source/Oblivion_Gate.fbx';
export const OUT = 'src/assets/gate/oblivionGate.json';

export const OBJECT = 'Cube.1688';
export const BOX = Object.freeze([[-128.626, 58.597, -15.352], [-99.585, 63.727, 15.201]]);
export const FRAME = Object.freeze({ scale: 0.53, x: -114.166103515625, y: 61.1000537109375, ground: -15.352 });

export const toGate = ([x, y, z], frame = FRAME) => [(x - frame.x) * frame.scale, (z - frame.ground) * frame.scale, (y - frame.y) * frame.scale];

export function assertAlone(objects, gate) {
  const g = boxOf(gate.scene);
  for (const o of objects) {
    if (o === gate || !o.scene.length) continue;
    const b = boxOf(o.scene);
    if ([0, 1, 2].every((k) => b.max[k] >= g.min[k] && b.min[k] <= g.max[k])) {
      throw new Error(`${o.name} stands inside the gate's box (${JSON.stringify(mm(b))}) - a piece of the gate exported as an object of its own is not baked; join it to ${gate.name} in Blender, or move it clear`);
    }
  }
}

/** @param {Uint8Array} fbxBytes */
export function bakeGate(fbxBytes, tree = readFbx(fbxBytes), source = SOURCE_FBX) {
  assertBlenderFill(tree);
  const objects = sceneObjects(tree, (name) => name === OBJECT);
  const gate = objects.find((o) => o.name === OBJECT);
  if (!gate) throw new Error(`the scene has no ${OBJECT}`);
  const b = boxOf(gate.scene);
  const off = Math.max(...[b.min, b.max].flatMap((end, e) => end.map((v, k) => Math.abs(v - BOX[e][k]))));
  if (!(off <= BOX_SLACK)) throw new Error(`${OBJECT} was read standing in the box ${JSON.stringify(BOX)} and stands in ${JSON.stringify(mm(b))} - read the scene again (--list) before re-baking`);
  if (gate.origin[0] !== FRAME.x || gate.origin[1] !== FRAME.y) throw new Error(`${OBJECT}'s origin stands at scene (${gate.origin[0]}, ${gate.origin[1]}) and FRAME says (${FRAME.x}, ${FRAME.y}) - set the frame to the object's origin`);
  assertAlone(objects, gate);
  const positions = gate.scene.flatMap((p) => toGate(p).map(round4));
  const polygons = [], material = [], triangles = [], triangleOf = [];
  let split = 0;
  gate.polygons.forEach((poly, k) => {
    // The scene-to-gate map is a mirror, so each polygon and triangle is reversed to keep its front face outward.
    polygons.push([...poly].reverse());
    material.push(gate.polyMaterial[k] >= 0 ? gate.materials[gate.polyMaterial[k]] ?? null : null);
    for (const [a, b2, c] of fillFace(gate, k)) { triangles.push(poly[a], poly[c], poly[b2]); triangleOf.push(k); }
    if (poly.length > 3) split++;
  });
  return {
    bake: 'tools/bakeGate.mjs',
    source,
    sha256: createHash('sha256').update(fbxBytes).digest('hex'),
    creator: childNamed(tree.nodes, 'Creator')?.props[0] ?? null,
    frame: { ...FRAME },
    parts: [{ role: 'gate', object: OBJECT, positions, polygons, material, triangles, triangleOf, split }],
  };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
  const fbx = resolve(opt('fbx', resolve(ROOT, SOURCE_FBX)));
  const out = resolve(opt('out', resolve(ROOT, OUT)));
  const bytes = readFileSync(fbx);
  if (args.includes('--list')) {
    for (const o of sceneObjects(readFbx(bytes), () => false)) if (o.scene.length) console.log(`${o.name.padEnd(14)} ${JSON.stringify(mm(boxOf(o.scene)))}  origin ${JSON.stringify(o.origin)}`);
  } else {
    const baked = bakeGate(bytes, readFbx(bytes), sourcePath(fbx));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bakeJson(baked));
    const p = baked.parts[0];
    console.log(`${fbx} -> ${out}\n  ${p.object}: ${p.positions.length / 3} vertices, ${p.polygons.length} polygons, ${p.triangles.length / 3} triangles (${p.split} cut)`);
  }
}
