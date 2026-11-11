// @ts-check
// BUNNYFALL (2026-11-05, the owner: "i would also love to be able to hand place npcs"): THE PEOPLE A POI STANDS. A POI's
// document may carry `npcs` (poi/poiLaw.js): each a name, a spot from the place, the way they face, a height, a look and
// the lines they say. Here they stand as billboards - always turned to the player, as the Guild's Nyx is - on the ground of
// the POI's pixel, and answer Talk with their next line.
//   - A LOOK is one of Daggerfall's own sprites (`{ k: 'df', a: archive, r: record }`, the game's flats, the player's own
//     copy), or a picture a builder uploaded (`{ k: 'pic', tex: sha }`, a POI asset like any).
//   - Hosted by scenes/poiHost.js, which hands each standing POI's people here every frame; the Cromwark host carries the
//     result to the world's flats and its Talk key (scenes/cromwarkHost.js), so the world host wires one dep.
import { mobileBillboardSize } from '../world/rmbFlats.js';
import { decodePng } from '../systems/textureReplacement.js';
import { toColor32 } from '../formats/color32Order.js';

/** The archive a builder's picture is uploaded under; its records are `${n}#0`. */
export const POI_NPC_ARCHIVE = 9920;
/** How near a person is drawn and can be talked to (m). */
const SEEN_M = 400, REACH_M = 4;

