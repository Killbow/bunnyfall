// @ts-check

import { isRetiredItem } from '../../src/items/retiredItems.js';
import { itemFindings, itemWorth, lawTemplate, classicPiece, PROVENANCE_RE, ITEM_LAW_VERSION, GOLD_INT_MAX } from '../../src/items/itemLaw.js';
import { ledgerKeyOf } from '../../src/items/itemIds.js';
import { armsOf } from '../../src/net/siegeRef.js';
import { liquidWorthOf, deedsOf } from '../../src/net/realmGoldLaw.js';
import { possessedItemLists } from '../../src/items/possessedItems.js';
import { MAX_STAT_VALUE } from '../../src/characters/statMods.js';
import { SKILL_HARD_CAP } from '../../src/characters/skillSoftcap.js';
import { STAT_KEYS_ORDER } from '../../src/characters/statMods.js';
import { pathFindings } from '../../src/characters/arcanePaths.js';
import { isMasterWork, masterSignature, masterLinesOfRecord } from '../../src/net/masterLaw.js';
import { readProductRecord } from '../../src/net/productRecord.js';

export const JUDGE_VERSION = ITEM_LAW_VERSION;
// Must equal realm.js REALM_LEVEL_CLAIM_MAX.
export const JUDGE_LEVEL_MAX = 1000;
export const STRIKES_FOR_TIMED = 3;
// Increase this whenever wealthOf, itemWorth, or deed prices value a save differently, or every character
// records a false gain.
export const WEALTH_VERSION = 2;
export const FINDINGS_KEPT = 40;

const lists = (/** @type {any[]} */ ...ls) => ls.filter(Array.isArray);
const arrayOf = (/** @type {unknown} */ x) => (Array.isArray(x) ? x : []);
export const goldOf = (/** @type {unknown} */ v) => (Number.isSafeInteger(v) && /** @type {number} */ (v) > 0 ? /** @type {number} */ (v) : 0);

export { possessedItemLists };

export function groundItemLists(/** @type {any} */ save) {
  const out = [];
  for (const scene of arrayOf(save?.sceneCache?.scenes)) for (const pile of arrayOf(/** @type {any} */ (scene)?.droppedPiles)) out.push(...lists(/** @type {any} */ (pile)?.items));
  for (const pile of [...arrayOf(save?.world?.piles), ...arrayOf(save?.world?.droppedLoot)]) out.push(...lists(/** @type {any} */ (pile)?.items));
  return out;
}

// Must match banking.js loan rules (a test pins them), because the Worker does not bundle banking.js.
export const realmLoanOwedMax = (/** @type {number} */ level) => Math.trunc(Math.max(1, Math.trunc(level) || 1) * 5_000 * 1.1);

const worthless = (/** @type {any} */ it) => it?.bound === true || lawTemplate(it?.templateIndex)?.bound === true || it?.questItem === true;

const wealthLists = (/** @type {any} */ save) => [...possessedItemLists(save), ...groundItemLists(save)];
const pieceWealth = (/** @type {any} */ it, liquid = liquidWorthOf(it)) => (isRetiredItem(it) ? 0 : liquid > 0 ? liquid : worthless(it) ? 0 : itemWorth(it));

/** @param {any} save @param {{ level?: number }} [o] */
export function wealthOf(save, { level = save?.level } = {}) {
  if (!save || typeof save !== 'object') return 0;
  const purse = goldOf(save.goldPieces);
  let banks = 0, owed = 0;
  for (const a of arrayOf(save.bankAccounts)) { banks += goldOf(/** @type {any} */ (a)?.accountGold); owed += goldOf(/** @type {any} */ (a)?.loanTotal); }
  const deeds = deedsOf(save).reduce((s, d) => s + d.value, 0);
  let goods = 0;
  for (const list of wealthLists(save)) for (const it of list) goods += pieceWealth(it);
  const w = Math.trunc(purse + banks - Math.min(owed, realmLoanOwedMax(Number(level))) + deeds + goods);
  return Number.isSafeInteger(w) ? w : Math.sign(w) * Number.MAX_SAFE_INTEGER;
}
/** @param {any} save */
export function goodsOf(save) {
  if (!save || typeof save !== 'object') return 0;
  let goods = 0;
  for (const list of wealthLists(save)) for (const it of list) if (!(liquidWorthOf(it) > 0)) goods += pieceWealth(it, 0);
  return Math.trunc(goods);
}

