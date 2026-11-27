// @ts-check
import { identity } from '../../world/mat4.js';
import { buildKetchShip, buildKetchParts, buildKetchGround, KT_GROUND, KT_CAGE, KT_LODESTONE, KT_LAMP, KT_LID_Y, KT_HOUSE } from '../../world/ketch/ketchModel.js';
import { ketchArt, resolveKetchArt, KT_ARCHIVE, KT_REC } from '../../world/ketch/ketchArt.js';
import { DFPalette } from '../../formats/dfPalette.js';
import { hammerHeadY, hazardState, hazardStrike, sectionPose } from '../../world/ketch/ketchPose.js';
import { packKetchHit } from '../../world/ketch/ketchKit.js';
import { isKetchShip, ketchShipLocation, ketchShipBlocks } from '../../world/ketch/ketchShip.js';
import { ketchHourLight, ketchLightRecord, KT_TRI } from '../../world/ketch/ketchAtmos.js';
import { KT_GROUP, pvsGroupsAt } from '../../world/ketch/ketchStates.js';
import {
  KT_HAMMER, KT_STEAM, KT_ARCS, KT_LIFT, KT_CRADLES, KT_BRIDGE_CRADLES, KT_SOCKETS, KT_RESONATORS, KT_BRIDGE, KT_HOLD, KT_GALLERY, KT_SECTIONS,
  KT_ENGINE, KT_HATCH, KT_HOLD_HATCH, KT_FORK_RING, KT_GANGWAY, KT_WAIST, KT_ANCHOR, KT_COURSE, KT_ARRIVE, liftYAt, deckToDungeon, dungeonToDeck, deckZoneAt, sectionAt,
} from '../../net/ketch/ketchDeck.js';
import { castBackTo, spanAt } from '../../world/sdSteps.js';
import { KT_STAGE } from '../../net/ketch/ketchLaw.js';
import { KW_SECTION_WARN_MS } from '../../net/ketch/ketchWarden.js';
import { MOONLIGHT, moonlightTerm, skyState } from '../../render/enhancedSky.js';
import { skyMinutes } from '../../world/worldTick.js';
import { currentWeather } from '../../weather/weatherSim.js';
import { applyFog } from '../../render/underwaterFog.js';
import { egLightsWith } from '../../world/eliteGates/egHall.js';

export const KT_BUCKET = Object.freeze({ ship: 'kt:ship', cage: 'kt:cage', gateHold: 'kt:gate:hold', gateTop: 'kt:gate:top', grateW: 'kt:grate:watch', grateH: 'kt:grate:hold', doors: 'kt:doors', section: (k) => `kt:sec:${k}` });
export const KT_GONE_Y = -400;
export const KT_LOOSE_MAX = 16;
export const KT_CARRIED_MAX = 8;
export const KT_CLOUDS = Object.freeze({ n: 34, half: 900, below: Object.freeze([-200, -60]), above: Object.freeze([70, 160]), size: Object.freeze([60, 130]), drift: 2.4, seed: 0x6b40 });
export const KT_STEAM_PUFFS = Object.freeze({ n: 7, size: 1.7, rise: 1.6 });
export const KT_GLOWS = Object.freeze({
  cell: Object.freeze({ color: Object.freeze([0.5, 0.85, 1.0]), range: 4 }),
  resTrue: Object.freeze({ color: Object.freeze([0.55, 0.9, 1.0]), range: 9 }),
  resFalse: Object.freeze({ color: Object.freeze([1.0, 0.4, 0.15]), range: 9 }),
  arc: Object.freeze({ color: Object.freeze([0.6, 0.9, 1.0]), range: 12 }),
  engine: Object.freeze({ color: Object.freeze([0.5, 0.85, 1.0]), range: 14 }),
  fork: Object.freeze({ color: Object.freeze([0.55, 0.9, 1.0]), range: 6 }),
});

const NONE = Object.freeze([]);
export const KT_HALO = Object.freeze({ lamp: Object.freeze({ size: 0.9, k: 0.35 }), glow: Object.freeze({ size: 0.09, min: 0.4, max: 1.4, k: 0.45 }) });
/**
 * @param {any[]} out
 * @param {ArrayLike<any>} lights
 */
