// BUNNYFALL CRAFTING REWORK, PHASE 1: THE PACK'S SALVAGE, INTO MATERIALS.
// Online, any found piece of gear breaks into its recipe's materials (net/salvageLaw.js), sent to the account service
// and banked in the Stores. A Magic-or-better piece still gives its Welkynd Shards too (systems/reforge.js). Offline,
// or for a piece no recipe makes, the old shard-only salvage stands.
import { salvageRecipeOf, salvageDescriptor, previewSalvage, SALVAGE_BATCH_MAX } from '../net/salvageLaw.js';
import { salvageShards, salvageRefusal, salvagePiece } from '../systems/reforge.js';
import { profBookNow } from './professions/profPages.js';
import { materialLabel } from '../systems/professions/profItems.js';
import { isBound } from '../systems/item/itemBound.js';
import { isLocked } from '../systems/item/itemLock.js';
import { isEquipped } from '../systems/equip.js';
import { socketGems } from '../systems/loot/lootRarity.js';

/** Why a piece will not break into materials, or null. */
export function materialRefusal(item) {
  if (!item) return 'not';
  if (!profBookNow()) return 'offline';
  if (typeof item.provenance === 'string') return 'not';   // a made piece: the Enchanting Station's disenchant
  if (!salvageRecipeOf(item)) return 'not';
  if (item.questItem) return 'quest';
  if (item.artifact || item.rarity === 'artifact') return 'artifact';
  if (item.rarity === 'aetheric') return 'aetheric';
  if (item.rarity === 'gilded') return 'gilded';
  if (socketGems(item).length) return 'gems';
  if (isBound(item)) return 'bound';
  if (isEquipped(item)) return 'worn';
  if (isLocked(item)) return 'locked';
  return null;
}
/** Whether the piece breaks into materials now. */
export const salvagesToMaterials = (item) => materialRefusal(item) == null;

/** Why a piece will not salvage at all (materials or shards), or null. Materials first, then the old shard law. */
export function anySalvageRefusal(item) {
  const m = materialRefusal(item);
  if (m == null) return null;
  const s = salvageRefusal(item);
  return s == null ? null : (m === 'not' || m === 'offline' ? s : m);
}

/** "about 1.2 Dwarven Ingot, 0.4 Copper" - what the pieces should give, on average. */
export function materialsText(items) {
  const list = previewSalvage(items.filter(salvagesToMaterials));
  if (!list.length) return '';
  return `about ${list.map((y) => `${y.n} ${materialLabel(y.key)}`).join(', ')}`;
}

/** What the service answered, in words: "2 Dwarven Ingot, 1 Copper, and 15 Smithing experience". */
export function yieldsText(data) {
  const parts = (data?.yields ?? []).map((y) => `${y.n} ${materialLabel(y.key)}`);
  const xp = Object.entries(data?.xp ?? {}).map(([t, n]) => `${n} ${t[0].toUpperCase()}${t.slice(1)} experience`);
  const all = [...parts, ...xp];
  return all.length ? all.join(', ') : 'nothing usable';
}

/**
 * SALVAGE, MADE: the pieces that break into materials are sent first; on the answer they leave the pack (each Magic or
 * better one through the shard salvage, so its shards still land). Pieces that only give shards break as before.
 * Answers `{ ok, count, shards, data?, error? }`.
 * @param {any[]} pieces @param {{ items: any[] }} pack
 */
export async function salvageForMaterials(pieces, { items }) {
  const chosen = [...new Set(pieces)].filter((it) => items.includes(it));
  const toMaterials = chosen.filter(salvagesToMaterials).slice(0, SALVAGE_BATCH_MAX);
  const shardOnly = chosen.filter((it) => !toMaterials.includes(it) && salvageRefusal(it) == null);
  let data = null, count = 0, shards = 0;
  if (toMaterials.length) {
    const book = profBookNow();
    if (!book) return { ok: false, error: 'offline', count: 0, shards: 0 };
    const r = await book.salvage(toMaterials.map(salvageDescriptor));
    if (!r?.ok) return { ok: false, error: r?.error ?? 'offline', count: 0, shards: 0 };
    data = r.data ?? null;
    for (const it of toMaterials) {
      if (!items.includes(it)) continue;
      if (salvageShards(it) > 0) {
        const s = salvagePiece(it, { items });
        if (s.ok) { shards += s.shards; count++; continue; }
      }
      items.splice(items.indexOf(it), 1);
      count++;
    }
  }
  for (const it of shardOnly) {
    const s = salvagePiece(it, { items });
    if (s.ok) { shards += s.shards; count++; }
  }
  return { ok: true, count, shards, data };
}
