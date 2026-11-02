// @ts-check
// BARDS' COLLEGE (2026-11-02): THE TAVERN'S INSTRUMENT - plays a tune (net/bardTune.js) on the game's own audio bus, so
// the SoundVolume setting rules it as it rules every other sound. A lute-ish voice (a triangle with a touch of square
// through a soft low-pass), scheduled a short way ahead in small batches so a four-minute tune never holds hundreds of
// live nodes at once. One tune at a time: a new one stops the last.
import { audio } from '../audio.js';

const LOOKAHEAD_S = 1.2, TICK_MS = 250, VOICES_MAX = 24;
const midiHz = (/** @type {number} */ k) => 440 * 2 ** ((k - 69) / 12);

export function createBardSynth() {
  /** @type {any} */ let timer = null;
  /** @type {GainNode | null} */ let bus = null;
  /** @type {{ t: number, d: number, p: number }[]} */ let notes = [];
  let next = 0, t0 = 0, level = 0.5, live = 0;
  /** @type {Set<any>} */ const sources = new Set();

  function ctxOf() {
    try { audio._ensureCtx?.(); } catch { return null; }
    const c = audio.ctx;
    if (!c) return null;
    if (c.state === 'suspended') c.resume?.().catch?.(() => {});
    return c;
  }

  function voice(/** @type {AudioContext} */ c, /** @type {{ t: number, d: number, p: number }} */ n) {
    if (live >= VOICES_MAX) return;
    const at = t0 + n.t / 1000, len = Math.max(0.08, n.d / 1000), end = at + len + 0.25;
    if (end < c.currentTime) return;
    const g = c.createGain(), lp = c.createBiquadFilter(), a = c.createOscillator(), b = c.createOscillator();
    lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
    a.type = 'triangle'; b.type = 'square';
    a.frequency.value = b.frequency.value = midiHz(n.p);
    const bg = c.createGain(); bg.gain.value = 0.12;
    a.connect(g); b.connect(bg); bg.connect(g); g.connect(lp); lp.connect(/** @type {AudioNode} */ (bus));
    const peak = 0.22 * (n.p < 52 ? 1.2 : n.p > 84 ? 0.7 : 1);   // a low key carries less, a high one more
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.012);
    g.gain.exponentialRampToValueAtTime(peak * 0.45, at + Math.min(0.25, len * 0.5));
    g.gain.setValueAtTime(peak * 0.45, at + len);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len + 0.22);
    a.start(at); b.start(at); a.stop(end); b.stop(end);
    live++;
    sources.add(a);
    a.onended = () => { live--; sources.delete(a); try { g.disconnect(); lp.disconnect(); bg.disconnect(); } catch { /* gone */ } };
  }

  function pump() {
    const c = audio.ctx;
    if (!c || !bus) return stop();
    while (next < notes.length && t0 + notes[next].t / 1000 < c.currentTime + LOOKAHEAD_S) voice(c, notes[next++]);
    if (next >= notes.length && sources.size === 0) stop();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    for (const s of sources) { try { s.stop(); } catch { /* ended */ } }
    sources.clear(); live = 0; notes = []; next = 0;
    if (bus) { try { bus.disconnect(); } catch { /* gone */ } bus = null; }
  }

  return {
    /** Play a tune from its start (`delayS` later). `volume` 0..1. */
    play(/** @type {import('../../net/bardTune.js').Tune} */ tune, volume = 0.5, delayS = 0.15) {
      stop();
      const c = ctxOf();
      const out = c && audio._out?.();
      if (!c || !out) return false;
      bus = c.createGain();
      level = Math.max(0, Math.min(1, volume));
      bus.gain.value = level;
      bus.connect(out);
      notes = tune.notes; next = 0; t0 = c.currentTime + delayS;
      timer = setInterval(pump, TICK_MS);
      pump();
      return true;
    },
    /** The level now (a bard walks off, the crowd's ears move): 0..1. */
    setVolume(/** @type {number} */ v) {
      level = Math.max(0, Math.min(1, v));
      if (bus && audio.ctx) bus.gain.setTargetAtTime(level, audio.ctx.currentTime, 0.08);
    },
    stop,
    get playing() { return timer !== null; },
    /** How long into the tune it is, ms (0 when none). */
    get elapsedMs() { return timer && audio.ctx ? Math.max(0, (audio.ctx.currentTime - t0) * 1000) : 0; },
  };
}
