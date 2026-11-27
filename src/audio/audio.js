import { SndFile, SAMPLE_RATE } from '../formats/sndFile.js';
import { getFloat, onSettingChange } from '../platform/settings.js';
import { REVERB_PRESET, reverbImpulse } from './reverbPresets.js';
import { setEquipSoundSink } from '../characters/equip.js';
import { SOUND_REPLACEMENTS, soundBufferKey, fetchReplacement, soundSilenced, soundReplacementGen } from './soundReplacer.js';

// decodeAudioData detaches its buffer, so a view is copied over its own range only, never the whole backing store.
export function decodableCopy(bytes) {
  if (!bytes?.buffer) return bytes;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function pcm8ToFloat32(bytes) {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] - 128) / 128;
  return out;
}

// The scene is left-handed and WebAudio is right-handed, so z is negated here, once, for the listener and sources.
export const audioFrame = (p) => [p[0], p[1], -p[2]];
export function placeAudio(pan, p) {
  const [x, y, z] = audioFrame(p);
  pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z;
}
// A stopped sound disconnects every node it built; a browser may keep connected nodes alive for the page's life.
export function releaseNodes(...nodes) {
  for (const n of nodes) { if (n) { try { n.disconnect(); } catch { } } }
}
// HRTF gives a front and back cue that equal-power panning lacks, a deliberate step past Daggerfall Unity.
export const PANNING_MODEL = 'HRTF';
export const VOICE_FADE_S = 0.08;

export const REAL_VOICES = 32;
export function distanceGain(d, { refDistance = 1, maxDistance = 500, distanceModel = 'inverse', rolloffFactor = 1 } = {}) {
  const ref = Math.max(1e-6, refDistance), r = Math.max(0, rolloffFactor), x = Math.max(ref, Number.isFinite(d) ? d : 0);
  if (distanceModel === 'linear') {
    const max = Math.max(ref, maxDistance);
    return max > ref ? Math.max(0, 1 - (r * (Math.min(x, max) - ref)) / (max - ref)) : 1;
  }
  if (distanceModel === 'exponential') return (x / ref) ** -r;
  return ref / (ref + r * (x - ref));
}
export function voiceRoom(live, level, max = REAL_VOICES, flat = false) {
  if (live.length < max) return { play: true, steal: null };
  let q = null, qf = null;
  for (const v of live) {
    if (v.flat) { if (!qf || v.level < qf.level) qf = v; }
    else if (!q || v.level < q.level) q = v;
  }
  if (flat) { const s = q ?? qf; return s ? { play: true, steal: s } : { play: false, steal: null }; }
  return q && level >= q.level ? { play: true, steal: q } : { play: false, steal: null };
}

let _oneShotObserver = null;
export function setOneShotObserver(fn) { _oneShotObserver = typeof fn === 'function' ? fn : null; }

const BED_FADE_S = 0.4;

