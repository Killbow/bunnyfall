// Port of the Unity.Mathematics `Random` so terrain beach randomness matches DFU bit for bit. Index seeding adds 62
// before the Wang hash, and each step returns the state from before the update.

const F32 = new Float32Array(1);
const U32 = new Uint32Array(F32.buffer);

function wangHash(n) {
  n = ((n ^ 61) ^ (n >>> 16)) >>> 0;
  n = (n * 9) >>> 0;
  n = (n ^ (n >>> 4)) >>> 0;
  n = Math.imul(n, 0x27d4eb2d) >>> 0;
  n = (n ^ (n >>> 15)) >>> 0;
  return n;
}

export class UMRandom {
  constructor(seed) {
    this.state = seed >>> 0;
    this._nextState();
  }

  static createFromIndex(index) {
    return new UMRandom(wangHash((index + 62) >>> 0));
  }

  _nextState() {
    const t = this.state;
    let s = this.state;
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    this.state = s;
    return t;
  }

  nextFloat() {
    U32[0] = (0x3f800000 | (this._nextState() >>> 9)) >>> 0;
    return F32[0] - 1.0;
  }

  // Each operation rounds to float32 as the C# does. Double math shifts the beach tile threshold at some corners.
  nextFloatRange(min, max) {
    return Math.fround(Math.fround(this.nextFloat() * Math.fround(max - min)) + min);
  }

  nextIntRange(min, max) {
    const range = BigInt(max - min);
    return Number((BigInt(this._nextState()) * range) >> 32n) + min;
  }
}
