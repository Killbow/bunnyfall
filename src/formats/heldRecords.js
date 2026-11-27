// @ts-check

export class HeldRecords {
  /**
   * @param {number} max
   * @param {(index: number) => void} drop
   */
  constructor(max, drop) {
    this.max = max;
    this._drop = drop;
    /** @type {Map<number, true>} */
    this._order = new Map();
  }

  /** @param {number} index */
  hold(index) {
    this._order.delete(index);
    this._order.set(index, true);
    while (this._order.size > this.max) {
      const oldest = /** @type {number} */ (this._order.keys().next().value);
      this._order.delete(oldest);
      this._drop(oldest);
    }
  }

  /** @param {number} index */
  forget(index) { this._order.delete(index); }

  get size() { return this._order.size; }
}
