// @ts-check

import { houseOfRecord } from '../../src/net/houseLaw.js';
import { checkName } from '../../src/net/nameFilter.js';
import { ID_RE, REALM_CHARACTER_RE } from '../../src/net/identityToken.js';
import { releaseSteps } from './ledger.js';
import { guildMemberDead } from './guilds.js';
import { lineageLawFindings } from '../../src/systems/legacy/legacyLaw.js';
import { takeRevived, revivedOf, stampRevived, dropRevived, REZ_HOLD_S } from '../../src/systems/legacy/revived.js';

export const LINEAGE_ID_RE = /^fam-[0-9a-z]{1,12}-[0-9a-z]{6}$/;
export const LINEAGE_MAX_BYTES = 128 * 1024;
export const LINEAGE_BODY_MAX = LINEAGE_MAX_BYTES + 1024;
export const LINEAGE_PEOPLE_MAX = 400;
export const LINEAGES_MAX = 40;
export const LINEAGE_SURNAME_MAX = 60;
export const LINEAGE_MODELS = Object.freeze(['bloodline', 'enduring']);

function recordShapeOf(/** @type {unknown} */ record, /** @type {string} */ id) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const r = /** @type {any} */ (record);
  if (r.v !== 1 || r.id !== id || !Number.isSafeInteger(r.rev) || r.rev < 1) return null;
  if (!Array.isArray(r.people) || !r.people.length || r.people.length > LINEAGE_PEOPLE_MAX) return null;
  if (typeof r.surname !== 'string' || r.surname.length > LINEAGE_SURNAME_MAX || !LINEAGE_MODELS.includes(r.model)) return null;
  if (!r.people.every((p) => p && typeof p === 'object' && Number.isSafeInteger(p.id) && p.id >= 0)) return null;
  const text = JSON.stringify(r);
  return { text, rev: r.rev, surname: r.surname, model: r.model, bytes: new TextEncoder().encode(text).byteLength };
}
export function lineageRecordOf(/** @type {unknown} */ record, /** @type {string} */ id) {
  const r = recordShapeOf(record, id);
  return r && r.bytes <= LINEAGE_MAX_BYTES ? { text: r.text, rev: r.rev, surname: r.surname, model: r.model } : null;
}

const parsed = (/** @type {string} */ text) => { try { return JSON.parse(text); } catch { return null; } };

export function houseOn(/** @type {string} */ recordText, /** @type {unknown} */ personId) {
  const h = Number.isSafeInteger(personId) ? houseOfRecord(parsed(recordText), /** @type {number} */ (personId)) : null;
  if (!h || !checkName(h.hn).ok) return null;
  if (h.hc && !checkName(h.hc).ok) { delete h.hc; delete h.hg; }
  return h;
}

export async function listLineages({ db }, /** @type {string} */ playerId) {
  const r = await db.prepare('SELECT id, surname, model, rev, record FROM lineages WHERE player = ? ORDER BY updated_at DESC LIMIT ?')
    .bind(playerId, LINEAGES_MAX).all();
  return (r?.results ?? []).map((row) => ({ id: row.id, surname: row.surname, model: row.model, rev: row.rev, record: parsed(row.record) }));
}

