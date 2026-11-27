// @ts-check
// `wm.mode`, `wm.dungeonCtx`, and `wm.dungeonLoc` change under this module, so read them through `wm` on every call
// and never cache them.
import { identity } from '../../world/mat4.js';
import { SD_REALM_ARCHIVE } from '../../world/sdRealm.js';
import { realmArt } from '../../world/sdRealmArt.js';
import { isEgHall, buildEgCircleModel, egCircleColliderTris, egCircleLights, egGateParts } from '../../world/eliteGates/egHall.js';
import { egCircleSpecs, egBandOfCircle, egSpecGive, EG_TEXT } from '../../net/eliteGates/egLaw.js';
import { createEgSwap } from './egSwap.js';
import { createEgOccluders } from './egOcclude.js';
import { EG_BAND_RECORDS, egBandArt, egBandArchive } from '../../world/eliteGates/egBandArt.js';
import { egBeatTellDown } from './egSpan.js';
import { buildEgLookModel } from '../../world/eliteGates/egLook.js';
import { createEgGroundLook } from './egGroundLook.js';

const NO_TARGETS = Object.freeze([]);

/** @param {{ renderer: any, host: any, wm: { readonly mode: string, readonly dungeonCtx: any, readonly dungeonLoc: any } }} deps */
export function createEgCircleHost({ renderer, host, wm }) {
  const EG_BUCKET = 'eg:hall';
  let _egMesh = null, _egMeshKey = '', _egArt = false, _egLamps = [], _egLookMesh = null;
  const _egBands = new Set();
  const _egBandRecs = new Map();
  /** @type {Array<{ h: number, gpu: any, T: number[], draw: any }>} */
  let _egGates = [];
  const ground = createEgGroundLook({ renderer });
  const egOcc = ground.occluders(createEgOccluders({ renderer }));
  let _egDraw = null;
  function egCircleDraw(ctx) {
    _egDraw = _egMesh ? { gpu: _egMesh, object: { matrix: identity() } } : null;
    if (_egDraw) ctx.dynamicDraws.push(_egDraw);
    egOcc.stand(_egDraw);
  }
  // Empty the slots and clear the dither pass before destroying meshes, so the dither pass drops its views first
  // and a second call frees nothing twice.
  function egCircleDown(ctx) {
    const mesh = _egMesh, gates = _egGates, gone = new Set([mesh, _egLookMesh, ...gates.map((g) => g.gpu)].filter(Boolean));
    _egMesh = null; _egMeshKey = ''; _egGates = []; _egLookMesh = null; _egLamps = [];
    egOcc.clear(); _egDraw = null;
    for (let i = ctx.dynamicDraws.length - 1; i >= 0; i--) if (gone.has(ctx.dynamicDraws[i]?.gpu)) ctx.dynamicDraws.splice(i, 1);
    ctx.collider.removeBucket(EG_BUCKET);
    for (const g of gates) ctx.collider.removeBucket(`eg:gate:${g.h}`);
    for (const m of gone) { try { renderer?.destroyMesh?.(m); } catch { } }
    return gone.size + ground.down(ctx.dynamicDraws);
  }
  // Call only after the client has left the Spire, never during a swap. It refuses while a circle is loaded because
  // its draws still use these textures.
  function egBandsDown() {
    if (wm.mode === 'dungeon' && isEgHall(wm.dungeonLoc)) return 0;
    let n = egBeatTellDown(renderer);
    ground.release();
    if (!_egBands.size) return n;
    for (const band of _egBands) {
      const arch = egBandArchive(band);
      for (const rec of EG_BAND_RECORDS) { if (renderer?.releaseTexture?.(arch, rec)) n++; if (renderer?.evictEmissionTexture?.(`${arch}_${rec}`)) n++; }
    }
    _egBands.clear(); _egBandRecs.clear();
    return n;
  }
  function egBandUp(c) {
    const band = egBandOfCircle(c);
    if (egBandWhole(band) || !renderer?.uploadTexture) return;
    try { for (const [rec, art] of egBandArt(band)) egBandRec(band, rec, art); } catch (e) { console.warn('[eg] the band\'s art would not upload', e?.message ?? e); }
  }
  function egBandRec(band, rec, art) {
    let up = _egBandRecs.get(band);
    if (!up) _egBandRecs.set(band, (up = new Set()));
    if (up.has(rec) || !renderer?.uploadTexture) return;
    _egBands.add(band); up.add(rec);
    try { renderer.uploadTexture(egBandArchive(band), rec, art.albedo, art.cutout ? { cutout: true } : undefined); renderer.uploadEmissionTexture?.(egBandArchive(band), rec, art.emission, { white: true }); } catch (e) { console.warn('[eg] the band\'s art would not upload', e?.message ?? e); }
  }
  const egBandWhole = (band) => (_egBandRecs.get(band)?.size ?? 0) >= EG_BAND_RECORDS.length;
  function egLookBuild(seed, c, geo) {
    try { const lm = buildEgLookModel(seed, c, geo); return lm && renderer?.createMesh ? renderer.createMesh(lm) : null; } catch (e) { console.warn('[eg] the look would not build', e?.message ?? e); return null; }
  }
  function standEgHall(ctx, eh) {
    const key = `${eh.seed}:${eh.c}:${eh.geo ?? 0}`;
    if (!_egArt && renderer?.uploadTexture) {
      _egArt = true;
      const glow = { white: true };
      try { for (const [rec, art] of realmArt()) { renderer.uploadTexture(SD_REALM_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(SD_REALM_ARCHIVE, rec, art.emission, glow); } } catch (e) { console.warn('[eg] the Spire\'s art would not upload', e?.message ?? e); }
    }
    egBandUp(eh.c);
    // A Brink circle's ruin also uses the band above; for other circles the previous circle shares this band and
    // the call does nothing.
    if (eh.c > 1) egBandUp(eh.c - 1);
    ctx.addTeardown?.(() => egCircleDown(ctx));
    if (_egMeshKey !== key) {
      // Clear the dither pass before destroying the mesh it views.
      egOcc.clear();
      if (_egMesh) { try { renderer?.destroyMesh?.(_egMesh); } catch { } }
      _egMesh = null; _egMeshKey = key;
      try { const model = buildEgCircleModel(eh.seed, eh.c, eh.geo ?? 0); _egMesh = renderer?.createMesh ? renderer.createMesh(model) : null; if (_egMesh) egOcc.set(_egMesh, model); } catch (e) { console.warn('[eg] the circle would not build', e?.message ?? e); _egMesh = null; }
      if (_egLookMesh) { try { renderer?.destroyMesh?.(_egLookMesh); } catch { } }
      _egLookMesh = egLookBuild(eh.seed, eh.c, eh.geo ?? 0);
      _egLamps = egCircleLights(eh.seed, eh.c, eh.geo ?? 0);
    }
    egCircleDraw(ctx);
    for (const d of ground.stand(eh.seed, eh.c, eh.geo ?? 0)) ctx.dynamicDraws.push(d);
    if (_egLookMesh) ctx.dynamicDraws.push({ gpu: _egLookMesh, object: { matrix: identity() }, noShadow: true });
    const tris = egCircleColliderTris(eh.seed, eh.c, eh.geo ?? 0), n = tris.length / 3;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    ctx.collider.addMesh(EG_BUCKET, tris, idx, identity());
    for (const g of _egGates) if (g.gpu) { try { renderer?.destroyMesh?.(g.gpu); } catch { } }
    _egGates = [];
    for (const spec of egCircleSpecs(eh.seed, eh.c, eh.geo ?? 0)) {
      const parts = egGateParts(spec);
      if (parts) egGateStand(ctx, spec.h, parts);
    }
    ctx.addActivationNamer((key) => (typeof key === 'string' && key.startsWith('exit:') ? { title: EG_TEXT.wayHome } : null));
    ctx.addActivationTargets?.(() => host.spoilTargets?.() ?? NO_TARGETS);
    ctx.addActivationNamer((key) => (typeof key === 'string' && key.startsWith('spoil') ? host.spoilName?.(key) ?? null : null));
  }
  function egCircleFrame(eye) {
    egGatesFrame();
    ground.frame(eye, host.deadlandsSeconds?.() ?? 0);
  }
  function egGatesFrame() {
    for (const g of _egGates) {
      const open = !!host.egGateOpen?.(g.h);
      g.T[1] = open ? -400 : 0;
      if (g.draw) g.draw.hidden = open;
    }
  }
  const egSwap = createEgSwap();
  function egGateStand(ctx, h, parts) {
    let gpu = null;
    try { gpu = renderer?.createMesh ? renderer.createMesh(parts.model) : null; } catch { gpu = null; }
    const g = { h, gpu, T: [0, 0, 0], draw: gpu ? { gpu, object: { matrix: identity() } } : null };
    if (g.draw) ctx.dynamicDraws.push(g.draw);
    const gi = new Uint16Array(parts.tris.length / 3);
    for (let i = 0; i < gi.length; i++) gi[i] = i;
    ctx.collider.addMesh(`eg:gate:${h}`, parts.tris, gi, identity(), () => g.T);
    _egGates.push(g);
  }
  function egPrebuild(r) {
    if (wm.mode !== 'dungeon' || !isEgHall(wm.dungeonLoc) || !r || r.b !== wm.dungeonLoc.egBreach || !Number.isSafeInteger(r.c)) return null;
    const band = egBandOfCircle(r.c), st = egSwap.want(r.seed, r.c, r.geo ?? 0, egBandWhole(band) ? -1 : band, r.given, ground.lite);
    if (st === 'ready') egSwapFeed(egSwap.peek(r.seed, r.c, r.geo ?? 0), band, 1);
    return st;
  }
  function egSwapFeed(parts, band, n = Infinity) {
    for (let k = 0; k < n && parts; k++) {
      const a = parts.art?.shift?.();
      if (a) { egBandRec(band, a[0], a[1]); continue; }
      const s = parts.specs?.shift?.();
      if (s) { egSpecGive(s); continue; }
      break;
    }
  }
  function egSwapCircle(r) {
    if (wm.mode !== 'dungeon' || !isEgHall(wm.dungeonLoc) || !wm.dungeonCtx || !r || r.b !== wm.dungeonLoc.egBreach || !Number.isSafeInteger(r.c)) return false;
    const parts = egSwap.take(r.seed, r.c, r.geo ?? 0);
    if (!parts) return false;
    // Feed the remaining band art and hall specs before anything below reads them.
    egSwapFeed(parts, egBandOfCircle(r.c));
    const ctx = wm.dungeonCtx;
    egCircleDown(ctx);
    try { _egMesh = renderer?.createMesh ? renderer.createMesh(parts.model) : null; if (_egMesh) egOcc.set(_egMesh, parts.model); } catch (e) { console.warn('[eg] the circle would not build', e?.message ?? e); _egMesh = null; }
    _egMeshKey = parts.key; _egLamps = parts.lamps;
    egCircleDraw(ctx);
    for (const d of ground.stand(r.seed >>> 0, r.c, (r.geo ?? 0) | 0, parts.ruins ?? null, parts.vista ?? null)) ctx.dynamicDraws.push(d);
    egBandUp(r.c); _egLookMesh = egLookBuild(r.seed >>> 0, r.c, (r.geo ?? 0) | 0);
    if (_egLookMesh) ctx.dynamicDraws.push({ gpu: _egLookMesh, object: { matrix: identity() }, noShadow: true });
    const n = parts.tris.length / 3, idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    ctx.collider.addMesh(EG_BUCKET, parts.tris, idx, identity());
    for (const g of parts.gates) egGateStand(ctx, g.h, g);
    ctx.egRecircle?.({ seed: r.seed >>> 0, c: r.c, geo: r.geo ?? 0 });
    wm.dungeonLoc.egCircle = r.c; wm.dungeonLoc.egGeo = (r.geo ?? 0) | 0;
    return true;
  }

  return {
    standEgHall, egCircleFrame, egPrebuild, egSwapCircle, egBandsDown, egOcc, egSwap,
    lamps: () => _egLamps,
    ground: () => ground.stats(),
  };
}
