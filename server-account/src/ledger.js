// @ts-check

import { JUDGE_VERSION } from './judge.js';
import { rehomedPrint } from '../../src/items/lootRarity.js';
import { LOCKED_SAID_MAX } from '../../src/net/realmTradeLaw.js';

export const DUPE_GRACE_S = 750;
// D1 binds at most 100 parameters per statement, which bounds UID_CHUNK, UPSERT_ROWS, and DUPE_ROWS.
export const UID_CHUNK = 90;
export const UPSERT_ROWS = 48;
export const DUPE_ROWS = 16;
export const LEDGER_NEW_MAX = 960;
export const LEDGER_KEYS_MAX = 6000;
export const SEIZED = 'seized';

const marks = (/** @type {number} */ n, /** @type {number} */ from) => Array.from({ length: n }, (_, i) => `?${from + i}`).join(', ');
const chunks = (/** @type {any[]} */ list, /** @type {number} */ n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));

/**
 * @param {any} db @param {{ player: string, char: string, seq: number, nowS: number }} at
 * @param {[string, string][]} rows @param {string} onConflict
 */
function insertSteps(db, { player, char, seq, nowS }, rows, onConflict) {
  return chunks(rows, UPSERT_ROWS).map((part) => db.prepare(
    `INSERT INTO item_uids (uid, player, char_id, seen_seq, state, fp, at) VALUES ${part.map((_, i) => `(?${5 + 2 * i}, ?1, ?2, ?3, 'held', ?${6 + 2 * i}, ?4)`).join(', ')} ${onConflict}`,
  ).bind(player, char, seq, nowS, ...part.flat()));
}
const overKeys = (/** @type {any} */ db, /** @type {string[]} */ keys, /** @type {any[]} */ binds, /** @type {(m: string) => string} */ sql) =>
  chunks(keys, UID_CHUNK).map((part) => db.prepare(sql(marks(part.length, binds.length + 1))).bind(...binds, ...part));

export const ledgerReads = (/** @type {any} */ db, /** @type {string} */ char) => [
  db.prepare('SELECT uid, char_id, state, fp, claim_char, claim_at, at FROM item_uids WHERE char_id = ?1 OR claim_char = ?1').bind(char),
  db.prepare('SELECT uid FROM item_dupes WHERE char_id = ?').bind(char),
];

/**
 * @param {any} db @param {{ player: string, char: string, seq: number, nowS: number }} at
 * @param {{ key: string, fp: string }[]} pieces @param {{ mine: any, dupes: any } | null} [known]
 */
