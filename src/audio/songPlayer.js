import {
  noteToHz, fmSpec, percussionSpec, velocityGain, volumeGain,
  panPosition, bendCents, PERCUSSION_CHANNEL,
} from './gmSynth.js';
import { getFloat } from '../platform/settings.js';

// Each wake schedules a window ahead on the audio clock; the window must exceed the wake interval or notes fall
// through the gap.
export const LOOKAHEAD_SECONDS = 0.25;
export const TICK_INTERVAL_MS = 100;

// The FM bank's trim: its raw oscillators sum hot, so it plays under the effects bus.
export const MUSIC_GAIN = 0.22;

// Each mute reason holds on its own, so one ending never lifts another.
const muteReasons = new Set();
export const isMusicMuted = () => muteReasons.size > 0;
export const setMusicMuted = (v, reason = 'video') => { if (v) muteReasons.add(reason); else muteReasons.delete(reason); };

// The mute is read inside both gain accessors, so every gain writer honors it, a song started mid-video included.
export const musicGain = () => (isMusicMuted() ? 0 : MUSIC_GAIN * getFloat('Controls', 'MusicVolume', 0, 1));

// The fader carries only the fade, apart from the volume master, so a fade and a volume write never collide.
export function rampFader(ctx, fader, level, seconds) {
  if (!fader || !ctx) return;
  const g = fader.gain, now = ctx.currentTime;
  if (!(seconds > 0)) { g.cancelScheduledValues(now); g.setValueAtTime(level, now); g.value = level; return; }
  if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now);
  else { const v = g.value; g.cancelScheduledValues(now); g.setValueAtTime(v, now); }
  g.linearRampToValueAtTime(level, now + seconds);
}

// A replacement track is a mastered file, so it takes the setting alone, without the FM trim.
export const trackGain = () => (isMusicMuted() ? 0 : getFloat('Controls', 'MusicVolume', 0, 1));

export const SONG_LEVEL_MAX = 4;
export const EG_DUCK_BACK_S = 0.12;
export const songLevel = (song) => (Number.isFinite(song?.level) && song.level > 0 ? Math.min(SONG_LEVEL_MAX, song.level) : 1);

export const PRESS_OUT_MAX = 8;
export const PRESS_CEILING_MIN = -24;
export const PRESS_RANGE = Object.freeze({
  threshold: [-100, 0, -24], knee: [0, 40, 6], ratio: [1, 20, 8], attack: [0, 1, 0.003], release: [0, 1, 0.25], out: [0, PRESS_OUT_MAX, 1],
  ceiling: [PRESS_CEILING_MIN, 0, 0],
});
export const CEILING_DRIVE = 3;
export function songPress(song) {
  const p = song?.press;
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const [k, [lo, hi, dflt]] of Object.entries(PRESS_RANGE)) out[k] = Number.isFinite(p[k]) ? Math.min(hi, Math.max(lo, p[k])) : dflt;
  if (!(out.out > 0)) out.out = PRESS_RANGE.out[2];
  return out;
}
export const VOICE_RANGE = Object.freeze({
  car: [0.25, 8], mod: [0.25, 12], index: [0, 12], idxDecay: [0.01, 4], attack: [0.001, 2], decay: [0.01, 4], sustain: [0, 1], release: [0.01, 4], gain: [0, 1.5],
  unison: [1, 4], cents: [0, 40], sub: [0, 1], spread: [0, 1], vibrato: [0, 50], vibRate: [0.5, 12], noise: [0, 1],
  saw: [0, 1], cutoff: [1, 64], cutQ: [0.3, 8], air: [-30, 0], ensemble: [0, 1], ensembleRate: [0.1, 4], ensembleMs: [1, 30], idxFloor: [0.05, 1],
  arc: [0, 1], sway: [0, 1], swayRate: [0.05, 2],
});
export function heldBody(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const r of list.slice(0, 4)) {
    if (!Array.isArray(r) || r.length < 3 || !r.slice(0, 3).every(Number.isFinite)) continue;
    out.push([Math.min(12000, Math.max(40, r[0])), Math.min(24, Math.max(-24, r[1])), Math.min(12, Math.max(0.3, r[2]))]);
  }
  return out.length ? out : null;
}
export const KIT_RANGE = Object.freeze({ hz: [20, 12000], attack: [0.001, 0.2], decay: [0.01, 3], gain: [0, 1.5], drop: [0.1, 1], q: [0.2, 12], click: [0, 1], body: [0, 400] });
const held = (o, range) => {
  if (!o || typeof o !== 'object') return null;
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(range)) if (Number.isFinite(o[k])) out[k] = Math.min(hi, Math.max(lo, o[k]));
  return Object.keys(out).length ? out : null;
};
export function songVoices(song) {
  const v = song?.voices;
  if (!v || typeof v !== 'object') return null;
  const out = new Array(16).fill(null);
  for (let c = 0; c < 16; c++) {
    let s = held(v[c], VOICE_RANGE);
    const body = heldBody(v[c]?.body);
    if (body) s = { ...(s ?? {}), body };
    if (s && 'unison' in s) s.unison = Math.round(s.unison);
    out[c] = s;
  }
  return out.some(Boolean) ? out : null;
}
export function songKit(song) {
  const k = song?.kit;
  if (!k || typeof k !== 'object') return null;
  const out = new Map();
  for (const [key, o] of Object.entries(k)) { const n = Number(key), s = held(o, KIT_RANGE); if (Number.isInteger(n) && n >= 0 && n <= 127 && s) out.set(n, s); }
  return out.size ? out : null;
}
export function songTone(song) {
  const t = song?.tone;
  if (!t || typeof t !== 'object') return null;
  const shelf = (v) => (Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? [Math.min(16000, Math.max(20, v[0])), Math.min(24, Math.max(-24, v[1]))] : null);
  const out = {};
  const bands = heldBody(t.bands), low = shelf(t.low), high = shelf(t.high);
  if (bands) out.bands = bands;
  if (low) out.low = low;
  if (high) out.high = high;
  return Object.keys(out).length ? out : null;
}
export const SONG_FLOOR_HZ = 30;
export function unisonCents(n, cents) {
  if (!(n > 1) || !(cents > 0)) return [0];
  return Array.from({ length: n }, (_, i) => -cents + (2 * cents * i) / (n - 1));
}

