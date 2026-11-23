// @ts-check
// Shadow cache signatures: an order-independent fold, and one shared walk for all lo-tier lamps.

export function spheresTouch(ax, ay, az, ar, bx, by, bz, br) {
  const dx = ax - bx, dy = ay - by, dz = az - bz, r = ar + br;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/** Order-independent (a sum of rotated products), so the draw order the culling shuffles cannot change it. */
export function foldSignature(h, v) {
  const x = (v | 0) * 0x9e3779b1 | 0;
  return (h + ((x << 13) | (x >>> 19))) | 0;
}

export class LoLampSignatures {
  /**
   * @param {number} capacity
   * @param {(held: number, range: number) => number} heldFar
   * @param {(range: number) => number} farFor
   */
  constructor(capacity, heldFar, farFor) {
    this.casters = new Float64Array(4 * capacity);
    this.signatures = new Int32Array(2 * capacity);
    this.indexOfLight = new Int32Array(capacity);
    this.heldFar = heldFar;
    this.farFor = farFor;
  }

  /**
   * The far here must match the far _renderLo computes for the same slot.
   * @param {{ lights: ArrayLike<number>, lightCount: number, slotOf: ArrayLike<number>, readsFullMap: (light: number) => boolean,
   *   slotLight: ArrayLike<number>, slotBuilt: ArrayLike<number>, walk: (casters: Float64Array, count: number, out: Int32Array) => void }} input
   */
  gather(input) {
    const { lights, slotLight, slotOf, slotBuilt } = input;
    let asked = 0;
    for (let light = 0; light < input.lightCount; light++) {
      this.indexOfLight[light] = -1;
      const slot = slotOf[light];
      if (slot < 0 || input.readsFullMap(light)) continue;
      const o = slot * 4, x = lights[light * 4], y = lights[light * 4 + 1], z = lights[light * 4 + 2], range = lights[light * 4 + 3];
      const same = slotBuilt[slot] && slotLight[o] === x && slotLight[o + 1] === y && slotLight[o + 2] === z;
      this.casters[asked * 4] = x;
      this.casters[asked * 4 + 1] = y;
      this.casters[asked * 4 + 2] = z;
      this.casters[asked * 4 + 3] = same ? this.heldFar(slotLight[o + 3], range) : this.farFor(range);
      this.indexOfLight[light] = asked++;
    }
    if (asked > 0) input.walk(this.casters, asked, this.signatures);
  }

  /** @param {number} light */
  hash(light) { return this.signatures[this.indexOfLight[light] * 2]; }

  /** @param {number} light */
  count(light) { return this.signatures[this.indexOfLight[light] * 2 + 1]; }
}