export async function ledgerStep(db, at, pieces, known = null) {
  const { char, nowS } = at;
  /** @type {any[]} */
  const steps = [];
  const present = new Set(pieces.map((p) => p.key));
  /** @type {Map<string, { fp: string, n: number }>} */
  const shown = new Map();
  for (const p of pieces) {
    const s = shown.get(p.key);
    if (s) s.n++;
    else if (shown.size < LEDGER_KEYS_MAX) shown.set(p.key, { fp: p.fp, n: 1 });
  }
  /** @type {Map<string, any>} */
  const rows = new Map();
  const [mineRead, dupesRead] = known ? [null, null] : ledgerReads(db, char);
  const mine = known ? known.mine : await mineRead.all();
  for (const r of mine?.results ?? []) rows.set(r.uid, r);
  const copiesKnown = new Set(((known ? known.dupes : await dupesRead.all())?.results ?? []).map((/** @type {any} */ r) => r.uid));
  for (const part of chunks([...shown.keys()].filter((k) => !rows.has(k) && !copiesKnown.has(k)), UID_CHUNK)) {
    const r = await db.prepare(`SELECT uid, char_id, state, fp, claim_char, claim_at, at FROM item_uids WHERE uid IN (${marks(part.length, 1)})`).bind(...part).all();
    for (const row of r?.results ?? []) rows.set(row.uid, row);
  }
  /** @type {[string, string][]} */
  const fresh = [];
  /** @type {string[]} */
  const copies = [], forged = [], claim = [], takeUp = [], letGo = [], moveOn = [], withdraw = [];
  /** @type {[string, string, string][]} */
  const reprint = [];
  /** @type {Map<string, string[]>} */
  const proven = new Map();
  for (const [key, { fp, n }] of shown) {
    if (copiesKnown.has(key)) continue;
    const r = rows.get(key);
    if (r && r.fp !== fp) {
      if (!rehomedPrint(r.fp, fp)) { forged.push(key); continue; }
      reprint.push([key, fp, r.fp]);
    }
    if (r && r.state === 'escrow' && r.char_id === SEIZED) { copies.push(key); continue; }
    if (n > 1) { copies.push(key); if (!r) fresh.push([key, fp]); continue; }
    if (!r) { if (fresh.length < LEDGER_NEW_MAX) fresh.push([key, fp]); continue; }
    if (r.char_id === char && r.state === 'held') {
      if (r.claim_char && r.claim_char !== char && nowS - r.claim_at >= DUPE_GRACE_S) proven.set(r.claim_char, [...(proven.get(r.claim_char) ?? []), key]);
      continue;
    }
    if (r.state === 'gone') { takeUp.push(key); continue; }
    if (r.claim_char == null) claim.push(key);
  }
  for (const r of rows.values()) {
    if (present.has(r.uid)) continue;
    if (r.char_id === char && r.state === 'held') (r.claim_char && r.claim_char !== char ? moveOn : letGo).push(r.uid);
    else if (r.claim_char === char) withdraw.push(r.uid);
  }
  /** @type {Map<string, string[]>} */
  const upheld = new Map();
  const crafted = [...proven.values()].flat();
  if (crafted.length) {
    const owners = new Map();
    for (const part of chunks(crafted, UID_CHUNK)) {
      const r = await db.prepare(`SELECT p.provenance, c.id AS claimant FROM products p JOIN item_uids u ON u.uid = p.provenance JOIN realm_characters c ON c.id = u.claim_char
        WHERE p.provenance IN (${marks(part.length, 1)}) AND ${CRAFT_RECORD_SQL} = c.player AND ${CRAFT_RECORD_SQL} != ?${part.length + 1}
          AND p.owner != ?${part.length + 1}`).bind(...part, at.player).all();
      for (const row of r?.results ?? []) owners.set(row.provenance, row.claimant);
    }
    for (const [claimant, keys] of proven) {
      const theirs = keys.filter((k) => owners.get(k) === claimant);
      if (!theirs.length) continue;
      upheld.set(claimant, theirs);
      const left = keys.filter((k) => !theirs.includes(k));
      if (left.length) proven.set(claimant, left); else proven.delete(claimant);
    }
  }
  steps.push(...insertSteps(db, at, fresh, 'ON CONFLICT (uid) DO NOTHING'));
  for (const [key, fp, was] of reprint) steps.push(db.prepare('UPDATE item_uids SET fp = ?2 WHERE uid = ?1 AND fp = ?3').bind(key, fp, was));
  if (copies.length) steps.push(...copyRows(db, copies, char, nowS, 'twice', (k) => { const r = rows.get(k); return { first: r ? r.char_id || null : char, firstAt: r ? r.at : nowS, claimant: char, claimAt: nowS, fp: shown.get(k)?.fp ?? null }; }));
  steps.push(...overKeys(db, claim, [char, nowS], (m) => `UPDATE item_uids SET claim_char = ?1, claim_at = ?2 WHERE uid IN (${m}) AND claim_char IS NULL`));
  steps.push(...overKeys(db, takeUp, [at.player, char, at.seq, nowS], (m) => `UPDATE item_uids SET player = ?1, char_id = ?2, seen_seq = ?3, state = 'held', claim_char = NULL, claim_at = NULL, at = ?4 WHERE uid IN (${m}) AND state = 'gone'`));
  steps.push(...overKeys(db, moveOn, [char, nowS], (m) => `UPDATE item_uids SET char_id = claim_char, player = COALESCE((SELECT c.player FROM realm_characters c WHERE c.id = item_uids.claim_char), player),
    claim_char = NULL, claim_at = NULL, at = ?2 WHERE uid IN (${m}) AND char_id = ?1`));
  steps.push(...letGoSteps(db, letGo, char, nowS));
  steps.push(...overKeys(db, withdraw, [char], (m) => `UPDATE item_uids SET claim_char = NULL, claim_at = NULL WHERE uid IN (${m}) AND claim_char = ?1`));
  let charged = 0;
  for (const [claimant, keys] of proven) {
    steps.push(...overKeys(db, keys, [claimant], (m) => `UPDATE item_uids SET claim_char = NULL, claim_at = NULL WHERE uid IN (${m}) AND claim_char = ?1`));
    steps.push(...copyRows(db, keys, claimant, nowS, 'claim', (k) => { const r = rows.get(k); return { first: char, firstAt: r?.at ?? null, claimant, claimAt: r?.claim_at ?? null, fp: r?.fp ?? null }; }),
      ...chargeSteps(db, claimant, keys, nowS, { strike: false }));
    charged += keys.length;
  }
  for (const [claimant, keys] of upheld) {
    steps.push(...overKeys(db, keys, [nowS], (m) => `UPDATE item_uids SET char_id = claim_char, player = COALESCE((SELECT c.player FROM realm_characters c WHERE c.id = item_uids.claim_char), player),
      claim_char = NULL, claim_at = NULL, at = ?1 WHERE uid IN (${m})`));
    steps.push(...copyRows(db, keys, char, nowS, 'craft', (k) => { const r = rows.get(k); return { first: char, firstAt: r?.at ?? null, claimant, claimAt: r?.claim_at ?? null, fp: r?.fp ?? null }; }));
    copies.push(...keys);
  }
  const locked = [...new Set([...[...shown.keys()].filter((k) => copiesKnown.has(k)), ...copies])].slice(0, LOCKED_SAID_MAX);
  return { steps, copies, forged, charged, locked };
}

