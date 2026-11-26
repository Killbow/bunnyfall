// @ts-check
// BUNNYFALL (2026-11-25, caverns): A MINE ON THIS SCREEN'S DUNGEON HOST - the made level stood into its built context, as
// the Sky-Ketch's deck is (systems/ketch/ketchDeckHost.js): the cave's mesh among the context's draws under Daggerfall's cave
// textures, its rock on the collider as one bucket, and its way out an exit door at the mouth, so the dungeon's own exit
// press and landing take the player back out where they went in. createWorldModes constructs it and calls `stand`.
import { MINE_ART_ARCHIVE, loadMineArt } from '../../world/mine/mineArt.js';
import { mineOreDraws } from '../../world/mine/mineOres.js';
import { standMineFoes } from './mineFoes.js';
import { createMineSounds } from './mineSounds.js';
import { mineDrillFrameModel, mineDrillShaftModel, mineDrillPictures, mineLampModels, mineFloorRingModel, MINE_DRILL_SIZE, MINE_DRILL_RECORDS, MINE_LAMP_MARK_RECORD, MINE_WALL_MARK_RECORD } from '../../world/mine/mineDrillModel.js';
import { drillRunning, oreRunsLeft } from '../../net/mine/mineDrill.js';
import { transformPoint, trs } from '../../world/mat4.js';
import { mineWayOutModel, mineWayOutPicture, MINE_WAY_OUT_RECORD } from '../../world/mine/mineWayOut.js';
import { identity } from '../../world/mat4.js';
import { mineLayout } from '../../net/mine/mineLayout.js';
import { buildMineModel } from '../../world/mine/mineModel.js';
import { mineSurfacePictures, mineTextures } from '../../world/mine/mineSurfaces.js';
import { isMine, MINE_LAMP_M } from '../../world/mine/mineLocation.js';
import { createMineDrillReadout } from '../../ui/mineDrillReadout.js';
import { t } from '../../ui/textManager.js';
import { createMineClient, mineKey, mineSurveyLine } from './mineClient.js';
import { SURVEYOR } from '../../net/professionLaw.js';
import { noteMineState } from './mineMouths.js';
import { RAY_DISTANCE, DEFAULT_ACTIVATION_DISTANCE } from '../../player/activate.js';

