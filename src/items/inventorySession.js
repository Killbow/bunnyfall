import { DROP_ICON_IDXS, DROP_ICON_ARCHIVES, RANDOM_TREASURE_ARCHIVE } from './lootDataTables.js';
import { STORAGE_CONTEXT } from '../travel/horseCartLaw.js';
import { localizedText, t } from '../ui/textManager.js';
import { BAG_CAPACITY, BAG_WORDS, hasBag } from '../net/bagLaw.js';
import { activeWagonItem } from '../travel/wagonKinds.js';

export const SMALL_CART_TEMPLATE = 93;
export const WAGON_ACCESS_DISTANCE = 5;
export const NO_WAGON_TEXT = "You don't own a wagon.";
export const EXIT_TOO_FAR_TEXT = 'The exit is too far away for you to access your wagon.';

export const WAGON_REFUSAL = Object.freeze({
  noWagon: { reason: 'noWagon', get text() { return localizedText('noWagon', NO_WAGON_TEXT); } },
  exitTooFar: { reason: 'exitTooFar', get text() { return localizedText('exitTooFar', EXIT_TOO_FAR_TEXT); } },
});

// A shared chest's window works on a copy of the pack until close, so wagon, bag, and item actions wait for it.
export const settlesOwnPieces = (deps = {}) => typeof deps.loot?.commit === 'function';
export const CHEST_ALONE_REFUSAL = Object.freeze({ reason: 'chestAlone', get text() { return t('inventory.store.chestAlone', 'Shut the chest before you open your wagon or your bag.'); } });
export const CHEST_ACT_REFUSAL = Object.freeze({ reason: 'chestAct', get text() { return t('inventory.store.chestAct', 'Shut the chest before you do that.'); } });
export function chestActRefusal(deps = {}, { wear = false, item = null } = {}) {
  if (!settlesOwnPieces(deps)) return null;
  return wear && (deps.entity?.items ?? []).includes(item) ? null : CHEST_ACT_REFUSAL;
}

export const hasCart = (items = []) =>
  (items ?? []).some((it) => it?.templateIndex === SMALL_CART_TEMPLATE);

export const TRANSPORT_HORSE_TEMPLATE = 94;

export const hasHorse = (items = []) =>
  (items ?? []).some((it) => it?.templateIndex === TRANSPORT_HORSE_TEMPLATE);

export function transportItem(items = [], kind) {
  // Every wagon uses the Small Cart template, so the cart is the wagon driven, not the first one in the pack.
  if (kind !== 'mount') return activeWagonItem(items ?? []);
  return (items ?? []).find((it) => it?.templateIndex === TRANSPORT_HORSE_TEMPLATE) ?? null;
}

/** @returns {{mode:'remove'|'equip', usingWagon:boolean, allowDungeonWagonAccess:boolean, chooseOne:object|null}} */
export function openState(deps = {}) {
  const chooseOne = deps.chooseOne ?? null;
  let mode = deps.loot || chooseOne ? 'remove' : 'equip';
  const rt = deps.horseCart?.() ?? null;
  const selectWagon = !!rt?.consumeWagonSelectionRequest?.();
  if (rt) {
    // The wagon prompt flag is also raised outdoors, so only the flag inside a dungeon counts as an exit request.
    const exitRequest = !!(deps.dungeon?.wagonPrompt && deps.dungeon?.inside);
    const d = rt.canAccessWagonStorage(exitRequest ? STORAGE_CONTEXT.DungeonExitSelection : STORAGE_CONTEXT.NormalInventory);
    if (exitRequest && !d.allowed) return { mode, usingWagon: false, allowDungeonWagonAccess: false, chooseOne, refusal: { reason: 'horseCart', text: d.denialMessage } };
    const baseShown = !!deps.dungeon?.wagonPrompt;
    const usingWagon = d.allowed && (baseShown || ((selectWagon || exitRequest) && !deps.loot));
    return { mode: usingWagon ? 'remove' : mode, usingWagon, allowDungeonWagonAccess: false, dungeonExitAccessGranted: exitRequest && d.allowed, chooseOne };
  }
  if (deps.dungeon?.wagonPrompt) return { mode: 'remove', usingWagon: true, allowDungeonWagonAccess: true, chooseOne };
  // Wagon access is decided on open, so walking away from the exit mid-window keeps it.
  const allowDungeonWagonAccess = !!(
    deps.dungeon?.inside && hasCart(deps.items?.() ?? []) && deps.dungeon?.nearExit?.()
  );
  let usingWagon = false;
  if (allowDungeonWagonAccess && !deps.loot) usingWagon = true;
  return { mode, usingWagon, allowDungeonWagonAccess, chooseOne };
}