const goldWord = (/** @type {unknown} */ v) => v == null || (Number.isSafeInteger(v) && /** @type {number} */ (v) >= 0);
const purseWord = (/** @type {unknown} */ v) => goldWord(v) && !(/** @type {number} */ (v) > GOLD_INT_MAX);

/** @param {any} save @param {{ level?: unknown } | null} summary */
export function characterFindings(save, summary) {
  const out = [];
  const level = save?.level;
  if (!Number.isInteger(level) || level < 1 || level > JUDGE_LEVEL_MAX) out.push({ code: 'level' });
  else if (summary && summary.level != null && summary.level !== level) out.push({ code: 'level-claim' });
  if (!purseWord(save?.goldPieces)) out.push({ code: 'gold' });
  arrayOf(save?.bankAccounts).forEach((/** @type {any} */ a, /** @type {number} */ i) => {
    if (a != null && !(goldWord(a?.accountGold) && goldWord(a?.loanTotal))) out.push({ code: 'bank', at: i });
  });
  const stats = save?.stats;
  if (stats && typeof stats === 'object') {
    for (const k of STAT_KEYS_ORDER) {
      const v = stats[k];
      if (v != null && !(Number.isInteger(v) && v >= 0 && v <= MAX_STAT_VALUE)) out.push({ code: 'stat', at: k });
    }
  }
  if (Array.isArray(save?.skills)) {
    save.skills.forEach((/** @type {unknown} */ v, /** @type {number} */ i) => {
      if (v != null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= SKILL_HARD_CAP)) out.push({ code: 'skill', at: i });
    });
  }
  for (const f of pathFindings(save)) out.push(f);
  return out;
}

export const LAW_VALUES_MAX = 1000;
function lawValueOf(/** @type {any} */ save, /** @type {any} */ summary, /** @type {{ code: string, at?: any }} */ f) {
  if (f.code === 'level') return save?.level;
  if (f.code === 'level-claim') return [save?.level, summary?.level];
  if (f.code === 'gold') return save?.goldPieces;
  if (f.code === 'bank') { const a = arrayOf(save?.bankAccounts)[f.at]; return [a?.accountGold, a?.loanTotal]; }
  if (f.code === 'stat') return save?.stats?.[f.at];
  if (f.code === 'skill') return save?.skills?.[f.at];
  if (f.code === 'path') return save?.arcanePath;
  return undefined;
}
/** @param {any} save @param {{ level?: unknown } | null} summary */
export function lawValuesOf(save, summary) {
  const found = characterFindings(save, summary);
  if (!found.length) return null;
  return cutOf(found.map((f) => `${f.code}@${f.at ?? ''}=${cutOf(JSON.stringify(lawValueOf(save, summary, f)) ?? 'none', 40)}`).sort().join(','), LAW_VALUES_MAX);
}
export const LAW_VALUES_CUT = '\u2026';
const cutOf = (/** @type {string} */ s, /** @type {number} */ n) => (s.length > n ? `${s.slice(0, n)}${LAW_VALUES_CUT}` : s);

const findingsOf = (/** @type {any} */ it) => { try { return itemFindings(it); } catch { return ['shape']; } };