// Slow params run at k-rate: at a-rate a biquad recomputes per sample and an oscillator takes its slow path.
const slow = (...params) => { for (const p of params) if (p && 'automationRate' in p) p.automationRate = 'k-rate'; };

export const ceilingAmplitude = (dbfs) => Math.pow(10, dbfs / 20) / MUSIC_GAIN;
let _ceilingCurve = null;
export function ceilingCurve(n = 2049) {
  if (_ceilingCurve && _ceilingCurve.length === n) return _ceilingCurve;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(CEILING_DRIVE * ((2 * i) / (n - 1) - 1));
  return (_ceilingCurve = c);
}

// Smaller than the lookahead, or the window pumped after a loop is empty and the repeat starts a beat late.
export const LOOP_LEAD_SECONDS = 0.02;

// Half-open, so a note on a window boundary is scheduled once.
export function eventsInWindow(events, fromTick, toTick) {
  let lo = 0, hi = events.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (events[mid].tick < fromTick) lo = mid + 1; else hi = mid; }
  const out = [];
  for (let i = lo; i < events.length; i++) {
    const e = events[i];
    if (e.tick >= toTick) break;
    out.push(e);
  }
  return out;
}

// Mutates the state it is given, so tick-0 setup carries across windows.
export function applyChannelEvents(state, events) {
  for (const e of events) {
    if (e.channel === null || e.channel === undefined) continue;
    const ch = state[e.channel] ?? (state[e.channel] = { program: 0, volume: 1, pan: 0, bend: 0 });
    if (e.type === 'programChange') ch.program = e.program;
    else if (e.type === 'pitchBend') ch.bend = bendCents(e.value);
    else if (e.type === 'controller') {
      if (e.controller === 7) ch.volume = volumeGain(e.value);
      else if (e.controller === 10) ch.pan = panPosition(e.value);
    }
  }
  return state;
}

