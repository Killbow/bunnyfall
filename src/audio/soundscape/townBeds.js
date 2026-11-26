// @ts-check
// Builds the town murmur and tavern beds at run time from the people voices in the player's DAGGER.SND; none
// of that audio is shipped.
import { synthBed, lowpassLoop, level, ARENA_SOUND_RATE } from '../../arena/arenaSound.js';

export const TOWN_SEED = 0x70a1e;
export const TOWN_BED_RATE = ARENA_SOUND_RATE;
/** @param {Float32Array[]} voices */
export const murmurSamples = (voices) => lowpassLoop(synthBed(voices, { seed: TOWN_SEED }), ARENA_SOUND_RATE, 2400);
/** @param {Float32Array[]} voices */
export const tavernSamples = (voices) => level(lowpassLoop(synthBed(voices, { seed: TOWN_SEED + 1 }), ARENA_SOUND_RATE, 1100), 0.06);