// Claim order matters: the bag or wagon while showing, then a choose-one list, then the loot or dropped list.
export function remoteTarget(deps = {}, state = {}) {
  if (state.usingBag) return deps.bagItems?.() ?? [];
  if (state.usingWagon) return deps.wagonItems?.() ?? state.wagonLocal ?? [];
  if (state.chooseOne) return state.chooseOne.items;
  return deps.loot ? deps.loot.items() : state.dropped;
}

export function groundRefusalOf(deps = {}, state = {}) {
  if (state.usingWagon || state.usingBag || state.chooseOne) return null;
  if (deps.loot && !deps.loot.playerOwned) return deps.storeRefusal?.() ?? null;
  return deps.dropRefusal?.() ?? null;
}

export function storeCapacityOf(deps = {}, state = {}) {
  if (state.usingBag) return BAG_CAPACITY;
  if (state.usingWagon || state.chooseOne || !deps.loot) return null;
  const cap = deps.loot.capacity?.();
  return cap && Number.isFinite(cap.kg) ? cap : null;
}

export const REMOTE_TARGET_TYPES = Object.freeze({
  Dropped: 0, Wagon: 1, Loot: 2, Merchant: 3,
  Bag: 4,
});

export function remoteTargetType(deps = {}, state = {}) {
  if (state.usingBag) return REMOTE_TARGET_TYPES.Bag;
  if (state.usingWagon) return REMOTE_TARGET_TYPES.Wagon;
  if (state.chooseOne) return REMOTE_TARGET_TYPES.Merchant;
  return deps.loot ? REMOTE_TARGET_TYPES.Loot : REMOTE_TARGET_TYPES.Dropped;
}

export function theftTarget(deps = {}, state = {}) {
  const keeping = deps.loot?.stolenFrom;
  return remoteTargetType(deps, state) === REMOTE_TARGET_TYPES.Loot && keeping instanceof Set ? keeping : null;
}

export function dropIconRecord(archive, texture) {
  const idxs = DROP_ICON_IDXS.get(archive);
  if (!idxs || texture < 0 || texture >= idxs.length) return null;
  return idxs[texture];
}

export function nextDropArchive(archive) {
  let next = false;
  for (const ai of DROP_ICON_IDXS.keys()) {
    if (next) return ai;
    next = (ai === archive);
  }
  return DROP_ICON_IDXS.keys().next().value;
}

export function openDropIcon(deps = {}, chooseOne = null) {
  let archive, texture;
  if (chooseOne) { archive = DROP_ICON_ARCHIVES.combat; texture = 11; }
  else { archive = RANDOM_TREASURE_ARCHIVE; texture = -1; }
  const loot = deps.loot;
  if (loot && loot.playerOwned && (loot.textureArchive ?? 0) > 0) {
    archive = loot.textureArchive;
    const idxs = DROP_ICON_IDXS.get(archive);
    if (idxs) {
      for (let i = 0; i < idxs.length; i++) {
        if (idxs[i] === loot.textureRecord) { texture = i; break; }
      }
    }
  }
  return { archive, texture };
}

export function canChangeDropIcon(deps = {}, state = {}) {
  const t = remoteTargetType(deps, state);
  return t === REMOTE_TARGET_TYPES.Dropped
    || (t === REMOTE_TARGET_TYPES.Loot && !!deps.loot?.playerOwned);
}

export function cycleDropIcon({ archive, texture }, by) {
  if (by === 0) return { archive: nextDropArchive(archive), texture: 0 };
  const len = DROP_ICON_IDXS.get(archive)?.length ?? 0;
  let t = texture + by;
  if (by > 0 && t >= len) t = 0;
  if (by < 0 && t < 0) t = len - 1;
  return { archive, texture: t };
}