export function ketchHalosInto(out, lights) {
  const H = KT_HALO;
  let n = 0;
  for (let i = 0; i < lights.length; i++) {
    const L = lights[i], h = out[n] ?? (out[n] = { at: [0, 0, 0], size: 0, color: [0, 0, 0] }), glow = !!L.carried, k = glow ? H.glow.k : H.lamp.k;
    h.at[0] = L.x; h.at[1] = L.y; h.at[2] = L.z;
    h.size = glow ? Math.max(H.glow.min, Math.min(H.glow.max, H.glow.size * L.range)) : H.lamp.size;
    const c = glow || !L.zone ? null : L.zone === 'deck' ? KT_LAMP.color : KT_LAMP.below;
    for (let j = 0; j < 3; j++) h.color[j] = (c ? Math.min(L.color[j], c[j]) : L.color[j]) * k;
    n++;
  }
  out.length = n;
  return out;
}
export const KT_DOOR_SLIDE = 1.8;
export const KT_SHAFT_DOOR_H = 3.4;
export const KT_LEAF_TURN = 1.62;
const translate = (out, x, y, z) => { out.fill(0); out[0] = out[5] = out[10] = out[15] = 1; out[12] = x; out[13] = y; out[14] = z; return out; };
const yawAbout = (out, yw, x, y, z) => { const c = Math.cos(yw), s = Math.sin(yw); out.fill(0); out[0] = c; out[2] = -s; out[5] = 1; out[8] = s; out[10] = c; out[15] = 1; out[12] = x; out[13] = y; out[14] = z; return out; };
function hingeZ(out, a, hx, hy, ox, oy, oz) {
  const c = Math.cos(a), s = Math.sin(a);
  out.fill(0);
  out[0] = c; out[1] = s; out[4] = -s; out[5] = c; out[10] = 1; out[15] = 1;
  out[12] = ox + hx - (c * hx - s * hy); out[13] = oy + hy - (s * hx + c * hy); out[14] = oz;
  return out;
}
// Nets and vanes upload as cutouts; uploaded without the flag, a net draws as a solid wall.
export const KT_CUTOUT_RECS = /** @type {ReadonlyArray<number>} */ (Object.freeze([KT_REC.net, KT_REC.vane]));
let _artUp = null, _artPal = null, _art = null;
export function ensureKetchArt(renderer, rgb = null) {
  if (!renderer?.uploadTexture || (_artUp === renderer && (rgb == null || rgb === _artPal))) return;
  // The renderer cache returns the picture it already holds for a key, so release the old textures before uploading
  // again.
  const again = _artUp === renderer;
  for (const [rec, raw] of (_art ??= ketchArt())) {
    const art = resolveKetchArt(raw, rgb);
    if (again) { renderer.releaseTexture?.(KT_ARCHIVE, rec); renderer.evictEmissionTexture?.(`${KT_ARCHIVE}_${rec}`); }
    renderer.uploadTexture(KT_ARCHIVE, rec, art.albedo, ...(KT_CUTOUT_RECS.includes(rec) ? [{ cutout: true }] : []));
    renderer.uploadEmissionTexture?.(KT_ARCHIVE, rec, art.emission, { white: true });
  }
  _artUp = renderer; _artPal = rgb;
}
let _palette = null;
export function ketchPaletteRgb(getBytes = (name) => import('../../scenes/dataSource.js').then((m) => m.getBytes(name))) {
  _palette ??= (async () => {
    try { const pal = new DFPalette(); if (!pal.load(await getBytes('ART_PAL.COL'), 'ART_PAL.COL')) return null; const h = pal.headerLength; return pal.paletteBuffer.slice(h, h + 768); } catch { return null; }
  })();
  return _palette;
}
export function ketchArtUp(renderer, palette = true) {
  if (!renderer?.uploadTexture) return;
  ensureKetchArt(renderer);
  if (palette) ketchPaletteRgb().then((rgb) => { if (rgb) ensureKetchArt(renderer, rgb); }, () => {});
}

// Both gates stay shut while the lift is dead, so a carrier never steps onto the idle cage and off the hold floor.
export const ketchShaftGates = (cageY, runs) => ({ hold: !!runs && cageY <= KT_LIFT.y0 + 0.05, top: !!runs && cageY >= KT_LIFT.y1 - 0.05 });


