// @ts-check

import { lootRarityOn, allLegendaries, legendaryById, powerOf, foundAmong, powerFits, recordFitsGroup } from './lootRarity.js';
import { AETHERIC_RECORDS, aethericById } from './aetheric.js';
import { GILDED_RECORDS, gildedById } from './gilded.js';
import { registerTakeListener } from './inventory.js';
import { registerModSaveData } from '../saves/modSaveData.js';
import { registerMagicRoundHook, worldMinutes } from '../world/worldTick.js';
import { hudText } from '../ui/notify.js';
import { presentCodexFind } from './acquireWatch.js';
import { audio } from '../audio/audio.js';
import { SOUND } from '../audio/soundClips.js';
import { isEquipped, equipTableOf } from '../characters/equip.js';
import { itemIsIdentified } from '../trade/tradeModes.js';
import { totalGoldAmount, deductGold } from '../justice/court.js';
import { shardsHeld, spendShards } from './reforge.js';

const empty = () => ({ legendary: {}, aetheric: {}, gilded: {} });
const RECORD_OF = Object.freeze({ legendary: legendaryById, aetheric: aethericById, gilded: gildedById });
let _codex = empty();
let _backfill = false;
const _day = () => Math.max(0, Math.floor((Number(worldMinutes()) || 0) / 1440));

export const foundDay = (kind, id) => _codex[kind]?.[id] ?? null;
export const foundIds = (kind) => Object.keys(_codex[kind] ?? {});

export function codexKey(item) {
  if (item?.rarity === 'legendary' && typeof item.legendary === 'string' && legendaryById(item.legendary)) return { kind: 'legendary', id: item.legendary };
  if (item?.rarity === 'aetheric' && typeof item.aetheric === 'string' && aethericById(item.aetheric)) return { kind: 'aetheric', id: item.aetheric };
  if (item?.rarity === 'gilded' && typeof item.gilded === 'string' && gildedById(item.gilded)) return { kind: 'gilded', id: item.gilded };
  return null;
}
export const CODEX_FIND = (name, kind) => `${name}: ${kind === 'gilded' ? 'a Gilded piece' : kind === 'aetheric' ? 'an Aetheric piece' : 'a Legendary'}! Added to your codex.`;

export function noteFind(item, { quiet = false } = {}) {
  if (!lootRarityOn()) return false;
  const key = codexKey(item);
  if (!key || foundDay(key.kind, key.id) != null) return false;
  _codex[key.kind][key.id] = _day();
  if (!quiet && !presentCodexFind(item, key.kind)) {
    const rec = RECORD_OF[key.kind](key.id);
    hudText(CODEX_FIND(rec?.name ?? item.name ?? '', key.kind));
    audio.playOneShot?.(SOUND.LevelUp, 1);
  }
  return true;
}
export function sweepCodex(entity) {
  if (!lootRarityOn() || !entity) return 0;
  const worn = entity.equip ? equipTableOf(entity).filter(Boolean) : [];
  const quiet = _backfill;
  _backfill = false;
  let n = 0;
  for (const it of [...(entity.items ?? []), ...worn]) if (noteFind(it, { quiet })) n++;
  return n;
}

export const CODEX = 'lootCodex';
export const CODEX_SAVE_VENDOR = 'LootCodex';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export function validCodexRecord(r) {
  const out = empty();
  for (const kind of Object.keys(RECORD_OF)) {
    const m = r && typeof r === 'object' ? r[kind] : null;
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    for (const [id, day] of Object.entries(m)) {
      if (!ID_RE.test(id) || !Number.isSafeInteger(day) || day < 0) continue;
      if (!RECORD_OF[kind](id)) continue;
      out[kind][id] = day;
    }
  }
  return out;
}
// A save without a codex gets the fill mark, so the first sweep records what the character carries with no notice.
registerModSaveData(CODEX_SAVE_VENDOR, {
  newSaveData: () => ({ ...empty(), fill: true }),
  getSaveData: () => ({ legendary: { ..._codex.legendary }, aetheric: { ..._codex.aetheric }, gilded: { ..._codex.gilded } }),
  restoreSaveData: (r) => { _codex = validCodexRecord(r); _backfill = !r || typeof r !== 'object' || r.fill === true; },
  newGame: () => { _codex = empty(); _backfill = false; },
});
// A take from a body or pile is noted at once; anything else that reaches the pack waits for the magic-round sweep.
registerTakeListener(CODEX, (item) => { noteFind(item); });
registerMagicRoundHook(CODEX, (entity) => { if (entity?.isPlayer) sweepCodex(entity); });

