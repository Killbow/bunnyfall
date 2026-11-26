#!/usr/bin/env node
// Checks or writes the class skins' listing, proving each vendored file matches its source in the archive.
// Run: node tools/classSkinsListing.mjs <unpacked sets dir> <ExistingClasses.rar> [--write].

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const VENDOR = new URL('../vendor/class-skins/Textures/', import.meta.url);
const LISTING = new URL('../vendor/class-skins/class-skins.files.json', import.meta.url);

const SETS = [
  [1523, 'Acrobate male/Acrobate male'], [1524, 'Acrobat Female/Acrobat Female'],
  [1536, 'Assassin Males/Males'], [1537, 'Assassin Female/Female'],
  [1538, 'Burglar male/Final'], [1539, 'Burglar Female/Final'],
  [1504, 'Male Bounty Hunter/KAMER - Bounty Hunter'], [1535, 'Dark Acolayed/Dark Acolayed'],
  [1513, 'DB Male/Finished'], [1514, 'DF Vanilla/DF Vanilla'],
  [1530, 'Healer male/Finished'], [1527, 'Healer male/Finished/Shield'], [1528, 'Healer Female/Finished'],
  [1519, 'Monk Male/Finished'], [1520, 'Monk Female/Final'],
  [1525, 'Nightblade Male/Male 2'], [1526, 'Nightblade Female/2'],
  [1529, 'Pirate_Male/Pirate_Male'], [1540, 'Sorccerer Male/Cape'], [1541, 'Sorccer Female/Final'],
];
// A trailing underscore after the frame is a typo in the artist's file name, not a withdrawn frame.
const NAME = /^(?:(\d+)_)?(\d+)-(\d+)_?\.png$/i;
const sha = (b) => createHash('sha256').update(b).digest('hex');

function mapping(setsDir) {
  const from = {};
  for (const [archive, folder] of SETS) {
    const dir = join(setsDir, folder);
    const byRecord = new Map();
    for (const f of readdirSync(dir)) {
      if (!statSync(join(dir, f)).isFile()) continue;
      const m = NAME.exec(f);
      if (!m) throw new Error(`${folder}/${f}: not a <record>-<frame>.png`);
      if (m[1] && Number(m[1]) !== archive) throw new Error(`${folder}/${f}: names archive ${m[1]}, the set is ${archive}`);
      const rec = Number(m[2]);
      if (!byRecord.has(rec)) byRecord.set(rec, []);
      byRecord.get(rec).push([Number(m[3]), f]);
    }
    for (const [rec, frames] of byRecord) {
      frames.sort((a, b) => a[0] - b[0]);
      frames.forEach(([, f], i) => { from[`${archive}_${rec}-${i}.png`] = `${folder}/${f}`; });
    }
  }
  return from;
}

const [setsDir, rar, flag] = process.argv.slice(2);
if (!setsDir || !rar) { console.error('usage: node tools/classSkinsListing.mjs <unpacked sets dir> <ExistingClasses.rar> [--write]'); process.exit(2); }
const from = mapping(setsDir);
const bad = [];
for (const [name, src] of Object.entries(from)) {
  const archive = name.split('_')[0];
  let mine;
  try { mine = readFileSync(new URL(`${archive}/${name}`, VENDOR)); } catch { bad.push(`${name}: not vendored`); continue; }
  if (sha(mine) !== sha(readFileSync(join(setsDir, src)))) bad.push(`${name}: not the bytes of ${src}`);
}
const vendored = readdirSync(VENDOR, { withFileTypes: true }).filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(new URL(`${d.name}/`, VENDOR)));
for (const f of vendored) if (!from[f]) bad.push(`${f}: vendored, and in no set`);
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
const listing = {
  ModTitle: 'Daggerfall class skins',
  Archive: 'ExistingClasses.rar',
  ArchiveSha256: sha(readFileSync(rar)),
  Note: 'A LOOSE-FILE pack: the archive carries no .dfmod and so no manifest of its own. This file is generated from the archive by tools/classSkinsListing.mjs, which proves every vendored file is the bytes of the archive path `From` names. Files are listed by their VENDORED names: three sets carry no archive number in the archive (1525, 1526, 1530 are the port’s), one record’s frames were numbered with a gap (the adventurer’s 3: 0, 1, 2, 4) and are renumbered in order, and the pirate’s 1529_3-1_.png is frame 3-1 (its underscore a typo).',
  Files: Object.keys(from).sort(),
  From: Object.fromEntries(Object.keys(from).sort().map((k) => [k, from[k]])),
};
const text = `${JSON.stringify(listing, null, 2)}\n`;
if (flag === '--write') { writeFileSync(LISTING, text); console.log(`wrote ${Object.keys(from).length} files`); }
else if (readFileSync(LISTING, 'utf8') !== text) { console.error('class-skins.files.json is not what the archive gives - run with --write'); process.exit(1); }
else console.log(`ok: ${Object.keys(from).length} files, every one the archive's bytes`);
