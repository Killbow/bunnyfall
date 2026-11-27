import {
  SongPlayer, eventsInWindow, noteSeconds, songLevel, trackGain,
} from './songPlayer.js';
import { getPref, setPref } from '../ui/uiPrefs.js';

export const MIDI_OUT_PREF = 'midiOut';

// Two messages the device must take in order never share a timestamp.
export const MIDI_GAP_S = 0.001;

const clamp7 = (v) => Math.max(0, Math.min(127, Math.trunc(Number(v) || 0)));

// Values clamp to 0..127, because a data byte with bit 7 set reads as a status byte to the device.
export function midiMessage(e) {
  const ch = e?.channel;
  if (!Number.isInteger(ch) || ch < 0 || ch > 15) return null;
  switch (e.type) {
    case 'noteOn': return [0x90 | ch, clamp7(e.note), clamp7(e.velocity)];
    case 'noteOff': return [0x80 | ch, clamp7(e.note), clamp7(e.velocity)];
    case 'polyPressure': return [0xa0 | ch, clamp7(e.note), clamp7(e.pressure)];
    case 'controller': return [0xb0 | ch, clamp7(e.controller), clamp7(e.value)];
    case 'programChange': return [0xc0 | ch, clamp7(e.program)];
    case 'channelPressure': return [0xd0 | ch, clamp7(e.pressure)];
    case 'pitchBend': {
      const v = Math.max(0, Math.min(16383, Math.trunc(Number(e.value) || 0)));
      return [0xe0 | ch, v & 0x7f, v >> 7];
    }
    default: return null;
  }
}

// General MIDI's CC7 sounds as amplitude (v/127)^2, so a gain g scales CC7 by sqrt(g).
export function scaledVolume(raw, scale) {
  const g = Number.isFinite(scale) && scale > 0 ? scale : 0;
  return Math.max(0, Math.min(127, Math.round(clamp7(raw) * Math.sqrt(g))));
}

export function channelResetMessages(ch) {
  return [[0xb0 | ch, 121, 0], [0xc0 | ch, 0], [0xb0 | ch, 10, 64], [0xe0 | ch, 0, 64]];
}

export function channelQuietMessages(ch) {
  return [[0xb0 | ch, 64, 0], [0xb0 | ch, 123, 0]];
}

export function stateKey(e) {
  if (!Number.isInteger(e?.channel)) return null;
  // Channel-mode controllers 120-127 are not state: a reset sent again would undo what follows it.
  if (e.type === 'controller') return e.controller >= 120 ? null : `c${e.channel}:${e.controller}`;
  if (e.type === 'programChange' || e.type === 'pitchBend' || e.type === 'channelPressure') return `${e.type}${e.channel}`;
  return null;
}

export const PERFORMANCE_CLOCK = Object.freeze({ get currentTime() { return globalThis.performance.now() / 1000; } });

export class MidiOutSongPlayer extends SongPlayer {
  constructor(output, clock = PERFORMANCE_CLOCK) {
    super(clock, null, null);
    this.output = output;
    this._notes = [];
    this._raw7 = new Array(16).fill(127);
    this._sent7 = new Array(16).fill(-1);
    this._at7 = new Array(16).fill(-Infinity);
    this._fade = { from: 1, to: 1, t0: 0, t1: 0 };
    this._sentUntil = -Infinity;
    this._quietAt = -Infinity;
    this._refused = false;
  }

  _send(bytes, when) {
    if (!bytes) return;
    if (when > this._sentUntil) this._sentUntil = when;
    try { this.output.send(bytes, when * 1000); } catch (e) {
      if (!this._refused) { this._refused = true; console.warn('[midi-out] the device refused a message:', e?.message ?? e); }
    }
  }

  _fadeAt(t) {
    const { from, to, t0, t1 } = this._fade;
    if (t >= t1) return to;
    if (t <= t0) return from;
    return from + (to - from) * ((t - t0) / (t1 - t0));
  }

  _scale(t) { return trackGain() * songLevel(this.song) * this._fadeAt(t); }

  _volume(ch, when) {
    const at = Math.max(when, this._at7[ch]);
    const v = scaledVolume(this._raw7[ch], this._scale(at));
    this._send([0xb0 | ch, 7, v], at);
    this._sent7[ch] = v;
    this._at7[ch] = at;
  }

  _relevel(now) {
    if (!this.playing) return;
    for (let ch = 0; ch < 16; ch++) {
      const at = Math.max(now, this._at7[ch] + MIDI_GAP_S);
      if (scaledVolume(this._raw7[ch], this._scale(at)) !== this._sent7[ch]) this._volume(ch, at);
    }
  }

  // A queued note-off cannot be taken back, so releases are queued one window at a time.
  _release(until) {
    if (!this._notes.length) return;
    const keep = [];
    for (const n of this._notes) {
      if (n.off <= until) this._send([0x80 | n.channel, n.note, 0], n.off);
      else keep.push(n);
    }
    this._notes = keep;
  }

  _ensureMaster() {}
  _routePress() {}
  _resyncChannelGains() {}
  _cancelChannelGains() {}

