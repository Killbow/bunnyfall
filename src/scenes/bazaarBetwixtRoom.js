// @ts-check
// Host-facing room assembly, Gothway Garden Psijic Envoy, audio/music, and two-way live portal for The Bazaar Betwixt.

import { ChoiceWindow } from '../ui/talkWindow.js';
import { createCharacterRespecWindow } from '../ui/characterRespecWindow.js';
import { readPsijicSeals } from '../net/psijicSealsClient.js';
import { hasParkedRespec, parkedRespecSummary } from '../characters/characterRespec.js';
import { surfacePlayer } from '../characters/playerEntity.js';
import { autoBuildArms } from '../combat/weaponRig.js';
import { getPref } from '../ui/uiPrefs.js';
import { GLOBAL_SCALE } from '../world/meshReader.js';
import { EDITOR_FLATS_ARCHIVE } from '../world/rmbFlats.js';
import { INTERIOR_MARKER } from '../world/interiorLayout.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE } from '../player/activate.js';
import { adoptLight } from '../render/lightId.js';
import { nearestLights } from '../world/cityLights.js';
import { trs, UP_Y } from '../world/mat4.js';
import { t } from '../ui/textManager.js';
import { createBazaarAudio } from '../audio/bazaarAudio.js';
import {
  bazaarBetwixtOn,
  BAZAAR_ROOM,
  BAZAAR_ROTUNDA_MODEL_ID,
  GOTHWAY_MAP_ID,
  GOTHWAY_REGION_INDEX,
  GOTHWAY_ENVOY_LOC,
  GOTHWAY_TEAR_LOC,
  BAZAAR_PORTAL_Z,
  BAZAAR_ENTER,
  BAZAAR_CELARUS_POS,
  BAZAAR_CRAG_SPECS,
  BAZAAR_CAPSTONE_SPECS,
  BAZAAR_VISTA_POS,
  BAZAAR_VISTA_YAW_DEG,
  BAZAAR_PORTAL_TOTAL_MS,
  BAZAAR_PORTAL_PEER_REACH,
  BAZAAR_ENVOY,
  BAZAAR_MYSTIC,
  bazaarOriginFromTear,
  bazaarTearFromOrigin,
  bazaarPortalEnvelope,
  bazaarStepAcross,
  bazaarCragBobY,
  bazaarDomePose,
  clampBazaarLocalXZ,
  validBazaarPortalWord,
} from '../systems/bazaarBetwixt.js';
import {
  BAZAAR_NPC_ARCHIVE,
  ensureBazaarArt,
  ensureBazaarNpcArt,
  getBazaarNpcArtSync,
  releaseBazaarArt,
} from '../render/bazaarBetwixtArt.js';
import { disposeBazaarPortalGpu, getBazaarPortalGpu } from '../render/bazaarPortalPass.js';
import {
  bazaarCapstoneModel,
  bazaarCeporahVistaModel,
  bazaarCragModel,
  bazaarDomeModel,
  bazaarRotundaModel,
  bazaarVistaRingModel,
} from '../world/bazaarBetwixtModel.js';

export const ENVOY_TARGET_KEY = 'bazaar:envoy';
export const TEAR_TARGET_KEY = 'bazaar:tear';

const DEG2RAD = Math.PI / 180;
const _scratchMat = new Float32Array(16);
const _indoorEnvoyRight = new Float32Array(3);
const _indoorClear = new Float32Array([0, 0, 0, 1]);

const isStill = () => Boolean(
  getPref('reducedMotion') || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
);

const _bazaarAudio = createBazaarAudio();

function trsInto(
  /** @type {Float32Array} */ out,
  /** @type {number} */ tx,
  /** @type {number} */ ty,
  /** @type {number} */ tz,
  /** @type {number} */ rxDeg,
  /** @type {number} */ ryDeg,
  /** @type {number} */ rzDeg,
  /** @type {number} */ s = 1,
) {
  const rx = rxDeg * DEG2RAD, ry = ryDeg * DEG2RAD, rz = rzDeg * DEG2RAD;
  const cx = Math.cos(rx), sxn = Math.sin(rx);
  const cy = Math.cos(ry), syn = Math.sin(ry);
  const cz = Math.cos(rz), szn = Math.sin(rz);
  out[0] = (cy * cz + syn * sxn * szn) * s;
  out[1] = (cx * szn) * s;
  out[2] = (-syn * cz + cy * sxn * szn) * s;
  out[3] = 0;
  out[4] = (-cy * szn + syn * sxn * cz) * s;
  out[5] = (cx * cz) * s;
  out[6] = (syn * szn + cy * sxn * cz) * s;
  out[7] = 0;
  out[8] = (syn * cx) * s;
  out[9] = (-sxn) * s;
  out[10] = (cy * cx) * s;
  out[11] = 0;
  out[12] = tx;
  out[13] = ty;
  out[14] = tz;
  out[15] = 1;
  return out;
}

const AETHER_AMBIENT = new Float32Array([0.21, 0.25, 0.36]);
const AETHER_SUN_COLOR = new Float32Array([0.82, 0.88, 1.0]);
const AETHER_SUN_DIR = new Float32Array([0.22, 0.90, -0.36]);
const AETHER_TRILIGHT = Object.freeze({
  sky: new Float32Array([0.30, 0.38, 0.54]),
  ground: new Float32Array([0.12, 0.16, 0.26]),
});
const AETHER_FOG_COLOR = new Float32Array([0.032, 0.058, 0.135]);
const AETHER_CLEAR_COLOR = new Float32Array([0.015, 0.030, 0.082, 1.0]);
const BAZAAR_WHITE_EMISSION = new Float32Array([1.0, 1.0, 1.0]);
const OUTDOOR_TEAR_LIGHT_COLOR = new Float32Array([0.84, 0.84, 0.96]);

export const bazaarName = () => t('bazaarbetwixt.name', 'The Bazaar Betwixt');
export const bazaarGreeting = () => t(
  'bazaarbetwixt.enter',
  'You step across the astral seam into The Bazaar Betwixt, poised silently among distant stars.',
);

const BAZAAR_LIGHT_SPECS = Object.freeze([
  { x: -2.8, y: 3.4, z: -24.2, range: 13.5, color: [0.96, 0.86, 0.62], intensity: 0.95 },
  { x: 2.8, y: 3.4, z: -24.2, range: 13.5, color: [0.96, 0.86, 0.62], intensity: 0.95 },
  { x: 0.0, y: 2.0, z: -18.6, range: 15.0, color: [0.56, 0.88, 1.0], intensity: 0.92 },
  { x: -12.5, y: 2.5, z: -18.5, range: 18.0, color: [0.62, 0.88, 1.0], intensity: 0.95 },
  { x: 12.5, y: 2.5, z: -18.5, range: 18.0, color: [0.62, 0.88, 1.0], intensity: 0.95 },
  { x: -2.9, y: 4.8, z: -12.8, range: 15.5, color: [0.94, 0.87, 0.70], intensity: 0.95 },
  { x: 2.9, y: 4.8, z: -12.8, range: 15.5, color: [0.94, 0.87, 0.70], intensity: 0.95 },
  { x: 0.0, y: 2.8, z: 0.0, range: 20.0, color: [1.0, 0.90, 0.64], intensity: 0.78 },
  { x: 0.0, y: 11.2, z: 0.0, range: 24.0, color: [0.78, 0.88, 1.0], intensity: 0.95 },
  { x: -9.4, y: 4.4, z: -1.2, range: 18.0, color: [0.68, 0.84, 1.0], intensity: 0.88 },
  { x: 9.4, y: 4.4, z: -1.2, range: 18.0, color: [0.68, 0.84, 1.0], intensity: 0.88 },
  { x: 0.0, y: 4.2, z: 7.4, range: 15.5, color: [0.88, 0.88, 0.94], intensity: 0.64 },
  { x: -4.2, y: 4.6, z: 9.8, range: 14.0, color: [0.86, 0.84, 0.76], intensity: 0.58 },
  { x: 4.2, y: 4.6, z: 9.8, range: 14.0, color: [0.86, 0.84, 0.76], intensity: 0.58 },
]);

const rmbPt = (/** @type {readonly [number, number, number]} */ [x, y, z]) => ({
  xPos: Math.round(x / GLOBAL_SCALE),
  yPos: Math.round(-y / GLOBAL_SCALE),
  zPos: Math.round(z / GLOBAL_SCALE),
});

