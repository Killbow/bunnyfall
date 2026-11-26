import { audio, decodableCopy } from './audio.js';
import { MidiBsaFile } from '../formats/hmiFile.js';
import { selectSong } from './songManager.js';
import { SongPlayer, AudioSongPlayer, setMusicMuted, isMusicMuted } from './songPlayer.js';
import { hasReplacement, replacementBytes } from './musicReplacement.js';
import { onSettingChange } from '../platform/settings.js';
import { MidiOutSongPlayer, midiOutName, findMidiOutput, onMidiOutChange } from './midiOut.js';

export const MUSIC_FADE_OUT_S = 1.5;
export const MUSIC_FADE_IN_S = 1.0;

export class MusicService {
  constructor() {
    this.archive = null;
    this.player = null;
    this._audio = null;
    this.enabled = false;
    // Null, not false: ensure latches with ??=, which assigns only over null or undefined.
    this._booted = null;
    this._current = null;
    this._switch = null;
    this._made = new Map();
    this._later = (fn, ms) => setTimeout(fn, ms);
    this._cancelLater = (id) => clearTimeout(id);
    this._unsubscribe = onSettingChange((section, key) => {
      if (section === 'Controls' && key === 'MusicVolume') this.resyncGain();
    });
    this._midiOut = null;
    this._midiAsk = 0;
    this._unsubscribeMidi = onMidiOutChange(() => this.adoptMidiOut());
  }

  async adoptMidiOut() {
    const ask = ++this._midiAsk;
    let output = null;
    try { output = await findMidiOutput(midiOutName()); } catch (e) { console.warn('[music] MIDI out unavailable:', e?.message ?? e); }
    if (ask !== this._midiAsk || output === this._midiOut) return;
    this._midiOut = output;
    const again = this.player?.playing && !this._switch ? this._current : null;
    this.player?.stop();
    this.player = null;
    if (again) this._playBuiltIn(again);
    else if (output && this._pending && this.playSong(this._pending)) this._pending = null;
  }

  get midiOut() { return this._midiOut; }

  duck(db, seconds) { this.player?.duck?.(db, seconds); }

  resyncGain() {
    this.player?.resyncGain?.();
    this._audio?.resyncGain?.();
  }

  // Muting only drops the gain, so the song keeps advancing and resumes mid-song when the video ends.
  setMuted(v, reason = 'video') {
    setMusicMuted(v, reason);
    this.resyncGain();
  }

  get muted() { return isMusicMuted(); }

  ensure(fetchBytes) {
    // The latch holds the boot promise, so every caller waits for the same load.
    return (this._booted ??= this._boot(fetchBytes));
  }

  async _boot(fetchBytes) {
    try {
      const bsa = new MidiBsaFile();
      bsa.load(await fetchBytes('MIDI.BSA'));
      this.archive = bsa;
      this.enabled = true;
    } catch (e) {
      console.warn('[music] MIDI.BSA unavailable - music disabled:', e?.message ?? e);
      this.enabled = false;
      this.bootError = e?.message ?? String(e);
    }
    if (midiOutName()) this.adoptMidiOut();
    if (typeof window !== 'undefined') this.attachGestureStart();
  }

  registerSong(name, song) {
    if (typeof name !== 'string' || !name || !Array.isArray(song?.events) || !(song.secondsPerTick > 0)) return false;
    this._made.set(name, song);
    return true;
  }

  attachGestureStart(target = window) {
    if (this._gestureHooked) return;
    this._gestureHooked = true;
    const start = () => {
      if (!this._pending) return;
      const tryStart = () => {
        if (!this._pending) return;
        if (this.playSong(this._pending)) this._pending = null;
      };
      // The audio engine resumes its context on these events and may not have yet, so a miss retries next frame.
      tryStart();
      if (this._pending && typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(tryStart);
      }
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      target.addEventListener(ev, start, { passive: true });
    }
  }

  _ensurePlayer(made = false) {
    if (!this.enabled && !made) return null;
    if (this.player) return this.player;
    if (this._midiOut) return (this.player = new MidiOutSongPlayer(this._midiOut));
    if (!audio.ctx) return null;
    this.player = new SongPlayer(audio.ctx, audio.listenerBus?.() ?? null, audio.reverbSend?.() ?? null);
    return this.player;
  }

