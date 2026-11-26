// @ts-check

import { isDeveloper } from './titles.js';
import { REALM_ID_RE, LEASE_RE } from './realm.js';
import {
  ROLL_FACTIONS, ROLL_EVENTS_KEEP_S, chaptersSwitchOf, rollRidOf, rollSeedOk, rollDeltasOk, rollMembersOk, rollSeedCapOf, rollSeedOf,
  rollCredit, rollDrain, rollBookRankOf, joinRecordable, ROLL_CLAIMS_HOUR,
} from '../../src/net/npcChapterLaw.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { overRate } from './accounts.js';

export function chaptersOpenFor(/** @type {any} */ player, /** @type {any} */ env) {
  const s = chaptersSwitchOf(env?.CHAPTERS_OPEN);
  return s === 'on' || (s === 'dev' && isDeveloper(player, env));
}

// HELD_SQL repeats the lease and death checks inside the write, so a change after the read moves nothing.
const HELD_SQL = 'EXISTS (SELECT 1 FROM realm_characters WHERE id = ? AND player = ? AND lease = ? AND dead_at IS NULL)';
// The first statement of a write sets a fresh head tag and later statements run only under it,
// so a write that lost a race writes nothing.
const TAGGED_SQL = 'EXISTS (SELECT 1 FROM npc_roll_heads WHERE char_id = ? AND tag = ?)';

function mintTag(/** @type {((b: Uint8Array) => Uint8Array) | undefined} */ rand) {
  const draw = rand ?? ((b) => globalThis.crypto.getRandomValues(b));
  let out = '';
  for (const x of draw(new Uint8Array(8))) out += x.toString(16).padStart(2, '0');
  return out;
}

async function heldUnder(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {unknown} */ character, /** @type {unknown} */ lease) {
  if (typeof character !== 'string' || !REALM_ID_RE.test(character) || typeof lease !== 'string' || !LEASE_RE.test(lease)) return { error: 'body' };
  const row = await db.prepare('SELECT lease, created_at, dead_at, origin_id, bytes FROM realm_characters WHERE id = ? AND player = ?').bind(character, playerId).first();
  if (!row) return { error: 'no-realm-character' };
  if (row.dead_at != null) return { error: 'dead' };
  if (row.lease !== lease) return { error: 'lease' };
  if (!(Number(row.bytes) > 0)) return { error: 'no-data' };
  return { createdAt: Number(row.created_at), origin: row.origin_id ?? null };
}

/**
 * @typedef {{ rep: number, gainedDay: number, gained: number, owed: number, member: boolean, rank: number | null, joinedAt: number | null, dormant: boolean }} RollRow
 */
async function rowsOf(/** @type {any} */ db, /** @type {string} */ character) {
  return rowsFrom((await rowsRead(db, character).all())?.results ?? []);
}
const rowsRead = (/** @type {any} */ db, /** @type {string} */ character) => db.prepare('SELECT faction_id, rep, gained_day, gained, owed, member, rank, joined_at, dormant FROM npc_roll WHERE char_id = ?').bind(character);
function rowsFrom(/** @type {any[]} */ results) {
  /** @type {Map<number, RollRow>} */
  const rows = new Map();
  for (const x of results) {
    rows.set(Number(x.faction_id), {
      rep: Number(x.rep), gainedDay: Number(x.gained_day), gained: Number(x.gained), owed: Number(x.owed),
      member: !!x.member, rank: x.rank == null ? null : Number(x.rank), joinedAt: x.joined_at == null ? null : Number(x.joined_at),
      dormant: !!x.dormant,
    });
  }
  return rows;
}

function viewOf(/** @type {number} */ seq, /** @type {Map<number, RollRow>} */ rows) {
  /** @type {Record<number, number>} */
  const factions = {};
  /** @type {Record<number, number>} */
  const owed = {};
  const members = [];
  for (const f of [...rows.keys()].sort((a, b) => a - b)) {
    const row = /** @type {RollRow} */ (rows.get(f));
    factions[f] = row.rep;
    if (row.owed > 0) owed[f] = row.owed;
    if (row.member) members.push({ f, rank: row.rank ?? 0, since: row.joinedAt, ...(row.dormant ? { d: 1 } : {}) });
  }
  return { seq, factions, owed, members };
}

