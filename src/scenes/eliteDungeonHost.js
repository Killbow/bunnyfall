// @ts-check
// BUNNYFALL (2026-11-18, daily elite dungeons - net/eliteDungeonLaw.js): AN ELITE DUNGEON IN THE WORLD. Over each one the
// book holds (systems/eliteDungeons/edBook.js) within ED_SEEN_PX map pixels of the player, outside: the great crystal and
// the ring of purple light on the ground (render/eliteDungeons/edCrystalPass.js), and a pale violet column under it (the
// event pillar's beacon, render/superDungeon/sdOmenPass.js) so it is found from far off. Each rises as the book hears it
// and fades away as it is cleansed. A module the world host wires (HOST-SPLIT): it hands its doors; nothing here stands a
// foe. The same on every machine (the dungeon's own pixel and its location's centre).
import { SdOmenPassRenderer } from '../render/superDungeon/sdOmenPass.js';
import { EdCrystalPassRenderer } from '../render/eliteDungeons/edCrystalPass.js';
import { spawnedLocationCentreLocal } from '../world/spawnedDungeons.js';
import { ED_SEEN_PX, ED_RGB } from '../net/eliteDungeonLaw.js';

/** How long a crystal takes to rise and to fade (s), and how strong its column of light is. */
export const ED_FADE_S = 5;
export const ED_COLUMN_FADE = 0.4;

/**
 * @param {{
 *   gl: WebGL2RenderingContext | null,
 *   book: () => any,                                      the elite dungeons' book, or null
 *   location: (region: number, location: number) => any, the DFLocation of a dungeon (maps), or null
 *   translation: (px: number, py: number) => number[],    a pixel's place in the scene now
 *   heightAt: (x: number, z: number) => number,           the ground (NaN where none is built)
 *   pixel: () => ({ x: number, y: number }),              the player's travel pixel
 *   outside: () => boolean,                               the world outside is drawn (not a dungeon or a building)
 *   now?: () => number,                                   seconds
 * }} deps
 */
export function createEliteDungeonPresence(deps) {
  const now = deps.now ?? (() => performance.now() / 1000);
  /** key -> { e, fade, local: [x, z] | null, y: number | null } */
  const shown = new Map();
  let lastT = /** @type {number | null} */ (null);
  /** @type {EdCrystalPassRenderer | null | undefined} */
  let crystal;
  /** @type {SdOmenPassRenderer | null | undefined} */
  let column;

  function localOf(e) {
    try {
      const loc = deps.location(e.region, e.location);
      if (loc?.exterior?.exteriorData) return spawnedLocationCentreLocal(loc);
    } catch { /* the pixel's middle */ }
    return [819.2 / 2, 819.2 / 2];
  }

  function list() {
    const t = now();
    const dt = lastT == null ? 0 : Math.max(0, Math.min(1, t - lastT));
    lastT = t;
    const live = new Set();
    for (const e of deps.book?.()?.list?.() ?? []) {
      if (!e) continue;
      live.add(e.key);
      if (!shown.has(e.key)) shown.set(e.key, { e, fade: 0, local: null, y: null });
    }
    const me = deps.pixel();
    const out = [];
    for (const [key, s] of shown) {
      s.fade = Math.max(0, Math.min(1, s.fade + (live.has(key) ? dt : -dt) / ED_FADE_S));
      if (!live.has(key) && s.fade <= 0) { shown.delete(key); continue; }
      if (Math.max(Math.abs(me.x - s.e.px), Math.abs(me.y - s.e.py)) > ED_SEEN_PX) continue;
      s.local ??= localOf(s.e);
      const tr = deps.translation(s.e.px, s.e.py);
      const x = tr[0] + s.local[0], z = tr[2] + s.local[1];
      const h = deps.heightAt(x, z);
      if (Number.isFinite(h)) s.y = h - tr[1];   // kept in the pixel's frame, for when its ground is not built
      out.push({ origin: [x, tr[1] + (s.y ?? 0), z], fade: s.fade, phase: (s.e.slot ?? 0) * 1.3 });
    }
    return out;
  }

  return {
    /** Whether any stands to draw (the host builds the pass's arguments only then). */
    showing: () => deps.outside() && ((deps.book?.()?.list?.() ?? []).length > 0 || shown.size > 0),
    /** The crystals' pass, after the world's: how many it drew. */
    draw(/** @type {Float32Array} */ proj, /** @type {Float32Array} */ view, /** @type {Float32Array} */ eye, /** @type {number} */ seconds, /** @type {any} */ fog = null) {
      if (!deps.gl || !deps.outside()) return 0;
      const items = list();
      if (!items.length) return 0;
      if (column === undefined) { try { column = new SdOmenPassRenderer(deps.gl, ED_RGB); } catch (e) { console.warn('[elite dungeon] the column would not build', /** @type {any} */ (e)?.message ?? e); column = null; } }
      if (crystal === undefined) { try { crystal = new EdCrystalPassRenderer(deps.gl); } catch (e) { console.warn('[elite dungeon] the crystal would not build', /** @type {any} */ (e)?.message ?? e); crystal = null; } }
      let n = 0;
      if (column) n += column.draw(items.map((o) => ({ origin: o.origin, fade: o.fade * ED_COLUMN_FADE })), proj, view, eye, seconds, fog);
      if (crystal) n += crystal.draw(items, proj, view, eye, seconds, fog);
      return n;
    },
    /** For the probes. */
    list: () => list(),
  };
}
