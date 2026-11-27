
export function stringHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// Byte-exact .NET System.Random (Knuth subtractive), as Mono runs `new Random(seed)`. Sky stars, dungeon fog, heat
// haze, and wind gusts depend on its exact sequence.
const MBIG = 2147483647;
const MSEED = 161803398;

export class NetRandom {
  constructor(seed = 0) {
    this._seedArray = new Int32Array(56);
    const subtraction = seed === -2147483648 ? MBIG : Math.abs(seed);
    let mj = MSEED - subtraction;
    this._seedArray[55] = mj;
    let mk = 1;
    for (let i = 1; i < 55; i++) {
      const ii = (21 * i) % 55;
      this._seedArray[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = this._seedArray[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        this._seedArray[i] -= this._seedArray[1 + ((i + 30) % 55)];
        if (this._seedArray[i] < 0) this._seedArray[i] += MBIG;
      }
    }
    this._inext = 0;
    this._inextp = 21;
  }

  _internalSample() {
    let locINext = this._inext;
    let locINextp = this._inextp;
    if (++locINext >= 56) locINext = 1;
    if (++locINextp >= 56) locINextp = 1;
    let retVal = this._seedArray[locINext] - this._seedArray[locINextp];
    if (retVal === MBIG) retVal--;
    if (retVal < 0) retVal += MBIG;
    this._seedArray[locINext] = retVal;
    this._inext = locINext;
    this._inextp = locINextp;
    return retVal;
  }

  nextDouble() {
    return this._internalSample() * (1.0 / MBIG);
  }

  next(minValue, maxValue) {
    const range = maxValue - minValue;
    return Math.trunc(this.nextDouble() * range) + minValue;
  }
}
