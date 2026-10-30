// @ts-check
// DOLL-BACK (2026-10-30, a player via the owner: "looking at paperdolls is the best way of seeing other people's
// characters in the gameworld ... it might be possible to bodge something so that they can at least appear to face
// away. Do something like averaging the colours of each piece and using that to fill in flat colour for the back.
// (Possibly average the colours around the edge of the sprite for a head, so you pick up the helmet/hair rather than
// the skin tone)"): A PAPERDOLL SEEN FROM BEHIND, MADE FROM ITS FRONT. Daggerfall draws the doll from the front only.
// The compositor (ui/paperDoll.js composeDoll) tells this tracker after each layer it lays - the body, the head, each
// worn piece - so every pixel knows the layer that drew it last. The back is then each layer's own average colour over
// the pixels it shows, a little of the front's light and shade kept so folds still read (none of its detail: no
// face, no buckles), the head's average taken round its edge alone (the hair or the helm, never the face's skin), and
// the whole turned left for right, as a body seen from behind is.

/** How much of the front's light and shade the back keeps (0 flat, 1 the front's own). */
export const DOLL_BACK_SHADE = 0.15;   // DOLL-BACK II (the owner, a screenshot: "could use some work"): the folds alone, faint

/**
 * A tracker over the compositor's `out` (RGBA, `w` x `h`): `mark(kind)` after each layer is laid names the pixels it
 * changed as that layer's.
 * @param {Uint8Array} out @param {number} w @param {number} h
 */
export function createDollTracker(out, w, h) {
  const owner = new Int16Array(w * h).fill(-1);
  /** @type {string[]} */
  const kinds = [];
  let prev = out.slice();
  return {
    owner, kinds, w, h,
    mark(/** @type {string} */ kind) {
      const k = kinds.length;
      kinds.push(kind);
      for (let i = 0, p = 0; p < owner.length; p++, i += 4) {
        if (out[i] !== prev[i] || out[i + 1] !== prev[i + 1] || out[i + 2] !== prev[i + 2] || out[i + 3] !== prev[i + 3]) owner[p] = k;
      }
      prev = out.slice();
    },
  };
}

/**
 * The back of the doll `out` the tracker followed: a new RGBA buffer of the same size.
 * @param {Uint8Array} out @param {ReturnType<typeof createDollTracker>} track
 */
export function dollBackPixels(out, track) {
  const { owner, kinds, w, h } = track;
  const n = kinds.length;
  const sum = new Float64Array(n * 4);   // r, g, b, count
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -2 : out[(y * w + x) * 4 + 3] ? owner[y * w + x] : -2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, k = owner[p];
      if (k < 0 || !out[p * 4 + 3]) continue;
      // the head's colour is its edge's against the empty air - its hair's outline, never the neck where it meets the body
      if (kinds[k] === 'head' && at(x - 1, y) !== -2 && at(x + 1, y) !== -2 && at(x, y - 1) !== -2 && at(x, y + 1) !== -2) continue;
      sum[k * 4] += out[p * 4]; sum[k * 4 + 1] += out[p * 4 + 1]; sum[k * 4 + 2] += out[p * 4 + 2]; sum[k * 4 + 3] += 1;
    }
  }
  const avg = new Float64Array(n * 4);   // r, g, b, luminance
  for (let k = 0; k < n; k++) {
    const c = sum[k * 4 + 3] || 1;
    const r = sum[k * 4] / c, g = sum[k * 4 + 1] / c, b = sum[k * 4 + 2] / c;
    avg[k * 4] = r; avg[k * 4 + 1] = g; avg[k * 4 + 2] = b; avg[k * 4 + 3] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  // DOLL-BACK II: THE BACK OF THE HEAD. The head's own layer is mostly its hair: the face is the body's art, and showed
  // through as skin. Every pixel of the body or the head within the head's box is the hair's colour from behind - a
  // helm or a hood (an item's own layer) still drawn over it.
  const headK = kinds.indexOf('head');
  let hx0 = w, hy0 = h, hx1 = -1, hy1 = -1;
  if (headK >= 0) {
    for (let p = 0; p < owner.length; p++) {
      if (owner[p] !== headK || !out[p * 4 + 3]) continue;
      const x = p % w, y = (p / w) | 0;
      if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; if (y < hy0) hy0 = y; if (y > hy1) hy1 = y;
    }
  }
  const skin = (/** @type {number} */ k) => kinds[k] === 'body' || kinds[k] === 'weld' || kinds[k] === 'head';
  const back = new Uint8Array(out.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4, o = (y * w + (w - 1 - x)) * 4;   // turned left for right
      const a = out[i + 3];
      if (!a) continue;
      let k = owner[p];
      if (headK >= 0 && k >= 0 && skin(k) && x >= hx0 && x <= hx1 && y >= hy0 && y <= hy1) k = headK;
      if (k < 0) { back[o] = out[i]; back[o + 1] = out[i + 1]; back[o + 2] = out[i + 2]; back[o + 3] = a; continue; }
      const lum = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
      const m = avg[k * 4 + 3];
      const shade = skin(k) ? 1 : Math.max(0.55, Math.min(1.45, 1 + DOLL_BACK_SHADE * (m > 1 ? lum / m - 1 : 0)));
      back[o] = Math.min(255, avg[k * 4] * shade); back[o + 1] = Math.min(255, avg[k * 4 + 1] * shade); back[o + 2] = Math.min(255, avg[k * 4 + 2] * shade);
      back[o + 3] = a;
    }
  }
  return back;
}
