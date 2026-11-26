// @ts-check
// These statements ride the same batch that moves the character's row to the new save, so a checkpoint that loses
// its race writes no verdict either.

import { judgeSave, judgeProducts, STRIKES_FOR_TIMED, JUDGE_VERSION, FINDINGS_KEPT, WEALTH_VERSION, goodsOf, lawValuesOf, LAW_VALUES_CUT } from './judge.js';
import { ledgerStep, chargeSteps } from './ledger.js';
import { budgetConfig, bandOf, stepBudget } from './budget.js';
import { customsAllowance } from '../../src/net/realmGoldLaw.js';
import { lawfulItem } from '../../src/items/itemLaw.js';
import { armsOf } from '../../src/net/siegeRef.js';
import { censusStep } from './staffCensus.js';

export const OUTLIER_ALLOWANCES = 10;
export const LEVEL_RISE_S = 300;
const HOUR_S = 3600;
const DAY_S = 24 * HOUR_S;
export const LAW_HOLD_S = 7 * DAY_S;
export const LAW_HOLD_REPEAT_S = 30 * DAY_S;
export const LAW_FADE_S = 30 * DAY_S;

/** @param {{ prev: string | null, law: number, until: number | null, nowS: number, over: number, enforce: boolean }} v
 * @returns {string | null} */
export function holdOf({ prev, law, until, nowS, over, enforce }) {
  if (prev === 'staff') return 'staff';
  if (law > 0 || (until != null && until > nowS)) return 'law';
  if (enforce && over > 0) return 'budget';
  return null;
}

/** @param {{ strikes: number | null, served: number | null, until: number | null, at: number | null }} row
 * @param {{ rising: boolean, holding: boolean, nowS: number }} v */
export function lawCountOf(row, { rising, holding, nowS }) {
  const standing = row.until != null && row.until > nowS ? row.until : null;
  const faded = row.at != null && nowS - row.at >= LAW_FADE_S;
  const struck = (faded ? 0 : row.strikes ?? 0) + (rising && standing == null ? 1 : 0);
  const served = faded ? 0 : row.served ?? 0;
  const at = holding ? Math.max(nowS, standing ?? 0) : faded ? null : row.at;
  if (struck >= STRIKES_FOR_TIMED) {
    const until = nowS + (served > 0 ? LAW_HOLD_REPEAT_S : LAW_HOLD_S);
    return { strikes: 0, served: served + 1, until, at: until };
  }
  return { strikes: struck, served, until: standing, at };
}

export const lawSigOf = (/** @type {any[]} */ findings) => (findings.length
  ? [...new Set(findings.map((f) => `${f.code}:${f.t ?? ''}`))].sort().join(',').slice(0, 500) : null);

export const lawExcuseOf = (/** @type {string} */ sig, /** @type {string | null | undefined} */ values) => (values == null ? sig : `${sig}|${values}`);
/** @param {string | null | undefined} excused @param {string | null | undefined} sig
 * @param {string | null | undefined} values */
export const lawExcused = (excused, sig, values) => excused != null && sig != null && excused === lawExcuseOf(sig, values)
  && !(values ?? '').includes(LAW_VALUES_CUT);

/** @param {{ seen: number | null, at: number | null, level: unknown, played: number }} v */
export function trustedLevel({ seen, at, level, played }) {
  const since = at ?? played;
  if (!Number.isInteger(level) || /** @type {number} */ (level) < 1) return { level: seen ?? 1, at: since };
  const lv = /** @type {number} */ (level);
  if (seen == null || lv <= seen) return { level: lv, at: since };
  const reach = seen + Math.floor(Math.max(0, played - since) / LEVEL_RISE_S);
  const now = Math.min(lv, Math.max(seen, reach));
  return { level: now, at: since + (now - seen) * LEVEL_RISE_S };
}

/** @param {any} ctx @param {{ player: string, char: string, seq: number, key: string }} at @param {any} row
 * @param {any} save @param {any} summary
 * @param {{ wealth: number | null, level: number | null } | null} [baseline]
 * @param {{ mine: any, dupes: any, config: any } | null} [known] */