/** @param {any} ctx @param {string} playerId @param {{ id: unknown, record: unknown, base?: unknown }} at */
export async function putLineage({ db, nowS }, playerId, { id, record: sent, base = null }) {
  if (!playerId || typeof id !== 'string' || !LINEAGE_ID_RE.test(id)) return { error: 'body' };
  if (!recordShapeOf(sent, id)) return { error: 'body' };
  if (base !== null && !(Number.isSafeInteger(base) && /** @type {number} */ (base) >= 0)) return { error: 'body' };
  const had = await db.prepare('SELECT rev, model, record FROM lineages WHERE player = ? AND id = ?').bind(playerId, id).first();
  const record = had ? withoutRevived(sent, had.record) : sent;
  const rec = recordShapeOf(record, id);
  if (!rec) return { error: 'body' };
  if (rec.bytes > LINEAGE_MAX_BYTES) return { error: 'lineage-too-large' };
  if (had) {
    if (had.model !== rec.model) return { error: 'lineage-model' };
    const broke = lineageLawFindings(record, base === had.rev ? parsed(had.record) : null);
    if (broke.length) return lineageLaw(broke);
    // A write lands only on the copy it was made from (`base`) and past it; a counter alone can pass the stored rev
    // without the device ever reading it.
    const moved = await db.prepare('UPDATE lineages SET record = ?, rev = ?, surname = ?, updated_at = ? WHERE player = ? AND id = ? AND rev = ? AND rev < ?')
      .bind(rec.text, rec.rev, rec.surname, nowS, playerId, id, base ?? -1, rec.rev).run();
    if (moved.meta.changes) {
      await entombLineDead({ db, nowS }, playerId, id, had.record, /** @type {any} */ (record));
      return { ok: true, rev: rec.rev };
    }
    return staleLine(db, playerId, id, rec.model);
  }
  const founding = lineageLawFindings(record, null);
  if (founding.length) return lineageLaw(founding);
  const wrote = await db.prepare(
    'INSERT OR IGNORE INTO lineages (player, id, surname, model, record, rev, created_at, updated_at)'
    + ' SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM lineages WHERE player = ?) < ?',
  ).bind(playerId, id, rec.surname, rec.model, rec.text, rec.rev, nowS, nowS, playerId, LINEAGES_MAX).run();
  if (wrote.meta.changes) {
    await entombLineDead({ db, nowS }, playerId, id, null, /** @type {any} */ (record));
    return { ok: true, rev: rec.rev };
  }
  return (await staleLine(db, playerId, id, rec.model)) ?? { error: 'too-many-lineages' };
}

/** @param {any} sent @param {string} storedText */
function withoutRevived(sent, storedText) {
  const stored = parsed(storedText);
  if (!(stored?.people ?? []).some((/** @type {any} */ p) => revivedOf(p).length)) return sent;
  const out = JSON.parse(JSON.stringify(sent));
  takeRevived(out, stored);
  return out;
}

const lineageLaw = (/** @type {string[]} */ findings) => ({ error: 'lineage-law', why: findings[0], findings });

async function staleLine(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {string} */ id, /** @type {string} */ model) {
  const now = await db.prepare('SELECT rev, model, record FROM lineages WHERE player = ? AND id = ?').bind(playerId, id).first();
  if (!now) return null;
  return now.model !== model ? { error: 'lineage-model' } : { error: 'lineage-stale', rev: now.rev, record: parsed(now.record) };
}

/** @param {any} ctx @param {string} playerId @param {string} lineageId @param {string|null} oldText
 * @param {any} record */
async function entombLineDead({ db, nowS }, playerId, lineageId, oldText, record) {
  const before = new Map(((oldText ? parsed(oldText) : null)?.people ?? []).map((/** @type {any} */ p) => [p?.id, p]));
  for (const p of record?.people ?? []) {
    const why = p?.died ? 'fell' : p?.retired != null && record.model === 'enduring' ? 'retired' : null;
    if (!why) continue;
    const was = before.get(p.id);
    if (was && (why === 'fell' ? !!was.died : was.retired != null)) continue;
    const row = await db.prepare('SELECT id, dead_at, dead_why FROM realm_characters WHERE player = ? AND lineage_id = ? AND person_id = ?')
      .bind(playerId, lineageId, p.id).first();
    if (!row) continue;
    if (row.dead_at == null) await entomb(db, playerId, row.id, nowS, why, null, { hold: true });
    else if (why === 'fell' && row.dead_why === 'retired') await fellRetired(db, playerId, row.id, nowS);
  }
}

/** @param {any} db @param {string} playerId @param {unknown} lineage @param {unknown} person */
export async function lineageBirthRefusal(db, playerId, lineage, person) {
  if (typeof lineage !== 'string' || !LINEAGE_ID_RE.test(lineage) || !Number.isSafeInteger(person) || /** @type {number} */ (person) < 0) return { error: 'body' };
  const row = await db.prepare('SELECT record FROM lineages WHERE player = ? AND id = ?').bind(playerId, lineage).first();
  if (!row) return { error: 'no-lineage' };
  const p = (parsed(row.record)?.people ?? []).find((x) => x?.id === person);
  if (!p || p.died || p.retired != null || (p.kind ?? 'member') !== 'member' || p.minor) return { error: 'lineage-person' };
  const played = await db.prepare('SELECT 1 FROM realm_characters WHERE player = ? AND lineage_id = ? AND person_id = ?').bind(playerId, lineage, person).first();
  return played ? { error: 'lineage-played' } : null;
}