export const LIMITER = Object.freeze({ threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.12 });
export const LIMIT_LINEAR = 0.75;
export const LIMIT_CEILING = 0.98;
export const LIMIT_RANGE = 4;
export function limitAmplitude(s) {
  const a = Math.abs(s);
  if (a <= LIMIT_LINEAR) return s;
  const room = LIMIT_CEILING - LIMIT_LINEAR;
  return Math.sign(s) * (LIMIT_LINEAR + room * Math.tanh((a - LIMIT_LINEAR) / room));
}
let _limiterCurve = null;
export function limiterCurve(n = 4097) {
  if (_limiterCurve && _limiterCurve.length === n) return _limiterCurve;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = limitAmplitude(LIMIT_RANGE * ((2 * i) / (n - 1) - 1));
  return (_limiterCurve = c);
}
export const limiterTrim = ({ threshold, ratio } = LIMITER) => 10 ** ((0.6 * threshold * (1 - 1 / ratio)) / 20);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.snd = null;
    this.buffers = new Map();
    this.enabled = false;
    // Null, not false: ensure latches with ??=, which assigns only over null or undefined.
    this._booted = null;
    this._listener = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 };
    this._master = null;
    this._scale = 1;
    this._reverbOwner = null;
    this._zone = null;
    this._reverbBuffers = null;
  }

  _out() {
    if (!this.ctx) return null;
    if (!this._master || this._master.context !== this.ctx) {
      this._listenerIn = this.ctx.createGain();
      this._sink = this._limiter();
      this._listenerIn.connect(this._sink);
      this._listenerFilter = null; this._listenerCut = 0;
      this._master = this.ctx.createGain();
      this._master.connect(this._listenerIn);
      this._reverbIn = this.ctx.createGain();
      this._master.connect(this._reverbIn);
      this._reverb = null;
      this._unwatchVolume ??= onSettingChange((section, key) => {
        if (section === 'Controls' && key === 'SoundVolume') this._relevel();
      });
    }
    this._master.gain.value = getFloat('Controls', 'SoundVolume', 0, 1);
    return this._master;
  }

  _relevel() {
    if (!this.ctx || !this._master || this._master.context !== this.ctx) return;
    const g = this._master.gain, v = getFloat('Controls', 'SoundVolume', 0, 1), t = this.ctx.currentTime;
    try { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + 0.05); } catch { g.value = v; }
  }

  _limiter() {
    const ctx = this.ctx;
    if (typeof ctx.createDynamicsCompressor !== 'function' || typeof ctx.createWaveShaper !== 'function') return ctx.destination;
    const comp = ctx.createDynamicsCompressor(), trim = ctx.createGain(), ceiling = ctx.createWaveShaper();
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) comp[k].value = LIMITER[k];
    trim.gain.value = limiterTrim() / LIMIT_RANGE;
    ceiling.curve = limiterCurve();
    ceiling.oversample = 'none';
    comp.connect(trim);
    trim.connect(ceiling);
    ceiling.connect(ctx.destination);
    this._limiterNodes = { comp, trim, ceiling };
    return comp;
  }

  _lowpass(cutoffHz) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoffHz;
    // Web Audio reads a low-pass Q in decibels, so Unity's linear Q of 1 is 0 here.
    f.Q.value = 0;
    return f;
  }

  setReverb(preset) {
    if (this._reverbOwner != null) return false;
    this._ensureCtx();
    if (!this.ctx) return false;
    this._out();
    const send = this._reverbIn;
    if (this._reverb) { try { send.disconnect(); this._reverb.wet.disconnect(); } catch { } this._reverb = null; }
    if (!preset) return true;
    const p = typeof preset === 'string' ? REVERB_PRESET[preset] : preset;
    if (!p) return false;
    const conv = this.ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = reverbImpulse(this.ctx, p);
    const wet = this.ctx.createGain();
    wet.gain.value = 1;
    send.connect(conv).connect(wet).connect(this._listenerIn);
    this._reverb = { conv, wet, preset: typeof preset === 'string' ? preset : 'custom' };
    return true;
  }
  get reverbPreset() { return this._reverb?.preset ?? null; }

  holdReverb(owner) {
    if (owner == null) return false;
    if (this._reverbOwner === owner) return true;
    if (this._reverb) { try { this._reverbIn?.disconnect(); this._reverb.wet.disconnect(); } catch { } this._reverb = null; }
    this._reverbOwner = owner;
    return true;
  }
  releaseReverb(owner) {
    if (owner == null || this._reverbOwner !== owner) return false;
    this._reverbOwner = null;
    this._dropZone();
    this._reverbBuffers = null;
    return true;
  }
  reverbHeld() { return this._reverbOwner; }
  _heldImpulse(name) {
    const p = REVERB_PRESET[name];
    if (!p) return null;
    this._reverbBuffers ??= new Map();
    if (!this._reverbBuffers.has(name)) this._reverbBuffers.set(name, reverbImpulse(this.ctx, p));
    return this._reverbBuffers.get(name);
  }
  _zoneSlot(name, gain) {
    const buf = name ? this._heldImpulse(name) : null;
    if (!buf) return { preset: null, conv: null, wet: null };
    const conv = this.ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = buf;
    const wet = this.ctx.createGain();
    wet.gain.value = gain;
    this._reverbIn.connect(conv);
    conv.connect(wet).connect(this._listenerIn);
    return { preset: name, conv, wet };
  }
  _dropSlot(slot) {
    if (!slot?.conv) return;
    try { this._reverbIn?.disconnect(slot.conv); } catch { }
    try { slot.conv.disconnect(); slot.wet.disconnect(); } catch { }
  }
  _dropZone() {
    if (!this._zone) return;
    for (const slot of this._zone.slots) this._dropSlot(slot);
    this._zone = null;
  }
  reverbZone(live, idle = null) {
    if (this._reverbOwner == null) return false;
    this._ensureCtx();
    if (!this.ctx || !this._out()) return false;
    const was = this._zone?.slots ?? [];
    const keep = (name, gain) => {
      const i = was.findIndex((q) => q && q.preset === name && name != null);
      if (i < 0) return this._zoneSlot(name, gain);
      const slot = was[i];
      was[i] = null;
      try { slot.wet.gain.cancelScheduledValues?.(this.ctx.currentTime); } catch { }
      slot.wet.gain.value = gain;
      return slot;
    };
    const a = keep(live, 1), b = idle != null && idle !== live ? keep(idle, 0) : { preset: null, conv: null, wet: null };
    for (const slot of was) this._dropSlot(slot);
    this._zone = { slots: [a, b], live: 0 };
    return true;
  }
  reverbFade(preset, seconds = 0.4) {
    const z = this._zone;
    if (!z || !preset) return false;
    if (z.slots[z.live].preset === preset) return false;
    const to = 1 - z.live;
    if (z.slots[to].preset !== preset) { this._dropSlot(z.slots[to]); z.slots[to] = this._zoneSlot(preset, 0); }
    if (!z.slots[to].wet) return false;
    const t = this.ctx.currentTime, s = Math.max(0, seconds);
    const ramp = (g, v) => { try { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + s); } catch { g.value = v; } };
    ramp(z.slots[to].wet.gain, 1);
    if (z.slots[z.live].wet) ramp(z.slots[z.live].wet.gain, 0);
    z.live = to;
    return true;
  }
  reverbZoneState() { return this._zone ? { presets: this._zone.slots.map((q) => q.preset), live: this._zone.live } : null; }

  scaled(gain, fn) {
    const was = this._scale;
    this._scale = was * (Number.isFinite(gain) && gain >= 0 ? gain : 1);
    try { return fn(); } finally { this._scale = was; }
  }
  reverbSend() { return this._out() ? this._reverbIn : null; }
  listenerBus() { return this._out() ? this._listenerIn : null; }

  setListenerLowPass(cutoffHz) {
    this._ensureCtx();
    if (!this._out()) return;
    const want = cutoffHz > 0 ? cutoffHz : 0;
    if (want === this._listenerCut) return;
    const bus = this._listenerIn;
    try { bus.disconnect(); } catch { }
    if (this._listenerFilter) { try { this._listenerFilter.disconnect(); } catch { } this._listenerFilter = null; }
    const sink = this._sink ?? this.ctx.destination;
    if (want) { this._listenerFilter = this._lowpass(want); bus.connect(this._listenerFilter).connect(sink); }
    else bus.connect(sink);
    this._listenerCut = want;
  }
  get listenerLowPass() { return this._listenerCut ?? 0; }

  ensure(fetchBytes) {
    setEquipSoundSink((clip) => this.playOneShot(clip));
    // The latch holds the boot promise, so a second caller waits for the same load instead of playing into a
    // disabled engine.
    return (this._booted ??= this._boot(fetchBytes));
  }

  // The context is made before the await, suspended until a gesture, so a caller that reads the clock at once
  // gets one without waiting for DAGGER.SND.
  async _boot(fetchBytes) {
    if (typeof window !== 'undefined') {
      this._ensureCtx();
      this.attachGestureResume();
    }
    await this.init(fetchBytes);
  }

  async init(fetchBytes) {
    try {
      const f = new SndFile();
      f.load(await fetchBytes('DAGGER.SND'));
      this.snd = f;
      this.enabled = true;
    } catch (e) {
      console.warn('DAGGER.SND unavailable - sound disabled:', e?.message ?? e);
      this.enabled = false;
    }
  }

  attachGestureResume(target = window) {
    const resume = () => {
      this._ensureCtx();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      target.addEventListener(ev, resume, { passive: true });
    }
  }

  _ensureCtx() {
    if (this.ctx) return;
    if (typeof window === 'undefined') { this.enabled = false; return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
  }

  _replacement(index) {
    const name = SOUND_REPLACEMENTS[index];
    if (!name) return null;
    const gen = soundReplacementGen();
    const key = `${soundBufferKey(name)}#${gen}`;
    const b = this.buffers.get(key);
    if (b) return b;
    this._repLoads ??= new Set();
    if (!this._repLoads.has(key)) {
      this._repLoads.add(key);
      fetchReplacement(name).then((bytes) => (bytes ? this.registerSound(key, bytes) : false)).catch(() => false);
    }
    return null;
  }

  preloadReplacements() {
    for (const i of Object.keys(SOUND_REPLACEMENTS)) this._replacement(Number(i));
  }

  clipLevel(index) {
    const buf = this._buffer(index);
    if (!buf) return null;
    const cache = (this._levels ??= new WeakMap());
    let rms = cache.get(buf);
    if (rms === undefined) {
      let sum = 0, n = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) sum += d[i] * d[i]; n += d.length; }
      rms = n ? Math.sqrt(sum / n) : 0;
      cache.set(buf, rms);
    }
    return rms;
  }

  _buffer(index) {
    if (typeof index === 'number') {
      if (soundSilenced(index)) return null;
      const r = this._replacement?.(index); if (r) return r;
    }
    let b = this.buffers.get(index);
    if (b !== undefined) return b;
    if (typeof index === 'string' || !this.snd) return null;
    const rec = this.snd.getSound(index);
    if (!rec || !rec.waveData?.length) { this.buffers.set(index, null); return null; }
    const samples = pcm8ToFloat32(rec.waveData);
    b = this.ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    b.getChannelData(0).set(samples);
    this.buffers.set(index, b);
    return b;
  }

  async registerSound(key, bytes) {
    try {
      this._ensureCtx();
      if (!this.ctx || this.buffers.has(key)) return this.buffers.get(key) != null;
      const buf = await this.ctx.decodeAudioData(decodableCopy(bytes));
      this.buffers.set(key, buf);
      return true;
    } catch {
      return false;
    }
  }

  registerSamples(key, samples, sampleRate) {
    this._ensureCtx();
    if (!this.ctx) return false;
    if (this.buffers.get(key)) return true;
    const b = this.ctx.createBuffer(1, samples.length, sampleRate);
    b.getChannelData(0).set(samples);
    this.buffers.set(key, b);
    return true;
  }

  samplesOf(index) {
    const rec = this.snd?.getSound?.(index);
    return rec?.waveData?.length ? pcm8ToFloat32(rec.waveData) : null;
  }

  _ready() {
    this._ensureCtx();
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  playOneShot(index, volume = 1, pitch = 1) {
    if (_oneShotObserver) { try { _oneShotObserver(index, volume); } catch { } }
    // The UI click skips a press whose handler already chose a sound; only sounds chosen in an input event count.
    if (globalThis.event && typeof globalThis.event.type === 'string') this.lastOneShotAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this._ready()) return undefined;
    const buf = this._buffer(index);
    if (!buf) return undefined;
    const level = volume * this._scale;
    if (!this._voiceTake(level, true)) return undefined;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    src.connect(gain).connect(this._out());
    this._voiceKeep(src, gain, null, level, buf.duration / (pitch || 1));
    src.start();
    return buf.duration;
  }

  _voiceTake(level, flat = false) {
    const ctx = this.ctx, live = (this._voices ??= []), now = ctx.currentTime;
    for (let i = live.length - 1; i >= 0; i--) if (live[i].ended || live[i].ctx !== ctx || live[i].until <= now) live.splice(i, 1);
    const room = voiceRoom(live, level, REAL_VOICES, flat);
    const v = room.steal;
    if (v) {
      live.splice(live.indexOf(v), 1);
      v.ended = true;
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(0, now + VOICE_FADE_S);
        v.src.stop(now + VOICE_FADE_S + 0.02);
      } catch { try { v.src.stop(); } catch { } }
    }
    return room.play;
  }
  _voiceKeep(src, gain, pan, level, seconds, onEnd = null) {
    const v = { ctx: this.ctx, src, gain, level, until: this.ctx.currentTime + seconds + VOICE_FADE_S, ended: false, flat: pan == null };
    (this._voices ??= []).push(v);
    let done = false;
    src.onended = () => {
      if (done) return;
      done = true; v.ended = true;
      releaseNodes(src, gain, pan);
      onEnd?.();
    };
    return v;
  }

  // DAGGER.SND record ids and archive indices are unrelated numbers; every id goes through this lookup first.
  soundIndexForId(id) {
    return this.snd?.getRecordIndex(id) ?? -1;
  }

  playOneShotId(id, volume = 1) {
    const index = this.soundIndexForId(id);
    return index >= 0 ? this.playOneShot(index, volume) : undefined;
  }

  play3dId(id, pos, volume = 1, opts = undefined) {
    const index = this.soundIndexForId(id);
    return index >= 0 ? this.play3d(index, pos, volume, opts) : undefined;
  }

  loop(index, volume = 1, { lowpass = 0 } = {}) {
    if (!this._ready()) return null;
    const buf = this._buffer(index);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    const tail = lowpass > 0 ? this._lowpass(lowpass) : null;
    if (tail) src.connect(gain).connect(tail).connect(this._out()); else src.connect(gain).connect(this._out());
    src.start();
    const release = () => releaseNodes(src, gain, tail);
    return {
      stop() {
        try { src.stop(); } catch { }
        release();
      },
      setVolume(v) { gain.gain.value = Math.max(0, Math.min(1, v)); },
      fadeStop(seconds = 0.4) {
        try {
          const t = src.context.currentTime;
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(gain.gain.value, t);
          gain.gain.linearRampToValueAtTime(0, t + seconds);
          src.stop(t + seconds + 0.05);
          src.onended = release;
        } catch {
          try { src.stop(); } catch { }
          release();
        }
      },
      setPitch(p) { src.playbackRate.value = p; },
    };
  }

  setLoop(name, clip, { volume = 1, pitch = 1 } = {}) {
    this._loops ??= new Map();
    const ch = this._loops.get(name);
    if (clip == null) {
      if (ch) { ch.stop(); this._loops.delete(name); }
      return null;
    }
    if (ch) {
      ch.want = clip;
      ch.rearm?.();
      ch.setVolume(volume);
      ch.setPitch(pitch);
      return ch;
    }
    const made = this._makeRetriggerLoop(clip, volume, pitch);
    if (!made) return null;
    this._loops.set(name, made);
    return made;
  }

  _makeRetriggerLoop(index, volume, pitch, out = null) {
    if (!this._ready()) return null;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    gain.connect(out ?? this._out());
    // A swapped clip takes over when the current one ends, as the Daggerfall Unity riding source does; a
    // restart would chop the hoofbeat. A clip that cannot play leaves the channel idle until the next set.
    const ch = { want: index, playing: null, rate: pitch, stopped: false,
      setVolume: (v) => { gain.gain.value = v; },
      setPitch: (p) => { ch.rate = p; if (ch.playing) ch.playing.playbackRate.value = p; },
      stop() {
        ch.stopped = true;
        if (ch.playing) { try { ch.playing.stop(); } catch { } ch.playing = null; }
        gain.disconnect();
      } };
    const arm = () => {
      if (ch.stopped) return;
      const buf = this._buffer(ch.want);
      if (!buf) { ch.playing = null; return; }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = ch.rate;
      src.connect(gain);
      src.onended = () => { if (ch.playing === src) { ch.playing = null; arm(); } };
      src.start();
      ch.playing = src;
    };
    ch.rearm = () => { if (!ch.stopped && !ch.playing) arm(); };
    arm();
    if (!ch.playing) { gain.disconnect(); return null; }
    return ch;
  }

  source() {
    const engine = this;
    let gain = null, vol = 1, rate = 1;
    const live = new Set();
    const node = () => {
      if (!engine._ready()) return null;
      if (!gain || gain.context !== engine.ctx) { gain = engine.ctx.createGain(); gain.connect(engine._out()); }
      gain.gain.value = vol;
      return gain;
    };
    return {
      get volume() { return vol; },
      set volume(v) { vol = Math.max(0, Math.min(1, Number(v) || 0)); if (gain) gain.gain.value = vol; },
      get pitch() { return rate; },
      set pitch(p) { rate = Number(p) || 1; for (const s of live) s.playbackRate.value = rate; },
      get isPlaying() { return live.size > 0; },
      playOneShot(key) {
        const g = node();
        const buf = g ? engine._buffer(key) : null;
        if (!buf) return undefined;
        const s = engine.ctx.createBufferSource();
        s.buffer = buf;
        s.playbackRate.value = rate;
        s.connect(g);
        s.onended = () => { live.delete(s); try { s.disconnect(); } catch { } };
        s.start();
        live.add(s);
        return buf.duration / rate;
      },
      stop() {
        for (const s of live) { try { s.stop(); } catch { } try { s.disconnect(); } catch { } }
        live.clear();
      },
      dispose() { this.stop(); if (gain) { try { gain.disconnect(); } catch { } gain = null; } },
    };
  }

  /**
   * @param {number} index
   * @param {number[]} pos
   * @param {number} [volume]
   * @param {{ refDistance?: number, maxDistance?: number, distanceModel?: string, pitch?: number, far?: boolean | string }} [opts]
   */
  play3d(index, pos, volume = 1, { refDistance = 1, maxDistance = 500, distanceModel = 'inverse', pitch = 1, far = false } = {}) {
    if (!this._ready()) return undefined;
    const buf = this._buffer(index);
    if (!buf) return undefined;
    const L0 = this._listener, level = volume * this._scale * distanceGain(Math.hypot(pos[0] - L0.x, pos[1] - L0.y, pos[2] - L0.z), { refDistance, maxDistance, distanceModel });
    if (!this._voiceTake(level)) return undefined;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const pan = this._panner(pos, { refDistance, maxDistance, distanceModel });
    const gain = this.ctx.createGain();
    gain.gain.value = volume * this._scale;
    src.connect(gain).connect(pan).connect(this._out());
    this._voiceKeep(src, gain, pan, level, buf.duration / (pitch || 1));
    src.start();
    // A far shot keeps its offset from the listener until its clip runs out, so distant thunder holds its bearing
    // and level as the player moves.
    if (far) {
      const L = this._listener;
      (this._far ??= []).push({ pan, off: [pos[0] - L.x, pos[1] - L.y, pos[2] - L.z], until: this.ctx.currentTime + buf.duration / pitch, src, gain, tag: far === true ? null : far });
    }
    return buf.duration;
  }

  /**
   * @param {number|string} index
   * @param {number[]} pos
   * @param {number} [volume]
   * @param {{ refDistance?: number, maxDistance?: number, distanceModel?: string, pitch?: number, onEnd?: () => void }} [opts]
   */
  play3dVoice(index, pos, volume = 1, { refDistance = 1, maxDistance = 500, distanceModel = 'inverse', pitch = 1, onEnd = null } = {}) {
    if (!this._ready()) return null;
    const buf = this._buffer(index);
    if (!buf) return null;
    const ctx = this.ctx;
    const L0 = this._listener, level = volume * distanceGain(Math.hypot(pos[0] - L0.x, pos[1] - L0.y, pos[2] - L0.z), { refDistance, maxDistance, distanceModel });
    if (!this._voiceTake(level)) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const pan = this._panner(pos, { refDistance, maxDistance, distanceModel });
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(pan).connect(this._out());
    const v = this._voiceKeep(src, gain, pan, level, buf.duration / (pitch || 1), onEnd);
    src.start();
    return {
      stop(seconds = VOICE_FADE_S) {
        if (v.ended) return;
        try {
          const t = ctx.currentTime;
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(gain.gain.value, t);
          gain.gain.linearRampToValueAtTime(0, t + seconds);
          src.stop(t + seconds + 0.02);
        } catch {
          try { src.stop(); } catch { }
        }
      },
    };
  }

  fadeFar(tag, seconds = BED_FADE_S) {
    const far = this._far;
    if (!tag || !far?.length) return;
    let n = 0;
    for (const f of far) {
      if (f.tag !== tag) { far[n++] = f; continue; }
      try {
        const t = this.ctx.currentTime;
        f.gain.gain.cancelScheduledValues(t);
        f.gain.gain.setValueAtTime(f.gain.gain.value, t);
        f.gain.gain.linearRampToValueAtTime(0, t + seconds);
        f.src.stop(t + seconds + 0.05);
      } catch {
        try { f.src.stop(); } catch { }
      }
    }
    far.length = n;
  }

  loop3d(index, pos, volume = 1, { refDistance = 1, maxDistance = 5, distanceModel = 'linear', lowpass = 0, rolloffFactor = 1 } = {}) {
    if (!this._ready()) return null;
    const buf = this._buffer(index);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const pan = this._panner(pos, { refDistance, maxDistance, distanceModel, rolloffFactor });
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    const tail = lowpass > 0 ? this._lowpass(lowpass) : null;
    if (tail) src.connect(gain).connect(pan).connect(tail).connect(this._out()); else src.connect(gain).connect(pan).connect(this._out());
    src.start();
    const release = () => releaseNodes(src, gain, pan, tail);
    return {
      move(p) { placeAudio(pan, p); },
      setVolume(v) { gain.gain.value = Math.max(0, v); },
      stop() {
        try { src.stop(); } catch { }
        release();
      },
      fadeStop(seconds = BED_FADE_S) {
        try {
          const t = src.context.currentTime;
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(gain.gain.value, t);
          gain.gain.linearRampToValueAtTime(0, t + seconds);
          src.stop(t + seconds + 0.05);
          src.onended = release;
        } catch {
          try { src.stop(); } catch { }
          release();
        }
      },
    };
  }

  listenerPosition() { const L = this._listener; return [L.x, L.y, L.z]; }

  listenerPose() {
    const L = this._listener;
    return { pos: [L.x, L.y, L.z], fwd: [L.fx, L.fy, L.fz] };
  }

  setListener(pos, forward) {
    const L = this._listener;
    [L.x, L.y, L.z] = pos; [L.fx, L.fy, L.fz] = forward;
    if (!this._ready()) return;
    const l = this.ctx.listener;
    const [x, y, z] = audioFrame(pos), [fx, fy, fz] = audioFrame(forward);
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
    const far = this._far;
    if (far?.length) {
      const now = this.ctx.currentTime;
      let n = 0;
      for (const f of far) {
        if (f.until <= now) continue;
        placeAudio(f.pan, [pos[0] + f.off[0], pos[1] + f.off[1], pos[2] + f.off[2]]);
        far[n++] = f;
      }
      far.length = n;
    }
  }

  _panner(pos, { refDistance = 1, maxDistance = 500, distanceModel = 'inverse', rolloffFactor = 1 } = {}) {
    const pan = this.ctx.createPanner();
    pan.panningModel = PANNING_MODEL;
    pan.distanceModel = distanceModel;
    pan.refDistance = refDistance;
    pan.maxDistance = maxDistance;
    pan.rolloffFactor = rolloffFactor;
    placeAudio(pan, pos);
    return pan;
  }

  setLoop3d(name, clip, pos, { volume = 1, pitch = 1, refDistance = 1, maxDistance = 500, distanceModel = 'inverse' } = {}) {
    this._loops3d ??= new Map();
    const ch = this._loops3d.get(name);
    if (clip == null) {
      if (ch) { ch.stop(); this._loops3d.delete(name); }
      return null;
    }
    if (ch) { ch.want = clip; ch.rearm?.(); ch.setVolume(volume); ch.setPitch(pitch); ch.move(pos); return ch; }
    if (!this._ready()) return null;
    if (!this._buffer(clip)) return null;
    const pan = this._panner(pos, { refDistance, maxDistance, distanceModel });
    pan.connect(this._out());
    const made = this._makeRetriggerLoop(clip, volume, pitch, pan);
    if (!made) { pan.disconnect(); return null; }
    made.move = (p) => placeAudio(pan, p);
    const stop = made.stop;
    made.stop = () => { stop(); pan.disconnect(); };
    this._loops3d.set(name, made);
    return made;
  }

  moveLoop3d(name, pos) { this._loops3d?.get(name)?.move?.(pos); }

  setBed(name, clip, { volume = 1, pitch = 1 } = {}) { return this._bed(this._beds ??= new Map(), name, clip, null, { volume, pitch }); }
  setBed3d(name, clip, pos, { volume = 1, pitch = 1, refDistance = 1, maxDistance = 500, distanceModel = 'inverse' } = {}) {
    return this._bed(this._beds3d ??= new Map(), name, clip, pos, { volume, pitch, refDistance, maxDistance, distanceModel });
  }
  _bed(beds, name, clip, pos, o) {
    const was = beds.get(name);
    if (was && was.clip === clip && clip != null) { was.setVolume(o.volume); was.setPitch(o.pitch); if (pos) was.move(pos); return was; }
    if (was) { beds.delete(name); was.fadeStop(); }
    if (clip == null || !this._ready()) return null;
    const buf = this._buffer(clip);
    if (!buf) return null;
    const ctx = this.ctx, src = ctx.createBufferSource(), gain = ctx.createGain(), fade = ctx.createGain();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = o.pitch;
    gain.gain.value = Math.max(0, o.volume);
    const t = ctx.currentTime;
    fade.gain.setValueAtTime(0, t);
    fade.gain.linearRampToValueAtTime(1, t + BED_FADE_S);
    const pan = pos ? this._panner(pos, o) : null;
    src.connect(gain).connect(fade);
    if (pan) fade.connect(pan).connect(this._out()); else fade.connect(this._out());
    src.start();
    let gone = false;
    const bed = {
      clip,
      setVolume(v) { gain.gain.value = Math.max(0, v); },
      setPitch(p) { src.playbackRate.value = p; },
      move(p) { if (pan) placeAudio(pan, p); },
      fadeStop(seconds = BED_FADE_S) {
        if (gone) return;
        gone = true;
        try {
          const now = ctx.currentTime;
          fade.gain.cancelScheduledValues(now);
          fade.gain.setValueAtTime(fade.gain.value, now);
          fade.gain.linearRampToValueAtTime(0, now + seconds);
          src.stop(now + seconds + 0.05);
          src.onended = () => { try { src.disconnect(); fade.disconnect(); pan?.disconnect(); } catch { } };
        } catch {
          try { src.stop(); } catch { }
          try { src.disconnect(); fade.disconnect(); pan?.disconnect(); } catch { }
        }
      },
    };
    beds.set(name, bed);
    return bed;
  }
}

