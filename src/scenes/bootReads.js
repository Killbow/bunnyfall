// Boot steps that world.js calls. Before the realm join, they start reading the game data that does not need the join.
// They also end the boot plate on the first drawn frame. A read that fails rejects only where the boot awaits it.
// Each startBootReads call replaces the previous boot's reads.
import { fetchBytes } from './shared.js';
import { loadQuestPack } from '../systems/quest/questData.js';
import { streetHeld } from './streetHold.js';

const CORE_FILES = ['ART_PAL.COL', 'BLOCKS.BSA', 'ARCH3D.BSA', 'MAPS.BSA', 'CLIMATE.PAK', 'POLITIC.PAK', 'WOODS.WLD'];
const MAGIC_FILES = ['SPELLS.STD', 'MAGIC.DEF'];

const awaitedLater = (/** @type {Promise<any>} */ p) => { p.catch(() => {}); return p; };

/** @type {any} */
let reads = null;

export function startBootReads() {
  const core = awaitedLater(Promise.all(CORE_FILES.map((n) => fetchBytes(n))));
  const magic = new Map(MAGIC_FILES.map((n) => [n, awaitedLater(fetchBytes(n))]));
  const quest = awaitedLater(loadQuestPack());
  reads = { core, quest, fetchBytes: (/** @type {string} */ n) => magic.get(n) ?? fetchBytes(n) };
}

export const bootReads = () => reads;

/** @param {{ end: () => void }} plate */
export function bootFrameDrawn(plate) {
  if (!streetHeld()) plate.end();
}
