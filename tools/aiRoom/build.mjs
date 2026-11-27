#!/usr/bin/env node
// AI-ROOMS: build every room and piece into vendor/bunnyfall-ai-rooms/, check them, and draw previews.
//   ARENA2_PATH=<arena2> node tools/aiRoom/build.mjs [--preview <dir>] [--only <substring>] [--check]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKit, planOf, writePng } from './kit.mjs';
import { pieceModels } from './pieces.mjs';
import { allRooms, FIRST_BLOCK_INDEX } from './all.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vendor', 'bunnyfall-ai-rooms');
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const kit = loadKit();
const models = pieceModels();
for (const m of models) kit.addCustomModel(m);
const out = [];
let bad = 0;
for (const { spec, blockName, shellId, index, position } of allRooms()) {
  const res = spec.finish({ shellId, index, blockName, position });
  kit.addCustomModel(res.shell);
  const lay = kit.layoutJson(res.block, blockName);
  out.push({ spec, res, blockName });
  const s = res.stats;
  console.log(`${blockName} ${spec.name}: ${s.tris} tris, ${s.reached}/${s.open} cells, ports ${s.ports}, ${s.enemy} foes ${s.loot} loot ${s.quest} quest, ${s.light} lights${res.problems.length ? '  PROBLEMS:' : ''}`);
  for (const p of res.problems) { console.log('   - ' + p); bad++; }
  if (arg('--preview')) { mkdirSync(arg('--preview'), { recursive: true }); const pl = planOf(lay, kit.getModel, 10); writePng(join(arg('--preview'), `${blockName}.png`), pl.width, pl.height, pl.rgba); }
}
if (!process.argv.includes('--check')) {
  mkdirSync(join(root, 'Models'), { recursive: true }); mkdirSync(join(root, 'Rooms'), { recursive: true });
  for (const m of models) writeFileSync(join(root, 'Models', `${m.id}.json`), JSON.stringify(m));
  for (const { res, blockName } of out) { writeFileSync(join(root, 'Models', `${res.shell.id}.json`), JSON.stringify(res.shell)); writeFileSync(join(root, 'Rooms', `${blockName}.json`), JSON.stringify(res.block)); }
  writeFileSync(join(root, 'rooms.json'), JSON.stringify(out.map(({ spec, res, blockName }, n) => ({ name: blockName, title: spec.name, kind: spec.kind, index: FIRST_BLOCK_INDEX + n, shell: res.shell.id, note: spec.note })), null, 1));
}
console.log(bad ? `${bad} problem(s)` : 'all rooms pass');
process.exit(bad ? 1 : 0);
