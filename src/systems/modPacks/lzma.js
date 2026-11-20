// BUNNYFALL MODPACK1: AN LZMA AND LZMA2 DECODER, for the 7z archives mods are downloaded as (Paperdoll Enhanced's
// Nexus file is one). The algorithm is Igor Pavlov's (LZMA SDK, public domain); this is a plain reading of it, written
// for the port, with no dependency.
//
// RESUMABLE BY DESIGN. A mod's archive holds hundreds of megabytes, and a decode that never yields freezes the tab.
// Every piece of the decoder's state lives on the object, so `step(budget)` decodes about `budget` bytes, hands them to
// the sink and returns; the caller awaits a frame between steps. Input is the packed stream whole, in memory (the
// compressed side); output goes to `sink(bytes)` a window at a time and is never held whole here.

const kNumStates = 12;
const kEndPosModelIndex = 14;
const kNumFullDistances = 128;
const kNumAlignBits = 4;
const kMatchMinLen = 2;
const PROB_INIT = 1024;

const probs = (n) => new Uint16Array(n).fill(PROB_INIT);

class RangeDecoder {
  constructor(buf, pos) {
    this.buf = buf;
    this.pos = pos;
    this.range = 0xFFFFFFFF;
    this.code = 0;
    if (buf[this.pos++] !== 0) throw new Error('lzma: bad range coder start');
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | buf[this.pos++]) >>> 0;
    if (this.code === this.range) throw new Error('lzma: bad range coder start');
  }
  normalize() {
    if (this.range < 0x1000000) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.buf[this.pos++]) >>> 0;
    }
  }
  bit(p, i) {
    const prob = p[i];
    const bound = (this.range >>> 11) * prob;
    let b;
    if (this.code < bound) {
      this.range = bound;
      p[i] = prob + ((2048 - prob) >>> 5);
      b = 0;
    } else {
      this.range -= bound;
      this.code -= bound;
      p[i] = prob - (prob >>> 5);
      b = 1;
    }
    this.normalize();
    return b;
  }
  direct(n) {
    let res = 0;
    for (let i = 0; i < n; i++) {
      this.range >>>= 1;
      let b = 0;
      if (this.code >= this.range) { this.code -= this.range; b = 1; }
      res = ((res << 1) | b) >>> 0;
      this.normalize();
    }
    return res;
  }
  tree(p, base, bits) {
    let m = 1;
    for (let i = 0; i < bits; i++) m = (m << 1) | this.bit(p, base + m);
    return m - (1 << bits);
  }
  reverse(p, base, bits) {
    let m = 1, sym = 0;
    for (let i = 0; i < bits; i++) {
      const b = this.bit(p, base + m);
      m = (m << 1) | b;
      sym |= b << i;
    }
    return sym;
  }
}

class LenDecoder {
  constructor() {
    this.choice = probs(2);
    this.low = probs(16 << 3);
    this.mid = probs(16 << 3);
    this.high = probs(256);
  }
  decode(rc, posState) {
    if (rc.bit(this.choice, 0) === 0) return rc.tree(this.low, posState << 3, 3);
    if (rc.bit(this.choice, 1) === 0) return 8 + rc.tree(this.mid, posState << 3, 3);
    return 16 + rc.tree(this.high, 0, 8);
  }
}

/** The output window: the dictionary, flushed to the sink as it fills. */
class Window {
  constructor(size, sink) {
    this.buf = new Uint8Array(size);
    this.size = size;
    this.pos = 0;
    this.flushed = 0;
    this.full = false;
    this.total = 0;   // bytes produced, all told
    this.sink = sink;
  }
  put(b) {
    this.buf[this.pos++] = b;
    this.total++;
    if (this.pos === this.size) this.wrap();
  }
  wrap() {
    this.flush();
    this.pos = 0;
    this.flushed = 0;
    this.full = true;
  }
  get(dist) {   // dist 0 = the last byte
    let i = this.pos - dist - 1;
    if (i < 0) i += this.size;
    return this.buf[i];
  }
  copy(dist, len) {
    for (let i = 0; i < len; i++) this.put(this.get(dist));
  }
  has(dist) { return this.full || dist < this.pos; }
  flush() {
    if (this.pos > this.flushed) this.sink(this.buf.slice(this.flushed, this.pos));
    this.flushed = this.pos;
  }
}

