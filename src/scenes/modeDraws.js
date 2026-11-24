// @ts-check
// The interior and dungeon frame's per-draw loops (scenes/worldModes.js frame). Their variables live here so the
// frame stays within the size and register ceilings in tools/worldBudget.json.
import { shardMatrix } from '../world/deadlandsLand.js';
import { slabMatrix } from '../world/gateArena.js';
import { NO_XA } from '../worldEvents/gateStand.js';
import { advanceMachinery, mountMachineryChild, machineryChildPos, MILL_SOUND } from '../world/windmills.js';
import { audio } from '../audio/audio.js';

const DRAW_NO_SHADOW = Object.freeze({ noShadow: true }), DRAW_SHADOW = Object.freeze({ noShadow: false });

export function poseCourtShards(draws, seconds) {
  for (const d of draws) if (d.shard) shardMatrix(d.shard, seconds, d.object.matrix);
}
export function poseCourtSlabs(draws, floor) {
  for (const d of draws) if (d.slab) slabMatrix(d.slab, floor?.xa ?? NO_XA, floor?.now ?? 0, d.object.matrix);
}
export function drawDungeonLevel(renderer, ctx) {
  for (const d of ctx.drawList) if (!d._batched) renderer.drawMesh(d.mesh, d.matrix, d.texRemap ?? ctx.texRemap);
}
export function drawDungeonMovers(renderer, ctx) {
  for (const d of ctx.dynamicDraws) if (!d.hidden && !d.culled) renderer.drawMesh(d.gpu, d.object.matrix, d.texRemap ?? ctx.texRemap, d.noShadow ? DRAW_NO_SHADOW : DRAW_SHADOW);
}
export function drawInteriorLevel(renderer, ctx) {
  for (const d of ctx.drawList) if (!d._batched) renderer.drawMesh(d.mesh, d.matrix, ctx.texRemap);
}
export function turnInteriorRotors(renderer, ctx, held, dt) {
  for (const r of ctx.rotors) {
    if (!held) advanceMachinery(r.state, dt, r.child);
    renderer.drawMesh(r.gpu, mountMachineryChild(r.parent, r.child, r.state.angle), ctx.texRemap);
    // Only the gear hums (the roller's script adds no sound source). Retried until the audio context is up.
    if (r.child.loopsSound && !r.hum) r.hum = audio.loop3d(MILL_SOUND.clip, machineryChildPos(r.parent, r.child), MILL_SOUND.volume, MILL_SOUND);
  }
}
export function drawInteriorMovers(renderer, ctx) {
  for (const d of ctx.dynamicDraws) renderer.drawMesh(d.gpu, d.object.matrix, ctx.texRemap);
}
export function drawInteriorCharacters(renderer, ctx) {
  for (const d of ctx.charDraws) renderer.drawCharacter(d.mesh, d.matrix);
}
export function drawCardWatches(watches) {
  for (const w of watches.values()) if (w.remote.state) w.draw.draw(w.scene.poses(performance.now() / 1000, w.remote.view()));
}
export function drawGambitWatches(watches, draw, eye) {
  for (const [i, w] of watches) draw(i, w, eye);
}