export const audio = new AudioEngine();

// Unity's logarithmic rolloff stops attenuating at maxDistance, which no panner model does, so callers set the
// gain themselves on a panner with rolloffFactor 0.
export const logarithmicRolloff = (d, min, max) => (d <= min ? 1 : min / Math.min(d, max));
// A plain Unity AudioSource ignores SoundVolume, so its volume crosses the master bus with SoundVolume divided out.
export const plainSourceGain = (v, soundVolume) => (soundVolume > 0 ? v / soundVolume : 0);

export class QuestAudioSource {
  constructor(engine = audio, clock = defaultAudioClock) {
    this._audio = engine;
    this._clock = clock;
    this._endsAt = -Infinity;
  }

  // Busy means the last clip started has not run out on the real clock, which is the clock Unity's isPlaying uses.
  isPlaying() { return this._clock() < this._endsAt; }

  playOneShot(index, volume = 1) {
    const dur = this._audio.playOneShot(index, volume);
    if (typeof dur === 'number' && dur > 0) this._endsAt = this._clock() + dur;
    return dur;
  }

  playOneShotId(id, volume = 1) {
    const dur = this._audio.playOneShotId(id, volume);
    if (typeof dur === 'number' && dur > 0) this._endsAt = this._clock() + dur;
    return dur;
  }

  playQuestSound(id) {
    if (this.isPlaying()) return false;
    const quiet = QUIET_QUEST_SOUNDS[id] ?? null;
    if (quiet) {
      const now = this._clock();
      if (now < (this._quietUntil?.get(id) ?? -Infinity)) return false;
      (this._quietUntil ??= new Map()).set(id, now + quiet.gapS);
    }
    this.playOneShotId(id, quiet ? quiet.volume : 1);
    return true;
  }
}

// Quest sounds played softer and sparser than Daggerfall Unity, by quest sound id; inside the gap the source
// answers busy, so the quest action retries.
export const QUIET_QUEST_SOUNDS = Object.freeze({
  386: Object.freeze({ volume: 0.4, gapS: 60 }),
});

export function defaultAudioClock() {
  return (typeof performance !== 'undefined' && performance.now)
    ? performance.now() / 1000
    : Date.now() / 1000;
}
