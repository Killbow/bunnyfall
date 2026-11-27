// BUNNYFALL (2026-11-27, the owner: "Nyx sit behind a desk ... tilting camera to the right to choose race, to the left to
// choose background"): NYX'S HALL IN 3D - the stage character creation is played on, before the world boots.
//
// The hall is the magic tavern's (scenes/magicTavernRoom.js grandestTavern: the biggest tavern interior in the game's files),
// built standalone exactly as the ?interior dev route builds a building (scenes/interior.js, buildInteriorContext), its keeper
// drawn as Nyx (the magic taverns' guild-clerk art). A desk is drawn in front of the camera by the wizard (ui/tavernChargen.js),
// so Nyx stands behind it. The camera holds authored SHOTS - desk, right (the patrons), close (the one you chose), left (the
// windows, for your history), page and ledger (down over the desk) - and glides between them as the wizard's state changes.
//
// The patrons, one per people, are each people's own paperdoll (ui/paperDoll.js composePaperDollPixels), drawn by the wizard as
// DOM figures this loop places every frame where their spots in the hall project - so a press on one is an ordinary button.
//
// runChargenHall resolves with { result } when the character is signed (also kept in characters/hallBorn.js for the world),
// { cancel: true } when the player leaves, or null when the hall cannot be built (the caller then boots the world and its own
// wizard, as before).

import { iilActive, iilInteriorLights, iilSyncLane } from '../render/improvedInteriorLighting.js';
import { Arch3dFile } from '../formats/arch3dFile.js';
import { WORLD_FRAME, INTERIOR_CLEAR } from '../render/renderer.js';
import { BlocksFile } from '../formats/blocksFile.js';
import { bindWorldDataBlocks } from '../formats/worldDataReplacement.js';
import { loadModWorldData } from '../mods/modWorldData.js';
import { DFPalette } from '../formats/dfPalette.js';
import { INTERIOR_AMBIENT, INTERIOR_LIGHT_DIR, roomAmbient } from '../world/interiorLights.js';
import { nearestLights } from '../world/cityLights.js';
import { syncLightingLane, interiorLightColor, interiorGrade } from '../render/enhancedLighting.js';
import { INTERIOR_MARKER } from '../world/interiorLayout.js';
import { lookAt, perspective, mirrorProjectionX, multiply, UP_Y } from '../world/mat4.js';
import { fetchBytes } from './shared.js';
import { INTERIOR_SEASON } from '../world/climateSwaps.js';
import { createDataPipeline } from './dataPipeline.js';
import { buildInteriorContext } from './interiorContext.js';
import { fieldOfView } from '../ui/viewSettings.js';
import { windowEmissionRGB } from '../render/windowEmission.js';
import { worldViewportRect, largeHudWorldAspect } from '../ui/hudLarge.js';
import { grandestTavern } from './magicTavernRoom.js';
import { collectInteriorPeople } from '../characters/interiorPeople.js';
import { PLAYABLE_RACE_TEMPLATES } from '../characters/races.js';
import { composePaperDollPixels } from '../ui/paperDoll.js';
import { createChargenFlow, mountWizardOverHall } from '../characters/chargenSession.js';
import { setHallBorn } from '../characters/hallBorn.js';
import { assignStartingGear } from '../characters/startingGear.js';

/** How tall a patron stands, in the hall's metres (the doll's figure fills its panel's height). */
const PATRON_H = 1.9;
const EYE = 1.6;

/** Ease in and out over [0, 1]. */
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

/**
 * The shots, off the hall's own two landmarks: the keeper Nyx stands in place of (behind the hall's bar) and the door the hall
 * is entered by, which gives the hall's long axis - snapped to the room's square, as Daggerfall builds rooms. In that frame
 * `u` runs from the door toward the bar and `r` is the screen's right as the camera faces the bar (forward = sin, cos; right =
 * cos, -sin under the mirrored projection). The patrons stand on the right-hand floor before the benches.
 */
