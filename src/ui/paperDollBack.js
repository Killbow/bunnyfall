// @ts-check
// DOLL-BACK (2026-10-30, a player via the owner: "looking at paperdolls is the best way of seeing other people's
// characters in the gameworld ... it might be possible to bodge something so that they can at least appear to face
// away. Do something like averaging the colours of each piece and using that to fill in flat colour for the back.
// (Possibly average the colours around the edge of the sprite for a head, so you pick up the helmet/hair rather than
// the skin tone)"): A PAPERDOLL SEEN FROM BEHIND, MADE FROM ITS FRONT. Daggerfall draws the doll from the front only.
// The compositor (ui/paperDoll.js composeDoll) tells this tracker after each layer it lays - the cloak's lining, the
// body, the head, each worn piece - so every pixel knows the layer that drew it last. The back is then:
//   - each layer in its own average colour over the pixels it shows, a faint trace of the front's folds kept on cloth
//     and armour (none of its detail: no face, no buckles), skin flat;
//   - the head's box in the hair's colour (the head's edge against the air), or in the helm's where one covers it;
//   - a cloak's colour over the back between its two sides, from the shoulders down, as a cloak hangs from behind;
//   - the whole turned left for right, as a body seen from behind is.
// DOLL-BACK II (the owner, after a look: "could use some work"; then the game's files to look with): a layer is the
// pixels its blit WROTE (the alpha sentinel below), never the ones whose colour changed - a leather cuirass laid over
// skin of the same palette entry left those pixels the body's, and the armour came out speckled with skin.

import { EQUIP_SLOTS } from '../systems/equip.js';

/** How much of the front's light and shade the back keeps on cloth and armour (0 flat, 1 the front's own). */
export const DOLL_BACK_SHADE = 0.12;
/** The share of the head's box an item must cover to be the head's colour from behind (a helm, a hood). */
export const DOLL_BACK_HELM_SHARE = 0.2;
/** How many rows above and below a cloak's sides are looked for in, where an arm hides one. */
export const DOLL_BACK_CLOAK_ROWS = 10;
/** How far along its row a hand looks for the cloth about it, pixels. */
export const DOLL_BACK_HAND_REACH = 16;
/** The widest run of skin across a row that is a hand, pixels. */
export const DOLL_BACK_HAND_WIDTH = 14;
/** How near the skin's hue (the summed distance of the three channels' shares) a weld's pixel is skin. */
export const DOLL_BACK_SKIN_NEAR = 0.12;
/** The least share of a weld's pixels that must be cloth for it to be cloth at all. */
export const DOLL_BACK_WELD_CLOTH = 0.1;
/** The alpha a pixel stands at between two layers: a blit writes 255, so a pixel still at this was not written. */
const LAID = 254;

/** The kind of layer a worn piece is, by its slot. */
export function dollPieceKind(/** @type {number} */ slot) {
  if (slot === EQUIP_SLOTS.Cloak1 || slot === EQUIP_SLOTS.Cloak2) return 'cloak';
  if (slot === EQUIP_SLOTS.RightHand || slot === EQUIP_SLOTS.LeftHand) return 'weapon';
  return 'item';
}

/**
 * A tracker over the compositor's `out` (RGBA, `w` x `h`), made after the background: `mark(kind)` after each layer
 * names the pixels that layer wrote as its own; `finish()` before `out` is used.
 * @param {Uint8Array} out @param {number} w @param {number} h
 */
export function createDollTracker(out, w, h) {
  const owner = new Int16Array(w * h).fill(-1);
  /** DOLL-BACK III: under a weapon, the layer it was laid over (the body it is held in front of), else -1 */
  const beneath = new Int16Array(w * h).fill(-1);
  /** @type {string[]} */
  const kinds = [];
  const settle = () => { for (let i = 3; i < out.length; i += 4) if (out[i] === 255) out[i] = LAID; };
  settle();
  return {
    owner, beneath, kinds, w, h,
    mark(/** @type {string} */ kind) {
      const k = kinds.length;
      kinds.push(kind);
      for (let p = 0, i = 3; p < owner.length; p++, i += 4) {
        if (out[i] === 255) { if (kind === 'weapon' && owner[p] >= 0 && kinds[owner[p]] !== 'weapon') beneath[p] = owner[p]; owner[p] = k; }
        else if (out[i] === 0) owner[p] = -1;   // erased (a helm's mask over the hair): nobody's
      }
      settle();
    },
    finish() { for (let i = 3; i < out.length; i += 4) if (out[i] === LAID) out[i] = 255; },
  };
}