export async function verdictOn({ db, nowS }, { player, char, seq, key }, row, save, summary, baseline = null, known = null) {
  const first = row.wealth == null;
  const playedS = Number.isSafeInteger(row.played_now) ? row.played_now : 0;
  const lv = trustedLevel({
    seen: first ? baseline?.level ?? null : row.level_seen ?? null,
    at: first ? row.played_at ?? playedS : row.level_at ?? row.played_at ?? playedS,
    level: save?.level, played: playedS,
  });
  const judged = judgeSave(save, summary, { level: lv.level });
  const crafts = judged.provenances.length ? await judgeProducts(db, judged.provenances, player) : { findings: [], arrived: [] };
  const products = crafts.findings;
  const ledger = await ledgerStep(db, { player, char, seq, nowS }, judged.pieces, known);
  const printOf = new Map(judged.pieces.map((p) => [p.key, p.fp]));
  const templateOfKey = (/** @type {string} */ k) => { const t = Number(String(printOf.get(k) ?? '').split(':')[0]); return Number.isSafeInteger(t) ? t : null; };
  const lawFindings = [...judged.findings, ...products, ...ledger.forged.map((k) => ({ code: 'uid', at: k, t: templateOfKey(k) }))];
  const law = judged.count + products.length + ledger.forged.length;
  const sig = law > 0 ? lawSigOf(lawFindings) : null;
  const values = law > 0 ? lawValuesOf(save, summary) : null;
  const lawHolds = law > 0 && !lawExcused(row.law_excused, sig, values) ? law : 0;
  const config = known?.config ?? await budgetConfig(db);
  const band = bandOf(config, lv.level);
  const rebased = !first && baseline != null && baseline.wealth != null;
  const base = first ? baseline?.wealth ?? judged.wealth : rebased ? /** @type {number} */ (baseline.wealth) : row.wealth;
  const arrivedWorth = crafts.arrived.reduce((n, a) => n + a.w, 0);
  const gain = judged.wealth - base - (first || rebased ? 0 : row.witnessed ?? 0) - arrivedWorth;
  const dPlayed = first || row.played_at == null ? 0 : Math.max(0, playedS - row.played_at);
  const budget = stepBudget({ allowance: first ? null : row.allowance ?? null, played: dPlayed, gain, band, enforce: config.enforce });
  const fresh = ledger.copies.length;
  const rising = lawHolds > 0 && lawFindings.some((f) => f.code !== 'uid') && (row.law_sig == null || lawExcused(row.law_excused, row.law_sig, row.law_v));
  const count = lawCountOf({ strikes: row.strikes ?? null, served: row.law_holds ?? null, until: row.held_until ?? null, at: row.law_at ?? null }, { rising, holding: lawHolds > 0, nowS });
  const held = holdOf({ prev: row.held ?? null, law: lawHolds, until: count.until, nowS, over: budget.over, enforce: config.enforce });
  const outlier = first && judged.wealth > OUTLIER_ALLOWANCES * customsAllowance(lv.level);
  const clean = law === 0 && fresh === 0;
  /** @type {any[]} */
  const after = [...ledger.steps];
  if (fresh) after.push(...chargeSteps(db, char, ledger.copies, nowS));
  for (let i = 0; i < crafts.arrived.length; i += 90) {
    const part = crafts.arrived.slice(i, i + 90).map((a) => a.provenance);
    after.push(db.prepare(`UPDATE products SET credited = 1 WHERE owner = ?1 AND provenance IN (${part.map((_, k) => `?${k + 2}`).join(', ')})`).bind(player, ...part));
  }
  const finding = (/** @type {string} */ kind, /** @type {any} */ detail) => after.push(db.prepare(
    'INSERT INTO realm_findings (player, char_id, seq, at, law, kind, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(player, char, seq, nowS, JUDGE_VERSION, kind, JSON.stringify(detail)));
  if (law > 0 && (sig !== row.law_sig || (rising && values !== (row.law_v ?? null)))) {
    finding('law', { count: law, findings: lawFindings.slice(0, FINDINGS_KEPT), ...(values ? { values } : {}), ...(lawHolds ? {} : { excused: true }) });
  }
  if (budget.over > 0 && gain > 0) finding(config.enforce ? 'budget' : 'measure', { gain, over: budget.over, level: lv.level, played: dPlayed, wealth: judged.wealth, goods: goodsOf(save), ...(first ? { first: true } : {}) });
  if (outlier) finding('outlier', { wealth: judged.wealth, level: lv.level });
  const hour = Math.floor(nowS / HOUR_S) * HOUR_S;
  const census = censusStep(db, { player, char, seq, nowS }, save, row.census_tally ?? null);
  after.push(db.prepare(
    'INSERT INTO realm_wealth_hours (char_id, hour, player, level, gain, loss, played_s, checkpoints, tally) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
    + ' ON CONFLICT (char_id, hour) DO UPDATE SET level = excluded.level, gain = gain + excluded.gain, loss = loss + excluded.loss,'
    + ' played_s = played_s + excluded.played_s, checkpoints = checkpoints + 1, tally = COALESCE(excluded.tally, tally)',
  ).bind(char, hour, player, lv.level, Math.max(0, gain), Math.max(0, -gain), dPlayed, census.tally), ...census.steps);
  const set = {
    judged_seq: seq,
    held,
    held_at: held == null ? null : held === row.held ? row.held_at ?? nowS : nowS,
    strikes: count.strikes,
    held_until: count.until,
    law_holds: count.served,
    law_at: count.at,
    review: outlier ? 'outlier' : row.review ?? null,
    wealth: judged.wealth,
    allowance: budget.allowance,
    played_at: playedS,
    clean_obj: clean ? key : row.clean_obj ?? null,
    clean_seq: clean ? seq : row.clean_seq ?? null,
    level_seen: lv.level,
    level_at: lv.at,
    law_sig: sig,
    law_v: values,
    arms_top: judged.arms[0],
    arms_bow: judged.arms[1],
  };
  const found = lawHolds ? (({ code, t }) => ({ code, t: t ?? null }))(lawFindings[0]) : null;
  const why = held !== 'law' ? null : count.until != null ? { code: 'until', t: found?.t ?? null, until: count.until } : found;
  return { steps: [verdictWrite(db, char, row, set), ...after], set, clean, law, copies: ledger.copies, over: budget.over, why, locked: ledger.locked };
}

const BIRTH_LEVEL_TRUST_MAX = 60;

/** @param {any} ctx @param {{ player: string, char: string, seq: number, key: string }} at @param {any} row
 * @param {any} save */
export function verdictOff({ db }, { char, seq, key }, row, save) {
  const playedS = Number.isSafeInteger(row.played_now) ? row.played_now : row.played_at ?? 0;
  const seen = row.level_seen ?? (Number.isInteger(save?.level) ? Math.min(Math.max(1, save.level), BIRTH_LEVEL_TRUST_MAX) : 1);
  const lv = trustedLevel({ seen, at: row.level_at ?? row.played_at ?? playedS, level: save?.level, played: playedS });
  const level = lv.level;
  const arms = Array.isArray(save?.items) ? armsOf(save.items, (/** @type {any} */ it) => { try { return lawfulItem(it); } catch { return false; } }) : [0, 0];
  const set = {
    judged_seq: seq, held: row.held === 'staff' ? 'staff' : null, held_at: row.held === 'staff' ? row.held_at ?? null : null, strikes: 0, held_until: null, law_holds: 0, law_at: null,
    review: row.review ?? null, wealth: row.wealth ?? 0, allowance: row.allowance ?? null,
    played_at: Number.isSafeInteger(row.played_now) ? row.played_now : row.played_at ?? 0,
    clean_obj: key, clean_seq: seq, level_seen: level, level_at: lv.at, law_sig: null, law_v: null,
    arms_top: arms[0], arms_bow: arms[1],
  };
  return { steps: [verdictWrite(db, char, row, set)], set, clean: true, law: 0, copies: [], over: 0, why: null, locked: [] };
}

// The write lands only while `judge_rev` is unmoved, so a staff act landing mid-checkpoint is never written over.
/** @param {any} db @param {string} char @param {any} row @param {any} s */
export function verdictWrite(db, char, row, s) {
  return db.prepare(
    'UPDATE realm_characters SET judged_seq = ?2, held = ?3, held_at = ?4, strikes = ?5, review = ?6, wealth = ?7, witnessed = 0,'
    + ' allowance = CASE WHEN ?8 IS NULL OR allowance IS NULL THEN ?9 ELSE ?9 + (allowance - ?8) END,'
    + ' played_at = ?10, clean_obj = ?11, clean_seq = ?12, level_seen = ?13, level_at = ?14, law_sig = ?15, wealth_v = ?17,'
    + ' arms_top = ?18, arms_bow = ?19, held_until = ?20, law_holds = ?21, law_at = ?22, law_v = ?23,'
    + " law_excused = CASE WHEN ?15 IS NULL AND instr(law_excused, '|') > 0 THEN NULL ELSE law_excused END"
    + ' WHERE id = ?1 AND judge_rev = ?16',
  ).bind(char, s.judged_seq, s.held, s.held_at, s.strikes, s.review, s.wealth, row.allowance ?? null, s.allowance, s.played_at,
    s.clean_obj, s.clean_seq, s.level_seen, s.level_at, s.law_sig, row.judge_rev ?? 0, WEALTH_VERSION, s.arms_top ?? null, s.arms_bow ?? null,
    s.held_until ?? null, s.law_holds ?? 0, s.law_at ?? null, s.law_v ?? null);
}