/** @param {any} deps `{ renderer, getTexture, uploadRecordFrame, asset, auth, say, feet, talk }` - `talk(poiId, npcKey)` a POI runtime's word on Talk (true: it answered) */
export function createPoiNpcs({ renderer, getTexture = null, uploadRecordFrame = null, asset = null, auth = () => null, say = null, feet = () => null, talk = null }) {
  /** @type {Map<string, any>} `${poi}|${key}` -> the person standing */
  const people = new Map();
  /** sha -> { record, w, h } | { failed } | null (loading): a builder's pictures */
  const pics = new Map();
  /** archive -> texture file | { failed } | null (loading) */
  const texes = new Map();
  let picN = 0;
  /** poi id -> the objects a POI's runtime stands as targets (poi/poiDmRuntime.js): `{ key, name, at, h, w, activate(mode) }`, `at` in scene space */
  const extras = new Map();
  /** @type {any[]} this frame's batches, targets */
  const out = { batches: [], targets: [] };

  function picOf(sha) {
    let e = pics.get(sha);
    if (e !== undefined) return e;
    pics.set(sha, null);
    Promise.resolve(asset?.(sha, { auth: auth() })).then((b) => decodePng(b)).then((img) => {
      const record = `${picN++}#0`;
      renderer.uploadTexture(POI_NPC_ARCHIVE, record, toColor32(img));
      pics.set(sha, { record, aspect: img.width / Math.max(1, img.height) });
    }).catch((err) => { pics.set(sha, { failed: true }); console.warn('[poi npc] a picture would not load', err?.message ?? err); });
    return null;
  }
  function texOf(archive) {
    const e = texes.get(archive);
    if (e !== undefined) return e;
    texes.set(archive, null);
    Promise.resolve(getTexture?.(archive)).then((tex) => texes.set(archive, tex ?? { failed: true }), () => texes.set(archive, { failed: true }));
    return null;
  }
  /** The sprite a look asks for, ready to batch: `{ archive, record, w, h }`, or null while it loads or cannot. */
  function spriteOf(look, h) {
    if (look?.k === 'pic') {
      const p = picOf(look.tex);
      if (!p || p.failed) return null;
      return { archive: POI_NPC_ARCHIVE, record: p.record, w: h * p.aspect, h };
    }
    if (look?.k === 'df') {
      const tex = texOf(look.a);
      if (!tex || tex.failed || !(look.r < (tex.recordCount ?? 0))) return null;
      if (!renderer.textures?.has?.(`${look.a}_${look.r}#0`)) uploadRecordFrame?.(look.a, look.r, 0);
      const sz = mobileBillboardSize(tex, look.r);
      const k = h / Math.max(0.01, sz.h);
      return { archive: look.a, record: `${look.r}#0`, w: sz.w * k, h };
    }
    return null;
  }

  const extraOf = (/** @type {string} */ key) => { if (typeof key === 'string' && key.startsWith('poidm:')) for (const list of extras.values()) for (const x of list) if (x.key === key) return x; return null; };

  return {
    /** A standing POI's people this frame: `list` them (poi/poiRuntime.js npcsOf, in the pixel's frame), `t` the pixel's
     *  translation, `y` the place's height (the people's own heights ride on it). */
    sync(id, list, t) {
      if (people.size) for (const [k, p] of people) if (p.id === id && !list.some((n) => `${id}|${n.key}` === k)) { if (p.batch) renderer.destroyBillboardBatch?.(p.batch); people.delete(k); }   // one taken out of the document
      for (const n of list) {
        const k = `${id}|${n.key}`;
        let p = people.get(k);
        const look = JSON.stringify(n.look) + n.h;
        if (p && p.look !== look) { renderer.destroyBillboardBatch?.(p.batch); people.delete(k); p = null; }
        if (!p) { p = { id, key: k, look, batch: null, said: 0, at: [0, 0, 0], h: n.h, name: n.name, lines: n.lines, tgt: null }; people.set(k, p); }
        p.name = n.name; p.lines = n.lines; p.h = n.h;
        p.at[0] = n.at[0] + t[0]; p.at[1] = n.at[1] + t[1]; p.at[2] = n.at[2] + t[2];
        p.seen = true;
        if (!p.batch) {
          const s = spriteOf(n.look, n.h);
          if (s && renderer.createBillboardBatch) {
            p.batch = renderer.createBillboardBatch(s.archive, s.record, { w: s.w, h: s.h }, [[0, 0, 0]]);
            p.batch.origin = [0, 0, 0];
            p.w = s.w;
          }
        }
        if (p.batch) { p.batch.origin[0] = p.at[0]; p.batch.origin[1] = p.at[1]; p.batch.origin[2] = p.at[2]; }
      }
    },
    /** A POI taken down: its people go. */
    drop(id) {
      for (const [k, p] of people) if (p.id === id) { if (p.batch) renderer.destroyBillboardBatch?.(p.batch); people.delete(k); }
    },
    /** The frame's batches and Talk targets: the people near the player. Call once a frame, before the world reads them. */
    frame() {
      out.batches.length = 0; out.targets.length = 0;
      const f = feet();
      for (const p of people.values()) {
        if (!p.batch) continue;
        if (f && Math.hypot(f[0] - p.at[0], f[2] - p.at[2]) > SEEN_M) continue;
        out.batches.push(p.batch);
        const hw = Math.max(0.4, (p.w ?? 1) / 2);
        p.tgt ??= { key: `poinpc:${p.key}`, aabb: { min: [0, 0, 0], max: [0, 0, 0] }, distance: REACH_M + 2, reach: REACH_M, noSurface: false };
        const a = p.tgt.aabb;
        a.min[0] = p.at[0] - hw; a.min[1] = p.at[1]; a.min[2] = p.at[2] - hw;
        a.max[0] = p.at[0] + hw; a.max[1] = p.at[1] + p.h; a.max[2] = p.at[2] + hw;
        out.targets.push(p.tgt);
      }
      for (const list of extras.values()) {
        for (const x of list) {
          if (f && Math.hypot(f[0] - x.at[0], f[2] - x.at[2]) > REACH_M * 4) continue;
          x.tgt ??= { key: x.key, aabb: { min: [0, 0, 0], max: [0, 0, 0] }, distance: REACH_M + 2, reach: REACH_M, noSurface: false };
          const a = x.tgt.aabb, hw = Math.max(0.4, (x.w ?? 1) / 2);
          a.min[0] = x.at[0] - hw; a.min[1] = x.at[1]; a.min[2] = x.at[2] - hw;
          a.max[0] = x.at[0] + hw; a.max[1] = x.at[1] + (x.h ?? 1); a.max[2] = x.at[2] + hw;
          out.targets.push(x.tgt);
        }
      }
    },
    batches: () => out.batches,
    targets: () => out.targets,
    ours: (/** @type {string} */ key) => (typeof key === 'string' && key.startsWith('poinpc:') && people.has(key.slice(7))) || !!extraOf(key),
    hoverName(/** @type {string} */ key) {
      const x = extraOf(key);
      if (x) return { title: x.name, subs: [] };
      const p = typeof key === 'string' && key.startsWith('poinpc:') ? people.get(key.slice(7)) : null;
      return p ? { title: p.name, subs: [] } : null;
    },
    /** Talk: their next line, said. */
    activate(/** @type {string} */ key, mode = 'grab') {
      const x = extraOf(key);
      if (x) { if (mode === 'info') say?.(x.name); else x.activate?.(mode); return true; }
      const p = typeof key === 'string' && key.startsWith('poinpc:') ? people.get(key.slice(7)) : null;
      if (!p) return false;
      if (mode === 'steal') { say?.(`${p.name} keeps a hand on their purse.`); return true; }
      if (mode === 'info') { say?.(p.name); return true; }
      if (talk?.(p.id, p.key.slice(p.id.length + 1))) return true;   // a v2 POI's person: its dialogue or trade
      const lines = p.lines ?? [];
      if (!lines.length) return true;
      say?.(`${p.name}: ${lines[p.said % lines.length]}`);
      p.said++;
      return true;
    },
    count: () => people.size,
    /** A POI's own targets (its objects to use), replaced each frame by its runtime; none, and they go. */
    setExtras(/** @type {string} */ id, /** @type {any[] | null} */ list) { if (list?.length) extras.set(id, list); else extras.delete(id); },
  };
}
