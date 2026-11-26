// @ts-check
import { buildEgRuinParts } from '../../world/eliteGates/egRuin.js';
import { createEgWreckLook } from './egWreckLook.js';
import { egCircleSpecs, egBandOfCircle, EG_HALL_PITCH } from '../../net/eliteGates/egLaw.js';
import { SD_REALM_ORIGIN } from '../../net/sdBrain.js';
import { identity } from '../../world/mat4.js';
import { isTouchDevice } from '../../ui/touchDevice.js';
import { createEgOccluders } from './egOcclude.js';

/** @param {{ renderer?: any, lite?: boolean }} [deps] */
export function createEgGroundLook({ renderer = null, lite = isTouchDevice() } = {}) {
  const IDENT = identity();
  /** @type {Array<{ h: number, x0: number, gpu: any, draw: any, occ: any }>} */
  let ruins = [];
  let eyeX0 = NaN;
  let halls = /** @type {Array<{ x0: number, zc: number, court: boolean }>} */ ([]);
  const wreck = createEgWreckLook({ renderer, lite });
  const make = (model) => {
    if (!model || !renderer?.createMesh) return null;
    try { return renderer.createMesh(model); } catch (e) { console.warn('[eg] the ruin would not build', e?.message ?? e); return null; }
  };
  const free = (gpu) => { if (gpu) { try { renderer?.destroyMesh?.(gpu); } catch { } } };
  const drawOf = (gpu, matrix) => (gpu ? { gpu, object: { matrix }, noShadow: true, hidden: false } : null);
  // Each ruin's dither pass clears before its mesh is freed, because the pass holds views over that mesh.
  function dropRuins() {
    const was = ruins;
    ruins = []; eyeX0 = NaN;
    for (const r of was) { r.occ?.clear(); free(r.gpu); }
  }
  const api = {
    lite,
    stand(seed, c, geo = 0, built = null, vistaBuilt = null) {
      halls = egCircleSpecs(seed, c, geo).map((s) => ({ x0: s.x0, zc: (s.len ?? 80) / 2, court: !!s.lord }));
      let parts = built;
      if (!Array.isArray(parts)) { try { parts = buildEgRuinParts(seed, c, geo, { lite }); } catch (e) { console.warn('[eg] the ruin would not build', e?.message ?? e); parts = []; } }
      dropRuins();
      for (const p of parts) {
        const gpu = make(p.model);
        if (!gpu) continue;
        const draw = drawOf(gpu, IDENT), occ = createEgOccluders({ renderer, shadow: false });
        occ.set(gpu, p.model); occ.stand(draw);
        ruins.push({ h: p.h, x0: p.x0, gpu, draw, occ });
      }
      wreck.stand(egBandOfCircle(c), vistaBuilt);
      return api.draws();
    },
    draws() { return [...ruins.map((r) => r.draw), ...wreck.draws()].filter(Boolean); },
    frame(eye, seconds = 0) {
      if (!eye || !halls.length) return;
      const ex = eye[0] - SD_REALM_ORIGIN[0];
      let at = halls[0];
      for (const hl of halls) if (Math.abs(hl.x0 - ex) < Math.abs(at.x0 - ex)) at = hl;
      if (at.x0 !== eyeX0) { eyeX0 = at.x0; for (const r of ruins) r.occ.stand(r.draw); }
      for (const r of ruins) if (r.draw) r.draw.hidden = Math.abs(r.x0 - at.x0) > EG_HALL_PITCH / 2;
      wreck.frame(eye, SD_REALM_ORIGIN[0] + at.x0, SD_REALM_ORIGIN[1], SD_REALM_ORIGIN[2] + at.zc, seconds, at.court);
    },
    // The wreck's draws leave `list`, but its meshes survive `down` because they belong to the band; only `release`
    // frees them.
    down(list = null) {
      const mine = new Set(api.draws());
      if (Array.isArray(list)) for (let i = list.length - 1; i >= 0; i--) if (mine.has(list[i])) list.splice(i, 1);
      const n = ruins.filter((r) => r.gpu).length;
      dropRuins(); halls = [];
      return n;
    },
    release() { dropRuins(); halls = []; wreck.release(); },
    /** @param {any} circle */
    occluders(circle) {
      const eyes = () => ruins.filter((r) => r.x0 === eyeX0);
      return {
        set: (gpu, model) => circle.set(gpu, model), stand: (d) => circle.stand(d), clear: () => circle.clear(), shares: () => circle.shares(),
        frame(f) { let n = circle.frame(f); for (const r of eyes()) n += r.occ.frame(f); return n; },
        draw(texRemap = null) { let n = circle.draw(texRemap); for (const r of eyes()) n += r.occ.draw(texRemap); return n; },
        stats: () => ({ ...circle.stats(), ruin: eyes().reduce((a, r) => { const q = r.occ.stats(); return { pieces: a.pieces + q.pieces, dithering: a.dithering + q.dithering, glDraws: a.glDraws + q.glDraws }; }, { pieces: 0, dithering: 0, glDraws: 0 }) }),
      };
    },
    stats: () => { const w = wreck.stats(); return { ruins: ruins.length, drawn: ruins.filter((r) => r.draw && !r.draw.hidden).length, band: w.band, wreck: w.wings + (w.under ? 1 : 0), wreckDraws: w.draws, wreckTris: w.tris }; },
  };
  return api;
}