// The pedal is down at 64 and above. A pedal still down at the end closes at endTick, which callers keep finite:
// a non-finite time throws out of the pump.
export function sustainIntervals(events, endTick = Infinity) {
  const byChannel = new Map();
  const open = new Map();
  for (const e of events ?? []) {
    if (e.type !== 'controller' || e.controller !== 64 || e.channel == null) continue;
    const down = e.value >= 64;
    if (down) {
      if (!open.has(e.channel)) open.set(e.channel, e.tick);
    } else if (open.has(e.channel)) {
      if (!byChannel.has(e.channel)) byChannel.set(e.channel, []);
      byChannel.get(e.channel).push([open.get(e.channel), e.tick]);
      open.delete(e.channel);
    }
  }
  for (const [ch, tick] of open) {
    if (!byChannel.has(ch)) byChannel.set(ch, []);
    byChannel.get(ch).push([tick, Math.max(tick, endTick)]);
  }
  return byChannel;
}

// The pedal never shortens a note: one that ends outside every interval keeps its own length.
export function sustainedDuration(startTick, durationTicks, intervals) {
  const end = startTick + durationTicks;
  for (const [down, up] of intervals ?? []) {
    if (end >= down && end < up) return up - startTick;
  }
  return durationTicks;
}

// Every time handed to the graph must be finite, so a note with no usable length gets 0.2 s.
export function noteSeconds(durationSeconds) {
  const rawDur = durationSeconds || 0.2;
  return Math.max(0.05, Number.isFinite(rawDur) ? rawDur : 0.2);
}

// CC7 starts at full, so a song that never sends a volume is not silent.
export function freshChannelState() {
  const s = {};
  for (let c = 0; c < 16; c++) s[c] = { program: 0, volume: 1, pan: 0, bend: 0 };
  return s;
}

