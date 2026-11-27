// Probe: prints the submeshes and connected components of ARCH3D models, draws them to windmill-<id>.png,
// and lists the RMB blocks in BLOCKS.BSA that place them.
// Run: ARENA2_PATH=/path/to/ARENA2 node tools/windmillProbe.mjs [model ids], or --selftest without ARENA2.

import fs from 'node:fs';
import { Arch3dFile } from '../src/formats/arch3dFile.js';

if (process.argv.includes('--selftest')) {
  const quad = (pts) => ({ points: pts.map(([x, y, z]) => ({ x, y, z })) });
  const box = (x0, x1, y0, y1, z0, z1) => [
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]),
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]),
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]),
    quad([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]]),
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]),
    quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]),
  ];
  const tower = { textureArchive: 67, textureRecord: 1, planes: box(-30, 30, 0, 200, 0, 40) };
  tower.totalTriangles = tower.planes.length * 2;
  const sail = { textureArchive: 67, textureRecord: 3, planes: box(-90, 90, 60, 240, 60, 64) };
  sail.totalTriangles = sail.planes.length * 2;

  const comps = components([tower, sail]).map(stat).sort((a, b) => b.tris - a.tris);
  const fail = (m) => { console.error('SELFTEST FAIL:', m); process.exit(1); };
  if (comps.length !== 2) fail(`expected 2 components, found ${comps.length}`);
  const sailComp = comps.find((c) => c.lo[2] >= 60);
  if (!sailComp) fail('the sail component was not separated from the tower');
  const flat = sailComp.span.indexOf(Math.min(...sailComp.span));
  if (flat !== 2) fail(`the sail should be flattest in Z (its turning axis), got ${'XYZ'[flat]}`);
  const towerComp = comps.find((c) => c !== sailComp);
  if (towerComp.hi[2] > 40) fail('the tower component swallowed sail geometry');
  const welded = { textureArchive: 67, textureRecord: 1, planes: [...tower.planes, ...box(-30, 30, 200, 260, 0, 40)] };
  welded.totalTriangles = welded.planes.length * 2;
  if (components([welded]).length !== 1) fail('a welded mesh was reported as separable');
  console.log('SELFTEST PASS: 2 components, sail isolated at z>=60, flattest in Z (its turning axis),');
  console.log('               and a welded mesh still reads as one part.');
  process.exit(0);
}

async function scanBlocks(arena2, ids) {
  const { BlocksFile } = await import('../src/formats/blocksFile.js');
  const blocks = new BlocksFile();
  if (!blocks.load(fs.readFileSync(`${arena2}/BLOCKS.BSA`))) {
    console.error('BLOCKS.BSA did not load as a BLOCKS container');
    return;
  }
  const want = new Set(ids);
  const hits = [];
  let rmbCount = 0;
  for (let i = 0; i < blocks.count; i++) {
    if (blocks.getBlockName(i).endsWith('.RMB') === false) continue;
    rmbCount++;
    let block;
    try {
      block = blocks.getBlock(i);
    } catch {
      continue;
    }
    const rmb = block?.rmbBlock;
    if (!rmb) continue;
    const inSub = [], inMisc = [];
    for (const sub of rmb.subRecords ?? []) {
      for (const o of sub.exterior?.block3dObjectRecords ?? []) {
        if (want.has(o.modelIdNum)) inSub.push(o.modelIdNum);
      }
    }
    for (const o of rmb.misc3dObjectRecords ?? []) {
      if (want.has(o.modelIdNum)) inMisc.push(o.modelIdNum);
    }
    if (inSub.length || inMisc.length) {
      hits.push({ name: blocks.getBlockName(i), inSub, inMisc });
    }
    blocks.discardBlock(i);
  }

  console.log('='.repeat(66));
  console.log(`BLOCK SCAN: ${rmbCount} RMB blocks in BLOCKS.BSA, looking for ${[...want].join(', ')}`);
  if (!hits.length) {
    console.log('\n  *** NO CLASSIC BLOCK PLACES ANY OF THESE MODELS. ***');
    console.log('  The port therefore never stands one of these mills, and a rotor');
    console.log('  wired to a placement that does not happen cannot draw. Placing');
    console.log('  the mill is its own slice - which is what Kamer\'s WorldData');
    console.log('  overrides do on his side.');
    return;
  }
  console.log(`\n  ${hits.length} block(s) place one:`);
  for (const h of hits) {
    console.log(`   ${h.name.padEnd(16)} subrecords: [${h.inSub.join(',') || '-'}]  misc3d: [${h.inMisc.join(',') || '-'}]`);
  }
  console.log('\n  So the placement is real and the mills should be standing;');
  console.log('  if no sail turns, the fault is in the wiring or the hub, not here.');
}