const flatAt = (/** @type {number} */ archive, /** @type {number} */ record, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => ({
  textureArchive: archive,
  textureRecord: record,
  ...rmbPt([x, y, z]),
});

let _cachedBlock = null;
let _cachedModels = null;
let _cachedPortalKey = '';
let _cachedPortalEntry = null;
/** @type {any} */
let _activeGothwayHost = null;

/** @type {WeakMap<object, { domeGpu: any, capstoneGpu: any, cragGpu: any, vistaGpu: any, vistaRingGpu: any }>} */
const _dynamicGpuByRenderer = new WeakMap();

function getDynamicGpu(/** @type {any} */ renderer) {
  if (!renderer?.createMesh) return null;
  let d = _dynamicGpuByRenderer.get(renderer);
  if (!d) {
    ensureBazaarArt(renderer);
    d = {
      domeGpu: renderer.createMesh(bazaarDomeModel()),
      capstoneGpu: renderer.createMesh(bazaarCapstoneModel()),
      cragGpu: renderer.createMesh(bazaarCragModel()),
      vistaGpu: renderer.createMesh(bazaarCeporahVistaModel()),
      vistaRingGpu: renderer.createMesh(bazaarVistaRingModel()),
    };
    _dynamicGpuByRenderer.set(renderer, d);
  }
  return d;
}

function disposeDynamicGpu(/** @type {any} */ renderer) {
  if (!renderer) return;
  const d = _dynamicGpuByRenderer.get(renderer);
  if (!d) return;
  renderer.destroyMesh?.(d.domeGpu);
  renderer.destroyMesh?.(d.capstoneGpu);
  renderer.destroyMesh?.(d.cragGpu);
  renderer.destroyMesh?.(d.vistaGpu);
  renderer.destroyMesh?.(d.vistaRingGpu);
  _dynamicGpuByRenderer.delete(renderer);
}

/**
 * @param {any} renderer
 * @param {number[]} origin
 * @param {number} timeSec
 * @param {boolean} still
 */
function drawSanctumDynamicMeshes(renderer, origin, timeSec, still) {
  const dyn = getDynamicGpu(renderer);
  if (!dyn) return;
  const ox = origin[0], oy = origin[1], oz = origin[2];

  const dome = bazaarDomePose(timeSec, still);
  renderer.drawMesh(dyn.domeGpu, trsInto(_scratchMat, ox, oy + dome.y, oz, 0, dome.yawDeg, 0, 1), null);

  for (let i = 0; i < BAZAAR_CAPSTONE_SPECS.length; i++) {
    const c = BAZAAR_CAPSTONE_SPECS[i];
    const bob = still ? 0 : Math.sin(timeSec * 1.75 + c.phase) * 0.20;
    const tx = still ? 0 : Math.sin(timeSec * 1.05 + c.phase) * 7.5;
    const tz = still ? 0 : Math.cos(timeSec * 0.92 + c.phase) * 7.5;
    const spin = still ? (c.phase * 45) : (timeSec * 26 + c.phase * 57.2958) % 360;
    renderer.drawMesh(
      dyn.capstoneGpu,
      trsInto(_scratchMat, ox + c.pos[0], oy + c.pos[1] + bob, oz + c.pos[2], tx, spin, tz, c.scale),
      null,
    );
  }

  for (let i = 0; i < BAZAAR_CRAG_SPECS.length; i++) {
    const cr = BAZAAR_CRAG_SPECS[i];
    const bob = bazaarCragBobY(timeSec, cr.phase, still);
    const yawDeg = (cr.yaw * 180) / Math.PI;
    renderer.drawMesh(
      dyn.cragGpu,
      trsInto(_scratchMat, ox + cr.pos[0], oy + cr.pos[1] + bob, oz + cr.pos[2], 0, yawDeg, 0, cr.scale),
      null,
    );
  }

  const vistaBob = still ? 0 : Math.sin(timeSec * 0.35) * 0.45;
  const vx = ox + BAZAAR_VISTA_POS[0];
  const vy = oy + BAZAAR_VISTA_POS[1] + vistaBob;
  const vz = oz + BAZAAR_VISTA_POS[2];
  renderer.drawMesh(dyn.vistaGpu, trsInto(_scratchMat, vx, vy, vz, 0, BAZAAR_VISTA_YAW_DEG, 0, 1), null);

  const spin1 = still ? 18 : (timeSec * 14.0) % 360;
  const spin2 = still ? -28 : -((timeSec * 18.5) % 360);
  renderer.drawMesh(dyn.vistaRingGpu, trsInto(_scratchMat, vx, vy + 74.5, vz, 16, spin1, -12, 12.8), null);
  renderer.drawMesh(dyn.vistaRingGpu, trsInto(_scratchMat, vx, vy + 77.5, vz, -14, spin2, 15, 9.2), null);
}

export function bazaarBlock() {
  if (_cachedBlock) return _cachedBlock;

  const objects = [
    { modelIdNum: BAZAAR_ROTUNDA_MODEL_ID, objectType: 0, xPos: 0, yPos: 0, zPos: 0, xRotation: 0, yRotation: 0, zRotation: 0 },
  ];

  const flats = [
    flatAt(EDITOR_FLATS_ARCHIVE, INTERIOR_MARKER.ENTER, BAZAAR_ENTER[0], BAZAAR_ENTER[1], BAZAAR_ENTER[2]),
  ];

  const people = [{
    ...rmbPt(BAZAAR_CELARUS_POS),
    textureArchive: BAZAAR_MYSTIC.baseArchive,
    textureRecord: BAZAAR_MYSTIC.baseRecord,
    factionID: 40,
    flags: 0,
    position: 770002,
  }];

  _cachedBlock = {
    name: 'BAZAAR_BETWIXT',
    index: -2,
    rmbBlock: {
      fldHeader: { buildingDataList: [{ buildingType: BUILDING_TYPES.GuildHall, quality: 20, factionId: 40 }] },
      subRecords: [{
        interior: {
          header: { num3dObjectRecords: objects.length },
          block3dObjectRecords: objects,
          blockFlatObjectRecords: flats,
          blockDoorRecords: [],
          blockPeopleRecords: people,
          blockSection3Records: [],
        },
      }],
    },
  };
  return _cachedBlock;
}

export function bazaarModels() {
  if (!_cachedModels) {
    _cachedModels = new Map([
      [BAZAAR_ROTUNDA_MODEL_ID, bazaarRotundaModel()],
    ]);
  }
  return _cachedModels;
}

/**
 * @param {number[]} bazaarOrigin
 * @param {any} renderer
 */
export function bazaarPortalEntry(bazaarOrigin, renderer) {
  if (!bazaarBetwixtOn() || !Array.isArray(bazaarOrigin) || bazaarOrigin.length !== 3) return null;
  ensureBazaarArt(renderer);
  const key = `${bazaarOrigin[0].toFixed(4)},${bazaarOrigin[1].toFixed(4)},${bazaarOrigin[2].toFixed(4)}`;
  if (_cachedPortalEntry && _cachedPortalKey === key) return _cachedPortalEntry;
  const dfBlock = bazaarBlock();
  const door = {
    matrix: trs(bazaarOrigin[0], bazaarOrigin[1], bazaarOrigin[2], 0, 0, 0),
    blockIndex: dfBlock.index,
    buildingKey: BAZAAR_ROOM.buildingKey,
    recordIndex: 0,
    doorIndex: 0,
    doorType: 1,
    centre: { x: 0, y: 1.5, z: BAZAAR_PORTAL_Z },
    normal: { x: 0, y: 0, z: -1 },
    size: { x: 2.4, y: 3.0, z: 0.4 },
  };
  const hit = {
    dfBlock,
    recordIndex: 0,
    door,
    climateBase: 300,
    season: 0,
    bazaarPortal: true,
    roomModels: bazaarModels(),
  };
  const building = {
    buildingType: BUILDING_TYPES.GuildHall,
    buildingKey: BAZAAR_ROOM.buildingKey,
    regionIndex: GOTHWAY_REGION_INDEX,
    name: bazaarName(),
    factionId: 40,
    quality: 20,
    insideOpenShop: true,
  };
  _cachedPortalKey = key;
  _cachedPortalEntry = { hit, entries: [hit], building };
  return _cachedPortalEntry;
}

/** @param {any[]} people */
export function seatBazaarMystic(people) {
  for (const pn of people) {
    Object.assign(pn, {
      active: true,
      bazaarMystic: true,
      questBehaviour: null,
      _mwLook: null,
      flatSwap: null,
      drawArchive: undefined,
      drawRecord: undefined,
      editorPerson: {
        name: BAZAAR_MYSTIC.name,
        lines: [],
      },
    });
  }
}

/**
 * @param {any} townTalk
 * @param {any} [respecDeps]
 */
export function openBazaarMystic(townTalk, respecDeps = null) {
  if (!townTalk?.showOverlay) return;
  const openWindow = (/** @type {'respec' | 'revert'} */ mode) => {
    if (respecDeps?.entity) {
      const win = createCharacterRespecWindow({
        ...respecDeps,
        mode,
        onApplied: (res) => {
          const { entity, magic, onCurseLifted, onApplied } = respecDeps;
          magic?.abortReadySpell?.();
          const readied = magic?.readied?.();
          if (readied && !(entity?.spells ?? []).some((s) => s === readied || (s?.index != null && s.index === readied.index))) {
            magic?.setReadiedByIndex?.(null, null);
          }
          autoBuildArms(entity);
          surfacePlayer();
          if (res?.curseChanged || res?.lifted?.vampire || res?.lifted?.were || res?.lifted?.blood) {
            onCurseLifted?.(res.lifted ?? { vampire: true, were: true, blood: 0 });
          }
          onApplied?.(res);
        },
      });
      if (win) { townTalk.showOverlay(win); return; }
    }
    showBranch(
      t(
        'bazaarbetwixt.celarusRite',
        'Before the Loom, we can unweave your mortal pattern back to its first breath, letting you walk anew from your beginning. Such a working requires a Psijic Seal, granted only when our Order judges a thread truly tangled.',
      ),
    );
  };
  const openRespecIfSealed = () => {
    if (!respecDeps?.entity) { openWindow('respec'); return; }
    readPsijicSeals(respecDeps.entity).then((res) => {
      if (res.ok && res.balance < 1) {
        showBranch(t('bazaarbetwixt.celarusNoSeal',
          'The Loom asks a Psijic Seal for this working, and you carry none. Return when our Order has granted you one.'));
      } else openWindow('respec');
    }, () => openWindow('respec'));
  };
  const showMain = () => {
    const parked = respecDeps?.entity && hasParkedRespec(respecDeps.entity)
      ? parkedRespecSummary(respecDeps.entity)
      : null;
    const options = [
      {
        code: 'Digit1',
        label: t('bazaarbetwixt.celarusRiteOpt', '1 - Unweave my thread.'),
        action: () => openRespecIfSealed(),
      },
    ];
    if (parked) {
      const shortClass = parked.className.length > 16 ? `${parked.className.slice(0, 13)}...` : parked.className;
      options.push(
        {
          code: 'Digit2',
          label: t(
            'bazaarbetwixt.celarusRevertOpt',
            '2 - Restore my banked pattern ({className}, Level {level}).',
            { className: shortClass, level: parked.level },
          ),
          action: () => openWindow('revert'),
        },
        {
          code: 'Digit3',
          label: t('bazaarbetwixt.celarusLoreOptBanked', '3 - What is this place?'),
          action: () => showBranch(
            t(
              'bazaarbetwixt.celarusLore',
              'Our Order raised this crossing between eras upon a crag of Artaeum, where envoys exchange counsel and rarities beyond Tamriel\'s hours. While the threads of Mundus remain in flux, only the Loom stands open.',
            ),
          ),
        },
        {
          code: 'Digit4',
          label: t('bazaarbetwixt.celarusCloseBanked', '4 - Farewell.'),
          action: () => {},
        },
      );
    } else {
      options.push(
        {
          code: 'Digit2',
          label: t('bazaarbetwixt.celarusLoreOpt', '2 - What is this place?'),
          action: () => showBranch(
            t(
              'bazaarbetwixt.celarusLore',
              'Our Order raised this crossing between eras upon a crag of Artaeum, where envoys exchange counsel and rarities beyond Tamriel\'s hours. While the threads of Mundus remain in flux, only the Loom stands open.',
            ),
          ),
        },
        {
          code: 'Digit3',
          label: t('bazaarbetwixt.celarusClose', '3 - Farewell.'),
          action: () => {},
        },
      );
    }
    options.push({ code: 'Escape', label: '', action: () => {} });
    townTalk.showOverlay(new ChoiceWindow({
      lines: [
        t(
          'bazaarbetwixt.celarusGreeting',
          'Welcome to The Bazaar Betwixt. Though the threads of Mundus are forever in flux, my Order offers a glimpse of what could have been, and what may still yet be.',
        ),
      ],
      options,
    }));
  };

  const showBranch = (/** @type {string} */ text) => {
    townTalk.showOverlay(new ChoiceWindow({
      lines: [text],
      options: [
        { code: 'Digit1', label: t('bazaarbetwixt.celarusBackOpt', '1 - I have another question.'), action: () => showMain() },
        { code: 'Digit2', label: t('bazaarbetwixt.celarusBranchClose', '2 - Farewell.'), action: () => {} },
        { code: 'Escape', label: '', action: () => {} },
      ],
    }));
  };

  showMain();
}

/**
 * @param {any} ctx
 * @param {number[]} bazaarOrigin
 * @param {any} renderer
 * @param {(archive: number) => Promise<any>} getTexture
 * @returns {Promise<void> | void}
 */
export function setupBazaarInteriorCtx(ctx, bazaarOrigin, renderer, getTexture) {
  ctx.bazaarBetwixt = true;
  ctx.bazaarOrigin = [bazaarOrigin[0], bazaarOrigin[1], bazaarOrigin[2]];
  ctx.roomLamps = true;
  ctx.lights = BAZAAR_LIGHT_SPECS.map((s) => ({
    x: bazaarOrigin[0] + s.x,
    y: bazaarOrigin[1] + s.y,
    z: bazaarOrigin[2] + s.z,
    range: s.range,
    color: [...s.color],
    intensity: s.intensity,
  }));
  const applyPeople = (/** @type {{ frames: number, celarusFrames?: number, celarusSize?: { w: number, h: number } } | null} */ art) => {
    ctx.bazaarNpcFrames = art?.frames ?? 1;
    ctx.bazaarCelarusFrames = art?.celarusFrames ?? 1;
    const sz = art?.celarusSize ?? null;
    for (const pn of ctx.people ?? []) {
      if (!pn.standBatch) continue;
      ctx.flatAnims?.remove?.(pn.standBatch);
      if (sz && renderer?.createBillboardBatch && !pn._bazaarSized) {
        const oldBatch = pn.standBatch;
        const fresh = renderer.createBillboardBatch(
          BAZAAR_NPC_ARCHIVE,
          `${BAZAAR_MYSTIC.record}#0`,
          sz,
          [[pn.x, pn.y, pn.z]],
        );
        fresh.frame = null;
        const idx = Array.isArray(ctx.billboardBatches) ? ctx.billboardBatches.indexOf(oldBatch) : -1;
        if (idx >= 0) ctx.billboardBatches[idx] = fresh;
        else ctx.billboardBatches?.push?.(fresh);
        renderer.destroyBillboardBatch?.(oldBatch);
        pn.standBatch = fresh;
        pn.width = sz.w;
        pn.height = sz.h;
        pn._bazaarSized = true;
      } else {
        pn.standBatch.archive = BAZAAR_NPC_ARCHIVE;
        pn.standBatch.record = `${BAZAAR_MYSTIC.record}#0`;
        pn.standBatch.frame = null;
      }
    }
  };
  const syncArt = getBazaarNpcArtSync(renderer);
  if (syncArt) {
    applyPeople(syncArt);
    return;
  }
  return ensureBazaarNpcArt(renderer, getTexture).then(applyPeople);
}

/** @param {any} renderer */
export function applyBazaarLighting(renderer) {
  renderer.setLighting(AETHER_AMBIENT, 0.34, AETHER_SUN_COLOR, AETHER_TRILIGHT);
  renderer.setMoonlight(null);
  renderer.setFog('exp', 0.00028, 0, 0, AETHER_FOG_COLOR);
  renderer.setWindowEmission(BAZAAR_WHITE_EMISSION);
  renderer.setClearColor(AETHER_CLEAR_COLOR);
}

export const bazaarLightDir = () => AETHER_SUN_DIR;

/** @param {number[] | null} doorOrigin */
export const bazaarRoomIdentity = (doorOrigin) => ({
  buildingKey: BAZAAR_ROOM.buildingKey,
  layout: null,
  sharedMapId: BAZAAR_ROOM.mapId,
  sharedOrigin: doorOrigin ? [doorOrigin[0], doorOrigin[1], doorOrigin[2]] : [0, 0, 0],
});

/**
 * Clamp player horizontally across the Arrival Crag, Hard-Light Causeway, and Grand Rotunda.
 * @param {any} player
 * @param {number[] | null | undefined} bazaarOrigin
 */
export function clampBazaarPlatform(player, bazaarOrigin) {
  if (!player?.pos || !bazaarOrigin) return;
  const dx = player.pos[0] - bazaarOrigin[0];
  const dz = player.pos[2] - bazaarOrigin[2];
  const [cx, cz] = clampBazaarLocalXZ(dx, dz);
  player.pos[0] = bazaarOrigin[0] + cx;
  player.pos[2] = bazaarOrigin[2] + cz;
}

class BazaarPreviewScene {
  /**
   * @param {any} renderer
   * @param {(archive: number) => Promise<any>} getTexture
   */
  constructor(renderer, getTexture) {
    this.renderer = renderer;
    ensureBazaarArt(renderer);
    this.rotundaGpu = renderer.createMesh(bazaarRotundaModel());
    this.celarusBatch = null;
    this._camRight = new Float32Array(3);
    this._rotMat = new Float32Array(16);
    this._ranges = new Float32Array(BAZAAR_LIGHT_SPECS.map((s) => s.range));
    this._worldLights = BAZAAR_LIGHT_SPECS.map((s) => ({
      ...s,
      color: [s.color[0] * s.intensity, s.color[1] * s.intensity, s.color[2] * s.intensity],
    }));

    ensureBazaarNpcArt(renderer, getTexture).then((art) => {
      if (!art || !this.rotundaGpu) return;
      const sz = art.celarusSize ?? { w: art.w, h: art.h };
      this.celarusBatch = renderer.createBillboardBatch(BAZAAR_NPC_ARCHIVE, `${BAZAAR_MYSTIC.record}#0`, sz, [[0, 0, 0]]);
      this.celarusBatch.origin = [0, 0, 0];
      this.npcFrames = art.frames;
      this.celarusFrames = art.celarusFrames ?? 1;
    });
  }

  dispose() {
    if (this.rotundaGpu) {
      this.renderer?.destroyMesh?.(this.rotundaGpu);
      this.rotundaGpu = null;
    }
    if (this.celarusBatch) {
      this.renderer?.destroyBillboardBatch?.(this.celarusBatch);
      this.celarusBatch = null;
    }
  }

  /**
   * @param {any} portalGpu @param {number[]} bazaarOrigin @param {number} camYaw
   * @param {number[]} eye @param {number} timeSec
   */
  sceneAt(portalGpu, bazaarOrigin, camYaw, eye, timeSec) {
    const mat = trsInto(this._rotMat, bazaarOrigin[0], bazaarOrigin[1], bazaarOrigin[2], 0, 0, 0, 1);
    const still = isStill();
    for (let i = 0; i < BAZAAR_LIGHT_SPECS.length; i++) {
      const s = BAZAAR_LIGHT_SPECS[i];
      this._worldLights[i].x = bazaarOrigin[0] + s.x;
      this._worldLights[i].y = bazaarOrigin[1] + s.y;
      this._worldLights[i].z = bazaarOrigin[2] + s.z;
    }
    return {
      setup: (/** @type {any} */ r) => {
        applyBazaarLighting(r);
        const sel = /** @type {{ data: any, colors: Float32Array }} */ (
          nearestLights(this._worldLights, eye, r.maxPointLights, /** @type {any} */ (this._ranges), (l) => l.color)
        );
        r.setPointLights(sel.data, null, sel.colors);
        return AETHER_SUN_DIR;
      },
      draw: (/** @type {any} */ { renderer: r, proj, view }) => {
        if (!this.rotundaGpu) return;
        r.drawMesh(this.rotundaGpu, mat, null);
        drawSanctumDynamicMeshes(r, bazaarOrigin, timeSec, still);
        portalGpu.drawBazaarSky(proj, view, timeSec, 1, still);
        if (this.celarusBatch) {
          const cfr = still ? 0 : Math.floor((timeSec * 5) % (this.celarusFrames || 1));
          this.celarusBatch.record = `${BAZAAR_MYSTIC.record}#${cfr}`;
          this.celarusBatch.origin[0] = bazaarOrigin[0] + BAZAAR_CELARUS_POS[0];
          this.celarusBatch.origin[1] = bazaarOrigin[1] + BAZAAR_CELARUS_POS[1];
          this.celarusBatch.origin[2] = bazaarOrigin[2] + BAZAAR_CELARUS_POS[2];
          this._camRight[0] = Math.cos(camYaw);
          this._camRight[1] = 0;
          this._camRight[2] = -Math.sin(camYaw);
          r.drawBillboards([this.celarusBatch], this._camRight, UP_Y);
        }
        portalGpu.drawSanctumPower({ proj, view, eye, origin: bazaarOrigin, playerFeet: null, timeSec, lod: 1, still });
      },
    };
  }
}

/** @type {WeakMap<object, BazaarPreviewScene>} */
const _previewByRenderer = new WeakMap();

function getPreviewScene(/** @type {any} */ renderer, /** @type {any} */ getTexture) {
  let s = _previewByRenderer.get(renderer);
  if (!s) {
    s = new BazaarPreviewScene(renderer, getTexture);
    _previewByRenderer.set(renderer, s);
  }
  return s;
}

function disposePreviewScene(/** @type {any} */ renderer) {
  if (!renderer) return;
  const s = _previewByRenderer.get(renderer);
  if (s) {
    s.dispose();
    _previewByRenderer.delete(renderer);
  }
}

/**
 * Indoor frame helpers called by worldModes when `interiorCtx.bazaarBetwixt` is active.
 * @param {{ free?: (ctx: any) => void }} [deps]
 */
export function createBazaarIndoorRuntime(deps = {}) {
  let innerTex = null;
  let stepArmed = false;
  let prevFeet = null;
  /** @type {{ pos: number[], yaw: number } | null} */
  let pendingExit = null;
  /** @type {{ key: string, done: Promise<any> } | null} */
  let warmSlot = null;
  let readyKey = '';
  /** @type {any} */
  let readyCtx = null;

  const originKey = (/** @type {number[]} */ o) => `${o[0].toFixed(3)},${o[1].toFixed(3)},${o[2].toFixed(3)}`;

  function dropWarm() {
    if (readyCtx) {
      deps.free?.(readyCtx);
      readyCtx = null;
      readyKey = '';
    }
    if (!warmSlot) return;
    const old = warmSlot;
    warmSlot = null;
    old.done.then((ctx) => { if (ctx) deps.free?.(ctx); });
  }

  return {
    resetStep() {
      stepArmed = false;
      prevFeet = null;
      innerTex = null;
      pendingExit = null;
    },
    releaseWarm() {
      dropWarm();
    },
    onExit() {
      stepArmed = false;
      prevFeet = null;
      innerTex = null;
      pendingExit = null;
      _bazaarAudio.onExitSanctum();
      _activeGothwayHost?.forgetStep?.();
    },
    /**
     * @param {number[]} origin
     * @param {any} renderer
     * @param {(hit: any, entries: any[], restore: any, live: () => boolean, pre: any) => Promise<any>} interiorTransition
     * @param {((archive: number) => Promise<any>) | null} [getTexture]
     */
    prebuild(origin, renderer, interiorTransition, getTexture = null) {
      const e = bazaarPortalEntry(origin, renderer);
      if (!e) return;
      const key = originKey(origin);
      if ((readyCtx && readyKey === key) || (warmSlot && warmSlot.key === key)) return;
      dropWarm();
      const texFn = getTexture ?? (() => Promise.resolve(null));
      const pre = (/** @type {string} */ _plan, /** @type {() => Promise<any>} */ buildRoom) => {
        const slot = {
          key,
          done: Promise.resolve().then(buildRoom).then((ctx) => {
            if (ctx && warmSlot === slot) {
              setupBazaarInteriorCtx(ctx, origin, renderer, texFn);
              readyKey = key;
              readyCtx = ctx;
              warmSlot = null;
            }
            return ctx;
          }).catch(() => null),
        };
        warmSlot = slot;
      };
      interiorTransition(e.hit, e.entries, { building: e.building }, () => true, pre).catch(() => {});
    },
    /** @param {number[]} origin */
    takeReadyCtx(origin) {
      if (!readyCtx || !Array.isArray(origin)) return null;
      if (readyKey !== originKey(origin)) {
        deps.free?.(readyCtx);
        readyCtx = null;
        readyKey = '';
        return null;
      }
      const c = readyCtx;
      readyCtx = null;
      readyKey = '';
      return c;
    },
    async takeWarmCtx() {
      if (readyCtx) {
        const c = readyCtx;
        readyCtx = null;
        readyKey = '';
        return c;
      }
      if (!warmSlot) return null;
      const s = warmSlot;
      warmSlot = null;
      const ctx = await s.done;
      if (readyCtx === ctx) {
        readyCtx = null;
        readyKey = '';
      }
      return ctx;
    },
    /** @param {any} ctx */
    parkCtx(ctx) {
      this.onExit();
      if (!ctx?.bazaarOrigin) {
        if (ctx) deps.free?.(ctx);
        return;
      }
      const key = originKey(ctx.bazaarOrigin);
      if (readyCtx && readyCtx !== ctx) deps.free?.(readyCtx);
      readyCtx = ctx;
      readyKey = key;
    },
    /** @param {any} ctx */
    forceLeave(ctx) {
      this.onExit();
      dropWarm();
      if (ctx) ctx.destroy?.();
    },
    /** @param {any} saved */
    matchesSave(saved) {
      return ((saved?.door?.buildingKey ?? saved?.building?.buildingKey ?? 0) >>> 0) === (BAZAAR_ROOM.buildingKey >>> 0)
        || saved?.door?.blockIndex === -2;
    },
    /**
     * @param {any} _saved
     * @param {number[] | null} pos
     * @param {{ mode: string, renderer: any, enterInteriorCore: any, player: any, cam: any, floorLanding: any }} h
     */
    async restoreSaved(_saved, pos, { mode, renderer, enterInteriorCore, player, cam, floorLanding }) {
      if (mode !== 'exterior' || !bazaarBetwixtOn()) return false;
      const origin = _activeGothwayHost?.resolveTearOrigin?.() ?? null;
      if (!origin) return false;
      const e = bazaarPortalEntry(origin, renderer);
      if (!e) return false;
      this.resetStep();
      let restorePos = [origin[0] + BAZAAR_ENTER[0], origin[1] + BAZAAR_ENTER[1] + 0.9, origin[2] + BAZAAR_ENTER[2]];
      if (Array.isArray(pos) && pos.length === 3 && pos.every(Number.isFinite)) {
        const cl = clampBazaarLocalXZ(pos[0] - origin[0], pos[2] - origin[2]);
        restorePos = [origin[0] + cl[0], pos[1], origin[2] + cl[1]];
      }
      const ok = await enterInteriorCore(e.hit, e.entries, {
        building: e.building,
        pos: restorePos,
        portalArrival: true,
      });
      if (ok && player?.collider && floorLanding) {
        const floored = floorLanding(player.collider, restorePos);
        player.spawn(floored[0], floored[1], floored[2]);
        cam.pos = player.eyeAt ? player.eyeAt() : [...player.eye];
        if (Array.isArray(pos) && pos.length === 3) {
          pos[0] = cam.pos[0];
          pos[1] = cam.pos[1];
          pos[2] = cam.pos[2];
        }
      }
      return ok;
    },
    /**
     * @param {{ origin: number[], arrivalPos: number[], arrivalYaw: number }} p
     * @param {{ mode: string, renderer: any, enterInteriorCore: any, player: any, cam: any, floorLanding: any }} h
     */
    async enter({ origin, arrivalPos, arrivalYaw }, { mode, renderer, enterInteriorCore, player, cam, floorLanding }) {
      if (mode !== 'exterior') return false;
      const e = bazaarPortalEntry(origin, renderer);
      if (!e) return false;
      this.resetStep();
      const ok = await enterInteriorCore(e.hit, e.entries, {
        building: e.building,
        pos: arrivalPos,
        portalArrival: true,
      });
      if (ok && player?.collider) {
        const floored = floorLanding(player.collider, arrivalPos);
        player.spawn(floored[0], floored[1], floored[2]);
        cam.yaw = arrivalYaw;
        cam.pos = player.eyeAt ? player.eyeAt() : [...player.eye];
        getBazaarPortalGpu(renderer)?.triggerThresholdPulse(performance.now());
        _bazaarAudio.playThresholdWash(true);
      }
      return ok;
    },
    /**
     * @param {any} player
     * @param {any} cam
     * @param {any} ctx
     */
    motor(player, cam, ctx) {
      if (!ctx?.bazaarBetwixt) return;
      clampBazaarPlatform(player, ctx.bazaarOrigin);
      const feet = player.feetAt ? player.feetAt() : player.pos;
      _bazaarAudio.updateIndoorSanctum({
        origin: ctx.bazaarOrigin,
        feet,
        grounded: !!player.grounded,
        nowMs: performance.now(),
        still: isStill(),
      });
      const outFeet = this.step(feet, ctx);
      if (outFeet) pendingExit = { pos: [outFeet[0], outFeet[1] + 0.9, outFeet[2]], yaw: cam.yaw };
    },
    /**
     * @param {(landing: number[]) => boolean} exitInteriorNow
     * @param {any} player
     * @param {any} cam
     * @param {any} [renderer]
     */
    takeExit(exitInteriorNow, player, cam, renderer) {
      if (!pendingExit) return false;
      const ex = pendingExit;
      this.onExit();
      if (exitInteriorNow(ex.pos)) {
        cam.yaw = ex.yaw;
        cam.pos = player.eyeAt ? player.eyeAt() : [...player.eye];
        if (renderer) getBazaarPortalGpu(renderer)?.triggerThresholdPulse(performance.now());
        _bazaarAudio.playThresholdWash(false);
      }
      return true;
    },
    /**
     * @param {{ renderer: any, ctx: any, proj: Float32Array, view: Float32Array, eye: number[], cam: any, host: any, fovY: number, aspect: number, nowMs: number }} p
     */
    preFrame({ renderer, ctx, proj, view, eye, cam, host, fovY, aspect, nowMs }) {
      innerTex = null;
      if (!ctx?.bazaarOrigin) return;
      const cfr = isStill() ? 0 : Math.floor(((nowMs / 1000) * 5) % (ctx.bazaarCelarusFrames || 1));
      for (const pn of ctx.people ?? []) {
        if (pn.standBatch) {
          pn.standBatch.archive = BAZAAR_NPC_ARCHIVE;
          pn.standBatch.record = `${BAZAAR_MYSTIC.record}#${cfr}`;
          pn.standBatch.frame = null;
        }
      }

      const portalGpu = getBazaarPortalGpu(renderer);
      const outside = host.outsideView?.() ?? null;
      if (!portalGpu || !outside) return;
      const tearPos = bazaarTearFromOrigin(ctx.bazaarOrigin);
      const viewEye = eye ?? cam.pos;
      if (Math.hypot(viewEye[0] - tearPos[0], viewEye[2] - tearPos[2]) > 56) return;

      innerTex = portalGpu.renderTarget('inner', proj, view, viewEye, tearPos, 2400, {
        useKeptExterior: true,
        setup: (/** @type {any} */ r) => {
          const sunDir = outside.setup?.(r);
          _indoorClear[0] = r._fogColor[0];
          _indoorClear[1] = r._fogColor[1];
          _indoorClear[2] = r._fogColor[2];
          r.setClearColor(_indoorClear);
          return sunDir;
        },
        draw: (/** @type {any} */ info) => {
          outside.draw(info);
          const envoyBatch = _activeGothwayHost?.envoyBatchForIndoor?.(nowMs) ?? null;
          if (envoyBatch) {
            _indoorEnvoyRight[0] = Math.cos(cam.yaw);
            _indoorEnvoyRight[1] = 0;
            _indoorEnvoyRight[2] = -Math.sin(cam.yaw);
            info.renderer.drawBillboards([envoyBatch], _indoorEnvoyRight, UP_Y);
          }
          host.drawSky?.(cam.yaw, cam.pitch, fovY, aspect, [0, 0, 960, 600]);
        },
      });
    },
    /**
     * @param {any} renderer @param {any} ctx @param {Float32Array} proj
     * @param {Float32Array} view @param {number} nowMs
     */
    drawOpaque(renderer, ctx, proj, view, nowMs) {
      if (!ctx?.bazaarOrigin) return;
      const timeSec = nowMs / 1000;
      const still = isStill();
      drawSanctumDynamicMeshes(renderer, ctx.bazaarOrigin, timeSec, still);
      getBazaarPortalGpu(renderer)?.drawBazaarSky(proj, view, timeSec, 0, still);
    },
    /**
     * @param {{ renderer: any, ctx: any, proj: Float32Array, view: Float32Array, eye: number[], playerFeet?: number[] | null, nowMs: number }} p
     */
    drawTranslucent({ renderer, ctx, proj, view, eye, playerFeet, nowMs }) {
      if (!ctx?.bazaarOrigin) return;
      const portalGpu = getBazaarPortalGpu(renderer);
      if (!portalGpu) return;
      const timeSec = nowMs / 1000;
      const still = isStill();
      const tearPos = bazaarTearFromOrigin(ctx.bazaarOrigin);
      portalGpu.drawTearWindow({
        proj,
        view,
        eye,
        tearPos,
        gateYaw: Math.PI,
        tex: innerTex,
        timeSec,
        slashProgress: 1.0,
        openProgress: 1.0,
        veilMix: innerTex ? 0.0 : 1.0,
      });
      portalGpu.drawSanctumPower({
        proj,
        view,
        eye,
        origin: ctx.bazaarOrigin,
        playerFeet: playerFeet ?? null,
        timeSec,
        lod: 0,
        still,
      });
      if (!still) portalGpu.drawTimeMotes(proj, view, ctx.bazaarOrigin, timeSec, 'sanctum');
      portalGpu.drawTimeMotes(proj, view, tearPos, timeSec, 'portal', Math.PI, 1.0);
      portalGpu.drawThresholdPulse(nowMs);
    },
    /**
     * @param {number[] | null} feet
     * @param {any} ctx
     */
    step(feet, ctx) {
      if (!feet || !ctx?.bazaarOrigin) return null;
      const tearPos = bazaarTearFromOrigin(ctx.bazaarOrigin);
      const res = bazaarStepAcross(prevFeet, feet, tearPos, Math.PI, stepArmed);
      stepArmed = res.armed;
      prevFeet = [feet[0], feet[1], feet[2]];
      return res.crossed ? res.arrivalFeet : null;
    },
  };
}

/** @type {any} */
let _gothwayDeps = null;
/** @type {any} */
let _gothwayRenderer = null;

/**
 * Outdoor Gothway Garden Envoy + Summoned Astral Tear runtime shared across world frame bags.
 * @param {any} shared
 */
export function getBazaarGothwayHost(shared) {
  if (!shared || typeof shared !== 'object') return _activeGothwayHost;
  if (shared.renderer && shared.renderer !== _gothwayRenderer) {
    _gothwayRenderer = shared.renderer;
    _activeGothwayHost = null;
    _gothwayDeps = null;
  }
  const d = (_gothwayDeps ??= {});
  for (const k of [
    'built', 'state', 'cam', 'player', 'renderer', 'modes', 'townTalk', 'pipeline', 'getTexture',
    'personTex', 'collider', 'surfaceAt', 'heightAt', 'exteriorFoes', '_fr', '_mode', 'params', 'onlineToScene',
  ]) {
    if (!(k in d) && k in shared) {
      const desc = Object.getOwnPropertyDescriptor(shared, k);
      if (desc) Object.defineProperty(d, k, desc);
    }
  }
  if ('online' in shared && !d.onlineSrc) d.onlineSrc = shared;

  if (_activeGothwayHost) {
    if (typeof window !== 'undefined' && d.params?.has?.('shot')) {
      /** @type {any} */ (window).__bazaarGothway = _activeGothwayHost;
    }
    return _activeGothwayHost;
  }
  if (!d.renderer || !d.built) return null;

  const getTexture = (/** @type {number} */ a) => (
    d.getTexture ? d.getTexture(a) : d.pipeline?.getTexture ? d.pipeline.getTexture(a) : d.personTex?.get?.(a) ?? null
  );
  const groundAt = (/** @type {number} */ x, /** @type {number} */ z) => {
    const s = d.surfaceAt?.(x, z);
    if (Number.isFinite(s)) return s;
    const c = d.collider?.heightAt?.(x, z);
    if (Number.isFinite(c)) return c;
    return d.heightAt?.(x, z);
  };

  let envoyArt = null;
  let envoyArtAsked = false;
  let warmedSanctum = false;
  let envoyBatch = null;
  let envoyBox = null;
  let envoyScenePos = null;
  let tearScenePos = null;
  let peerHooked = false;

  /** @type {{ id: string, owner: string | null, openedAt: number, until: number } | null} */
  let activeGate = null;
  let sealPlayedId = '';
  let gateSeq = 0;
  let wireDirty = false;
  let outerTex = null;
  let stepArmed = false;
  let prevFeet = null;
  let entering = false;
  const lightAnchor = {};

  function findGothwayEntry() {
    if (!d.built) return null;
    for (const p of d.built.values()) {
      if (p.homeTown === GOTHWAY_MAP_ID && p.locOrigin) return p;
    }
    return null;
  }

  function unloadGothwayResources() {
    if (!warmedSanctum && !envoyBatch && !envoyArtAsked) return;
    warmedSanctum = false;
    envoyArtAsked = false;
    envoyArt = null;
    activeGate = null;
    outerTex = null;
    if (envoyBatch) {
      d.renderer?.destroyBillboardBatch?.(envoyBatch);
      envoyBatch = null;
    }
    d.modes?.releaseBazaarPortal?.();
    disposePreviewScene(d.renderer);
    disposeDynamicGpu(d.renderer);
    disposeBazaarPortalGpu(d.renderer);
    releaseBazaarArt(d.renderer);
    _bazaarAudio.releaseAll();
  }

  function summonGate() {
    if (!tearScenePos) return false;
    const now = performance.now();
    if (activeGate && now < activeGate.until - 1500) {
      d.townTalk?.say?.(t('bazaarbetwixt.alreadyOpen', 'The way already stands open beside me. Step through into The Bazaar Betwixt.'));
      return true;
    }
    activeGate = {
      id: `bz${Math.floor(now).toString(36)}${(gateSeq++).toString(36)}`,
      owner: null,
      openedAt: now,
      until: now + BAZAAR_PORTAL_TOTAL_MS,
    };
    sealPlayedId = '';
    wireDirty = true;
    stepArmed = false;
    prevFeet = null;
    const origin = bazaarOriginFromTear(tearScenePos);
    d.modes?.prebuildBazaarPortal?.(origin);
    _bazaarAudio.playSummonSlash();
    d.townTalk?.say?.(t('bazaarbetwixt.summoned', 'Valenis parts the air with a quiet gesture, opening the way to The Bazaar Betwixt.'));
    return true;
  }

  function applyPeerGate(/** @type {string} */ owner, /** @type {any} */ raw) {
    if (!bazaarBetwixtOn() || !owner || !tearScenePos) return false;
    const w = validBazaarPortalWord(raw);
    if (!w) return false;
    const online = d.onlineSrc?.online;
    const peer = online?.peers?.get?.(owner);
    const peerScene = peer?.shown && d.onlineToScene ? d.onlineToScene(peer.shown) : null;
    if (!peerScene || Math.hypot(peerScene[0] - tearScenePos[0], peerScene[2] - tearScenePos[2]) > BAZAAR_PORTAL_PEER_REACH) {
      return false;
    }
    const now = performance.now();
    if (activeGate && now < activeGate.until) {
      if (activeGate.id === w.i) {
        activeGate.until = Math.min(activeGate.until, now + w.r);
        return true;
      }
      return false;
    }
    const elapsed = Math.max(0, BAZAAR_PORTAL_TOTAL_MS - w.r);
    activeGate = { id: w.i, owner, openedAt: now - elapsed, until: now + w.r };
    sealPlayedId = '';
    stepArmed = false;
    prevFeet = null;
    d.modes?.prebuildBazaarPortal?.(bazaarOriginFromTear(tearScenePos));
    if (elapsed < 400) _bazaarAudio.playSummonSlash();
    return true;
  }

  function openEnvoyDialogue() {
    if (!d.townTalk?.showOverlay) return;
    const now = performance.now();
    const isOpen = !!activeGate && now < activeGate.until - 1500;
    const showWho = () => {
      const whoOptions = isOpen
        ? [
            { code: 'Digit1', label: t('bazaarbetwixt.envoyLeaveOpen', '1 - Farewell.'), action: () => {} },
            { code: 'Escape', label: '', action: () => {} },
          ]
        : [
            { code: 'Digit1', label: t('bazaarbetwixt.envoyOpenNow', '1 - Open the way.'), action: () => { summonGate(); } },
            { code: 'Digit2', label: t('bazaarbetwixt.envoyLeave', '2 - Farewell.'), action: () => {} },
            { code: 'Escape', label: '', action: () => {} },
          ];
      d.townTalk.showOverlay(new ChoiceWindow({
        lines: [
          t(
            'bazaarbetwixt.envoyWho',
            'I keep watch here for the isle of Artaeum. Beyond this seam lies The Bazaar Betwixt, where Master Celarus tends mortal threads upon the Loom of Mundus.',
          ),
        ],
        options: whoOptions,
      }));
    };

    const lines = [
      t(
        'bazaarbetwixt.envoyGreeting',
        'Peace to you, traveler. I am Valenis of Artaeum. By leave of the Psijic Order, I hold open the way to The Bazaar Betwixt for those whose paths have grown tangled.',
      ),
    ];
    const options = isOpen
      ? [
          { code: 'Digit1', label: t('bazaarbetwixt.envoyWhoOpenOpt', '1 - Who are you?'), action: showWho },
          { code: 'Digit2', label: t('bazaarbetwixt.envoyCloseOpen', '2 - Farewell.'), action: () => {} },
          { code: 'Escape', label: '', action: () => {} },
        ]
      : [
          { code: 'Digit1', label: t('bazaarbetwixt.envoyOpenOpt', '1 - Open the way.'), action: () => { summonGate(); } },
          { code: 'Digit2', label: t('bazaarbetwixt.envoyWhoOpt', '2 - Who are you?'), action: showWho },
          { code: 'Digit3', label: t('bazaarbetwixt.envoyClose', '3 - Farewell.'), action: () => {} },
          { code: 'Escape', label: '', action: () => {} },
        ];
    d.townTalk.showOverlay(new ChoiceWindow({ lines, options }));
  }

  function envelopeNow(now = performance.now()) {
    if (!activeGate) return { active: false, slashProgress: 0, openProgress: 0, veilMix: 1, sealing: false };
    if (now >= activeGate.until) {
      activeGate = null;
      outerTex = null;
      return { active: false, slashProgress: 0, openProgress: 0, veilMix: 1, sealing: false };
    }
    return bazaarPortalEnvelope(now - activeGate.openedAt, activeGate.until - activeGate.openedAt);
  }

  const api = {
    /**
     * @param {number} now
     * @param {any[]} sceneLightsOut
     */
    poolsFrame(now, sceneLightsOut) {
      outerTex = null;
      envoyScenePos = null;
      tearScenePos = null;
      envoyBox = null;
      if (!peerHooked && d.exteriorFoes?.setOnBazaarPortal) {
        d.exteriorFoes.setOnBazaarPortal(applyPeerGate);
        peerHooked = true;
      }
      if (!bazaarBetwixtOn()) {
        unloadGothwayResources();
        return;
      }

      const renderer = d.renderer;
      const state = d.state;
      const cam = d.cam;
      const entry = findGothwayEntry();
      if (!entry || !state || !renderer || !cam) {
        if ((d._mode?.() ?? 'exterior') === 'exterior') unloadGothwayResources();
        return;
      }
      const tr = state.pixelTranslation(entry.px, entry.py);
      if (!tr) return;

      const ex = tr[0] + entry.locOrigin[0] + GOTHWAY_ENVOY_LOC[0];
      const ez = tr[2] + entry.locOrigin[2] + GOTHWAY_ENVOY_LOC[2];
      const eyRaw = groundAt(ex, ez);
      const ey = Number.isFinite(eyRaw) ? eyRaw : (tr[1] + entry.locOrigin[1]);

      const tx = tr[0] + entry.locOrigin[0] + GOTHWAY_TEAR_LOC[0];
      const tz = tr[2] + entry.locOrigin[2] + GOTHWAY_TEAR_LOC[2];
      const tyRaw = groundAt(tx, tz);
      const ty = Number.isFinite(tyRaw) ? tyRaw : ey;

      envoyScenePos = [ex, ey, ez];
      tearScenePos = [tx, ty, tz];

      if (!envoyArtAsked && (d.getTexture || d.pipeline?.getTexture || d.personTex)) {
        envoyArtAsked = true;
        ensureBazaarNpcArt(renderer, getTexture).then((art) => {
          envoyArt = art;
          if (!art) envoyArtAsked = false;
        });
      }
      if (!warmedSanctum && d.modes?.prebuildBazaarPortal && (d.getTexture || d.pipeline?.getTexture)) {
        warmedSanctum = true;
        getBazaarPortalGpu(renderer);
        getDynamicGpu(renderer);
        getPreviewScene(renderer, getTexture);
        d.modes.prebuildBazaarPortal(bazaarOriginFromTear(tearScenePos));
      }
      if (envoyArt && !envoyBatch && renderer.createBillboardBatch) {
        envoyBatch = renderer.createBillboardBatch(BAZAAR_NPC_ARCHIVE, `${BAZAAR_ENVOY.record}#0`, { w: envoyArt.w, h: envoyArt.h }, [[0, 0, 0]]);
        envoyBatch.origin = [0, 0, 0];
      }
      if (envoyBatch && envoyArt) {
        const fr = isStill() ? 0 : Math.floor(((now / 1000) * 4) % (envoyArt.frames || 1));
        envoyBatch.record = `${BAZAAR_ENVOY.record}#${fr}`;
        envoyBatch.origin[0] = ex;
        envoyBatch.origin[1] = ey;
        envoyBatch.origin[2] = ez;
        envoyBox = [{
          key: ENVOY_TARGET_KEY,
          aabb: { min: [ex - 0.55, ey, ez - 0.55], max: [ex + 0.55, ey + envoyArt.h, ez + 0.55] },
          distance: RAY_DISTANCE,
          reach: STATIC_NPC_ACTIVATION_DISTANCE,
          noSurface: false,
        }];
      }

      if ((d._mode?.() ?? 'exterior') !== 'exterior') return;
      const env = envelopeNow(now);
      const viewEye = d._fr?.mwv?.eye ?? cam.pos;
      if (!env.active) {
        _bazaarAudio.updateOutdoorPortal(null, null, 0);
        return;
      }

      if (env.sealing && activeGate && sealPlayedId !== activeGate.id) {
        sealPlayedId = activeGate.id;
        _bazaarAudio.playSealSnap();
      }
      _bazaarAudio.updateOutdoorPortal(viewEye, tearScenePos, env.openProgress);

      if (envoyBox && env.openProgress > 0.35) {
        envoyBox.push({
          key: TEAR_TARGET_KEY,
          aabb: { min: [tx - 0.95, ty + 0.15, tz - 0.16], max: [tx + 0.95, ty + 3.15, tz + 0.16] },
          distance: RAY_DISTANCE,
          reach: STATIC_NPC_ACTIVATION_DISTANCE,
          noSurface: false,
        });
      }

      if (Array.isArray(sceneLightsOut)) {
        sceneLightsOut.push(adoptLight({
          x: tx,
          y: ty + 1.6,
          z: tz,
          range: 12 * env.openProgress,
          color: OUTDOOR_TEAR_LIGHT_COLOR,
        }, lightAnchor));
      }

      if ((env.slashProgress > 0.45 || env.openProgress > 0.01) && d._fr?.proj && d._fr?.view && Math.hypot(viewEye[0] - tx, viewEye[2] - tz) < 42) {
        const portalGpu = getBazaarPortalGpu(renderer);
        const preview = getPreviewScene(renderer, getTexture);
        const origin = bazaarOriginFromTear(tearScenePos);
        if (portalGpu && preview) {
          outerTex = portalGpu.renderTarget(
            'outer',
            d._fr.proj,
            d._fr.view,
            viewEye,
            tearScenePos,
            800,
            preview.sceneAt(portalGpu, origin, cam.yaw, viewEye, now / 1000),
          );
        }
      }
    },

    drawOpaque() {},

    batches() {
      if (!envoyScenePos || !envoyBatch || (d._mode?.() ?? 'exterior') !== 'exterior') return [];
      return [envoyBatch];
    },

    envoyBatchForIndoor(now = performance.now()) {
      if (!envoyBatch || !envoyArt || !d.state) return null;
      const entry = findGothwayEntry();
      const tr = entry ? d.state.pixelTranslation(entry.px, entry.py) : null;
      if (!entry || !tr) return null;
      const ex = tr[0] + entry.locOrigin[0] + GOTHWAY_ENVOY_LOC[0];
      const ez = tr[2] + entry.locOrigin[2] + GOTHWAY_ENVOY_LOC[2];
      const eyRaw = groundAt(ex, ez);
      const ey = Number.isFinite(eyRaw) ? eyRaw : (tr[1] + entry.locOrigin[1]);
      const fr = isStill() ? 0 : Math.floor(((now / 1000) * 4) % (envoyArt.frames || 1));
      envoyBatch.record = `${BAZAAR_ENVOY.record}#${fr}`;
      envoyBatch.origin[0] = ex;
      envoyBatch.origin[1] = ey;
      envoyBatch.origin[2] = ez;
      return envoyBatch;
    },

    drawTear(proj, view, eye, now = performance.now()) {
      if (!d.renderer || (d._mode?.() ?? 'exterior') !== 'exterior') return;
      const portalGpu = getBazaarPortalGpu(d.renderer);
      if (!portalGpu) return;
      if (tearScenePos) {
        const env = envelopeNow(now);
        if (env.active && env.slashProgress > 0.01) {
          const timeSec = now / 1000;
          portalGpu.drawTearWindow({
            proj,
            view,
            eye,
            tearPos: tearScenePos,
            gateYaw: 0,
            tex: outerTex,
            timeSec,
            slashProgress: env.slashProgress,
            openProgress: env.openProgress,
            veilMix: env.veilMix,
          });
          if (env.openProgress > 0.12) {
            portalGpu.drawTimeMotes(proj, view, tearScenePos, timeSec, 'portal', 0, env.openProgress);
          }
        }
      }
      portalGpu.drawThresholdPulse(now);
    },

    targets: () => (envoyBox && (d._mode?.() ?? 'exterior') === 'exterior' ? envoyBox : []),

    hoverName: (/** @type {string} */ key) => {
      if (key === ENVOY_TARGET_KEY && envoyScenePos) {
        return { title: BAZAAR_ENVOY.name, subs: [t('bazaarbetwixt.envoyHover', 'Envoy of the Psijic Order')] };
      }
      if (key === TEAR_TARGET_KEY && tearScenePos) {
        return { title: t('bazaarbetwixt.tearHoverTo', 'To'), subs: [t('bazaarbetwixt.name', 'The Bazaar Betwixt')] };
      }
      return null;
    },

    activate(/** @type {string} */ key, mode = 'talk') {
      if (key === TEAR_TARGET_KEY && tearScenePos) {
        d.townTalk?.say?.(t('bazaarbetwixt.tearStepHint', 'Step forward through the cosmic fissure to enter The Bazaar Betwixt.'));
        return true;
      }
      if (key !== ENVOY_TARGET_KEY || !envoyScenePos) return false;
      if (mode === 'info') {
        d.townTalk?.say?.(t('bazaarbetwixt.envoyInfo', 'You see Valenis, an Envoy of the Psijic Order keeping watch beside the Mages Guild.'));
      } else if (mode === 'steal') {
        d.townTalk?.say?.(t('bazaarbetwixt.envoySteal', 'Valenis regards your hand calmly, and time itself stills your reach.'));
      } else {
        openEnvoyDialogue();
      }
      return true;
    },

    forgetStep() {
      stepArmed = false;
      prevFeet = null;
    },

    resolveTearOrigin() {
      if (tearScenePos) return bazaarOriginFromTear(tearScenePos);
      const state = d.state;
      const renderer = d.renderer;
      const entry = findGothwayEntry();
      if (!entry || !state) return null;
      const tr = state.pixelTranslation(entry.px, entry.py);
      if (!tr) return null;
      const ex = tr[0] + entry.locOrigin[0] + GOTHWAY_ENVOY_LOC[0];
      const ez = tr[2] + entry.locOrigin[2] + GOTHWAY_ENVOY_LOC[2];
      const eyRaw = groundAt(ex, ez);
      const ey = Number.isFinite(eyRaw) ? eyRaw : (tr[1] + entry.locOrigin[1]);
      const tx = tr[0] + entry.locOrigin[0] + GOTHWAY_TEAR_LOC[0];
      const tz = tr[2] + entry.locOrigin[2] + GOTHWAY_TEAR_LOC[2];
      const tyRaw = groundAt(tx, tz);
      const ty = Number.isFinite(tyRaw) ? tyRaw : ey;
      envoyScenePos = [ex, ey, ez];
      tearScenePos = [tx, ty, tz];
      if (!envoyArtAsked && renderer && (d.getTexture || d.pipeline?.getTexture || d.personTex)) {
        envoyArtAsked = true;
        ensureBazaarNpcArt(renderer, getTexture).then((art) => {
          envoyArt = art;
          if (!art) envoyArtAsked = false;
        });
      }
      return bazaarOriginFromTear(tearScenePos);
    },

    stepMotor(feet, now = performance.now()) {
      if (!feet || !tearScenePos || (d._mode?.() ?? 'exterior') !== 'exterior') {
        prevFeet = null;
        stepArmed = false;
        return;
      }
      if (entering) return;
      const env = envelopeNow(now);
      if (!env.active || env.sealing || env.openProgress < 0.72) {
        prevFeet = [feet[0], feet[1], feet[2]];
        return;
      }
      const res = bazaarStepAcross(prevFeet, feet, tearScenePos, 0, stepArmed);
      stepArmed = res.armed;
      prevFeet = [feet[0], feet[1], feet[2]];
      if (res.crossed && res.arrivalFeet && d.modes?.enterBazaarPortal) {
        entering = true;
        const origin = bazaarOriginFromTear(tearScenePos);
        const yaw = d.cam?.yaw ?? 0;
        d.modes.enterBazaarPortal({ origin, arrivalPos: res.arrivalFeet, arrivalYaw: yaw })
          .catch((e) => console.warn('[bazaar betwixt] portal entry failed', e?.message ?? e))
          .finally(() => { entering = false; });
      }
    },

    summonNow: () => summonGate(),

    wireWord(full = false) {
      const now = performance.now();
      if (!activeGate || activeGate.owner !== null || now >= activeGate.until || !tearScenePos) {
        wireDirty = false;
        return null;
      }
      if (!full && !wireDirty) return null;
      const f = d.player?.feetAt?.() ?? d.cam?.pos;
      if (!f || Math.hypot(f[0] - tearScenePos[0], f[2] - tearScenePos[2]) > BAZAAR_PORTAL_PEER_REACH) return null;
      wireDirty = false;
      return { i: activeGate.id, r: Math.max(1, Math.round(activeGate.until - now)) };
    },

    isWireDirty: () => wireDirty,

    state: () => ({
      envoy: envoyScenePos ? [...envoyScenePos] : null,
      tear: tearScenePos ? [...tearScenePos] : null,
      gate: activeGate ? { ...activeGate, ...envelopeNow() } : null,
    }),
  };

  if (typeof window !== 'undefined' && d.params?.has?.('shot')) {
    /** @type {any} */ (window).__bazaarGothway = api;
  }

  _activeGothwayHost = api;
  return api;
}
