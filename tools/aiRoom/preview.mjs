#!/usr/bin/env node
// AI-ROOMS: draw a room top-down. `ARENA2_PATH=... node tools/aiRoom/preview.mjs <BLOCK.RDB | file.json> <out.png>`
import { readFileSync } from 'node:fs';
import { loadKit, planOf, writePng } from './kit.mjs';
const [src, out] = process.argv.slice(2);
const kit = loadKit();
const json = /\.json$/i.test(src) ? JSON.parse(readFileSync(src, 'utf8')) : kit.classicJson(src);
const lay = kit.layoutJson(json, /\.json$/i.test(src) ? 'ZAI00000.RDB' : src);
const p = planOf(lay, kit.getModel);
writePng(out, p.width, p.height, p.rgba);
console.log(`${src}: ${lay.placements.length} models -> ${out}`);
