// @ts-check
// Realm characters: the row in D1, the save in R2, and the lease that says which tab may write it.
// A join mints a new lease and frees the account's other characters; a checkpoint needs that lease and seq + 1.
// Each write gets a new object key before the row moves to it, so a losing write leaves the current save intact.
// Every statement binds the resolved player; no route takes a player id from the caller.

import { SAVE_MAX_BYTES } from './service.js';
import { GUILD_RANK_MASTER } from '../../src/net/guildLaw.js';
import { HOME_CAP, homeMoved } from '../../src/net/homeLaw.js';
import { liquidWealthOf, customsAllowance, REALM_BIRTH_LEVEL, REALM_BIRTH_WEALTH_MAX } from '../../src/net/realmGoldLaw.js';
import { cardWorthOf, cardPacksOf, customsCardAllowance, STARTER_DECK_WORTH } from '../../src/net/cardWorthLaw.js';
import { ID_RE, armsIssuable } from '../../src/net/identityToken.js';
import { isGuestShaped, isHandleShaped } from '../../src/net/handleShape.js';
import { isDeveloper } from './titles.js';
import { displayName } from './accounts.js';
import { linkFirstPlay } from './founderLink.js';
import { saveTextOf, REALM_TEXT_MAX_BYTES } from '../../src/net/realmSaveCodec.js';
import { lineageBirthRefusal, houseOn, endUnionsOf } from './legacy.js';
import { wealthOf, ledgerPieces, classicCount, WEALTH_VERSION } from './judge.js';
import { seaSeasonSteps } from './seaSeason.js';
import { piecesRefusal, ledgerMoves, releaseSteps, ledgerReads, leavingKeys } from './ledger.js';
import { budgetKept, budgetRead, budgetFrom } from './budget.js';
import { verdictOn, verdictOff } from './verdict.js';
import { judgeIsOff } from './bunnyfall.js';

export const REALM_CHARACTERS_MAX = 6;
export const REALM_NAME_MAX = 32;
export const REALM_SUMMARY_MAX = 512;
// Twice ONLINE_CHECKPOINT_MS, so a character in play never shows as idle between two checkpoints.
export const REALM_PLAYING_S = 600;
// Bounds the request; the text a packed save opens to is bounded by REALM_TEXT_MAX_BYTES.
export const REALM_MAX_BYTES = SAVE_MAX_BYTES;
export const REALM_ID_RE = /^r[0-9a-f]{20}$/;
export const LEASE_RE = /^[0-9a-f]{32}$/;
export const ORIGIN_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export const realmPrefix = (/** @type {string} */ playerId) => `realm/${encodeURIComponent(playerId)}/`;
export const realmObjectKey = (/** @type {string} */ playerId, /** @type {string} */ id, /** @type {number} */ seq, /** @type {string} */ tag) => `${realmPrefix(playerId)}${id}/${seq}-${tag}`;