  _origin(lead) {
    const t = Math.max(this.ctx.currentTime + lead, this._quietAt + 2 * MIDI_GAP_S);
    const at = t - MIDI_GAP_S;
    for (let ch = 0; ch < 16; ch++) {
      for (const m of channelResetMessages(ch)) this._send(m, at);
      this._raw7[ch] = 127;
      this._at7[ch] = -Infinity;
      this._volume(ch, at);
    }
    return t;
  }

  _skip(toTick) {
    super._skip(toTick);
    const last = new Map();
    for (const e of eventsInWindow(this.song.events, 0, toTick)) {
      const k = stateKey(e);
      // Each control is sent in the order of its last value, so a bank select goes before its program.
      if (k) { last.delete(k); last.set(k, e); }
    }
    const now = this.ctx.currentTime;
    for (const e of last.values()) this._control(e, now);
  }

  _voice(e, when, durationSeconds) {
    const key = clamp7(e.note);
    // A key struck while it still sounds is released at the strike: a note-off ends whichever note holds the key.
    if (this._notes.some((n) => n.channel === e.channel && n.note === key)) {
      this._notes = this._notes.filter((n) => {
        if (n.channel !== e.channel || n.note !== key) return true;
        this._send([0x80 | n.channel, n.note, 0], when);
        return false;
      });
    }
    this._send(midiMessage(e), when);
    this._notes.push({ channel: e.channel, note: clamp7(e.note), on: when, off: when + noteSeconds(durationSeconds) });
  }

  _control(e, when) {
    if (e.type === 'noteOff') return;
    if (e.type === 'controller' && e.controller === 7 && Number.isInteger(e.channel)) {
      this._raw7[e.channel] = clamp7(e.value);
      this._volume(e.channel, when);
      return;
    }
    this._send(midiMessage(e), when);
  }

  _pump() {
    super._pump();
    if (!this.playing || !this.song) return;
    this._release(this._originTime + this._cursorTick * this.song.secondsPerTick);
    this._relevel(this.ctx.currentTime);
  }

  fadeTo(level, seconds) {
    const now = this.ctx.currentTime;
    const to = Math.max(0, Number(level) || 0);
    this._fade = { from: this._fadeAt(now), to, t0: now, t1: now + (seconds > 0 ? seconds : 0) };
    this._relevel(now);
  }

  resyncGain() { this._relevel(this.ctx.currentTime); }

  stop() {
    const quietAlready = !this.playing && !this._notes.length && this._quietAt >= this._sentUntil;
    super.stop();
    if (quietAlready) return;
    const now = this.ctx.currentTime;
    const quiet = Math.max(now, this._sentUntil) + MIDI_GAP_S;
    try { this.output.clear?.(); } catch { }
    for (const n of this._notes) this._send([0x80 | n.channel, n.note, 0], Math.max(now, n.on + MIDI_GAP_S));
    this._notes = [];
    for (let ch = 0; ch < 16; ch++) {
      for (const m of channelQuietMessages(ch)) {
        this._send(m, now);
        if (quiet > now + MIDI_GAP_S) this._send(m, quiet);
      }
    }
    this._quietAt = quiet;
  }
}

let _access = null;
let _denied = null;
const _listeners = new Set();

export const midiOutSupported = (nav = globalThis.navigator) => typeof nav?.requestMIDIAccess === 'function';

export const midiOutDenied = () => _denied;

export const midiOutName = () => String(getPref(MIDI_OUT_PREF) ?? '');

export function onMidiOutChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function publish() {
  for (const fn of [..._listeners]) {
    try { fn(midiOutName()); } catch (e) { console.warn('[midi-out] a listener threw:', e?.message ?? e); }
  }
}

// Picks walk distinct names, because a pick is saved by name and two devices may share one.
export function nextMidiOut(current, outputs) {
  const names = ['', ...new Set((outputs ?? []).map((o) => o.name))];
  const at = names.indexOf(String(current ?? ''));
  if (at < 0) return names[Math.min(1, names.length - 1)];
  return names[(at + 1) % names.length];
}

export function setMidiOut(name) {
  setPref(MIDI_OUT_PREF, String(name ?? ''));
  publish();
}

export function midiAccess(nav = globalThis.navigator) {
  if (!midiOutSupported(nav)) return Promise.resolve(null);
  // No sysex: asking for it makes the browser show the player a second, stronger permission prompt.
  _access ??= nav.requestMIDIAccess({ sysex: false }).then((a) => {
    _denied = null;
    a.onstatechange = (ev) => { if (!ev?.port || ev.port.type === 'output') publish(); };
    return a;
  }, (e) => {
    _denied = e?.message ?? String(e);
    _access = null;
    return null;
  });
  return _access;
}

export async function midiOutputs(nav) {
  const a = await midiAccess(nav);
  if (!a) return [];
  return [...a.outputs.values()].filter((o) => o.state !== 'disconnected').map((o) => ({ id: o.id, name: o.name }));
}

export async function findMidiOutput(name, nav) {
  if (!name) return null;
  const a = await midiAccess(nav);
  if (!a) return null;
  for (const o of a.outputs.values()) if (o.name === name && o.state !== 'disconnected') return o;
  return null;
}

export function _resetMidiOutForTests() { _access = null; _denied = null; }