export const FAMILY_HINT = Object.freeze({
  undead: 'Said to be carried by the undead', daedra: 'Said to be held by the daedra', dragon: 'Said to lie in a dragon\'s hoard',
  beast: 'Said to be found among the beasts of the wild', brute: 'Said to be carried by orcs and giants',
  caster: 'Said to be kept by mages and witches', rogue: 'Said to pass among thieves and assassins', warrior: 'Said to be borne by warriors and knights',
});
export function codexRows() {
  return allLegendaries().map((r) => {
    const day = foundDay('legendary', r.id);
    const p = powerOf(r.id);
    return { id: r.id, kind: 'legendary', name: day != null ? r.name : null, group: r.group, found: day != null, day, hint: FAMILY_HINT[foundAmong(r.id)] ?? r.hint ?? '', power: day != null ? p : null, lore: day != null ? r.lore : null };
  });
}
export function codexSets() {
  const sets = new Map();
  for (const r of AETHERIC_RECORDS) {
    if (!sets.has(r.set)) sets.set(r.set, []);
    const day = foundDay('aetheric', r.id);
    sets.get(r.set).push({ id: r.id, name: day != null ? r.name : null, found: day != null, day });
  }
  return [...sets].map(([set, pieces]) => ({ set, pieces }));
}
export const GILDED_HINT = 'Said to lie in the brass of the Hour, once in a long while';
export function codexGilded() {
  return GILDED_RECORDS.map((r) => {
    const day = foundDay('gilded', r.id), found = day != null;
    return { id: r.id, kind: 'gilded', name: found ? r.name : null, group: r.group, found, day, hint: r.hint ?? GILDED_HINT, power: found ? r.power : null, lore: found ? r.lore : null };
  });
}
export const codexCount = () => ({ legendary: codexRows().filter((r) => r.found).length, legendaries: allLegendaries().length, aetheric: foundIds('aetheric').length, aetherics: AETHERIC_RECORDS.length, gilded: foundIds('gilded').length, gildeds: GILDED_RECORDS.length });

export const IMPRINT_PRICE = Object.freeze({ shards: 20, gold: 5000 });
export const imprintChoices = (item) => (item?.rarity === 'rare'
  ? allLegendaries().filter((r) => recordFitsGroup(r, item) && foundDay('legendary', r.id) != null && powerFits(item, powerOf(r.id)))
  : []);
export function imprintRefusal(item, recordId, player) {
  if (!lootRarityOn()) return 'off';
  if (item?.rarity !== 'rare') return 'not';
  if (!itemIsIdentified(item)) return 'unknown';
  if (isEquipped(item)) return 'worn';
  if (typeof item.imprint === 'string') return 'imprinted';
  if (!imprintChoices(item).some((r) => r.id === recordId)) return 'unfound';
  if (shardsHeld(player?.items) < IMPRINT_PRICE.shards) return 'shards';
  if (totalGoldAmount(player) < IMPRINT_PRICE.gold) return 'gold';
  return null;
}
export function imprintPiece(item, recordId, player) {
  if (!player || !Array.isArray(player.items) || !player.items.includes(item)) return { ok: false, reason: 'gone' };
  const why = imprintRefusal(item, recordId, player);
  if (why) return { ok: false, reason: why };
  spendShards(player.items, IMPRINT_PRICE.shards);
  deductGold(player, IMPRINT_PRICE.gold);
  item.imprint = recordId;
  return { ok: true };
}

export function _resetCodexForTests() { _codex = empty(); _backfill = false; }