export class SongPlayer {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} [destination]
   */
  constructor(ctx, destination = null, reverbSend = null) {
    this.ctx = ctx;
    this._reverbSend = reverbSend;
    this.song = null;
    this.playing = false;
    this.loop = true;
    this._timer = null;
    this._voices = [];
    this._master = null;
    this._fader = null;
    this._level = null;
    this._press = null;
    this._tone = null;
    this._levelTo = null;
    this._destination = destination;
  }

  _ensureMaster() {
    if (this._master || !this.ctx) return;
    this._master = this.ctx.createGain();
    this._master.gain.value = musicGain();
    this._master.connect(this._destination ?? this.ctx.destination);
    if (this._reverbSend) this._master.connect(this._reverbSend);
    this._fader = this.ctx.createGain();
    this._fader.gain.value = 1;
    this._fader.connect(this._master);
    this._level = this.ctx.createGain();
    this._level.gain.value = 1;
    this._level.connect(this._fader);
    this._levelTo = this._fader;
  }

  _routeTone(tone) {
    if (!this._fader || !this._master || (!tone && !this._tone)) return;
    for (const f of this._tone ?? []) { try { f.disconnect(); } catch { } }
    this._tone = null;
    this._fader.disconnect();
    if (!tone || typeof this.ctx.createBiquadFilter !== 'function') { this._fader.connect(this._master); return; }
    const chain = [];
    const add = (type, hz, db, q) => { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.gain.value = db; if (q) f.Q.value = q; chain.push(f); };
    if (tone.low) add('lowshelf', tone.low[0], tone.low[1]);
    for (const [hz, db, q] of tone.bands ?? []) add('peaking', hz, db, q);
    if (tone.high) add('highshelf', tone.high[0], tone.high[1]);
    let node = this._fader;
    for (const f of chain) { node.connect(f); node = f; }
    node.connect(this._master);
    this._tone = chain;
  }

  _routePress(press) {
    if (!this._level) return;
    let to = this._fader;
    if (press && typeof this.ctx.createDynamicsCompressor === 'function' && typeof this.ctx.createWaveShaper === 'function') {
      if (!this._press) {
        const comp = this.ctx.createDynamicsCompressor(), out = this.ctx.createGain(), shaper = this.ctx.createWaveShaper(), top = this.ctx.createGain();
        shaper.curve = ceilingCurve();
        shaper.oversample = '4x';
        comp.connect(out);
        out.connect(shaper);
        shaper.connect(top);
        top.connect(this._fader);
        this._press = { comp, out, shaper, top };
      }
      const { comp, out, shaper, top } = this._press;
      for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) comp[k].value = press[k];
      const ceil = ceilingAmplitude(press.ceiling);
      out.gain.value = press.out / (ceil * CEILING_DRIVE);
      top.gain.value = ceil;
      to = comp;
    }
    // A voiced song is high-passed before its press: a 1:1 FM voice's lower sideband lands at 0 Hz.
    const hp = this._songVoices && typeof this.ctx.createBiquadFilter === 'function' ? (this._floor ??= this._makeFloor()) : null;
    if (hp) {
      if (this._floorTo !== to) { try { hp.disconnect(); } catch { } hp.connect(to); this._floorTo = to; }
      to = hp;
    }
    if (this._levelTo === to) return;
    try { this._level.disconnect(); } catch { }
    this._level.connect(to);
    this._levelTo = to;
  }

  _makeFloor() {
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = SONG_FLOOR_HZ; f.Q.value = Math.SQRT1_2;
    return f;
  }

  // A duck moves only the song's level node, never the fader or the volume, so a duck and a fade never fight.
  duck(db, seconds) {
    const g = this._level?.gain;
    if (!g || !this.ctx || !(db > 0)) return;
    const now = this.ctx.currentTime, base = songLevel(this.song), low = base * 10 ** (-db / 20), hold = Math.max(0.02, seconds);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(low, now + 0.02);
    g.setValueAtTime(low, now + hold);
    g.linearRampToValueAtTime(base, now + hold + EG_DUCK_BACK_S);
  }

  fadeTo(level, seconds) { rampFader(this.ctx, this._fader, level, seconds); }

  resyncGain() {
    if (!this._master) return;
    const now = this.ctx.currentTime;
    this._master.gain.cancelScheduledValues(now);
    this._master.gain.setValueAtTime(this._master.gain.value, now);
    this._master.gain.linearRampToValueAtTime(musicGain(), now + 0.05);
  }

  play(song) {
    if (!this.ctx || !song || !song.events?.length) return false;
    if (this.playing && this.song === song) return true;
    this.stop();
    this._ensureMaster();
    if (this._level) this._level.gain.value = songLevel(song);
    this._songVoices = songVoices(song); this._songKit = songKit(song);
    if (this._songVoices || this._voicedChains) this._dropChannelChains();
    this._voicedChains = !!this._songVoices;
    this._routePress(songPress(song));
    this._routeTone(songTone(song));
    this.song = song;
    this._sustain = sustainIntervals(song.events,
      Number.isFinite(song.durationTicks) ? song.durationTicks : Infinity);
    this.playing = true;
    this._state = freshChannelState();
    this._resyncChannelGains();
    this._cursorTick = 0;
    this._originTime = this._origin(0.06);
    this._pump();
    this._timer = setInterval(() => this._pump(), TICK_INTERVAL_MS);
    return true;
  }

  stop() {
    this.playing = false;
    if (this._timer !== null) { clearInterval(this._timer); this._timer = null; }
    this._cancelChannelGains();
    for (const v of this._voices) {
      try { v.stop(); } catch { }
    }
    this._voices = [];
    this.song = null;
  }

  _pump() {
    if (!this.playing || !this.song) return;
    const { secondsPerTick, durationTicks, events } = this.song;
    const aheadTicks = LOOKAHEAD_SECONDS / secondsPerTick;
    const nowTick = (this.ctx.currentTime - this._originTime) / secondsPerTick;
    const seamless = !!this.song.seamless && this.loop && durationTicks > 0;
    const toTick = Math.min(nowTick + aheadTicks, seamless ? durationTicks : durationTicks + 1);

    // A stalled tab skips the gap: notes scheduled in the past would all fire at once.
    if (nowTick - this._cursorTick > aheadTicks) {
      this._cursorTick = nowTick;
      this._skip(nowTick);
    }

    if (this._cursorTick < toTick) {
      const window = eventsInWindow(events, this._cursorTick, toTick);
      // Controls and notes run in stream order and controls are scheduled too, so a late control never reaches back
      // to earlier notes or misses one already sounding.
      for (const e of window) {
        applyChannelEvents(this._state, [e]);
        if (e.type !== 'noteOn') this._control(e, this._originTime + e.tick * secondsPerTick);
        if (e.type !== 'noteOn' || !e.velocity) continue;
        this._voice(e, this._originTime + e.tick * secondsPerTick,
          sustainedDuration(e.tick, e.duration || 0, this._sustain?.get(e.channel)) * secondsPerTick);
      }
      this._cursorTick = toTick;
    }

    // A song marked to loop on its bar line starts its next pass on the tick where this one ends.
    if (seamless && this._cursorTick >= durationTicks) {
      this._originTime += durationTicks * secondsPerTick;
      this._cursorTick = 0;
      this._state = freshChannelState();
      this._pump();
      return;
    }
    // The loop pumps at once, so its seam is scheduled ahead like any other window.
    if (nowTick > durationTicks + 1 / secondsPerTick) {
      if (!this.loop) { this.stop(); return; }
      this._state = freshChannelState();
      this._resyncChannelGains();
      this._cursorTick = 0;
      this._originTime = this._origin(LOOP_LEAD_SECONDS);
      this._pump();
      return;
    }
    if (this._voices.length > 512) {
      this._voices = this._voices.filter((v) => v.endsAt > this.ctx.currentTime);
    }
  }

  _origin(lead) {
    return this.ctx.currentTime + lead;
  }

  _skip(toTick) {
    applyChannelEvents(this._state, eventsInWindow(this.song.events, 0, toTick)
      .filter((e) => e.type !== 'noteOn'));
  }

  _voice(e, when, durationSeconds) {
    const ctx = this.ctx;
    const ch = this._state[e.channel] ?? { program: 0, volume: 1, pan: 0, bend: 0 };
    const dur = noteSeconds(durationSeconds);
    const amp = velocityGain(e.velocity);
    if (amp <= 0) return;

    const gain = ctx.createGain();
    let node;
    let spec;

    if (e.channel === PERCUSSION_CHANNEL) {
      const own = this._songKit?.get(e.note) ?? null;
      spec = own ? { ...percussionSpec(e.note), ...own } : percussionSpec(e.note);
      if (spec.kind === 'noise') {
        node = ctx.createBufferSource();
        node.buffer = this._noiseBuffer();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = spec.hz;
        bp.Q.value = spec.q ?? 1.2;
        node.connect(bp);
        bp.connect(gain);
      } else {
        node = ctx.createOscillator();
        node.type = 'sine';
        node.frequency.setValueAtTime(spec.hz, when);
        // Some engines warn on an exponential ramp to an equal value, so a held pitch schedules nothing more.
        if (spec.drop !== 1) {
          node.frequency.exponentialRampToValueAtTime(spec.hz * spec.drop, when + spec.decay);
        }
        node.connect(gain);
      }
      const peak = amp * spec.gain;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(peak, when + spec.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + spec.attack + spec.decay);
      this._connect(gain, ch.pan, e.channel);
      node.start(when);
      node.stop(when + spec.attack + spec.decay + 0.02);
      const extra = own ? this._drumLayers(spec, when, peak, ch.pan, e.channel) : null;
      this._voices.push({ stop: () => { node.stop(); extra?.forEach((x) => x.stop()); }, endsAt: when + spec.attack + spec.decay });
      return;
    }

    const own = this._songVoices?.[e.channel] ?? null;
    spec = own ? { ...fmSpec(ch.program), ...own } : fmSpec(ch.program);
    const hz = noteToHz(e.note);
    const t0 = when;
    const tA = t0 + spec.attack;
    const tD = tA + spec.decay;
    const tOff = Math.max(tD, t0 + dur);
    const end = tOff + spec.release;

    const offs = unisonCents(own?.unison ?? 1, own?.cents ?? 0), oscs = [], detunes = [], links = [];
    const peak = (amp * spec.gain) / Math.sqrt(offs.length);
    const sustain = Math.max(0.0001, peak * spec.sustain);
    const sides = own?.spread > 0 && offs.length > 1 ? [gain, ctx.createGain()] : [gain];
    const bowed = own?.saw > 0, into = bowed ? sides.map((side) => this._bow(spec, hz, e.velocity, side, t0, tA, tD)) : sides;
    for (let u = 0; u < offs.length; u++) {
      const at = t0 + (u * 0.29) / hz;
      const carrier = ctx.createOscillator();
      carrier.type = bowed ? 'sawtooth' : 'sine';
      if (bowed) slow(carrier.frequency, carrier.detune);
      carrier.frequency.value = hz * spec.car;
      if (ch.bend || offs[u]) carrier.detune.value = ch.bend + offs[u];

      let mod = null;
      if (!bowed) {
        mod = ctx.createOscillator();
        mod.type = 'sine';
        mod.frequency.value = hz * spec.mod;
        if (ch.bend || offs[u]) mod.detune.value = ch.bend + offs[u];

        const modGain = ctx.createGain();
        // The modulator drives the carrier's frequency in Hz, so index x hz is a depth of index carrier multiples.
        const depth = Math.max(1, spec.index * hz);
        modGain.gain.setValueAtTime(depth, t0);
        modGain.gain.exponentialRampToValueAtTime(
          Math.max(1, depth * (spec.idxFloor ?? 0.12)), t0 + Math.max(0.02, spec.idxDecay));
        mod.connect(modGain);
        modGain.connect(carrier.frequency);
        mod.start(at);
        oscs.push(mod);
      }
      let out = into[u % into.length];
      if (own?.sway > 0) { const g = ctx.createGain(); g.connect(out); out = g; const sway = this._sway(own, e.channel, u, offs.length); sway.connect(g.gain); links.push([sway, g.gain]); }
      carrier.connect(out);
      carrier.start(at);
      oscs.push(carrier); detunes.push(carrier.detune, mod ? mod.detune : carrier.detune);
      if (own?.vibrato > 0) links.push(...this._vibrato(carrier, mod, own, e.channel, u, offs.length, t0, tA));
    }
    if (own?.noise > 0) oscs.push(this._breath(hz, own.noise, into, t0, tA));
    const subN = own?.sub > 0 ? ctx.createOscillator() : null;
    if (subN) {
      const subG = ctx.createGain();
      subN.type = 'sine';
      subN.frequency.value = (hz * spec.car) / 2;
      if (ch.bend) subN.detune.value = ch.bend;
      subG.gain.value = (own.sub * Math.sqrt(offs.length)) / sides.length;
      subN.connect(subG);
      for (const g of sides) subG.connect(g);
      subN.start(t0);
      oscs.push(subN); detunes.push(subN.detune);
    }

    const crest = t0 + 0.55 * (tOff - t0);
    const arc = own?.arc > 0 && tOff - tD >= 0.25 && crest > tD + 0.05 ? own.arc : 0;
    for (const g of sides) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), tA);
      g.gain.exponentialRampToValueAtTime(arc ? Math.max(0.0001, sustain * (1 - 0.4 * arc)) : sustain, tD);
      if (arc) { g.gain.exponentialRampToValueAtTime(sustain, crest); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain * (1 - 0.6 * arc)), tOff); }
      else g.gain.setValueAtTime(sustain, tOff);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
    }

    const outs = sides.length > 1
      ? [this._connect(sides[0], Math.max(-1, (ch.pan ?? 0) - own.spread), e.channel), this._connect(sides[1], Math.min(1, (ch.pan ?? 0) + own.spread), e.channel)]
      : [this._connect(gain, ch.pan, e.channel)];
    for (const o of oscs) o.stop(end + 0.02);
    // Chromium keeps a chain alive while a node has two or more inputs, so a finished note disconnects its outputs.
    oscs[0].onended = () => {
      for (const n of outs) { try { n.disconnect(); } catch { } }
      for (const [from, to] of links) { try { from.disconnect(to); } catch { } }
    };
    this._voices.push({
      stop: () => { for (const o of oscs) o.stop(); }, endsAt: end,
      channel: e.channel, detunes, offs: offs.length > 1 ? [...offs.flatMap((c) => [c, c]), ...(subN ? [0] : [])] : null,
    });
  }

  _vibrato(carrier, mod, own, channel, u, n, t0, tA) {
    const lfo = this._channelLfo(channel, `vib${u}`, (own.vibRate ?? 5.5) * (1 + 0.06 * (u - (n - 1) / 2)));
    const span = Math.pow(2, own.vibrato / 1200) - 1, links = [];
    for (const osc of mod ? [carrier, mod] : [carrier]) {
      const depth = this.ctx.createGain();
      depth.gain.setValueAtTime(0, t0);
      depth.gain.linearRampToValueAtTime(osc.frequency.value * span, tA + 0.25);
      lfo.connect(depth);
      depth.connect(osc.frequency);
      links.push([lfo, depth]);
    }
    return links;
  }

  _sway(own, channel, u, n) {
    return this._channelLfo(channel, `sway${u}`, (own.swayRate ?? 0.3) * (1 + 0.21 * (u - (n - 1) / 2)), 0.3 * own.sway);
  }

  // One sine per channel and key, shared by every note, so a dense passage does not start hundreds of oscillators.
  _channelLfo(channel, key, hz, scale = 1) {
    const bank = ((this._chLfos ??= {})[channel] ??= {});
    if (!bank[key]) {
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = hz;
      let out = lfo;
      if (scale !== 1) { out = this.ctx.createGain(); out.gain.value = scale; lfo.connect(out); }
      lfo.start(this.ctx.currentTime);
      bank[key] = { lfo, out };
    }
    return bank[key].out;
  }

  _breath(hz, share, into, t0, tA) {
    const ctx = this.ctx, n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this._noiseBuffer(); n.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = Math.min(5000, Math.max(600, hz * 2.5)); bp.Q.value = 0.6;
    g.gain.setValueAtTime(share, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, share / 16), tA + 0.3);
    n.connect(bp); bp.connect(g);
    for (const node of into) g.connect(node);
    n.start(t0);
    return n;
  }

  _bow(spec, hz, velocity, side, t0, tA, tD) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter();
    const fc = Math.min(0.45 * ctx.sampleRate, hz * (spec.cutoff ?? 8) * (0.7 + 0.3 * Math.min(1, velocity / 127)));
    lp.type = 'lowpass'; lp.Q.value = spec.cutQ ?? 0.8;
    slow(lp.frequency, lp.Q, lp.gain, lp.detune);
    lp.frequency.setValueAtTime(fc * 0.5, t0);
    lp.frequency.linearRampToValueAtTime(fc, tA + 0.08);
    lp.frequency.exponentialRampToValueAtTime(Math.max(40, fc * 0.85), Math.max(tA + 0.09, tD));
    lp.connect(side);
    return lp;
  }

  _drumLayers(spec, when, peak, pan, channel) {
    const ctx = this.ctx, out = [];
    if (spec.click > 0) {
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this._noiseBuffer();
      bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.8;
      g.gain.setValueAtTime(peak * spec.click, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.015);
      n.connect(bp); bp.connect(g);
      this._connect(g, pan, channel);
      n.start(when); n.stop(when + 0.03);
      out.push(n);
    }
    if (spec.body > 0) {
      const o = ctx.createOscillator(), g = ctx.createGain(), len = Math.max(0.03, spec.decay * 0.6);
      o.type = 'sine';
      o.frequency.setValueAtTime(spec.body, when);
      o.frequency.exponentialRampToValueAtTime(spec.body * 0.66, when + len);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(peak * 0.7, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when + len);
      o.connect(g);
      this._connect(g, pan, channel);
      o.start(when); o.stop(when + len + 0.02);
      out.push(o);
    }
    return out;
  }

  // Channel gain nodes outlive the channel state, so a new song or pass cancels their queued CC7 values first.
  _resyncChannelGains() {
    if (!this._chGains) return;
    for (const [ch, g] of Object.entries(this._chGains)) {
      const now = this.ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(this._state[ch]?.volume ?? 1, now);
    }
  }

  _cancelChannelGains() {
    if (!this._chGains || !this.ctx) return;
    const now = this.ctx.currentTime;
    for (const g of Object.values(this._chGains)) g.gain.cancelScheduledValues(now);
  }

  _channelGain(channel) {
    this._chGains ??= {};
    let g = this._chGains[channel];
    if (!g) {
      g = this.ctx.createGain();
      g.gain.value = this._state[channel]?.volume ?? 1;
      const to = this._level ?? this._fader ?? this._master;
      const own = this._songVoices?.[channel];
      (own && (own.body || own.air !== undefined || own.ensemble > 0) ? this._insert(g, own, channel) : g).connect(to);
      this._chGains[channel] = g;
    }
    return g;
  }

  _insert(g, own, channel) {
    const ctx = this.ctx, lfos = [];
    let node = g;
    for (const [hz, db, q] of own.body ?? []) {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking'; f.frequency.value = hz; f.gain.value = db; f.Q.value = q;
      node.connect(f); node = f;
    }
    if (own.air !== undefined) {
      const f = ctx.createBiquadFilter();
      f.type = 'highshelf'; f.frequency.value = 5000; f.gain.value = own.air;
      node.connect(f); node = f;
    }
    if (own.ensemble > 0 && typeof ctx.createDelay === 'function') {
      const out = ctx.createGain(), dry = ctx.createGain(), ms = (own.ensembleMs ?? 12) / 1000, rate = own.ensembleRate ?? 0.7;
      dry.gain.value = 1 - 0.35 * own.ensemble;
      node.connect(dry); dry.connect(out);
      for (const [len, speed] of [[1, 1], [1.37, 0.79], [1.83, 1.31]]) {
        const d = ctx.createDelay(0.2), wet = ctx.createGain(), lfo = ctx.createOscillator(), sweep = ctx.createGain();
        d.delayTime.value = ms * len; wet.gain.value = 0.28 * own.ensemble;
        lfo.type = 'sine'; lfo.frequency.value = rate * speed; sweep.gain.value = ms * len * 0.2;
        lfo.connect(sweep); sweep.connect(d.delayTime);
        node.connect(d); d.connect(wet); wet.connect(out);
        lfo.start(ctx.currentTime); lfos.push(lfo);
      }
      node = out;
    }
    (this._chInserts ??= {})[channel] = { lfos, last: node };
    return node;
  }

  _dropChannelChains() {
    for (const g of Object.values(this._chGains ?? {})) { try { g.disconnect(); } catch { } }
    for (const { lfos, last } of Object.values(this._chInserts ?? {})) {
      try { last.disconnect(); } catch { }
      for (const o of lfos) { try { o.stop(this.ctx.currentTime); } catch { } }
    }
    for (const bank of Object.values(this._chLfos ?? {})) {
      for (const { lfo, out } of Object.values(bank)) { try { lfo.stop(this.ctx.currentTime); out.disconnect(); } catch { } }
    }
    this._chGains = null; this._chInserts = null; this._chLfos = null;
  }

  _connect(gain, pan, channel = 0) {
    const dest = this._channelGain(channel);
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(p);
      p.connect(dest);
      return p;
    }
    gain.connect(dest);
    return gain;
  }

  _control(e, when) {
    if (e.type === 'pitchBend') {
      const cents = bendCents(e.value);
      for (const v of this._voices) {
        if (v.channel !== e.channel || v.endsAt <= when) continue;
        v.detunes.forEach((d, i) => {
          try { d.setValueAtTime(cents + (v.offs?.[i] ?? 0), when); } catch { }
        });
      }
      return;
    }
    if (e.type === 'controller' && e.controller === 7) {
      const g = this._channelGain(e.channel);
      try { g.gain.setValueAtTime(volumeGain(e.value), when); } catch { }
    }
  }

  _noiseBuffer() {
    if (this._noise) return this._noise;
    const n = Math.floor(this.ctx.sampleRate);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }
}