/** The LZMA state machine over a window - LZMA1 and LZMA2 share it. */
class LzmaCore {
  constructor(window) { this.win = window; this.lc = 3; this.lp = 0; this.pb = 2; }
  setProps(byte) {
    if (byte >= 9 * 5 * 5) throw new Error('lzma: bad properties');
    this.lc = byte % 9;
    byte = (byte / 9) | 0;
    this.lp = byte % 5;
    this.pb = (byte / 5) | 0;
  }
  resetState() {
    this.literal = probs(0x300 << (this.lc + this.lp));
    this.isMatch = probs(kNumStates << 4);
    this.isRep = probs(kNumStates);
    this.isRepG0 = probs(kNumStates);
    this.isRepG1 = probs(kNumStates);
    this.isRepG2 = probs(kNumStates);
    this.isRep0Long = probs(kNumStates << 4);
    this.posSlot = probs(4 << 6);
    this.posSpecial = probs(1 + kNumFullDistances - kEndPosModelIndex);
    this.align = probs(1 << kNumAlignBits);
    this.lenDec = new LenDecoder();
    this.repLenDec = new LenDecoder();
    this.state = 0;
    this.rep0 = this.rep1 = this.rep2 = this.rep3 = 0;
  }
  literalByte(rc) {
    const w = this.win;
    const prev = w.total > 0 ? w.get(0) : 0;
    const lpMask = (1 << this.lp) - 1;
    const base = 0x300 * (((w.total & lpMask) << this.lc) + (prev >>> (8 - this.lc)));
    const p = this.literal;
    let sym = 1;
    if (this.state >= 7) {
      let match = w.get(this.rep0);
      do {
        const mbit = (match >>> 7) & 1;
        match <<= 1;
        const b = rc.bit(p, base + ((1 + mbit) << 8) + sym);
        sym = (sym << 1) | b;
        if (mbit !== b) break;
      } while (sym < 0x100);
    }
    while (sym < 0x100) sym = (sym << 1) | rc.bit(p, base + sym);
    w.put(sym & 0xFF);
    this.state = this.state < 4 ? 0 : this.state < 10 ? this.state - 3 : this.state - 6;
  }
  distance(rc, len) {
    const lenState = len < 4 ? len : 3;
    const slot = rc.tree(this.posSlot, lenState << 6, 6);
    if (slot < 4) return slot;
    const numDirect = (slot >>> 1) - 1;
    let dist = ((2 | (slot & 1)) << numDirect) >>> 0;
    if (slot < kEndPosModelIndex) return dist + rc.reverse(this.posSpecial, dist - slot, numDirect);
    dist = (dist + (rc.direct(numDirect - kNumAlignBits) << kNumAlignBits)) >>> 0;
    return (dist + rc.reverse(this.align, 0, kNumAlignBits)) >>> 0;
  }
  /** Decode until `limit` bytes are out (the window's total) or an end marker; answers false at the marker. */
  run(rc, limit) {
    const w = this.win;
    const pbMask = (1 << this.pb) - 1;
    while (w.total < limit) {
      const posState = w.total & pbMask;
      const s = this.state;
      if (rc.bit(this.isMatch, (s << 4) + posState) === 0) { this.literalByte(rc); continue; }
      let len;
      if (rc.bit(this.isRep, s) === 0) {
        len = this.lenDec.decode(rc, posState);
        this.state = s < 7 ? 7 : 10;
        const dist = this.distance(rc, len);
        if (dist === 0xFFFFFFFF) return false;   // the end marker
        this.rep3 = this.rep2; this.rep2 = this.rep1; this.rep1 = this.rep0; this.rep0 = dist;
      } else {
        if (rc.bit(this.isRepG0, s) === 0) {
          if (rc.bit(this.isRep0Long, (s << 4) + posState) === 0) {   // a short rep: one byte
            this.state = s < 7 ? 9 : 11;
            w.put(w.get(this.rep0));
            continue;
          }
        } else {
          let dist;
          if (rc.bit(this.isRepG1, s) === 0) dist = this.rep1;
          else {
            if (rc.bit(this.isRepG2, s) === 0) dist = this.rep2;
            else { dist = this.rep3; this.rep3 = this.rep2; }
            this.rep2 = this.rep1;
          }
          this.rep1 = this.rep0;
          this.rep0 = dist;
        }
        len = this.repLenDec.decode(rc, posState);
        this.state = s < 7 ? 8 : 11;
      }
      if (!w.has(this.rep0)) throw new Error('lzma: distance past the data');
      w.copy(this.rep0, Math.min(len + kMatchMinLen, limit - w.total));
    }
    return true;
  }
}

