// MIDI.BSA holds HMI songs, not XMI, and DFU has no reader for it, so this reader follows the retail bytes. A
// note-on carries a VLQ duration and the data holds no note-offs. Tempo comes only from the song header, and
// anything outside the decoded vocabulary throws.

import { BsaFile, DIRECTORY_TYPES } from './bsaFile.js';

export const SONG_SIGNATURE = 'HMI-MIDISONG061595';
export const TRACK_SIGNATURE = 'HMI-MIDITRACK';

const SONG_RESOLUTION = 0xd2;
const SONG_TEMPO_BPM = 0xd4;

// HMI runs 60 ticks per quarter note at the header BPM. The resolution field at 0x0D2 (480 in retail songs) is not
// the time base.
export const HMI_TICKS_PER_QUARTER = 60;

// A larger delta is an authoring artifact, not time: the event lands on the latest tick so far, as foo_midi does.
// SUNNYDAY.HMI track 5 has one.
export const HMI_MAX_DELTA = 0xffff;
const SONG_TRACK_COUNT = 0xe4;
const SONG_TRACK_TABLE = 0xe8;
const SONG_TRAILER_SIZE = 16;

const TRACK_EVENT_COUNT = 0x61;
const TRACK_DATA_OFFSET = 0x63;
const TRACK_CHANNEL = 0x79;

const PROLOGUE_RECORD_SIZE = 6;

// Bytes after the 0xFE status, counting the subtype byte. The 0x12 and 0x13 sizes are assumed, since only
// TAVERN.HMI uses them, once each.
const HMI_FIXED_SIZES = Object.freeze({ 0x12: 3, 0x13: 3, 0x14: 3, 0x15: 7 });
const HMI_CHANNEL_SETUP = 0x10;

const META_END_OF_TRACK = 0x2f;

// At equal ticks note-offs sort first, so a retriggered note is not cut short.
const RANK_NOTE_OFF = 0;
const RANK_EVENT = 1;
// A zero-duration note sorts its note-off after its own note-on.
const RANK_DEGENERATE_NOTE_OFF = 2;

