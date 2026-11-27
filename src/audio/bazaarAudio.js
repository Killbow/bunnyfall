// @ts-check
// Meditative Psijic sanctuary score, spatial tear cues, 3D sanctum soundscape, and astral footsteps.

import { audio, placeAudio, releaseNodes } from './audio.js';
import { music } from './music.js';
import { midiNote, SCORE_TPQ } from '../worldEvents/gateScore.js';
import {
  BAZAAR_BRIDGE_Z0,
  BAZAAR_BRIDGE_Z1,
  BAZAAR_BRIDGE_HALF_W,
  bazaarWaterfallState,
} from '../systems/bazaarBetwixt.js';

export const BAZAAR_SONG_NAME = 'BAZAAR.HMI';
const REVERB_OWNER = 'bazaarBetwixt';

/** @type {any} */
let _cachedSong = null;
let _songRegistered = false;

const EVENT_RANK = /** @type {Record<string, number>} */ (Object.freeze({ programChange: 0, controller: 1, noteOn: 2 }));

/**
 * Build the sparse, ancient, meditative Psijic sanctuary score in D Lydian (4/4, 42 BPM, 24 bars).
 */
export function bazaarAstralSong() {
  if (_cachedSong) return _cachedSong;
  const bpm = 42;
  const beatsPerBar = 4;
  const bars = 24;
  const secondsPerTick = 60 / (bpm * SCORE_TPQ);
  const durationTicks = bars * beatsPerBar * SCORE_TPQ;
  /** @type {any[]} */
  const events = [];

  const voices = [
    { ch: 0, prog: 52, vol: 92, pan: 58 },
    { ch: 1, prog: 49, vol: 82, pan: 72 },
    { ch: 2, prog: 14, vol: 86, pan: 50 },
    { ch: 3, prog: 8, vol: 80, pan: 74 },
  ];
  for (const v of voices) {
    events.push({ tick: 0, type: 'programChange', channel: v.ch, program: v.prog });
    events.push({ tick: 0, type: 'controller', channel: v.ch, controller: 7, value: v.vol });
    events.push({ tick: 0, type: 'controller', channel: v.ch, controller: 10, value: v.pan });
  }

  const pushNote = (/** @type {number} */ ch, /** @type {number} */ bar, /** @type {number} */ beat, /** @type {number} */ durBeats, /** @type {string} */ noteName, /** @type {number} */ vel) => {
    const tick = Math.round((bar * beatsPerBar + beat) * SCORE_TPQ);
    if (tick >= durationTicks) return;
    const duration = Math.max(8, Math.min(durationTicks - tick, Math.round(durBeats * SCORE_TPQ)));
    events.push({ tick, type: 'noteOn', channel: ch, note: midiNote(noteName), velocity: vel, duration });
  };

  // Slow 2-to-2.5-bar Choir Aah swells separated by full 1.5-to-2-bar silent breathing rests.
  const padPhrases = [
    { bar: 0, beat: 0.0, dur: 9.2, notes: ['D3', 'A3', 'E4'], vel: 72 },
    { bar: 4, beat: 0.0, dur: 8.0, notes: ['D3', 'A3', 'G#4'], vel: 75 },
    { bar: 8, beat: 0.5, dur: 9.2, notes: ['F#2', 'C#3', 'A3', 'E4'], vel: 70 },
    { bar: 12, beat: 0.0, dur: 8.4, notes: ['B2', 'F#3', 'C#4', 'D4'], vel: 76 },
    { bar: 16, beat: 0.0, dur: 9.6, notes: ['A2', 'E3', 'B3', 'F#4'], vel: 72 },
    { bar: 20, beat: 0.0, dur: 8.8, notes: ['D3', 'A3', 'F#4'], vel: 70 },
  ];
  for (const p of padPhrases) {
    for (const n of p.notes) pushNote(0, p.bar, p.beat, p.dur, n, p.vel);
  }

  // Long single-note high bowed string cantus tones on select phrases.
  const cantus = [
    { bar: 4, beat: 1.5, dur: 6.5, note: 'F#5', vel: 64 },
    { bar: 9, beat: 0.0, dur: 7.0, note: 'E5', vel: 62 },
    { bar: 12, beat: 2.0, dur: 6.4, note: 'D5', vel: 68 },
    { bar: 16, beat: 1.0, dur: 7.2, note: 'C#5', vel: 64 },
    { bar: 20, beat: 1.5, dur: 6.5, note: 'A4', vel: 60 },
  ];
  for (const s of cantus) pushNote(1, s.bar, s.beat, s.dur, s.note, s.vel);

  // Ancient Ceporah temple bell tolls once every 6 bars.
  const bells = [
    { bar: 0, beat: 0.0, dur: 7.5, note: 'D4', vel: 72 },
    { bar: 6, beat: 1.0, dur: 7.5, note: 'A3', vel: 68 },
    { bar: 12, beat: 0.0, dur: 7.5, note: 'F#4', vel: 74 },
    { bar: 18, beat: 1.5, dur: 7.5, note: 'E4', vel: 66 },
  ];
  for (const b of bells) pushNote(2, b.bar, b.beat, b.dur, b.note, b.vel);

  // Isolated starlight celesta harmonics (2 to 3 unhurried notes per 4-bar span).
  const harmonics = [
    { bar: 1, beat: 2.5, dur: 3.2, note: 'A5', vel: 62 },
    { bar: 3, beat: 1.0, dur: 3.5, note: 'E5', vel: 58 },
    { bar: 5, beat: 2.0, dur: 3.2, note: 'G#5', vel: 64 },
    { bar: 7, beat: 0.5, dur: 3.2, note: 'F#5', vel: 60 },
    { bar: 7, beat: 3.0, dur: 2.8, note: 'A4', vel: 58 },
    { bar: 9, beat: 3.0, dur: 3.2, note: 'C#5', vel: 62 },
    { bar: 11, beat: 1.5, dur: 3.5, note: 'E5', vel: 60 },
    { bar: 13, beat: 2.5, dur: 3.2, note: 'F#5', vel: 65 },
    { bar: 15, beat: 1.0, dur: 3.5, note: 'D5', vel: 60 },
    { bar: 17, beat: 2.0, dur: 3.2, note: 'E5', vel: 63 },
    { bar: 19, beat: 1.5, dur: 3.4, note: 'B4', vel: 58 },
    { bar: 21, beat: 2.5, dur: 3.2, note: 'A5', vel: 64 },
    { bar: 22, beat: 3.0, dur: 3.0, note: 'F#5', vel: 60 },
    { bar: 23, beat: 1.5, dur: 2.2, note: 'E5', vel: 58 },
  ];
  for (const h of harmonics) pushNote(3, h.bar, h.beat, h.dur, h.note, h.vel);

  events.sort((a, b) => a.tick - b.tick || (EVENT_RANK[a.type] ?? 3) - (EVENT_RANK[b.type] ?? 3));
  _cachedSong = {
    name: BAZAAR_SONG_NAME,
    beatsPerMinute: bpm,
    events,
    secondsPerTick,
    durationTicks,
    seamless: true,
    level: 1.18,
  };
  return _cachedSong;
}

