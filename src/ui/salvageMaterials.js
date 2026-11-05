// BUNNYFALL CRAFTING REWORK, PHASE 1: THE PACK'S SALVAGE, INTO MATERIALS.
// Online, any found piece of gear breaks into its recipe's materials (net/salvageLaw.js), sent to the account service
// and banked in the Stores. A Magic-or-better piece still gives its Welkynd Shards too (systems/reforge.js). Offline,
// or for a piece no recipe makes, the old shard-only salvage stands.
import { salvageRecipeOf, salvageDescriptor, previewSalvage, salvageXpOf, salvageCommits, SALVAGE_BATCH_MAX } from '../net/salvageLaw.js';
import { PROFESSIONS, professionName } from '../net/professionLaw.js';
import { salvageShards, salvageRefusal, salvagePiece } from '../systems/reforge.js';
import { profBookNow } from './professions/profPages.js';
import { materialLabel } from '../systems/professions/profItems.js';
import { isBound } from '../systems/item/itemBound.js';
import { isLocked } from '../systems/item/itemLock.js';
import { isEquipped } from '../systems/equip.js';
import { socketGems } from '../systems/loot/lootRarity.js';
import { welkyndShards } from '../systems/gate/gateSpoils.js';
import { addItem } from '../systems/inventory.js';

/** BUNNYFALL AUDIT BF-02: a realm character's act on its record (world.js sets it: `(o) => realmGoldAct({ ...o, session, checkpoint })`), or null. */
let realmAct = null;
export const setSalvageRealmAct = (/** @type {((o: any) => Promise<any>) | null} */ fn) => { realmAct = fn; };

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

/** Why a piece will not salvage at all (materials or shards), or null. Materials first, then the old shard law. `selfName`
 *  the character salvaging - so a made piece they did not make breaks here (for its tier's shards), but one they made is
 *  refused ('self'). */
export function anySalvageRefusal(item, selfName = null) {
  const m = materialRefusal(item);
  if (m == null) return null;
  const s = salvageRefusal(item, selfName);
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
/**
 * BUNNYFALL SPEC-SAFE: the crafts a salvage of these pieces would carry past Journeyman for the first time - one of the two
 * a character may raise - as `[{ track, name }]`, by what the book last heard of the character's tracks. Empty offline.
 */
export function salvageWouldCommit(pieces, book = profBookNow()) {
  if (!book) return [];
  const held = Object.fromEntries(PROFESSIONS.filter((p) => p.kind === 'crafting').map((p) => [p.id, Number(book.track(p.id)?.xp) || 0]));
  const toMaterials = [...new Set(pieces)].filter(salvagesToMaterials).slice(0, SALVAGE_BATCH_MAX);
  return salvageCommits(salvageXpOf(toMaterials.map(salvageDescriptor)), held).map((track) => ({ track, name: professionName(track) }));
}

export async function salvageForMaterials(pieces, { items, commit = null }, selfName = null) {
  const chosen = [...new Set(pieces)].filter((it) => items.includes(it));
  const toMaterials = chosen.filter(salvagesToMaterials).slice(0, SALVAGE_BATCH_MAX);
  const shardOnly = chosen.filter((it) => !toMaterials.includes(it) && salvageRefusal(it, selfName) == null);
  let data = null, count = 0, shards = 0, lastPicks = null;
  if (toMaterials.length) {
    const book = profBookNow();
    if (!book) return { ok: false, error: 'offline', count: 0, shards: 0 };
    // BUNNYFALL SPEC-SAFE: a craft this would carry past Journeyman waits for the player's word, nothing broken until it comes
    const needs = salvageWouldCommit(toMaterials, book).filter((n) => !(commit ?? []).includes(n.track));
    if (needs.length) return { ok: false, needsCommit: needs, count: 0, shards: 0 };
    const descriptors = toMaterials.map(salvageDescriptor);
    let r;
    // BF-02: the realm record's own pieces - where each stands in the checkpointed save, asked once the save is checkpointed,
    // and the pieces out of the pack inside the hold (back on a refusal), as a disenchant's piece is
    const gone = [];
    if (realmAct) {
      let asked = false;
      r = await realmAct({
        reserve: () => () => { for (const g of gone.sort((x, y) => x.at - y.at)) items.splice(Math.min(g.at, items.length), 0, g.it); gone.length = 0; },
        call: (at) => {
          let picks;
          if (!asked) {
            asked = true;
            picks = toMaterials.map((it) => items.indexOf(it));
            if (picks.some((i) => i < 0)) return Promise.resolve({ ok: false, error: 'prof-piece-gone' });
            for (const i of [...picks].sort((x, y) => y - x)) gone.push({ at: i, it: items.splice(i, 1)[0] });
            lastPicks = picks;
          }
          return book.salvage(descriptors, { commit, realm: at, picks: lastPicks });
        },
      });
    } else {
      r = await book.salvage(descriptors, { commit });
    }
    if (!r?.ok) return { ok: false, error: r?.error ?? 'offline', count: 0, shards: 0 };
    data = r.data ?? null;
    // the pieces the record gave up are out of the pack already; the Magic-or-better ones still give their shards
    if (realmAct) {
      for (const g of gone) {
        const sh = salvageShards(g.it, selfName);
        if (sh > 0) { addItem(items, welkyndShards(sh)); shards += sh; }
        count++;
      }
      gone.length = 0;
    }
    for (const it of realmAct ? [] : toMaterials) {
      if (!items.includes(it)) continue;
      if (salvageShards(it, selfName) > 0) {
        const s = salvagePiece(it, { items }, selfName);
        if (s.ok) { shards += s.shards; count++; continue; }
      }
      items.splice(items.indexOf(it), 1);
      count++;
    }
  }
  for (const it of shardOnly) {
    const s = salvagePiece(it, { items }, selfName);
    if (s.ok) { shards += s.shards; count++; }
  }
  return { ok: true, count, shards, data };
}
