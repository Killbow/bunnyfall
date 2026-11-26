// @ts-check
// Mine sounds use clips from DAGGER.SND. Missing audio must never interrupt mine interactions.
import { SOUND } from '../../audio/soundClips.js';

/** The clips (DFU SoundClips indices), and how each is played: volume, pitch. */
export const MINE_SOUND = Object.freeze({
  drill: Object.freeze({ clip: 40, volume: 0.9, refDistance: 2, maxDistance: 26 }),
  drillStart: Object.freeze({ clip: 19, volume: 1, pitch: 0.9 }),
  haul: Object.freeze({ clip: 74, volume: 0.9, pitch: 0.75 }),
  shore: Object.freeze({ clip: SOUND.PlayerDoorBash, volume: 0.8, pitch: 0.85 }),
  lamp: Object.freeze({ clip: 16, volume: 0.8, pitch: 1 }),
  'warn:dust': Object.freeze({ clip: 63, volume: 0.7, pitch: 0.8 }),
  'warn:creak': Object.freeze({ clip: 68, volume: 0.9, pitch: 0.7 }),
  'warn:rumble': Object.freeze({ clip: 66, volume: 1, pitch: 0.6, under: Object.freeze({ clip: SOUND.FallHard, volume: 0.8, pitch: 0.7 }) }),
  collapse: Object.freeze({ clip: 66, volume: 1, pitch: 0.5, run: Object.freeze([SOUND.FallHard, SOUND.BodyFall, SOUND.FallHard, SOUND.BodyFall, SOUND.FallHard]), runGapMs: 260 }),
  wave: Object.freeze({ clip: 73, volume: 0.85, pitch: 0.9 }),
});

/**
 * @param {{ audio?: any, setTimeout?: (fn: () => void, ms: number) => any }} [deps]
 *   `audio` the game's bus (playOneShot, play3d, loop3d), or none
 */
export function createMineSounds({ audio = null, setTimeout: later = (fn, ms) => globalThis.setTimeout(fn, ms) } = {}) {
  /** the drills' loops, by `s:c:k` */
  const loops = new Map();
  const shot = (/** @type {number} */ clip, /** @type {number} */ volume, pitch = 1) => { try { audio?.playOneShot?.(clip, volume, pitch); } catch { /* never stops the mine */ } };

  return {
    /** A sound said once: a key of MINE_SOUND. Answers whether a bus took it. */
    say(/** @type {string} */ name) {
      const s = /** @type {any} */ (MINE_SOUND)[name];
      if (!s || !audio) return false;
      shot(s.clip, s.volume, s.pitch ?? 1);
      if (s.under) shot(s.under.clip, s.under.volume, s.under.pitch ?? 1);
      if (s.run) s.run.forEach((/** @type {number} */ c, /** @type {number} */ i) => later(() => shot(c, s.volume * (1 - i * 0.12), 0.8 + 0.1 * (i % 2)), (i + 1) * s.runGapMs));
      return true;
    },
    /** The drills running now, at their rigs: a loop started for each new one, stopped for each that has ended. */
    drills(/** @type {Array<{ key: string, at: number[] }>} */ running) {
      const want = new Set(running.map((r) => r.key));
      for (const [key, h] of loops) if (!want.has(key)) { try { h?.stop?.(); } catch { /* already still */ } loops.delete(key); }
      if (!audio?.loop3d) return loops.size;
      const D = MINE_SOUND.drill;
      for (const r of running) {
        if (loops.get(r.key)) continue;
        let h = null;
        try { h = audio.loop3d(D.clip, r.at, D.volume, { refDistance: D.refDistance, maxDistance: D.maxDistance, distanceModel: 'linear' }); } catch { h = null; }
        if (h) loops.set(r.key, h);   // null before the bus can play (no gesture yet): tried again next frame
      }
      return loops.size;
    },
    /** Every loop stopped (the mine left). */
    stop() { for (const h of loops.values()) { try { h?.stop?.(); } catch { /* already still */ } } loops.clear(); },
  };
}
