// Regenerates src/characters/enemyBasics.js from DFU's EnemyBasics.cs, asserting the visual fields stay unchanged.
// Run: node tools/extract-enemy-basics.mjs /path/to/EnemyBasics.cs [/path/to/SoundClips.cs].
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { extractEnemyBasics } from './extractEnemyBasics.lib.mjs';

const src = readFileSync(process.argv[2], 'utf8');
const scPath = process.argv[3] || join(dirname(process.argv[2]), '..', 'SoundClips.cs');
const out = extractEnemyBasics(src, readFileSync(scPath, 'utf8'));

const cur = (await import(new URL('../src/characters/enemyBasics.js', import.meta.url).href)).ENEMY_BASICS;
for (const [k, v] of Object.entries(cur)) {
  const n = out[k];
  if (!n) throw new Error(`ASSERT FAIL: key ${k} missing from re-extraction`);
  for (const f of ['maleTexture', 'femaleTexture', 'behaviour']) {
    if (n[f] !== v[f]) throw new Error(`ASSERT FAIL: ${k}.${f}: ${v[f]} -> ${n[f]}`);
  }
}
console.log(`ASSERT: C3 parity holds for ${Object.keys(cur).length} keys; re-extracted ${Object.keys(out).length}`);

const body = JSON.stringify(out, null, 1).replace(/"([a-zA-Z][a-zA-Z0-9]*)":/g, "'$1':").replace(/"/g, "'");
writeFileSync(new URL('../src/characters/enemyBasics.js', import.meta.url),
`// Enemy visual/behaviour/entity basics (Characters C3, re-extracted
// E3a with combat fields). Generated from DFU's EnemyBasics.cs
// Enemies table (MIT, Daggerfall Workshop): textures + Behaviour
// (C3, byte-identical parity asserted at generation) + affinity,
// corpse texture, MinMetalToHit (material index, None=-1), monster
// damage pairs 1-3 + health/level/armor, soul points, team, loot key,
// flags.
// Class entries (128+) carry no health/level/damage - those come
// from the career (CLASS*.CFG) + FormulaHelper, per SetEnemyCareer.
// Do not hand-edit; regenerate: node tools/extract-enemy-basics.mjs
// DEX1: the table itself is not frozen, as DFU's EnemyBasics.Enemies is not - a mod's enemies join it
// (registerEnemyRows) and a mod's edits are written over its rows, which every reader then sees (as RR1's
// enemyAppearance writes over them). Its classic rows are DFU's, generated; only a mod's install writes it.
export const ENEMY_BASICS = (${body});

/** DEX1: THE TABLE AS DFU SHIPS IT - EnemyBasics.Enemies' own initializer, copied before any mod writes a row (this
 *  module's evaluation ends before an importer runs) and frozen to the leaf. For the readers a mod's edit must never
 *  reach: King's Gambit's roster is one for every client and the relay (bible/11-Multiplayer/Kings-Gambit.md, "the
 *  vanilla rows, never a mod's overlay"), and a client evaluating it after Daggerfall Enemy Expansion's Start wrote its
 *  classic rows would build another. */
const deepFreeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v); return Object.freeze(o); };
export const VANILLA_ENEMY_BASICS = deepFreeze(structuredClone(ENEMY_BASICS));
`);
console.log('written');
