// @ts-check
// BUNNYFALL (2026-11-27): THE CHARACTER BORN IN NYX'S HALL, on its way to the world. The hall (scenes/chargenHall.js) runs
// before the world boots, in the same page; the character signed there waits here, and the world host's chargen arm
// (world/testPresetWorld.js) takes it instead of mounting the wizard. Taken once: a second boot asks again.

/** @type {any} */
let born = null;

/** Keep the hall's signed character (the wizard's result) for the world. @param {any} result */
export function setHallBorn(result) { born = result ?? null; }

/** The hall's character, once; null when nobody was born in the hall. */
export function takeHallBorn() {
  const r = born;
  born = null;
  return r;
}
