// Quick loot takes from the hover plaque without opening a window; classic Daggerfall has no counterpart.
// This module holds the highlight state and the take, and imports no host or document.
import { setClassicLootFrame } from '../ui/classicLootFrame.js';
import { getPref } from '../ui/uiPrefs.js';
import { itemNameParts, itemStatRows } from './itemInfo.js';
import { nextSelection, selectedRow, hoverItemAt } from '../player/worldHover.js';
import { planTake, applyTransfer, sendQuestItemClick, REFUSAL } from './itemTransfer.js';
import { isMap } from './useItem.js';
import { audio } from '../audio/audio.js';
import { SOUND } from '../audio/soundClips.js';
import { lootRarityOn, rarityRank, RARITIES } from './lootRarity.js';
import { isJunk, JUNK_GROUPS } from './itemJunk.js';
import { isAmmunition } from './itemTemplates.js';
import { isEnchanted } from './inventory.js';

export const quickLootOn = () => !!getPref('quickLoot');

export const QUICK_LOOT_TIER = 'quickLootTier';
export const QUICK_LOOT_FLOORS = Object.freeze({ all: 0, magic: RARITIES.magic.rank, rare: RARITIES.rare.rank });
export function takeAllLeaves(item) {
  if (!item || item.questItem) return false;
  if (isJunk(item)) return true;
  const floor = QUICK_LOOT_FLOORS[getPref(QUICK_LOOT_TIER)] ?? 0;
  if (!(floor > 0) || !lootRarityOn() || !JUNK_GROUPS.includes(item.group) || isAmmunition(item)) return false;
  if (!item.rarity && isEnchanted(item)) return false;
  return rarityRank(item) < floor;
}
export const QUICK_LOOT_LEFT = (n) => `${n} left by your quick-loot filter.`;

export const tookItemText = (item) => `You take the ${itemNameParts(item).name || 'item'}.`;

// Truthy and not an item, so a host does not open the window over a take that was refused.
export const QUICK_LOOT_REFUSED = Object.freeze({ refused: true });

let _tookSound = null;
function takeSound() {
  if (_tookSound) audio.playOneShot(_tookSound === 'gold' ? SOUND.GoldPieces : SOUND.ButtonClick, 1);
  _tookSound = null;
}
function takeThrough(playerEntity, items, item, getQuest, moved = null, wholeStack = false) {
  // A map is used rather than taken, so it is left for the window.
  if (isMap(item)) return null;
  // The quest click goes before the carry plan, as classic sends it before the carry check.
  sendQuestItemClick(item, getQuest);
  const plan = planTake(item, { bag: playerEntity.items ?? [], entity: playerEntity, getQuest });
  if (!plan.ok) return { refusal: plan.refusal };
  if (wholeStack && plan.amount < (item.stackCount ?? 1)) return { refusal: REFUSAL.cannotCarry };
  if (plan.sound === 'gold' || !_tookSound) _tookSound = plan.sound === 'gold' ? 'gold' : 'click';
  const got = applyTransfer(item, plan, items, (playerEntity.items ??= []), { entity: playerEntity, toPlayer: true }) ?? item;
  moved?.push({ item: got, count: plan.amount });
  return got;
}

function shownBy(took, moved, playerEntity) {
  if (typeof took !== 'function' || !moved.length) return false;
  try { return took(moved, playerEntity) === true; } catch (e) {
    console.warn(`[quick-loot] the pickup face failed; the line is said instead: ${e?.message ?? e}`);
    return false;
  }
}

// A take that empties a body must not disable it: classic disables on the activation that finds it empty.
export const containerEmptied = (items) => !(items ?? []).some(Boolean);

let _sel = null;
// Wheel clicks add up here and fold once a frame, since a trackpad sends many events between two frames.
let _nudge = 0;
let _actionIds = null;
let _lastKey = null;
let _pending = null;

export function quickLootWheel(deltaY) {
  // Down the page is down the list, the opposite sign from the camera zoom.
  const clicks = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
  if (!_sel || !clicks || !(_actionIds || quickLootOn())) return false;
  if (_actionIds && _actionIds.length <= 1 && _sel.row >= 0) return false;
  _nudge += clicks;
  return true;
}

export function foldQuickLoot(frame) {
  const verbs = frame?.kind === 'actions';
  // A container peek never lights a row, or P and J would arm a take that lands on the next pile.
  const take = frame?.kind === 'items' && !frame.preview;
  _sel = (verbs || (take && quickLootOn())) ? nextSelection(_sel, frame, _nudge) : null;
  _actionIds = verbs && _sel ? frame.rows.map((r) => r.id) : null;
  _lastKey = _sel ? frame.key : null;
  // The nudge is spent even when it moved nothing, so a click spent on a door never reaches a later chest.
  _nudge = 0;
  return _sel;
}