function readCString(bytes, offset, maxLength) {
  let s = '';
  for (let i = offset; i < offset + maxLength && i < bytes.length; i++) {
    if (bytes[i] === 0) break;
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

export class HmiFile {
  constructor() {
    this.name = '';
    this.signature = '';
    this.headerResolution = 0;
    this.beatsPerMinute = 0;
    this.trackCount = 0;
    this.tracks = [];
    this.events = [];
    this.durationTicks = 0;
    this.sourceName = '';
    this._bytes = null;
  }

  /**
   * @param {Uint8Array} bytes
   * @param {string} name
   * @returns {boolean}
   */
  load(bytes, name = '') {
    if (!(bytes instanceof Uint8Array)) throw new TypeError('HmiFile expects a Uint8Array');
    this.name = name;
    if (bytes.length < SONG_TRACK_TABLE + 4) return false;
    this.signature = readCString(bytes, 0, SONG_SIGNATURE.length);
    if (this.signature !== SONG_SIGNATURE) return false;

    this._bytes = bytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.headerResolution = view.getUint16(SONG_RESOLUTION, true);
    this.beatsPerMinute = view.getUint16(SONG_TEMPO_BPM, true);
    this.trackCount = view.getUint32(SONG_TRACK_COUNT, true);
    const tableOffset = view.getUint32(SONG_TRACK_TABLE, true);

    if (this.headerResolution <= 0) this._fail('bad header resolution');
    if (this.beatsPerMinute <= 0) this._fail('bad tempo');
    if (this.trackCount <= 0) this._fail('no tracks');
    if (tableOffset + 4 * this.trackCount > bytes.length) this._fail('track table out of range');

    const offsets = [];
    for (let i = 0; i < this.trackCount; i++) {
      const off = view.getUint32(tableOffset + 4 * i, true);
      if (off >= bytes.length) this._fail(`track ${i} offset ${off} out of range`);
      offsets.push(off);
    }

    this.tracks = [];
    let seq = 0;
    const merged = [];
    for (let i = 0; i < this.trackCount; i++) {
      const limit = i + 1 < this.trackCount ? offsets[i + 1] : bytes.length - SONG_TRAILER_SIZE;
      const track = this._readTrack(view, i, offsets[i], limit, seq);
      seq += track.events.length;
      this.tracks.push(track);
      for (const ev of track.events) merged.push(ev);
    }

    merged.sort((a, b) => a.tick - b.tick || a._rank - b._rank || a._seq - b._seq);
    for (const ev of merged) {
      delete ev._rank;
      delete ev._seq;
    }
    this.events = merged;
    this.durationTicks = this.tracks.reduce((n, t) => Math.max(n, t.endTick), 0);
    this.sourceName = readCString(bytes, bytes.length - SONG_TRAILER_SIZE, SONG_TRAILER_SIZE);
    return true;
  }

  get ticksPerQuarterNote() {
    return HMI_TICKS_PER_QUARTER;
  }

  get secondsPerTick() {
    return 60 / (this.beatsPerMinute * HMI_TICKS_PER_QUARTER);
  }

  get microsecondsPerQuarterNote() {
    return Math.round(60000000 / this.beatsPerMinute);
  }

  get durationSeconds() {
    return this.durationTicks * this.secondsPerTick;
  }

  tickToSeconds(tick) {
    return tick * this.secondsPerTick;
  }

  _fail(message, offset) {
    const where = offset === undefined ? '' : ` at byte ${offset}`;
    throw new Error(`${this.name || 'HMI song'}: ${message}${where}`);
  }

  _readTrack(view, index, start, limit, seqBase) {
    const bytes = this._bytes;
    if (readCString(bytes, start, TRACK_SIGNATURE.length) !== TRACK_SIGNATURE) {
      this._fail(`track ${index} is not ${TRACK_SIGNATURE}`, start);
    }
    const dataOffset = view.getUint32(start + TRACK_DATA_OFFSET, true);
    const channel = bytes[start + TRACK_CHANNEL];
    let p = start + dataOffset;
    if (p >= limit) this._fail(`track ${index} data offset out of range`, start);

    const prologueCount = bytes[p];
    const prologueEnd = p + 1 + PROLOGUE_RECORD_SIZE * prologueCount;
    if (prologueEnd > limit) this._fail(`track ${index} prologue out of range`, p);
    const prologue = bytes.slice(p, prologueEnd);
    p = prologueEnd;

    const events = [];
    const pending = [];
    let tick = 0;
    let status = 0;
    let endTick = 0;
    let seq = seqBase;

    const vlq = () => {
      let value = 0;
      for (let i = 0; i < 4; i++) {
        if (p >= limit) this._fail(`track ${index} ran past its data`, p);
        const c = bytes[p++];
        value = (value << 7) | (c & 0x7f);
        if (!(c & 0x80)) return value;
      }
      this._fail(`track ${index} over-long variable-length quantity`, p);
      return 0;
    };
    const data = () => {
      if (p >= limit) this._fail(`track ${index} ran past its data`, p);
      const b = bytes[p++];
      if (b & 0x80) this._fail(`track ${index} data byte 0x${b.toString(16)} has bit 7 set`, p - 1);
      return b;
    };
    const push = (ev, rank) => {
      ev._rank = rank;
      ev._seq = seq++;
      ev.track = index;
      events.push(ev);
      return ev;
    };

    let lastTick = 0;
    for (;;) {
      const delta = vlq();
      if (delta > HMI_MAX_DELTA) tick = lastTick;
      else { tick += delta; if (tick > lastTick) lastTick = tick; }
      if (p >= limit) this._fail(`track ${index} ended without end-of-track`, p);
      let st = bytes[p];
      if (st & 0x80) p++;
      else if (status) st = status;
      else this._fail(`track ${index} running status with no status`, p);

      if (st === 0xff) {
        const type = bytes[p++];
        const length = vlq();
        const payload = bytes.slice(p, p + length);
        p += length;
        if (type === META_END_OF_TRACK) {
          endTick = tick;
          break;
        }
        push({ tick, type: 'meta', channel: null, metaType: type, data: payload }, RANK_EVENT);
        continue;
      }
      if (st === 0xfe) {
        if (p + 4 > limit) this._fail(`track ${index} HMI event runs past its data`, p);
        const subtype = bytes[p];
        let size = HMI_FIXED_SIZES[subtype];
        if (subtype === HMI_CHANNEL_SETUP) size = 1 + 2 + 1 + bytes[p + 3] + 4;
        if (!size) this._fail(`track ${index} unknown HMI event 0xFE 0x${subtype.toString(16)}`, p);
        if (p + size > limit) this._fail(`track ${index} HMI event runs past its data`, p);
        push(
          { tick, type: 'hmi', channel: null, subtype, data: bytes.slice(p + 1, p + size) },
          RANK_EVENT,
        );
        p += size;
        continue;
      }
      if (st === 0xf0 || st === 0xf7) {
        const length = vlq();
        const payload = bytes.slice(p, p + length);
        p += length;
        push({ tick, type: 'sysEx', channel: null, status: st, data: payload }, RANK_EVENT);
        continue;
      }
      status = st;
      const kind = st & 0xf0;
      const ch = st & 0x0f;
      switch (kind) {
        case 0x80: {
          const note = data();
          const velocity = data();
          push({ tick, type: 'noteOff', channel: ch, note, velocity }, RANK_NOTE_OFF);
          break;
        }
        case 0x90: {
          const note = data();
          const velocity = data();
          const duration = vlq();
          const on = push({ tick, type: 'noteOn', channel: ch, note, velocity, duration }, RANK_EVENT);
          pending.push({
            tick: tick + duration,
            type: 'noteOff',
            channel: ch,
            note,
            velocity: 0,
            _rank: duration === 0 ? RANK_DEGENERATE_NOTE_OFF : RANK_NOTE_OFF,
            _seq: on._seq,
            track: index,
          });
          break;
        }
        case 0xa0: {
          const note = data();
          const pressure = data();
          push({ tick, type: 'polyPressure', channel: ch, note, pressure }, RANK_EVENT);
          break;
        }
        case 0xb0: {
          const controller = data();
          const value = data();
          push({ tick, type: 'controller', channel: ch, controller, value }, RANK_EVENT);
          break;
        }
        case 0xc0:
          push({ tick, type: 'programChange', channel: ch, program: data() }, RANK_EVENT);
          break;
        case 0xd0:
          push({ tick, type: 'channelPressure', channel: ch, pressure: data() }, RANK_EVENT);
          break;
        case 0xe0: {
          const lsb = data();
          const msb = data();
          push({ tick, type: 'pitchBend', channel: ch, value: (msb << 7) | lsb }, RANK_EVENT);
          break;
        }
        default:
          this._fail(`track ${index} unknown status byte 0x${st.toString(16)}`, p - 1);
          break;
      }
    }

    const streamEventCount = events.length;
    for (const off of pending) {
      events.push(off);
      if (off.tick > endTick) endTick = off.tick;
    }
    events.sort((a, b) => a.tick - b.tick || a._rank - b._rank || a._seq - b._seq);

    // A track must end exactly at its limit. Anything else is a misparse, so it throws instead of returning a wrong
    // event stream.
    if (limit - p !== 0) {
      this._fail(`track ${index} consumed to ${p}, not its limit ${limit} (${limit - p} bytes adrift)`, p);
    }

    return {
      index,
      channel,
      byteOffset: start,
      byteLength: limit - start,
      dataOffset,
      headerEventCount: view.getUint16(start + TRACK_EVENT_COUNT, true),
      header: bytes.slice(start, start + dataOffset),
      prologue,
      events,
      streamEventCount,
      endTick,
      trailingBytes: limit - p,
    };
  }
}

export class MidiBsaFile {
  constructor() {
    this._bsa = null;
    this._songs = null;
  }

  static get filename() {
    return 'MIDI.BSA';
  }

  get count() {
    return this._bsa ? this._bsa.count : 0;
  }

  get bsaFile() {
    return this._bsa;
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {boolean}
   */
  load(bytes) {
    this._bsa = new BsaFile(bytes);
    if (this._bsa.directoryType !== DIRECTORY_TYPES.NameRecord) return false;
    this._songs = new Array(this._bsa.count).fill(null);
    return true;
  }

  isValidIndex(song) {
    return song >= 0 && song < this.count;
  }

  getSongName(song) {
    return this._bsa ? this._bsa.getRecordName(song) : '';
  }

  getSongIndex(name) {
    return this._bsa ? this._bsa.getRecordIndex(name) : -1;
  }

  getSongBytes(song) {
    return this._bsa ? this._bsa.getRecordBytes(song) : null;
  }

  /** @returns {HmiFile|null} */
  getSong(song) {
    if (!this.isValidIndex(song)) return null;
    if (this._songs[song]) return this._songs[song];
    const name = this.getSongName(song);
    const hmi = new HmiFile();
    if (!hmi.load(this.getSongBytes(song), name)) {
      throw new Error(`${name}: not an ${SONG_SIGNATURE} record`);
    }
    this._songs[song] = hmi;
    return hmi;
  }
}