const hex = (/** @type {(b: Uint8Array) => Uint8Array} */ rand, /** @type {number} */ n) => [...rand(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
export const mintObjectKey = (/** @type {(b: Uint8Array) => Uint8Array} */ rand, /** @type {string} */ playerId, /** @type {string} */ id, /** @type {number} */ seq) => realmObjectKey(playerId, id, seq, hex(rand, 4));
export async function dropObjects(/** @type {any} */ bucket, /** @type {(string | null | undefined)[]} */ keys) {
  for (const k of keys) {
    if (!k) continue;
    try { await bucket.delete(k); } catch {}
  }
}
export const mintRealmId = (/** @type {(b: Uint8Array) => Uint8Array} */ rand) => `r${hex(rand, 10)}`;
export const mintLease = (/** @type {(b: Uint8Array) => Uint8Array} */ rand) => hex(rand, 16);

export function realmNameOf(/** @type {unknown} */ v) {
  if (typeof v !== 'string') return null;
  const name = v.trim().slice(0, REALM_NAME_MAX);
  return name && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}

const whole = (/** @type {unknown} */ v, /** @type {number} */ max) => (Number.isSafeInteger(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) <= max ? v : null);
const text = (/** @type {unknown} */ v, /** @type {number} */ max) => (typeof v === 'string' && v && !/[\u0000-\u001f\u007f]/.test(v) ? v.slice(0, max) : null);

/** @param {any} v */
export function realmSummaryOf(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const s = {
    level: whole(v.level, 1000),
    className: text(v.className, 40),
    race: text(v.race, 24),
    gender: text(v.gender, 8),
    face: whole(v.face, 1000),
    region: text(v.region, 40),
  };
  const json = JSON.stringify(s);
  return json.length <= REALM_SUMMARY_MAX ? json : null;
}

const view = (/** @type {any} */ r, /** @type {number} */ nowS) => {
  let summary = null;
  try { summary = r.summary ? JSON.parse(r.summary) : null; } catch { summary = null; }
  return {
    id: r.id, name: r.name, summary, seq: r.seq, bytes: r.bytes,
    playing: !!r.lease && nowS - r.lease_at < REALM_PLAYING_S,
    customs: !!r.origin_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
    lineage: r.lineage_id ?? null, person: r.person_id ?? null,
    house: r.line ? houseOn(r.line, r.person_id) : null,
  };
};

export async function listRealm({ db, nowS }, /** @type {string} */ playerId) {
  const r = await db.prepare(
    'SELECT r.id, r.name, r.summary, r.seq, r.bytes, r.lease, r.lease_at, r.origin_id, r.created_at, r.updated_at, r.lineage_id, r.person_id, l.record AS line'
    + ' FROM realm_characters r LEFT JOIN lineages l ON l.player = r.player AND l.id = r.lineage_id'
    + ' WHERE r.player = ? AND r.dead_at IS NULL ORDER BY r.updated_at DESC LIMIT ?',
  ).bind(playerId, REALM_CHARACTERS_MAX).all();
  return (r?.results ?? []).map((row) => view(row, nowS));
}

export const REALM_LEVEL_CLAIM_MAX = 1000;

// One read answers every claim the mint signs; rc is 1 only for a living character of this account with a lease.
export async function realmMintFacts({ db }, /** @type {string} */ playerId, /** @type {unknown} */ id) {
  const none = { rc: 0, cl: null, wa: null, house: null, name: null };
  if (typeof id !== 'string' || !REALM_ID_RE.test(id)) return none;
  const row = await db.prepare('SELECT r.dead_at, r.lease, r.summary, r.level_seen, r.arms_top, r.arms_bow, r.person_id AS person, r.name AS name, l.record AS record'
    + ' FROM realm_characters r LEFT JOIN lineages l ON l.player = r.player AND l.id = r.lineage_id WHERE r.id = ? AND r.player = ?').bind(id, playerId).first();
  if (!row || row.dead_at != null || row.lease == null) return none;
  let summary = null;
  try { summary = row.summary ? JSON.parse(row.summary) : null; } catch { summary = null; }
  const lv = row.level_seen ?? summary?.level;
  const arms = row.arms_top != null ? [row.arms_top, row.arms_bow === 1 ? 1 : 0] : null;
  return {
    rc: 1,
    cl: Number.isSafeInteger(lv) && lv >= 1 && lv <= REALM_LEVEL_CLAIM_MAX ? lv : null,
    wa: armsIssuable(arms) ? /** @type {[number, 0|1]} */ (arms) : null,
    house: houseOn(row.record, row.person),
    name: typeof row.name === 'string' && row.name ? row.name : null,
  };
}

async function freeOthers({ db }, /** @type {string} */ playerId, /** @type {string} */ keep) {
  await db.prepare('UPDATE realm_characters SET lease = NULL WHERE player = ? AND id != ? AND lease IS NOT NULL').bind(playerId, keep).run();
}

/**
 * @param {any} ctx
 * @param {string} playerId
 * @param {{ name: unknown, summary?: unknown, lineage?: unknown, person?: unknown }} at
 */
export async function createRealm({ db, rand, nowS }, playerId, { name, summary = null, lineage = null, person = null }) {
  const n = realmNameOf(name);
  if (!playerId || !n) return { error: 'body' };
  const born = lineage != null || person != null;
  // A birth whose first save never landed resumes with a new lease, never refused as a person already played.
  if (born && Number.isSafeInteger(person)) {
    const had = await db.prepare('SELECT id, bytes, dead_at FROM realm_characters WHERE player = ? AND lineage_id = ? AND person_id = ?').bind(playerId, lineage, person).first();
    if (had && !(had.bytes > 0) && had.dead_at == null) {
      const joined = await joinRealm({ db, rand, nowS }, playerId, had.id);
      return joined.error ? joined : { id: joined.id, lease: joined.lease, seq: 0, resumed: true };
    }
  }
  if (born) { const refused = await lineageBirthRefusal(db, playerId, lineage, person); if (refused) return refused; }
  const id = mintRealmId(rand);
  const lease = mintLease(rand);
  let wrote;
  // The character bound is checked inside the insert, so concurrent creates cannot both pass it.
  try {
    wrote = await db.prepare(
      'INSERT INTO realm_characters (id, player, name, summary, seq, bytes, lease, lease_at, origin_id, created_at, updated_at, lineage_id, person_id)'
      + ' SELECT ?, ?, ?, ?, 0, 0, ?, ?, NULL, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM realm_characters WHERE player = ? AND dead_at IS NULL) < ?',
    ).bind(id, playerId, n, realmSummaryOf(summary), lease, nowS, nowS, nowS, born ? lineage : null, born ? person : null, playerId, REALM_CHARACTERS_MAX).run();
  } catch (e) {
    // Two tabs born as one person race to the unique index, and the loser gets lineage-played.
    if (born && /UNIQUE/i.test(String(/** @type {any} */ (e)?.message ?? e))) return { error: 'lineage-played' };
    throw e;
  }
  if (!wrote.meta.changes) return { error: 'too-many-characters' };
  await freeOthers({ db }, playerId, id);
  return { id, lease, seq: 0 };
}

export const CHARACTER_TABLES = Object.freeze(['renown_tracks', 'homes', 'guild_members']);

// OR IGNORE keeps any row the realm id already holds, so a resumed customs can carry again.
const customsCarry = (/** @type {any} */ db, /** @type {string} */ playerId, /** @type {string} */ originId, /** @type {string} */ id) =>
  CHARACTER_TABLES.map((table) => db.prepare(`UPDATE OR IGNORE ${table} SET char_id = ? WHERE player = ? AND char_id = ?`).bind(id, playerId, originId));

const openPassOf = (/** @type {any} */ db, /** @type {string} */ playerId) =>
  db.prepare('SELECT id FROM realm_passes WHERE player = ? AND spent_at IS NULL').bind(playerId).first();

const originIn = async (/** @type {any} */ db, /** @type {string} */ originId) => !!(await db.prepare(
  'SELECT 1 AS here WHERE EXISTS (SELECT 1 FROM realm_census WHERE char_id = ? AND spent = 1) OR EXISTS (SELECT 1 FROM realm_characters WHERE origin_id = ?)',
).bind(originId, originId).first());

/**
 * @param {any} ctx
 * @param {any} actor
 * @param {any} env
 * @param {{ name?: unknown, account?: unknown, revoke?: unknown }} at
 */
export async function grantCustomsPass({ db, nowS }, actor, env, { name, account, revoke = false } = {}) {
  if (!isDeveloper(actor, env)) return { error: 'not-developer' };
  if ((name === undefined) === (account === undefined) || (revoke !== true && revoke !== false)) return { error: 'body' };
  let found;
  if (account !== undefined) {
    if (typeof account !== 'string' || !ID_RE.test(account)) return { error: 'body' };
    found = await db.prepare('SELECT * FROM players WHERE id = ?').bind(account).all();
  } else if (isHandleShaped(name)) {
    found = await db.prepare('SELECT * FROM players WHERE handle_lc = ?').bind(/** @type {string} */ (name).toLowerCase()).all();
  } else if (isGuestShaped(name)) {
    found = await db.prepare('SELECT * FROM players WHERE guest_name = ? AND handle_lc IS NULL LIMIT 2').bind(name).all();
  } else return { error: 'body' };
  const rows = found?.results ?? [];
  if (!rows.length) return { error: 'no-player' };
  if (rows.length > 1) return { error: 'ambiguous' };
  const target = rows[0];
  // A revoke removes only an open pass; a spent one stays as the record of whom it let in.
  const wrote = revoke
    ? await db.prepare('DELETE FROM realm_passes WHERE player = ? AND spent_at IS NULL').bind(target.id).run()
    : await db.prepare('INSERT OR IGNORE INTO realm_passes (player, granted_by, granted_at) VALUES (?, ?, ?)').bind(target.id, actor.id, nowS).run();
  return { ok: true, target: target.id, name: displayName(target), open: !revoke, changed: wrote.meta.changes > 0 };
}

// Names why customsRealm's guarded write refused; that write alone decides who comes in.
/** @param {any} ctx @param {string} playerId @param {string} originId */
export async function customsRefusal({ db }, playerId, originId) {
  const counted = await db.prepare('SELECT spent FROM realm_census WHERE player = ? AND char_id = ?').bind(playerId, originId).first();
  if (counted?.spent) return 'customs-already';
  if (!counted) {
    if (!(await openPassOf(db, playerId))) {
      // The census may count this character under another account; customs spends every row, so one row shows it.
      const other = await db.prepare('SELECT spent FROM realm_census WHERE char_id = ? LIMIT 1').bind(originId).first();
      return other ? (other.spent ? 'customs-already' : 'customs-other-account') : 'customs-never-online';
    }
    if (await originIn(db, originId)) return 'customs-already';
  }
  const held = await db.prepare('SELECT COUNT(*) AS n FROM realm_characters WHERE player = ? AND dead_at IS NULL').bind(playerId).first();
  return (held?.n ?? 0) >= REALM_CHARACTERS_MAX ? 'too-many-characters' : null;
}

/** @param {any} ctx @param {string} playerId @param {{ origin: unknown, name: unknown, summary?: unknown }} at */
export async function customsRealm(ctx, playerId, { origin, name, summary = null }) {
  const { db, rand, nowS } = ctx;
  if (typeof origin !== 'string' || !ORIGIN_ID_RE.test(origin) || REALM_ID_RE.test(origin)) return { error: 'body' };
  const mine = await db.prepare('SELECT id, bytes FROM realm_characters WHERE player = ? AND origin_id = ?').bind(playerId, origin).first();
  // A customs whose first save never landed resumes with a new lease and carries again.
  if (mine && !(mine.bytes > 0)) {
    await db.batch(customsCarry(db, playerId, origin, mine.id));
    const joined = await joinRealm(ctx, playerId, mine.id);
    return joined.error ? joined : { id: joined.id, lease: joined.lease, seq: 0, resumed: true };
  }
  const n = realmNameOf(name);
  if (!playerId || !n) return { error: 'body' };
  const id = mintRealmId(rand);
  const lease = mintLease(rand);
  // One guarded batch: the row is written only under the account bound, with an unspent census row or open pass.
  // Every census row of the origin is spent and carried in the same batch, so racing accounts get one winner.
  try {
    await db.batch([
      db.prepare(
        'INSERT INTO realm_characters (id, player, name, summary, seq, bytes, lease, lease_at, origin_id, created_at, updated_at)'
        + ' SELECT ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM realm_characters WHERE player = ? AND dead_at IS NULL) < ?'
        + ' AND (EXISTS (SELECT 1 FROM realm_census WHERE player = ? AND char_id = ? AND spent = 0)'
        + ' OR (EXISTS (SELECT 1 FROM realm_passes WHERE player = ? AND spent_at IS NULL)'
        + ' AND NOT EXISTS (SELECT 1 FROM realm_census WHERE char_id = ? AND spent = 1)'
        + ' AND NOT EXISTS (SELECT 1 FROM realm_characters WHERE origin_id = ?)))',
      ).bind(id, playerId, n, realmSummaryOf(summary), lease, nowS, origin, nowS, nowS, playerId, REALM_CHARACTERS_MAX, playerId, origin, playerId, origin, origin),
      mustChange(db),
      db.prepare(
          'UPDATE realm_passes SET origin_id = ?, spent_at = ? WHERE player = ? AND spent_at IS NULL'
        + ' AND NOT EXISTS (SELECT 1 FROM realm_census WHERE player = ? AND char_id = ? AND spent = 0)',
      ).bind(origin, nowS, playerId, playerId, origin),
      db.prepare('INSERT OR IGNORE INTO realm_census (player, char_id, spent) VALUES (?, ?, 1)').bind(playerId, origin),
      db.prepare('UPDATE realm_census SET spent = 1 WHERE char_id = ?').bind(origin),
      ...customsCarry(db, playerId, origin, id),
    ]);
  } catch (e) {
    const why = await customsRefusal(ctx, playerId, origin);
    if (why) return { error: why };
    throw e;
  }
  await freeOthers({ db }, playerId, id);
  await linkFirstPlay({ db }, playerId, origin);
  return { id, lease, seq: 0 };
}

/** @param {any} ctx @param {string} playerId @param {unknown} id */
export async function joinRealm({ db, rand, nowS }, playerId, id) {
  if (typeof id !== 'string' || !REALM_ID_RE.test(id)) return { error: 'body' };
  const lease = mintLease(rand);
  // played_at saves the account's played seconds at the join, so the budget counts only time on this character.
  const took = await db.prepare('UPDATE realm_characters SET lease = ?3, lease_at = ?4, played_at = (SELECT played_s FROM players WHERE id = ?2) WHERE id = ?1 AND player = ?2 AND dead_at IS NULL')
    .bind(id, playerId, lease, nowS).run();
  if (!took.meta.changes) return { error: (await db.prepare('SELECT 1 FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first()) ? 'dead' : 'no-realm-character' };
  await freeOthers({ db }, playerId, id);
  const row = await db.prepare('SELECT seq, bytes, origin_id FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  return { id, lease, seq: row?.seq ?? 0, bytes: row?.bytes ?? 0, origin: row?.origin_id ?? null };
}

export async function objectBytesOf(/** @type {any} */ object) {
  if (typeof object?.arrayBuffer === 'function') return new Uint8Array(await object.arrayBuffer());
  if (object?.body instanceof Uint8Array) return object.body;
  return new Uint8Array(await new Response(object?.body).arrayBuffer());
}

export async function realmSaveTextOf(/** @type {any} */ object) {
  return object ? saveTextOf(await objectBytesOf(object), REALM_TEXT_MAX_BYTES) : null;
}

// A character born online must match a fresh chargen. A customs character brings no more than the allowance
// for the level in the row summary, which nothing writes before the first save lands.
/** @param {string | null} text @param {{ origin_id?: string | null, summary?: string | null }} row */
export function firstSaveRefusal(text, row) {
  let save = null;
  try { save = JSON.parse(text); } catch { save = null; }
  const shaped = !!save && typeof save === 'object' && !Array.isArray(save);
  if (!row.origin_id) {
    return shaped && save.level === REALM_BIRTH_LEVEL && liquidWealthOf(save) <= REALM_BIRTH_WEALTH_MAX && cardWorthOf(save) <= STARTER_DECK_WORTH && cardPacksOf(save) === 0 ? null : { error: 'realm-birth' };
  }
  let level = null;
  try { level = JSON.parse(row.summary ?? 'null')?.level ?? null; } catch { level = null; }
  if (!(shaped && liquidWealthOf(save) <= customsAllowance(level))) return { error: 'customs-allowance' };
  return cardWorthOf(save) <= customsCardAllowance(level) ? null : { error: 'customs-cards' };
}

export const JUDGE_COLUMNS = 'judged_seq, held, held_at, strikes, review, wealth, witnessed, allowance, played_at, clean_obj, clean_seq,'
  + ' dupes, judge_rev, svc_seq, level_seen, level_at, law_sig, law_excused, law_v, wealth_v, held_until, law_holds, law_at';

// record-unjudged means no checkpoint has been judged yet, so the record moves nothing until one is.
/** @param {{ held?: string | null, judged_seq?: number | null } | null} row */
export function holdRefusal(row) {
  if (!row) return null;
  if (row.held) return { error: 'trade-held', held: row.held };
  if (row.judged_seq == null) return { error: 'record-unjudged' };
  return null;
}

export async function realmHoldOf(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {unknown} */ character) {
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return null;
  return holdRefusal(await db.prepare('SELECT held, judged_seq FROM realm_characters WHERE id = ?1 AND player = ?2').bind(character, playerId).first());
}

// A timed law hold on a dead character with no law_sig ends by itself, since no checkpoint can lift it.
export const holdStandsSql = (/** @type {string} */ a, /** @type {string} */ now) => `(${a}.held IS NOT NULL AND NOT (${a}.dead_at IS NOT NULL
  AND ${a}.held = 'law' AND ${a}.held_until IS NOT NULL AND ${a}.held_until <= ${now} AND ${a}.law_sig IS NULL))`;

// A crafted piece carries the hold of the character that made it (char_id, or origin_id before customs).
export async function craftHoldOf(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {unknown} */ provenance) {
  if (typeof provenance !== 'string') return null;
  const row = await db.prepare(`SELECT r.held FROM products p JOIN realm_characters r ON (r.id = p.char_id OR r.origin_id = p.char_id) AND r.player = ?2
    WHERE p.provenance = ?1 AND ${holdStandsSql('r', '?3')}`).bind(provenance, playerId, Math.floor(Date.now() / 1000)).first();
  return row?.held ? { error: 'trade-held', held: row.held } : null;
}

// The object lands at a new key, and the row moves to it only while the lease and seq still hold.
// A verdict never refuses a save: it holds the character's trade, in the same batch that moves the row.
/**
 * @param {any} ctx
 * @param {string} playerId
 * @param {{ id: string, lease: unknown, seq: unknown, summary?: unknown }} at
 * @param {ArrayBuffer} body
 * @param {number} bytes
 */
export async function checkpointRealm({ db, bucket, rand, nowS }, playerId, { id, lease, seq, summary = null, session = null }, body, bytes) {
  if (!bucket) return { error: 'no-storage' };
  if (!REALM_ID_RE.test(id) || typeof lease !== 'string' || !LEASE_RE.test(lease) || !Number.isSafeInteger(seq) || /** @type {number} */ (seq) < 1) return { error: 'body' };
  const keptConfig = budgetKept(db);
  const [rowRes, mineRes, dupesRes, configRes] = await db.batch([
    db.prepare(`SELECT seq, lease, obj, prev, origin_id, summary, dead_at, ${JUDGE_COLUMNS},
    (SELECT played_s FROM players p WHERE p.id = realm_characters.player) AS played_now,
    (SELECT banned_until FROM players p WHERE p.id = realm_characters.player) AS ban_until_now,
    (SELECT ban_reason FROM players p WHERE p.id = realm_characters.player) AS ban_reason_now,
    (SELECT frozen_until FROM players p WHERE p.id = realm_characters.player) AS frozen_until_now,
    (SELECT frozen_reason FROM players p WHERE p.id = realm_characters.player) AS frozen_reason_now,
    (SELECT 1 FROM sessions s WHERE s.id = ?3 AND s.player_id = realm_characters.player) AS session_alive,
    (SELECT tally FROM item_census c WHERE c.char_id = realm_characters.id) AS census_tally
    FROM realm_characters WHERE id = ?1 AND player = ?2`).bind(id, playerId, session),
    ...ledgerReads(db, id),
    ...(keptConfig ? [] : [budgetRead(db)]),
  ]);
  const config = keptConfig ?? budgetFrom(db, configRes?.results?.[0] ?? null);
  const row = rowRes?.results?.[0] ?? null;
  if (!row) return { error: 'no-realm-character' };
  if (session != null && row.session_alive == null) return { error: 'auth' };
  if (Number.isSafeInteger(row.ban_until_now) && row.ban_until_now > nowS) return { error: 'banned', player: { banned_until: row.ban_until_now, ban_reason: row.ban_reason_now } };
  if (Number.isSafeInteger(row.frozen_until_now) && row.frozen_until_now > nowS) return { error: 'frozen', player: { frozen_until: row.frozen_until_now, frozen_reason: row.frozen_reason_now } };
  if (row.dead_at != null) return { error: 'dead' };
  if (row.lease !== lease) return { error: 'lease' };
  // The service's seq lets a tab whose last answer was lost resync.
  if (seq !== row.seq + 1) return { error: 'seq', seq: row.seq };
  const text = await saveTextOf(new Uint8Array(body), REALM_TEXT_MAX_BYTES);
  if (seq === 1) {
    const refused = firstSaveRefusal(text, row);
    if (refused) return refused;
  }
  let save = null;
  try { save = JSON.parse(/** @type {string} */ (text)); } catch { save = null; }
  const said = realmSummaryOf(summary);
  let summaryNow = null;
  try { summaryNow = JSON.parse(said ?? 'null'); } catch { summaryNow = null; }
  const key = mintObjectKey(rand, playerId, id, /** @type {number} */ (seq));
  // The verdict is read before the object lands and written in the row's batch, so a losing write records none.
  const baseline = !judgeIsOff() && (row.wealth == null || row.wealth_v !== WEALTH_VERSION) ? await baselineOf(bucket, row, save) : null;
  const known = { mine: mineRes, dupes: dupesRes, config };
  const at = { player: playerId, char: id, seq: /** @type {number} */ (seq), key };
  const v = judgeIsOff() ? verdictOff({ db, nowS }, at, row, save) : await verdictOn({ db, nowS }, at, row, save, summaryNow, baseline, known);
  await bucket.put(key, body);
  /** @type {any} */
  let stood = null;
  try {
    const res = await db.batch([
      db.prepare('UPDATE realm_characters SET seq = ?, bytes = ?, obj = ?, prev = obj, lease_at = ?, summary = COALESCE(?, summary), updated_at = ? WHERE id = ? AND player = ? AND lease = ? AND seq = ?')
        .bind(seq, bytes, key, nowS, said, nowS, id, playerId, lease, /** @type {number} */ (seq) - 1),
      mustChange(db),
      ...v.steps,
      ...(v.clean ? seaSeasonSteps(db, { player: playerId, char: id }, save, nowS) : []),
    ]);
    if (res?.[2]?.meta?.changes === 1) stood = v.set;
  } catch {
    // A batch that threw may still have landed; the object stays when the row names it.
    if (!(await dropIfUnnamed(db, bucket, playerId, id, key))) {
      // Two checkpoints under one lease race to one seq; the loser answers seq, not lease, so its tab resyncs.
      return (await recordMovedOf(db, playerId, { id, lease, seq: /** @type {number} */ (seq) - 1 })) ?? { error: 'lease' };
    }
  }
  stood ??= await db.prepare('SELECT held, clean_obj FROM realm_characters WHERE id = ?').bind(id).first() ?? { held: row.held, clean_obj: row.clean_obj };
  // The save before the last stays, and so does the last one judged clean, which staff rollback uses.
  const keep = new Set([key, row.obj, stood.clean_obj].filter(Boolean));
  await dropObjects(bucket, [...new Set([row.prev, row.clean_obj])].filter((k) => k && !keep.has(k)));
  return { ok: true, seq, tradeHeld: stood.held ?? null, ...(stood === v.set && v.why ? { tradeHeldWhy: v.why } : {}), locked: v.locked };
}

/** @param {any} bucket @param {any} row @param {any} save */
async function baselineOf(bucket, row, save) {
  if (row.obj) {
    let stored = null;
    try { stored = JSON.parse(/** @type {string} */ (await realmSaveTextOf(await bucket.get(row.obj)))); } catch { stored = null; }
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return { wealth: null, level: null };
    const level = Number.isInteger(stored.level) && stored.level >= 1 ? stored.level : null;
    return { wealth: wealthOf(stored), level };
  }
  if (row.origin_id) {
    const level = Number.isInteger(save?.level) && save.level >= 1 ? save.level : 1;
    return { wealth: customsAllowance(level), level };
  }
  return { wealth: REALM_BIRTH_WEALTH_MAX, level: REALM_BIRTH_LEVEL };
}

export async function getRealmBlob({ db, bucket }, /** @type {string} */ playerId, /** @type {string} */ id) {
  if (!bucket) return { error: 'no-storage' };
  if (!REALM_ID_RE.test(id)) return { error: 'body' };
  const row = await db.prepare('SELECT seq, bytes, obj FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (!row.seq || !row.bytes || !row.obj) return { error: 'no-data' };
  const object = await bucket.get(row.obj);
  return object ? { ok: true, object, seq: row.seq } : { error: 'no-data' };
}

// Fails the batch unless the UPDATE before it changed exactly n rows: the guard row breaks the table's CHECK.
export const mustChange = (/** @type {any} */ db, n = 1) => db.prepare('INSERT INTO realm_tx_guard (moved, expected) SELECT changes(), ? WHERE changes() != ?').bind(n, n);

export function realmAtOf(/** @type {any} */ v) {
  if (!v || typeof v !== 'object') return null;
  const { id, lease, seq } = v;
  if (typeof id !== 'string' || !REALM_ID_RE.test(id) || typeof lease !== 'string' || !LEASE_RE.test(lease) || !Number.isSafeInteger(seq) || seq < 1) return null;
  return { id, lease, seq };
}

// Writes the next record object and returns the steps that move the row, for the caller to batch with its act.
// After that batch the caller drops prev when it landed, or key when it did not.
/**
 * @param {any} ctx
 * @param {string} playerId
 * @param {{ id: string, lease: string, seq: number }} at
 * @param {(save: any) => string | null} change
 * @param {{ outbound?: boolean, escrow?: boolean | Set<string>, seize?: boolean, take?: boolean, witness?: boolean }} [opts]
 */
export async function prepareRealmRecord({ db, bucket, rand, nowS }, playerId, at, change, { outbound = false, escrow = false, seize = false, take = false, witness = true } = {}) {
  if (!bucket) return { error: 'no-storage' };
  const row = await db.prepare('SELECT seq, lease, obj, prev, held, judged_seq, clean_obj FROM realm_characters WHERE id = ? AND player = ?').bind(at.id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (!seize && row.lease !== at.lease) return { error: 'lease' };
  if (row.seq !== at.seq || !row.obj) return { error: 'seq', seq: row.seq };
  if (outbound) {
    const held = holdRefusal(row);
    if (held) return held;
  }
  const object = await bucket.get(row.obj);
  let save = null;
  try { save = JSON.parse(await realmSaveTextOf(object)); } catch { save = null; }
  if (!save || typeof save !== 'object' || Array.isArray(save)) return { error: 'no-data' };
  const before = wealthOf(save);
  const piecesBefore = ledgerPieces(save);
  const classicBefore = outbound ? classicCount(save) : 0;
  const refused = change(save);
  if (refused) return { error: refused };
  // A held record is paid nothing either; staff takes and seizures are not payments.
  if (!outbound && !take && !seize && wealthOf(save) > before) {
    const held = holdRefusal(row);
    if (held) return held;
  }
  if (outbound && classicCount(save) < classicBefore) return { error: 'piece-legacy' };
  const piecesAfter = ledgerPieces(save);
  const { leaving, twice } = leavingKeys(piecesBefore, piecesAfter);
  const why = take ? null : twice.length ? 'piece-dupe' : leaving.length ? await piecesRefusal(db, at.id, leaving) : null;
  if (why) return { error: why };
  const text = JSON.stringify(save);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > REALM_TEXT_MAX_BYTES) return { error: 'no-data' };
  const key = mintObjectKey(rand, playerId, at.id, at.seq + 1);
  await bucket.put(key, text);
  // A record last judged clean stays clean after a service move, so a rollback never undoes the service's moves.
  const clean = row.clean_obj != null && row.clean_obj === row.obj;
  const moves = ledgerMoves(db, { player: playerId, char: at.id, seq: at.seq + 1, nowS }, piecesBefore, piecesAfter, { escrow });
  const steps = [
    db.prepare(`UPDATE realm_characters SET seq = ?1, bytes = ?2, obj = ?3, prev = obj, updated_at = ?4, witnessed = witnessed + ?5, svc_seq = ?1${clean ? ', clean_obj = ?3, clean_seq = ?1' : ''}${seize ? ', lease = NULL' : ''}
      WHERE id = ?6 AND player = ?7 AND ${seize ? '?8 = ?8 AND dead_at IS NULL' : 'lease = ?8'} AND seq = ?9`)
      .bind(at.seq + 1, bytes, key, nowS, witness ? wealthOf(save) - before : 0, at.id, playerId, at.lease, at.seq),
    mustChange(db),
    ...moves.left,
    ...moves.entered,
  ];
  return { steps, key, prev: row.prev === row.clean_obj ? null : row.prev, seq: at.seq + 1 };
}

// Changes a record on a relay-signed word with no tab lease, then clears the lease so the playing tab must rejoin.
/**
 * @param {any} ctx
 * @param {string} playerId
 * @param {string} charId
 * @param {(save: any) => string | null} change
 * @param {{ escrow?: boolean | Set<string>, take?: boolean }} [opts]
 */
export async function seizeRealmRecord(ctx, playerId, charId, change, { escrow = true, take = false } = {}) {
  const row = await ctx.db.prepare('SELECT seq, lease FROM realm_characters WHERE id = ? AND player = ? AND dead_at IS NULL').bind(charId, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  return prepareRealmRecord(ctx, playerId, { id: charId, lease: row.lease ?? '', seq: row.seq }, change, { escrow, seize: true, take });
}

// D1 can commit a batch and lose its answer, so the object goes only when the row names it nowhere.
export async function dropIfUnnamed(/** @type {any} */ db, /** @type {any} */ bucket, /** @type {string} */ playerId, /** @type {string} */ id, /** @type {string} */ key) {
  const row = await db.prepare('SELECT obj, prev, clean_obj FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (row && (row.obj === key || row.prev === key || row.clean_obj === key)) return true;
  await dropObjects(bucket, [key]);
  return false;
}

export async function recordMovedOf(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {{ id: string, lease: string, seq: number }} */ at) {
  const row = await db.prepare('SELECT seq, lease FROM realm_characters WHERE id = ? AND player = ?').bind(at.id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (row.lease !== at.lease) return { error: 'lease' };
  return row.seq !== at.seq ? { error: 'seq', seq: row.seq } : null;
}

/** @param {unknown} character @param {unknown} realm */
export function realmSideOf(character, realm) {
  const mine = typeof character === 'string' && REALM_ID_RE.test(character);
  if (!mine) return realm == null ? { at: null } : { error: 'body' };
  const at = realmAtOf(realm);
  if (!at || at.id !== character) return { error: 'realm-needed' };
  return { at };
}

// The record's position is checked before any other refusal, because the client reads a lost answer by its seq.
/** @param {any} db @param {string} playerId @param {unknown} character @param {unknown} realm */
export async function realmActFirst(db, playerId, character, realm) {
  const side = realmSideOf(character, realm);
  if (side.error || !side.at) return side;
  return (await recordMovedOf(db, playerId, side.at)) ?? side;
}

export async function leaveRealm({ db }, /** @type {string} */ playerId, /** @type {{ id: unknown, lease: unknown }} */ { id, lease }) {
  if (typeof id !== 'string' || !REALM_ID_RE.test(id) || typeof lease !== 'string' || !LEASE_RE.test(lease)) return { error: 'body' };
  const r = await db.prepare('UPDATE realm_characters SET lease = NULL WHERE id = ? AND player = ? AND lease = ?').bind(id, playerId, lease).run();
  return { ok: true, released: r.meta.changes > 0 };
}

export async function deleteRealm({ db, bucket, nowS = Math.floor(Date.now() / 1000) }, /** @type {string} */ playerId, /** @type {unknown} */ id) {
  if (typeof id !== 'string' || !REALM_ID_RE.test(id)) return { error: 'body' };
  const row = await db.prepare('SELECT obj, prev, bytes, origin_id, dead_at, held FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  // A tombstone is never deleted: its row holds the person's claim on the unique index.
  if (row.dead_at != null) return { error: 'dead' };
  // A held character with crafts at the account stays, since its row carries the hold on the pieces it made.
  if (row.held && await db.prepare('SELECT 1 FROM products WHERE owner = ?1 AND (char_id = ?2 OR char_id = ?3) LIMIT 1')
    .bind(playerId, id, row.origin_id ?? id).first()) return { error: 'trade-held', held: row.held };
  // A customs character whose first save never landed is undone, which returns what customs carried.
  if (row.origin_id && !(row.bytes > 0)) return undoCustoms({ db, bucket }, playerId, id, row.origin_id);
  const master = await db.prepare(`SELECT (SELECT COUNT(*) FROM guild_members o WHERE o.guild_id = m.guild_id) AS n,
    (SELECT treasury FROM guilds g WHERE g.id = m.guild_id) AS treasury,
    (SELECT 1 FROM homes h WHERE h.guild_id = m.guild_id) AS hall,
    (SELECT 1 FROM guild_vault v WHERE v.guild_id = m.guild_id LIMIT 1) AS vault FROM guild_members m
    WHERE m.player = ? AND m.char_id = ? AND m.rank = ?`).bind(playerId, id, GUILD_RANK_MASTER).first();
  if ((master?.n ?? 0) > 1) return { error: 'guild-master-leaves' };
  if ((master?.treasury ?? 0) > 0) return { error: 'guild-treasury' };
  if (master?.hall) return { error: 'guild-hall' };
  if (master?.vault) return { error: 'guild-vault' };
  if (Number((await db.prepare(REALM_MARKET_OPEN_SQL).bind(playerId, id).first())?.n ?? 0) > 0) return { error: 'realm-market-open' };
  const stand = await homesStand(db, playerId, id, nowS);
  if (stand.error) return { error: stand.error };
  if (await db.prepare(`SELECT 1 FROM card_stakes WHERE player = ? AND char_id = ? AND status = 'held' LIMIT 1`).bind(playerId, id).first()) return { error: 'cards-held' };
  if (await db.prepare(`SELECT 1 FROM sea_bounty_owed WHERE killer = ?1 AND killer_char = ?2 AND paid_at IS NULL
    UNION ALL SELECT 1 FROM sea_prizes WHERE killer = ?1 AND killer_char = ?2 AND state = 'held' AND until_s > ?3
    UNION ALL SELECT 1 FROM sea_prizes WHERE victim = ?1 AND victim_char = ?2 AND state = 'held' AND until_s <= ?3 LIMIT 1`).bind(playerId, id, nowS).first()) return { error: 'sea-held' };
  // Rooms are unlisted first so no new rent starts, then the plan is checked again.
  await unlistRooms(db, stand.plan);
  const late = await homesStand(db, playerId, id, nowS);
  if (late.error) return { error: late.error };
  /** @type {any} */
  let plan = late.plan;
  // A failed batch is planned again: a refusal answers, an unchanged plan rethrows, a changed plan retries once.
  for (let attempt = 0; ; attempt++) {
    try {
      await db.batch([
        ...homeSteps(db, playerId, id, nowS, plan),
    db.prepare('DELETE FROM guild_members WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM renown_tracks WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM prof_stores WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM prof_tracks WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM firmament WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM firmament_free_respec WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM prof_unbruised WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM prof_carried WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM prof_silver_cloth WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM npc_roll WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM npc_roll_heads WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM npc_rep_events WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM npc_receipt_credits WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM npc_chapter_seats WHERE account = ? AND char_id = ?').bind(playerId, id),
    db.prepare('DELETE FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId),
    ...releaseSteps(db, id, nowS, { deleted: true }),
    endUnionsOf(db, id, nowS, 'gone'),
    db.prepare('DELETE FROM realm_wed_halves WHERE char_id = ?').bind(id),
      ]);
      break;
    } catch (e) {
      const again = await homesStand(db, playerId, id, nowS);
      if (again.error) return { error: again.error };
      if (JSON.stringify(again.plan) === JSON.stringify(plan)) throw e;
      if (attempt) return { error: 'home-plan-changed' };
      plan = again.plan;
      await unlistRooms(db, plan);
    }
  }
  await dropCharacterObjects(bucket, playerId, id, [row.obj, row.prev]);
  /** @type {Map<number, number[]>} */
  const towns = new Map();
  for (const h of plan) if (h.heir == null) towns.set(h.map_id, [...(towns.get(h.map_id) ?? []), h.building_key]);
  const passed = plan.filter((h) => h.heir != null).map((h) => ({ mapId: h.map_id, buildingKey: h.building_key, char: h.heir }));
  return { ok: true, ...(towns.size ? { moved: [...towns].flatMap(([mapId, keys]) => homeMoved(mapId, [], keys)) } : {}), ...(passed.length ? { passed } : {}) };
}

export const HOME_TENANTS_SQL = `SELECT COUNT(*) AS n FROM home_rooms WHERE map_id = ?1 AND building_key = ?2 AND tenant IS NOT NULL AND until > ?3`;
export const HOME_RENT_DUE_SQL = `SELECT COALESCE(SUM(rent_due), 0) AS due FROM homes WHERE map_id = ?1 AND building_key = ?2`;
export const HOME_VENDOR_STOCK_SQL = `SELECT COUNT(*) AS n FROM market_listings l JOIN home_decor d ON d.map_id = l.vendor_map AND d.id = l.vendor_id
  WHERE l.state = 'open' AND d.map_id = ?1 AND d.building_key = ?2 AND EXISTS (SELECT 1 FROM homes h WHERE h.map_id = ?1 AND h.building_key = ?2 AND h.guild_id IS NULL)`;
const PLAIN_HOME_SQL = 'EXISTS (SELECT 1 FROM homes h WHERE h.map_id = ?1 AND h.building_key = ?2 AND h.deed = 0 AND h.guild_id IS NULL)';
const GUARD_SQL = 'INSERT INTO realm_tx_guard (moved, expected) SELECT 1, 0 WHERE';
const LIVING_OWNER_SQL = `SELECT 1 FROM home_owners o JOIN realm_characters c ON c.id = o.char_id AND c.player = o.player AND c.dead_at IS NULL
  WHERE o.map_id = ?1 AND o.building_key = ?2`;

// Each house passes to the earliest-added living co-owner under HOME_CAP, or goes. A house that goes is refused
// while tenants, rent due, or a stocked trader holds it.
/** @param {any} db @param {string} playerId @param {string} id @param {number} nowS */
async function homesStand(db, playerId, id, nowS) {
  const houses = (await db.prepare('SELECT map_id, building_key, deed, guild_id FROM homes WHERE player = ? AND char_id = ? ORDER BY map_id, building_key').bind(playerId, id).all())?.results ?? [];
  /** @type {Map<string, number>} */
  const held = new Map();
  const plan = [];
  for (const h of houses) {
    let heir = null;
    if (h.deed === 0 && h.guild_id == null) {
      const cands = (await db.prepare(`SELECT o.char_id FROM home_owners o JOIN realm_characters c ON c.id = o.char_id AND c.player = o.player AND c.dead_at IS NULL
        WHERE o.map_id = ? AND o.building_key = ? AND o.char_id != ? ORDER BY o.added_at, o.char_id`).bind(h.map_id, h.building_key, id).all())?.results ?? [];
      for (const c of cands) {
        if (!held.has(c.char_id)) held.set(c.char_id, Number((await db.prepare('SELECT COUNT(*) AS n FROM homes WHERE player = ? AND char_id = ? AND guild_id IS NULL AND deed = 0').bind(playerId, c.char_id).first())?.n) || 0);
        if ((held.get(c.char_id) ?? 0) < HOME_CAP) { heir = c.char_id; held.set(c.char_id, (held.get(c.char_id) ?? 0) + 1); break; }
      }
      if (heir == null && cands.length) return { error: 'home-heir-full' };
    }
    plan.push({ map_id: h.map_id, building_key: h.building_key, heir });
  }
  for (const h of plan) {
    if (h.heir != null) continue;
    if (Number((await db.prepare(HOME_VENDOR_STOCK_SQL).bind(h.map_id, h.building_key).first())?.n ?? 0) > 0) return { error: 'home-vendor-stocked' };
    if (Number((await db.prepare(HOME_TENANTS_SQL).bind(h.map_id, h.building_key, nowS).first())?.n ?? 0) > 0) return { error: 'home-tenants' };
    if (Number((await db.prepare(HOME_RENT_DUE_SQL).bind(h.map_id, h.building_key).first())?.due ?? 0) > 0) return { error: 'home-rent-due' };
  }
  return { plan };
}

const unlistRooms = (/** @type {any} */ db, /** @type {any[]} */ plan) => Promise.all(plan.filter((h) => h.heir == null)
  .map((h) => db.prepare('UPDATE home_rooms SET listed = 0 WHERE map_id = ? AND building_key = ?').bind(h.map_id, h.building_key).run()));

// Guards come first, so a plan that no longer holds fails the whole delete.
function homeSteps(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {string} */ id, /** @type {number} */ nowS, /** @type {any[]} */ plan) {
  const steps = [db.prepare(`${GUARD_SQL} (SELECT COUNT(*) FROM homes WHERE player = ?1 AND char_id = ?2) != ?3`).bind(playerId, id, plan.length)];
  for (const h of plan) {
    steps.push(db.prepare(`${GUARD_SQL} NOT EXISTS (SELECT 1 FROM homes WHERE map_id = ?1 AND building_key = ?2 AND player = ?3 AND char_id = ?4)`)
      .bind(h.map_id, h.building_key, playerId, id));
  }
  for (const h of plan.filter((x) => x.heir == null)) {
    steps.push(
      db.prepare(`${GUARD_SQL} EXISTS (${LIVING_OWNER_SQL} AND o.char_id != ?4 AND ${PLAIN_HOME_SQL})
        OR (${HOME_TENANTS_SQL}) > 0 OR (${HOME_RENT_DUE_SQL}) > 0 OR (${HOME_VENDOR_STOCK_SQL}) > 0`).bind(h.map_id, h.building_key, nowS, id),
      db.prepare('UPDATE home_rooms SET listed = 0 WHERE map_id = ? AND building_key = ?').bind(h.map_id, h.building_key),
    );
  }
  for (const h of plan.filter((x) => x.heir != null)) {
    steps.push(
      db.prepare(`${GUARD_SQL} NOT EXISTS (${LIVING_OWNER_SQL} AND o.char_id = ?3)
        OR (SELECT COUNT(*) FROM homes WHERE player = ?4 AND char_id = ?3 AND guild_id IS NULL AND deed = 0) >= ?5`).bind(h.map_id, h.building_key, h.heir, playerId, HOME_CAP),
      db.prepare('UPDATE homes SET char_id = ? WHERE map_id = ? AND building_key = ? AND player = ? AND char_id = ?').bind(h.heir, h.map_id, h.building_key, playerId, id),
      mustChange(db),
    );
  }
  steps.push(
    db.prepare(`DELETE FROM home_owners WHERE player = ?1 AND EXISTS (SELECT 1 FROM homes h WHERE h.map_id = home_owners.map_id
      AND h.building_key = home_owners.building_key AND h.char_id = home_owners.char_id)`).bind(playerId),
    db.prepare('DELETE FROM home_owners WHERE player = ? AND char_id = ?').bind(playerId, id),
    db.prepare(`UPDATE home_offers SET state = 'cancelled' WHERE state = 'open' AND ((seller = ?1 AND seller_char = ?2) OR (buyer = ?1 AND buyer_char = ?2))`).bind(playerId, id),
    db.prepare('DELETE FROM homes WHERE player = ? AND char_id = ?').bind(playerId, id),
  );
  return steps;
}

// Market business another player is part of, whose goods would come to this character. Escrowed Marks return to
// the account, so they hold nothing up.
export const REALM_MARKET_OPEN_SQL = `SELECT
  (SELECT COUNT(*) FROM market_listings WHERE seller = ?1 AND char_id = ?2
    AND (state = 'open' OR (state IN ('expired', 'removed') AND returned = 0)))
  + (SELECT COUNT(*) FROM market_auctions WHERE seller = ?1 AND char_id = ?2
    AND (state = 'open' OR (state IN ('unsold', 'removed') AND returned = 0)))
  + (SELECT COUNT(*) FROM market_bids WHERE bidder = ?1 AND char_id = ?2 AND state = 'high')
  + (SELECT COUNT(*) FROM market_orders WHERE poster = ?1 AND char_id = ?2 AND state = 'open')
  + (SELECT COUNT(*) FROM commissions WHERE poster = ?1 AND poster_char = ?2 AND state = 'open')
  + (SELECT COUNT(*) FROM market_sales WHERE buyer = ?1 AND char_id = ?2 AND kind = 'material' AND delivered = 0)
  + (SELECT COUNT(*) FROM market_deliveries WHERE player = ?1 AND char_id = ?2 AND collected = 0)
  + (SELECT COUNT(*) FROM market_gold WHERE player = ?1 AND char_id = ?2 AND gold > 0) AS n`;

async function dropCharacterObjects(/** @type {any} */ bucket, /** @type {string} */ playerId, /** @type {string} */ id, /** @type {(string | null | undefined)[]} */ named) {
  if (!bucket) return;
  await dropObjects(bucket, named);
  if (typeof bucket.list !== 'function') return;
  try {
    const listed = await bucket.list({ prefix: `${realmPrefix(playerId)}${id}/` });
    await dropObjects(bucket, (listed?.objects ?? []).map((/** @type {any} */ o) => o.key));
  } catch {}
}

// Undoes a customs whose first save never landed: the carry runs back and the spent census rows are unspent.
// The row goes only while bytes = 0, so a save that lands meanwhile keeps the character.
/** @param {any} ctx @param {string} playerId @param {string} id @param {string} originId */
async function undoCustoms({ db, bucket }, playerId, id, originId) {
  try {
    await db.batch([
      db.prepare('DELETE FROM realm_characters WHERE id = ? AND player = ? AND bytes = 0').bind(id, playerId),
      mustChange(db),
      db.prepare('DELETE FROM npc_roll WHERE player = ? AND char_id = ?').bind(playerId, id),
      db.prepare('DELETE FROM npc_roll_heads WHERE player = ? AND char_id = ?').bind(playerId, id),
      db.prepare('DELETE FROM npc_rep_events WHERE player = ? AND char_id = ?').bind(playerId, id),
      db.prepare('DELETE FROM npc_receipt_credits WHERE player = ? AND char_id = ?').bind(playerId, id),
      db.prepare('DELETE FROM npc_chapter_seats WHERE account = ? AND char_id = ?').bind(playerId, id),
      ...customsCarry(db, playerId, id, originId),
      db.prepare('DELETE FROM realm_census WHERE player = ? AND char_id = ? AND EXISTS (SELECT 1 FROM realm_passes WHERE player = ? AND origin_id = ?)')
        .bind(playerId, originId, playerId, originId),
      db.prepare('UPDATE realm_passes SET origin_id = NULL, spent_at = NULL WHERE player = ? AND origin_id = ?'
        + ' AND NOT EXISTS (SELECT 1 FROM realm_passes WHERE player = ? AND spent_at IS NULL)').bind(playerId, originId, playerId),
      db.prepare('DELETE FROM realm_passes WHERE player = ? AND origin_id = ?').bind(playerId, originId),
      db.prepare('UPDATE realm_census SET spent = 0 WHERE char_id = ? AND NOT EXISTS (SELECT 1 FROM realm_characters WHERE origin_id = ?)').bind(originId, originId),
    ]);
  } catch (e) {
    const now = await db.prepare('SELECT seq FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
    if (now) return { error: 'seq', seq: now.seq };
    throw e;
  }
  await dropCharacterObjects(bucket, playerId, id, []);
  return { ok: true, undone: true };
}

// Its own route, so an older service answers not-found rather than a delete that takes what customs carried.
/** @param {any} ctx @param {string} playerId @param {unknown} id */
export async function undoRealm({ db, bucket }, playerId, id) {
  if (typeof id !== 'string' || !REALM_ID_RE.test(id)) return { error: 'body' };
  const row = await db.prepare('SELECT origin_id, dead_at FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (!row.origin_id) return { error: 'body' };
  if (row.dead_at != null) return { error: 'dead' };
  return undoCustoms({ db, bucket }, playerId, id, row.origin_id);
}