const CRAFT_RECORD_SQL = 'COALESCE(p.handed_to, p.owner)';

/** @typedef {{ first: string | null, firstAt: number | null, claimant: string | null, claimAt: number | null, fp: string | null }} CopyWho */
const copyRows = (/** @type {any} */ db, /** @type {string[]} */ keys, /** @type {string} */ char, /** @type {number} */ nowS,
  /** @type {string | null} */ kind = null, /** @type {(k: string) => CopyWho | null} */ whoOf = () => null) =>
  chunks(keys, DUPE_ROWS).map((part) => db.prepare(`INSERT OR IGNORE INTO item_dupes (uid, char_id, at, kind, first_char, first_at, claimant, claim_at, fp) VALUES ${part.map((_, i) => { const o = 4 + 6 * i; return `(?${o}, ?1, ?2, ?3, ?${o + 1}, ?${o + 2}, ?${o + 3}, ?${o + 4}, ?${o + 5})`; }).join(', ')}`)
    .bind(char, nowS, kind, ...part.flatMap((k) => { const w = whoOf(k); return [k, w?.first ?? null, w?.firstAt ?? null, w?.claimant ?? null, w?.claimAt ?? null, w?.fp ?? null]; })));

/** @param {any} db @param {string} char @param {{ key: string, fp: string }[]} pieces */
export async function ownCopiesLiftable(db, char, pieces) {
  const fpOf = new Map(pieces.map((p) => [p.key, p.fp]));
  /** @type {string[]} */
  const out = [];
  for (const part of chunks([...fpOf.keys()], UID_CHUNK)) {
    const r = await db.prepare(`SELECT d.uid, u.fp FROM item_dupes d JOIN item_uids u ON u.uid = d.uid
      WHERE d.char_id = ?1 AND ${OWN_COPY_SQL} AND d.uid IN (${marks(part.length, 2)})`).bind(char, ...part).all();
    for (const row of r?.results ?? []) if (row.fp === fpOf.get(row.uid)) out.push(row.uid);
  }
  return out;
}
const OWN_COPY_SQL = `d.kind = 'twice' AND (d.trail_found IS NULL OR d.trail_found = 'innocent')
  AND u.char_id = ?1 AND u.state = 'held' AND u.claim_char IS NULL
  AND NOT EXISTS (SELECT 1 FROM item_dupes o WHERE o.uid = d.uid AND o.char_id != ?1)`;
const LIFTING_SQL = `SELECT d.uid AS uid FROM item_dupes d JOIN item_uids u ON u.uid = d.uid
  WHERE d.char_id = ?1 AND ${OWN_COPY_SQL} AND d.uid IN (SELECT value FROM json_each(?4))`;
// The finding and the DELETE ask OWN_COPY_SQL in the same batch, so a row that moved since the ask is not lifted.
export const ownCopyLiftSteps = (/** @type {any} */ db, /** @type {string} */ char, /** @type {string[]} */ keys, /** @type {number} */ nowS) => (!keys.length ? [] : [
  db.prepare(`INSERT INTO realm_findings (player, char_id, seq, at, law, kind, detail)
    SELECT c.player, c.id, c.seq, ?2, ?3, 'dupe', json_object('lifted', json((SELECT json_group_array(uid) FROM (SELECT uid FROM (${LIFTING_SQL}) LIMIT 40))), 'count', (SELECT COUNT(*) FROM (${LIFTING_SQL})))
    FROM realm_characters c WHERE c.id = ?1 AND EXISTS (${LIFTING_SQL})`).bind(char, nowS, JUDGE_VERSION, JSON.stringify(keys)),
  ...overKeys(db, keys, [char], (m) => `DELETE FROM item_dupes WHERE char_id = ?1 AND uid IN (${m}) AND EXISTS (SELECT 1 FROM item_dupes d JOIN item_uids u ON u.uid = d.uid
    WHERE d.uid = item_dupes.uid AND d.char_id = ?1 AND ${OWN_COPY_SQL})`),
]);

