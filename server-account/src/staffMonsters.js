// @ts-check
import { GRANT_KINDS, GRANT_CASE_REASONS } from '../../src/net/grantLaw.js';
import { GRANT_RELAY_READER } from '../../src/net/grantMeasure.js';
import { FOE_HOT } from '../../server/src/staffFeedLaw.js';
import { GRANT_ASK_CASE_TIMES, GRANT_CASE_READERS } from './grants.js';
import { findAccount } from './sanctions.js';
import { displayName } from './accounts.js';
import { NET_READ_S, NET_WAVE_S, NET_READ_MAX } from './staffNet.js';

export const MONSTER_ROUTES = Object.freeze(['/v1/staff/monsters', '/v1/staff/monster/flag']);
export const MONSTER_ASK_S = 3600;
export const MONSTER_PAGE = 25;
export const MONSTER_RANKED_MAX = 500;
// D1 binds at most 100 parameters per statement.
const IN_MAX = 80;
const LEVELS = Object.freeze(['low', 'medium', 'high']);
const SPLIT = Object.freeze(['regular', 'elite', 'boss', 'sea']);

/** @param {string} kind */
export const askBudget = (kind) => { const law = GRANT_KINDS[/** @type {keyof typeof GRANT_KINDS} */ (kind)]; return law ? Math.ceil(law.cap + law.rate * MONSTER_ASK_S) : 0; };

/** @param {any} p @returns {{ level: 'high'|'medium'|'low', why: string[] }} */
export function monsterUrgency(p) {
  const why = [];
  let rank = 0;
  const raise = (/** @type {number} */ to, /** @type {string} */ word) => { if (to > rank) rank = to; why.push(word); };
  if (p.stripped > 0) raise(2, `the relay stripped ${p.stripped} monster${p.stripped === 1 ? '' : 's'} no builder could give`);
  for (const a of p.asks) if (a.asks > a.budget) raise(a.asks >= GRANT_ASK_CASE_TIMES * a.budget ? 2 : 1, `${a.asks} ${a.kind} asks an hour, budget ${a.budget}`);
  if (p.others.readers) raise(p.others.readers >= GRANT_CASE_READERS ? 2 : 1, `${p.others.readers} other game${p.others.readers === 1 ? '' : 's'} refused ${p.others.n} of its monsters`);
  if (p.live && p.live.owned >= FOE_HOT.own) raise(1, `owns ${p.live.owned} live monsters outdoors${p.live.elite || p.live.boss ? ` (${p.live.elite} elite, ${p.live.boss} boss)` : ''}`);
  else if (p.live?.owned) why.push(`owns ${p.live.owned} live monsters outdoors`);
  if (p.hosted) why.push(`host of ${p.hosted} monsters`);
  return { level: /** @type {'high'|'medium'|'low'} */ (LEVELS[rank]), why };
}

/** @param {string[]} ids @param {(chunk: string[]) => Promise<any[]>} ask */
async function chunked(ids, ask) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += IN_MAX) chunks.push(ask(ids.slice(i, i + IN_MAX)));
  return (await Promise.all(chunks)).flat();
}
const marks = (/** @type {number} */ n, /** @type {number} */ from = 1) => Array.from({ length: n }, (_, i) => `?${i + from}`).join(', ');