/** @param {{ renderer?: any, palette?: boolean }} [deps] */
export function createKetchDeck({ renderer = null, palette = true } = {}) {
  const O = deckToDungeon(0, 0, 0);
  const meshes = [];
  const make = (model) => { if (!model || !renderer?.createMesh) return null; try { const m = renderer.createMesh(model); meshes.push(m); return m; } catch (e) { console.warn('[kt] the Ketch would not build', e?.message ?? e); return null; } };
  let draws = null, collider = null, ship = null, parts = null;
  const D = { hammers: [], cage: null, gateHold: null, gateTop: null, grateW: [], grateH: [], doors: [], sections: [], resTrue: [], resFalse: [], cradle: [], bcradle: [], socket: [], loose: [], carried: [], forks: [], arcs: [], line: null, lodestone: null };
  // Bucket translations are in the dungeon frame: parts built about the deck origin add `O`, while sections are
  // already in the dungeon frame and carry only their drop.
  const T = { cage: [...O], gateHold: [...O], gateTop: [...O], grateW: [...O], grateH: [...O], doors: [...O], sections: Array.from({ length: KT_SECTIONS }, () => [0, 0, 0]) };
  const move = (t3, dy) => { t3[0] = O[0]; t3[1] = O[1] + dy; t3[2] = O[2]; };
  let cageY = /** @type {number} */ (KT_LIFT.y0), cageWas = /** @type {number} */ (KT_LIFT.y0);
  // Scratch reused every frame so the pose and light paths allocate nothing.
  const _gain = { deck: 1, below: 1, cabin: 1 };
  const lamps = () => (ship ??= buildKetchShip()).lights;
  const _glows = [], _lights = [], _near = [], _glowPool = [], _hz = { live: false, warn: false, k: 0 }, _sp = { solid: true, dy: 0, shake: 0, hidden: false };
  const _resOf = Array.from({ length: KT_SECTIONS }, (_, k) => KT_RESONATORS.findIndex(([x, z]) => sectionAt(x, z) === k));
  let clouds = null, steam = null;
  const cloudSeeds = (() => { let s = KT_CLOUDS.seed >>> 0; const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return Array.from({ length: KT_CLOUDS.n }, (_, k) => ({ x: r() * 2 - 1, z: r() * 2 - 1, y: k % 3 === 0 ? KT_CLOUDS.above[0] + r() * (KT_CLOUDS.above[1] - KT_CLOUDS.above[0]) : KT_CLOUDS.below[0] + r() * (KT_CLOUDS.below[1] - KT_CLOUDS.below[0]), s: KT_CLOUDS.size[0] + r() * (KT_CLOUDS.size[1] - KT_CLOUDS.size[0]) })); })();
  const _cloudCentres = cloudSeeds.map(() => [0, 0, 0]);
  const _steamCentres = Array.from({ length: KT_STEAM.z.length * KT_STEAM_PUFFS.n }, () => [0, KT_GONE_Y, 0]);
  const _grouped = [], _seen = new Set(), _eyeDeck = [0, 0, 0];
  let _view = /** @type {string | null} */ (null), _eyed = false;

  // Returns a record even when the mesh failed to build, so `pose` can write its matrix without a null check.
  const draw = (gpu, o = {}) => {
    if (!draws) return null;
    const d = { gpu, object: { matrix: identity() }, hidden: !gpu, noShadow: !!o.noShadow, texRemap: null };
    if (gpu) draws.push(d);
    if (o.group) { d.group = o.group; d.culled = false; _grouped.push(d); }
    return d;
  };
  const hide = (d) => { if (d && !d.hidden) { d.hidden = true; d.object.matrix.fill(0); } };
  const bucket = (key, p, t) => { if (!collider || !p?.hit?.length) return; const { positions, indices } = packKetchHit(p.hit); try { collider.addMesh(key, positions, indices, identity(), t ? () => t : undefined); } catch (e) { console.warn('[kt] a collider', key, e?.message ?? e); } };
  const at = (out, x, y, z) => translate(out, O[0] + x, O[1] + y, O[2] + z);
  const leaves = (pair, H, open) => {
    if (!open) { at(pair[0].object.matrix, 0, 0, 0); at(pair[1].object.matrix, 0, 0, 0); return; }
    hingeZ(pair[0].object.matrix, KT_LEAF_TURN, H.x0 - 0.05, H.y0, O[0], O[1], O[2]);
    hingeZ(pair[1].object.matrix, -KT_LEAF_TURN, H.x1 + 0.05, H.y0, O[0], O[1], O[2]);
  };

  return {
    stand({ dynamicDraws, collider: c = null }) {
      if (draws) return false;
      draws = dynamicDraws; collider = c;
      ketchArtUp(renderer, palette);
      ship ??= buildKetchShip();
      parts ??= buildKetchParts();
      draw(make(ship.model));
      draw(make(ship.lamps), { noShadow: true });
      draw(make(buildKetchGround()), { noShadow: true });
      if (collider) { const { positions, indices } = packKetchHit(ship.hit); try { collider.addMesh(KT_BUCKET.ship, positions, indices, identity()); } catch (e) { console.warn('[kt] the ship\'s collider', e?.message ?? e); } }
      const P = parts, g = (p) => make(p.model);
      const hammer = g(P.hammer);
      for (let ri = 0; ri < KT_HAMMER.rows.length; ri++) for (let li = 0; li < KT_HAMMER.lanes.length; li++) D.hammers.push({ ri, li, d: draw(hammer, { noShadow: true, group: KT_GROUP.gundeck }) });
      D.cage = draw(g(P.cage), { noShadow: true }); bucket(KT_BUCKET.cage, P.cage, T.cage);
      D.gateHold = draw(g(P.gateHold), { noShadow: true, group: KT_GROUP.hold }); bucket(KT_BUCKET.gateHold, P.gateHold, T.gateHold);
      D.gateTop = draw(g(P.gateTop), { noShadow: true, group: KT_GROUP.aloft }); bucket(KT_BUCKET.gateTop, P.gateTop, T.gateTop);
      // Hatch leaves get no PVS group because a shut leaf is both a ceiling below and a floor above.
      for (const [dk, pk, bk, group] of [['grateW', 'grateWatch', 'grateW', null], ['grateH', 'grateHold', 'grateH', null], ['doors', 'doors', 'doors', KT_GROUP.bridge]]) {
        D[dk] = [draw(g(P[pk].left), { noShadow: true, group }), draw(g(P[pk].right), { noShadow: true, group })];
        bucket(KT_BUCKET[bk], P[pk], T[bk]);
      }
      P.sections.forEach((s, k) => { D.sections.push(draw(g(s), { group: KT_GROUP.bridge })); bucket(KT_BUCKET.section(k), s, T.sections[k]); });
      const rt = g(P.resonator.true), rf = g(P.resonator.false), cell = g(P.cell), fork = g(P.fork);
      for (let k = 0; k < KT_RESONATORS.length; k++) { D.resTrue.push(draw(rt, { noShadow: true, group: KT_GROUP.bridge })); D.resFalse.push(draw(rf, { noShadow: true, group: KT_GROUP.bridge })); }
      for (let k = 0; k < KT_CRADLES.length; k++) D.cradle.push(draw(cell, { noShadow: true, group: KT_GROUP.hold }));
      for (let k = 0; k < KT_BRIDGE_CRADLES.length; k++) D.bcradle.push(draw(cell, { noShadow: true, group: KT_GROUP.bridge }));
      for (let k = 0; k < KT_SOCKETS.length; k++) D.socket.push(draw(cell, { noShadow: true, group: KT_GROUP.hold }));
      for (let k = 0; k < KT_LOOSE_MAX; k++) D.loose.push(draw(cell, { noShadow: true }));
      for (let k = 0; k < KT_CARRIED_MAX; k++) D.carried.push(draw(cell, { noShadow: true }));
      for (let k = 0; k < 7; k++) D.forks.push(draw(fork, { noShadow: true, group: KT_GROUP.bridge }));
      const arcs = P.arc.map((a) => g(a));
      for (let j = 0; j < KT_ARCS.z.length; j++) D.arcs.push({ d: draw(arcs[0], { noShadow: true, group: KT_GROUP.hold }), meshes: arcs });
      D.line = draw(g(P.line), { noShadow: true });
      D.lodestone = draw(g(P.lodestone), { noShadow: true, group: KT_GROUP.bridge });
      for (const d of [...D.resFalse, ...D.cradle, ...D.bcradle, ...D.socket, ...D.loose, ...D.carried, ...D.forks, ...D.arcs.map((a) => a.d), D.line]) hide(d);
      if (renderer?.createBillboardBatch) {
        try {
          clouds = renderer.createBillboardBatch(KT_ARCHIVE, KT_REC.cloud, { w: 1, h: 1 }, _cloudCentres, { dynamic: true, scales: cloudSeeds.map((c) => c.s) });
          if (clouds) clouds.noShadow = true;
          steam = renderer.createBillboardBatch(KT_ARCHIVE, KT_REC.steam, { w: KT_STEAM_PUFFS.size, h: KT_STEAM_PUFFS.size }, _steamCentres, { dynamic: true });
          if (steam) steam.noShadow = true;
        } catch (e) { console.warn('[kt] the clouds', e?.message ?? e); clouds = null; steam = null; }
      }
      return true;
    },
    pose(V, t, now, body = null, carried = NONE, eye = body?.pos ?? null) {
      if (!draws) return;
      _eyed = !!eye;
      if (eye) { _eyeDeck[0] = eye[0] - O[0]; _eyeDeck[1] = eye[1] - O[1]; _eyeDeck[2] = eye[2] - O[2]; _view = pvsGroupsAt(_eyeDeck, _view, _seen); }
      for (const d of _grouped) d.culled = _eyed && !_seen.has(d.group);
      const sg = V?.sg ?? KT_STAGE.watch, cl = V?.cl ?? null, ws = V?.ws ?? null;
      for (const h of D.hammers) at(h.d.object.matrix, KT_HAMMER.lanes[h.li], hammerHeadY(h.ri, h.li, t), KT_HAMMER.rows[h.ri]);
      cageWas = cageY;
      cageY = liftYAt(t, sg >= KT_STAGE.sailwalk);
      at(D.cage.object.matrix, KT_LIFT.x, cageY, KT_LIFT.z);
      T.cage[0] = O[0] + KT_LIFT.x; T.cage[1] = O[1] + cageY; T.cage[2] = O[2] + KT_LIFT.z;
      const dy = cageY - cageWas;
      if (dy && body?.grounded && body.groundKey === KT_BUCKET.cage) body.carryBy?.(0, dy, 0);
      const gates = ketchShaftGates(cageY, sg >= KT_STAGE.sailwalk), atFoot = gates.hold, atTop = gates.top;
      move(T.gateHold, atFoot ? KT_GONE_Y : 0); at(D.gateHold.object.matrix, 0, atFoot ? KT_SHAFT_DOOR_H : 0, 0);
      move(T.gateTop, atTop ? KT_GONE_Y : 0); at(D.gateTop.object.matrix, 0, atTop ? -1.4 : 0, 0);
      const openW = sg >= KT_STAGE.gallery, openH = sg >= KT_STAGE.engine;
      move(T.grateW, openW ? KT_GONE_Y : 0);
      move(T.grateH, openH ? KT_GONE_Y : 0);
      leaves(D.grateW, KT_HATCH, openW);
      leaves(D.grateH, KT_HOLD_HATCH, openH);
      const openC = sg >= KT_STAGE.vault;
      move(T.doors, openC ? KT_GONE_Y : 0);
      at(D.doors[0].object.matrix, openC ? -KT_DOOR_SLIDE : 0, 0, 0);
      at(D.doors[1].object.matrix, openC ? KT_DOOR_SLIDE : 0, 0, 0);
      const sec = ws?.sec ?? NONE;
      for (let k = 0; k < KT_SECTIONS; k++) {
        const p = sectionPose(k, sec, now, KW_SECTION_WARN_MS, _sp), d = D.sections[k];
        T.sections[k][1] = p.solid ? 0 : KT_GONE_Y;
        if (p.hidden) hide(d); else { d.hidden = false; translate(d.object.matrix, p.shake, p.dy, p.shake * 0.7); }
        d.noShadow = !(p.solid && p.dy === 0 && p.shake === 0);
        const ri = _resOf[k];
        if (ri >= 0) {
          const [x, z] = KT_RESONATORS[ri], ok = !ws || ws.ph !== 2 || ws.rs?.[ri] === 1, spin = t * (ok ? 0.8 : 2.4);
          const on = ok ? D.resTrue[ri] : D.resFalse[ri], off = ok ? D.resFalse[ri] : D.resTrue[ri];
          hide(off);
          if (p.hidden) hide(on); else { on.hidden = false; yawAbout(on.object.matrix, spin, O[0] + x + p.shake, O[1] + KT_BRIDGE.y + 4.6 + p.dy + 0.15 * Math.sin(t * 1.7 + ri), O[2] + z); }
        }
      }
      for (let j = 0; j < D.cradle.length; j++) { const ready = sg === KT_STAGE.engine && cl?.cr?.[j] === 1; if (ready) { D.cradle[j].hidden = false; at(D.cradle[j].object.matrix, KT_CRADLES[j][0], KT_HOLD.y + 0.75, KT_CRADLES[j][1]); } else hide(D.cradle[j]); }
      for (let j = 0; j < D.bcradle.length; j++) { const ready = !!ws && ws.ph === 2 && !!ws.ward && cl?.br?.[j] === 1; if (ready) { D.bcradle[j].hidden = false; at(D.bcradle[j].object.matrix, KT_BRIDGE_CRADLES[j][0], KT_BRIDGE.y + 0.75, KT_BRIDGE_CRADLES[j][1]); } else hide(D.bcradle[j]); }
      for (let j = 0; j < D.socket.length; j++) { const fed = (cl?.sk?.[j] ?? 0) === 1 || sg > KT_STAGE.engine; if (fed) { D.socket[j].hidden = false; at(D.socket[j].object.matrix, KT_SOCKETS[j][0], KT_HOLD.y + 1.0, KT_SOCKETS[j][1]); } else hide(D.socket[j]); }
      const lo = cl?.lo ?? NONE;
      for (let j = 0; j < D.loose.length; j++) { const l = lo[j]; if (l) { D.loose[j].hidden = false; yawAbout(D.loose[j].object.matrix, l[0] * 1.3, O[0] + l[1], O[1] + l[2] + 0.02, O[2] + l[3]); } else hide(D.loose[j]); }
      for (let j = 0; j < D.carried.length; j++) { const p = carried[j]; if (p) { D.carried[j].hidden = false; translate(D.carried[j].object.matrix, p[0], p[1], p[2]); } else hide(D.carried[j]); }
      const fk = ws?.fk ?? null;
      for (let j = 0; j < D.forks.length; j++) { const q = fk?.c?.[j]; if (q && (q[2] ?? 1) > 0) { D.forks[j].hidden = false; at(D.forks[j].object.matrix, q[0], KT_BRIDGE.y, q[1]); } else hide(D.forks[j]); }
      for (let j = 0; j < D.arcs.length; j++) {
        const s = hazardState('arc', j, t, _hz), a = D.arcs[j];
        if (!s.live) { hide(a.d); continue; }
        const n = a.meshes.length, k = hazardStrike('arc', j, t) + j;
        a.d.gpu = a.meshes[((k % n) + n) % n] ?? a.d.gpu;
        a.d.hidden = false; at(a.d.object.matrix, 0, KT_HOLD.y + 4.4, KT_ARCS.z[j]);
      }
      if (sg >= KT_STAGE.bridge) { D.line.hidden = false; translate(D.line.object.matrix, 0, 0, 0); } else hide(D.line);
      yawAbout(D.lodestone.object.matrix, t * KT_LODESTONE.spin, O[0] + KT_LODESTONE.x, O[1] + KT_LODESTONE.y, O[2] + KT_LODESTONE.z);
      if (clouds) {
        for (let k = 0; k < cloudSeeds.length; k++) {
          const c = cloudSeeds[k], H = KT_CLOUDS.half, x = ((((c.x * H + t * KT_CLOUDS.drift) % (2 * H)) + 3 * H) % (2 * H)) - H;
          _cloudCentres[k][0] = O[0] + x; _cloudCentres[k][1] = O[1] + c.y; _cloudCentres[k][2] = O[2] + 110 + c.z * H;
        }
        renderer.moveBillboardBatch?.(clouds, _cloudCentres);
      }
      if (steam) {
        let i = 0;
        for (let j = 0; j < KT_STEAM.z.length; j++) {
          const s = hazardState('steam', j, t, _hz);
          for (let k = 0; k < KT_STEAM_PUFFS.n; k++, i++) {
            const c = _steamCentres[i];
            if (!s.live && !(s.warn && k < 2)) { c[0] = O[0]; c[1] = O[1] + KT_GONE_Y; c[2] = O[2]; continue; }
            const ph = (t * 1.3 + k * 0.37) % 1, x = KT_GALLERY.x0 + 0.6 + ((k + 0.5) / KT_STEAM_PUFFS.n) * (KT_GALLERY.x1 - KT_GALLERY.x0 - 1.2);
            c[0] = O[0] + x + 0.4 * Math.sin(k * 3.1 + t); c[1] = O[1] + KT_GALLERY.y + 0.2 + ph * KT_STEAM_PUFFS.rise * (s.live ? 2 : 0.6); c[2] = O[2] + KT_STEAM.z[j] + 0.5 * Math.sin(k * 1.7 + t * 2);
          }
        }
        renderer.moveBillboardBatch?.(steam, _steamCentres);
      }
      _glows.length = 0;
      const glow = (x, y, z, G, k = 1) => {
        const g = _glowPool[_glows.length] ?? (_glowPool[_glows.length] = { x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0], carried: true });
        g.x = O[0] + x; g.y = O[1] + y; g.z = O[2] + z; g.range = G.range; g.color[0] = G.color[0] * k; g.color[1] = G.color[1] * k; g.color[2] = G.color[2] * k;
        _glows.push(g);
      };
      if (sg >= KT_STAGE.engine) glow(KT_ENGINE.x, KT_HOLD.y + KT_ENGINE.h + 0.6, KT_ENGINE.z, KT_GLOWS.engine, sg > KT_STAGE.engine ? 1 : 0.25 + 0.75 * ((cl?.bk ?? 0) / Math.max(1, cl?.nd ?? 1)));
      for (let j = 0; j < D.arcs.length; j++) { const s = hazardState('arc', j, t, _hz); if (s.live || s.warn) glow(0, KT_HOLD.y + 4.4, KT_ARCS.z[j], KT_GLOWS.arc, s.live ? 1 : 0.3 * s.k); }
      for (let j = 0; j < D.cradle.length; j++) if (!D.cradle[j].hidden) glow(KT_CRADLES[j][0], KT_HOLD.y + 1.2, KT_CRADLES[j][1], KT_GLOWS.cell);
      for (let j = 0; j < KT_RESONATORS.length; j++) { const d = D.resTrue[j].hidden ? D.resFalse[j] : D.resTrue[j]; if (!d.hidden) glow(KT_RESONATORS[j][0], KT_BRIDGE.y + 4.6, KT_RESONATORS[j][1], d === D.resTrue[j] ? KT_GLOWS.resTrue : KT_GLOWS.resFalse); }
      for (let j = 0; j < D.forks.length; j++) if (!D.forks[j].hidden) { const q = fk.c[j]; glow(q[0], KT_BRIDGE.y + 2.2, q[1], KT_GLOWS.fork); }
    },
    // Returns a shared list rewritten on the next call; read it, never hold on to it.
    lightsNear(eye, cap = 16) {
      _lights.length = 0;
      for (const l of _glows) _lights.push(l);
      for (const l of lamps()) _lights.push(l);
      if (eye) {
        for (const l of _lights) l._near = Math.hypot(l.x - eye[0], l.y - eye[1], l.z - eye[2]) - l.range;
        for (let i = 1; i < _lights.length; i++) { const l = _lights[i]; let j = i - 1; while (j >= 0 && _lights[j]._near > l._near) { _lights[j + 1] = _lights[j]; j--; } _lights[j + 1] = l; }
      }
      _near.length = 0;
      for (let i = 0; i < _lights.length && i < cap; i++) _near.push(_lights[i]);
      return _near;
    },
    lampGain(g, zone = 'deck') {
      if (_gain[zone] === g) return;
      _gain[zone] = g;
      for (const l of lamps()) if (l.zone === zone) { const c = zone === 'deck' ? KT_LAMP.color : KT_LAMP.below; for (let k = 0; k < 3; k++) l.color[k] = c[k] * g; }
    },
    sees: (g) => !_eyed || _seen.has(g),
    view: () => (_eyed ? _view : null),
    billboards() { return [clouds, steam].filter(Boolean); },
    cageY: () => cageY,
    colliderTris() {
      const out = [...(ship ?? buildKetchShip()).hit];
      const add = (p, t) => { const h = p?.hit ?? NONE; for (let i = 0; i + 2 < h.length; i += 3) out.push(h[i] + t[0], h[i + 1] + t[1], h[i + 2] + t[2]); };
      if (parts) {
        add(parts.cage, T.cage); add(parts.gateHold, T.gateHold); add(parts.gateTop, T.gateTop);
        add(parts.grateWatch, T.grateW); add(parts.grateHold, T.grateH); add(parts.doors, T.doors);
        parts.sections.forEach((sp, k) => add(sp, T.sections[k]));
      }
      return new Float32Array(out);
    },
    clear() {
      if (collider) for (const k of [KT_BUCKET.ship, KT_BUCKET.cage, KT_BUCKET.gateHold, KT_BUCKET.gateTop, KT_BUCKET.grateW, KT_BUCKET.grateH, KT_BUCKET.doors, ...Array.from({ length: KT_SECTIONS }, (_, k) => KT_BUCKET.section(k))]) { try { collider.removeBucket?.(k); } catch { } }
      for (const m of meshes) { try { renderer?.destroyMesh?.(m); } catch { } }
      for (const b of [clouds, steam]) if (b) { try { renderer?.destroyBillboardBatch?.(b); } catch { } }
      meshes.length = 0; clouds = null; steam = null;
      for (const k of Object.keys(D)) { const v = D[k]; if (Array.isArray(v)) v.length = 0; else D[k] = null; }
      _grouped.length = 0; _seen.clear(); _view = null; _eyed = false;
      draws = null; collider = null;
    },
  };
}

