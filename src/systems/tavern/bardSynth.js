// @ts-check
// BARDS' COLLEGE (2026-11-02): THE TAVERN'S INSTRUMENT - plays a tune (net/bardTune.js) on the game's own audio bus, so
// the SoundVolume setting rules it as it rules every other sound. Scheduled a short way ahead in small batches so a
// four-minute tune never holds hundreds of live nodes at once. One tune at a time: a new one stops the last.
//
// BUNNYFALL (2026-11-04, the owner: "Improve the visuals and audio of bardic performances so they feel like meaningful
// public performances"): A LUTE IN A ROOM. Each note is PLUCKED - a bright attack that darkens and dies away as a
// string does (a triangle and a detuned saw under a closing low-pass), whatever its written length - and the whole
// tune rings in the tavern's own ROOM: a short echo of the hall (a convolver over a made impulse) under the dry sound.
// When the last note has rung, the house APPLAUDS (`applause`): a crowd's claps and a cheer or two, as loud as the night
// earned (the performer's game) or the room's own (a listener's).
import { audio } from '../audio.js';

const LOOKAHEAD_S = 1.2, TICK_MS = 250, VOICES_MAX = 28;
const midiHz = (/** @type {number} */ k) => 440 * 2 ** ((k - 69) / 12);
/** The room: how much of the sound rings in it, and how long the ring lasts (s). */
export const ROOM_WET = 0.28;
export const ROOM_S = 1.6;
/** A plucked string's ring (s) at the most, and its brightness at the pluck and at its end (Hz). */
const RING_S = 1.8, BRIGHT_HZ = 3800, DARK_HZ = 900;

/** A room's ring: a decaying burst of noise, the same every time (a small fixed generator). */
function roomImpulse(/** @type {AudioContext} */ c) {
  const len = Math.floor(c.sampleRate * ROOM_S), buf = c.createBuffer(2, len, c.sampleRate);
  let seed = 0x2f6b;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 40 ? i / 40 : 1);
  }
  return buf;
}

