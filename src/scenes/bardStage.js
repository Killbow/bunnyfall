// @ts-check
// BARDS' COLLEGE (2026-11-02): THE TAVERN'S STAGE - the one place a tune is heard. The performer's own game plays their
// tune as they perform and sends it to the others in the building (`send`, net/online.js sendBard); each other game
// hears it here (`heard`), says who plays, and plays it on the audio bus at the level the room allows. One synth: a new
// tune stops the last. The host hands in `send` and `say`; every door may be missing.
import { createBardSynth } from '../systems/tavern/bardSynth.js';
import { t } from '../systems/textManager.js';
import { music } from '../systems/music.js';   // BUNNYFALL: the game's music holds its peace while a tune is played

/** How loud a tune is to the room it is played in, 0..1. */
export const BARD_HOUSE_VOLUME = 0.5;

/** @param {{ send?: (tune: any) => boolean, say?: (line: string) => void }} deps */
export function createBardStage({ send = () => false, say = () => {} } = {}) {
  const synth = createBardSynth();
  /** BUNNYFALL: the game's music is muted (its own reason, so a video's end never lifts it) from a tune's first note to its end. */
  const hush = (/** @type {boolean} */ on) => { try { music.setMuted(on, 'bard'); } catch { /* the music is not the stage's problem */ } };
  return {
    /** My tune: heard here at once, and sent to the room. True where the room was sent it. */
    play(/** @type {any} */ tune) { if (synth.play(tune, BARD_HOUSE_VOLUME, 0.15, () => hush(false))) hush(true); return !!send(tune); },
    /** Another bard's tune, from the building I stand in. */
    heard(/** @type {{ id: string, name: string, tune: any }} */ m) {
      if (synth.play(m.tune, BARD_HOUSE_VOLUME, 0.15, () => { hush(false); synth.applause(0.6); })) hush(true);   // BUNNYFALL: the room applauds at the end
      say(t('bguild.bards.hears', '{name} plays "{title}".', { name: m.name || '?', title: m.tune.title }));
    },
    stop() { synth.stop(); hush(false); },
    /** BUNNYFALL: the house applauds my performance, as warm as it went (0..1). */
    applause(/** @type {number} */ warmth) { synth.applause(warmth); },
    get playing() { return synth.playing; },
    get elapsedMs() { return synth.elapsedMs; },
  };
}