/**
 * Hold the Psijic astral score while inside The Bazaar Betwixt.
 * @param {boolean} inBazaar
 */
export function bazaarScoreFrame(inBazaar) {
  if (!inBazaar) return false;
  if (!_songRegistered) {
    _songRegistered = music.registerSong(BAZAAR_SONG_NAME, bazaarAstralSong());
  }
  music.playSong(BAZAAR_SONG_NAME);
  return true;
}

/** @type {AudioBuffer | null} */
let _noiseBuf = null;
/** @type {BaseAudioContext | null} */
let _noiseCtx = null;

function ensureNoiseBuffer(/** @type {AudioContext} */ ctx) {
  if (_noiseBuf && _noiseCtx === ctx) return _noiseBuf;
  const len = Math.floor(ctx.sampleRate * 2.0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let s = 0x50534a43;
  let last = 0;
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const white = (s / 2147483648) - 1;
    last = last * 0.82 + white * 0.18;
    data[i] = last * 2.4;
  }
  _noiseBuf = buf;
  _noiseCtx = ctx;
  return buf;
}

function makePanner(/** @type {AudioContext} */ ctx, /** @type {number[]} */ pos, /** @type {number} */ refD, /** @type {number} */ maxD) {
  const pan = ctx.createPanner();
  pan.panningModel = 'HRTF';
  pan.distanceModel = 'linear';
  pan.refDistance = refD;
  pan.maxDistance = maxD;
  pan.rolloffFactor = 1;
  placeAudio(pan, pos);
  return pan;
}

const BRIDGE_CHORD_HZ = [739.99, 880.00, 987.77, 1108.73, 1318.51, 1479.98];