function hallFrame(enter, keeper) {
  const raw = Math.atan2(keeper[0] - enter[0], keeper[2] - enter[2]);
  const yaw = Math.round(raw / (Math.PI / 2)) * (Math.PI / 2);
  const u = [Math.sin(yaw), Math.cos(yaw)];
  const r = [Math.cos(yaw), -Math.sin(yaw)];
  const at = (ru, rr, y) => [keeper[0] + u[0] * ru + r[0] * rr, y, keeper[2] + u[1] * ru + r[1] * rr];
  return { yaw, at };
}

function shotsFor(enter, keeper) {
  const { yaw, at } = hallFrame(enter, keeper);
  return {
    desk: { pos: at(-2.9, 0, 1.65), yaw, pitch: -0.04 },
    right: { pos: at(-5.8, -2.8, 1.55), yaw: yaw + Math.PI / 2, pitch: -0.1 },
    left: { pos: at(-3.6, 1.6, 1.6), yaw: yaw - 1.35, pitch: 0 },
    page: { pos: at(-1.9, 0, 1.95), yaw, pitch: -0.75 },
    ledger: { pos: at(-2.1, 0, 1.95), yaw, pitch: -0.6 },
  };
}

/** The patrons' spots: a row on the right-hand floor along the hall. */
function patronSpots(enter, keeper) {
  const { at } = hallFrame(enter, keeper);
  const out = new Map();
  const keys = PLAYABLE_RACE_TEMPLATES.map((t) => t.key);
  // one row before the right-hand benches, the first nearest the bar (on the screen's left as the camera faces them)
  const step = 7.2 / Math.max(1, keys.length - 1);   // the row keeps its length however many peoples there are
  keys.forEach((key, i) => out.set(key, at(-2.2 - step * i, 1.7, 0.02)));
  return out;
}

/** Column-major 4x4 times (x, y, z, 1). */
function project(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[3] * x + m[7] * y + m[11] * z + m[15]];
}

/**
 * Build the hall, mount the wizard over it, and wait for the character.
 * @param {HTMLCanvasElement} canvas @param {any} renderer @param {(s: string) => void} [status]
 * @returns {Promise<{ result: any } | { cancel: true } | null>}
 */