/** @param {any} db @param {number} nowS */
export async function monstersRanked(db, nowS) {
  const [b, foeRead, askRead] = await Promise.all([
    db.prepare('SELECT MAX(at) AS at, MAX(ms) AS ms, COUNT(*) AS n FROM staff_net_batches WHERE at > ?1').bind(nowS - NET_READ_S).first(),
    db.prepare('SELECT * FROM staff_foe_rows WHERE at > ?1 ORDER BY at DESC LIMIT ?2').bind(nowS - NET_READ_S, NET_READ_MAX).all(),
    db.prepare('SELECT sub, kind, SUM(asks) AS asks FROM grant_rows WHERE at > ?1 GROUP BY sub, kind').bind(nowS - MONSTER_ASK_S).all(),
  ]);
  const monsters = !b?.n ? 'no report' : b.ms === 1 ? 'measured' : 'not measured';
  /** @type {Map<string, any>} */
  const by = new Map();
  const player = (/** @type {string} */ sub) => {
    let p = by.get(sub);
    if (!p) { p = { sub, name: null, at: 0, live: null, hosted: 0, stripped: 0, asks: [], others: { n: 0, readers: 0 } }; by.set(sub, p); }
    return p;
  };
  const foes = foeRead?.results ?? [];
  for (const r of foes) {
    const p = player(r.sub);
    p.stripped += r.stripped;
    if (p.at && p.at - r.at > NET_WAVE_S) continue;
    p.at ||= r.at;
    if (monsters !== 'not measured') {
      p.live ??= { owned: 0, regular: 0, elite: 0, boss: 0, sea: 0 };
      p.live.owned += r.owned;
      for (const k of SPLIT) p.live[k] += r[k];
      p.hosted += r.hosted;
    }
  }
  const asks = askRead?.results ?? [];
  const over = new Set(asks.filter((a) => a.asks > askBudget(a.kind)).map((a) => String(a.sub)));
  for (const s of over) player(s);
  const ids = [...by.keys()].slice(0, MONSTER_RANKED_MAX);
  for (const a of asks) if (by.has(String(a.sub))) by.get(String(a.sub)).asks.push({ kind: a.kind, asks: Number(a.asks), budget: askBudget(a.kind) });
  const [refused, names] = await Promise.all([
    chunked(ids, async (c) => (await db.prepare(`SELECT sender, COUNT(DISTINCT reader) AS readers, SUM(n) AS n FROM grant_tallies
      WHERE sender IN (${marks(c.length, 3 + GRANT_CASE_REASONS.length)}) AND at > ?1 AND reader != ?2 AND reason IN (${marks(GRANT_CASE_REASONS.length, 3)}) GROUP BY sender`)
      .bind(nowS - MONSTER_ASK_S, GRANT_RELAY_READER, ...GRANT_CASE_REASONS, ...c).all())?.results ?? []),
    chunked(ids, async (c) => (await db.prepare(`SELECT id, handle, guest_name FROM players WHERE id IN (${marks(c.length)})`).bind(...c).all())?.results ?? []),
  ]);
  for (const r of refused) by.get(String(r.sender)).others = { n: Number(r.n), readers: Number(r.readers) };
  for (const r of names) by.get(String(r.id)).name = displayName(r);
  const ranked = ids.map((s) => by.get(s)).map((p) => { const u = monsterUrgency(p); return { ...p, level: u.level, why: u.why }; });
  const lvl = (/** @type {any} */ x) => LEVELS.indexOf(x.level);
  const ratio = (/** @type {any} */ p) => p.asks.reduce((m, a) => Math.max(m, a.asks / Math.max(1, a.budget)), 0);
  ranked.sort((x, y) => lvl(y) - lvl(x) || y.stripped - x.stripped || (y.live?.owned ?? 0) - (x.live?.owned ?? 0) || ratio(y) - ratio(x) || y.hosted - x.hosted);
  return { ranked, monsters, asOf: b?.at ?? null };
}

/** @param {any} ctx @param {any} env @param {string} path @param {any} body
 * @param {{ player: any, role: string }} who
 * @param {(act: string, target?: string|null, detail?: object|null, how?: object) => any} audit */
export async function staffMonsters(ctx, env, path, body, who, audit) {
  if (who.role !== 'admin') { await audit('refused', null, { path, need: 'admin' }, { outcome: 'denied' }).run(); return { error: 'staff-admin' }; }
  const { db, nowS } = ctx;
  if (path === '/v1/staff/monsters') {
    const from = Number.isSafeInteger(body.from) && body.from > 0 ? body.from : 0;
    const [{ ranked, monsters, asOf }] = await Promise.all([monstersRanked(db, nowS), audit('monsters-read', null, null, { onceIn: 10 * 60 }).run()]);
    return { players: ranked.slice(from, from + MONSTER_PAGE), next: from + MONSTER_PAGE < ranked.length ? from + MONSTER_PAGE : null, total: ranked.length,
      high: ranked.filter((p) => p.level === 'high').length, monsters, asOf };
  }
  if (path !== '/v1/staff/monster/flag') return { error: 'not-found' };
  const row = await findAccount(db, { target: body.target, name: body.name });
  if ('error' in row) return row;
  const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) : '';
  const detail = { name: displayName(row), ...(note ? { note } : {}) };
  try {
    const text = `Flagged from Monster watch by ${displayName(who.player)}${note ? `: ${note}` : ''}`;
    await db.batch([
      db.prepare('INSERT INTO staff_notes (target, author, author_name, text, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(row.id, who.player.id, displayName(who.player), text, nowS),
      audit('monster-flag', row.id, detail),
    ]);
    return { ok: true };
  } catch (e) {
    await audit('monster-flag', row.id, { ...detail, error: String(/** @type {any} */ (e)?.message ?? e).slice(0, 120) }, { outcome: 'failed' }).run();
    return { error: 'flag-failed' };
  }
}

export const HOME_WATCH = Object.freeze({
  id: 'monsters', label: 'Monster owners', role: 'admin',
  /** @param {any} ctx @param {any} env @param {{ role: string }} who @param {number} n */
  async top(ctx, env, who, n) {
    if (who?.role !== 'admin') return { items: [], high: 0, total: 0 };
    const { ranked } = await monstersRanked(ctx.db, ctx.nowS);
    return { items: ranked.slice(0, n).map((p) => ({ level: p.level, why: p.why.join(' · '), sub: p.sub, name: p.name })), high: ranked.filter((p) => p.level === 'high').length, total: ranked.length };
  },
});
