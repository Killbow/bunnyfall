// DFU keeps a 64-bit state, but only its low 32 bits are ever observable and the low 32 bits of each step depend
// only on them. A uint32 state with `Math.imul` therefore matches DFU exactly.

let next = 1;

export function srand(seed) {
  next = seed >>> 0;
}

export function getSeed() { return next; }
export function setSeed(seed) { next = seed >>> 0; }
export function bumpSeed(delta) { setSeed((getSeed() + delta) | 0); }

export function rand() {
  next = (Math.imul(next, 1103515245) + 12345) >>> 0;
  return (next >>> 16) & 0x7fff;
}

export function randomRangeInclusive(min, max) {
  return (rand() % (max - min + 1)) + min;
}

export function randomRange(min, max) {
  return (rand() % (max - min)) + min;
}