const _O = deckToDungeon(0, 0, 0), _lookAt = [0, 0, 0], _foot = ketchLightRecord();
const _look = Object.assign(ketchLightRecord(), { clear: [0, 0, 0, 1], below: false, zone: 'deck' });
export function ketchSkyFoot(minute, out = [0, 0, 0]) {
  const c = ketchHourLight(minute, 'deck', _foot).fog.color;
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  return out;
}
/**
 * @param {ArrayLike<number> | null} eye
 * @param {number} minute
 * @param {boolean} [lane]
 * @param {{ dir: ArrayLike<number>, scale: number } | null} [moon]
 */
export function ketchFrameLook(eye, minute, lane = false, moon = null) {
  const p = _lookAt;
  if (eye) { p[0] = eye[0] - _O[0]; p[1] = eye[1] - _O[1]; p[2] = eye[2] - _O[2]; } else { p[0] = 0; p[1] = 2; p[2] = 0; }
  const at = deckZoneAt(p[0], p[1] - 1.6, p[2]);
  const feetY = p[1] - 1.6, inHull = Math.abs(p[0]) <= KT_HOLD.x1 && p[2] >= KT_HOLD.z0 - 2 && p[2] <= KT_HOLD.z1 + 2;
  const below = at === 'gallery' || at === 'landing' || at === 'hold' || (at === 'lift' && p[1] < -1) || (inHull && feetY < -0.3);
  const zone = below ? 'below' : at === 'cabin' ? 'cabin' : 'deck';
  const L = ketchHourLight(minute, zone, _look);
  L.below = below; L.zone = zone;
  if (!lane) {
    const k = L.classic.light;
    for (let i = 0; i < 3; i++) { L.ambient[i] *= k; L.tri.sky[i] *= k; L.tri.equator[i] *= k; L.tri.ground[i] *= k; }
    L.sunScale *= k; L.key.scale *= k; L.lamps *= L.classic.lamps;
  }
  const m = moon && moon.scale > 0 ? Math.min(1, moon.scale / MOONLIGHT.masser) : 0, k0 = L.key.scale;
  L.key.scale *= m;
  for (let i = 0; i < 3; i++) L.tri.ground[i] = Math.max(0, L.tri.ground[i] - L.key.color[i] * k0 * (1 - m) * KT_TRI.bounce);
  if (m > 0) { L.key.dir[0] = moon.dir[0]; L.key.dir[1] = moon.dir[1]; L.key.dir[2] = moon.dir[2]; }
  L.clear[0] = L.fog.color[0]; L.clear[1] = L.fog.color[1]; L.clear[2] = L.fog.color[2];
  return L;
}
let _moonAt = NaN, _moon = null;
export function ketchMoonNow(sky = skyMinutes(), weather = currentWeather()) {
  const m = Math.floor(sky);
  if (m !== _moonAt) { _moonAt = m; _moon = moonlightTerm(skyState({ minuteOfDay: ((m % 1440) + 1440) % 1440, weather, classicMinutes: m, skyMinutes: m })); }
  return _moon;
}
// The lane resets its scene grade on any frame this is not called, so call it every frame aboard.
export function ketchApplyLook(renderer, L, fogInto = null) {
  renderer.setLighting?.(L.tri.equator, L.sunScale, L.sunColor, L.tri);
  renderer.setMoonlight?.(L.key.scale > 0 ? L.key : null);
  applyFog(renderer, L.fog, fogInto);
  if (renderer.lightingLane) renderer.setSceneGrade?.(L.grade);
}

