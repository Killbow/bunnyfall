#!/usr/bin/env node
// Lists what each MIDI.BSA song is for and, with --check, which records a music pack folder covers.
// Run: node tools/musicNames.mjs [--check <dir>].

import { readdirSync } from 'node:fs';
import * as SM from '../src/audio/songManager.js';
import { replacementEntry, replacementKey } from '../src/audio/musicReplacement.js';
import { isMain } from './lib/isMain.mjs';

export const CONTEXT = {
  DUNGEON_SONGS: 'dungeon', SUNNY_SONGS: 'outdoors, clear', CLOUDY_SONGS: 'outdoors, cloudy',
  OVERCAST_SONGS: 'outdoors, overcast/fog', RAIN_SONGS: 'rain', SNOW_SONGS: 'snow',
  SNEAKING_SONGS: 'sneaking', TEMPLE_GOOD_SONGS: 'temple (good)',
  TEMPLE_NEUTRAL_SONGS: 'temple (neutral)', TEMPLE_BAD_SONGS: 'temple (bad)',
  TAVERN_SONGS: 'tavern', NIGHT_SONGS: 'outdoors, night', DAY_SONGS: 'outdoors, day',
  CASTLE_SONGS: 'castle', COURT_SONGS: 'court (arrested)', SHOP_SONGS: 'shop',
  MAGES_GUILD_SONGS: 'mages guild', INTERIOR_SONGS: 'building interior',
  KNIGHT_SONGS: 'knightly order', PALACE_SONGS: 'palace',
};

// D1-D10 and their FM twins are in MIDI.BSA but in no playlist, matching DFU's unused dungeon songs.
const UNUSED_IN_DFU = new Set(
  Array.from({ length: 10 }, (_, i) => [`D${i + 1}`, `D${i + 1}FM`]).flat(),
);

export function songTable() {
  const songs = new Map();
  for (const [name, value] of Object.entries(SM)) {
    const m = /^([A-Z_]+_SONGS)(_FM)?$/.exec(name);
    if (!m || !Array.isArray(value)) continue;
    const label = CONTEXT[m[1]];
    // An unlabeled playlist is fatal, since its songs would silently drop out of the table.
    if (!label) { console.error(`no label for ${m[1]} - add one to CONTEXT`); process.exit(3); }
    for (const song of value) {
      if (!songs.has(song)) songs.set(song, { contexts: new Set(), fm: false, gm: false });
      const e = songs.get(song);
      e.contexts.add(label);
      if (m[2]) e.fm = true; else e.gm = true;
    }
  }

  return [...songs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function main() {
  const rows = songTable();
  const dirArg = process.argv.indexOf('--check');

  if (dirArg < 0) {
    console.log(`${rows.length} songs, from songManager.js's own playlists.`);
    console.log('A Daggerfall Unity music pack works as-is: its song_*.ogg names');
  console.log('are already these records. Otherwise name files GDAY___D.ogg.\n');
    console.log('RECORD        SET  PLAYS FOR');
    for (const [song, e] of rows) {
      const set = e.fm && e.gm ? 'both' : (e.fm ? 'FM' : 'GM');
      console.log(`${replacementKey(song).padEnd(13)} ${set.padEnd(4)} ${[...e.contexts].sort().join(' / ')}`);
    }
    console.log('\nSET: GM is the default; FM is the Adlib set behind Audio/AlternateMusic.');
    console.log('Replace a "both" record and it is heard whichever set is selected.');
    process.exit(0);
  }

  const dir = process.argv[dirArg + 1];
  if (!dir) { console.error('--check needs a directory'); process.exit(2); }
  const have = new Map();
  for (const f of readdirSync(dir)) {
    const e = replacementEntry(f);
    if (e) have.set(e.key, f);
  }
  const covered = rows.filter(([s]) => have.has(replacementKey(s)));
  const missing = rows.filter(([s]) => !have.has(replacementKey(s)));
  const known = new Set(rows.map(([s]) => replacementKey(s)));
  const unused = [...have.entries()].filter(([k]) => UNUSED_IN_DFU.has(k));
  const strays = [...have.entries()].filter(([k]) => !known.has(k) && !UNUSED_IN_DFU.has(k));

  console.log(`${dir}: ${covered.length}/${rows.length} songs covered\n`);
  if (missing.length) {
    console.log('STILL PLAYING THE ORIGINAL:');
    for (const [song, e] of missing) {
      console.log(`  ${replacementKey(song).padEnd(13)} ${[...e.contexts].sort().join(' / ')}`);
    }
  }
  if (strays.length) {
    console.log(`\n${strays.length} FILES MATCH NO SONG - misnamed, or not Daggerfall music:`);
    for (const [, f] of strays.slice(0, 20)) console.log(`  ${f}`);
    if (strays.length > 20) console.log(`  ...and ${strays.length - 20} more`);
  }
  if (unused.length) {
    console.log(`\n${unused.length} files replace UNUSED tracks - they will never play:`);
    for (const [, f] of unused) console.log(`  ${f}`);
    console.log('  (SongManager.cs:919/:934 - DFU declares these and uses them nowhere.)');
  }
  if (!missing.length && !strays.length) console.log('every song covered, nothing stray.');
}

if (isMain(import.meta.url)) main();
