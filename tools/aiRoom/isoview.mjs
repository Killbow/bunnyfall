#!/usr/bin/env node
// AI-ROOMS: isometric renders of rooms. `ARENA2_PATH=<arena2> node tools/aiRoom/isoview.mjs <out dir> ["<Room Title>" ...]`
// (all rooms when none is named). Two views a room (from the south-east and the north-west), floors coloured by height.
// The classic models are read from your own ARENA2 only for the doors; no Daggerfall art is drawn.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadKit } from './kit.mjs';
import { allRooms } from './all.mjs';
import { pieceModels } from './pieces.mjs';
import { writeIsoPair } from './iso.mjs';

const [dir, ...titles] = process.argv.slice(2);
if (!dir) { console.error('usage: isoview.mjs <out dir> [room titles]'); process.exit(2); }
mkdirSync(dir, { recursive: true });
const kit = loadKit();
for (const m of pieceModels()) kit.addCustomModel(m);
for (const { spec, blockName, shellId, index, position } of allRooms()) {
  const res = spec.finish({ shellId, index, blockName, position });
  kit.addCustomModel(res.shell);
  if (titles.length && !titles.includes(spec.name)) continue;
  const lay = kit.layoutJson(res.block, blockName);
  writeIsoPair(join(dir, `${blockName.replace('.RDB', '')}-${spec.name.replace(/\W+/g, '-')}.png`), lay, kit.getModel);
  console.log(`${blockName} ${spec.name}`);
}
