#!/usr/bin/env node
// Prints the hash of the raid towns table that the relay's RAID_TOWNS_SHA256 setting pins (server/wrangler.toml).
// Run: node tools/raidTowns.mjs --arena2 <path to ARENA2>

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MapsFile } from '../src/formats/mapsFile.js';
import { ImgFile } from '../src/formats/imgFile.js';
import { raidRegions } from '../src/worldEvents/raidingParties.js';
import { raidTownsCanon, raidTownsHash, readRaidTowns } from '../src/net/raidLaw.js';
import { isMain } from './lib/isMain.mjs';

export async function raidTownsOf(arena2) {
  const file = (name) => {
    const p = join(arena2, name);
    if (!existsSync(p)) throw new Error(`${name} not found in ${arena2}`);
    return new Uint8Array(readFileSync(p));
  };
  const maps = new MapsFile();
  maps.load(file('MAPS.BSA'), file('CLIMATE.PAK'), file('POLITIC.PAK'));
  const picker = new ImgFile();
  picker.load(file('TRAV0I01.IMG'), 'TRAV0I01.IMG');
  const regions = raidRegions(maps, picker.getDFBitmap().data) ?? [];
  const text = raidTownsCanon(regions);
  return { regions, text, hash: await raidTownsHash(text) };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--arena2');
  const dir = at >= 0 ? args[at + 1] : null;
  if (!dir) { console.error('usage: node tools/raidTowns.mjs --arena2 <path to ARENA2>'); process.exit(2); }
  const { regions, text, hash } = await raidTownsOf(dir);
  if (!regions.length || !readRaidTowns(text)) { console.error('no towns table read back - are these the game\'s own files?'); process.exit(1); }
  const towns = regions.reduce((n, g) => n + g.towns.length, 0);
  console.log(`${regions.length} regions, ${towns} towns, ${text.length} bytes`);
  console.log(`RAID_TOWNS_SHA256 = "${hash}"`);
}