export function plaqueActionFor(key) {
  if (!_actionIds || !_sel || key == null || _sel.key !== key) return null;
  return _actionIds[_sel.row] ?? null;
}

export const plaqueListing = () => !!(_actionIds && _actionIds.length && _sel);

const _verbAskers = new Set();
export function wantPlaqueVerbs(asks) {
  const one = { asks };
  _verbAskers.add(one);
  return () => { _verbAskers.delete(one); };
}
export function plaqueVerbsWanted() {
  for (const one of _verbAskers) { try { if (one.asks()) return true; } catch { } }
  return false;
}

export function plaqueStep(n) {
  if (!_actionIds || !_sel || !Number.isFinite(n) || !n) return false;
  _nudge += Math.trunc(n);
  return true;
}

export function plaqueLightFirst(key) {
  if (!_actionIds || !_sel || key == null || _lastKey !== key || _sel.key !== key || _sel.row >= 0 || !_actionIds.length) return false;
  _sel = { key, row: 0, id: _actionIds[0] };
  return true;
}

export const plaqueActionSelection = () => (_actionIds && _sel ? { key: _sel.key, id: _sel.row >= 0 ? (_actionIds[_sel.row] ?? null) : null } : null);

export const quickLootRow = (frame) => selectedRow(_sel, frame);

export const quickLootSelection = () => (_sel ? { ..._sel } : null);

/** @returns {{label: string, text: string}[]} */
export function quickLootStats(frame) {
  const row = quickLootRow(frame);
  if (row < 0) return [];
  return itemStatRows(frame?.rows?.[row]?.item ?? null);
}

export function resetQuickLoot() { _sel = null; _nudge = 0; _pending = null; _actionIds = null; _lastKey = null; _tookSound = null; setClassicLootFrame(null); }

export function quickLootTake(key, hooks, playerEntity, say = () => {}, { getQuest = null, took = null } = {}) {
  // The armed mode is spent on this press, whatever the press finds.
  const how = _pending;
  _pending = null;
  if (how === 'open') return null;
  if (!quickLootOn() || !hooks || !playerEntity) return null;
  const items = hooks.items?.();
  if (!Array.isArray(items)) return null;
  if (how === 'all') {
    let n = 0, refusal = null, left = 0;
    const moved = [];
    _tookSound = null;
    // Copies the list because each take splices the source.
    for (const it of [...items]) {
      if (takeAllLeaves(it)) { left++; continue; }
      const got = takeThrough(playerEntity, items, it, getQuest, moved);
      if (got?.refusal) { refusal ??= got.refusal; continue; }
      if (got) n += 1;
    }
    if (left) refusal = { ...(refusal ?? {}), text: [refusal?.text, QUICK_LOOT_LEFT(left)].filter(Boolean).join(' ') };
    takeSound();
    if (n && shownBy(took, moved, playerEntity)) { if (refusal?.text) say(refusal.text); }
    else if (n) say((n === 1 ? 'You take 1 item.' : `You take ${n} items.`) + (refusal?.text ? ` ${refusal.text}` : ''));
    else if (refusal) { say(refusal.text); return QUICK_LOOT_REFUSED; }
    return n ? items : null;
  }
  const item = quickLootItemAt(key, items);
  if (!item) return null;
  return takeOneItem(playerEntity, items, item, say, { getQuest, took });
}

export function takeOneItem(playerEntity, items, item, say = () => {}, { getQuest = null, took = null, wholeStack = false } = {}) {
  if (!playerEntity || !Array.isArray(items) || !items.includes(item)) return null;
  _tookSound = null;
  const moved = [];
  const got = takeThrough(playerEntity, items, item, getQuest, moved, wholeStack);
  if (got?.refusal) { say(got.refusal.text); return QUICK_LOOT_REFUSED; }
  if (got) { takeSound(); if (!shownBy(took, moved, playerEntity)) say(tookItemText(got)); }
  return got;
}

export function quickLootArm(action) {
  if (!quickLootOn() || !_sel || _actionIds) return false;
  if (action === 'QuickLootAll') { _pending = 'all'; return true; }
  if (action === 'QuickLootOpen') { _pending = 'open'; return true; }
  return false;
}

// Spends an armed key on a press that takes through no pile, so the next press on a pile does not take everything.
export function quickLootSpend() { _pending = null; }

function quickLootItemAt(key, items) {
  // Checks the key so a pile the crosshair has left returns null, not row 0 of whatever is under it now.
  if (!_sel || _actionIds || _sel.key !== key) return null;
  return hoverItemAt(items, _sel.row, Infinity);
}
