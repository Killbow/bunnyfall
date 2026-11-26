// @ts-check

import { DB_ROOT } from './service.js';

export const BUDGET_DEFAULT = Object.freeze({
  enforce: false,
  bands: Object.freeze([
    Object.freeze({ upTo: 5, rate: 30_000, cap: 180_000 }),
    Object.freeze({ upTo: 10, rate: 60_000, cap: 360_000 }),
    Object.freeze({ upTo: 20, rate: 120_000, cap: 720_000 }),
    Object.freeze({ upTo: 30, rate: 200_000, cap: 1_200_000 }),
    Object.freeze({ upTo: 1000, rate: 300_000, cap: 1_800_000 }),
  ]),
});
export const SPOILS_GRANT_BASE = 60_000;
export const SPOILS_GRANT_PER_LEVEL = 2_000;
export const SPOILS_GRANT_PIECE = 10_000;
export const portentPieces = (/** @type {unknown} */ p) => (Number.isSafeInteger(p) && /** @type {number} */ (p) > 0 ? [1, 2, 4].filter((b) => (/** @type {number} */ (p) & b) !== 0).length : 0);
export const spoilsGrant = (/** @type {number} */ level) => SPOILS_GRANT_BASE + SPOILS_GRANT_PER_LEVEL * Math.max(1, Math.trunc(Number(level) || 1));

const validBand = (/** @type {any} */ b) => !!b && Number.isSafeInteger(b.upTo) && b.upTo >= 1 && Number.isSafeInteger(b.rate) && b.rate >= 0 && Number.isSafeInteger(b.cap) && b.cap >= 0;
export function budgetConfigOf(/** @type {unknown} */ v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const c = /** @type {any} */ (v);
  if (typeof c.enforce !== 'boolean' || !Array.isArray(c.bands) || c.bands.length < 1 || c.bands.length > 12 || !c.bands.every(validBand)) return null;
  for (let i = 1; i < c.bands.length; i++) if (c.bands[i].upTo <= c.bands[i - 1].upTo) return null;
  return { enforce: c.enforce, bands: c.bands.map((/** @type {any} */ b) => ({ upTo: b.upTo, rate: b.rate, cap: b.cap })) };
}
export const BUDGET_CONFIG_KEEP_MS = 60_000;
// Keyed by the database binding, because each request wraps `db` in its own counting Proxy.
/** @type {WeakMap<object, { at: number, config: any }>} */
const kept = new WeakMap();
const keyOf = (/** @type {any} */ db) => (db && typeof db === 'object' ? db[DB_ROOT] ?? db : null);
export async function budgetConfig(/** @type {any} */ db) {
  return budgetKept(db) ?? budgetFrom(db, await budgetRead(db).first());
}
export function budgetKept(/** @type {any} */ db) {
  const k = kept.get(keyOf(db) ?? {});
  return k && Date.now() - k.at < BUDGET_CONFIG_KEEP_MS ? k.config : null;
}
export const budgetRead = (/** @type {any} */ db) => db.prepare("SELECT value FROM realm_config WHERE key = 'budget'");
export function budgetFrom(/** @type {any} */ db, /** @type {any} */ row) {
  let c = null;
  try { c = budgetConfigOf(JSON.parse(row?.value ?? 'null')); } catch { c = null; }
  const config = c ?? BUDGET_DEFAULT;
  const key = keyOf(db);
  if (key) kept.set(key, { at: Date.now(), config });
  return config;
}
export const forgetBudgetConfig = (/** @type {any} */ db) => { const key = keyOf(db); if (key) kept.delete(key); };
export const bandOf = (/** @type {{ bands: readonly any[] }} */ config, /** @type {number} */ level) => config.bands.find((b) => level <= b.upTo) ?? config.bands[config.bands.length - 1];

/**
 * @param {{ allowance: number | null, played: number, gain: number, band: { rate: number, cap: number }, enforce?: boolean }} s
 */
export function stepBudget({ allowance, played, gain, band, enforce = true }) {
  const start = allowance ?? band.cap;
  const fill = Math.floor((band.rate * Math.max(0, played)) / 3600);
  const filled = start >= band.cap ? start : Math.min(band.cap, start + fill);
  const left = filled - Math.max(0, gain);
  // While enforce is off the bucket keeps no debt, so every character starts even once enforce is turned on.
  return { allowance: enforce ? left : Math.max(0, left), over: left < 0 ? -left : 0 };
}

/** @param {any} db @param {string} playerId @param {number} [pieces] */
export async function grantSpoils(db, playerId, pieces = 0) {
  await spoilsGrantStatement(db, playerId, pieces).run();
}
// With `guard`, the fill runs inside the claim's own batch, so a failure after that batch cannot lose it.
/**
 * @param {any} db @param {string} playerId @param {number} [pieces] @param {string|null} [guard]
 * @param {...unknown} binds
 */
export function spoilsGrantStatement(db, playerId, pieces = 0, guard = null, ...binds) {
  return db.prepare(
    'UPDATE realm_characters SET allowance = allowance + ?2 + ?3 * MAX(1, COALESCE(level_seen, 1)) + ?4'
    + ' WHERE player = ?1 AND lease IS NOT NULL AND allowance IS NOT NULL AND dead_at IS NULL' + (guard ? ` AND (${guard})` : ''),
  ).bind(playerId, SPOILS_GRANT_BASE, SPOILS_GRANT_PER_LEVEL, SPOILS_GRANT_PIECE * Math.max(0, Math.min(3, Math.trunc(Number(pieces) || 0))), ...binds);
}

export const FAUCET_KINDS = Object.freeze(['patron', 'repair']);
/** @param {any} db @param {string} kind @param {number} hour @param {number} gold */
export const faucetStatement = (db, kind, hour, gold) => db.prepare(
  'INSERT INTO realm_faucets (hour, kind, gold, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (hour, kind) DO UPDATE SET gold = realm_faucets.gold + excluded.gold, n = realm_faucets.n + 1',
).bind(hour, FAUCET_KINDS.includes(kind) ? kind : 'patron', Math.max(0, Math.trunc(Number(gold) || 0)));
