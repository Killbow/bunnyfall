// @ts-check

/** @typedef {{ destroyed(): boolean, position(): number[], destroy(): void }} Transient */

export class TransientObjectTracker {
  constructor() {
    /** @type {Transient[]} */
    this.objects = [];
  }

  get count() { return this.objects.length; }

  /** @param {?Transient} go */
  add(go) { if (go) this.objects.push(go); }

  clear() {
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (o && !o.destroyed()) o.destroy();
    }
    this.objects.length = 0;
  }

  /** @param {(o: Transient) => void} queueDestroy */
  release(queueDestroy) {
    for (let i = this.objects.length - 1; i >= 0; i--) queueDestroy(this.objects[i]);
    this.objects.length = 0;
  }

  /**
   * @param {number[]} playerPos
   * @param {number} maxFlatDistance
   * @param {number} maxCount
   */
  prune(playerPos, maxFlatDistance, maxCount) {
    maxCount = Math.max(0, maxCount);
    const maxSq = maxFlatDistance * maxFlatDistance;
    const flatSq = (/** @type {Transient} */ o) => {
      const p = o.position();
      const dx = p[0] - playerPos[0], dz = p[2] - playerPos[2];
      return dx * dx + dz * dz;
    };
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (!o || o.destroyed()) { this.objects.splice(i, 1); continue; }
      if (flatSq(o) > maxSq) { o.destroy(); this.objects.splice(i, 1); }
    }
    while (this.objects.length > maxCount) {
      let far = -1, farSq = -1;
      for (let i = 0; i < this.objects.length; i++) {
        const o = this.objects[i];
        if (!o || o.destroyed()) { far = i; break; }
        const d = flatSq(o);
        if (d > farSq) { farSq = d; far = i; }
      }
      if (far < 0) break;
      const o = this.objects[far];
      if (o && !o.destroyed()) o.destroy();
      this.objects.splice(far, 1);
    }
  }
}