export class AudioSongPlayer {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} [destination]
   */
  constructor(ctx, destination = null, reverbSend = null) {
    this.ctx = ctx;
    this._reverbSend = reverbSend;
    this.playing = false;
    this.loop = true;
    this._source = null;
    this._master = null;
    this._fader = null;
    this._destination = destination;
  }

  _ensureMaster() {
    if (this._master || !this.ctx) return;
    this._master = this.ctx.createGain();
    this._master.gain.value = trackGain();
    this._master.connect(this._destination ?? this.ctx.destination);
    if (this._reverbSend) this._master.connect(this._reverbSend);
    this._fader = this.ctx.createGain();
    this._fader.gain.value = 1;
    this._fader.connect(this._master);
  }

  fadeTo(level, seconds) { rampFader(this.ctx, this._fader, level, seconds); }

  resyncGain() {
    if (!this._master) return;
    const now = this.ctx.currentTime;
    this._master.gain.cancelScheduledValues(now);
    this._master.gain.setValueAtTime(this._master.gain.value, now);
    this._master.gain.linearRampToValueAtTime(trackGain(), now + 0.05);
  }

  play(buffer) {
    if (!this.ctx || !buffer) return false;
    this.stop();
    this._ensureMaster();
    this._master.gain.value = trackGain();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = this.loop;
    src.connect(this._fader ?? this._master);
    // A track that does not loop must clear the flag, or the director never reads it as ended.
    src.onended = () => { if (this._source === src) { this.playing = false; this._source = null; } };
    src.start();
    this._source = src;
    this.playing = true;
    return true;
  }

  stop() {
    this.playing = false;
    const src = this._source;
    this._source = null;
    if (src) {
      src.onended = null;
      try { src.stop(); } catch { }
    }
  }
}
