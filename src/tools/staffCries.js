// @ts-check
// BUNNYFALL (2026-11-13, the owner: "reuse voice clips, i will fix that later with proper ogg files"): THE CRIES OF A STAFF
// EVENT. Scared screams about the town when the event begins, and an evil cackle when the Forbidden One stands. Both are
// the game's own voice clips for now (the female pain voices, the cackle those same clips slowed and layered); proper
// OGG files replace the ids in CRY_CLIPS and nothing else changes.

/** The clips, by cry. Daggerfall's female pain voices: Breton / Redguard / Nord 43, 44, 53; the elves' 55, 56; Khajiit 61, 62. */
export const CRY_CLIPS = Object.freeze({
  scream: Object.freeze([43, 44, 53, 55, 56, 61, 62]),
  cackle: Object.freeze([55, 56, 62]),
});
/** The screams: how many, over how many seconds, within how far of the town's heart (m), how loud. */
export const SCREAM_COUNT = 6;
export const SCREAM_SPREAD_S = 3.5;
export const SCREAM_RADIUS_M = 70;
/** The cackle: layers, pitch (slowed, so it is lower and longer), the gap between layers (s). */
export const CACKLE_LAYERS = 3;
export const CACKLE_PITCH = 0.62;
export const CACKLE_GAP_S = 0.34;

/**
 * `audio.play3d(index, pos, volume, { pitch })`; `at` [x, y, z] the cry's centre; `rnd` () => 0..1; `later(fn, s)` a timer.
 * @param {{ play3d: (index: number, pos: number[], volume?: number, opts?: any) => any }} audio
 * @param {'scream' | 'cackle'} kind @param {number[]} at
 */
export function playCry(audio, kind, at, rnd = Math.random, later = (fn, s) => { setTimeout(fn, s * 1000); }) {
  const clips = CRY_CLIPS[kind];
  if (!audio?.play3d || !clips || !Array.isArray(at)) return 0;
  const pick = () => clips[Math.min(clips.length - 1, Math.floor(rnd() * clips.length))];
  if (kind === 'scream') {
    for (let i = 0; i < SCREAM_COUNT; i++) {
      const a = rnd() * Math.PI * 2, d = 12 + rnd() * (SCREAM_RADIUS_M - 12);
      later(() => audio.play3d(pick(), [at[0] + Math.cos(a) * d, at[1], at[2] + Math.sin(a) * d], 1, { refDistance: 6, maxDistance: 220, pitch: 1.1 + rnd() * 0.3 }), (i / SCREAM_COUNT) * SCREAM_SPREAD_S + rnd() * 0.3);
    }
    return SCREAM_COUNT;
  }
  for (let i = 0; i < CACKLE_LAYERS; i++) {
    later(() => audio.play3d(clips[i % clips.length], at, 1, { refDistance: 12, maxDistance: 320, pitch: CACKLE_PITCH + i * 0.03 }), i * CACKLE_GAP_S);
  }
  return CACKLE_LAYERS;
}