const A = process.env.ARENA2_PATH;
if (!A) {
  console.error('set ARENA2_PATH to your ARENA2 folder, e.g.\n'
    + '  ARENA2_PATH=~/DaggerfallGameFiles/ARENA2 node tools/windmillProbe.mjs');
  process.exit(1);
}
const IDS = (process.argv.slice(2).length ? process.argv.slice(2) : ['41600', '41601', '21411'])
  .map(Number);

const arch3d = new Arch3dFile();
if (!arch3d.load(fs.readFileSync(`${A}/ARCH3D.BSA`))) {
  console.error(`${A}/ARCH3D.BSA did not load as an ARCH3D container`);
  process.exit(1);
}
console.log(`ARCH3D.BSA: ${arch3d.count} records\n`);

function components(sub) {
  const planes = [];
  for (let s = 0; s < sub.length; s++) {
    for (const p of sub[s].planes) planes.push({ s, points: p.points });
  }
  const parent = planes.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const key = (pt) => `${Math.round(pt.x)},${Math.round(pt.y)},${Math.round(pt.z)}`;
  const seen = new Map();
  planes.forEach((pl, i) => {
    for (const pt of pl.points) {
      const k = key(pt);
      if (seen.has(k)) union(i, seen.get(k)); else seen.set(k, i);
    }
  });

  const groups = new Map();
  planes.forEach((pl, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(pl);
  });
  return [...groups.values()];
}

function stat(planes) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let cx = 0, cy = 0, cz = 0, n = 0, tris = 0;
  const subs = new Set();
  for (const pl of planes) {
    subs.add(pl.s);
    tris += pl.points.length - 2;
    for (const p of pl.points) {
      const v = [p.x, p.y, p.z];
      for (let i = 0; i < 3; i++) { if (v[i] < lo[i]) lo[i] = v[i]; if (v[i] > hi[i]) hi[i] = v[i]; }
      cx += p.x; cy += p.y; cz += p.z; n++;
    }
  }
  const span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  return { lo, hi, span, centre: [cx / n, cy / n, cz / n], verts: n, tris, subs: [...subs] };
}

const COLOURS = [[228, 94, 76], [86, 170, 226], [126, 204, 108], [232, 196, 84],
  [186, 124, 220], [96, 214, 200], [235, 148, 190], [170, 170, 170]];