export const knownCopySteps = (/** @type {any} */ db, /** @type {string} */ char, /** @type {string[]} */ keys, /** @type {number} */ nowS) =>
  copyRows(db, keys, char, nowS, 'drop', () => ({ first: char, firstAt: null, claimant: null, claimAt: null, fp: null }));

/** @param {any} db @param {string} key @param {string | null} claim @param {number} nowS */
export function escrowSpentSteps(db, key, claim, nowS) {
  if (!claim) return [db.prepare("DELETE FROM item_uids WHERE uid = ?1 AND state = 'escrow' AND claim_char IS NULL").bind(key)];
  return [
    // This reads the claim time and print before the UPDATE below clears them.
    db.prepare(`INSERT OR IGNORE INTO item_dupes (uid, char_id, at, kind, first_char, first_at, claimant, claim_at, fp) VALUES (?1, ?2, ?3, 'escrow', NULL,
      (SELECT at FROM item_uids WHERE uid = ?1), ?2, (SELECT claim_at FROM item_uids WHERE uid = ?1), (SELECT fp FROM item_uids WHERE uid = ?1))`).bind(key, claim, nowS),
    ...chargeSteps(db, claim, [key], nowS, { strike: false }),
    db.prepare("UPDATE item_uids SET state = 'gone', claim_char = NULL, claim_at = NULL, at = ?3 WHERE uid = ?1 AND state = 'escrow' AND claim_char = ?2").bind(key, claim, nowS),
  ];
}

function letGoSteps(/** @type {any} */ db, /** @type {string[]} */ keys, /** @type {string} */ char, /** @type {number} */ nowS) {
  return [
    ...overKeys(db, keys, [char, nowS], (m) => `UPDATE item_uids SET state = 'gone', claim_char = NULL, claim_at = NULL, at = ?2
      WHERE uid IN (${m}) AND char_id = ?1 AND state = 'held' AND EXISTS (SELECT 1 FROM item_dupes d WHERE d.uid = item_uids.uid)`),
    ...overKeys(db, keys, [char], (m) => `DELETE FROM item_uids WHERE uid IN (${m}) AND char_id = ?1 AND state = 'held'`),
  ];
}

/**
 * @param {any} db @param {string} char @param {string[]} keys @param {number} nowS
 * @param {{ strike?: boolean }} [o]
 */
export function chargeSteps(db, char, keys, nowS, { strike = true } = {}) {
  return [
    ...(strike ? [db.prepare('UPDATE realm_characters SET dupes = dupes + 1 WHERE id = ?1').bind(char)] : []),
    db.prepare("INSERT INTO realm_findings (player, char_id, seq, at, law, kind, detail) SELECT player, id, seq, ?2, ?3, 'dupe', ?4 FROM realm_characters WHERE id = ?1")
      .bind(char, nowS, JUDGE_VERSION, JSON.stringify({ keys: keys.slice(0, 40), count: keys.length, ...(strike ? {} : { contested: true }) })),
  ];
}

// A batch that moves two records runs both `left` lists before either `entered`, so a piece lands where it went.
/**
 * @param {any} db @param {{ player: string, char: string, seq: number, nowS: number }} at
 * @param {{ key: string, fp: string }[]} before @param {{ key: string, fp: string }[]} after
 * @param {{ escrow?: boolean | Set<string>, from?: string | null }} [o]
 */