  playSong(name) {
    const player = this._ensurePlayer(this._made.has(name));
    // With no context yet the request is kept for the first gesture, not dropped.
    if (!player) {
      this._pending = name;
      return false;
    }
    if (this._switch) {
      if (name === this._switch.from) { this._cancelSwitch(); this._current = name; this._fadeSounding(1, MUSIC_FADE_IN_S); return true; }
      this._switch.to = name;
      this._current = name;
      return true;
    }
    if (this._current === name && this.playing) return true;
    if (this.playing && this._current !== null) { this._beginSwitch(name); return true; }
    return this._start(name);
  }

  _start(name) {
    if (hasReplacement(name)) {
      this._current = name;
      this._startReplacement(name);
      return true;
    }
    return this._playBuiltIn(name);
  }

  _beginSwitch(name) {
    const sw = { from: this._current, to: name, timer: null };
    this._current = name;
    this._switch = sw;
    this._fadeSounding(0, MUSIC_FADE_OUT_S);
    sw.timer = this._later(() => {
      if (this._switch !== sw) return;
      this._switch = null;
      this.player?.stop();
      this._audio?.stop();
      if (!this._start(sw.to) && this._current === sw.to) this._current = null;
    }, MUSIC_FADE_OUT_S * 1000);
  }

  fadeOut(seconds = MUSIC_FADE_OUT_S) {
    this._pending = null;
    if (this._switch) { this._switch.to = null; this._current = null; return; }
    if (!this.playing || this._current === null) { this.stop(); return; }
    const sw = { from: this._current, to: null, timer: null };
    this._current = null;
    this._switch = sw;
    this._fadeSounding(0, seconds);
    sw.timer = this._later(() => {
      if (this._switch !== sw) return;
      this._switch = null;
      this.player?.stop();
      this._audio?.stop();
      if (sw.to && !this._start(sw.to) && this._current === sw.to) this._current = null;
    }, seconds * 1000);
  }

  _cancelSwitch() {
    if (!this._switch) return;
    this._cancelLater(this._switch.timer);
    this._switch = null;
  }

  _fadeSounding(level, seconds) {
    if (this.player?.playing) this.player.fadeTo?.(level, seconds);
    if (this._audio?.playing) this._audio.fadeTo?.(level, seconds);
  }

  _playBuiltIn(name) {
    const player = this._ensurePlayer(this._made.has(name));
    if (!player) return false;
    this._audio?.stop();
    let song = this._made.get(name) ?? null;
    if (!song) {
      if (!this.archive) return false;
      const index = this.archive.getSongIndex(name);
      if (index === null || index === undefined || index < 0) {
        console.warn(`[music] no song named ${name} in MIDI.BSA`);
        return false;
      }
      try {
        song = this.archive.getSong(index);
      } catch (e) {
        console.warn(`[music] ${name} would not decode:`, e?.message ?? e);
        return false;
      }
    }
    this._current = name;
    const fresh = !(player.playing && player.song === song);
    // The fader drops before play as well: the MIDI player queues its first window inside play().
    if (fresh) player.fadeTo?.(0, 0);
    const ok = player.play(song);
    if (ok && fresh) { player.fadeTo?.(0, 0); player.fadeTo?.(1, MUSIC_FADE_IN_S); }
    return ok;
  }

  _ensureAudioPlayer() {
    if (this._audio) return this._audio;
    if (!audio.ctx) return null;
    this._audio = new AudioSongPlayer(audio.ctx, null, audio.reverbSend?.() ?? null);
    return this._audio;
  }

  async _startReplacement(name) {
    const player = this._ensureAudioPlayer();
    if (!player) return;
    this.player?.stop();
    // The flag goes up before the await, or the director reads the decode gap as a finished song and asks again.
    player.playing = true;
    let buffer = null;
    try {
      const bytes = await replacementBytes(name);
      if (this._current !== name) return;
      if (bytes) buffer = await audio.ctx.decodeAudioData(decodableCopy(bytes));
    } catch (e) {
      console.warn(`[music] replacement for ${name} would not decode:`, e?.message ?? e);
    }
    if (this._current !== name) return;
    if (!buffer) { player.playing = false; this._playBuiltIn(name); return; }
    if (player.play(buffer)) { player.fadeTo?.(0, 0); player.fadeTo?.(1, MUSIC_FADE_IN_S); }
  }

  playFrom(playlist, opts = {}) {
    const picked = selectSong(playlist, opts);
    if (!picked) return false;
    return this.playSong(picked.name);
  }

  get playing() { return Boolean(this.player?.playing || this._audio?.playing); }

  stop() {
    this._current = null;
    // The pending request is cleared too, or the next gesture restarts the song this stop ended.
    this._pending = null;
    this.player?.stop();
    this._audio?.stop();
    this._cancelSwitch();
  }

  get current() { return this._current; }
}

export const music = new MusicService();
