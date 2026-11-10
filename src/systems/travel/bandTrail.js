// @ts-check
// HUD and chat notice when an Overworld pack (travelBands.js) loses the traveler's trail.
import { foeWord } from '../livingWorld/lines.js';

const PLURALS = Object.freeze({ Wolf: 'Wolves', Man: 'Men', Dreugh: 'Dreugh', Homunculus: 'Homunculi' });   // irregular Enemy Expansion plurals not covered by foeWord

/** Builds the message for a pack that lost the traveler: names the enemy when every member shares a type
 *  ("The Orcs lose your trail." / "The Boar loses your trail."), or falls back to "The enemies lose your trail."
 *  `types` lists the pack's mobile IDs; `nameOf` resolves a mobile ID to its display name. */
export function bandTrailLine(types, nameOf) {
  const list = Array.isArray(types) ? types : [];
  const one = list.length > 0 && list.every((t) => t === list[0]);
  const name = one ? String(nameOf?.(list[0]) ?? '').trim() : '';
  if (!name) return 'The enemies lose your trail.';
  if (list.length === 1) return `The ${name} loses your trail.`;
  const last = name.split(' ').pop();
  return `The ${PLURALS[last] ? name.slice(0, -last.length) + PLURALS[last] : foeWord(name, list.length)} lose your trail.`;
}
