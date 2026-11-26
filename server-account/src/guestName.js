// @ts-check
// A guest name always has exactly one space and a chosen handle never has one, so the two can never collide.

import banks from '../../src/characters/nameGen.json' with { type: 'json' };
import { nameIsIssuable } from '../../src/net/identityToken.js';

export const GUEST_BANKS = Object.freeze(Object.keys(banks)
  .filter((k) => Array.isArray(banks[k]?.sets) && banks[k].sets.length >= 6)
  .sort());

import { GUEST_NAME_RE, HANDLE_RE, isGuestShaped, isHandleShaped } from '../../src/net/handleShape.js';
export { GUEST_NAME_RE, HANDLE_RE, isGuestShaped, isHandleShaped };

export function pick(n, rand) {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError('pick needs a positive count');
  if (n === 1) return 0;
  const limit = Math.floor(256 / n) * n;
  const buf = new Uint8Array(1);
  for (let guard = 0; guard < 1000; guard++) {
    rand(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
  throw new Error('pick could not draw an unbiased index');
}

const partsOf = (bank, set) => banks[bank].sets[set].parts;

function drawName(rand, bank) {
  const part = (set) => { const p = partsOf(bank, set); return p[pick(p.length, rand)]; };
  return `${part(0) + part(1)} ${part(4) + part(5)}`;
}

/** @param {(b: Uint8Array) => void} rand @param {string|null} bank @returns {string} */
export function guestName(rand, bank = null) {
  const b = bank ?? GUEST_BANKS[pick(GUEST_BANKS.length, rand)];
  if (!GUEST_BANKS.includes(b)) throw new RangeError(`no such name bank: ${b}`);
  // NAME_MAX lives in the relay bundle and the bank can spell longer names, so such draws are redrawn here.
  // The retry is bounded so a broken bank fails instead of spinning.
  for (let attempt = 0; attempt < 8; attempt++) {
    const name = drawName(rand, b);
    if (nameIsIssuable(name) && GUEST_NAME_RE.test(name)) return name;
  }
  throw new Error(`no issuable name could be drawn from ${b} - the bank and NAME_MAX have parted`);
}

