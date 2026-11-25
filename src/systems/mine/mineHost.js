// @ts-check
// BUNNYFALL (2026-11-25, caverns): A MINE ON THIS SCREEN'S DUNGEON HOST - the made level stood into its built context, as
// the Sky-Ketch's deck is (systems/ketch/ketchDeckHost.js): the cave's mesh among the context's draws under Daggerfall's cave
// textures, its rock on the collider as one bucket, and its way out an exit door at the mouth, so the dungeon's own exit
// press and landing take the player back out where they went in. createWorldModes constructs it and calls `stand`.
import { identity } from '../../world/mat4.js';
import { mineLayout } from '../../net/mine/mineLayout.js';
import { buildMineModel, mineColliderTris, mineTextures } from '../../world/mine/mineModel.js';
import { isMine } from '../../world/mine/mineLocation.js';
import { t } from '../../ui/textManager.js';

/** The collider's bucket for the cave's rock. */
export const MINE_BUCKET = 'mine:cave';
/** The way out's opening at the mouth (m). */
export const MINE_EXIT = Object.freeze({ w: 3, h: 3 });
export const MINE_TEXT = Object.freeze({
  wayOut: () => t('mine.wayOut', 'The way out'),
});

/**
 * The mouth's exit door, in the dungeon's frame - the arena's shape (world/arenaFloor.js arenaExitDoors).
 * @param {{ at: number[], facing: number }} mouth
 */
export function mineExitDoor(mouth) {
  const [x, y, z] = mouth.at;
  return {
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
    centre: { x: 0, y: MINE_EXIT.h / 2, z: 0 }, size: { x: MINE_EXIT.w, y: MINE_EXIT.h, z: MINE_EXIT.w },
    normal: { x: Math.cos(mouth.facing), y: 0, z: Math.sin(mouth.facing) },
    mine: true,
  };
}

/**
 * @param {{ renderer: any, getTexture?: ((archive: number) => Promise<any>) | null, uploadRecord?: ((archive: number, record: number) => any) | null }} deps
 */
export function createMineHost({ renderer, getTexture = null, uploadRecord = null }) {
  /** @type {any} */
  let mesh = null, standCtx = null, layout = null;
  return {
    /** THE MINE stood into its built context (before its start marker is read): `loc` the made location (mineLocation). */
    stand(/** @type {any} */ ctx, /** @type {any} */ loc) {
      if (!ctx || !isMine(loc)) return;
      const mine = loc.mine;
      layout = mineLayout(mine.id, mine.reset ?? 0);
      const tex = mineTextures(loc.climate?.worldClimate ?? 0);
      // the archive read first (the pipeline uploads a record of a file it holds), then its three records
      const up = () => { for (const rec of new Set([tex.wall, tex.floor, tex.ceiling])) { try { uploadRecord?.(tex.archive, rec); } catch (e) { console.warn('[mine] a texture', /** @type {any} */ (e)?.message ?? e); } } };
      Promise.resolve(getTexture?.(tex.archive)).then(up, (e) => console.warn('[mine] the cave textures', e?.message ?? e));
      try { mesh = renderer?.createMesh ? renderer.createMesh(buildMineModel(layout, tex)) : null; } catch (e) { console.warn('[mine] the cave would not build', e?.message ?? e); mesh = null; }
      if (mesh) ctx.dynamicDraws?.push({ gpu: mesh, object: { matrix: identity() }, hidden: false, noShadow: false, texRemap: null });
      const tris = mineColliderTris(layout), idx = new Uint32Array(tris.length / 3);
      for (let k = 0; k < idx.length; k++) idx[k] = k;
      try { ctx.collider?.addMesh?.(MINE_BUCKET, tris, idx, identity()); } catch (e) { console.warn('[mine] the cave\'s collider', e?.message ?? e); }
      ctx.exitDoors?.push(mineExitDoor(layout.mouth));
      ctx.addActivationNamer?.((/** @type {any} */ key) => (typeof key === 'string' && key.startsWith('exit:') ? { title: MINE_TEXT.wayOut() } : null));
      standCtx = ctx;
      ctx.addTeardown?.(() => {
        if (standCtx !== ctx) return;
        try { if (mesh) renderer?.destroyMesh?.(mesh); } catch { /* the context's own teardown frees it either way */ }
        mesh = null; standCtx = null; layout = null;
      });
    },
    /** The layout of the mine stood now, or null. */
    layout: () => layout,
  };
}
