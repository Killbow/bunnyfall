#!/usr/bin/env node
// Converts the HMI songs in ARENA2/MIDI.BSA to standard type 0 .mid files through the HMI decoder.
// Run: ARENA2_PATH=/path/to/ARENA2 node tools/dumpMidi.mjs [outDir] (default ./midi-out).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MidiBsaFile, HmiFile } from '../src/formats/hmiFile.js';

const arena2 = process.env.ARENA2_PATH;
if (!arena2) {
  console.error('set ARENA2_PATH to your ARENA2 directory, e.g.');
  console.error('  ARENA2_PATH=~/Daggerfall/ARENA2 node tools/dumpMidi.mjs');
  process.exit(2);
}
const outDir = process.argv[2] ?? 'midi-out';
mkdirSync(outDir, { recursive: true });

const archive = new MidiBsaFile();
if (!archive.load(new Uint8Array(readFileSync(join(arena2, 'MIDI.BSA'))))) {
  console.error(`could not read ${join(arena2, 'MIDI.BSA')} as a name-record BSA`);
  process.exit(1);
}

const vlq = (n) => {
  const out = [n & 0x7f];
  let v = n >>> 7;
  while (v > 0) { out.unshift((v & 0x7f) | 0x80); v >>>= 7; }
  return out;
};

const chunk = (tag, body) => {
  const head = [...tag].map((c) => c.charCodeAt(0));
  const len = body.length;
  return [...head, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...body];
};

function eventBytes(e) {
  switch (e.type) {
    case 'noteOff':        return [0x80 | e.channel, e.note & 0x7f, e.velocity & 0x7f];
    case 'noteOn':         return [0x90 | e.channel, e.note & 0x7f, e.velocity & 0x7f];
    case 'polyPressure':   return [0xa0 | e.channel, e.note & 0x7f, e.pressure & 0x7f];
    case 'controller':     return [0xb0 | e.channel, e.controller & 0x7f, e.value & 0x7f];
    case 'programChange':  return [0xc0 | e.channel, e.program & 0x7f];
    case 'channelPressure':return [0xd0 | e.channel, e.pressure & 0x7f];
    case 'pitchBend':      return [0xe0 | e.channel, e.value & 0x7f, (e.value >> 7) & 0x7f];
    case 'sysEx':          return [e.status, ...vlq(e.data.length), ...e.data];
    case 'meta':
      // End of track is written once at the real end; a song's own mid-stream 0x2F would cut off the rest.
      if (e.metaType === 0x2f) return null;
      return [0xff, e.metaType & 0xff, ...vlq(e.data.length), ...e.data];
    default:               return null;
  }
}

function toSmf(hmi) {
  const division = hmi.ticksPerQuarterNote;
  const bpm = hmi.beatsPerMinute || 120;
  const usPerQuarter = Math.round(60000000 / bpm);

  const track = [
    0x00, 0xff, 0x51, 0x03,
    (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff,
  ];

  let last = 0;
  for (const e of hmi.events) {
    const bytes = eventBytes(e);
    if (!bytes) continue;
    track.push(...vlq(Math.max(0, e.tick - last)), ...bytes);
    last = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [0x00, 0x00, 0x00, 0x01, (division >> 8) & 0xff, division & 0xff];
  return Uint8Array.from([...chunk('MThd', header), ...chunk('MTrk', track)]);
}

let written = 0;
const skipped = [];
for (let i = 0; i < archive.count; i++) {
  const name = archive.getSongName(i);
  const hmi = new HmiFile();
  let ok = false;
  try {
    ok = hmi.load(archive.getSongBytes(i), name);
  } catch (err) {
    skipped.push(`${name}: ${err.message}`);
    continue;
  }
  if (!ok) { skipped.push(`${name}: not an HMI song`); continue; }

  const out = join(outDir, `${name.replace(/\.HMI$/i, '')}.mid`);
  writeFileSync(out, toSmf(hmi));
  written++;
  console.log(`${name}  ->  ${out}  (${hmi.trackCount} tracks, ${hmi.events.length} events, ${hmi.beatsPerMinute}bpm)`);
}

console.log(`\n${written}/${archive.count} songs written to ${outDir}/`);
if (skipped.length) {
  console.log(`${skipped.length} skipped:`);
  for (const s of skipped) console.log(`  ${s}`);
}