for (const id of IDS) {
  const rec = arch3d.getRecordIndex(id);
  console.log('='.repeat(66));
  if (rec < 0) { console.log(`model ${id}: NOT IN ARCH3D.BSA`); continue; }
  const mesh = arch3d.getMesh(rec);
  console.log(`model ${id}  (record ${rec})  radius ${mesh.radius.toFixed(2)}`);
  console.log(`  size   ${mesh.size.x} x ${mesh.size.y} x ${mesh.size.z}`);
  console.log(`  ${mesh.totalVertices} vertices, ${mesh.totalTriangles} triangles, `
    + `${mesh.subMeshes.length} submesh(es)\n`);

  console.log('  SUBMESHES (grouped by texture - if the sail has its own, WM2 is trivial)');
  mesh.subMeshes.forEach((sm, i) => {
    const s = stat(sm.planes.map((p) => ({ s: i, points: p.points })));
    console.log(`   [${i}] texture ${sm.textureArchive}_${sm.textureRecord}  `
      + `${sm.planes.length} planes, ${sm.totalTriangles} tris  `
      + `span ${s.span.map((v) => v.toFixed(0)).join(' x ')}`);
  });

  const comps = components(mesh.subMeshes).map(stat)
    .sort((a, b) => b.tris - a.tris);
  console.log(`\n  CONNECTED COMPONENTS: ${comps.length}`
    + (comps.length > 1 ? '  <- a separable part exists' : '  <- ONE welded mesh; the split must be geometric'));
  comps.forEach((c, i) => {
    const flat = c.span.indexOf(Math.min(...c.span));
    console.log(`   [${i}] ${c.tris} tris, ${c.verts} verts, submesh(es) ${c.subs.join(',')}\n`
      + `       bbox   ${c.lo.map((v) => v.toFixed(0)).join(' ')}  ->  ${c.hi.map((v) => v.toFixed(0)).join(' ')}\n`
      + `       centre ${c.centre.map((v) => v.toFixed(1)).join(' ')}\n`
      + `       span   ${c.span.map((v) => v.toFixed(0)).join(' x ')}   flattest in ${'XYZ'[flat]}`
      + `  <- a sail cross is flat in its OWN turning axis`);
  });

  const VIEWS = [[0, 1, 'front XY'], [2, 1, 'side ZY'], [0, 2, 'top XZ']];
  const CELL = 300, PAD = 10;
  // pngjs loads only here, so the printed numbers and --selftest work without it.
  let PNG;
  try {
    ({ PNG } = await import('pngjs'));
  } catch {
    console.log('\n  (pngjs not installed - numbers only, no picture. npm i pngjs)');
    continue;
  }
  const png = new PNG({ width: CELL * 3, height: CELL });
  png.data.fill(18);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;

  const all = stat(components(mesh.subMeshes).flat());
  VIEWS.forEach(([ax, ay, label], vi) => {
    const w = Math.max(all.span[ax], all.span[ay]) || 1;
    const scale = (CELL - PAD * 2) / w;
    const ox = vi * CELL + CELL / 2, oy = CELL / 2;
    const px = (p) => Math.round(ox + (p[ax] - all.centre[ax]) * scale);
    const py = (p) => Math.round(oy - (p[ay] - all.centre[ay]) * scale);
    const put = (x, y, c) => {
      if (x < vi * CELL || x >= (vi + 1) * CELL || y < 0 || y >= CELL) return;
      const o = (y * CELL * 3 + x) << 2;
      png.data[o] = c[0]; png.data[o + 1] = c[1]; png.data[o + 2] = c[2];
    };
    const line = (a, b, c) => {
      const x0 = px(a), y0 = py(a), x1 = px(b), y1 = py(b);
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let s = 0; s <= steps; s++) {
        put(Math.round(x0 + (x1 - x0) * s / steps), Math.round(y0 + (y1 - y0) * s / steps), c);
      }
    };
    components(mesh.subMeshes).sort((a, b) => stat(b).tris - stat(a).tris)
      .forEach((planes, ci) => {
        const col = COLOURS[ci % COLOURS.length];
        for (const pl of planes) {
          for (let k = 0; k < pl.points.length; k++) {
            const a = pl.points[k], b = pl.points[(k + 1) % pl.points.length];
            line([a.x, a.y, a.z], [b.x, b.y, b.z], col);
          }
        }
      });
    console.log(`   view ${vi}: ${label}`);
  });
  const out = `windmill-${id}.png`;
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log(`\n  wrote ${out}  (front | side | top, one colour per component)`);
}

await scanBlocks(A, IDS);