/**
 * The back of the doll `out` the tracker followed: a new RGBA buffer of the same size.
 * @param {Uint8Array} out @param {ReturnType<typeof createDollTracker>} track
 */
export function dollBackPixels(out, track) {
  const { owner, kinds, w, h } = track;
  const n = kinds.length;
  const skin = (/** @type {number} */ k) => kinds[k] === 'body' || kinds[k] === 'weld' || kinds[k] === 'head';
  const at = (/** @type {number} */ x, /** @type {number} */ y) => (x < 0 || y < 0 || x >= w || y >= h || !out[(y * w + x) * 4 + 3] ? -2 : owner[y * w + x]);
  const shown = (/** @type {number} */ p) => out[p * 4 + 3] > 0;

  // each layer's average colour; the head's over its edge against the air alone (the hair's outline)
  const sum = new Float64Array(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, k = owner[p];
      if (k < 0 || !shown(p)) continue;
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

  // what each pixel is from behind: its own layer, or the one that covers it there
  const from = Int16Array.from(owner);
  // DOLL-BACK III: THE WELDS (the classic art's underclothes, drawn with the skin about them): a weld pixel near the
  // skin's colour is the body's, and the rest - the cloth - is the weld, in the cloth's own colour
  const bodyK = kinds.indexOf('body');
  if (bodyK >= 0) {
    // by its hue alone (each channel's share of the whole), so the skin's own shade and light are still skin
    const S = avg[bodyK * 4] + avg[bodyK * 4 + 1] + avg[bodyK * 4 + 2] || 1;
    const near = (/** @type {number} */ p) => {
      const s2 = out[p * 4] + out[p * 4 + 1] + out[p * 4 + 2] || 1;
      return Math.abs(out[p * 4] / s2 - avg[bodyK * 4] / S) + Math.abs(out[p * 4 + 1] / s2 - avg[bodyK * 4 + 1] / S) + Math.abs(out[p * 4 + 2] / s2 - avg[bodyK * 4 + 2] / S) < DOLL_BACK_SKIN_NEAR;
    };
    for (let k = 0; k < n; k++) {
      if (kinds[k] !== 'weld') continue;
      let r = 0, g = 0, b = 0, c = 0, all = 0;
      for (let p = 0; p < owner.length; p++) {
        if (owner[p] !== k || !shown(p)) continue;
        all++;
        if (near(p)) { from[p] = bodyK; continue; }
        r += out[p * 4]; g += out[p * 4 + 1]; b += out[p * 4 + 2]; c++;
      }
      // a few odd pixels (an outline, a toe's shadow) are no cloth: all of it the skin's then
      if (c < all * DOLL_BACK_WELD_CLOTH) { for (let p = 0; p < owner.length; p++) if (owner[p] === k) from[p] = bodyK; continue; }
      if (c) { avg[k * 4] = r / c; avg[k * 4 + 1] = g / c; avg[k * 4 + 2] = b / c; avg[k * 4 + 3] = 0.299 * avg[k * 4] + 0.587 * avg[k * 4 + 1] + 0.114 * avg[k * 4 + 2]; }
    }
  }
  // THE BACK OF THE HEAD: the head's box (its own pixels) is the hair's colour, or a helm's that covers enough of it
  const headK = kinds.indexOf('head');
  if (headK >= 0) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let p = 0; p < owner.length; p++) {
      if (owner[p] !== headK) continue;
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 >= 0) {
      const count = new Int32Array(n);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = owner[y * w + x]; if (k >= 0 && kinds[k] === 'item') count[k]++; }
      let helm = -1;
      for (let k = 0; k < n; k++) if (count[k] > (helm < 0 ? 0 : count[helm])) helm = k;
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const cover = helm >= 0 && count[helm] >= area * DOLL_BACK_HELM_SHARE ? helm : headK;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const p = y * w + x; if (from[p] >= 0 && (skin(from[p]) || from[p] === cover)) from[p] = cover; }
    }
  }
  // A CLOAK FROM BEHIND: between its two sides, from the shoulders down, the body and its clothes are the cloak
  const cloaks = [];
  for (let k = 0; k < n; k++) if (kinds[k] === 'cloak') cloaks.push(k);
  if (cloaks.length) {
    const outer = cloaks[cloaks.length - 1];
    const isCloak = (/** @type {number} */ k) => k >= 0 && (kinds[k] === 'cloak' || kinds[k] === 'lining');
    let top = -1;
    for (let y = 0; y < h && top < 0; y++) for (let x = 0; x < w; x++) if (owner[y * w + x] === outer) { top = y; break; }
    // each row's two sides, widened over the rows about it - an arm across the cloak's edge hides that side in its rows
    const L = new Int32Array(h).fill(-1), R = new Int32Array(h).fill(-1);
    for (let y = Math.max(0, top); top >= 0 && y < h; y++) {
      for (let x = 0; x < w; x++) if (isCloak(owner[y * w + x])) { if (L[y] < 0) L[y] = x; R[y] = x; }
    }
    for (let y = Math.max(0, top); top >= 0 && y < h; y++) {
      if (L[y] < 0) continue;
      let l = L[y], r = R[y];
      for (let d = -DOLL_BACK_CLOAK_ROWS; d <= DOLL_BACK_CLOAK_ROWS; d++) {
        const yy = y + d;
        if (yy < top || yy >= h || L[yy] < 0) continue;
        l = Math.min(l, L[yy]); r = Math.max(r, R[yy]);
      }
      for (let x = l; x <= r; x++) {
        const p = y * w + x, k = from[p];
        if (k < 0 || kinds[k] === 'weapon' || k === headK) continue;
        if (!isCloak(owner[p]) && !(skin(k) || kinds[k] === 'item')) continue;
        from[p] = outer;
      }
    }
    for (let p = 0; p < from.length; p++) if (from[p] >= 0 && kinds[from[p]] === 'lining') from[p] = outer;   // the lining is the cloak's outside, seen from behind
  }

  // DOLL-BACK III (the owner: "you are putting weapons and hands in the front"): WHAT IS HELD IN FRONT IS HIDDEN BY THE
  // BODY. A weapon's pixels laid over the body are the body's from behind (the layer they were laid over); and a hand or
  // a bare arm with cloth or a cloak on both sides of it in its row is in front of the torso - from behind, that cloth.
  const { beneath } = track;
  for (let p = 0; p < from.length; p++) if (from[p] >= 0 && kinds[from[p]] === 'weapon' && beneath[p] >= 0) from[p] = beneath[p];
  const cloth = (/** @type {number} */ k) => k >= 0 && (kinds[k] === 'item' || kinds[k] === 'cloak' || kinds[k] === 'lining');
  const fill = Int16Array.from(from);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, k = from[p];
      if (k < 0 || k === headK || !skin(k)) continue;
      const seek = (/** @type {number} */ dx) => {
        for (let d = 1; d <= DOLL_BACK_HAND_REACH; d++) {
          const xx = x + dx * d;
          if (xx < 0 || xx >= w || !shown(y * w + xx)) return null;
          const kk = from[y * w + xx];
          if (cloth(kk)) return { k: kk, d };
          if (kk < 0 || !skin(kk)) return null;
        }
        return null;
      };
      // a hand is a short run of skin across its row; a bare belly or chest is wide, and stays the skin it is
      let run = 1;
      for (let xx = x - 1; xx >= 0 && from[y * w + xx] >= 0 && skin(from[y * w + xx]) && from[y * w + xx] !== headK; xx--) run++;
      for (let xx = x + 1; xx < w && from[y * w + xx] >= 0 && skin(from[y * w + xx]) && from[y * w + xx] !== headK; xx++) run++;
      if (run > DOLL_BACK_HAND_WIDTH) continue;
      const l = seek(-1), r = l ? seek(1) : null;
      if (l && r) fill[p] = l.d <= r.d ? l.k : r.k;
    }
  }
  from.set(fill);

  const back = new Uint8Array(out.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4, o = (y * w + (w - 1 - x)) * 4;   // turned left for right
      const a = out[i + 3];
      if (!a) continue;
      const k = from[p];
      if (k < 0) { back[o] = out[i]; back[o + 1] = out[i + 1]; back[o + 2] = out[i + 2]; back[o + 3] = a; continue; }
      // the folds of the layer that is there (its own pixel's light, when it is its own), skin and the head flat
      const own = owner[p] === k;
      const lum = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
      const m = avg[k * 4 + 3];
      const shade = !own || skin(k) || k === headK ? 1 : Math.max(0.7, Math.min(1.3, 1 + DOLL_BACK_SHADE * (m > 1 ? lum / m - 1 : 0)));
      back[o] = Math.min(255, avg[k * 4] * shade); back[o + 1] = Math.min(255, avg[k * 4 + 1] * shade); back[o + 2] = Math.min(255, avg[k * 4 + 2] * shade);
      back[o + 3] = a;
    }
  }
  return back;
}
