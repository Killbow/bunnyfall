// @ts-check

import { createDecorScan } from './decorScan.js';
import { decorModsLive, DECOR_MODS_LIVE_S } from './decorMods.js';
import { createDecorRooms } from './decorRooms.js';
import { createDecorDoorways, decorDoorwaysFree, decorDoorwayAimed, decorDoorFit, decorDoorwayQuad, decorIsDoor } from './decorDoorways.js';
import { writeDecalQuad, clearDecalQuad, DECAL_FLOATS } from '../combat/bloodDecals.js';
import { rentRoomsView, rentAnchorOfRoom } from './homeRent.js';
import { goldSum, EMPIRE_ACCOUNT_WORDS } from './homeWords.js';
import { createDecorPlacer, decorEntrySized, DECOR_TURN_STEP, DECOR_TURN_FINE, DECOR_RAISE_STEP, DECOR_RAISE_FINE, wrapTurn, DECOR_WALL_CLIP } from './decorPlacer.js';
import { createDecorButton, createDecorPanel, createDecorBar, createDecorHotbar, decorWhyNot } from '../ui/decorPanel.js';
import { DecisionBoxWindow } from '../ui/decisionBox.js';
import { InputMessageBoxWindow } from '../ui/inputMessageBox.js';
import { loadDecorHotbar, saveDecorHotbar, decorHotId, DECOR_HOT_SLOTS } from './decorHotbar.js';
import { decorLookOffers, decorAimKind, decorUseLabel, decorUseNext, decorUseCircle, decorHallRankNext, decorHallUseLabel, DECOR_USE_MODES } from './decorLook.js';
import { noteDecorShared } from './decorGrants.js';
import { decorDelta, decorDraftParts, decorDraftText, decorHallDraftText, mintDecorTxn } from './decorDraft.js';
import { templatePrice } from '../net/decoratorLaw.js';
import { interiorDoorIndex, interiorDoorKey } from './decorInteriorDoors.js';
import { DECOR_CAP, DECOR_HALL_CAP, DECOR_PRICE_PER_METRE, DECOR_HIDDEN_CAP, decorPrice, decorPieceOf, decorRefund, decorRescale, mintDecorId, DECOR_STATIONS, DECOR_STATION_FEES, DECOR_STATION_NAMES, decorGoldMove } from '../net/decorLaw.js';
import { decorKey, DECOR_KINDS, decorFlatLight, modelKind, flatKind, decorRoomEntries } from './decorCatalogue.js';
import { decorOwnEntry, decorItemName, decorMountDye, decorMountDyeTarget } from './decorItems.js';
import { decorFurnishingEntry, isFurnishing } from './decorFurnish.js';
import { itemLongName } from '../items/itemInfo.js';
import { decorMatrix, decorKeyOf, decorIdOfKey, loadMountPicture, decorMountQuad, decorMountFloats, DECOR_MODEL_RETRY_MS, MW_STAND_ARCHIVE } from './decorRoom.js';
import { decorIsMount, decorFlatMirrored, decorIsFigure, decorDrawnScale } from '../net/decorLaw.js';
import { SEAT_HALL_TEXT } from '../net/townSeatLaw.js';
import { forgeOffered, PROF_STATIONS, stationColdLine } from '../ui/profPages.js';
import { VENDOR_STATION, VENDOR_COLD_LINE } from '../net/vendorLaw.js';
export const DECOR_STATION_UNKEPT = 'Your home cannot hold a station yet. Nothing was paid.';
export const DECOR_STATION_GOLD_WENT = 'Your gold ran short while the station was being made. Nothing was paid.';
import { localAabb, transformedAabb } from '../render/frustum.js';
import { billboardSize, isNatureArchive } from '../world/rmbFlats.js';
import { lookAt, perspective, mirrorProjectionX, trs, multiply } from '../world/mat4.js';
import { panelPicture, canvasBoxUnder } from './panelPicture.js';
import { remapLawOf } from '../world/texRemap.js';
import { isTextEntryTarget, eventActions } from '../ui/input.js';
import { plaqueListing, quickLootWheel, wantPlaqueVerbs } from '../items/quickLoot.js';
import { HOTBAR_SLOT_ACTIONS } from '../ui/inputActions.js';
import { holdHotbarKeys, coverHotbar, hotbarKeyOf, ensureHotbarSkin } from '../ui/enhancedHotbar.js';
import { walletReserve } from '../net/realmGoldLaw.js';
import { drawnFlat } from '../characters/nudeFlats.js';
import { t } from '../ui/textManager.js';

export const DECOR_FLY_SPEED = 3;
export const DECOR_PALE_COPY = 0.35;
export const DECOR_FLY_FAST = 7;
export const DECOR_FLY_LEASH = 40;
export const DECOR_EYE_REACH = 12;
export const DECOR_FLOAT_AT = 3;
export const DECOR_PREVIEW_SPIN = 30;
export const DECOR_THUMB_PX = 152;
export const DECOR_THUMBS_A_FRAME = 2;
export const DECOR_THUMB_WAIT_MS = 20_000;
export const DECOR_THUMB_TURN = -0.6;
export const DECOR_THUMB_LOOK_DOWN = 0.35;
export function decorThumbCamera(box) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const rad = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 || 1;
  const fov = 40 * (Math.PI / 180);
  const dist = rad / Math.sin(fov / 2);
  const proj = mirrorProjectionX(perspective(fov, 1, Math.max(0.05, dist - rad * 1.5), dist + rad * 1.5));
  const view = lookAt([0, dist * Math.sin(DECOR_THUMB_LOOK_DOWN), -dist * Math.cos(DECOR_THUMB_LOOK_DOWN)], [0, 0, 0], [0, 1, 0]);
  const model = multiply(trs(0, 0, 0, 0, DECOR_THUMB_TURN, 0), trs(-(x0 + x1) / 2, -(y0 + y1) / 2, -(z0 + z1) / 2, 0, 0, 0));
  return { proj, view, model };
}
export const DECOR_REFUSAL_MS = 4000;
export const DECOR_TURN_SETTLE_MS = 400;
export const RENT_VIEW_FRESH_MS = 30_000;
export const DECOR_MOUNT_NO_SURFACE = 'Look at a wall to hang it on.';
export const DECOR_DOOR_FINDING = 'Finding the doorways...';
// Half of DOORWAY_DEPTH_MAX in decorDoorways.js; keep the two in step.
export const DOOR_SIGHT_SPARE = 0.6;
export const DECOR_DOOR_NONE = 'This house has no open doorway for a door.';
export const DECOR_DOOR_TOO_WIDE = 'The free doorways here are too wide for this door to close.';
export const decorDoorAimLine = (n) => `Look at a marked doorway to hang the door (${n} free). Turn to swing it the other way.`;
export const DECOR_DOOR_MARKS = 32;
export const DECOR_DOOR_MARK_FREE = Object.freeze([0.35, 1, 0.45, 0.55]);
export const DECOR_DOOR_MARK_AIMED = Object.freeze([1, 0.8, 0.3, 0.85]);
export function decorDoorMarkPixels(size = 16) {
  const colors = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
      const o = (y * size + x) * 4;
      colors[o] = colors[o + 1] = colors[o + 2] = 255;
      colors[o + 3] = edge ? 255 : 90;
    }
  }
  return { width: size, height: size, colors };
}
export const DECOR_LOT_MARK = Object.freeze([0.45, 0.75, 1, 0.5]);
export const DECOR_LOT_MARKS = 192;
export const DECOR_DEFAULT_LIGHT = Object.freeze({ color: Object.freeze([1, 0.85, 0.6]), range: 6, intensity: 1 });

export function decorEditPrice(radius, was, scale) {
  if (was?.item) return { pay: 0, refund: 0, paid: 0 };
  const priced = decorRescale(radius, was.paid, scale);
  // A figure grown back to its own size by a move pays nothing, because nobody can change a figure's size.
  return decorIsFigure(was) && priced.pay > 0 ? { pay: 0, refund: 0, paid: was.paid } : priced;
}
export const decorEditText = ({ pay, refund }) => (pay > 0 ? `${pay} gold` : refund > 0 ? `${refund} gold back` : 'free');

export const decorLookEntry = (furn, look) => ({
  key: furn.key, kind: 'own', own: furn.own, furnishing: true, name: furn.name, item: furn.item, count: furn.count,
  model: look.model ?? null, flat: look.flat ?? null, light: null, storage: false, look: look.key,
});

export const DECOR_FLY_ACTIONS = Object.freeze(['MoveForwards', 'MoveBackwards', 'MoveLeft', 'MoveRight', 'Jump', 'Crouch', 'Run']);
export const DECOR_FREE_KEYS = Object.freeze({ Minus: 'smaller', Equal: 'bigger', Slash: 'grid',
  Numpad4: 'nudge:left', Numpad6: 'nudge:right', Numpad8: 'nudge:away', Numpad2: 'nudge:back' });

export const lookDir = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];

export function flyStep(pos, start, { forward = 0, strafe = 0, rise = 0 }, yaw, pitch, speed, dt) {
  const f = lookDir(yaw, pitch);
  const v = [f[0] * forward + Math.cos(yaw) * strafe, f[1] * forward + rise, f[2] * forward - Math.sin(yaw) * strafe];
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!(len > 0) || !(dt > 0)) return pos;
  const k = (speed * dt) / Math.max(1, len);
  const next = [pos[0] + v[0] * k, pos[1] + v[1] * k, pos[2] + v[2] * k];
  const d = [next[0] - start[0], next[1] - start[1], next[2] - start[2]];
  const dl = Math.hypot(d[0], d[1], d[2]);
  if (dl <= DECOR_FLY_LEASH) return next;
  const s = DECOR_FLY_LEASH / dl;
  return [start[0] + d[0] * s, start[1] + d[1] * s, start[2] + d[2] * s];
}

// The skin keeps the flying eye past the near plane (0.05), so no face close to it is cut open.
export const DECOR_FLY_SKIN = 0.2;
export const DECOR_FLY_PUSHES = 3;
export const DECOR_FLY_GIVE = 1e-3;

function flyKeep(collider, from, at, skip) {
  if (!(Math.hypot(at[0] - from[0], at[1] - from[1], at[2] - from[2]) > 1e-9)) return at;
  let end = at;
  if (typeof collider._resolveSphere === 'function') {
    const through = skip ? new Set(skip) : null;
    const pushed = (q, radius) => {
      const was = [q[0], q[1], q[2]];
      collider._resolveSphere(q, radius, {}, Infinity, false, false, through);
      return q[0] !== was[0] || q[1] !== was[1] || q[2] !== was[2];
    };
    const p = [at[0], at[1], at[2]];
    if (pushed(p, DECOR_FLY_SKIN)) {
      // The check runs a hair inside the skin, because at the push radius two faces of a gap can cancel out.
      for (let i = 1; pushed([p[0], p[1], p[2]], DECOR_FLY_SKIN - DECOR_FLY_GIVE); i++) {
        if (i >= DECOR_FLY_PUSHES) return from;
        pushed(p, DECOR_FLY_SKIN);
      }
      end = p;
    }
  }
  const e = [end[0] - from[0], end[1] - from[1], end[2] - from[2]];
  const reach = Math.hypot(e[0], e[1], e[2]);
  if (!(reach > 1e-9)) return end;
  let hit = null;
  try { hit = collider.raycastHit(from, [e[0] / reach, e[1] / reach, e[2] / reach], reach, skip ? { skip } : null); } catch { hit = null; }
  return hit && Number.isFinite(hit.dist) && hit.dist <= reach ? from : end;
}

const inSkin = (q, b) => [0, 1, 2].every((i) => q[i] >= b[i] - DECOR_FLY_SKIN && q[i] <= b[i + 3] + DECOR_FLY_SKIN);

// The room's faces are one-sided, so the eye is kept inside: a step stops a skin short of the first face and slides
// along it once. A shallow step can end too near a face for the next ray to meet it, so flyKeep pushes it off.
export function flyClip(collider, from, to, skip = null) {
  if (!collider?.raycastHit) return to;
  const cut = (a, b) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (!(len > 1e-9)) return { at: b, normal: null, rest: null };
    const dir = [d[0] / len, d[1] / len, d[2] / len];
    let hit = null;
    try { hit = collider.raycastHit(a, dir, len + DECOR_FLY_SKIN, skip ? { skip } : null); } catch { hit = null; }
    if (!hit || !Number.isFinite(hit.dist) || hit.dist - DECOR_FLY_SKIN >= len) return { at: b, normal: null, rest: null };
    const k = Math.max(0, hit.dist - DECOR_FLY_SKIN);
    const at = [a[0] + dir[0] * k, a[1] + dir[1] * k, a[2] + dir[2] * k];
    return { at, normal: Array.isArray(hit.normal) ? hit.normal : null, rest: [b[0] - at[0], b[1] - at[1], b[2] - at[2]] };
  };
  const first = cut(from, to);
  if (!first.normal) return flyKeep(collider, from, first.at, skip);
  const n = first.normal, r = first.rest;
  const into = r[0] * n[0] + r[1] * n[1] + r[2] * n[2];
  const slide = [r[0] - n[0] * into, r[1] - n[1] * into, r[2] - n[2] * into];
  return flyKeep(collider, from, cut(first.at, [first.at[0] + slide[0], first.at[1] + slide[1], first.at[2] + slide[2]]).at, skip);
}

export function stickMove(a) {
  const unit = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  return a ? { forward: unit(a.y), strafe: unit(a.x) } : null;
}

export function eyeHit(collider, eye, dir, skip = null) {
  let d = DECOR_FLOAT_AT;
  let normal = null;
  try {
    const hit = collider?.raycastHit ? collider.raycastHit(eye, dir, DECOR_EYE_REACH, skip ? { skip } : null) : null;
    if (hit && Number.isFinite(hit.dist)) { d = hit.dist; normal = Array.isArray(hit.normal) ? [...hit.normal] : null; }
  } catch { }
  return { point: [eye[0] + dir[0] * d, eye[1] + dir[1] * d, eye[2] + dir[2] * d], normal };
}
export const eyePoint = (collider, eye, dir, skip = null) => eyeHit(collider, eye, dir, skip).point;