export function ledgerMoves(db, at, before, after, { escrow = false, from = null } = {}) {
  const was = new Map(before.map((p) => [p.key, p.fp]));
  const now = new Map(after.map((p) => [p.key, p.fp]));
  const gone = [...was.keys()].filter((k) => !now.has(k));
  /** @type {[string, string][]} */
  const came = [...now].filter(([k]) => !was.has(k));
  const held = escrow === true ? gone : escrow instanceof Set ? gone.filter((k) => escrow.has(k)) : [];
  const freed = gone.filter((k) => !held.includes(k));
  const left = [
    ...overKeys(db, held, [at.char, at.nowS], (m) => `UPDATE item_uids SET state = 'escrow', char_id = '', claim_char = NULL, claim_at = NULL, at = ?2 WHERE uid IN (${m}) AND char_id = ?1 AND state = 'held'`),
    ...letGoSteps(db, freed, at.char, at.nowS),
  ];
  const entered = [
    // This reads the escrow row of the piece before the insert below takes it over.
    ...overKeys(db, came.map(([k]) => k), [at.player, from], (m) => `UPDATE products SET handed_to = CASE WHEN owner = ?1 THEN NULL ELSE ?1 END
      WHERE provenance IN (${m}) AND handed_to IS NOT (CASE WHEN owner = ?1 THEN NULL ELSE ?1 END)
        AND COALESCE(handed_to, owner) = COALESCE(?2, (SELECT u.player FROM item_uids u WHERE u.uid = products.provenance AND u.state = 'escrow'))`),
    ...insertSteps(db, at, came, `ON CONFLICT (uid) DO UPDATE SET player = excluded.player, char_id = excluded.char_id, seen_seq = excluded.seen_seq,
      state = 'held', fp = excluded.fp, claim_char = CASE WHEN item_uids.claim_char = excluded.char_id THEN NULL ELSE item_uids.claim_char END,
      claim_at = CASE WHEN item_uids.claim_char = excluded.char_id THEN NULL ELSE item_uids.claim_at END, at = excluded.at`),
    ...overKeys(db, came.map(([k]) => k), [at.char], (m) => `DELETE FROM item_dupes WHERE char_id = ?1 AND uid IN (${m})`),
  ];
  return { left, entered };
}

// A key leaves whenever its count falls, so a record cannot hand on one of two copies of a locked key unseen.
/** @param {{ key: string }[]} before @param {{ key: string }[]} after */
export function leavingKeys(before, after) {
  const count = (/** @type {{ key: string }[]} */ ps) => { const m = new Map(); for (const p of ps) m.set(p.key, (m.get(p.key) ?? 0) + 1); return m; };
  const was = count(before), now = count(after);
  /** @type {string[]} */ const leaving = [], twice = [];
  for (const [k, n] of was) if ((now.get(k) ?? 0) < n) { leaving.push(k); if (n > 1) twice.push(k); }
  return { leaving, twice };
}

/** @param {any} db @param {string} char @param {string[]} keys */
export async function piecesRefusal(db, char, keys) {
  for (const part of chunks(keys, UID_CHUNK)) {
    const m = marks(part.length, 2);
    const copy = await db.prepare(`SELECT 1 FROM item_dupes WHERE char_id = ?1 AND uid IN (${m}) LIMIT 1`).bind(char, ...part).first();
    if (copy) return 'piece-dupe';
    const r = await db.prepare(`SELECT char_id, state, claim_char FROM item_uids WHERE uid IN (${m}) AND (char_id != ?1 OR state != 'held' OR claim_char IS NOT NULL)`).bind(char, ...part).all();
    const rows = r?.results ?? [];
    const waiting = (/** @type {any} */ x) => (x.char_id === char && x.state === 'held') || x.claim_char === char;
    if (rows.some((/** @type {any} */ x) => !waiting(x))) return 'piece-dupe';
    if (rows.length) return 'piece-claimed';
  }
  return null;
}

export async function piecesBarred(db, char, keys) {
  const out = new Set();
  for (const part of chunks(keys, UID_CHUNK)) {
    const m = marks(part.length, 2);
    const copies = await db.prepare(`SELECT uid FROM item_dupes WHERE char_id = ?1 AND uid IN (${m})`).bind(char, ...part).all();
    for (const x of copies?.results ?? []) out.add(/** @type {any} */ (x).uid);
    const r = await db.prepare(`SELECT uid, char_id, state, claim_char FROM item_uids WHERE uid IN (${m}) AND (char_id != ?1 OR state != 'held' OR claim_char IS NOT NULL)`).bind(char, ...part).all();
    for (const x of /** @type {any[]} */ (r?.results ?? [])) out.add(x.uid);
  }
  return out;
}

/** @param {any} db @param {string} char @param {number} nowS @param {{ deleted?: boolean }} [o] */
export function releaseSteps(db, char, nowS, { deleted = false } = {}) {
  return [
    db.prepare('UPDATE item_uids SET claim_char = NULL, claim_at = NULL WHERE claim_char = ?1').bind(char),
    db.prepare(`UPDATE item_uids SET state = 'gone', claim_char = NULL, claim_at = NULL, at = ?2
      WHERE char_id = ?1 AND state = 'held' AND EXISTS (SELECT 1 FROM item_dupes d WHERE d.uid = item_uids.uid)`).bind(char, nowS),
    db.prepare("DELETE FROM item_uids WHERE char_id = ?1 AND state = 'held'").bind(char),
    ...(deleted ? [db.prepare('DELETE FROM item_dupes WHERE char_id = ?1').bind(char)] : []),
  ];
}
