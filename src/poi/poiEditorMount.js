// The POI editor's door and mount for `?editor`, loaded only when the URL asks for it.
// `world` carries the world host's state the editor reads and sets.
import { playerEntity, registerPlayerDamageMod, setAvoidDeathHook } from '../characters/playerEntity.js';
import { storedSession, serviceBase, accountRefusalText } from '../net/accountClient.js';
import { floorLanding, heldInSolid, openGroundNear } from '../player/enterExit.js';
import { cursorActive, setCursorActive, releaseLook, requestLook } from '../player/pointerLock.js';
import { groundHit } from '../player/travelPick.js';
import { PoiGizmoPass } from '../render/poiGizmoPass.js';
import { openPoiEditorWhenStanding } from './poiEditorDoor.js';
import { createPoiEditorHost, POI_PICK_REACH, createPoiEditorRouter, POI_EDITOR_EVENTS } from './poiEditorHost.js';
import { appStorage } from '../platform/appStorage.js';
import { restoresSoFar, snapshotPlayer, restorePlayer } from '../saves/save.js';
import { t } from '../ui/textManager.js';
import { isOnFoot } from '../travel/transport.js';
import { holdHotbarKeys } from '../ui/enhancedHotbar.js';
import { overlayOpen } from '../ui/enhancedOverlays.js';
import { worldViewportRect } from '../ui/hudLarge.js';
import { actionOf, isTextEntryTarget } from '../ui/input.js';
import { createPoiEditorPanel } from '../ui/poi/poiEditorPanel.js';
import { fieldOfView } from '../ui/viewSettings.js';
import { TERRAIN_SIZE } from '../world/terrainSampler.js';
import { keepSpot, spotScene, createPoiTest } from './poiDmTest.js';
import { createPoiEdit } from './poiEdit.js';
import { decodePoiImage } from './poiImageDecode.js';
import { poiMe } from './poiService.js';