// `KT_LID_Y` is a collider-only ceiling, invisible from above, so a body standing on it is cast back; the lift
// shaft is excluded because the cage rides through it.
export function ketchOnLid(x, y, z) {
  if (!(y > KT_LID_Y - 0.3 && y < KT_LID_Y + 0.6)) return false;
  if (Math.abs(x - KT_LIFT.x) <= KT_LIFT.half + 0.5 && Math.abs(z - KT_LIFT.z) <= KT_LIFT.half + 0.5) return false;
  const W = KT_WAIST, A = KT_ANCHOR;
  return (x >= W.x0 && x <= W.x1 && z >= W.z0 && z <= W.z1) || (x >= A.x0 && x <= A.x1 && z >= A.z0 && z <= A.z1);
}

export function ketchOnRoof(x, y, z) {
  return Math.abs(x) <= KT_HOUSE.x + 0.4 && z >= KT_HOUSE.z0 - 0.4 && z <= KT_HOUSE.z1 + 0.4 && y >= KT_HOUSE.eave - 0.3 && y <= KT_HOUSE.ridge + 0.6;
}
export const ketchSkyLanding = (safe, zone) => (safe && zone === 'sailwalk' ? castBackTo(spanAt(safe[2], KT_COURSE), KT_COURSE) : safe ? [...safe] : [KT_ARRIVE.x, KT_ARRIVE.y, KT_ARRIVE.z]);

