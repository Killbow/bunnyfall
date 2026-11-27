// @ts-check
import { accountKind } from './accounts.js';
import { isDeveloper } from './titles.js';
import { CHAR_ID_RE } from './service.js';
import { rankOfXp, specsAt, SPEC_RANKS, trackOf, specTrialUntil, respecLockUntil, PROF_RID_RE, profSwitchOf } from '../../src/net/professionLaw.js';
import { JUDGED_CLOTH } from '../../src/net/recipeLaw.js';
import { LOOSE_ORIGIN } from '../../src/net/bagLaw.js';

export const DAY_S = 86_400;
export const PIXELS_READ_MAX = 25;
export const DUNGEONS_READ_MAX = 4;

export function profOpenFor(player, env) {
  const s = profSwitchOf(env?.PROFESSIONS_OPEN);
  return s === 'on' || (s === 'dev' && isDeveloper(player, env));
}

export const charOk = (c) => typeof c === 'string' && CHAR_ID_RE.test(c);
export function asks(player, { character, rid, needRid = true }) {
  if (accountKind(player) !== 'linked') return { error: 'prof-need-account' };
  if (!charOk(character)) return { error: 'prof-character' };
  if (needRid && (typeof rid !== 'string' || !PROF_RID_RE.test(rid))) return { error: 'prof-rid' };
  return null;
}
// Callers check `shut` after looking up the request's existing row, so a repeat is answered while the switch is
// off.
export const shut = (player, env) => (profOpenFor(player, env) ? null : { error: 'prof-closed' });

export function trackView(row, profession, nowS) {
  const xp = Number(row?.xp ?? 0);
  const specs = specsAt(row, nowS);
  const free = SPEC_RANKS.filter((r) => (Number(row?.free_respec ?? 0) & freeBit(r)) !== 0);
  const trial = Object.fromEntries(SPEC_RANKS.map((r) => [r, specTrialUntil(row, r, nowS)]).filter(([, at]) => at !== null));
  const lock = respecLockUntil(row, nowS);
  return { profession: trackOf(profession), xp, rank: rankOfXp(xp), specs, respec: null, ...(free.length ? { free } : {}), ...(Object.keys(trial).length ? { trial } : {}), ...(lock ? { lock } : {}) };
}
export const freeBit = (rank) => (rank === 50 ? 1 : rank === 100 ? 2 : 0);
export const trackStatement = (db, player, character, profession) =>
  db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?3').bind(player, character, trackOf(profession));
export const trackRow = (db, player, character, profession) => trackStatement(db, player, character, profession).first();
export const originOf = (o) => (o === 'bought' || o === 'gold' || o === LOOSE_ORIGIN ? o : 'own');
// Gold and loose counts appear only when nonzero, so older clients keep reading { material, own, bought }.
export const withGold = (s) => {
  if (!(s.gold > 0)) delete s.gold;
  if (!(s[LOOSE_ORIGIN] > 0)) delete s[LOOSE_ORIGIN];
  return s;
};
export async function storeOf(db, player, character, key) {
  const out = countFrom(key, (await storeStatement(db, player, character, key).all()).results ?? []);
  return JUDGED_CLOTH.includes(key) ? { ...out, silver: await silverOf(db, player, character, key) } : out;
}
export const silverSql = (p, c, m) => `COALESCE((SELECT qty FROM prof_silver_cloth WHERE player = ${p} AND char_id = ${c} AND material = ${m}), 0)`;
export const silverOf = async (db, player, character, key) => Number((await db.prepare(`SELECT ${silverSql('?1', '?2', '?3')} AS n`).bind(player, character, key).first())?.n ?? 0);
export const CLOTH_SQL = JUDGED_CLOTH.map((k) => `'${k}'`).join(', ');
// Callers pass only cloth bought with silver (counter buys and the Drakes market), never gold-market buys, guild moves,
// or weaves.
export const silverClothIn = (db, select, binds) => db.prepare(`INSERT INTO prof_silver_cloth (player, char_id, material, qty)
  SELECT player, char_id, material, qty FROM (${select}) WHERE material IN (${CLOTH_SQL}) AND qty > 0
  ON CONFLICT (player, char_id, material) DO UPDATE SET qty = prof_silver_cloth.qty + excluded.qty`).bind(...binds);
export const silverClothOut = (db, { player, character, materialSql, qtySql, guard, binds }) => [
  db.prepare(`UPDATE prof_silver_cloth SET qty = qty - MIN(qty, ${qtySql}) WHERE player = ?1 AND char_id = ?2 AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds),
  db.prepare('DELETE FROM prof_silver_cloth WHERE player = ?1 AND char_id = ?2 AND qty = 0').bind(player, character),
];
export const storeStatement = (db, player, character, key) =>
  db.prepare('SELECT origin, qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?3').bind(player, character, key);
export const carriedStatement = (db, player, character, key) =>
  db.prepare('SELECT origin, qty FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND material = ?3').bind(player, character, key);
export function countFrom(key, /** @type {any[]} */ results) {
  const out = { material: key, own: 0, bought: 0, gold: 0 };
  for (const r of results) out[originOf(r.origin)] = Number(r.qty);
  return withGold(out);
}
// The carried count is a bound on what the service handed out, never an inventory; the items live in the save.
export async function carriedOf(db, player, character, key) {
  return countFrom(key, (await carriedStatement(db, player, character, key).all()).results ?? []);
}