export async function rollViewOf(/** @type {any} */ db, /** @type {string} */ character) {
  const head = await db.prepare('SELECT kseq FROM npc_roll_heads WHERE char_id = ?').bind(character).first();
  return head ? viewOf(Number(head.kseq), await rowsOf(db, character)) : null;
}

const rowWrite = (/** @type {any} */ db, /** @type {string} */ character, /** @type {number} */ f, /** @type {RollRow} */ r, /** @type {string} */ tag) =>
  db.prepare(`UPDATE npc_roll SET rep = ?, gained_day = ?, gained = ?, owed = ?, member = ?, rank = ?, joined_at = ?, dormant = ? WHERE char_id = ? AND faction_id = ? AND ${TAGGED_SQL}`)
    .bind(r.rep, r.gainedDay, r.gained, r.owed, r.member ? 1 : 0, r.rank, r.joinedAt, r.dormant ? 1 : 0, character, f, character, tag);
// The client sees `kseq`, and only a claim that credits lines the client sent moves it. Service credits such as a
// drain or a hall writ move `seq` only, so a tab's adopted Roll stays valid.
const headWrite = (/** @type {any} */ db, /** @type {{ character: string, player: string, lease: string }} */ who, /** @type {number} */ seq,
  /** @type {string} */ tag, /** @type {number} */ nowS, /** @type {string | null} */ rid = null, claimed = false) =>
  db.prepare(`UPDATE npc_roll_heads SET seq = seq + 1, kseq = kseq + ?, tag = ?, last_rid = COALESCE(?, last_rid), updated_at = ? WHERE char_id = ? AND seq = ? AND ${HELD_SQL}`)
    .bind(claimed ? 1 : 0, tag, rid, nowS, who.character, seq, who.character, who.player, who.lease);
const same = (/** @type {RollRow} */ a, /** @type {RollRow} */ b) => a.rep === b.rep && a.gainedDay === b.gainedDay && a.gained === b.gained
  && a.owed === b.owed && a.member === b.member && a.rank === b.rank && a.joinedAt === b.joinedAt && a.dormant === b.dormant;

/**
 * @param {{ db: any, nowS: number, rand?: (b: Uint8Array) => Uint8Array }} ctx @param {{ id: string }} player
 * @param {any} body
 */
