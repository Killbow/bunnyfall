// @ts-check
import { buildCourtModel, buildWalkSlabModel, walkSlabs, slabMatrix, courtFloorTris, planOfDay, COURT_ARCHIVE, COURT_TEXT } from '../world/gateArena.js';
import { buildDeadlandsLand, buildShardModel, deadlandsShards, shardMatrix } from '../world/deadlandsLand.js';
import { gateArt, courtArt, GATE_ARCHIVE } from '../world/gateArt.js';
import { identity } from '../world/mat4.js';

export const COURT_BUCKET = 'wb:court';
export const NO_XA = Object.freeze([]);
const NO_TARGETS = Object.freeze([]);

/** @param {{ renderer: any, host: any }} deps */
export function createGateStand({ renderer, host }) {
  const courtMeshes = new Map();
  let artUp = false;
  let landMesh = null, shardMesh = null, slabMesh = null;

  function courtMeshOf(plan) {
    if (courtMeshes.has(plan.key) || !renderer?.createMesh) return courtMeshes.get(plan.key) ?? null;
    let m = null;
    try {
      if (!artUp) {
        // `white: true` keeps the court fire in its own texture color instead of the dungeon window emission tint.
        for (const [rec, art] of courtArt()) { renderer.uploadTexture?.(COURT_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(COURT_ARCHIVE, rec, art.emission, { white: true }); }
        for (const [rec, art] of gateArt()) { renderer.uploadTexture?.(GATE_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(GATE_ARCHIVE, rec, art.emission, { white: true }); }
        artUp = true;
      }
      m = renderer.createMesh(buildCourtModel(plan.pt));
    } catch (e) { console.warn('[gate] the court would not build', e?.message ?? e); m = null; }
    if (m) courtMeshes.set(plan.key, m);
    return m;
  }

  function standDeadlands(ctx) {
    if (!landMesh && renderer?.createMesh) {
      try {
        const land = buildDeadlandsLand(), shard = buildShardModel();
        landMesh = renderer.createMesh(land);
        shardMesh = renderer.createMesh(shard);
      } catch (e) { console.warn('[gate] the Deadlands\' land would not build', e?.message ?? e); landMesh = null; shardMesh = null; }
    }
    if (landMesh) ctx.dynamicDraws.push({ gpu: landMesh, object: { matrix: identity() } });
    if (shardMesh) for (const s of deadlandsShards()) ctx.dynamicDraws.push({ gpu: shardMesh, object: { matrix: shardMatrix(s, host.deadlandsSeconds?.() ?? 0) }, shard: s });
  }

  // Call before the start marker is read, so the spawn lands on the court floor this adds to the collider.
  function standCourt(ctx, day = null) {
    const plan = planOfDay(day);
    const courtMesh = courtMeshOf(plan);
    if (courtMesh) ctx.dynamicDraws.push({ gpu: courtMesh, object: { matrix: identity() } });
    standDeadlands(ctx);
    if (!slabMesh && renderer?.createMesh) { try { slabMesh = renderer.createMesh(buildWalkSlabModel()); } catch (e) { console.warn('[gate] the walkways would not build', e?.message ?? e); slabMesh = null; } }
    if (slabMesh) { const fl = host.gateFloor?.() ?? null; for (const sl of walkSlabs(plan.pt)) ctx.dynamicDraws.push({ gpu: slabMesh, object: { matrix: slabMatrix(sl, fl?.xa ?? NO_XA, fl?.now ?? 0) }, slab: sl }); }
    const tris = courtFloorTris(plan.pt);
    const n = tris.length / 3;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    ctx.collider.addMesh(COURT_BUCKET, tris, idx, identity());
    ctx.addActivationNamer((key) => (typeof key === 'string' && key.startsWith('exit:') ? { title: COURT_TEXT.wayHome } : null));
    ctx.addActivationTargets(() => host.spoilTargets?.() ?? NO_TARGETS);
    ctx.addActivationNamer((key) => (typeof key === 'string' && key.startsWith('spoil') ? host.spoilName?.(key) ?? null : null));
  }

  return { standCourt, standDeadlands };
}