export function createDecorTool(deps) {
  const { renderer, pool } = deps;
  const roomPieces = () => (pool.live?.() ?? pool.list());
  const mayEdit = (piece) => !deps.room?.()?.template || !!deps.template?.editable?.(piece);
  const drawnHere = (flat) => drawnFlat(...(deps.flatAs?.(flat) ?? flat));
  /** @type {any} */ let button = null;
  /** @type {any} */ let panel = null;
  /** @type {any} */ let bar = null;
  let justClosed = false;
  let overlayNow = false;
  let decorHere = false;
  const hotSlots = loadDecorHotbar();
  let hotSel = 0;
  const useMode = new Map();
  const useRank = new Map();
  const useWords = (id) => (deps.room?.()?.hall ? decorHallUseLabel(useRank.get(id) ?? 3) : decorUseLabel(useMode.get(id) ?? 'private'));
  const usePending = new Set();
  let useAsk = 0;
  let useBusy = false;
  let escapeWait = null;
  /** @type {any} */ let hotbar = null;
  /** @type {any} */ let scan = null;
  /** @type {any} */ let slot = null;
  /** @type {any} */ let placing = null;
  const verbsOff = wantPlaqueVerbs(() => !!placing?.browse && !placing.suspended && !panel?.isOpen());
  let spin = 0;
  let named = false;
  let listening = false;
  /** @type {any} */ let rooms = null;
  /** @type {any} */ let roomsFor = null;
  /** @type {number|null} */ let roomPick = null;
  /** @type {any} */ let doorways = null;
  /** @type {any} */ let doorwaysFor = null;
  /** @type {any} */ let doorRooms = null;
  /** @type {any} */ let markTex = null;
  const rentState = { visit: /** @type {any} */ (undefined), list: /** @type {any[]|null} */ (null), due: 0, now: 0, busy: false, asked: 0, at: -Infinity };
  /** @type {Set<string>} */
  const flyHeld = new Set();
  /** @type {Map<number, {gpu: any, box: any}|null>} */
  const models = new Map();
  /** @type {Map<number, number>} */
  const modelFailed = new Map();
  const offRefresh = pool?.onRefresh?.(() => refreshGhost()) ?? null;

  function modelFor(id) {
    if (models.has(id)) return models.get(id) ?? null;
    // A model that fails to load is asked again after DECOR_MODEL_RETRY_MS, never remembered as missing.
    if (now() - (modelFailed.get(id) ?? -Infinity) < DECOR_MODEL_RETRY_MS) return null;
    models.set(id, null);
    const failed = () => { models.delete(id); modelFailed.set(id, now()); };
    Promise.resolve(deps.getGpuMesh?.(id)).then((gpu) => {
      const cpu = deps.cpuModels?.get?.(id);
      if (gpu && cpu?.positions) models.set(id, { gpu, box: localAabb(cpu.positions) });
      else failed();
    }, failed);
    return null;
  }

  /** @type {WeakMap<object, Map<any, boolean>>} */
  const inLawOf = new WeakMap();
  function inLaw(gpu, texRemap) {
    if (!deps.prepareModel || !texRemap) return true;
    let seen = inLawOf.get(texRemap);
    if (!seen) inLawOf.set(texRemap, (seen = new Map()));
    if (seen.has(gpu)) return seen.get(gpu);
    seen.set(gpu, false);
    Promise.resolve().then(() => deps.prepareModel(gpu)).catch(() => {}).then(() => { seen.set(gpu, true); });
    return false;
  }

  /** @type {{ key: string, src: string|null, retry: number }[]} */
  const hotPics = Array.from({ length: DECOR_HOT_SLOTS }, () => ({ key: '', src: null, retry: 0 }));
  let yieldKeys = null;
  function holdCharacterBar(on) {
    if (on) { if (!yieldKeys) yieldKeys = holdHotbarKeys(); }
    else if (yieldKeys) { yieldKeys(); yieldKeys = null; }
  }
  function pictureOf(entry) {
    if (!entry) return null;
    if (entry.icon) return deps.iconUrl?.(entry.icon.archive, entry.icon.record, entry.icon.dye ?? null, entry.icon.dyeTarget ?? null) ?? null;
    if (decorIsMount(entry)) return deps.iconUrl?.(entry.flat[0], entry.flat[1], decorMountDye(entry.item), decorMountDyeTarget(entry.item)) ?? null;
    if (entry.flat) return deps.iconUrl?.(...drawnHere(entry.flat)) ?? null;
    return entry.model != null ? modelPicture(entry.model) : null;
  }
  function syncHot() {
    const panelOpen = !!panel?.isOpen?.();
    const up = (!!placing?.browse && !!deps.room?.()) || panelOpen;
    holdCharacterBar(!!placing || panelOpen);
    if (panelOpen) coverHotbar(true);
    const dock = panelOpen ? null : coverHotbar(!!placing);
    const cells = [];
    for (let i = 0; i < DECOR_HOT_SLOTS; i++) {
      const key = hotSlots[i];
      const pic = hotPics[i];
      if (key && pic.key !== key && now() >= pic.retry) {
        pic.key = key;
        pic.src = null;
        const asked = key;
        Promise.resolve(pictureOf(entryForKey(asked))).then((url) => {
          if (hotSlots[i] !== asked) return;
          if (url) { pic.src = url; syncHot(); }
          else { pic.key = ''; pic.retry = now() + 500; }
        }, () => { if (hotSlots[i] === asked) { pic.key = ''; pic.retry = now() + 500; } });
      } else if (!key) {
        pic.key = '';
        pic.src = null;
      }
      cells.push({ src: key && pic.key === key ? pic.src : null, filled: !!key });
    }
    hotbar?.show(up, cells, hotSel, dock);
  }
  function entryForKey(key) {
    const found = scan?.entries?.()?.find((e) => e.key === key);
    if (found) return found;
    const model = /^m(\d+)$/.exec(key);
    if (model) return { key, model: Number(model[1]), flat: null, kind: 'furniture', name: key, mount: false };
    const flat = /^f(\d+)\.(\d+)$/.exec(key);
    if (flat) return { key, model: null, flat: [Number(flat[1]), Number(flat[2])], kind: 'furniture', name: key, mount: false };
    return null;
  }
  function onHotSlot(i) {
    if (!placing?.browse) return;
    hotSel = i;
    if (panel?.isOpen()) {
      const key = panel.pointed()?.key;
      if (decorHotId(key)) {
        hotSlots[i] = hotSlots[i] === key ? null : key;
        saveDecorHotbar(hotSlots);
      }
      syncHot();
      return;
    }
    const key = hotSlots[i];
    syncHot();
    if (!key) return;
    const entry = entryForKey(key);
    if (!entry) return;
    const fly = [...placing.fly];
    endPlacing();
    beginPlacing(entry, null, { hotbar: true, at: fly });
  }
  function toggleHot(key) {
    if (!decorHotId(key)) return;
    const have = hotSlots.indexOf(key);
    if (have >= 0) hotSlots[have] = null;
    else {
      const empty = hotSlots.findIndex((s) => !s);
      if (empty < 0) { deps.say?.(t('decor.tool.barFull', 'The bar is full.')); return; }
      hotSlots[empty] = key;
    }
    saveDecorHotbar(hotSlots);
    syncHot();
    if (panel?.isOpen()) panel.update(view());
  }
  function onDecorateKey(e) {
    if (e.repeat || isTextEntryTarget(e.target)) return;
    if (deps.actionOf?.(e) !== 'Decorate') return;
    if (!deps.room?.() || overlayNow || !decorHere || placing || panel?.isOpen()) return;
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    beginBrowse();
  }
  deps.win?.addEventListener?.('keydown', onDecorateKey, true);

  function ensureDom() {
    if (panel || !deps.doc) return;
    const { doc, win, touch = false } = deps;
    button = createDecorButton({ doc, touch, onPress: () => beginBrowse() });
    panel = createDecorPanel({
      doc, win,
      onPlace: (entry) => beginPlacing(entry),
      onHot: (key) => toggleHot(key),
      onPlaceLook: (furn, look) => beginPlacing(decorLookEntry(furn, look)),
      thumbOf: (entry) => {
        if (entry.icon) return deps.iconUrl?.(entry.icon.archive, entry.icon.record, entry.icon.dye ?? null, entry.icon.dyeTarget ?? null) ?? null;
        if (decorIsMount(entry)) return deps.iconUrl?.(entry.flat[0], entry.flat[1], decorMountDye(entry.item), decorMountDyeTarget(entry.item)) ?? null;
        if (entry.flat) return deps.iconUrl?.(...drawnHere(entry.flat)) ?? null;
        return entry.model != null ? modelPicture(entry.model) : null;
      },
      // A picture drawn as another (a clothed stand-in, a tree in its season) is keyed by what it draws, so a
      // setting change never shows a stale picture.
      thumbKeyOf: (entry) => {
        if (entry.model != null && !entry.flat && !entry.icon) return `${entry.key}~${remapTag()}`;
        const drawn = entry.flat && !entry.icon ? drawnHere(entry.flat).join('.') : null;
        return drawn && drawn !== entry.flat.join('.') ? `${entry.key}>${drawn}` : entry.key;
      },
      onMove: (piece) => { if (mayEdit(piece)) beginPlacing(entryOf(piece), piece); },
      onRename: (piece) => { askRename(piece); },
      onAccess: (piece) => { cycleUse(piece); },
      useLabel: (piece) => useWords(piece?.id),
      onDuplicate: (piece) => beginDuplicate(piece),
      onRemove: (piece) => { if (mayEdit(piece)) removePiece(piece); },
      onToggle: (piece, what) => { if (mayEdit(piece)) togglePiece(piece, what); },
      onTurn: (piece, dir) => { if (mayEdit(piece)) turnPlaced(piece, dir * DECOR_TURN_STEP); },
      onBase: (keys, out) => { setBase(keys, out); },
      onRoom: (id) => { roomPick = id; if (panel?.isOpen()) panel.update(view()); },
      onRent: (what, row, price) => { rentAct(what, row, price); },
      onPaint: (what, look) => { paintAct(what, look); },
      onDecorators: () => {
        if (draftDirty()) { deps.say?.(t('decor.tool.confirmFirst', 'Confirm or discard the changes first.')); return; }
        const open = deps.decorators?.();
        if (open) { close(); open(); }
      },
      onClose: () => {
        const s = slot; slot = null; if (s) deps.closeSlot?.(s); deps.look?.()?.preview?.(undefined);
        justClosed = true;
        takeLookBack();
      },
    });
    bar = createDecorBar({
      doc, touch,
      on: {
        place: () => { commit(); }, back: () => back(),
        turnLeft: () => turnPiece(-DECOR_TURN_STEP), turnRight: () => turnPiece(DECOR_TURN_STEP),
        raise: () => placing?.placer?.raise(DECOR_RAISE_STEP), lower: () => placing?.placer?.raise(-DECOR_RAISE_STEP),
        smaller: () => placing?.placer?.rescale(false), bigger: () => placing?.placer?.rescale(true),
        grid: () => placing?.placer?.toggleSnap(),
        nudgeLeft: () => nudgePiece('left'), nudgeRight: () => nudgePiece('right'), nudgeAway: () => nudgePiece('away'), nudgeBack: () => nudgePiece('back'),
        preview: () => togglePreview(),
        catalog: () => openPanel(),
        confirm: () => { confirmDraft(); },
        discard: () => { discardDraft(); },
        send: () => { deps.template?.send?.(draftDirty()); },
        fly: (dir) => { if (placing) placing.rise = dir; },
      },
    });
    ensureHotbarSkin(doc);
    const labels = Array.from({ length: DECOR_HOT_SLOTS }, (_, i) => { try { return hotbarKeyOf(i) || String((i + 1) % 10); } catch { return String((i + 1) % 10); } });
    hotbar = createDecorHotbar({ doc, onSlot: onHotSlot, count: DECOR_HOT_SLOTS, keys: labels });
  }
  // The browser will not lock the pointer inside the Escape that closed the catalog, so the look is asked
  // again on the key's release.
  function takeLookBack() {
    if (!placing?.browse) return;
    deps.cursorOff?.();
    const w = deps.win;
    if (!w?.addEventListener) return;
    const up = () => { w.removeEventListener('keyup', up, true); if (placing?.browse) deps.cursorOff?.(); };
    w.addEventListener('keyup', up, true);
  }

  const ensureScan = () => { scan ??= createDecorScan(deps.scanDeps()); return scan; };
  let modsLive = new Set(), modsLiveIn = 0, modsLiveOf = null;
  function liveMods() {
    const s = ensureScan(), list = s.entries();
    if (modsLiveIn > 0 && modsLiveOf === list) return modsLive;
    modsLiveIn = DECOR_MODS_LIVE_S;
    modsLiveOf = list;
    const now = decorModsLive(list);
    if (now.size !== modsLive.size || [...now].some((k) => !modsLive.has(k))) { modsLive = now; s.remeasure(now); }
    return modsLive;
  }

  function ensureRooms() {
    const c = deps.collider?.() ?? null;
    if (rooms && roomsFor === c) return rooms;
    roomsFor = c;
    roomPick = null;
    const box = typeof c?.bounds === 'function' ? c.bounds() : null;
    rooms = createDecorRooms({ raycastHit: (o, d, m) => c.raycastHit(o, d, m), box });
    return rooms;
  }
  function roomList() {
    if (!rooms || roomsFor !== (deps.collider?.() ?? null) || !rooms.done()) return null;
    const found = rooms.rooms();
    return found && found.length > 1 ? found : null;
  }
  function ensureDoorways() {
    const c = deps.collider?.() ?? null;
    if (doorways && doorwaysFor === c) return doorways;
    const r = ensureRooms();
    if (!r.done()) return null;
    let src = r;
    // A placed door sits shut across its doorway, so the links come from rooms found with placed doors seen
    // through.
    const skip = roomPieces().filter((piece) => decorIsDoor(piece)).flatMap((piece) => [`act:decor:${piece.id}`, decorKeyOf(piece.id)]);
    if (skip.length) {
      const sig = skip.join('|');
      if (!doorRooms || doorRooms.for !== c || doorRooms.sig !== sig) {
        const box = typeof c?.bounds === 'function' ? c.bounds() : null;
        doorRooms = { for: c, sig, rooms: createDecorRooms({ raycastHit: (o, d, m) => c.raycastHit(o, d, m, { skip }), box }) };
      }
      if (!doorRooms.rooms.done()) { doorRooms.rooms.step(); return null; }
      src = doorRooms.rooms;
    }
    doorwaysFor = c;
    const only = deps.walls ?? null;
    doorways = createDecorDoorways({ raycastHit: (o, d, m) => c.raycastHit(o, d, m, only), links: src.links?.() ?? [] });
    return doorways;
  }
  function freeDoorways(except = null) {
    const list = doorways?.done() && doorwaysFor === (deps.collider?.() ?? null) ? doorways.doorways() : null;
    if (!list) return null;
    const placed = roomPieces().filter((piece) => decorIsDoor(piece) && piece.id !== except).map(piecePoint);
    return decorDoorwaysFree(list, [...(deps.doorsHere?.() ?? []), ...placed]);
  }
  function forgetRooms(keepDoorways = false) {
    rooms = null;
    roomsFor = null;
    if (!keepDoorways) { doorways = null; doorwaysFor = null; }
  }
  function closableDoorways(p) {
    const free = freeDoorways(p.editing?.id ?? null);
    const m = free && p.entry?.model != null ? modelFor(p.entry.model) : null;
    return m?.box ? free.filter((w) => decorDoorFit(w, m.box)?.fills) : free;
  }
  function footprintOf(p) {
    const piece = p?.piece;
    if (!piece) return [];
    const s = decorDrawnScale(piece);
    const m = piece.model != null ? modelFor(piece.model) : null;
    if (m?.box) {
      const [x0, , z0, x1, , z1] = m.box;
      // mat4 trs maps local x to (cos, -sin) and local z to (sin, cos).
      const yaw = ((piece.rot?.[0] ?? 0) * Math.PI) / 180, c = Math.cos(yaw), sn = Math.sin(yaw);
      return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([lx, lz]) => [(c * lx + sn * lz) * s, (-sn * lx + c * lz) * s]);
    }
    const r = (p.radius ?? 0) * s;
    return r > 0 ? [[-r, -r], [r, -r], [r, r], [-r, r]] : [];
  }
  const piecePoint = (piece) => { const o = deps.origin?.() ?? [0, 0, 0]; return [o[0] + piece.pos[0], o[1] + piece.pos[1], o[2] + piece.pos[2]]; };
  function charterWhyNot(p) {
    const r = deps.room?.();
    if (!r?.charter || !p?.piece) return null;
    const at = piecePoint(p.piece);
    const list = roomList();
    if (list) {
      const big = list.reduce((a, b) => (b.cells > a.cells ? b : a));
      if (rooms.roomOf(at)?.id !== big.id) return SEAT_HALL_TEXT.room;
    }
    return deps.charterClear?.(at) ?? null;
  }
  const whyNotHere = (p) => deps.placeOk?.(p.piece, footprintOf(p)) ?? charterWhyNot(p);
  const roomChosen = (list) => list.find((r) => r.id === roomPick) ?? rooms.roomOf(deps.eye?.() ?? null) ?? list[0];
  function flightStart(editing) {
    const eye = deps.eye?.() ?? [0, 0, 0];
    const list = roomList();
    if (!list) return eye;
    const want = editing ? rooms.roomOf(piecePoint(editing)) : roomChosen(list);
    const here = rooms.roomOf(eye);
    return want && (!here || here.id !== want.id) ? [...want.eye] : eye;
  }
  function nameFromCatalogue() {
    if (named) return;
    const s = ensureScan();
    if (!s.entries()) { s.step(); return; }
    for (const e of s.entries()) deps.names?.set(e.key, e.name);
    named = true;
  }

  const ownName = (piece) => {
    const kept = pool.ownOf?.(piece.id) ?? null;
    return (kept ? itemLongName(kept) : null) || decorItemName(piece.item) || DECOR_KINDS.decor;
  };
  const catalogued = (piece) => (piece.item ? null : scan?.entries()?.find((x) => x.key === decorKey(piece)) ?? null);
  function entryOf(piece, known = catalogued(piece)) {
    if (piece.item) {
      return {
        key: `own-piece:${piece.id}`, kind: 'own', model: piece.model ?? null, flat: piece.flat ?? null, item: piece.item, name: piece.name || ownName(piece), count: 0,
        storage: false, light: decorFlatLight(piece.flat), mount: decorIsMount(piece),
      };
    }
    if (known) return piece.name ? { ...known, name: piece.name } : known;
    const key = decorKey(piece);
    const kind = piece.model != null ? modelKind(piece.model) : 'decor';
    return {
      key, model: piece.model ?? null, flat: piece.flat ?? null, kind,
      name: piece.name || (deps.names?.get(key) ?? DECOR_KINDS[kind]), count: 0, storage: !!piece.storage, light: piece.light ?? null,
    };
  }

  // Rows are cached by the item itself, not its pack index, because setting one down shifts every index after it.
  /** @type {WeakMap<object, {id: number, n: number, slot: any, known: any, entry: any}>} */
  const ownCache = new WeakMap();
  let ownSeq = 0;
  function ownEntries() {
    const out = [];
    const rows = (list, make) => {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || typeof item !== 'object') continue;
        const n = item.stackCount ?? 1;
        let c = ownCache.get(item);
        if (!c || c.n !== n || c.slot !== item.equipSlot || c.known !== item.isIdentified) {
          c = { id: c?.id ?? ++ownSeq, n, slot: item.equipSlot, known: item.isIdentified, entry: make(item, i) };
          ownCache.set(item, c);
        }
        if (c.entry) out.push({ ...c.entry, key: `own:${c.id}`, count: n });
      }
    };
    rows(deps.pack?.() ?? [], (item, i) => decorOwnEntry(item, i, deps.identity?.() ?? undefined));
    rows(deps.furnishings?.() ?? [], (item, i) => decorFurnishingEntry(item, i));
    return out;
  }

  function templateValueText() {
    const s = ensureScan();
    const priced = templatePrice(roomPieces().filter((p) => deps.template?.editable?.(p)), (p) => s.radiusOf(entryOf(p)));
    return priced && priced.total > 0 ? deps.template?.value?.(priced.total) ?? null : null;
  }
  function view() {
    const r = deps.room?.();
    const s = ensureScan();
    const list = roomList();
    return {
      placed: roomPieces().filter(mayEdit).map((piece) => {
        const known = catalogued(piece);
        return { piece, entry: known, name: entryOf(piece, known).name, holds: !!pool.holdsAny?.(piece.id), own: !!piece.item, room: list ? rooms.roomOf(piecePoint(piece))?.id ?? null : null };
      }),
      rooms: list ? list.map((room) => ({ id: room.id, name: room.name })) : null,
      roomId: list ? roomChosen(list).id : null,
      own: r?.hall || r?.template ? [] : ownEntries(),
      base: r?.template ? [] : baseRows(),
      template: !!r?.template,
      decorators: !r?.template && deps.decorators?.() ? t('decor.decorators.row', 'Decorators') : null,
      where: r?.where ?? '',
      trader: r?.kind === 'home' && !r.template,
      hall: !!r?.hall,
      hot: hotSlots.filter(Boolean),
      entries: decorRoomEntries(s.entries(), r, null, liveMods()),
      yard: !!r?.yard,
      camp: !!r?.camp,
      progress: s.progress(),
      ready: s.phase() === 'done',
      sized: s.lateSized(),
      radiusOf: (e) => s.radiusOf(e),
      priceOf: (e) => { if (r?.free) return 0; const rad = s.radiusOf(e); return rad ? decorPrice(rad, 1) : null; },
      gold: (deps.wallet?.().gold ?? 0) + draftGoldNow(),
      count: pool.size(),
      cap: capHere(r),
      doorways: freeDoorways()?.length ?? null,
      paint: r?.template ? null : deps.look?.() ?? null,
      rent: r?.template ? null : rentView(r),
    };
  }

  const capHere = (r) => (r?.free && Number.isSafeInteger(r.cap) ? r.cap : r?.yard && Number.isSafeInteger(deps.yardCap) ? deps.yardCap : Number.isSafeInteger(r?.cap) ? r.cap : r?.hall ? DECOR_HALL_CAP : DECOR_CAP);
  async function paintAct(what, look) {
    const door = deps.look?.() ?? null;
    if (!door) return false;
    if (door.caravan) {
      if (what !== 'caravan') return false;
      const said = door.set?.(look?.part, look?.i);
      if (said) deps.say?.(said);
      return !!said;
    }
    if (what === 'preview') { door.preview(look ?? null); return true; }
    if (what === 'reset') { door.preview(undefined); return true; }
    if (what !== 'commit') return false;
    const hall = !!deps.room?.()?.hall;
    const whose = hall ? 'Your guild\'s hall' : 'Your house';
    const r = await door.commit(look ?? null);
    deps.say?.(r?.ok ? (look ? `${whose} is painted.` : `${whose} wears the town's own look again.`) : (deps.refusal?.(r?.error) ?? (hall ? 'The hall could not be painted.' : 'The house could not be painted.')));
    return !!r?.ok;
  }
  function rentView(r) {
    const door = r?.kind === 'home' ? deps.rent?.() ?? null : null;
    if (!door) return null;
    const visit = deps.visit?.();
    if (rentState.visit !== visit) { rentState.visit = visit; rentState.list = null; rentState.due = 0; refreshRent(door); }
    // Rooms are read again as the panel opens and while the rooms view stays up, because a tenant can pay while the
    // owner is in the house.
    else if (!rentState.busy && (!panel?.isOpen() || (panel.mode?.() === 'rent' && now() - rentState.at >= RENT_VIEW_FRESH_MS))) refreshRent(door);
    const found = roomsFound();
    const list = found && found.length > 1 ? found : null;
    const origin = deps.origin?.() ?? [0, 0, 0];
    return {
      // A house of one room still lists its offers, so they can be withdrawn after a door change merges two rooms.
      rows: found ? rentRoomsView(list ?? [], rentState.list ?? [], (p) => rooms.roomOf(p), origin) : [],
      rooms: !!list, finding: !found, loaded: rentState.list != null, due: rentState.due, now: rentState.now || Math.floor(now() / 1000), busy: rentState.busy,
    };
  }
  function roomsFound() {
    if (!rooms || roomsFor !== (deps.collider?.() ?? null) || !rooms.done()) return null;
    return rooms.rooms() ?? [];
  }
  function refreshRent(door = deps.rent?.() ?? null) {
    if (!door) return Promise.resolve(false);
    const visit = rentState.visit;
    const ask = ++rentState.asked;
    rentState.at = now();
    return Promise.resolve(door.rooms()).then((res) => {
      if (rentState.visit !== visit || ask !== rentState.asked || !res?.ok) return false;
      rentState.list = res.rooms;
      rentState.due = res.due ?? 0;
      rentState.now = res.now ?? 0;
      return true;
    }, () => false);
  }
  async function rentAct(what, row, price) {
    const door = deps.rent?.() ?? null;
    if (!door || rentState.busy) return false;
    rentState.busy = true;
    try {
      let res = null;
      if (what === 'offer') {
        const anchor = row?.eye ? rentAnchorOfRoom(row, deps.origin?.() ?? [0, 0, 0]) : null;
        if (!anchor || !row.offerable) return false;
        // The offer's own room number from rentRoomsView, never the finder's.
        res = await door.offer({ room: row.number, anchor, price });
        if (res?.ok) deps.say?.(`${row.name} is offered to rent at ${goldSum(price)} gold a day.`);
      } else if (what === 'withdraw') {
        if (!row?.offer || (!row.offer.listed && row.offer.taken)) return false;
        res = await door.withdraw({ room: row.offer.room });
        if (res?.ok) deps.say?.(res.data?.gone === false ? `Room ${row.offer.room} is still rented. It will not be offered again once its days run out.` : `Room ${row.offer.room} is no longer offered to rent.`);
      } else if (what === 'collect') {
        res = await door.collect();
        if (res?.ok) deps.say?.(`You collected ${goldSum(res.gold)} gold in rent. It went to ${EMPIRE_ACCOUNT_WORDS}.`);
      }
      if (!res?.ok) { if (res) deps.say?.(deps.refusal?.(res.error) ?? 'The room could not be changed.'); return false; }
      door.changed?.();
      await refreshRent(door);
      return true;
    } finally {
      rentState.busy = false;
    }
  }

  function baseRows() {
    const b = deps.base?.();
    if (!b) return [];
    const eye = deps.eye?.() ?? null;
    const list = roomList();
    const distOf = (at) => (eye && at ? Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]) : null);
    const roomOf = (at) => (list && at ? rooms.roomOf(at)?.id ?? null : null);
    const furniture = b.list().map((p) => {
      const shape = decorKey(p);
      const kind = p.model != null ? modelKind(p.model) : flatKind(p.flat[0]);
      return { key: p.key, shape, model: p.model, flat: p.flat, kind, name: deps.names?.get(shape) ?? DECOR_KINDS[kind], hidden: p.hidden, holds: p.holds, dist: distOf(p.at), room: roomOf(p.at) };
    });
    const doors = (b.roomDoors?.list?.() ?? []).map((p) => ({
      key: p.key, shape: p.key, model: null, flat: null, kind: 'door', name: 'Door', hidden: p.hidden, holds: false, door: true, dist: distOf(p.at), room: roomOf(p.at),
    }));
    return [...furniture, ...doors].sort((a, b2) => (a.dist ?? Infinity) - (b2.dist ?? Infinity));
  }

  function setRoomDoor(key, out) {
    const i = interiorDoorIndex(key);
    const doors = deps.base?.()?.roomDoors;
    if (i == null || !doors || !deps.room?.()) return false;
    const ok = out ? doors.hide(i) : doors.show(i);
    if (ok) deps.say?.(`Door ${out ? 'taken out' : 'put back'}.`);
    return ok;
  }
  async function setBase(keys, out) {
    const r = deps.room?.();
    const b = deps.base?.();
    if (!r || !b || !Array.isArray(keys)) return false;
    let doorsChanged = 0;
    for (const k of keys) if (interiorDoorIndex(k) != null && setRoomDoor(k, out)) doorsChanged += 1;
    // A piece that holds things is emptied into the owner's pack before it is taken out.
    if (out) for (const k of keys) { if (b.list().find((p) => p.key === k)?.holds) for (const it of b.empty?.(k) ?? []) deps.packGive?.(it); }
    const rows = new Map(b.list().map((p) => [p.key, p]));
    const moving = keys.filter((k) => { const p = rows.get(k); return p && p.hidden !== out && !(out && p.holds); });
    if (!moving.length) return doorsChanged > 0;
    const next = new Set(b.hidden());
    for (const k of moving) { if (out) next.add(k); else next.delete(k); }
    if (next.size > DECOR_HIDDEN_CAP) { deps.say?.('No more of this room\'s own furniture can be taken out.'); return false; }
    const visit = deps.visit?.();
    if (r.kind === 'home') {
      // An online home writes the whole list first, because the service is every visitor's truth.
      const res = await deps.homeDecor?.hidden?.({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), keys: [...next].sort() });
      if (!res?.ok) { deps.say?.(deps.refusal?.(res?.error) ?? 'The room could not be changed.'); return false; }
    }
    if (deps.visit?.() !== visit) return false;
    for (const k of moving) { if (out) b.hide(k); else b.show(k); }
    const one = moving.length === 1 ? (baseRows().find((row) => row.key === moving[0])?.name ?? null) : null;
    deps.say?.(one ? `${one} ${out ? 'taken out' : 'put back'}.` : `${moving.length} pieces ${out ? 'taken out' : 'put back'}.`);
    return true;
  }

  function openPanel() {
    if (!deps.room?.() || panel?.isOpen()) return false;
    if (placing && !placing.browse) return false;
    ensureDom();
    if (!panel) return false;
    modsLiveIn = 0;
    slot = panel.open(view());
    if (slot) deps.openSlot?.(slot);
    return !!slot;
  }

  function beginPlacing(catalogueEntry, editing = null, pose = null) {
    const s = ensureScan();
    const yard = !!deps.room?.()?.yard;
    const entry0 = editing ? { ...catalogueEntry, light: editing.light ?? null, storage: !!editing.storage, station: editing.station ?? null } : catalogueEntry;
    const entry = yard ? { ...entry0, storage: false, light: null, station: null } : deps.room?.()?.template ? { ...entry0, storage: false, station: null } : entry0;
    const free = entry.kind === 'own';
    const gratis = free || !!deps.room?.()?.free;
    const priced = editing ?? (Number.isSafeInteger(pose?.paid) && pose.paid > 0 && pose.scale > 0 ? pose : null);
    // A move or a copy already paid for its size, so its radius comes from the price until the scan reaches it.
    const radius = free ? null : s.radiusOf(catalogueEntry) ?? (priced ? priced.paid / (DECOR_PRICE_PER_METRE * priced.scale) : null);
    const from = editing ?? pose;
    const at = Array.isArray(pose?.at) && pose.at.length >= 3 ? pose.at : null;
    const eye = at ? [at[0], at[1], at[2]] : flightStart(editing);
    placing = {
      entry, radius, editing, pose: from, through: pose?.through ?? null, hotbar: !!pose?.hotbar, free: gratis, placer: null, fly: [...eye], start: [...eye], id: editing ? editing.id : mintDecorId(), piece: null,
      refused: null, busy: false, batch: null, flatSize: null, rise: 0, art: null, decal: null, inside: [], mirrors: true, release: null,
      door: entry.kind === 'door', flip: false, marks: null, markSig: '',
      lotMarks: null, lotSig: '', lifted: !!editing,
    };
    if (editing) pool.hold?.(editing.id, true);
    deps.cursorOff?.();
    if (editing || pose?.through || pose?.hotbar) holdDecorEscape();
    if (entry.mount) {
      askGhostArt(placing);
    } else if (entry.model == null) {
      const p = placing;
      const mw = entry.kind === 'own' && entry.item ? Promise.resolve(pool.standPicture?.(entry.item) ?? null).catch(() => null) : Promise.resolve(null);
      const [ga, gr] = drawnHere(entry.flat);
      const hosted = Promise.resolve(deps.flatPicture?.(entry.flat) ?? null).catch(() => null);
      const tex = Promise.resolve().then(() => deps.getTexture?.(ga)).catch(() => null);
      Promise.all([tex, mw, hosted]).then(([t, pic, own]) => {
        if (placing !== p) { own?.release?.(); return; }
        if (own) {
          p.flatSize = { ...own.size };
          p.mirrors = own.mirrors !== false;
          p.release = own.release ?? null;
          p.placer = createDecorPlacer(entry, { radius: p.radius, from: p.pose, free, flat: p.flatSize });
          if (renderer?.createBillboardBatch) p.batch = renderer.createBillboardBatch(own.archive, own.key, { ...p.flatSize }, [[0, 0, 0]]);
          return;
        }
        if (pic) {
          p.flatSize = { w: pic.w, h: pic.h };
          p.placer = createDecorPlacer(entry, { radius: p.radius, from: p.pose, free, flat: p.flatSize });
          if (renderer?.createBillboardBatch) p.batch = renderer.createBillboardBatch(MW_STAND_ARCHIVE, pic.key, { ...p.flatSize }, [[0, 0, 0]]);
          return;
        }
        if (!t || !(gr < t.recordCount)) return;
        deps.uploadRecord?.(ga, gr);
        p.flatSize = billboardSize(t, gr);
        p.placer = createDecorPlacer(entry, { radius: p.radius, from: p.pose, free, flat: p.flatSize });
        if (renderer?.createBillboardBatch) p.batch = renderer.createBillboardBatch(ga, gr, { ...p.flatSize }, [[0, 0, 0]]);
      }, () => {});
    }
    listen(true);
    syncHot();
  }

  function readUse() {
    const r = deps.room?.();
    if (!r || r.kind !== 'home' || r.seat || !deps.homeDecor?.use) return;
    const n = ++useAsk;
    const visit = deps.visit?.();
    Promise.resolve(deps.homeDecor.use({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), op: 'grants' })).then((res) => {
      if (n !== useAsk || deps.visit?.() !== visit || !res?.ok) return;
      useMode.clear();
      useRank.clear();
      for (const row of res.data?.use ?? []) {
        if (typeof row?.id !== 'string') continue;
        if (row.mode === 'guild' && Number.isInteger(row.rank)) useRank.set(row.id, row.rank);
        else if (DECOR_USE_MODES.includes(row.mode)) useMode.set(row.id, row.mode);
      }
    }, () => {});
  }
  function keepChestGoods(/** @type {string} */ id, /** @type {any} */ answer) {
    const data = answer?.data;
    const list = pool.itemsOf?.(id);
    if (!list || !data) return;
    if (data.moved) list.length = 0;
    if (Array.isArray(data.restored)) {
      const have = new Set(list.map((/** @type {any} */ it) => it?.uid));
      for (const it of data.restored) if (it && !have.has(it.uid)) list.push(it);
    }
  }
  async function cycleUse(piece) {
    const r = deps.room?.();
    if (useBusy || !r || r.kind !== 'home' || r.seat || r.template || !piece || !deps.homeDecor?.use) return false;
    const kind = piece.station ? 'station' : piece.storage ? 'storage' : null;
    if (!kind) return false;
    useBusy = true;
    useAsk++;
    if (r.hall) {
      const curRank = useRank.get(piece.id) ?? 3;
      const rank = decorHallRankNext(curRank);
      useRank.set(piece.id, rank);
      deps.say?.(`${decorHallUseLabel(rank)}.`);
      try {
        // A piece Confirm has not written has no service row yet, so the choice waits and is sent with the room.
        if (liveDraft() && !liveDraft().before.has(piece.id)) { usePending.add(piece.id); return true; }
        useBusy = false;
        const res = await deps.homeDecor.use({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), op: 'set', id: piece.id, kind, mode: 'guild', rank, names: [] });
        if (!res?.ok) {
          if (useRank.get(piece.id) === rank) useRank.set(piece.id, curRank);
          deps.say?.(deps.refusal?.(res?.error) ?? t('decor.tool.unkept', 'It could not be kept.'));
          return false;
        }
        if (Number.isInteger(res.data?.rank) && useRank.get(piece.id) === rank) useRank.set(piece.id, res.data.rank);
        return true;
      } finally { useBusy = false; }
    }
    const cur = useMode.get(piece.id) ?? 'private';
    const mode = decorUseNext(cur);
    if (liveDraft() && !liveDraft().before.has(piece.id)) {
      try {
        if (mode === 'private') { useMode.delete(piece.id); usePending.delete(piece.id); }
        else { useMode.set(piece.id, mode); usePending.add(piece.id); }
        deps.say?.(`${decorUseLabel(mode)}.`);
        return true;
      } finally { useBusy = false; }
    }
    if (mode === 'private') useMode.delete(piece.id); else useMode.set(piece.id, mode);
    deps.say?.(`${decorUseLabel(mode)}.`);
    const circle = decorUseCircle(deps.social?.());
    const names = mode === 'friends' ? circle.friends : mode === 'party' ? circle.party : [];
    const body = { mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), op: 'set', id: piece.id, kind, mode, names };
    const keepGoods = (/** @type {any} */ answer) => keepChestGoods(piece.id, answer);
    try {
      // Chest Access goes through the record act, so the save checkpoints first and the goods leave the save list
      // only when the service confirms the move.
      const act = !r.hall && kind === 'storage' ? deps.realm?.() : null;
      if (!r.hall && kind === 'storage' && !act) {
        if (cur === 'private') useMode.delete(piece.id); else useMode.set(piece.id, cur);
        deps.say?.(t('decor.tool.unkept', 'It could not be kept.'));
        return false;
      }
      useBusy = false;
      const res = act
        ? await act({ needsAnswer: true, apply: keepGoods, call: (at) => deps.homeDecor.use({ ...body, realm: at }) })
        : await deps.homeDecor.use({ ...body, realm: null });
      if (!res?.ok) {
        const nowMode = useMode.get(piece.id) ?? 'private';
        if (nowMode === mode) { if (cur === 'private') useMode.delete(piece.id); else useMode.set(piece.id, cur); }
        deps.say?.(res?.error === 'bad-item' ? t('decor.tool.unmarked', 'Take out what has no mark first.') : (deps.refusal?.(res?.error) ?? t('decor.tool.unkept', 'It could not be kept.')));
        return false;
      }
      const kept = DECOR_USE_MODES.includes(res.data?.mode) ? res.data.mode : mode;
      if (kept === 'private') useMode.delete(piece.id); else useMode.set(piece.id, kept);
      if (kind === 'storage') noteDecorShared(piece.id, kept !== 'private');
      if (kept !== mode) deps.say?.(`${decorUseLabel(kept)}.`);
      return true;
    } finally { useBusy = false; }
  }
  // Keyboard lock keeps Escape for the placement; without it the browser frees the pointer.
  function holdDecorEscape() {
    const kb = deps.win?.navigator?.keyboard;
    const doc = deps.doc;
    if (!kb?.lock) return;
    const ask = () => { kb.lock(['Escape']).catch(() => {}); };
    if (deps.locked?.()) { ask(); return; }
    if (!doc?.addEventListener || escapeWait) return;
    escapeWait = () => { if (!deps.locked?.()) return; doc.removeEventListener('pointerlockchange', escapeWait); escapeWait = null; ask(); };
    doc.addEventListener('pointerlockchange', escapeWait);
  }
  function freeDecorEscape() {
    if (escapeWait) { deps.doc?.removeEventListener?.('pointerlockchange', escapeWait); escapeWait = null; }
    try { deps.win?.navigator?.keyboard?.unlock?.(); } catch { }
  }

  function act(verb, id) {
    if (!placing?.browse || !deps.room?.()) return false;
    if (verb === 'out') {
      if (typeof id !== 'string' || !id || deps.room?.()?.template) return false;
      setBase([id], true);
      return true;
    }
    if (Number.isInteger(id)) {
      if (verb !== 'remove' || deps.room?.()?.template) return false;
      return setRoomDoor(interiorDoorKey(id), true);
    }
    const piece = typeof id === 'string' ? pool.pieceOf?.(id) : null;
    const offers = decorLookOffers(piece ? { kind: decorAimKind(decorKeyOf(piece.id), piece), piece, holds: !!pool.holdsAny?.(piece.id), mayEdit: mayEdit(piece) } : null);
    if (!offers[verb]) return false;
    if (verb === 'access') { cycleUse(piece); return true; }
    if (verb === 'rename') { askRename(piece); return true; }
    if (verb === 'remove') { removePiece(piece); return true; }
    const fly = placing?.fly ? [...placing.fly] : null;
    endPlacing();
    if (verb === 'move') beginPlacing(entryOf(piece), piece, fly ? { at: fly } : null);
    else beginDuplicate(piece, fly);
    return true;
  }
  function togglePreview() {
    const p = placing;
    if (!p?.piece || !p.aim) return false;
    if (p.lock) { p.lock = null; return true; }
    p.lock = { point: [...p.aim.point], normal: p.aim.normal ? [...p.aim.normal] : null, yaw: p.aimYaw ?? 0 };
    return true;
  }

  function beginDuplicate(piece, at = null) {
    if (!piece || piece.item) return false;
    const known = entryOf(piece);
    const light = piece.light ? { color: [...piece.light.color], range: piece.light.range, intensity: piece.light.intensity } : null;
    const eye = at ?? (placing?.fly ? [...placing.fly] : null);
    beginPlacing({ ...known, light, storage: !!piece.storage, station: null, item: null }, null, { rot: piece.rot, scale: piece.scale, paid: piece.paid, through: piece.id, ...(eye ? { at: eye } : {}) });
    return true;
  }

  function fillRadius(p) {
    if (p.free || p.radius > 0 || !p.entry) return;
    const s = ensureScan();
    s.step();
    const got = s.radiusOf(p.entry);
    if (!(got > 0)) return;
    p.radius = got;
    p.placer?.setRadius(got);
  }

  function askGhostArt(p) {
    const { entry } = p;
    const ask = pool.mountPicture?.(entry.flat, entry.item)
      ?? loadMountPicture({ getTexture: deps.getTexture, uploadRecord: deps.uploadRecord, renderer, mwPicture: deps.mwPicture }, entry.flat, entry.item);
    p.ask = ask;
    Promise.resolve(ask).then((art) => {
      if (placing !== p || p.ask !== ask || !art) return;
      p.art = art;
      p.decal ??= renderer?.createDecalBatch?.(1) ?? null;
      p.placer ??= createDecorPlacer(entry, { radius: p.radius, from: p.pose, free: p.free });
    }, () => {});
  }
  function refreshGhost() {
    if (!placing?.entry?.mount) return;
    placing.art = null;
    askGhostArt(placing);
  }

  // An online home, a guild hall, a caravan, and a template stage changes and write once on Confirm. The draft
  // stages pieces and own-thing moves in order, never what a chest holds: the inventory window moves that at once.
  let draft = null;
  const usesBatch = (r) => !!(r && r.kind === 'home' && !r.seat && !r.free && typeof deps.homeDecor?.batch === 'function');
  const stages = (r) => usesBatch(r) || r?.kind === 'caravan' || !!r?.template;
  const roomKey = (r) => `${deps.visit?.() ?? 0}:${r?.kind ?? ''}:${r?.mapId ?? ''}:${r?.buildingKey ?? ''}:${r?.yard ? 1 : 0}`;
  const liveDraft = () => {
    const r = deps.room?.();
    return draft && stages(r) && draft.key === roomKey(r) ? draft : null;
  };
  const snapPiece = (p) => JSON.parse(JSON.stringify(p));
  function openDraft() {
    const r = deps.room?.();
    if (!stages(r)) return null;
    const key = roomKey(r);
    if (draft?.key === key) return draft;
    const before = new Map();
    for (const p of roomPieces()) before.set(p.id, snapPiece(p));
    const asked = usesBatch(r)
      ? Promise.resolve(deps.homeDecor.list(r.mapId, r.buildingKey, false, !!r.yard)).then((res) => {
        if (draft?.key === key && res?.ok && Number.isSafeInteger(res.data?.rev)) draft.rev = res.data.rev;
      }, () => {})
      : Promise.resolve();
    draft = {
      // The revision is the one the list read returns, never a zero sent before it answers.
      key, rev: usesBatch(r) ? null : 0, txn: mintDecorTxn(), before,
      owns: pool.ownSnapshot?.() ?? null, moves: [], asked,
      keeping: false,
    };
    return draft;
  }
  const draftParts = () => {
    const d = liveDraft();
    return d ? decorDraftParts([...d.before.values()], roomPieces()) : { delta: 0, pay: 0, back: 0 };
  };
  const draftGoldNow = () => { const p = draftParts(); return deps.room?.()?.hall ? -p.pay : p.delta; };
  const purseOk = (extra) => (deps.wallet?.().gold ?? 0) + draftGoldNow() + extra >= 0;
  const draftDirty = () => {
    const d = liveDraft();
    if (!d) return false;
    const delta = decorDelta([...d.before.values()], roomPieces());
    return delta.put.length + delta.drop.length > 0 || d.moves.length > 0;
  };
  let heardRev = null;
  let hearAt = 0;
  let hearing = false;
  function hearRoom(dt) {
    const r = deps.room?.();
    const probe = deps.homeDecor?.rev;
    if (!usesBatch(r) || placing || typeof probe !== 'function') return;
    hearAt += dt > 0 ? dt : 0;
    if (hearAt < 2 || hearing || draftDirty()) return;
    hearAt = 0;
    hearing = true;
    const key = roomKey(r);
    const visit = deps.visit?.();
    const yard = !!r.yard;
    Promise.resolve(probe(r.mapId, r.buildingKey, false, yard)).then((res) => {
      hearing = false;
      if (deps.visit?.() !== visit || roomKey(deps.room?.()) !== key || placing || draftDirty()) return;
      const rev = Number(res?.data?.rev);
      if (!res?.ok || !Number.isSafeInteger(rev) || heardRev === rev) return;
      if (heardRev == null || typeof deps.homeDecor?.list !== 'function') { heardRev = rev; return; }
      return deps.homeDecor.list(r.mapId, r.buildingKey, false, yard).then((full) => {
        if (deps.visit?.() !== visit || roomKey(deps.room?.()) !== key || placing || draftDirty() || !full?.ok) return;
        heardRev = rev;
        readUse();
        if (typeof pool.set !== 'function') return;
        const pieces = (full.data.pieces ?? []).map((p) => decorPieceOf(p)).filter(Boolean);
        pool.set(pieces);
        const d = liveDraft();
        if (d) d.before = new Map(pieces.map((p) => [p.id, snapPiece(p)]));
        if (d) d.rev = rev;
      }, () => {});
    }, () => { hearing = false; });
  }
  function publishDraft() {
    const r = deps.room?.();
    const d = liveDraft();
    if (r?.kind === 'caravan' && d && draftDirty()) pool.showSaved?.(() => [...d.before.values()]);
    else pool.showSaved?.(null);
  }
  function keepDraft(rev = null) {
    const d = liveDraft();
    if (d) {
      d.before = new Map(roomPieces().map((p) => [p.id, snapPiece(p)]));
      d.moves = [];
      d.owns = pool.ownSnapshot?.() ?? null;
      if (Number.isSafeInteger(rev)) d.rev = rev;
    }
    publishDraft();
  }
  function discardDraft() {
    const d = liveDraft();
    if (!d) return false;
    for (const p of roomPieces()) {
      if (d.before.has(p.id)) continue;
      // A piece the draft placed and now takes away gives what it holds back to the pack.
      if (pool.holdsAny?.(p.id)) {
        for (const it of pool.itemsOf?.(p.id)?.splice(0) ?? []) deps.packGive?.(it);
        deps.say?.(t('decor.tool.discardGaveBack', 'What the {name} held is back in your pack.', { name: entryOf(p).name }));
      }
      pool.remove(p.id);
    }
    for (const p of d.before.values()) pool.put(snapPiece(p));
    pool.setOwn?.(d.owns);
    // Own-thing moves are undone last first. An item no longer in the pack (stored, sold, or worn) stays taken down
    // for Confirm to take down.
    const still = [];
    for (const [i, m] of [...d.moves.entries()].reverse()) {
      if (m.op === 'in' && d.moves.some((o, j) => j < i && o.op === 'out' && o.id === m.id)) continue;
      if (m.op === 'out' && d.moves.some((o, j) => j > i && o.op === 'in' && o.id === m.id)) continue;
      if (m.op === 'out') { deps.packGive?.(pool.takeOwn?.(m.id) ?? m.item); continue; }
      const got = deps.packTake?.(m.item);
      if (got) { pool.keepOwn?.(m.id, got); continue; }
      pool.takeOwn?.(m.id);
      pool.remove(m.id);
      still.push(m);
      deps.say?.(t('decor.tool.discardNotInPack', '{name} is no longer in your pack, or is worn. Confirm takes its piece down.', { name: itemLongName(m.item) || DECOR_KINDS.decor }));
    }
    for (const id of [...usePending]) if (!d.before.has(id)) { usePending.delete(id); useMode.delete(id); useRank.delete(id); }
    d.moves = still;
    if (placing) placing.draftWhy = null;
    publishDraft();
    return true;
  }
  async function flushStagedUse(r) {
    if (!usePending.size || !deps.homeDecor?.use) return;
    const circle = decorUseCircle(deps.social?.());
    for (const id of [...usePending]) {
      const piece = pool.pieceOf?.(id);
      if (r.hall) {
        const rank = useRank.get(id);
        const kind = piece?.station ? 'station' : piece?.storage ? 'storage' : null;
        if (!piece || !kind || !Number.isInteger(rank)) { usePending.delete(id); continue; }
        const res = await deps.homeDecor.use({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), op: 'set', id, kind, mode: 'guild', rank, names: [], realm: null });
        if (!res?.ok) { deps.say?.(deps.refusal?.(res?.error) ?? t('decor.tool.unkept', 'It could not be kept.')); continue; }
        usePending.delete(id);
        if (kind === 'storage') noteDecorShared(id, true);
        continue;
      }
      const mode = useMode.get(id) ?? 'private';
      if (!piece || mode === 'private') { usePending.delete(id); continue; }
      const kind = piece.station ? 'station' : piece.storage ? 'storage' : null;
      if (!kind) { usePending.delete(id); continue; }
      const names = mode === 'friends' ? circle.friends : mode === 'party' ? circle.party : [];
      const body = { mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), op: 'set', id, kind, mode, names };
      const act = kind === 'storage' ? deps.realm?.() : null;
      if (kind === 'storage' && !act) { usePending.delete(id); useMode.delete(id); deps.say?.(t('decor.tool.unkept', 'It could not be kept.')); continue; }
      const res = act
        ? await act({ needsAnswer: true, apply: (/** @type {any} */ a) => keepChestGoods(id, a), call: (/** @type {any} */ at) => deps.homeDecor.use({ ...body, realm: at }) })
        : await deps.homeDecor.use({ ...body, realm: null });
      if (!res?.ok) { deps.say?.(res?.error === 'bad-item' ? t('decor.tool.unmarked', 'Take out what has no mark first.') : (deps.refusal?.(res?.error) ?? t('decor.tool.unkept', 'It could not be kept.'))); continue; }
      usePending.delete(id);
      if (kind === 'storage') noteDecorShared(id, mode !== 'private');
    }
  }
  // Confirm reads the revision again when the first read went unanswered, and takes it only if the room still
  // matches the draft's start.
  async function rereadRev(r, d) {
    const res = await Promise.resolve(deps.homeDecor.list(r.mapId, r.buildingKey, false, !!r.yard)).catch(() => null);
    const rev = Number(res?.data?.rev);
    if (liveDraft() !== d) return false;
    if (!res?.ok || !Number.isSafeInteger(rev)) { deps.say?.(t('decor.tool.unread', 'The room could not be read.')); return false; }
    const held = (res.data.pieces ?? []).map((p) => decorPieceOf(p)).filter(Boolean);
    const since = decorDelta([...d.before.values()], held);
    if (since.put.length || since.drop.length) { deps.say?.(deps.refusal?.('decor-rev') ?? t('decor.tool.unkeptRoom', 'The changes could not be kept.')); return false; }
    d.rev = rev;
    return true;
  }
  async function confirmDraft() {
    const r = deps.room?.();
    const d = liveDraft();
    if (!d) return false;
    if (d.keeping) return false;
    // A second Confirm while one is on its way would send the batch and pay twice.
    d.keeping = true;
    if (placing) placing.busy = true;
    try {
      await d.asked;
      if (usesBatch(r) && !Number.isSafeInteger(d.rev) && !(await rereadRev(r, d))) return false;
      const before = [...d.before.values()];
      const after = roomPieces();
      const delta = decorDelta(before, after);
      if (!delta.put.length && !delta.drop.length) { d.moves = []; if (placing) placing.draftWhy = null; if (usesBatch(r)) await flushStagedUse(r); publishDraft(); return true; }
      if (r.template) {
        const res = await deps.template?.save?.({ put: delta.put, drop: delta.drop, yard: !!r.yard });
        if (!res?.ok) return false;
        d.before = new Map(roomPieces().map((p) => [p.id, snapPiece(p)]));
        d.moves = [];
        if (placing) placing.draftWhy = null;
        return true;
      }
      const gold = draftGoldNow();
      if (!usesBatch(r)) {
        if ((deps.wallet?.().gold ?? 0) + Math.min(gold, 0) < 0) { deps.say?.(t('decor.tool.short', 'Not enough gold.')); return false; }
        if (gold < 0) deps.wallet().pay(-gold);
        if (gold > 0) deps.wallet().credit?.(gold);
        d.before = new Map(roomPieces().map((p) => [p.id, snapPiece(p)]));
        d.moves = [];
        d.owns = pool.ownSnapshot?.() ?? null;
        if (placing) placing.draftWhy = null;
        publishDraft();
        deps.say?.(t('decor.tool.kept', 'The room is kept.'));
        return true;
      }
      const share = r.hall ? draftParts().back : 0;
      if ((deps.wallet?.().gold ?? 0) + Math.min(gold, 0) < 0) { deps.say?.(t('decor.tool.short', 'Not enough gold.')); return false; }
      const body = { mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), rev: d.rev, txn: d.txn, put: delta.put, drop: delta.drop, yard: !!r.yard };
      let res;
      const act = gold !== 0 ? deps.realm?.() : null;
      if (act) {
        const wallet = deps.wallet();
        const paid = gold < 0 ? walletReserve(wallet, -gold) : null;
        res = await act({
          reserve: paid?.reserve ?? null,
          needsAnswer: gold > 0,
          apply: (/** @type {any} */ a) => { const g = Number(a.data?.gold) || 0; if (g > 0) deps.wallet().credit?.(g); },
          call: (/** @type {any} */ at) => deps.homeDecor.batch({ ...body, realm: at }),
        });
        if (!res?.ok) paid?.back();
      } else {
        res = await deps.homeDecor.batch(body);
        if (res?.ok && gold < 0) deps.wallet().pay(-gold);
        if (res?.ok && gold > 0) deps.wallet().credit?.(gold);
      }
      if (!res?.ok) { deps.say?.(deps.refusal?.(res?.error) ?? t('decor.tool.unkeptRoom', 'The changes could not be kept.')); return false; }
      d.before = new Map(roomPieces().map((p) => [p.id, snapPiece(p)]));
      // The service moves the revision only from the one this Confirm named, so the new one is this room as saved.
      if (Number.isSafeInteger(res.data?.rev)) d.rev = heardRev = res.data.rev;
      d.txn = mintDecorTxn();
      d.moves = [];
      d.owns = pool.ownSnapshot?.() ?? null;
      if (placing) placing.draftWhy = null;
      await flushStagedUse(r);
      publishDraft();
      deps.say?.(share ? t('decor.tool.keptShare', 'The room is kept. The company has its share.') : t('decor.tool.kept', 'The room is kept.'));
      return true;
    } finally {
      d.keeping = false;
      if (placing) placing.busy = false;
    }
  }

  function beginBrowse(from = null) {
    if (!deps.room?.() || placing || panel?.isOpen()) return false;
    ensureDom();
    openDraft();
    const eye = from ?? deps.eye?.() ?? [0, 0, 0];
    placing = {
      entry: null, browse: true, radius: null, editing: null, pose: null, free: true, placer: null,
      fly: [...eye], start: [...eye], id: null, piece: null, refused: null, busy: false, batch: null, flatSize: null,
      rise: 0, art: null, decal: null, inside: [], mirrors: true, release: null, door: false, flip: false,
      marks: null, markSig: '', lotMarks: null, lotSig: '',
    };
    deps.cursorOff?.();
    listen(true);
    syncHot();
    readUse();
    return true;
  }

  function askRename(piece) {
    if (!piece || typeof deps.openSlot !== 'function' || deps.room?.()?.template) return;
    const back = panel?.isOpen() ? slot : null;
    const box = new InputMessageBoxWindow({
      lines: [t('decor.tool.renameAsk', 'What should this be called?')],
      label: 'Name',
      value: piece.name || '',
      maxCharacters: 32,
      onSubmit: (value) => { deps.closeSlot?.(box); renamePiece(piece, value); if (back && panel?.isOpen()) { slot = back; deps.openSlot(back); } },
      onCancel: () => { deps.closeSlot?.(box); if (back && panel?.isOpen()) { slot = back; deps.openSlot(back); } },
    });
    deps.openSlot(box);
  }
  function renamePiece(piece, text) {
    const r = deps.room?.();
    if (!r) return;
    pieceWrite(piece.id, async () => {
      const cur = roomPieces().find((p) => p.id === piece.id);
      if (!cur) return false;
      const next = decorPieceOf({ ...cur, name: typeof text === 'string' ? text : '' });
      if (!next) { deps.say?.(t('decor.tool.badName', 'That name will not do.')); return false; }
      if ((next.name ?? '') === (cur.name ?? '')) return true;
      const visit = deps.visit?.();
      const stood = await writeChange(r, next);
      if (!stood) return false;
      if (deps.visit?.() === visit) pool.put(stood);
      return true;
    });
  }

  function askLeave() {
    if (placing?.leaving) return;
    if (typeof deps.openSlot !== 'function') { placing.draftWhy = t('decor.tool.confirmFirst', 'Confirm or discard the changes first.'); return; }
    placing.leaving = true;
    const box = new DecisionBoxWindow({
      rows: [t('decor.tool.unkeptLeave', 'These changes are not kept.'), t('decor.tool.leaveBehind', 'Leave them behind?')],
      onYes: () => { deps.closeSlot?.(box); if (placing?.browse) { discardDraft(); endPlacing(); } },
      onNo: () => { deps.closeSlot?.(box); if (placing) placing.leaving = false; },
    });
    deps.openSlot(box);
  }

  function back() {
    if (justClosed || !placing) return;
    if (placing.browse && draftDirty()) { askLeave(); return; }
    if (placing.browse) { endPlacing(); return; }
    const stay = !!(placing.editing || placing.through || placing.hotbar) || draftDirty();
    const fly = [...placing.fly];
    const key = placing.entry?.key ?? null;
    const moved = placing.editing ?? null;
    const own = !moved && placing.entry?.kind === 'own';
    const look = own ? placing.entry?.look ?? null : null;
    endPlacing({ keepEscape: stay });
    if (stay) {
      beginBrowse(fly);
      takeLookBack();
      const w = deps.win;
      const up = () => { w?.removeEventListener?.('keyup', up, true); freeDecorEscape(); };
      w?.addEventListener?.('keyup', up, true);
      return;
    }
    if (!openPanel()) return;
    if (moved) panel.showRoom(moved.id);
    else if (look) panel.showLook(key, look);
    else if (own) panel.showOwn(key);
    else if (key) panel.select(key);
  }

  function endPlacing({ keepEscape = false } = {}) {
    if (!keepEscape) freeDecorEscape();
    const p = placing;
    if (p?.lifted && p.editing) pool.hold?.(p.editing.id, false);
    placing = null;
    flyHeld.clear();
    if (p?.batch) renderer?.destroyBillboardBatch?.(p.batch);
    if (p?.decal) renderer?.destroyDecalBatch?.(p.decal);
    if (p?.marks) renderer?.destroyDecalBatch?.(p.marks);
    if (p?.lotMarks) renderer?.destroyDecalBatch?.(p.lotMarks);
    p?.release?.();
    bar?.hide();
    listen(false);
    syncHot();
  }

  async function commit() {
    const p = placing;
    if (!p || p.busy || !p.piece) return false;
    const r = deps.room?.();
    if (!r) { endPlacing(); return false; }
    if (p.editing) return commitMove(p, r);
    if (p.entry.kind === 'own') return commitOwn(p, r);
    const price = p.piece.paid;
    const batching = stages(r);
    if (decorWhyNot({ price, ready: true, gold: deps.wallet().gold + (batching ? draftGoldNow() : 0), count: pool.size(), cap: capHere(r), yard: !!r?.yard, hall: !!r?.hall })) return false;
    if (whyNotHere(p)) return false;
    p.busy = true;
    p.refused = null;
    const piece = p.piece;
    try {
      if (batching) {
        openDraft();
        standRound(p, piece);
        publishDraft();
        deps.say?.(t('decor.tool.setAside', '{name} set aside. Confirm keeps it.', { name: p.entry.name }));
        if (placing === p) { const fly = [...p.fly]; endPlacing(); beginBrowse(fly); }
        return true;
      }
      const act = r.kind === 'home' && price > 0 ? deps.realm?.() : null;
      if (act) {
        const visit = deps.visit?.();
        const wallet = deps.wallet();
        const paid = walletReserve(wallet, price);
        const res = await act({
          reserve: paid.reserve,
          // A placement answered as `repeat` moved no gold on the record, so the reserve comes back.
          apply: (/** @type {any} */ a) => { if (a.data?.repeat) paid.back(); },
          call: (/** @type {any} */ at) => deps.homeDecor.place({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), piece, realm: at }),
        });
        if (!res?.ok) { p.refused = { text: deps.refusal?.(res?.error) ?? 'The piece could not be placed.', at: now() }; return false; }
        if (deps.visit?.() === visit) standRound(p, decorPieceOf(res.data?.piece) ?? piece);
      } else if (r.kind === 'home') {
        // An online home writes first and pays once the service has the piece; short of gold by then, the piece is
        // taken back out.
        const visit = deps.visit?.();
        const res = await deps.homeDecor?.place?.({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), piece });
        if (!res?.ok) { p.refused = { text: deps.refusal?.(res?.error) ?? 'The piece could not be placed.', at: now() }; return false; }
        const wallet = deps.wallet();
        if (wallet.gold < price) {
          await deps.homeDecor.remove?.({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), id: piece.id });
          return false;
        }
        wallet.pay(price);
        if (deps.visit?.() === visit) standRound(p, decorPieceOf(res.data?.piece) ?? piece);
      } else {
        deps.wallet().pay(price);
        standRound(p, piece);
      }
      deps.say?.(price > 0 ? `${p.entry.name} placed for ${price} gold.` : `${p.entry.name} placed.`);
      if (p.door) forgetRooms(true);
      p.id = mintDecorId();
      return true;
    } finally {
      p.busy = false;
    }
  }

  // The collider is two-sided, so a piece placed around the eye is flown and looked through until the eye is out.
  function standRound(p, piece) {
    pool.put(piece);
    const box = piece.model != null ? models.get(piece.model)?.box : null;
    if (!box) return;
    const b = transformedAabb(box, decorMatrix(piece, deps.origin?.() ?? [0, 0, 0]));
    if (inSkin(p.fly, b)) p.inside.push({ key: decorKeyOf(piece.id), box: b });
  }

  async function commitOwn(p, r) {
    const item = p.entry.own;
    if (pool.size() >= DECOR_CAP || !deps.packHas?.(item)) return false;
    p.busy = true;
    p.refused = null;
    const piece = p.piece;
    const online = r.kind === 'home';
    if (stages(r)) {
      openDraft();
      const moved = deps.packTake?.(item);
      p.busy = false;
      if (!moved) return false;
      pool.put(piece);
      pool.keepOwn(piece.id, moved);
      draft?.moves.push({ op: 'out', id: piece.id, item: moved });
      publishDraft();
      deps.say?.(t('decor.tool.setAside', '{name} set aside. Confirm keeps it.', { name: p.entry.name }));
      if (placing === p) { const fly = [...p.fly]; endPlacing(); beginBrowse(fly); }
      return true;
    }
    const at = online ? { mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.() } : null;
    const undo = async () => { if (online) await deps.homeDecor.remove?.({ ...at, id: piece.id }); };
    let stood = piece;
    try {
      // Online, the service has the piece before the item leaves the pack; a room left or an item gone meanwhile
      // undoes it.
      if (online) {
        const visit = deps.visit?.();
        const res = await deps.homeDecor?.place?.({ ...at, piece });
        if (!res?.ok) { p.refused = { text: deps.refusal?.(res?.error) ?? 'It could not be set down.', at: now() }; return false; }
        if (deps.visit?.() !== visit || !deps.packHas?.(item)) { await undo(); return false; }
        stood = decorPieceOf(res.data?.piece) ?? piece;
      }
      const moved = deps.packTake?.(item);
      if (!moved) { await undo(); return false; }
      pool.put(stood);
      pool.keepOwn(stood.id, moved);
      deps.say?.(`${p.entry.name} set down.`);
    } finally {
      p.busy = false;
    }
    if (placing === p) { endPlacing(); if (openPanel()) panel.showOwn(); }
    return true;
  }

  const placeOf = (piece) => ({ pos: piece.pos, rot: piece.rot, scale: piece.scale, light: piece.light, storage: piece.storage, paid: piece.paid, ...(piece.station ? { station: piece.station } : {}), ...(piece.name ? { name: piece.name } : {}) });

  async function writeChange(r, piece) {
    if (stages(r)) { openDraft(); return piece; }
    if (r.kind !== 'home') return piece;
    const res = await deps.homeDecor?.move?.({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), id: piece.id, place: placeOf(piece) });
    if (!res?.ok) { deps.say?.(deps.refusal?.(res?.error) ?? 'The piece could not be changed.'); return null; }
    return decorPieceOf(res.data?.piece) ?? piece;
  }

  // A refund is the gold the service pays back, never this client's half, and a refund whose answer is lost ends
  // the session (`needsAnswer`).
  async function writeChangeRealm(r, piece, act, { pay = 0, refund = 0 } = {}) {
    const wallet = deps.wallet();
    const res = await act({
      reserve: pay > 0 ? walletReserve(wallet, pay).reserve : null,
      needsAnswer: refund > 0,
      apply: refund > 0 ? (/** @type {any} */ a) => { const g = Number(a.data?.gold) || 0; if (g > 0) deps.wallet().credit?.(g); } : null,
      call: (/** @type {any} */ at) => deps.homeDecor.move({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), id: piece.id, place: placeOf(piece), realm: at }),
    });
    if (!res?.ok) { deps.say?.(deps.refusal?.(res?.error) ?? 'The piece could not be changed.'); return null; }
    return decorPieceOf(res.data?.piece) ?? piece;
  }

  async function commitMove(p, r) {
    const was = p.editing;
    if (whyNotHere(p)) return false;
    const price = r?.free ? { pay: 0, refund: 0, paid: 0 } : decorEditPrice(p.radius, was, p.piece.scale);
    const batching = stages(r);
    if (price.pay > (deps.wallet?.().gold ?? 0) + (batching ? draftGoldNow() : 0)) return false;
    p.busy = true;
    const next = { ...p.piece, paid: price.paid };
    const visit = deps.visit?.();
    try {
      if (batching) {
        openDraft();
        if (!purseOk(decorGoldMove(was, next, was.paid).delta)) return false;
        pool.put(next);
        publishDraft();
        turnsOwed.delete(was.id);
        if (decorIsDoor(next)) forgetRooms();
      } else {
      const done = await pieceWrite(was.id, async () => {
        const act = r.kind === 'home' && (price.pay > 0 || price.refund > 0) ? deps.realm?.() : null;
        const stood = act ? await writeChangeRealm(r, next, act, price) : await writeChange(r, next);
        if (!stood) return false;
        if (!act) {
          if (price.pay > (deps.wallet?.().gold ?? 0)) {
            await writeChange(r, was);
            return false;
          }
          if (price.pay > 0) deps.wallet().pay(price.pay);
          if (price.refund > 0 && !r.hall) deps.wallet().credit?.(price.refund);
        }
        turnsOwed.delete(was.id);
        if (deps.visit?.() === visit) pool.put(stood);
        if (decorIsDoor(stood)) forgetRooms();
        return true;
      });
      if (!done) return false;
      }
    } finally {
      p.busy = false;
    }
    if (placing === p) { const fly = [...p.fly]; endPlacing(); beginBrowse(fly); }
    return true;
  }

  function removePiece(piece) { return pieceWrite(piece.id, () => removeNow(piece)); }
  async function removeNow(piece) {
    const r = deps.room?.();
    if (piece.item) return takeDown(piece, r);
    if (!r || pool.holdsAny?.(piece.id)) return false;
    if (stages(r)) {
      openDraft();
      pool.remove(piece.id);
      publishDraft();
      if (decorIsDoor(piece)) forgetRooms();
      deps.say?.(t('decor.tool.setAsideRemove', '{name} set aside. Confirm removes it.', { name: entryOf(piece).name }));
      return true;
    }
    const visit = deps.visit?.();
    const restore = () => { if (deps.visit?.() === visit) pool.put(piece); };
    let paid = piece.paid;
    const realmAct = r.kind === 'home' && decorRefund(paid) > 0 ? deps.realm?.() : null;
    let back = 0;
    let toGuild = 0;
    if (realmAct) {
      // The ask starts first so it can read the piece, and the piece is gone before the ask is awaited.
      const pending = realmAct({
        needsAnswer: true,
        apply: (/** @type {any} */ a) => {
          back = Math.max(0, Number(a.data?.gold) || 0);
          toGuild = Math.max(0, Number(a.data?.treasury) || 0);
          if (back > 0) deps.wallet?.().credit?.(back);
        },
        call: (/** @type {any} */ at) => deps.homeDecor.remove({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), id: piece.id, realm: at }),
      });
      if (deps.visit?.() === visit) pool.remove(piece.id);
      const res = await pending;
      if (!res?.ok) { restore(); deps.say?.(deps.refusal?.(res?.error) ?? 'The piece could not be removed.'); return false; }
    } else {
      if (r.kind === 'home') {
        const pending = deps.homeDecor?.remove?.({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), id: piece.id });
        if (deps.visit?.() === visit) pool.remove(piece.id);
        const res = await pending;
        if (!res?.ok) { restore(); deps.say?.(deps.refusal?.(res?.error) ?? 'The piece could not be removed.'); return false; }
        paid = decorPieceOf(res.data?.piece)?.paid ?? paid;
        toGuild = r.hall ? Math.max(0, Number(res.data?.treasury) || 0) : 0;
      } else pool.remove(piece.id);
      back = r.hall ? 0 : decorRefund(paid);
      if (back > 0) deps.wallet?.().credit?.(back);
    }
    if (decorIsDoor(piece)) forgetRooms();
    deps.say?.(toGuild > 0 ? `${entryOf(piece).name} removed. ${toGuild} gold back to the guild's treasury.` : `${entryOf(piece).name} removed. ${back} gold back.`);
    return true;
  }

  async function takeDown(piece, r) {
    if (!r) return false;
    const name = ownName(piece);
    if (stages(r)) {
      const d = openDraft();
      pool.remove(piece.id);
      const item = pool.takeOwn?.(piece.id) ?? null;
      if (item) d?.moves.push({ op: 'in', id: piece.id, item: deps.packGive?.(item) ?? item });
      publishDraft();
      deps.say?.(t('decor.tool.setAsideDown', '{name} set aside. Confirm takes it down.', { name }));
      return true;
    }
    const visit = deps.visit?.();
    if (r.kind === 'home') {
      const pending = deps.homeDecor?.remove?.({ mapId: r.mapId, buildingKey: r.buildingKey, character: deps.character?.(), id: piece.id });
      if (deps.visit?.() === visit) pool.remove(piece.id);
      const res = await pending;
      if (!res?.ok) { if (deps.visit?.() === visit) pool.put(piece); deps.say?.(deps.refusal?.(res?.error) ?? 'It could not be taken down.'); return false; }
    }
    if (deps.visit?.() !== visit) return false;
    if (r.kind !== 'home') pool.remove(piece.id);
    const item = pool.takeOwn?.(piece.id) ?? null;
    if (item) deps.packGive?.(item);
    deps.say?.(!item ? `${name} taken down.` : isFurnishing(item) ? `${name} taken down. Set it down again from Your things.` : `${name} is back in your pack.`);
    return true;
  }

  async function togglePiece(piece, what) {
    const r = deps.room?.();
    if (!r) return false;
    if (decorIsDoor(piece) && (what === 'light' || what === 'storage' || (typeof what === 'string' && what.startsWith('station:')))) return false;
    if (r.template && what !== 'light') return false;
    if (typeof what === 'string' && what.startsWith('station:')) return setStation(r, piece, what.slice(8));
    return pieceWrite(piece.id, async () => {
      const cur = roomPieces().find((p) => p.id === piece.id);
      if (!cur) return false;
      let next;
      if (what === 'light') {
        const own = entryOf(cur).light;
        next = decorPieceOf({ ...cur, light: cur.light ? null : (own ?? DECOR_DEFAULT_LIGHT) });
      } else if (what === 'storage') {
        if (cur.storage && pool.holdsAny?.(cur.id)) return false;
        next = decorPieceOf({ ...cur, storage: !cur.storage });
      }
      if (!next) return false;
      const visit = deps.visit?.();
      const stood = await writeChange(r, next);
      if (!stood) return false;
      if (deps.visit?.() === visit) pool.put(stood);
      return true;
    });
  }

  function turnPlaced(piece, deg) {
    const r = deps.room?.();
    if (!r || decorIsDoor(piece) || !Number.isFinite(deg)) return false;
    const cur = roomPieces().find((p) => p.id === piece.id);
    if (!cur) return false;
    const axis = decorIsMount(cur) ? 2 : 0;
    // A standing picture is a billboard that only shows which way it faces, so a turn flips it.
    const by = cur.model == null && axis === 0 && !isNatureArchive(cur.flat?.[0]) ? Math.sign(deg) * 180 : deg;
    const next = decorPieceOf({ ...cur, rot: cur.rot.map((v, i) => (i === axis ? wrapTurn(Math.round((v + by) * 10) / 10) : v)) });
    if (!next) return false;
    const why = whyNotHere({ piece: next, radius: ensureScan().radiusOf(entryOf(next)) ?? null });
    if (why) { deps.say?.(why); return false; }
    pool.put(next);
    if (r.kind !== 'home') return true;
    const owed = turnsOwed.get(piece.id);
    if (owed) { owed.rot = next.rot; owed.n++; } else turnsOwed.set(piece.id, { r, visit: deps.visit?.(), held: cur, rot: next.rot, n: 1 });
    const n = turnsOwed.get(piece.id).n;
    // The presses of one turning become one write, sent once they settle.
    later(() => { writeTurn(piece.id, n); }, DECOR_TURN_SETTLE_MS);
    return true;
  }
  function writeTurn(id, n) {
    return pieceWrite(id, async () => {
      const t = turnsOwed.get(id);
      if (!t || t.n !== n) return;
      const standing = () => roomPieces().find((p) => p.id === id) ?? null;
      if (deps.visit?.() === t.visit && !standing()) { turnsOwed.delete(id); return; }
      const want = decorPieceOf({ ...(standing() ?? t.held), rot: t.rot });
      if (!want) { turnsOwed.delete(id); return; }
      const stood = await writeChange(t.r, want);
      const now = deps.visit?.() === t.visit ? standing() : null;
      if (!stood) {
        turnsOwed.delete(id);
        if (now) pool.put(decorPieceOf({ ...now, rot: t.held.rot }) ?? t.held);
        return;
      }
      t.held = stood;
      if (t.n !== n) return;
      turnsOwed.delete(id);
      if (now) pool.put(decorPieceOf({ ...now, rot: stood.rot }) ?? now);
    });
  }
  const turnsOwed = new Map();
  const later = (fn, ms) => (deps.later ?? setTimeout)(fn, ms);
  // One write of a piece at a time: each write sends the whole place, so two in flight could land in either order
  // and undo each other.
  function pieceWrite(id, fn) {
    const run = (pieceWrites.get(id) ?? Promise.resolve()).then(fn);
    const tail = run.then(() => {}, () => {});
    pieceWrites.set(id, tail);
    tail.then(() => { if (pieceWrites.get(id) === tail) pieceWrites.delete(id); });
    return run;
  }
  const pieceWrites = new Map();

  const decorStationGoldLine = (kind) => `${DECOR_STATION_NAMES[kind]}: ${DECOR_STATION_FEES[kind].toLocaleString('en-US')} gold, and you do not have that much.`;

  async function setStation(r, piece, kind) {
    const want = kind === 'none' ? null : kind;
    if (want !== null && !DECOR_STATIONS.includes(want)) return false;
    if (PROF_STATIONS.includes(want) && !forgeOffered()) { deps.say?.(stationColdLine(want)); return false; }
    if (want === VENDOR_STATION && (r?.kind !== 'home' || !forgeOffered())) { deps.say?.(VENDOR_COLD_LINE); return false; }
    return pieceWrite(piece.id, () => stationNow(r, piece, want));
  }
  async function stationNow(r, piece, want) {
    const cur = roomPieces().find((p) => p.id === piece.id) ?? piece;
    if ((cur.station ?? null) === want) return false;
    const fee = want ? DECOR_STATION_FEES[want] : 0;
    const batching = stages(r);
    if (fee > (deps.wallet?.().gold ?? 0) + (batching ? draftGoldNow() : 0)) { deps.say?.(decorStationGoldLine(want)); return false; }
    if (batching) {
      openDraft();
      const next = decorPieceOf({ ...cur, station: want });
      if (!next || !purseOk(decorGoldMove(cur, next, cur.paid).delta)) { deps.say?.(decorStationGoldLine(want)); return false; }
      pool.put(next);
      publishDraft();
      deps.say?.(want ? t('decor.tool.stationKept', '{name}: {station}. Confirm keeps it.', { name: entryOf(cur).name ?? t('decor.tool.thePiece', 'The piece'), station: DECOR_STATION_NAMES[want] }) : t('decor.tool.stationCleared', '{name} is no longer a station. Confirm keeps it.', { name: entryOf(cur).name ?? t('decor.tool.thePiece', 'The piece') }));
      return true;
    }
    const next = decorPieceOf({ ...cur, station: want });
    if (!next) return false;
    const visit = deps.visit?.();
    const act = r.kind === 'home' && fee > 0 ? deps.realm?.() : null;
    const stood = act ? await writeChangeRealm(r, next, act, { pay: fee }) : await writeChange(r, next);
    if (!stood) return false;
    if ((stood.station ?? null) !== want) { deps.say?.(DECOR_STATION_UNKEPT); return false; }
    if (!act && fee > (deps.wallet?.().gold ?? 0)) {
      await writeChange(r, cur);
      deps.say?.(DECOR_STATION_GOLD_WENT);
      return false;
    }
    if (!act && fee > 0) deps.wallet().pay(fee);
    if (deps.visit?.() === visit) pool.put(stood);
    const name = entryOf(cur).name ?? 'The piece';
    deps.say?.(want ? `${name}: ${DECOR_STATION_NAMES[want]}.` : `${name} is no longer a station.`);
    return true;
  }

  function turnPiece(deg) {
    if (!placing) return;
    if (placing.door) { placing.flip = !placing.flip; return; }
    placing.placer?.turn(deg);
  }

  const turn = (e, dir) => { if (!e.repeat || !placing?.door) turnPiece(dir * (e.shiftKey ? DECOR_TURN_FINE : DECOR_TURN_STEP)); };
  const lift = (e, dir) => placing?.placer?.raise(dir * (e.shiftKey ? DECOR_RAISE_FINE : DECOR_RAISE_STEP));
  function nudgePiece(side, fine = false) {
    const p = placing;
    if (!p?.placer || p.door || p.entry?.mount || p.browse) return;
    const yaw = p.aimYaw ?? 0;
    const fwd = [Math.sin(yaw), Math.cos(yaw)], right = [Math.cos(yaw), -Math.sin(yaw)];
    const raw = side === 'away' ? fwd : side === 'back' ? [-fwd[0], -fwd[1]] : side === 'right' ? right : [-right[0], -right[1]];
    const dir = Math.abs(raw[0]) >= Math.abs(raw[1]) ? [Math.sign(raw[0]) || 1, 0] : [0, Math.sign(raw[1]) || 1];
    let room = Infinity;
    const piece = p.piece, origin = deps.origin?.() ?? [0, 0, 0], col = deps.collider?.();
    if (piece && col?.raycastHit) {
      const from = [origin[0] + piece.pos[0], origin[1] + piece.pos[1] + 0.3, origin[2] + piece.pos[2]];
      const skip = p.editing ? [decorKeyOf(p.editing.id)] : null;
      try {
        const hit = col.raycastHit(from, [dir[0], 0, dir[1]], 8, skip ? { skip } : null);
        if (hit && Number.isFinite(hit.dist)) room = Math.max(0, hit.dist - p.placer.reachToward(dir) + DECOR_WALL_CLIP);
      } catch { }
    }
    p.placer.nudge(dir, fine, room);
  }
  function arm(e) {
    const act = deps.actionOf?.(e) ?? null;
    const once = !e.repeat;
    switch (act) {
      case 'TurnLeft': turn(e, -1); return;
      case 'TurnRight': turn(e, 1); return;
      case 'FloatUp': lift(e, 1); return;
      case 'FloatDown': lift(e, -1); return;
      case 'Interact': if (once && !placing?.browse) commit(); return;
      case 'Escape': if (once) back(); return;
      default: break;
    }
    if (act && DECOR_FLY_ACTIONS.includes(act)) { flyHeld.add(act); return; }
    const free = act ? null : DECOR_FREE_KEYS[e.code];
    if (free?.startsWith?.('nudge:')) { nudgePiece(free.slice(6), e.shiftKey || e.ctrlKey); return; }
    if (free === 'smaller') placing?.placer?.rescale(false);
    else if (free === 'bigger') placing?.placer?.rescale(true);
    else if (free === 'grid' && once) placing?.placer?.toggleSnap();
  }
  const suspended = () => !placing || placing.suspended;
  const now = () => deps.now?.() ?? Date.now();
  function decorSlotKey(e) {
    if (!placing?.browse || e.repeat || isTextEntryTarget(e.target)) return false;
    const fromHost = HOTBAR_SLOT_ACTIONS.indexOf(deps.actionOf?.(e) ?? '');
    let i = fromHost;
    if (i < 0) {
      try { i = eventActions(e).map((a) => HOTBAR_SLOT_ACTIONS.indexOf(a)).find((n) => n >= 0) ?? -1; } catch { i = -1; }
    }
    if (i < 0 || i >= DECOR_HOT_SLOTS) return false;
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    if (panel?.isOpen()) {
      const key = panel.pointed()?.key;
      if (decorHotId(key)) {
        hotSlots[i] = key;
        saveDecorHotbar(hotSlots);
        hotSel = i;
        syncHot();
      }
      return true;
    }
    onHotSlot(i);
    return true;
  }
  // Every press while the camera flies is taken before the host sees it, so the body gets no movement and no swing,
  // spell, or door fires under a placement.
  function onKeyDown(e) {
    if (justClosed && e.code === 'Escape') return;
    if (e.code === 'Tab' && !e.repeat && placing?.browse && !isTextEntryTarget(e.target)) {
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      if (panel?.isOpen()) panel.close();
      else openPanel();
      return;
    }
    if (decorSlotKey(e)) return;
    if (suspended() || panel?.isOpen() || isTextEntryTarget(e.target)) return;
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    arm(e);
  }
  // Releases are left to the host too, so a key held into the flight is let go there.
  function onKeyUp(e) {
    const act = deps.actionOf?.(e) ?? null;
    if (act) flyHeld.delete(act);
  }
  function onPress(e) {
    if (suspended() || panel?.isOpen() || deps.touch) return;
    // A press while the pointer is unlocked only takes the pointer back, as every host click does; it never places.
    if (!deps.locked?.()) return;
    if (e.button === 1) { e.preventDefault?.(); e.stopImmediatePropagation?.(); if (e.type === 'mousedown') togglePreview(); return; }
    if (placing?.browse && e.button === 0) return;
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    if (e.type !== 'mousedown') return;
    if (e.button === 0) commit();
    else if (e.button === 2) back();
  }
  function onWheel(e) {
    if (suspended()) return;
    if (placing?.browse) {
      if (panel?.isOpen()) return;
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      if (plaqueListing()) quickLootWheel(e.deltaY ?? 0);
      return;
    }
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    turn(e, (e.deltaY ?? 0) > 0 ? 1 : -1);
  }
  const swallowRest = (e) => {
    if (suspended() || deps.touch || !deps.locked?.()) return;
    if (placing?.browse && e.type !== 'contextmenu') return;
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
  };
  function listen(on) {
    const w = deps.win;
    if (!w?.addEventListener || on === listening) return;
    listening = on;
    const f = on ? 'addEventListener' : 'removeEventListener';
    w[f]('keydown', onKeyDown, true);
    w[f]('keyup', onKeyUp, true);
    w[f]('mousedown', onPress, true);
    w[f]('mouseup', swallowRest, true);
    w[f]('click', swallowRest, true);
    w[f]('contextmenu', swallowRest, true);
    w[f]('wheel', onWheel, { capture: true, passive: false });
  }

  /**
   * @param {{ dt: number, cam: {pos: number[], yaw: number, pitch: number}, overlayUp: boolean, interior: boolean }} f
   */
  function frame({ dt, cam, overlayUp, interior }) {
    justClosed = false;
    overlayNow = !!overlayUp;
    if (interior && !named && pool.size() > 0) nameFromCatalogue();
    const r = interior ? deps.room?.() : null;
    if (!r) {
      decorHere = false;
      heardRev = null;
      if (!deps.template?.previewing?.()) pool.showSaved?.(null);
      if (placing) endPlacing();
      if (panel?.isOpen()) panel.close();
      button?.render(false);
      syncHot();
      return;
    }
    if (!button && deps.doc) ensureDom();
    decorHere = true;
    publishDraft();
    hearRoom(dt);
    button?.render(!overlayUp && !placing);
    syncHot();
    spin = (spin + (dt > 0 ? dt : 0) * DECOR_PREVIEW_SPIN) % 360;
    if (panel?.isOpen()) {
      ensureScan().step();
      ensureRooms().step();
      ensureDoorways()?.step();
      nameFromCatalogue();
      modsLiveIn -= dt > 0 ? dt : 0;
      panel.update(view());
      const pointed = panel.pointed();
      if (pointed?.model != null) modelFor(pointed.model);
    }
    if (!placing) return;
    placing.suspended = overlayUp;
    if (overlayUp) { bar?.hide(); return; }
    const p = placing;
    fillRadius(p);
    if (p.entry?.model != null && !p.placer) {
      const m = modelFor(p.entry.model);
      if (m) p.placer = createDecorPlacer(p.entry, { radius: p.radius, box: m.box, from: p.pose, free: p.free });
    }
    const held = (a) => flyHeld.has(a);
    const stick = stickMove(deps.stick?.() ?? null);
    const move = {
      forward: stick ? stick.forward : (held('MoveForwards') ? 1 : 0) - (held('MoveBackwards') ? 1 : 0),
      strafe: stick ? stick.strafe : (held('MoveRight') ? 1 : 0) - (held('MoveLeft') ? 1 : 0),
      rise: Math.max(-1, Math.min(1, (held('Jump') ? 1 : 0) - (held('Crouch') ? 1 : 0) + p.rise)),
    };
    const origin = deps.origin?.() ?? [0, 0, 0];
    p.inside = p.inside.filter((c) => inSkin(p.fly, c.box));
    const skips = [...(p.editing ? [decorKeyOf(p.editing.id)] : []), ...(p.through ? [decorKeyOf(p.through)] : []), ...p.inside.map((c) => c.key)];
    const through = skips.length ? skips : null;
    const next = flyStep(p.fly, p.start, move, cam.yaw, cam.pitch, held('Run') ? DECOR_FLY_FAST : DECOR_FLY_SPEED, dt);
    p.fly = flyClip(deps.collider?.(), p.fly, next, through);
    const hit = eyeHit(deps.collider?.(), p.fly, lookDir(cam.yaw, cam.pitch), through);
    p.aim = hit;
    p.aimYaw = cam.yaw;
    if (p.browse) {
      const pending = draftDirty();
      const value = r.template ? templateValueText() : null;
      bar?.show({ name: 'Decorating', priceText: value ?? (pending ? (r.hall ? decorHallDraftText(draftParts()) : decorDraftText(draftGoldNow())) : ''), browse: true, draft: pending, sized: true,
        send: !!r.template && !pending && !!deps.template?.sendable?.(),
        count: pool.size(), cap: capHere(r),
        why: p.draftWhy ?? (!deps.touch && !deps.locked?.() ? t('decor.tool.lookAgain', 'Click to look around again.') : null) });
      return;
    }
    if (deps.lot && !p.lock) markLot(p);
    if (p.lock) {
      if (!p.door && p.placer) p.piece = p.placer.pieceAt(p.lock.point, origin, p.id, p.lock.normal, p.lock.yaw);
    } else if (p.door) doorFrame(p, origin, cam);
    else p.piece = p.placer ? p.placer.pieceAt(hit.point, origin, p.id, hit.normal, cam.yaw) : null;
    if (p.decal && p.art) {
      const quad = p.piece ? decorMountQuad(p.piece, origin, { w: p.art.w * p.piece.scale, h: p.art.h * p.piece.scale }) : null;
      renderer?.writeDecalSlot?.(p.decal, 0, decorMountFloats(quad));
    }
    const price = p.door && p.piece ? p.piece.paid : p.placer ? p.placer.price() : null;
    const edit = p.editing && p.placer && !deps.room?.()?.free ? decorEditPrice(p.radius, p.editing, p.door && p.piece ? p.piece.scale : p.placer.state().scale) : null;
    bar?.show({
      name: p.editing ? `Moving ${p.entry.name}` : p.entry.name, price, priceText: edit ? decorEditText(edit) : p.free ? 'free' : null,
      count: pool.size(), cap: capHere(deps.room?.()),
      snap: !!p.placer?.state().snap, why: placingWhy(p, price),
      sized: decorEntrySized(p.entry), preview: !!p.lock,
    });
    if (p.batch && p.piece && p.flatSize) {
      const sc = p.piece.scale;
      p.batch.origin = [origin[0] + p.piece.pos[0], origin[1] + p.piece.pos[1], origin[2] + p.piece.pos[2]];
      p.batch.size = { w: p.flatSize.w * sc * (p.mirrors !== false && decorFlatMirrored(p.piece) ? -1 : 1), h: p.flatSize.h * sc };
      if (p.batch.bounds) p.batch.bounds[3] = Math.hypot(p.batch.size.w, p.batch.size.h) * 0.5;
    }
  }

  function doorFrame(p, origin, cam) {
    const r = ensureRooms();
    if (!r.done()) r.step();
    else ensureDoorways()?.step();
    const free = closableDoorways(p);
    const c = deps.collider?.() ?? null;
    // Only a doorway the eye sees counts; DOOR_SIGHT_SPARE allows for a middle that sits inside a thick wall.
    const seen = c ? (mid, dist) => {
      const d = [(mid[0] - p.fly[0]) / dist, (mid[1] - p.fly[1]) / dist, (mid[2] - p.fly[2]) / dist];
      const hit = c.raycastHit(p.fly, d, dist, deps.walls ?? null);
      return !(typeof hit?.dist === 'number' && hit.dist < dist - DOOR_SIGHT_SPARE);
    } : null;
    const aimed = free ? decorDoorwayAimed(free, p.fly, lookDir(cam.yaw, cam.pitch), DECOR_EYE_REACH, seen) : null;
    const m = p.placer ? modelFor(p.entry.model) : null;
    const fit = aimed && m ? decorDoorFit(aimed, m.box, p.flip) : null;
    p.piece = fit ? decorPieceOf({
      id: p.id, model: p.entry.model, flat: null, pos: [fit.pos[0] - origin[0], fit.pos[1] - origin[1], fit.pos[2] - origin[2]],
      rot: [fit.yaw, 0, 0], scale: fit.scale, light: p.editing?.light ?? null, storage: false,
      paid: p.free ? 0 : decorPrice(p.radius ?? 0, fit.scale),
    }) : null;
    markDoorways(p, free ?? [], aimed);
  }
  function markLot(p) {
    const quads = deps.lot?.() ?? [];
    const sig = quads.map((q) => q.pos.map((v) => v.toFixed(2)).join(',')).join('|');
    if (sig === p.lotSig || !renderer?.createDecalBatch) return;
    p.lotSig = sig;
    p.lotMarks ??= renderer.createDecalBatch(DECOR_LOT_MARKS);
    markTex ??= renderer.uploadTexture?.('decor', 'doorway-mark', decorDoorMarkPixels(), { mips: false }) ?? null;
    const out = new Float32Array(DECAL_FLOATS * DECOR_LOT_MARKS);
    for (let i = 0; i < DECOR_LOT_MARKS; i++) {
      if (quads[i]) writeDecalQuad(out, i * DECAL_FLOATS, { ...quads[i], tint: DECOR_LOT_MARK, wet: 0 });
      else clearDecalQuad(out, i * DECAL_FLOATS);
    }
    renderer.writeDecalSlot?.(p.lotMarks, 0, out);
  }
  function markDoorways(p, free, aimed) {
    const sig = `${free.map((w) => w.id).join(',')}|${aimed?.id ?? ''}`;
    if (sig === p.markSig) return;
    p.markSig = sig;
    if (!renderer?.createDecalBatch) return;
    p.marks ??= renderer.createDecalBatch(DECOR_DOOR_MARKS);
    markTex ??= renderer.uploadTexture?.('decor', 'doorway-mark', decorDoorMarkPixels(), { mips: false }) ?? null;
    const out = new Float32Array(DECAL_FLOATS * DECOR_DOOR_MARKS);
    for (let i = 0; i < DECOR_DOOR_MARKS; i++) {
      const w = free[i];
      if (!w) { clearDecalQuad(out, i * DECAL_FLOATS); continue; }
      writeDecalQuad(out, i * DECAL_FLOATS, { ...decorDoorwayQuad(w), tint: w === aimed ? DECOR_DOOR_MARK_AIMED : DECOR_DOOR_MARK_FREE, wet: 0 });
    }
    renderer.writeDecalSlot?.(p.marks, 0, out);
  }

  function placingWhy(p, price) {
    if (p.refused && now() - p.refused.at < DECOR_REFUSAL_MS) return p.refused.text;
    if (!p.placer) return 'Loading...';
    if (p.door && !p.piece) {
      const free = closableDoorways(p);
      if (!free) return DECOR_DOOR_FINDING;
      if (!free.length) return freeDoorways(p.editing?.id ?? null)?.length ? DECOR_DOOR_TOO_WIDE : DECOR_DOOR_NONE;
      return decorDoorAimLine(free.length);
    }
    if (!p.piece) return p.entry.mount ? DECOR_MOUNT_NO_SURFACE : 'It cannot stand there.';
    const lotWhy = whyNotHere(p) ?? null;
    if (lotWhy) return lotWhy;
    if (p.editing) {
      const { pay } = deps.room?.()?.free ? { pay: 0 } : decorEditPrice(p.radius, p.editing, p.door ? p.piece.scale : p.placer.state().scale);
      const gold = (deps.wallet?.().gold ?? 0) + draftGoldNow();
      if (pay > gold) return `You need ${pay - gold} more gold.`;
      return !deps.touch && !deps.locked?.() ? 'Click to look around again.' : null;
    }
    if (p.entry.kind === 'own' && !deps.packHas?.(p.entry.own)) return p.entry.furnishing ? 'It is no longer among your things.' : 'It is no longer in your pack.';
    const why = decorWhyNot({ price, ready: true, gold: (deps.wallet?.().gold ?? 0) + draftGoldNow(), count: pool.size(), cap: capHere(deps.room?.()), yard: !!deps.room?.()?.yard, hall: !!deps.room?.()?.hall, camp: !!deps.room?.()?.camp });
    if (why) return why;
    return !deps.touch && !deps.locked?.() ? 'Click to look around again.' : null;
  }

  function cameraOverride(cam) {
    if (placing && !placing.suspended) cam.pos = [...placing.fly];
  }

  function draw(r = renderer, texRemap = null) {
    const p = placing;
    if (!p || p.suspended || p.entry?.model == null) return false;
    const m = modelFor(p.entry.model);
    if (!m || !inLaw(m.gpu, texRemap)) return false;
    if (p.piece) r?.drawMesh?.(m.gpu, decorMatrix(p.piece, deps.origin?.() ?? [0, 0, 0]), texRemap);
    // The pale copy at the old place is depth tested but never writes depth.
    if (p.editing && p.lifted) r?.drawMesh?.(m.gpu, decorMatrix(p.editing, deps.origin?.() ?? [0, 0, 0]), texRemap, { translucent: DECOR_PALE_COPY });
    return !!p.piece;
  }
  const batches = () => (placing && !placing.suspended && placing.piece && placing.batch ? [placing.batch] : []);
  function drawMounts(r = renderer) {
    const p = placing;
    if (p && !p.suspended && p.marks && markTex) (r?.drawDecalPicture ?? r?.drawDecals)?.call(r, p.marks, markTex);
    if (p && !p.suspended && p.lotMarks && markTex) (r?.drawDecalPicture ?? r?.drawDecals)?.call(r, p.lotMarks, markTex);
    if (!p || p.suspended || !p.piece || !p.decal || !p.art) return false;
    (r?.drawDecalPicture ?? r?.drawDecals)?.call(r, p.decal, p.art.tex);
    return true;
  }

  /** @type {Array<{ id: number, remap: any, asked: number, resolve: (url: string|null|PromiseLike<string|null>) => void }>} */
  const thumbAsks = [];
  let remapNow = null;
  const remapTags = new WeakMap();
  let remapSeq = 0;
  const remapTag = () => {
    if (!remapNow) return '0';
    if (typeof remapNow !== 'object') return `=${remapNow}`;
    const law = remapLawOf(remapNow);
    if (law) return law;
    let t = remapTags.get(remapNow);
    if (!t) remapTags.set(remapNow, (t = ++remapSeq));
    return String(t);
  };
  const sameLaw = (a, b) => a === b || (!!remapLawOf(a) && remapLawOf(a) === remapLawOf(b));
  // While the panel is down nothing ages, so a pending tile is not dropped; an ask from a room left since is.
  function holdThumbs(texRemap) {
    letThumbsGo();
    const t = now();
    for (let i = 0; i < thumbAsks.length;) {
      const ask = thumbAsks[i];
      if (!sameLaw(ask.remap, texRemap)) { thumbAsks.splice(i, 1); ask.resolve(null); continue; }
      ask.asked = t;
      i++;
    }
  }
  function modelPicture(id) {
    if (!renderer?.panelFrame || !deps.canvas || !deps.doc) return null;
    return new Promise((resolve) => { thumbAsks.push({ id, remap: remapNow, asked: now(), resolve }); });
  }
  let thumbHold = null;
  /** @type {Map<number, {gpu: any, box: any}|null>} */
  const thumbModels = new Map();
  // Tile models go through the panel's own hold and are let go with the panel, so a scrolled catalog does not
  // stay on the GPU for the session.
  function thumbModel(id) {
    if (!deps.thumbHold) return modelFor(id);
    const kept = models.get(id);
    if (kept) return kept;
    if (thumbModels.has(id)) return thumbModels.get(id) ?? null;
    thumbHold ??= deps.thumbHold() ?? null;
    if (!thumbHold) return modelFor(id);
    const hold = thumbHold;
    thumbModels.set(id, null);
    Promise.resolve(hold?.getGpuMesh?.(id)).then((gpu) => {
      const cpu = deps.cpuModels?.get?.(id);
      if (hold === thumbHold && gpu && cpu?.positions) thumbModels.set(id, { gpu, box: localAabb(cpu.positions) });
    }, () => {});
    return null;
  }
  function letThumbsGo() {
    if (!thumbHold) return;
    thumbHold.release?.();
    thumbHold = null;
    thumbModels.clear();
  }
  function drawThumbs(texRemap) {
    if (!thumbAsks.length) return 0;
    const cover = panel?.isOpen() ? panel.cardRect?.() : hotbar?.rect?.();
    const rect = canvasBoxUnder(deps.canvas, cover, DECOR_THUMB_PX, DECOR_THUMB_PX);
    if (!rect) return 0;
    let drawn = 0;
    for (let i = 0; i < thumbAsks.length && drawn < DECOR_THUMBS_A_FRAME;) {
      const ask = thumbAsks[i];
      if (!sameLaw(ask.remap, texRemap) || now() - ask.asked > DECOR_THUMB_WAIT_MS) { thumbAsks.splice(i, 1); ask.resolve(null); continue; }
      const m = thumbModel(ask.id);
      if (!m || !inLaw(m.gpu, texRemap)) { i++; continue; }
      thumbAsks.splice(i, 1);
      drawn++;
      ask.resolve(drawThumb(m, rect, texRemap));
    }
    return drawn;
  }
  function drawThumb(m, rect, texRemap) {
    const cam = decorThumbCamera(m.box);
    return panelPicture({ renderer, canvas: deps.canvas, doc: deps.doc, rect, proj: cam.proj, view: cam.view, body: () => renderer.drawMesh(m.gpu, cam.model, texRemap) });
  }

  function drawPreview(texRemap = null) {
    remapNow = texRemap;
    const pictures = !!panel?.isOpen() || (!!placing?.browse && !!deps.room?.());
    if (!pictures || !renderer?.panelFrame) { holdThumbs(texRemap); return false; }
    drawThumbs(texRemap);
    if (!panel?.isOpen()) return false;
    const e = panel.pointed();
    if (e?.model == null) return false;
    const m = modelFor(e.model);
    const box = panel.previewRect();
    const c = deps.canvas?.getBoundingClientRect?.();
    if (!m || !box || !c || !(c.width > 0) || !(c.height > 0) || !inLaw(m.gpu, texRemap)) return false;
    const sx = deps.canvas.width / c.width;
    const sy = deps.canvas.height / c.height;
    const rect = { x: (box.left - c.left) * sx, y: (box.top - c.top) * sy, w: box.width * sx, h: box.height * sy };
    if (!(rect.w >= 8) || !(rect.h >= 8)) return false;
    const [x0, y0, z0, x1, y1, z1] = m.box;
    const rad = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 || 1;
    const fov = 40 * (Math.PI / 180);
    const dist = (rad / Math.sin(fov / 2)) * 1.05;
    const proj = mirrorProjectionX(perspective(fov, rect.w / rect.h, Math.max(0.05, dist - rad * 1.5), dist + rad * 1.5));
    const eyeAt = lookAt([0, 0, -dist], [0, 0, 0], [0, 1, 0]);
    const model = multiply(trs(0, 0, 0, 0, spin, 0), trs(-(x0 + x1) / 2, -(y0 + y1) / 2, -(z0 + z1) / 2, 0, 0, 0));
    renderer.panelFrame({
      proj, view: eyeAt, lightDir: new Float32Array([0, 0.707, -0.707]), rect, clear: [0.055, 0.063, 0.075, 1],
      setup: () => { renderer.setFog?.('off'); renderer.setLighting?.(new Float32Array([0.8, 0.8, 0.8]), 0); },
    }, () => renderer.drawMesh(m.gpu, model, texRemap));
    // The card over the game is opaque, so the pass is copied out in this frame while the drawing buffer still
    // holds it.
    const pc = panel.previewCanvas?.();
    const ctx = pc?.getContext?.('2d');
    if (ctx) {
      const pw = Math.max(1, Math.round(rect.w));
      const ph = Math.max(1, Math.round(rect.h));
      if (pc.width !== pw || pc.height !== ph) { pc.width = pw; pc.height = ph; }
      try { ctx.drawImage(deps.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, pw, ph); } catch { }
    }
    return true;
  }

  function close() {
    if (placing) endPlacing();
    if (panel?.isOpen()) panel.close();
    button?.render(false);
    letThumbsGo();
  }

  return {
    frame, cameraOverride, draw, batches, drawMounts, drawPreview, close, openPanel, commit, back, act,
    confirmDraft, discardDraft,
    mayEdit, keepDraft,
    setBase,
    rentAct,
    paintAct,
    flying: () => !!placing && !placing.suspended,
    panelOpen: () => !!panel?.isOpen(),
    useLabel: (id) => useWords(id),
    ghost: () => placing?.piece ?? null,
    placer: () => placing?.placer ?? null,
    why: () => (placing ? placingWhy(placing, placing.door && placing.piece ? placing.piece.paid : placing.placer ? placing.placer.price() : null) : null),
    destroy() {
      close();
      listen(false);
      offRefresh?.();
      holdCharacterBar(false);
      coverHotbar(false);
      button?.destroy(); panel?.destroy(); bar?.destroy(); hotbar?.destroy();
      button = panel = bar = hotbar = null;
      deps.win?.removeEventListener?.('keydown', onDecorateKey, true);
      verbsOff();
    },
  };
}
