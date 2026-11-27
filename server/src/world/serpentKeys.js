import { SERPENT_FIGHT_KEY } from '../relay.js';

export const SERPENT_REST_MS = 5000;
export const SERPENT_KEEP_MS = 2 * 60 * 60 * 1000;
export const serpentStoreKey = (id) => `${SERPENT_FIGHT_KEY}:${id}`;
