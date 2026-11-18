// @ts-check
// BUNNYFALL: A DISCORD PATRON'S CUSTOM PAPERDOLL IN THE TAVERN ROOM. A person who talks in the Discord tavern channel stands
// in the room as one of its customers, renamed (scenes/tavernServiceHost.js `alias`). When that Discord user has linked a game
// account that wears an approved custom paperdoll (net/skinLaw.js, systems/online/customSkins.js), the account service names
// it beside the patron (`skins`: customer key -> skin id), and this module draws the picture where the customer stands, in
// place of the customer's own figure, instead of only changing the name.
//
// The figure is drawn exactly as a peer wearing the skin is (net/remotePlayers.js `_composeDoll`): the front picture cropped
// to its figure, upright on the billboard, as tall as the skin's own height says. Until the pictures arrive, or if they never
// do (withdrawn, switched off, the viewer hid that player's skins), the customer keeps their own figure and only the name.
import { PEER_ARCHIVE, PEER_HEIGHT, alphaBounds, cropRgba } from '../net/remotePlayers.js';
import { skinArtOf } from '../systems/online/customSkins.js';
import { skinShownFor } from '../systems/online/skinHide.js';
import { skinIdOk } from '../net/skinLaw.js';

/**
 * @param {{ renderer: any, people: () => any[], npcId: (pn: any) => string,
 *   skinArt?: (id: string) => any }} deps
 */
export function createTavernPatronSkins({ renderer, people, npcId, skinArt = skinArtOf }) {
  /** skin id -> { rec, size } once uploaded, or null when it cannot be drawn (retried when the art changes) */
  const textures = new Map();
  /** customer key -> { skin, pn, batch } */
  const placed = new Map();

  /** The skin's picture on the GPU, or null while its pictures are not here. */
  function textureOf(skin) {
    const have = textures.get(skin);
    if (have) return have;
    const art = skinArt(skin);
    if (!art || !skinShownFor(art.owner)) return null;
    const r = alphaBounds(art.front, art.w, art.h);
    if (!r) return null;
    const crop = cropRgba(art.front, art.w, r, { bottomUp: true });   // the billboard samples bottom-up
    const rec = `tpatron_${skin}`;
    renderer.uploadTexture(PEER_ARCHIVE, rec, { width: r.w, height: r.h, colors: new Uint32Array(crop.buffer) });
    const hs = Number(art.height) || 1;
    const made = { rec, size: { w: PEER_HEIGHT * hs * (r.w / r.h), h: PEER_HEIGHT * hs } };
    textures.set(skin, made);
    return made;
  }

  function drop(key) {
    const e = placed.get(key);
    if (e?.batch) renderer.destroyBillboardBatch?.(e.batch);
    placed.delete(key);
  }

  return {
    /** Follow what the service says: `skins` is customer key -> skin id. Cheap; called every frame the room is up. */
    sync(skins) {
      if (!renderer?.createBillboardBatch) return;
      const want = skins ?? {};
      for (const key of [...placed.keys()]) if (!skinIdOk(want[key])) drop(key);
      for (const [key, skin] of Object.entries(want)) {
        if (!skinIdOk(skin)) continue;
        const pn = people().find((p) => npcId(p) === key);
        if (!pn) { drop(key); continue; }
        const have = placed.get(key);
        if (have && have.skin === skin && have.pn === pn) {
          // the art can be withdrawn or hidden after it landed: the customer is their own again
          const art = skinArt(skin);
          if (art && skinShownFor(art.owner)) continue;
          drop(key);
          const old = textures.get(skin);
          if (old) renderer.releaseTexture?.(PEER_ARCHIVE, old.rec);
          textures.delete(skin);
          continue;
        }
        drop(key);
        const tex = textureOf(skin);
        if (!tex) continue;
        const batch = renderer.createBillboardBatch(PEER_ARCHIVE, tex.rec, tex.size, [[pn.x, pn.y, pn.z]]);
        batch.noShadow = true;   // the customer's own figure still casts the shadow
        batch.frame = 0;
        placed.set(key, { skin, pn, batch });
      }
    },
    /** Whether this person stands as a custom paperdoll now (so their own figure is not drawn). */
    has: (pn) => { const e = placed.get(npcId(pn)); return !!e && e.pn === pn; },
    batches: () => [...placed.values()].map((e) => e.batch),
    clear() {
      for (const key of [...placed.keys()]) drop(key);
      for (const { rec } of textures.values()) renderer?.releaseTexture?.(PEER_ARCHIVE, rec);
      textures.clear();
    },
  };
}