/** @param {any} db @param {string} playerId @param {string} character */
export async function isTombstone(db, playerId, character) {
  return !!(await db.prepare(`SELECT 1 FROM realm_characters WHERE ${TOMB_WHERE}`).bind(playerId, character).first());
}
export const TOMB_WHERE = 'id = ?2 AND player = ?1 AND dead_at IS NOT NULL';

/** @param {any} ctx @param {string} playerId
 * @param {{ id: unknown, lease: unknown, why?: unknown, hold?: unknown }} at */
export async function realmDie({ db, nowS }, playerId, { id, lease, why = 'fell', hold = false }) {
  if (typeof id !== 'string' || !REALM_CHARACTER_RE.test(id) || typeof lease !== 'string' || !/^[0-9a-f]{32}$/.test(lease)) return { error: 'body' };
  if ((why !== 'fell' && why !== 'retired') || typeof hold !== 'boolean') return { error: 'body' };
  const row = await db.prepare('SELECT r.dead_at AS dead_at, r.dead_why AS dead_why, r.rez_lease AS rez_lease, l.model AS model FROM realm_characters r'
    + ' LEFT JOIN lineages l ON l.player = r.player AND l.id = r.lineage_id WHERE r.id = ? AND r.player = ?').bind(id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (why === 'retired' && row.model !== 'enduring') return { error: 'body' };
  if (row.dead_at != null && row.rez_lease != null) {
    if (!hold) await settleHeld(db, playerId, id, row.dead_at);
    return { ok: true, deadAt: row.dead_at };
  }
  if (row.dead_at != null) {
    if (!(why === 'fell' && row.dead_why === 'retired' && (await fellRetired(db, playerId, id, nowS)))) {
      await afterTomb(db, playerId, id, row.dead_at, row.dead_why === 'retired' ? 'retired' : 'fell');
    }
    return { ok: true, deadAt: row.dead_at };
  }
  if (!(await entomb(db, playerId, id, nowS, why, lease, { hold }))) return { error: 'lease' };
  return { ok: true, deadAt: nowS };
}

/** @param {any} db @param {string} playerId @param {string} id @param {number} nowS
 * @param {'fell'|'retired'} why @param {string|null} [lease] @param {{ hold?: boolean }} [o] */
async function entomb(db, playerId, id, nowS, why, lease = null, { hold = false } = {}) {
  if (hold && why === 'fell') {
    // SQLite reads each right-hand side from the row as it stood, so `rez_lease = lease` keeps the lease it clears.
    const held = await db.prepare(`UPDATE realm_characters SET dead_at = ?, dead_why = 'fell', rez_lease = lease, lease = NULL, updated_at = ? WHERE id = ? AND player = ? AND dead_at IS NULL AND lease IS NOT NULL${lease == null ? '' : ' AND lease = ?'}`)
      .bind(nowS, nowS, id, playerId, ...(lease == null ? [] : [lease])).run();
    if (held.meta.changes) return true;
  }
  const took = await db.prepare(`UPDATE realm_characters SET dead_at = ?, dead_why = ?, lease = NULL, updated_at = ? WHERE id = ? AND player = ? AND dead_at IS NULL${lease == null ? '' : ' AND lease = ?'}`)
    .bind(nowS, why, nowS, id, playerId, ...(lease == null ? [] : [lease])).run();
  if (!took.meta.changes) return false;
  await afterTomb(db, playerId, id, nowS, why);
  return true;
}

async function fellRetired(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {string} */ id, /** @type {number} */ nowS) {
  const moved = await db.prepare("UPDATE realm_characters SET dead_why = 'fell', updated_at = ? WHERE id = ? AND player = ? AND dead_why = 'retired'").bind(nowS, id, playerId).run();
  if (!moved.meta.changes) return false;
  await afterTomb(db, playerId, id, nowS, 'fell');
  return true;
}

/** @param {any} db @param {string} playerId @param {string} id @param {number} atS @param {'fell'|'retired'} why */
// Each step is its own idempotent write, so a retried tombstone finishes what a lost answer left undone.
async function afterTomb(db, playerId, id, atS, why) {
  if (why === 'fell') await endUnionsOf(db, id, atS, 'died').run();
  await db.batch(releaseSteps(db, id, atS));
  await guildMemberDead(db, playerId, id);
  await db.prepare('DELETE FROM realm_wed_halves WHERE player = ? AND char_id = ?').bind(playerId, id).run();
}

export const REZ_SETTLE_MAX = 25;

/** @param {any} db @param {string} playerId @param {string} id @param {number} deadAt */
async function settleHeld(db, playerId, id, deadAt) {
  const took = await db.prepare('UPDATE realm_characters SET rez_lease = NULL WHERE id = ? AND player = ? AND rez_lease IS NOT NULL AND dead_at IS NOT NULL').bind(id, playerId).run();
  if (!took.meta.changes) return false;
  await afterTomb(db, playerId, id, deadAt, 'fell');
  return true;
}

/** @param {{ db: any, nowS: number, budget?: () => boolean }} ctx */
export async function settleHolds({ db, nowS, budget = () => true }) {
  const r = await db.prepare('SELECT id, player, dead_at FROM realm_characters WHERE rez_lease IS NOT NULL AND dead_at <= ? LIMIT ?')
    .bind(nowS - REZ_HOLD_S, REZ_SETTLE_MAX).all();
  let n = 0;
  for (const row of r?.results ?? []) {
    if (n && !budget()) break;
    // afterTomb runs before the claim, so a firing cut short leaves the row held for the next minute to finish.
    await afterTomb(db, row.player, row.id, row.dead_at, 'fell');
    const took = await db.prepare('UPDATE realm_characters SET rez_lease = NULL WHERE id = ? AND player = ? AND rez_lease IS NOT NULL AND dead_at = ?').bind(row.id, row.player, row.dead_at).run();
    if (took.meta.changes) n++;
  }
  return n;
}

/** @param {any} ctx @param {string} playerId @param {{ id: unknown, lease: unknown, diedAt: unknown }} at */
export async function realmRaise({ db, nowS }, playerId, { id, lease, diedAt }) {
  if (typeof id !== 'string' || !REALM_CHARACTER_RE.test(id) || typeof lease !== 'string' || !/^[0-9a-f]{32}$/.test(lease)) return { error: 'body' };
  if (!Number.isSafeInteger(diedAt) || /** @type {number} */ (diedAt) < 0) return { error: 'body' };
  const at = /** @type {number} */ (diedAt);
  const row = await db.prepare('SELECT dead_at, lease, rez_lease, lineage_id, person_id FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (!row.lineage_id || !Number.isSafeInteger(row.person_id)) return { error: 'raise-no-line' };
  if (row.dead_at == null) {
    if (row.lease !== lease) return { error: 'not-dead' };
    return (await reviveOnLine(db, playerId, row.lineage_id, row.person_id, at, nowS)) === 'stamped' ? { ok: true, held: false } : { error: 'not-dead' };
  }
  // Every condition is asked in the write, so a close or a join between the read and here wins.
  const took = await db.prepare('UPDATE realm_characters SET dead_at = NULL, dead_why = NULL, lease = rez_lease, rez_lease = NULL, lease_at = ?1, updated_at = ?1'
    + ' WHERE id = ?2 AND player = ?3 AND rez_lease = ?4 AND dead_at > ?5'
    + ' AND NOT EXISTS (SELECT 1 FROM realm_characters o WHERE o.player = ?3 AND o.id != ?2 AND o.lease IS NOT NULL)')
    .bind(nowS, id, playerId, lease, nowS - REZ_HOLD_S).run();
  if (!took.meta.changes) return { error: row.rez_lease == null || row.dead_at <= nowS - REZ_HOLD_S ? 'raise-late' : 'lease' };
  await reviveOnLine(db, playerId, row.lineage_id, row.person_id, at, nowS);
  return { ok: true, held: true };
}

/** @param {any} db @param {string} playerId @param {string} lineageId @param {number} personId
 * @param {number} diedAt @param {number} nowS */
async function reviveOnLine(db, playerId, lineageId, personId, diedAt, nowS) {
  const line = await db.prepare('SELECT rev, record FROM lineages WHERE player = ? AND id = ?').bind(playerId, lineageId).first();
  const rec = line ? parsed(line.record) : null;
  const p = (rec?.people ?? []).find((/** @type {any} */ x) => x?.id === personId);
  if (!p) return null;
  if (revivedOf(p).includes(diedAt)) return 'had';
  stampRevived(p, diedAt);
  dropRevived(rec);
  rec.rev = (Number(line.rev) || 0) + 1;
  const moved = await db.prepare('UPDATE lineages SET record = ?, rev = ?, updated_at = ? WHERE player = ? AND id = ? AND rev = ?')
    .bind(JSON.stringify(rec), rec.rev, nowS, playerId, lineageId, line.rev).run();
  return moved.meta.changes ? 'stamped' : null;
}

export const WED_SID_RE = /^[A-Za-z0-9]{6,16}$/;
export const WED_HALF_LIFE_S = 300;
export const WED_FACE_MAX = 999;

/** @param {any} db @param {string} playerId @param {string} charId */
export async function wedCardOf(db, playerId, charId) {
  const row = await db.prepare('SELECT r.name AS name, r.person_id AS person, l.record AS record FROM realm_characters r'
    + ' LEFT JOIN lineages l ON l.player = r.player AND l.id = r.lineage_id WHERE r.id = ? AND r.player = ?').bind(charId, playerId).first();
  if (!row) return null;
  const p = (parsed(row.record ?? '')?.people ?? []).find((/** @type {any} */ x) => x?.id === row.person) ?? {};
  const name = String(row.name ?? '').trim();
  return {
    name: name && name.split(/\s+/).every((w) => checkName(w).ok) ? name : '',
    house: row.record ? houseOn(row.record, row.person) : null,
    gender: p.gender === 'female' ? 'female' : 'male',
    race: typeof p.race === 'string' && /^[A-Za-z][A-Za-z ]{0,23}$/.test(p.race) ? p.race : null,
    face: Number.isSafeInteger(p.face) && p.face >= 0 && p.face <= WED_FACE_MAX ? p.face : 0,
  };
}

const unionView = (/** @type {any} */ u, /** @type {string} */ playerId) => {
  const mine = u.a_player === playerId;
  const myChar = mine ? u.a_char : u.b_char;
  const card = parsed((mine ? u.b_card : u.a_card) ?? '') ?? {};
  return {
    sid: u.sid, mine: myChar,
    partner: {
      player: mine ? u.b_player : u.a_player, char: mine ? u.b_char : u.a_char,
      name: String(card.name ?? ''), house: card.house ?? null, gender: card.gender === 'female' ? 'female' : 'male', race: card.race ?? null, face: card.face ?? 0,
    },
    at: u.wed_at, endedAt: u.ended_at ?? null, endedWhy: u.ended_why ?? null,
    endedBy: u.ended_at == null ? null : u.ended_by === myChar ? 'mine' : 'partner',
  };
};
const openUnionOf = (/** @type {any} */ db, /** @type {string} */ charId) =>
  db.prepare('SELECT 1 FROM realm_unions WHERE ended_at IS NULL AND (a_char = ? OR b_char = ?)').bind(charId, charId).first();

/** @param {any} ctx @param {string} playerId
 * @param {{ id: unknown, lease: unknown, sid: unknown, partner: unknown, partnerChar?: unknown, withdraw?: unknown }} at */
export async function realmWed({ db, nowS }, playerId, { id, lease, sid, partner, partnerChar, withdraw = false }) {
  if (typeof id !== 'string' || !REALM_CHARACTER_RE.test(id) || typeof lease !== 'string' || !/^[0-9a-f]{32}$/.test(lease)) return { error: 'body' };
  if (typeof sid !== 'string' || !WED_SID_RE.test(sid) || typeof partner !== 'string' || !ID_RE.test(partner) || partner === playerId) return { error: 'body' };
  if (typeof partnerChar !== 'string' || !REALM_CHARACTER_RE.test(partnerChar) || typeof withdraw !== 'boolean') return { error: 'body' };
  const mineOf = (/** @type {any} */ u) => (u.a_player === playerId && u.a_char === id) || (u.b_player === playerId && u.b_char === id);
  if (withdraw) {
    await db.prepare('DELETE FROM realm_wed_halves WHERE sid = ? AND player = ?').bind(sid, playerId).run();
    const u = await db.prepare('SELECT * FROM realm_unions WHERE sid = ?').bind(sid).first();
    return u && mineOf(u) ? { ok: true, wed: true, union: unionView(u, playerId) } : { ok: true, wed: false };
  }
  const had = await db.prepare('SELECT * FROM realm_unions WHERE sid = ?').bind(sid).first();
  if (had) return mineOf(had) ? { ok: true, wed: true, union: unionView(had, playerId) } : { error: 'wed-spent' };
  const me = await db.prepare('SELECT lease, dead_at, lineage_id FROM realm_characters WHERE id = ? AND player = ?').bind(id, playerId).first();
  if (!me) return { error: 'no-realm-character' };
  if (me.dead_at != null) return { error: 'dead' };
  if (me.lease !== lease) return { error: 'lease' };
  if (!me.lineage_id) return { error: 'wed-no-line' };
  if (await openUnionOf(db, id)) return { error: 'wed-already' };
  await db.prepare('DELETE FROM realm_wed_halves WHERE at < ? OR (player = ? AND sid != ?)').bind(nowS - WED_HALF_LIFE_S, playerId, sid).run();
  await db.prepare('INSERT INTO realm_wed_halves (sid, player, char_id, partner, partner_char, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (sid, player) DO NOTHING')
    .bind(sid, playerId, id, partner, partnerChar, nowS).run();
  const own = await db.prepare('SELECT char_id, partner, partner_char FROM realm_wed_halves WHERE sid = ? AND player = ?').bind(sid, playerId).first();
  if (!own || own.char_id !== id || own.partner !== partner || own.partner_char !== partnerChar) return { error: 'wed-spent' };
  const other = await db.prepare('SELECT char_id, partner_char FROM realm_wed_halves WHERE sid = ? AND player = ? AND partner = ?').bind(sid, partner, playerId).first();
  if (!other) return { ok: true, wed: false };
  if (other.char_id !== partnerChar || other.partner_char !== id) return { error: 'wed-partner' };
  const them = await db.prepare('SELECT 1 FROM realm_characters WHERE id = ? AND player = ? AND dead_at IS NULL AND lineage_id IS NOT NULL').bind(other.char_id, partner).first();
  if (!them) return { error: 'wed-partner' };
  const [theirCard, myCard] = await Promise.all([wedCardOf(db, partner, other.char_id), wedCardOf(db, playerId, id)]);
  // The INSERT checks for an open union and for the partner's half.
  // Two halves posting at once make one union, and a withdrawn half makes none.
  await db.prepare(
    'INSERT OR IGNORE INTO realm_unions (sid, a_player, a_char, b_player, b_char, a_card, b_card, wed_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?'
    + ' WHERE NOT EXISTS (SELECT 1 FROM realm_unions WHERE ended_at IS NULL AND (a_char IN (?, ?) OR b_char IN (?, ?)))'
    + ' AND EXISTS (SELECT 1 FROM realm_wed_halves WHERE sid = ? AND player = ? AND char_id = ? AND partner_char = ?)',
  ).bind(sid, partner, other.char_id, playerId, id, JSON.stringify(theirCard), JSON.stringify(myCard), nowS, id, other.char_id, id, other.char_id,
    sid, partner, other.char_id, id).run();
  const now = await db.prepare('SELECT * FROM realm_unions WHERE sid = ?').bind(sid).first();
  if (!now) {
    if (await openUnionOf(db, id)) return { error: 'wed-already' };
    return (await db.prepare('SELECT 1 FROM realm_wed_halves WHERE sid = ? AND player = ?').bind(sid, partner).first()) ? { error: 'wed-partner' } : { ok: true, wed: false };
  }
  await db.prepare('DELETE FROM realm_wed_halves WHERE sid = ?').bind(sid).run();
  return { ok: true, wed: true, union: unionView(now, playerId) };
}

export async function listUnions({ db }, /** @type {string} */ playerId) {
  const r = await db.prepare('SELECT * FROM realm_unions WHERE a_player = ? OR b_player = ? ORDER BY COALESCE(ended_at, wed_at) DESC, wed_at DESC LIMIT 50')
    .bind(playerId, playerId).all();
  return (r?.results ?? []).map((/** @type {any} */ u) => unionView(u, playerId));
}

export const endUnionsOf = (/** @type {any} */ db, /** @type {string} */ id, /** @type {number} */ nowS, /** @type {'died'|'gone'} */ why) =>
  db.prepare('UPDATE realm_unions SET ended_at = ?, ended_why = ?, ended_by = ? WHERE ended_at IS NULL AND (a_char = ? OR b_char = ?)').bind(nowS, why, id, id, id);
