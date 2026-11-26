// Fetches the soundscape's CC0 recordings into scratch/soundscape-sounds/ and bakes them into public/sfx/.
// Usage: node tools/soundscapeSfxInstall.mjs
// A new pick must be CC0, with a row added by hand to public/sfx/SOURCES.md and to the doctrine allow-list.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { bake, writeWav8 } from './sndify.mjs';
import { decodeAudio, withDecoder, measure, measureLine } from './sfxBake.mjs';
import { isMain } from './lib/isMain.mjs';

const SRC = 'scratch/soundscape-sounds';
const OUT = 'public/sfx';
const OGA = 'https://opengameart.org/sites/default/files/';

export const PAGES = Object.freeze({
  gulls: { url: 'https://opengameart.org/content/solo-seagull-sound-effects', title: 'Solo Seagull Sound Effects', by: 'Rango Mango', license: 'CC0' },
  crow: { url: 'https://opengameart.org/content/crow', title: 'Crow', by: 'fvcalderan', license: 'CC0' },
  frogs: { url: 'https://opengameart.org/content/frog-croaks', title: 'Frog Croaks', by: 'EZduzziteh', license: 'CC0' },
  hammer: { url: 'https://opengameart.org/content/blacksmiths-hammer', title: "Blacksmith's Hammer", by: 'VishwaJai', license: 'CC0' },
  anvil: { url: 'https://opengameart.org/content/hammer-on-anvil', title: 'Hammer on anvil', by: 'themightyglider', license: 'CC0' },
});

export const FROG_EDGES = Object.freeze([0.004, 0.015]);
export const PICKS = Object.freeze([
  { as: 'sea-gull-1', page: 'gulls', file: 'Seagull%20Ambient%201.wav', max: 3.9, peak: 0.86, why: 'a herring gull\'s long call, three falling cries - the coast\'s own sound' },
  { as: 'sea-gull-2', page: 'gulls', file: 'Seagull%20Ambient%202.wav', max: 1.6, peak: 0.86, why: 'two short cries, a bird passing' },
  { as: 'sea-gull-3', page: 'gulls', file: 'Seagull%20Ambient%203.wav', max: 1.2, peak: 0.86, why: 'one cry, higher' },
  { as: 'sea-gull-4', page: 'gulls', file: 'Seagull%20Ambient%205.wav', max: 1.5, peak: 0.86, why: 'a laughing call, the one a harbour is full of' },
  { as: 'sea-gull-5', page: 'gulls', file: 'Seagull%20Ambient%206.wav', max: 1.1, peak: 0.86, why: 'a single mew' },
  { as: 'sea-gull-6', page: 'gulls', file: 'Seagull%20Big%20Ambient.wav', max: 0.6, peak: 0.86, why: 'a bigger bird\'s bark, low among the others' },
  { as: 'wild-crow-1', page: 'crow', file: 'crow_0.ogg', max: 0.7, peak: 0.84, why: 'a crow\'s caw, dry: the hills and the woods by day' },
  { as: 'wild-frog-1', page: 'frogs', file: 'croak_01_0.mp3', max: 1.1, peak: 0.82, edges: FROG_EDGES, why: 'a frog\'s croak, a marsh\'s night' },
  { as: 'wild-frog-2', page: 'frogs', file: 'croak_02.mp3', max: 0.3, peak: 0.82, edges: FROG_EDGES, why: 'a short one, for a chorus' },
  { as: 'wild-frog-3', page: 'frogs', file: 'croak_03.mp3', max: 1.35, peak: 0.82, edges: FROG_EDGES, why: 'a long rattling croak' },
  { as: 'wild-frog-4', page: 'frogs', file: 'croak_04.mp3', max: 0.65, peak: 0.82, edges: FROG_EDGES, why: 'a deeper one' },
  { as: 'town-anvil-1', page: 'hammer', file: 'blacksmithhammer.wav', max: 0.5, peak: 0.84, why: 'one hammer blow on an anvil, ringing - a smithy at work' },
  { as: 'town-anvil-2', page: 'anvil', file: 'forger_0.ogg', max: 2.5, peak: 0.84, why: 'a run of blows on an anvil, a smith\'s rhythm' },
]);

if (isMain(import.meta.url)) {
  mkdirSync(SRC, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  for (const p of PICKS) {
    const local = join(SRC, decodeURIComponent(p.file));
    if (existsSync(local)) continue;
    const r = await fetch(OGA + p.file, { headers: { 'user-agent': 'Bunnyfall-sfx/1.0' } });
    if (!r.ok) throw new Error(`${p.file}: ${r.status}`);
    writeFileSync(local, new Uint8Array(await r.arrayBuffer()));
  }
  console.log('clip'.padEnd(52), 'secs'.padStart(6), 'attack'.padStart(8), 'crest'.padStart(7), 'tail'.padStart(7), 'bright'.padStart(8));
  await withDecoder(async (page) => {
    for (const p of PICKS) {
      const { rate, mono } = await decodeAudio(page, join(SRC, decodeURIComponent(p.file)));
      const pcm = bake(mono, rate, { peak: p.peak, maxSeconds: p.max, edges: p.edges ?? null });
      writeFileSync(join(OUT, `${p.as}.wav`), writeWav8(pcm));
      console.log(measureLine(`${p.as}.wav`, measure(pcm)));
    }
  });
}