export async function readRoll({ db, nowS, rand }, player, body) {
  if (!Number.isSafeInteger(nowS)) throw new TypeError('readRoll needs an integer epoch-seconds clock');
  const held = await heldUnder(db, player.id, body?.character, body?.lease);
  if ('error' in held) return held;
  const who = { character: /** @type {string} */ (body.character), player: player.id, lease: /** @type {string} */ (body.lease) };
  const head = await db.prepare('SELECT seq, kseq FROM npc_roll_heads WHERE char_id = ?').bind(who.character).first();
  if (head) {
    const seq = Number(head.seq), kseq = Number(head.kseq);
    const rows = await rowsOf(db, who.character);
    const day = utcDay(nowS);
    /** @type {Array<[number, RollRow]>} */
    const paid = [];
    /** @type {Record<number, number>} */
    const drained = {};
    for (const [f, row] of rows) {
      if (!(row.owed > 0)) continue;
      const d = rollDrain(row, day);
      if (d.credited !== 0 || d.owed !== row.owed) paid.push([f, { ...row, rep: d.rep, gainedDay: d.gainedDay, gained: d.gained, owed: d.owed }]);
      if (d.credited > 0) drained[f] = d.credited;
    }
    if (!paid.length) return { roll: viewOf(kseq, rows), from: kseq, paid: drained };
    const tag = mintTag(rand);
    const [moved] = await db.batch([headWrite(db, who, seq, tag, nowS), ...paid.map(([f, r]) => rowWrite(db, who.character, f, r, tag))]);
    if (!moved?.meta?.changes) {
      const why = await heldUnder(db, player.id, who.character, who.lease);
      return 'error' in why ? why : { error: 'roll-busy' };
    }
    for (const [f, r] of paid) rows.set(f, r);
    return { roll: viewOf(kseq, rows), from: kseq, paid: drained };
  }
  const seed = body?.seed;
  if (seed == null) return { roll: null };
  if (!rollSeedOk(seed?.factions) || !(seed?.members === null || rollMembersOk(seed?.members))) return { error: 'roll-seed' };
  const cap = rollSeedCapOf(held);
  /** @type {Map<number, number>} */
  const reported = new Map((seed.members ?? []).map((/** @type {{ f: number, rank: number }} */ m) => [m.f, m.rank]));
  const asleep = new Set((seed.members ?? []).filter((/** @type {any} */ m) => m.d === 1).map((/** @type {any} */ m) => m.f));
  const values = rollSeedOf(seed.factions, cap, reported);
  const tag = mintTag(rand);
  /** @type {Map<number, RollRow>} */
  const rows = new Map();
  for (const f of ROLL_FACTIONS) {
    const member = reported.has(f);
    rows.set(f, {
      rep: values[f], gainedDay: 0, gained: 0, owed: 0, member,
      rank: member ? rollBookRankOf(reported.get(f), values[f]) : null, joinedAt: member ? nowS : null,
      dormant: member && asleep.has(f),
    });
  }
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO npc_roll_heads (char_id, player, cap, seq, last_rid, tag, seeded_at, updated_at) SELECT ?, ?, ?, 0, NULL, ?, ?, ? WHERE ${HELD_SQL}`)
      .bind(who.character, player.id, cap, tag, nowS, nowS, who.character, who.player, who.lease),
    ...[...rows].map(([f, r]) => db.prepare(
      `INSERT OR IGNORE INTO npc_roll (char_id, faction_id, player, rep, gained_day, gained, owed, member, rank, joined_at, dormant) SELECT ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ? WHERE ${TAGGED_SQL}`,
    ).bind(who.character, f, player.id, r.rep, r.member ? 1 : 0, r.rank, r.joinedAt, r.dormant ? 1 : 0, who.character, tag)),
  ]);
  const after = await db.prepare('SELECT tag FROM npc_roll_heads WHERE char_id = ?').bind(who.character).first();
  if (!after) {
    const why = await heldUnder(db, player.id, who.character, who.lease);
    return 'error' in why ? why : { error: 'roll-busy' };
  }
  if (after.tag === tag) return { roll: viewOf(0, rows), from: 0, seeded: true };
  const won = await rollViewOf(db, who.character);
  return { roll: won, from: won?.seq ?? 0 };
}

// Derived from the claim id, so a repeated claim draws the same roll.
const claimRollOf = (/** @type {string} */ rid, /** @type {number} */ f) => (((parseInt(rid.slice(0, 8), 16) ^ Math.imul(f, 0x9e3779b1)) >>> 0) % 10_000) / 10_000;

export async function claimRoll({ db, nowS, rand }, player, body) {
  if (!Number.isSafeInteger(nowS)) throw new TypeError('claimRoll needs an integer epoch-seconds clock');
  const held = await heldUnder(db, player.id, body?.character, body?.lease);
  if ('error' in held) return held;
  const who = { character: /** @type {string} */ (body.character), player: player.id, lease: /** @type {string} */ (body.lease) };
  const rid = rollRidOf(body?.rid);
  const deltas = body?.deltas ?? {};
  const empty = deltas && typeof deltas === 'object' && !Array.isArray(deltas) && Object.keys(deltas).length === 0;
  const members = body?.members;
  if (!rid || !(empty || rollDeltasOk(deltas)) || !(members === null || rollMembersOk(members))) return { error: 'roll-claim' };
  if (await overRate({ db, nowS }, `roll-claim:${who.character}`, ROLL_CLAIMS_HOUR, 3600)) return { error: 'roll-rate' };
  const [headQ, rowsQ, takenQ] = await db.batch([
    db.prepare('SELECT seq, kseq, last_rid FROM npc_roll_heads WHERE char_id = ? AND player = ?').bind(who.character, player.id),
    rowsRead(db, who.character),
    db.prepare('SELECT 1 FROM npc_rep_events WHERE char_id = ? AND rid = ? LIMIT 1').bind(who.character, rid),
  ]);
  const head = headQ?.results?.[0] ?? null;
  if (!head) return { error: 'roll-unseeded' };
  const seq = Number(head.seq), kseq = Number(head.kseq);
  const rows = rowsFrom(rowsQ?.results ?? []);
  // Any id the record still holds is a repeat, so an older claim replayed after a newer one is one too.
  const taken = head.last_rid === rid || !!takenQ?.results?.[0];
  if (taken) return { roll: viewOf(kseq, rows), repeat: true };
  const day = utcDay(nowS);
  /** @type {Map<number, number> | null} */
  const ranks = members === null ? null : new Map(members.map((/** @type {{ f: number, rank: number }} */ m) => [m.f, m.rank]));
  const asleep = new Set((members ?? []).filter((/** @type {any} */ m) => m.d === 1).map((/** @type {any} */ m) => m.f));
  /** @type {Record<number, number>} */
  const credited = {};
  /** @type {Record<number, number>} */
  const drained = {};
  /** @type {Array<[number, RollRow, number]>} */
  const changed = [];
  for (const [f, row] of rows) {
    let line = row;
    if (row.owed > 0) {
      const d = rollDrain(line, day);
      line = { ...line, rep: d.rep, gainedDay: d.gainedDay, gained: d.gained, owed: d.owed };
      if (d.credited > 0) drained[f] = d.credited;
    }
    const asked = Number(deltas[f] ?? 0);
    if (asked) {
      const c = rollCredit(line, asked, day, claimRollOf(rid, f));
      credited[f] = c.credited;
      line = { ...line, rep: c.rep, gainedDay: c.gainedDay, gained: c.gained, owed: c.owed };
    }
    if (ranks) {
      const member = ranks.has(f) && (row.member || joinRecordable(Math.max(row.rep + row.owed, line.rep + line.owed), f));
      line = {
        ...line, member,
        rank: member ? rollBookRankOf(ranks.get(f), line.rep) : null,
        joinedAt: member ? (row.member ? row.joinedAt : nowS) : null,
        dormant: member && asleep.has(f),
      };
    } else if (line.member && line.rank != null && line.rank > rollBookRankOf(line.rank, line.rep)) {
      line = { ...line, rank: rollBookRankOf(line.rank, line.rep) };
    }
    if (!same(line, row)) changed.push([f, line, asked]);
  }
  if (!changed.length) return { roll: viewOf(kseq, rows), credited, paid: drained };
  const tag = mintTag(rand);
  const lines = changed.filter(([, , asked]) => asked);
  // Every claim that writes leaves its id in the record, with a faction 0 line when it moved no reputation.
  const record = lines.length ? lines.map(([f, , asked]) => [f, asked, credited[f]]) : [[0, 0, 0]];
  const [moved] = await db.batch([
    headWrite(db, who, seq, tag, nowS, rid, lines.length > 0),
    ...changed.map(([f, r]) => rowWrite(db, who.character, f, r, tag)),
    ...record.map(([f, asked, cr]) => db.prepare(`INSERT INTO npc_rep_events (char_id, player, faction_id, asked, credited, rid, at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${TAGGED_SQL}`)
      .bind(who.character, player.id, f, asked, cr, rid, nowS, who.character, tag)),
    db.prepare(`DELETE FROM npc_rep_events WHERE char_id = ? AND at < ? AND ${TAGGED_SQL}`).bind(who.character, nowS - ROLL_EVENTS_KEEP_S, who.character, tag),
  ]);
  if (!moved?.meta?.changes) {
    const why = await heldUnder(db, player.id, who.character, who.lease);
    if ('error' in why) return why;
    const now = await db.prepare('SELECT seq, last_rid FROM npc_roll_heads WHERE char_id = ?').bind(who.character).first();
    if (now?.last_rid === rid) return { roll: await rollViewOf(db, who.character), repeat: true };
    return { error: 'roll-busy' };
  }
  for (const [f, r] of changed) rows.set(f, r);
  return { roll: viewOf(kseq + (lines.length > 0 ? 1 : 0), rows), credited, paid: drained };
}