/** The collider's bucket for the cave's rock. */
export const MINE_BUCKET = 'mine:cave';
/** The way out's opening at the mouth (m). */
export const MINE_EXIT = Object.freeze({ w: 3, h: 3 });
export const MINE_TEXT = Object.freeze({
  wayOut: () => t('mine.wayOut', 'The way out'),
  shifted: () => t('mine.shifted', 'The mine has shifted since you last came. Walk back in to find its new ways.'),
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

/** How high over its hole a rig's shaft turns (m). */
const RIG_SHAFT_UP_M = 0.35;
/** How far off a chamber's middle its lamp stands (m), clear of the way through. */
const LAMP_OFF_M = 1.2;
const LAMP_COLOR = Object.freeze([1, 0.76, 0.47]);
/** How often a page says `hi` to its mine's room until the room answers (ms). */
const HI_RETRY_MS = 1000;
/** An activation box about a point (m): `w` across, `h` up from `y0`. */
const boxAt = (/** @type {number[]} */ p, /** @type {number} */ w, /** @type {number} */ y0, /** @type {number} */ h) => ({ min: [p[0] - w / 2, p[1] + y0, p[2] - w / 2], max: [p[0] + w / 2, p[1] + y0 + h, p[2] + w / 2] });

/** THE FADE: one black sheet over the page, faded in at the collapse's end and out once the player stands outside. */
function fadeSheet() {
  if (typeof document === 'undefined') return () => {};
  let el = /** @type {HTMLDivElement|null} */ (null);
  return (/** @type {boolean} */ on) => {
    if (!el) { el = document.createElement('div'); el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity 0.8s;z-index:50'; document.body.appendChild(el); }
    el.style.opacity = on ? '1' : '0';
  };
}

/**
 * @param {{ renderer: any,
 *   link?: (() => any) | null, say?: ((text: string) => void) | null, shake?: ((k: number) => void) | null, leave?: (() => void) | null, audio?: any }} deps
 *   `link()` the world's mine doors: `{ send(k, fields), planks(material), spend(material), closeWindows() }`
 */
export function createMineHost({ renderer, link = null, say = null, shake = null, leave = null, audio = null }) {
  const sounds = createMineSounds({ audio });   // the mine heard (systems/mine/mineSounds.js)
  /** @type {any} */
  /** the drills stood, by `s:c:k`: their frame's and shaft's draws, and their hole */
  const rigs = new Map();
  const drillReadout = createMineDrillReadout();
  let drillMeshes = /** @type {any} */ (null);
  /** the character's mine kit as the Society last said it (`{ drill, fuel, lamp, rod }`), or null unread */
  let kitHeld = /** @type {any} */ (null);
  let mesh = null, wayOut = null, standCtx = null, layout = null, client = null, mine = null, hiAt = -Infinity, heard = false;
  const fade = fadeSheet();
  /** THE DRILLS, as the room says them: a rig stood over each hole one stands on, taken down where none does. */
  function standRigs(/** @type {any[]} */ drills) {
    const ctx = standCtx;
    if (!ctx || !layout || !renderer?.createMesh) return;
    if (!drillMeshes) {
      try {
        const pic = mineDrillPictures();
        renderer.uploadTexture?.(MINE_ART_ARCHIVE, MINE_DRILL_RECORDS.timber, pic.timber);
        renderer.uploadTexture?.(MINE_ART_ARCHIVE, MINE_DRILL_RECORDS.iron, pic.iron);
        renderer.uploadTexture?.(MINE_ART_ARCHIVE, MINE_DRILL_RECORDS.flame, pic.flame);
        renderer.uploadEmissionTexture?.(MINE_ART_ARCHIVE, MINE_DRILL_RECORDS.flame, pic.flame, { white: true });   // the lantern shines in the dark
        const lamp = mineLampModels();
        drillMeshes = { frame: renderer.createMesh(mineDrillFrameModel()), shaft: renderer.createMesh(mineDrillShaftModel()), post: renderer.createMesh(lamp.post), lantern: renderer.createMesh(lamp.lantern) };
      } catch (e) { console.warn('[mine] the drill', /** @type {any} */ (e)?.message ?? e); return; }
    }
    const want = new Set();
    for (const d of drills) {
      const key = `${d.s}:${d.c}:${d.k}`, hole = layout.sections[d.s]?.chambers[d.c]?.holes[d.k];
      if (!hole) continue;
      want.add(key);
      const old = rigs.get(key);
      if (old) { old.d = d; continue; }
      const at = hole.at, yaw = (d.k * 97) % 360;
      const frame = { gpu: drillMeshes.frame, object: { matrix: trs(at[0], at[1], at[2], 0, yaw, 0) }, hidden: false, noShadow: false, texRemap: null };
      const shaft = { gpu: drillMeshes.shaft, object: { matrix: trs(at[0], at[1] + RIG_SHAFT_UP_M, at[2], 0, 0, 0) }, hidden: false, noShadow: true, texRemap: null };
      const rig = { d, at, ore: hole.ore, readoutAt: [at[0], at[1] + MINE_DRILL_SIZE.tall + 0.25, at[2]], frame, shaft, spin: 0, running: (/** @type {number} */ t) => drillRunning(rig.d, t) };
      ctx.dynamicDraws?.push(frame, shaft);
      rigs.set(key, rig);
    }
    for (const [key, r] of rigs) {
      if (want.has(key)) continue;
      for (const e of [r.frame, r.shaft]) { const i = ctx.dynamicDraws?.indexOf(e) ?? -1; if (i >= 0) ctx.dynamicDraws.splice(i, 1); }
      rigs.delete(key);
      drillReadout.remove(key);
    }
  }

  /** THE LAMPS, as the room says them: a post and its glowing lantern at each lit chamber's middle (they stay till the
   *  mine turns over, so none is ever taken down but with the mine). */
  /** @type {Map<string, { x: number, y: number, z: number, range: number, color: readonly number[] }>} */
  const lampLights = new Map();
  const lampMarkers = new Map();
  /** @type {ReturnType<typeof mineOreDraws>} */
  let oreDraws = [];
  const hideDepletedOre = () => {
    const work = client?.state()?.oreWork;
    for (const draw of oreDraws) draw.hidden = oreRunsLeft(work, draw.oreKey) <= 0;
  };
  function standLamps(/** @type {any[]} */ lamps) {
    const ctx = standCtx;
    if (!ctx || !layout) return;
    for (const l of lamps) {
      const key = `${l.s}:${l.c}`, ch = layout.sections[l.s]?.chambers[l.c];
      if (!ch || lampLights.has(key)) continue;
      const m = trs(ch.c[0] + LAMP_OFF_M, ch.c[1], ch.c[2], 0, (l.c * 71) % 360, 0);
      const [x, y, z] = transformPoint(m, 0.36, 1.59, 0);
      lampLights.set(key, { x, y, z, range: MINE_LAMP_M, color: LAMP_COLOR });
      const marker = lampMarkers.get(key);
      if (marker) marker.hidden = true;
      if (!drillMeshes?.post) continue;
      ctx.dynamicDraws?.push({ gpu: drillMeshes.post, object: { matrix: m }, hidden: false, noShadow: false, texRemap: null },
        { gpu: drillMeshes.lantern, object: { matrix: m }, hidden: false, noShadow: true, texRemap: null });
    }
  }

  return {
    /** THE MINE stood into its built context (before its start marker is read): `loc` the made location (mineLocation). */
    stand(/** @type {any} */ ctx, /** @type {any} */ loc) {
      if (!ctx || !isMine(loc)) return;
      layout = mineLayout(loc.mine.id, loc.mine.reset ?? 0);
      const tex = mineTextures(loc.climate?.worldClimate ?? 0);
      for (const picture of mineSurfacePictures(tex)) renderer?.uploadTexture?.(tex.archive, picture.record, picture);
      const model = buildMineModel(layout, tex);
      try { mesh = renderer?.createMesh?.(model) ?? null; } catch (e) { console.warn('[mine] the cave would not build', e?.message ?? e); mesh = null; }
      if (mesh) ctx.dynamicDraws?.push({ gpu: mesh, object: { matrix: identity() }, hidden: false, noShadow: false, texRemap: null });
      const tris = model.positions, idx = new Uint32Array(tris.length / 3);
      for (let k = 0; k < idx.length; k++) idx[k] = k;
      try { ctx.collider?.addMesh?.(MINE_BUCKET, tris, idx, identity()); } catch (e) { console.warn('[mine] the cave\'s collider', e?.message ?? e); }
      ctx.exitDoors?.push(mineExitDoor(layout.mouth));
      // the owner's ores at the holes (world/mine/mineOres.js), once the mines' models are read; the meshes are shared, never freed here
      const oresFor = layout;
      void loadMineArt(renderer).then((art) => { if (art?.ores && standCtx === ctx && layout === oresFor) {
        oreDraws = mineOreDraws(layout, art.ores, art.oreMesh);
        hideDepletedOre();
        ctx.dynamicDraws?.push(...oreDraws);
      } }).catch(() => {});
      // the way out seen: a timber frame onto daylight behind the exit door (world/mine/mineWayOut.js)
      try {
        const pic = mineWayOutPicture();
        renderer?.uploadTexture?.(MINE_ART_ARCHIVE, MINE_WAY_OUT_RECORD, pic.picture);
        renderer?.uploadEmissionTexture?.(MINE_ART_ARCHIVE, MINE_WAY_OUT_RECORD, pic.glow, { white: true });   // the daylight shines in the dark
        wayOut = renderer?.createMesh ? renderer.createMesh(mineWayOutModel(layout)) : null;
        if (wayOut) ctx.dynamicDraws?.push({ gpu: wayOut, object: { matrix: identity() }, hidden: false, noShadow: true, texRemap: null });
      } catch (e) { console.warn('[mine] the way out', /** @type {any} */ (e)?.message ?? e); wayOut = null; }
      ctx.addActivationNamer?.((/** @type {any} */ key) => (typeof key === 'string' && key.startsWith('exit:') ? { title: MINE_TEXT.wayOut() } : null));
      // THE MINE ON THIS PAGE: its holes and its walls offered to the activation ray, named by the client, pressed through it
      mine = { ...loc.mine }; heard = false; hiAt = -Infinity; lampLights.clear(); kitHeld = null;
      void Promise.resolve(link?.()?.kit?.()).then((k) => { if (standCtx === ctx || standCtx === null) kitHeld = k ?? null; }, () => {});
      const doors = link?.() ?? null;
      if (doors?.surveyor?.() === SURVEYOR) { const line = mineSurveyLine(layout); if (line) say?.(line); }   // MINE-PERKS: a Surveyor knows the ores before they walk in
      client = createMineClient({
        layout, say: (x) => say?.(x), send: (k, f) => doors?.send?.(k, f) === true, planks: (m) => doors?.planks?.(m) ?? 0,
        spend: async (m) => (await doors?.spend?.(m)) === true, shake: (k) => shake?.(k), fade, closeWindows: () => doors?.closeWindows?.(),
        leave: () => { leave?.(); setTimeout(() => fade(false), 1500); },
        // waves and strays: the dungeon's encounter door stands them (the room's host alone, shared - offline, mine)
        drillOk: () => doors?.drillOk?.() === true, me: () => doors?.me?.() ?? null, claim: (r) => doors?.claim?.(r) ?? Promise.resolve(null),
        // the Society's mine kit, read on entry and kept as it is spent; the party's accounts for a drill's crew
        kit: (id) => kitHeld?.[id] ?? 0,
        useKit: async (id) => { const ok = (await doors?.useKit?.(id)) === true; if (ok && kitHeld) kitHeld[id] = Math.max(0, (kitHeld[id] ?? 0) - 1); return ok; },
        crew: () => doors?.crew?.() ?? [],
        sound: (n) => { sounds.say(n); },
        foes: (kind, s, c, n) => standMineFoes(layout, { s, c, n }, (t, feet, lo, hi) => ctx.spawnFoeNear?.(t, feet, lo, hi)),
      });
      const targets = [];
      const floorMarker = (/** @type {number} */ record, /** @type {number[]} */ color) => {
        const picture = { width: 1, height: 1, colors: new Uint8Array(color) };
        renderer?.uploadTexture?.(MINE_ART_ARCHIVE, record, picture);
        renderer?.uploadEmissionTexture?.(MINE_ART_ARCHIVE, record, picture, { white: true });
        return renderer?.createMesh?.(mineFloorRingModel(record));
      };
      const markerMesh = floorMarker(MINE_LAMP_MARK_RECORD, [255, 180, 75, 255]);
      const wallMarkerMesh = floorMarker(MINE_WALL_MARK_RECORD, [115, 200, 240, 255]);
      layout.sections.forEach((/** @type {any} */ sec, /** @type {number} */ s) => sec.chambers.forEach((/** @type {any} */ ch, /** @type {number} */ c) => {
        ch.holes.forEach((/** @type {any} */ h, /** @type {number} */ k) => targets.push({ key: mineKey('hole', s, c, k), hole: [s, c, k], aabb: boxAt(h.at, 1.4, 0, 1.65), distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE }));
        const lampAt = [ch.c[0] + LAMP_OFF_M, ch.c[1], ch.c[2]];
        targets.push({ key: mineKey('lamp', s, c, 0), aabb: boxAt(lampAt, 1, 0, 2), distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE });
        if (markerMesh) {
          const marker = { gpu: markerMesh, object: { matrix: trs(lampAt[0], lampAt[1], lampAt[2], 0, 0, 0) }, hidden: false, noShadow: true, texRemap: null };
          ctx.dynamicDraws?.push(marker);
          lampMarkers.set(`${s}:${c}`, marker);
        }
        ch.walls.forEach((/** @type {any} */ w, /** @type {number} */ k) => {
          const at = [w.at[0] + w.n[0] * 0.45, ch.c[1], w.at[2] + w.n[2] * 0.45];
          targets.push({ key: mineKey('wall', s, c, k), aabb: boxAt(at, 0.9, 0.1, 1.5), distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE });
          if (wallMarkerMesh) ctx.dynamicDraws?.push({ gpu: wallMarkerMesh, object: { matrix: trs(at[0], at[1], at[2], 0, 0, 0) }, hidden: false, noShadow: true, texRemap: null });
        });
      }));
      ctx.addActivationTargets?.(() => targets.filter((target) => !target.hole || client?.holeAvailable(target.hole[0], target.hole[1], target.hole[2])));
      ctx.addActivationNamer?.((/** @type {any} */ key) => (typeof key === 'string' && key.startsWith('mine:') ? client?.name(key) ?? null : null));
      standCtx = ctx;
      ctx.addTeardown?.(() => {
        if (standCtx !== ctx) return;
        try { if (mesh) renderer?.destroyMesh?.(mesh); if (wayOut) renderer?.destroyMesh?.(wayOut); if (markerMesh) renderer?.destroyMesh?.(markerMesh); if (wallMarkerMesh) renderer?.destroyMesh?.(wallMarkerMesh); } catch { /* the context's own teardown frees it either way */ }
        try { if (drillMeshes) for (const m of Object.values(drillMeshes)) renderer?.destroyMesh?.(m); } catch { /* as above */ }
        drillReadout.dispose();
        lampMarkers.clear();
        oreDraws = [];
        sounds.stop();
        mesh = null; wayOut = null; standCtx = null; layout = null; client = null; mine = null; drillMeshes = null; rigs.clear(); lampLights.clear();
      });
    },
    /** Every frame in a mine: `hi` said until the room answers, and the collapse played. */
    frame() {
      if (!client) return;
      const now = performance.now();
      if (!heard && now - hiAt >= HI_RETRY_MS) { hiAt = now; link?.()?.send?.('hi', { r: mine.reset }); }
      client.frame();
      // the drills that run turn their shafts (a turn and a half a second)
      const nowS = Date.now() / 1000;
      const running = [];
      for (const [key, r] of rigs) if (r.running(nowS)) { r.spin += 0.15; r.shaft.object.matrix = trs(r.at[0], r.at[1] + RIG_SHAFT_UP_M, r.at[2], 0, (r.spin * 180) / Math.PI, 0); running.push({ key, at: [r.at[0], r.at[1] + 1, r.at[2]] }); }
      sounds.drills(running);   // each running drill grinds at its rig; one stopped falls silent
    },
    /** The room's word on the mine (online.onMine). A room on another reset than the one stood is a mine gone: out. */
    heard(/** @type {any} */ w) {
      if (!client || !mine) return;
      if (w?.k === 'st' && w.st) {
        heard = true;
        noteMineState(mine.px, mine.py, w.st);
        if (w.st.reset !== mine.reset) {
          // the mine turned over since this page last stood in it: a sealed one puts me out as its collapse does; an open
          // one is a new mine - out, and its next entry stands the reset just heard (systems/mine/mineMouths.js)
          if (w.st.sealedUntil > 0) { client.heard({ k: 'st', st: w.st }); return; }
          say?.(MINE_TEXT.shifted());
          const out = leave; client = null; mine = null; out?.();
          return;
        }
      }
      client.heard(w);
      if (w?.k === 'st' && w.st) { standRigs(w.st.drills ?? []); standLamps(w.st.lamps ?? []); hideDepletedOre(); }
    },
    lampLights(/** @type {number[]} */ eye) {
      const near = [];
      for (const lamp of lampLights.values()) {
        if (Math.hypot(lamp.x - eye[0], lamp.z - eye[2]) <= lamp.range * 2) near.push(lamp);
      }
      return near;
    },
    drawDrillReadout: (/** @type {HTMLCanvasElement} */ canvas, /** @type {number[]} */ eye, covered = false) => drillReadout.draw(canvas, renderer, eye, standCtx?.collider, rigs, covered),
    /** The drills stood now (probes): `s:c:k` each. */
    rigs: () => [...rigs.keys()],
    /** A cave vein's answered strike (professions/mineHost.js). */
    struck: (/** @type {any} */ node) => client?.struck(node),
    /** A press on a hole or a wall. */
    press: (/** @type {string} */ key, mode = 'grab') => { void client?.press(key, mode); return !!client; },
    /** The mine stood now (`{ id, reset, px, py }`), or null. */
    here: () => (mine ? { ...mine } : null),
    /** The layout of the mine stood now, or null. */
    layout: () => layout,
  };
}
