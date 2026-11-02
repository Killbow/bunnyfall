// @ts-check
// BARDS' COLLEGE (2026-11-02): THE TAVERN'S STAGE - the one place a tune is heard. The performer's own game plays their
// tune as they perform and sends it to the others in the building (`send`, net/online.js sendBard); each other game
// hears it here (`heard`), says who plays, and plays it on the audio bus at the level the room allows. One synth: a new
// tune stops the last. The host hands in `send` and `say`; every door may be missing.
import { createBardSynth } from '../systems/tavern/bardSynth.js';
import { t } from '../systems/textManager.js';

/** How loud a tune is to the room it is played in, 0..1. */
export const BARD_HOUSE_VOLUME = 0.5;

/** @param {{ send?: (tune: any) => boolean, say?: (line: string) => void }} deps */
export function createBardStage({ send = () => false, say = () => {} } = {}) {
  const synth = createBardSynth();
  return {
    /** My tune: heard here at once, and sent to the room. True where the room was sent it. */
    play(/** @type {any} */ tune) { synth.play(tune, BARD_HOUSE_VOLUME, 0.15); return !!send(tune); },
    /** Another bard's tune, from the building I stand in. */
    heard(/** @type {{ id: string, name: string, tune: any }} */ m) {
      synth.play(m.tune, BARD_HOUSE_VOLUME, 0.15);
      say(t('bguild.bards.hears', '{name} plays "{title}".', { name: m.name || '?', title: m.tune.title }));
    },
    stop() { synth.stop(); },
    get playing() { return synth.playing; },
    get elapsedMs() { return synth.elapsedMs; },
  };
}
