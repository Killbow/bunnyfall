// Another player's enemy is simulated on their client, so local ally spells must be forwarded.

import { hitSpellFields } from '../net/wire.js';

/** Builds the outgoing 'spell' hit packet for `ally` hitting `foe`, or returns null. */
export function allySpellHit(foe, ally, record, level, k) {
  if (!foe?.puppet || foe.dead || foe.entity?.team === 'PlayerAlly') return null;
  if (!ally || ally.puppet || ally.entity?.team !== 'PlayerAlly') return null;
  const spell = hitSpellFields(record, level);
  if (!spell) return null;
  return { to: foe.puppet, k, i: foe.seq, dmg: 0, kind: 'spell', ...spell, al: 1, ...(ally.seq != null ? { ac: ally.seq } : {}) };
}