const windowSize = (dict, unpackSize) => Math.max(4096, Math.min(dict, Number.isFinite(unpackSize) ? unpackSize : dict, 1 << 30));

/** LZMA1 as 7z stores it: 5 property bytes (lc/lp/pb, dictionary size) beside the coder; `unpackSize` known. */
export function lzmaDecoder(props, input, unpackSize, sink) {
  const dict = (props[1] | (props[2] << 8) | (props[3] << 16) | (props[4] << 24)) >>> 0;
  const win = new Window(windowSize(dict, unpackSize), sink);
  const core = new LzmaCore(win);
  core.setProps(props[0]);
  core.resetState();
  const rc = new RangeDecoder(input, 0);
  let done = false;
  return {
    get done() { return done; },
    get total() { return win.total; },
    step(budget) {
      if (done) return;
      const ended = !core.run(rc, Math.min(unpackSize, win.total + budget));
      if (ended || win.total >= unpackSize) done = true;
      win.flush();
    },
  };
}

/** LZMA2: one property byte (the dictionary size), the stream in chunks of its own. */
export function lzma2Decoder(props, input, unpackSize, sink) {
  const p = props[0] & 0x3F;
  if (p > 40) throw new Error('lzma2: bad dictionary size');
  const dict = p === 40 ? 0xFFFFFFFF : (2 | (p & 1)) * 2 ** ((p >>> 1) + 11);
  const win = new Window(windowSize(dict, unpackSize), sink);
  const core = new LzmaCore(win);
  let pos = 0;
  let done = false;
  let needProps = true;
  const chunk = () => {
    const c = input[pos++];
    if (c === undefined) throw new Error('lzma2: truncated');
    if (c === 0x00) return false;
    if (c === 0x01 || c === 0x02) {   // a stored chunk
      const size = ((input[pos] << 8) | input[pos + 1]) + 1;
      pos += 2;
      for (let i = 0; i < size; i++) win.put(input[pos + i]);
      pos += size;
      return true;
    }
    if (c < 0x80) throw new Error('lzma2: bad control byte');
    const size = (((c & 0x1F) << 16) | (input[pos] << 8) | input[pos + 1]) + 1;
    const packed = ((input[pos + 2] << 8) | input[pos + 3]) + 1;
    pos += 4;
    const mode = (c >>> 5) & 3;
    if (mode >= 2) { core.setProps(input[pos++]); needProps = false; }
    else if (needProps) throw new Error('lzma2: no properties');
    if (mode >= 1) core.resetState();
    const rc = new RangeDecoder(input, pos);
    core.run(rc, win.total + size);
    pos += packed;
    return true;
  };
  return {
    get done() { return done; },
    get total() { return win.total; },
    step(budget) {
      const stop = win.total + budget;
      while (!done && win.total < stop) if (!chunk()) done = true;
      win.flush();
    },
  };
}