export async function runChargenHall(canvas, renderer, status = () => {}) {
  status('Nyx is lighting the lamps');
  const [palBytes, blocksBytes, archBytes, bundle] = await Promise.all([
    fetchBytes('ART_PAL.COL'), fetchBytes('BLOCKS.BSA'), fetchBytes('ARCH3D.BSA'), createChargenFlow(fetchBytes),
  ]);
  const palette = new DFPalette();
  palette.load(palBytes, 'ART_PAL.COL');
  const blocks = new BlocksFile();
  blocks.load(blocksBytes);
  bindWorldDataBlocks(blocks);
  await loadModWorldData();
  const pick = grandestTavern(blocks);
  if (!pick) return null;
  const blockIndex = blocks.getBlockIndex(pick.name);
  if (blockIndex < 0) return null;
  const dfBlock = blocks.getBlock(blockIndex);
  const arch = new Arch3dFile();
  arch.load(archBytes);

  // the keeper is the hall's one person with a faction (a tavern's keeper; the rest are its patrons)
  const people = collectInteriorPeople(dfBlock.rmbBlock.subRecords[pick.record]);
  const keeperFid = people.find((p) => p.factionID)?.factionID ?? null;
  syncLightingLane(renderer);
  renderer.setClearColor(INTERIOR_CLEAR);
  const pipeline = createDataPipeline({ renderer, arch, palette });
  const ctx = await buildInteriorContext({ ...pipeline, renderer }, dfBlock, blockIndex, pick.record, 300, INTERIOR_SEASON, null, {
    guildClerkArt: (pn) => (keeperFid != null && pn.factionID === keeperFid ? 'nyx' : null),
  });
  renderer.setLighting(new Float32Array(roomAmbient(INTERIOR_AMBIENT, ctx.roomLamps)), 0);
  renderer.setWindowEmission(windowEmissionRGB('disabled'));
  renderer.setFog('exp', 0.001, 0, 0, new Float32Array([0, 0, 0]));

  const keeperPn = ctx.people.find((p) => keeperFid != null && p.factionID === keeperFid) ?? ctx.people[0];
  const enterMk = ctx.markers.find((m) => m.type === INTERIOR_MARKER.ENTER);
  if (!keeperPn || !enterMk) return null;
  const shots = shotsFor([enterMk.x, 0, enterMk.z], [keeperPn.x, 0, keeperPn.z]);
  const spots = patronSpots([enterMk.x, 0, enterMk.z], [keeperPn.x, 0, keeperPn.z]);

  // ── the camera: a shot, and the glide toward it ──
  const cam = { pos: [...shots.desk.pos], yaw: shots.desk.yaw, pitch: shots.desk.pitch };
  let from = { ...cam, pos: [...cam.pos] }, to = shots.desk, t = 1;
  let chosen = null;
  const closes = new Map();
  const closeShot = (raceKey) => {
    if (closes.has(raceKey)) return closes.get(raceKey);
    const p = spots.get(raceKey);
    if (!p) return shots.right;
    const f = [Math.sin(shots.right.yaw), Math.cos(shots.right.yaw)];
    const r = [Math.cos(shots.right.yaw), -Math.sin(shots.right.yaw)];
    // stand 2.4 m before them, a little to their left, so the panel on the screen's right leaves them clear
    const shot = { pos: [p[0] - f[0] * 2.4 + r[0] * 0.55, 1.4, p[2] - f[1] * 2.4 + r[1] * 0.55], yaw: shots.right.yaw, pitch: -0.02 };
    closes.set(raceKey, shot);
    return shot;
  };
  const aim = (name, info = {}) => {
    if (info.race) chosen = info.race;
    const next = name === 'close' ? closeShot(chosen) : (shots[name] ?? shots.desk);
    if (next === to) return;
    from = { pos: [...cam.pos], yaw: cam.yaw, pitch: cam.pitch };
    to = next;
    t = 0;
  };

  // ── the patrons' paperdolls, composed once each ──
  const bodies = new Map();
  let bodyListener = () => {};
  // one at a time: the first files can be slow to come while the hall's own archives are still arriving
  let queue = Promise.resolve();
  // dressed as every new character is dressed (characters/startingGear.js: a shirt and trousers), the dye fixed per people
  const composeOnce = (race, gender, faceIndex) => {
    let seed = [...race].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rolls = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const patron = { race, gender, faceIndex, items: [] };
    try { assignStartingGear(patron, { rolls, torchesFromItems: false }); } catch (e) { console.warn('[chargen hall] the patron could not be dressed', e?.message ?? e); }
    return composePaperDollPixels({ fetchBytes, palette, getTexture: pipeline.getTexture }, patron, { background: false });
  };
  const body = (raceKey, gender = 'male', faceIndex = 0) => {
    const key = `${raceKey}|${gender}|${faceIndex}`;
    if (!bodies.has(key)) {
      bodies.set(key, null);
      // the one the player is looking at (any sex or face but a patron's own) does not wait behind the patrons
      const asked = gender === 'male' && faceIndex === 0 ? (queue = queue.catch(() => null).then(() => composeOnce(raceKey, gender, faceIndex))) : composeOnce(raceKey, gender, faceIndex);
      asked.then((px) => {
        if (!px?.rgba) { console.warn('[chargen hall] no paperdoll for', key); return; }
        const c = document.createElement('canvas');
        c.width = px.width; c.height = px.height;
        const g = c.getContext('2d');
        if (!g) return;
        g.putImageData(new ImageData(new Uint8ClampedArray(px.rgba.buffer, px.rgba.byteOffset, px.width * px.height * 4), px.width, px.height), 0, 0);
        bodies.set(key, c);
        bodyListener();
      }).catch((e) => console.warn('[chargen hall] the paperdoll would not compose', key, e?.message ?? e));
    }
    const c = bodies.get(key);
    if (!c) return null;
    const copy = document.createElement('canvas');
    copy.width = c.width; copy.height = c.height;
    copy.getContext('2d')?.drawImage(c, 0, 0);
    return copy;
  };

  for (const t of PLAYABLE_RACE_TEMPLATES) body(t.key);   // the patrons start composing now, behind the hall's first frames

  // ── the frame ──
  let running = true;
  let last = performance.now();
  let viewProj = null;
  const place = () => {
    if (!viewProj) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const node of document.querySelectorAll('.tc-in3d[data-race]')) {
      const el = /** @type {HTMLElement} */ (node);
      const p = spots.get(el.dataset.race ?? '');
      if (!p) continue;
      const foot = project(viewProj, p[0], p[1], p[2]);
      const head = project(viewProj, p[0], p[1] + PATRON_H, p[2]);
      if (foot[2] <= 0.05 || head[2] <= 0.05) { el.style.visibility = 'hidden'; continue; }
      const fx = (foot[0] / foot[2] + 1) / 2 * w, fy = (1 - foot[1] / foot[2]) / 2 * h;
      const hy = (1 - head[1] / head[2]) / 2 * h;
      const tall = Math.max(8, fy - hy);
      el.style.visibility = 'visible';
      el.style.height = `${tall}px`;
      el.style.left = `${fx}px`;
      el.style.top = `${hy}px`;
      el.style.zIndex = String(1000 - Math.round(foot[2] * 10));
    }
  };
  const frame = (now) => {
    if (!running) return;
    const real = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.1, real);
    last = now;
    if (t < 1) {
      t = Math.min(1, t + real / 1.1);   // the glide keeps the clock's time, however few frames a slow machine draws
      const e = ease(t);
      for (let a = 0; a < 3; a++) cam.pos[a] = from.pos[a] + (to.pos[a] - from.pos[a]) * e;
      cam.yaw = lerpAngle(from.yaw, to.yaw, e);
      cam.pitch = from.pitch + (to.pitch - from.pitch) * e;
    }
    const fwd = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
    const target = [cam.pos[0] + fwd[0], cam.pos[1] + fwd[1], cam.pos[2] + fwd[2]];
    const proj = mirrorProjectionX(perspective(fieldOfView(), largeHudWorldAspect(canvas.clientWidth, canvas.clientHeight), 0.05, 500));
    renderer.setWorldViewport(worldViewportRect(canvas.clientWidth, canvas.clientHeight));
    const view = lookAt(cam.pos, target, [0, 1, 0]);
    viewProj = multiply(proj, view);
    iilSyncLane(renderer, true);
    const iil = iilActive(renderer.lightingLane) ? iilInteriorLights(ctx.lights, ctx.iilFireplaces ?? []) : null;
    const lit = iil
      ? nearestLights(iil.lights, cam.pos, renderer.maxPointLights, iil.ranges, iil.colorOf)
      : nearestLights(ctx.lights, cam.pos, renderer.maxPointLights, ctx.lights.map((l) => l.range),
        (l) => interiorLightColor(!!renderer.lightingLane, l.color, l.intensity));
    renderer.setPointLights(lit.data, null, lit.colors);
    renderer.everyLightCasts();
    renderer.setSceneGrade?.(interiorGrade(!!renderer.lightingLane));
    renderer.beginFrame(proj, view, INTERIOR_LIGHT_DIR, WORLD_FRAME);
    for (const d of ctx.drawList) renderer.drawMesh(d.mesh, d.matrix, ctx.texRemap);
    for (const d of ctx.dynamicDraws) renderer.drawMesh(d.gpu, d.object.matrix, ctx.texRemap);
    ctx.flatAnims.tick(dt);
    renderer.drawBillboards(ctx.billboardBatches, new Float32Array([Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)]), UP_Y);
    renderer.resolveFrame();
    place();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  status('');
  // the probe's handle in the dev server: where things are, and the camera to move (tools and the shots' tuning)
  if (import.meta.env?.DEV) globalThis.__hall = { cam, shots, spots, pick, bodies, people: ctx.people.map((p) => [p.x, p.y, p.z, p.factionID]), markers: ctx.markers.map((m) => [m.type, m.x, m.y, m.z]), aim, hold: () => { t = 1; to = cam; } };

  // ── the wizard over it ──
  return new Promise((resolve) => {
    const stop = () => { running = false; };
    mountWizardOverHall(bundle.flow, {
      hall: { aim, body, place, onBody: (f) => { bodyListener = f; } },   // place: the wizard asks it after each repaint, so a new figure is never drawn hidden for a frame
      onDone: (result) => { stop(); setHallBorn(result); resolve({ result }); },
      onCancel: () => { stop(); resolve({ cancel: true }); },
    });
  });
}
