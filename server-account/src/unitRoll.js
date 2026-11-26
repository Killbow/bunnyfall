// @ts-check
// Kept apart from professions.js so marks.js can import it without a cycle; professions.js re-exports it.

export function dice(rand) {
  const b = new Uint32Array(1);
  rand(new Uint8Array(b.buffer));
  return b[0] / 4294967296;
}