export function createBardSynth() {
  /** @type {any} */ let timer = null;
  /** @type {GainNode | null} */ let bus = null;
  /** @type {AudioNode[]} */ let room = [];
  /** @type {{ t: number, d: number, p: number }[]} */ let notes = [];
  let next = 0, t0 = 0, level = 0.5, live = 0;
  /** @type {(() => void) | null} */ let onEnd = null;
  /** @type {Set<any>} */ const sources = new Set();
  /** @type {AudioBuffer | null} */ let impulse = null;

  function ctxOf() {
    try { audio._ensureCtx?.(); } catch { return null; }
    const c = audio.ctx;
    if (!c) return null;
    if (c.state === 'suspended') c.resume?.().catch?.(() => {});
    return c;
  }

  /** The bus a performance plays into: dry to the game's out, and through the room's ring beside it. */
  function makeBus(/** @type {AudioContext} */ c, /** @type {AudioNode} */ out) {
    const g = c.createGain();
    g.gain.value = level;
    g.connect(out);
    room = [];
    try {
      impulse ??= roomImpulse(c);
      const conv = c.createConvolver(), wet = c.createGain();
      conv.buffer = impulse; wet.gain.value = ROOM_WET;
      g.connect(conv); conv.connect(wet); wet.connect(out);
      room = [conv, wet];
    } catch { /* no convolver: the dry sound alone */ }
    return g;
  }

  function voice(/** @type {AudioContext} */ c, /** @type {{ t: number, d: number, p: number }} */ n) {
    if (live >= VOICES_MAX) return;
    const at = t0 + n.t / 1000, held = Math.max(0.08, n.d / 1000), ring = Math.min(RING_S, held + 0.6), end = at + ring + 0.1;
    if (end < c.currentTime) return;
    const g = c.createGain(), lp = c.createBiquadFilter(), a = c.createOscillator(), b = c.createOscillator();
    lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(BRIGHT_HZ, at);
    lp.frequency.exponentialRampToValueAtTime(DARK_HZ, at + Math.min(0.6, ring));   // the pluck's brightness dies first
    a.type = 'triangle'; b.type = 'sawtooth';
    a.frequency.value = midiHz(n.p); b.frequency.value = midiHz(n.p) * 1.004;   // a second course a hair sharp: a lute's doubled string
    const bg = c.createGain(); bg.gain.value = 0.16;
    a.connect(g); b.connect(bg); bg.connect(g); g.connect(lp); lp.connect(/** @type {AudioNode} */ (bus));
    const peak = 0.24 * (n.p < 52 ? 1.15 : n.p > 84 ? 0.7 : 1);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.006);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, at + 0.18);   // the pluck falls fast,
    g.gain.exponentialRampToValueAtTime(0.0001, at + ring);        // then the string rings away
    a.start(at); b.start(at); a.stop(end); b.stop(end);
    live++;
    sources.add(a);
    a.onended = () => { live--; sources.delete(a); try { g.disconnect(); lp.disconnect(); bg.disconnect(); } catch { /* gone */ } };
  }

  function pump() {
    const c = audio.ctx;
    if (!c || !bus) return stop();
    while (next < notes.length && t0 + notes[next].t / 1000 < c.currentTime + LOOKAHEAD_S) voice(c, notes[next++]);
    if (next >= notes.length && sources.size === 0) { const end = onEnd; stop(); end?.(); }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    for (const s of sources) { try { s.stop(); } catch { /* ended */ } }
    sources.clear(); live = 0; notes = []; next = 0; onEnd = null;
    const b = bus, r = room;
    bus = null; room = [];
    // the room's ring is let die out before its nodes go
    setTimeout(() => { for (const n of [b, ...r]) { try { n?.disconnect(); } catch { /* gone */ } } }, ROOM_S * 1000 + 200);
  }

  /** THE HOUSE APPLAUDS: claps for `seconds` from a crowd as warm as `warmth` (0..1), and a cheer or two from a warm one. */
  function applause(warmth = 0.6, seconds = 3.5) {
    const c = ctxOf();
    const out = c && audio._out?.();
    if (!c || !out) return false;
    const w = Math.max(0.1, Math.min(1, warmth)), len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const claps = Math.round(seconds * (14 + 40 * w));   // a warm house claps thick and fast
      for (let k = 0; k < claps; k++) {
        const s0 = Math.floor(Math.random() * len * 0.92), cl = Math.floor(c.sampleRate * (0.008 + Math.random() * 0.01)), amp = 0.25 + Math.random() * 0.5;
        for (let i = 0; i < cl && s0 + i < len; i++) d[s0 + i] += (Math.random() * 2 - 1) * amp * (1 - i / cl);
      }
      for (let i = 0; i < len; i++) d[i] *= Math.min(1, i / (c.sampleRate * 0.25)) * Math.min(1, (len - i) / (c.sampleRate * 1.2));   // swells in, dies away
    }
    const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.6; g.gain.value = 0.35 * level * (0.6 + 0.4 * w);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start();
    src.onended = () => { try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* gone */ } };
    // a warm house cheers: a voice or two rising "hey!"
    for (let k = 0; k < (w > 0.75 ? 2 : w > 0.5 ? 1 : 0); k++) {
      const at = c.currentTime + 0.3 + k * 0.7, o = c.createOscillator(), vg = c.createGain(), f = c.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 900 + k * 300; f.Q.value = 2;
      o.frequency.setValueAtTime(220 + k * 60, at); o.frequency.exponentialRampToValueAtTime(330 + k * 80, at + 0.25);
      vg.gain.setValueAtTime(0.0001, at); vg.gain.linearRampToValueAtTime(0.08 * level, at + 0.04); vg.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
      o.connect(f); f.connect(vg); vg.connect(out); o.start(at); o.stop(at + 0.45);
      o.onended = () => { try { o.disconnect(); f.disconnect(); vg.disconnect(); } catch { /* gone */ } };
    }
    return true;
  }

  return {
    /** Play a tune from its start (`delayS` later). `volume` 0..1; `ended` runs once its last note has rung (not on a stop). */
    play(/** @type {import('../../net/bardTune.js').Tune} */ tune, volume = 0.5, delayS = 0.15, ended = null) {
      stop();
      const c = ctxOf();
      const out = c && audio._out?.();
      if (!c || !out) return false;
      level = Math.max(0, Math.min(1, volume));
      bus = makeBus(c, out);
      notes = tune.notes; next = 0; t0 = c.currentTime + delayS;
      onEnd = typeof ended === 'function' ? ended : null;
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
    applause,
    get playing() { return timer !== null; },
    /** How long into the tune it is, ms (0 when none). */
    get elapsedMs() { return timer && audio.ctx ? Math.max(0, (audio.ctx.currentTime - t0) * 1000) : 0; },
  };
}