export function createBazaarAudio() {
  /** @type {any} */
  let outdoorTearLoop = null;
  /** @type {any} */
  let sanctumBed = null;
  let reverbWarmed = false;
  let stepAccum = 0;
  let stepIndex = 0;
  /** @type {[number, number] | null} */
  let lastFeetXZ = null;

  function getRunningBus() {
    const ctx = /** @type {AudioContext | null} */ (/** @type {any} */ (audio)?.ctx ?? null);
    const bus = /** @type {AudioNode | null} */ (/** @type {any} */ (audio)?._out?.() ?? null);
    if (!ctx || !bus || ctx.state !== 'running') return null;
    return { ctx, bus };
  }

  function warmReverb(wetLevel = 0) {
    const rb = getRunningBus();
    if (!rb) return;
    if (!reverbWarmed) {
      if (audio.holdReverb(REVERB_OWNER)) {
        audio.reverbZone('Stoneroom', null);
        reverbWarmed = true;
      }
    }
    const slot = /** @type {any} */ (audio)?._zone?.slots?.[0];
    if (slot?.wet) {
      const t = rb.ctx.currentTime;
      slot.wet.gain.cancelScheduledValues(t);
      slot.wet.gain.setTargetAtTime(wetLevel, t, 0.12);
    }
  }

  function stopOutdoorTearLoop() {
    if (!outdoorTearLoop) return;
    const lp = outdoorTearLoop;
    outdoorTearLoop = null;
    try { lp.oscA.stop(); lp.oscB.stop(); lp.oscC.stop(); } catch { /* stopped */ }
    releaseNodes(lp.oscA, lp.oscB, lp.oscC, lp.flt, lp.gain, lp.pan);
  }

  function stopSanctumBed() {
    if (!sanctumBed) return;
    const sb = sanctumBed;
    sanctumBed = null;
    try {
      sb.loomA.stop(); sb.loomB.stop(); sb.loomC.stop();
      sb.lfo.stop(); sb.detuneLfo.stop();
      sb.chancelA.stop(); sb.chancelB.stop();
      sb.wfSrcL.stop(); sb.wfSrcR.stop();
    } catch { /* stopped */ }
    releaseNodes(
      sb.loomA, sb.loomB, sb.loomC, sb.loomCGain,
      sb.lfo, sb.lfoGain, sb.detuneLfo, sb.detuneLfoGain,
      sb.loomFlt, sb.loomGain, sb.loomPan,
      sb.chancelA, sb.chancelB, sb.chancelGain, sb.chancelPan,
      sb.wfSrcL, sb.wfFltL, sb.wfGainL, sb.wfPanL,
      sb.wfSrcR, sb.wfFltR, sb.wfGainR, sb.wfPanR,
    );
  }

  return {
    playSummonSlash() {
      const rb = getRunningBus();
      if (!rb) return;
      const { ctx, bus } = rb;
      const t0 = ctx.currentTime;

      // Crystalline vertical reality-parting slash (0.0 - 0.62 s).
      const src = ctx.createBufferSource();
      src.buffer = ensureNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 5.5;
      bp.frequency.setValueAtTime(2600, t0);
      bp.frequency.exponentialRampToValueAtTime(680, t0 + 0.58);
      const slashG = ctx.createGain();
      slashG.gain.setValueAtTime(0.0001, t0);
      slashG.gain.linearRampToValueAtTime(0.11, t0 + 0.035);
      slashG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.62);
      src.connect(bp).connect(slashG).connect(bus);
      src.start(t0);
      src.stop(t0 + 0.65);

      // Sub-harmonic astral bloom as the spatial seam unzips (0.45 - 2.25 s).
      const bloomEnv = ctx.createGain();
      bloomEnv.gain.setValueAtTime(0.0001, t0 + 0.38);
      bloomEnv.gain.linearRampToValueAtTime(0.075, t0 + 0.95);
      bloomEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.28);
      bloomEnv.connect(bus);

      const freqs = [110.0, 164.81, 329.63, 415.30];
      /** @type {AudioNode[]} */
      const nodes = [src, bp, slashG, bloomEnv];
      let lastOsc = null;
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f * 0.97, t0 + 0.38);
        osc.frequency.exponentialRampToValueAtTime(f, t0 + 1.15);
        g.gain.value = idx === 0 ? 0.45 : idx === 1 ? 0.28 : 0.14;
        osc.connect(g).connect(bloomEnv);
        osc.start(t0 + 0.38);
        osc.stop(t0 + 2.32);
        nodes.push(osc, g);
        lastOsc = osc;
      });
      if (lastOsc) {
        /** @type {OscillatorNode} */ (lastOsc).onended = () => releaseNodes(...nodes);
      }
    },

    playSealSnap() {
      const rb = getRunningBus();
      if (!rb) return;
      const { ctx, bus } = rb;
      const t0 = ctx.currentTime;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(0.055, t0 + 0.45);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.18);
      env.connect(bus);

      const freqs = [440, 293.66, 146.83];
      /** @type {AudioNode[]} */
      const nodes = [env];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * 1.06, t0);
        osc.frequency.exponentialRampToValueAtTime(f * 0.72, t0 + 1.15);
        g.gain.value = idx === 0 ? 0.22 : 0.38;
        osc.connect(g).connect(env);
        osc.start(t0);
        osc.stop(t0 + 1.2);
        nodes.push(osc, g);
        if (idx === 2) osc.onended = () => releaseNodes(...nodes);
      });
    },

    /** @param {boolean} entering */
    playThresholdWash(entering) {
      if (entering) warmReverb(0.62);
      const rb = getRunningBus();
      if (!rb) return;
      const { ctx, bus } = rb;
      const t0 = ctx.currentTime;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(0.068, t0 + 0.028);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.68);
      env.connect(bus);

      const chord = entering ? [293.66, 440.0, 659.25, 924.99] : [659.25, 440.0, 329.63, 220.0];
      /** @type {AudioNode[]} */
      const nodes = [env];
      chord.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx < 2 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, t0);
        osc.frequency.exponentialRampToValueAtTime(f * (entering ? 1.015 : 0.985), t0 + 0.66);
        g.gain.value = idx === 0 ? 0.42 : idx === 1 ? 0.28 : 0.15;
        osc.connect(g).connect(env);
        osc.start(t0);
        osc.stop(t0 + 0.70);
        nodes.push(osc, g);
        if (idx === chord.length - 1) osc.onended = () => releaseNodes(...nodes);
      });
    },

    /**
     * Update the subtle 3D positional hum within ~11 m of the open spatial seam in Gothway Garden.
     * @param {number[] | null} earPos
     * @param {number[] | null} tearPos
     * @param {number} openProgress
     */
    updateOutdoorPortal(earPos, tearPos, openProgress) {
      if (!earPos || !tearPos || openProgress <= 0.08) {
        stopOutdoorTearLoop();
        return;
      }
      const d = Math.hypot(earPos[0] - tearPos[0], earPos[2] - tearPos[2]);
      if (d > 12.5) {
        stopOutdoorTearLoop();
        return;
      }
      const rb = getRunningBus();
      if (!rb) return;
      const { ctx, bus } = rb;
      if (!outdoorTearLoop) {
        const pan = makePanner(ctx, [tearPos[0], tearPos[1] + 1.65, tearPos[2]], 1.2, 11.5);
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = 640;
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        const oscA = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        const oscC = ctx.createOscillator();
        oscA.type = 'sine'; oscA.frequency.value = 146.83;
        oscB.type = 'triangle'; oscB.frequency.value = 220.25;
        oscC.type = 'sine'; oscC.frequency.value = 329.63;
        oscA.connect(flt); oscB.connect(flt); oscC.connect(flt);
        flt.connect(gain).connect(pan).connect(bus);
        oscA.start(); oscB.start(); oscC.start();
        outdoorTearLoop = { oscA, oscB, oscC, flt, gain, pan };
      } else {
        placeAudio(outdoorTearLoop.pan, [tearPos[0], tearPos[1] + 1.65, tearPos[2]]);
      }
      const targetGain = 0.032 * openProgress;
      outdoorTearLoop.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.08);
    },

    /** @param {{ origin: number[], feet: number[], grounded: boolean, nowMs: number, still: boolean }} p */
    updateIndoorSanctum({ origin, feet, grounded, nowMs, still }) {
      stopOutdoorTearLoop();
      warmReverb(0.62);
      const rb = getRunningBus();
      if (!rb) return;
      const { ctx, bus } = rb;
      const timeSec = nowMs / 1000;

      if (!sanctumBed) {
        // Warm, deep, slowly breathing vault and scrying basin resonance (D2 + A2 + soft F#3).
        const loomPan = makePanner(ctx, [origin[0], origin[1] + 2.2, origin[2]], 3.5, 34.0);
        const loomFlt = ctx.createBiquadFilter();
        loomFlt.type = 'lowpass';
        loomFlt.frequency.value = 290;
        const loomGain = ctx.createGain();
        loomGain.gain.value = 0.0001;
        const loomA = ctx.createOscillator();
        const loomB = ctx.createOscillator();
        const loomC = ctx.createOscillator();
        const loomCGain = ctx.createGain();
        loomA.type = 'sine'; loomA.frequency.value = 73.42;
        loomB.type = 'sine'; loomB.frequency.value = 110.0;
        loomC.type = 'sine'; loomC.frequency.value = 185.0;
        loomCGain.gain.value = 0.12;

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.07;
        lfoGain.gain.value = 65;
        lfo.connect(lfoGain).connect(loomFlt.frequency);

        const detuneLfo = ctx.createOscillator();
        const detuneLfoGain = ctx.createGain();
        detuneLfo.frequency.value = 0.11;
        detuneLfoGain.gain.value = 2;
        detuneLfo.connect(detuneLfoGain);
        if (loomB.detune) detuneLfoGain.connect(loomB.detune);
        if (loomC.detune) detuneLfoGain.connect(loomC.detune);

        loomA.connect(loomFlt);
        loomB.connect(loomFlt);
        loomC.connect(loomCGain).connect(loomFlt);
        loomFlt.connect(loomGain).connect(loomPan).connect(bus);
        loomA.start(); loomB.start(); loomC.start();
        lfo.start(); detuneLfo.start();

        const chancelPan = makePanner(ctx, [origin[0], origin[1] + 2.0, origin[2] + 9.2], 2.0, 11.5);
        const chancelGain = ctx.createGain();
        chancelGain.gain.value = 0.0001;
        const chancelA = ctx.createOscillator();
        const chancelB = ctx.createOscillator();
        chancelA.type = 'sine'; chancelA.frequency.value = 440.0;
        chancelB.type = 'sine'; chancelB.frequency.value = 659.25;
        chancelA.connect(chancelGain);
        chancelB.connect(chancelGain);
        chancelGain.connect(chancelPan).connect(bus);
        chancelA.start(); chancelB.start();

        // Soft, natural distant Artaeum waterfall cascades.
        const nb = ensureNoiseBuffer(ctx);
        const makeWf = (/** @type {number[]} */ p) => {
          const src = ctx.createBufferSource();
          src.buffer = nb;
          src.loop = true;
          const flt = ctx.createBiquadFilter();
          flt.type = 'lowpass';
          flt.Q.value = 0.5;
          flt.frequency.value = 560;
          const g = ctx.createGain();
          g.gain.value = 0.0001;
          const pan = makePanner(ctx, p, 4.0, 28.0);
          src.connect(flt).connect(g).connect(pan).connect(bus);
          src.start();
          return { src, flt, g, pan };
        };
        const wfL = makeWf([origin[0] - 13.4, origin[1] + 1.2, origin[2] - 18.8]);
        const wfR = makeWf([origin[0] + 13.8, origin[1] + 1.2, origin[2] - 18.2]);

        sanctumBed = {
          loomA, loomB, loomC, loomCGain,
          lfo, lfoGain, detuneLfo, detuneLfoGain,
          loomFlt, loomGain, loomPan,
          chancelA, chancelB, chancelGain, chancelPan,
          wfSrcL: wfL.src, wfFltL: wfL.flt, wfGainL: wfL.g, wfPanL: wfL.pan,
          wfSrcR: wfR.src, wfFltR: wfR.flt, wfGainR: wfR.g, wfPanR: wfR.pan,
        };
      } else {
        placeAudio(sanctumBed.loomPan, [origin[0], origin[1] + 2.2, origin[2]]);
        placeAudio(sanctumBed.chancelPan, [origin[0], origin[1] + 2.0, origin[2] + 9.2]);
        placeAudio(sanctumBed.wfPanL, [origin[0] - 13.4, origin[1] + 1.2, origin[2] - 18.8]);
        placeAudio(sanctumBed.wfPanR, [origin[0] + 13.8, origin[1] + 1.2, origin[2] - 18.2]);
      }

      const wf = bazaarWaterfallState(timeSec, still);
      const tNow = ctx.currentTime;
      sanctumBed.loomGain.gain.setTargetAtTime(0.020, tNow, 0.16);
      sanctumBed.chancelGain.gain.setTargetAtTime(0.006, tNow, 0.16);
      const wfLevel = 0.003 + 0.011 * wf.rate;
      const wfFreq = 380 + 180 * wf.rate;
      sanctumBed.wfGainL.gain.setTargetAtTime(wfLevel, tNow, 0.10);
      sanctumBed.wfGainR.gain.setTargetAtTime(wfLevel, tNow, 0.10);
      sanctumBed.wfFltL.frequency.setTargetAtTime(wfFreq, tNow, 0.10);
      sanctumBed.wfFltR.frequency.setTargetAtTime(wfFreq, tNow, 0.10);

      // Crystalline D-Lydian footsteps across every zone inside The Bazaar Betwixt.
      const lx = feet[0] - origin[0];
      const lz = feet[2] - origin[2];
      if (!lastFeetXZ) {
        lastFeetXZ = [lx, lz];
        return;
      }
      const stepD = Math.hypot(lx - lastFeetXZ[0], lz - lastFeetXZ[1]);
      lastFeetXZ[0] = lx;
      lastFeetXZ[1] = lz;
      if (!grounded || stepD > 1.8) {
        if (!grounded) stepAccum = 0;
        return;
      }
      stepAccum += stepD;
      if (stepAccum >= 1.86) {
        stepAccum %= 1.86;
        const onBridge = lz >= BAZAAR_BRIDGE_Z0 && lz <= BAZAAR_BRIDGE_Z1 && Math.abs(lx) <= BAZAAR_BRIDGE_HALF_W;
        const onChancel = lz >= 5.5 && Math.abs(lx) <= 4.1;
        const baseHz = BRIDGE_CHORD_HZ[stepIndex % BRIDGE_CHORD_HZ.length];
        stepIndex++;
        const peakGain = onBridge ? 0.038 : 0.030;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, tNow);
        env.gain.linearRampToValueAtTime(peakGain, tNow + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, tNow + 0.28);
        env.connect(bus);

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(baseHz, tNow);
        osc2.frequency.setValueAtTime(baseHz * 2.0, tNow);
        g2.gain.value = onBridge ? 0.26 : 0.18;
        osc1.connect(env);
        osc2.connect(g2).connect(env);
        osc1.start(tNow);
        osc2.start(tNow);
        osc1.stop(tNow + 0.30);
        osc2.stop(tNow + 0.30);

        /** @type {AudioNode[]} */
        const stepNodes = [env, osc1, osc2, g2];
        let tailOsc = osc1;

        if (!onBridge) {
          const oscSub = ctx.createOscillator();
          const gSub = ctx.createGain();
          oscSub.type = 'sine';
          oscSub.frequency.setValueAtTime(baseHz * 0.5, tNow);
          gSub.gain.setValueAtTime(0.0001, tNow);
          gSub.gain.linearRampToValueAtTime(peakGain * 0.22, tNow + 0.008);
          gSub.gain.exponentialRampToValueAtTime(0.0001, tNow + 0.24);
          oscSub.connect(gSub).connect(bus);
          oscSub.start(tNow);
          oscSub.stop(tNow + 0.26);
          stepNodes.push(oscSub, gSub);
        }

        if (onChancel) {
          const oscBell = ctx.createOscillator();
          const gBell = ctx.createGain();
          oscBell.type = 'sine';
          oscBell.frequency.setValueAtTime(baseHz * 1.5, tNow);
          gBell.gain.setValueAtTime(0.0001, tNow);
          gBell.gain.linearRampToValueAtTime(peakGain * 0.14, tNow + 0.008);
          gBell.gain.exponentialRampToValueAtTime(0.0001, tNow + 0.36);
          oscBell.connect(gBell).connect(bus);
          oscBell.start(tNow);
          oscBell.stop(tNow + 0.38);
          stepNodes.push(oscBell, gBell);
          tailOsc = oscBell;
        }

        tailOsc.onended = () => releaseNodes(...stepNodes);
      }
    },

    onExitSanctum() {
      stopSanctumBed();
      if (reverbWarmed) {
        audio.releaseReverb(REVERB_OWNER);
        reverbWarmed = false;
      }
      stepAccum = 0;
      lastFeetXZ = null;
    },

    releaseAll() {
      stopOutdoorTearLoop();
      stopSanctumBed();
      if (reverbWarmed) {
        audio.releaseReverb(REVERB_OWNER);
        reverbWarmed = false;
      }
      stepAccum = 0;
      lastFeetXZ = null;
    },
  };
}