export function startPoiEditor(world) {
  const io = () => { const s = storedSession(appStorage()); return s ? { fetch: (u, i) => fetch(u, i), base: serviceBase(appStorage()), secret: s.secret } : null; };
  const first = io();
  if (!first) { world.townTalk.say(accountRefusalText('no-session')); return; }
  poiMe(first).then((r) => {
    if (!r.ok) { world.townTalk.say(accountRefusalText(r.error)); return; }
    if (!r.data.builder) { world.townTalk.say(accountRefusalText('poi-not-builder')); return; }
    openPoiEditorWhenStanding({ entity: () => playerEntity, standing: () => (world.playerSpawned || !world.walkMode) && !world.townTalk.overlayActive, open: () => { if (world.alive()) mountPoiEditor(world, r.data, io); }, say: (line) => world.townTalk.say(line) });
  }, (e) => console.warn('[poi] the editor\'s door', e?.message ?? e));
}
function mountPoiEditor(world, me, io) {
  const edit = createPoiEdit();
  const S = TERRAIN_SIZE;
  const sceneToPixel = (p) => {
    const t0 = world.state.pixelTranslation(0, 0, [0, 0, 0]);
    const px = Math.floor((p[0] - t0[0]) / S), py = Math.ceil((t0[2] - p[2]) / S);
    return { px, py, x: p[0] - (t0[0] + px * S), z: p[2] - (t0[2] - py * S) };
  };
  let panel = null;
  let openedAt = restoresSoFar();
  const editor = createPoiEditorHost({
    edit, feed: world.poiFeed, host: world.poiHost,
    view: () => (world._lastProj && world._lastView ? { proj: world._lastProj, view: world._lastView, eye: world.cam.pos, fovY: fieldOfView() + world.climbFeel.fovRad(), w: world.canvas.clientWidth, h: world.canvas.clientHeight, rect: worldViewportRect(world.canvas.clientWidth, world.canvas.clientHeight), canvasRect: world.canvas.getBoundingClientRect() } : null),
    translation: (px, py, out) => world.state.pixelTranslation(px, py, out),
    sceneToPixel,
    groundHit: (o, d) => {
      const g = groundHit(o, d, world.surfaceAt);
      const m = world.collider.raycastHit(o, d, Math.min(g.dist, POI_PICK_REACH));
      return m && m.dist < g.dist ? { point: [o[0] + d[0] * m.dist, o[1] + d[1] * m.dist, o[2] + d[2] * m.dist], dist: m.dist } : g;
    },
    surfaceAt: (x, z) => world.surfaceAt(x, z), groundEpoch: () => world.groundEpoch + world.built.changes + (world.deepWaters?.floorChanges ?? 0), snowRise: () => world.renderer._snowRise,
    onChange: () => panel?.refresh(),
    pass: new PoiGizmoPass(world.renderer.gl),
    actionOf: (e) => actionOf(e, world.keys),
    viewport: () => world.renderer.worldViewportPx,
    gone: () => world._mode() !== 'exterior' || restoresSoFar() !== openedAt,
    onGone: () => exit('away'),
  });
  registerPlayerDamageMod('poi-editor', () => 0);
  let from = null, cursorWas = false, hotbarKeysBack = null;
  const route = createPoiEditorRouter({ editor, canvas: world.canvas, cam: world.cam, acts: () => panel.acts, owns: (target) => panel.owns(target), overlayUp: () => world.townTalk.overlayActive, textEntry: isTextEntryTarget, win: window });
  const onEvent = route.onEvent;
  const worldKeysUp = () => { world.keys.clear(); for (const ring of Object.values(world.latch.edge)) ring.clear(); };
  function enter() {
    if (editor.active()) return;
    if (world._mode() !== 'exterior' || world.travelView?.active || !isOnFoot(world.player.transportMode) || !!world.csaRuntime?.isSailing?.()) { world.townTalk.say(t('poi.editor.outdoorsOnly', 'You can only open the POI editor outdoors while on foot.')); return; }
    from = { yaw: world.cam.yaw, pitch: world.cam.pitch };
    openedAt = restoresSoFar();
    cursorWas = cursorActive(); setCursorActive(true); releaseLook();
    hotbarKeysBack = holdHotbarKeys();
    worldKeysUp();
    for (const ty of POI_EDITOR_EVENTS) window.addEventListener(ty, onEvent, { capture: true, passive: false });
    editor.enter(); panel.setOn(true);
  }
  function exit(how) {
    if (world.poiTest?.active()) test(null);
    if (!editor.active()) return false;
    let landing = null;
    if ((how === 'here' || how === 'test') && world.walkMode) {
      const below = world.surfaceAt(world.cam.pos[0], world.cam.pos[2]);
      if (!Number.isFinite(below)) { panel.say(t('poi.editor.hereNoGround', 'The ground here has not loaded yet. Fly on, or choose Exit to previous spot.'), 'bad'); return false; }
      landing = floorLanding(world.collider, [world.cam.pos[0], world.cam.pos[1], world.cam.pos[2]], Math.max(10, world.cam.pos[1] - below + 5), 0);
      if (heldInSolid(world.collider, landing)) landing = openGroundNear(world.collider, landing[0], landing[2], { dry: (floor) => floor >= world.tvSeaY() }) ?? landing;
    }
    for (const ty of POI_EDITOR_EVENTS) window.removeEventListener(ty, onEvent, { capture: true });
    editor.exit(); if (how !== 'test') panel.setOn(false);
    hotbarKeysBack?.(); hotbarKeysBack = null;
    worldKeysUp();
    if (landing) {
      world.player.spawn(landing[0], landing[1], landing[2]); world.playerSpawned = true;
    } else if (from && how !== 'away') {
      world.cam.yaw = from.yaw; world.cam.pitch = from.pitch;
      const at = sceneToPixel(world.player.pos);
      if (world.walkMode && !world.built.has(`${at.px},${at.py}`)) world._teleportToPixel(at.px, at.py, [at.x, world.player.pos[1] + 1, at.z], { grounded: true }).catch((e2) => console.warn('[poi] back to the body', e2?.message ?? e2));
    }
    if (world.walkMode && how !== 'away') world.cam.pos = world.player.eyeAt();
    if (how === 'test') return true;
    setCursorActive(cursorWas);
    if (!cursorWas && !world.gamePaused() && !world.pointerSurfaces.size && !(world.modes?.modalWindowUp?.() ?? false) && !overlayOpen()) requestLook(world.canvas);
    return true;
  }
  let testBack = null;
  const tr = (px, py, out) => world.state.pixelTranslation(px, py, out);
  function test(id) {
    if (id) {
      if (!editor.active() || world.poiTest.active() || !world.poiTest.ready() || !edit.docOf(id)) return false;
      if (!isOnFoot(world.player.transportMode) || !!world.csaRuntime?.isSailing?.()) { panel.say(t('poi.test.onFoot', 'You must be on foot to test a POI, not mounted or sailing.'), 'bad'); return false; }
      const back = { body: keepSpot(world.player.pos, sceneToPixel, tr), eye: keepSpot(world.cam.pos, sceneToPixel, tr), yaw: world.cam.yaw, pitch: world.cam.pitch, from, cursorWas, restores: restoresSoFar() };
      if (!exit('test')) return false;
      testBack = back;
      return world.poiTest.start(id, edit.docOf(id));
    }
    if (!world.poiTest.active()) return false;
    world.poiTest.stop();
    const back = testBack;
    testBack = null;
    if (world._mode() !== 'exterior' || !isOnFoot(world.player.transportMode) || !!world.csaRuntime?.isSailing?.()) { panel.setOn(false); setCursorActive(back.cursorWas); return true; }
    const body = spotScene(back.body, tr);
    world.player.spawn(body[0], body[1], body[2]); world.playerSpawned = true;
    world.cam.yaw = back.yaw; world.cam.pitch = back.pitch;
    enter();
    if (!editor.active()) { panel.setOn(false); return true; }
    from = back.from; cursorWas = back.cursorWas;
    world.cam.pos = spotScene(back.eye, tr);
    return true;
  }
  world.poiTest = createPoiTest({
    pack: () => playerEntity, say: (line) => world.townTalk.say(line), feet: () => (world.walkMode && world.playerSpawned ? world.player.feetAt() : null), pool: world.exteriorFoes,
    save: { snapshotPlayer, restorePlayer }, minutes: () => Math.floor(world.playerTicker.ownMinutes), spells: () => world.spellsByIndex, deathHook: setAvoidDeathHook, onSpared: () => test(null), cursor: world.poiDmCursor,
    gone: () => (restoresSoFar() !== testBack?.restores ? 'load' : world._mode() !== 'exterior' || world._traveling || !!world.travelView?.active ? 'away' : null),
    onEnd: () => { const back = testBack; testBack = null; panel.setOn(false); setCursorActive(back?.cursorWas ?? false); panel.refresh(); }, onChange: () => panel?.refresh(),
  });
  function jump() {
    const win = world.buildTravelMapWindow({
      onTeleport: (pick) => {
        const p = pick?.pixel;
        if (!p) return;
        world._teleportToPixel(p.x, p.y, null, { grounded: true }).then(() => { world.cam.pos = [world.player.pos[0], world.player.pos[1] + 40, world.player.pos[2]]; world.cam.pitch = -0.6; }, (e2) => console.warn('[poi] the jump', e2?.message ?? e2));
      },
    });
    win?.activateTeleportationTravel();
    if (win) world.townTalk.showOverlay(win);
  }
  function goTo(place) {
    if (!place) return;
    world._teleportToPixel(place.px, place.py, [place.x, world.player.pos[1] + 1, place.z], { grounded: true }).then(() => { world.cam.pos = [world.player.pos[0], world.player.pos[1] + 25, world.player.pos[2] - 35]; world.cam.yaw = 0; world.cam.pitch = -0.6; }, (e2) => console.warn('[poi] going there', e2?.message ?? e2));
  }
  panel = createPoiEditorPanel({ edit, editor, feed: world.poiFeed, io, me, dfModels: { getGpuMesh: world.getGpuMesh, cpuModels: world.cpuModels, getTexture: world.getTexture, blocks: world.blocks, arch: world.arch, palette: world.palette, textureFiles: world.pipeline.textureFiles }, onExit: exit, onEnter: enter, onJump: jump, decodeImage: decodePoiImage, goTo, test: world.poiTest, onTest: test });
  for (const ty of ['keydown', 'keyup']) panel.root.addEventListener(ty, route.onPanelKey);
  editor.wantsOpen = (id) => { panel.open(id).catch((e2) => console.warn('[poi] opening it', e2?.message ?? e2)); };
  document.body.append(panel.root);
  world.poiEditor = editor;
  world.poiEditorLeave = exit;
  enter();
}