/** @param {any} save @param {{ level?: unknown } | null} [summary] @param {{ level?: number }} [o] */
export function judgeSave(save, summary = null, o = {}) {
  /** @type {any[]} */
  const findings = [];
  let count = 0;
  const keep = (/** @type {any} */ f) => { count++; if (findings.length < FINDINGS_KEPT) findings.push(f); };
  if (!save || typeof save !== 'object' || Array.isArray(save)) return { findings: [{ code: 'save' }], count: 1, wealth: 0, items: 0, provenances: [], pieces: [], arms: [0, 0] };
  for (const f of characterFindings(save, summary)) keep(f);
  let items = 0;
  /** @type {{ provenance: string, t: number, m: unknown, q: unknown, w: number, l?: string }[]} */
  const provenances = [];
  possessedItemLists(save).forEach((list, li) => {
    list.forEach((/** @type {any} */ it, /** @type {number} */ i) => {
      if (isRetiredItem(it)) return;
      items++;
      for (const code of findingsOf(it)) keep({ code, list: li, at: i, t: it?.templateIndex ?? null });
      if (typeof it?.provenance === 'string' && PROVENANCE_RE.test(it.provenance)) provenances.push({ provenance: it.provenance, t: it.templateIndex, m: it.material, q: it.quality, w: worthless(it) ? 0 : itemWorth(it), ...(isMasterWork(it) ? { l: masterSignature(it.affixes) } : {}) });
    });
  });
  const arms = armsOf(save.items, (it) => findingsOf(it).length === 0);
  return { findings, count, wealth: wealthOf(save, o), items, provenances, pieces: ledgerPieces(save), arms };
}

export { ledgerKeyOf };
export const ledgerPrintOf = (/** @type {any} */ it) => `${Number.isSafeInteger(it?.templateIndex) ? it.templateIndex : '-'}:${Number.isSafeInteger(it?.material) ? it.material : '-'}`;

export const classicCount = (/** @type {any} */ save) => possessedItemLists(save).reduce((n, list) => n + list.filter(classicPiece).length, 0);

export function ledgerPieces(/** @type {any} */ save) {
  /** @type {{ key: string, fp: string }[]} */
  const out = [];
  for (const list of possessedItemLists(save)) {
    for (const it of list) {
      if (isRetiredItem(it)) continue;
      const key = ledgerKeyOf(it);
      if (key) out.push({ key, fp: ledgerPrintOf(it) });
    }
  }
  return out;
}

/** @param {unknown} record */
const recordLines = (record) => {
  const c = readProductRecord(record);
  return c?.l ? masterSignature(masterLinesOfRecord(c.l) ?? []) : '';
};
// D1 binds at most 100 parameters per statement.
const PROVENANCE_CHUNK = 90;

/** @param {any} db
 *  @param {{ provenance: string, t: number, m?: unknown, q?: unknown, w?: number, l?: string }[]} provenances
 *  @param {string | null} [player]
 *  @returns {Promise<{ findings: any[], arrived: { provenance: string, w: number }[] }>} */
export async function judgeProducts(db, provenances, player = null) {
  const out = [];
  /** @type {{ provenance: string, w: number }[]} */
  const arrived = [];
  const want = new Map(provenances.map((p) => [p.provenance, p]));
  const ids = [...want.keys()];
  /** @type {Map<string, any>} */
  const have = new Map();
  for (let i = 0; i < ids.length; i += PROVENANCE_CHUNK) {
    const chunk = ids.slice(i, i + PROVENANCE_CHUNK);
    const rows = await db.prepare(`SELECT provenance, template, material, quality, owner, credited, record FROM products WHERE provenance IN (${chunk.map(() => '?').join(', ')})`).bind(...chunk).all();
    for (const r of rows?.results ?? []) have.set(r.provenance, r);
  }
  for (const [p, piece] of want) {
    const row = have.get(p);
    const lawful = !!row && row.template === piece.t
      && (piece.m == null || row.material == null || Number(row.material) === piece.m)
      && (piece.q == null || (Number.isInteger(piece.q) && /** @type {number} */ (piece.q) <= Number(row.quality)))
      && (piece.l === undefined || piece.l === recordLines(row.record));
    if (!lawful) out.push({ code: 'provenance', at: p, t: piece.t });
    else if (player != null && row.owner === player && Number(row.credited) === 0) arrived.push({ provenance: p, w: Number.isSafeInteger(piece.w) ? /** @type {number} */ (piece.w) : 0 });
  }
  return { findings: out, arrived };
}