// The caller plays the button sound once, whichever arm runs.
/** @returns {{ok:true, usingWagon:boolean}|{ok:false, refusal:object}} */
export function planWagonToggle(deps = {}, state = {}) {
  if (!state.usingWagon && settlesOwnPieces(deps)) return { ok: false, refusal: CHEST_ALONE_REFUSAL };
  const rt = deps.horseCart?.() ?? null;
  if (rt) {
    if (state.usingWagon) return { ok: true, usingWagon: false };
    const d = rt.canAccessWagonStorage(state.dungeonExitAccessGranted && deps.dungeon?.inside ? STORAGE_CONTEXT.DungeonExitSelection : STORAGE_CONTEXT.NormalInventory);
    if (!d.allowed) return { ok: false, refusal: { reason: 'horseCart', text: d.denialMessage } };
    return { ok: true, usingWagon: true };
  }
  if (!hasCart(deps.items?.() ?? [])) return { ok: false, refusal: WAGON_REFUSAL.noWagon };
  if (deps.dungeon?.inside && !state.allowDungeonWagonAccess) {
    return { ok: false, refusal: WAGON_REFUSAL.exitTooFar };
  }
  return { ok: true, usingWagon: !state.usingWagon };
}

export const hasMaterialsBag = (items = []) => hasBag(items);
/** @returns {{ok:true, usingBag:boolean, usingWagon:boolean}|{ok:false, refusal:object}} */
export function planBagToggle(deps = {}, state = {}) {
  if (!hasMaterialsBag(deps.items?.() ?? [])) return { ok: false, refusal: { reason: 'noBag', text: BAG_WORDS.none } };
  if (!state.usingBag && settlesOwnPieces(deps)) return { ok: false, refusal: CHEST_ALONE_REFUSAL };
  if (state.chooseOne && !state.usingBag) return { ok: false, refusal: { reason: 'reward', text: BAG_WORDS.reward } };
  const usingBag = !state.usingBag;
  return { ok: true, usingBag, usingWagon: usingBag ? false : !!state.usingWagon };
}

export function lootFinish(loot) {
  const pending = loot?.finish?.();
  return pending && typeof pending.then === 'function' ? pending : null;
}

export function chestSaveVeil(text) {
  if (typeof document === 'undefined' || !document.body) return () => {};
  const veil = document.createElement('div');
  veil.setAttribute('data-chest-save', '');
  veil.textContent = text || 'Saving...';
  veil.style.cssText = 'position:fixed;inset:0;z-index:39;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);color:#e8dcc0;font:18px serif;pointer-events:all';
  document.body.append(veil);
  return () => veil.remove();
}

export function holdChestSave(gate, loot, again) {
  if (gate?.saving) return true;
  if (gate?.saved) return false;
  const pending = lootFinish(loot);
  if (!pending) return false;
  gate.saving = true;
  const clear = chestSaveVeil(loot?.busy);
  pending.finally(() => { clear(); gate.saving = false; gate.saved = true; again(); });
  return true;
}

// This must also run on a hand-off to another window, or the session's dropped items never reach the ground.
export function closeSession(deps = {}, state = {}) {
  const loot = deps.loot;
  const icon = state.dropIcon ?? null;
  if (loot && loot.playerOwned && (loot.textureArchive ?? 0) > 0 && icon
    && (loot.textureArchive !== icon.archive
      || loot.textureRecord !== dropIconRecord(icon.archive, icon.texture))) {
    // Emptying the old pile releases it so a new one mints in its place. An unchosen icon (-1) counts as changed.
    const from = loot.items();
    state.dropped.push(...from);
    from.length = 0;
  }
  if (state.dropped?.length) {
    const record = icon ? dropIconRecord(icon.archive, icon.texture) : null;
    deps.onDrop?.(state.dropped,
      record == null ? null : { archive: icon.archive, record },
      loot?.pos ?? null);
  }
  try { loot?.closed?.(); } catch (e) { console.warn(`[loot] a container's close threw: ${e?.message ?? e}`); }
  deps.onClose?.();
}
