// @ts-check
import { foeWord } from '../systems/livingWorld/lines.js';

const PLURALS = Object.freeze({ Wolf: 'Wolves', Man: 'Men', Dreugh: 'Dreugh', Homunculus: 'Homunculi' });

export function bandTrailLine(types, nameOf) {
  const list = Array.isArray(types) ? types : [];
  const one = list.length > 0 && list.every((t) => t === list[0]);
  const name = one ? String(nameOf?.(list[0]) ?? '').trim() : '';
  if (!name) return 'The enemies lose your trail.';
  if (list.length === 1) return `The ${name} loses your trail.`;
  const last = name.split(' ').pop();
  return `The ${PLURALS[last] ? name.slice(0, -last.length) + PLURALS[last] : foeWord(name, list.length)} lose your trail.`;
}