export function createKetchDeckHost({ renderer, host, wm, moon = ketchMoonNow }) {
  let deck = null, deckCtx = null;
  const onShip = () => wm.mode === 'dungeon' && isKetchShip(wm.dungeonLoc);
  const K = () => host.ketch?.() ?? null;
  for (const [gate, kt] of [['gateBoss', 'boss'], ['onBossHit', 'bossHit'], ['gateCrystals', 'forks'], ['onCrystalHit', 'forkHit'], ['gateHost', 'hostTargets'], ['onHostHit', 'hostHit']]) {
    const own = host[gate];
    host[gate] = (...a) => (onShip() ? K()?.[kt]?.(...a) ?? null : own?.(...a) ?? null);
  }
  { const own = host.extraBillboards; host.extraBillboards = () => { const b = own?.() ?? []; return onShip() ? [...b, ...(deck?.billboards() ?? NONE), ...(K()?.batches?.() ?? NONE)] : b; }; }
  { const own = host.sdCastBack; host.sdCastBack = (...a) => (onShip() ? castBack() : own?.(...a)); }
  let safe = null, safeZone = null;
  function castBack(own = false) {
    const at = safe && safeZone !== 'sailwalk' && safeZone !== 'top' ? safe : own ? ketchSkyLanding(safe, safeZone) : null;
    if (at) wm.place(deckToDungeon(at[0], at[1] + 0.2, at[2]));
    K()?.castBack?.();
  }
  function noteGround(body) {
    if (!body?.grounded || !body.pos) return;
    const p = dungeonToDeck(body.pos[0], body.pos[1], body.pos[2]), z = deckZoneAt(p[0], p[1], p[2]);
    if (!z || z === 'lift') return;
    if (z === 'bridge') { const k = sectionAt(p[0], p[2]); if (k >= 0) { safe = [KT_BRIDGE.x + (p[0] - KT_BRIDGE.x) * 0.55, KT_BRIDGE.y, KT_BRIDGE.z + (p[2] - KT_BRIDGE.z) * 0.55]; safeZone = z; return; } }
    if (z === 'gangway') { safe = [KT_GANGWAY.bx, 0, KT_GANGWAY.bz]; safeZone = z; return; }
    safe = p; safeZone = z;
  }
  const _extra = [], _fogInto = new Float32Array(3), _halos = [];
  return {
    stand(ctx) {
      deck = createKetchDeck({ renderer });
      deck.stand({ dynamicDraws: ctx.dynamicDraws, collider: ctx.collider });
      deckCtx = ctx;
      safe = null; safeZone = null;
      const ride = ctx.sdStepsRide?.bind(ctx);
      ctx.sdStepsRide = (dt, body, live = true) => {
        const k = K(), now = k?.now?.() ?? Date.now(), t = k?.clock?.() ?? now / 1000;
        deck?.pose(k?.voyage?.() ?? null, t, now, body, k?.carried?.() ?? NONE);
        const p = live && body?.grounded && body.pos ? dungeonToDeck(body.pos[0], body.pos[1], body.pos[2]) : null;
        if (p && (ketchOnLid(p[0], p[1], p[2]) || ketchOnRoof(p[0], p[1], p[2]))) castBack(true);
        else if (live) noteGround(body);
        return ride ? ride(dt, body, live) : null;
      };
      ctx.addActivationTargets?.(() => K()?.targets?.() ?? NONE);
      ctx.addActivationNamer?.((key) => (typeof key === 'string' && key.startsWith('kt:') ? K()?.name?.(key) ?? null : null));
      ctx.addActivationTargets?.(() => host.spoilTargets?.() ?? NONE);
      ctx.addActivationNamer?.((key) => ((typeof key === 'string' && key.startsWith('spoil')) ? host.spoilName?.(key) ?? null : null));
      ctx.addTeardown?.(() => { if (deckCtx === ctx) { deck?.clear(); deck = null; deckCtx = null; } });
    },
    frameLook(eye, lit, minute) {
      const L = ketchFrameLook(eye, minute, !!renderer?.lightingLane, moon());
      ketchApplyLook(renderer, L, _fogInto);
      deck?.lampGain(L.lamps, L.zone);
      _extra.length = 0;
      for (const l of K()?.lights?.() ?? NONE) _extra.push(l);
      const lamps = deck?.lightsNear(eye, 24) ?? NONE;
      K()?.halos?.(renderer?.lightingLane ? NONE : ketchHalosInto(_halos, lamps));
      if (lit) { const w = egLightsWith(lit, _extra, lamps, eye); renderer.setPointLights?.(w.data, null, w.colors); }
      return L;
    },
    look: (eye, minute, lane) => ketchFrameLook(eye, minute, lane),
    lights: (eye, cap) => deck?.lightsNear(eye, cap) ?? NONE,
    onShip,
    deck: () => deck,
    safe: () => (safe ? { at: [...safe], zone: safeZone } : null),
  };
}
export function ketchShipHit(r, blocks) {
  if (!r || !Number.isSafeInteger(r.n) || typeof r.owner !== 'string') return null;
  const site = r.site ?? null;
  const dfLocation = ketchShipLocation({ n: r.n, owner: r.owner, regionIndex: site?.regionIndex ?? 17, regionName: site?.regionName || 'Daggerfall', climate: site?.climate ?? undefined });
  if (!dfLocation.ketch) return null;
  return { dfLocation, blocksFile: ketchShipBlocks(blocks), ketch: dfLocation.ketch, climateBase: site?.climateBase ?? 2, season: site?.season ?? 0, group: dfLocation.ketch.key, door: null, dfBlock: null, recordIndex: -1 };
}
export const KT_FAR_M = Math.hypot(KT_GROUND.half, -KT_GROUND.y);
export const KT_CAGE_H = KT_CAGE.h;
