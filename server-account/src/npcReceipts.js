// @ts-check
// The claim's own row is written first and stands even when this credit fails.
// The credit moves the Roll's head under its own tag, so a claim that read the Roll earlier is refused
// with `roll-busy`.

import { chaptersOpenFor } from './npcRoll.js';
import { meritStatement, meritOfAct } from './npcMerit.js';
import { regionChapters } from './npcHalls.js';
import { REALM_ID_RE } from './realm.js';
import { regionOk } from '../../src/net/nodeLaw.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { gateTimes } from '../../src/net/gateLaw.js';
import { MAX_REPUTATION } from '../../src/guilds/guildFactions.js';
import {
  RECEIPT_KINDS, receiptCreditsOf, receiptRef, receiptWritRef, hallReceiptKindsOf, hallHidden, meritOfReceipt, meritWeekOf,
} from '../../src/net/npcChapterLaw.js';

function mintTag(/** @type {((b: Uint8Array) => Uint8Array) | undefined} */ rand) {
  const draw = rand ?? ((b) => globalThis.crypto.getRandomValues(b));
  let out = '';
  for (const x of draw(new Uint8Array(8))) out += x.toString(16).padStart(2, '0');
  return out;
}

export async function membersOf(/** @type {any} */ db, /** @type {string} */ player, /** @type {unknown} */ character) {
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return [];
  const { results = [] } = await db.prepare(`SELECT faction_id FROM npc_roll WHERE char_id = ?1 AND player = ?2 AND member = 1 AND dormant = 0
    AND EXISTS (SELECT 1 FROM realm_characters WHERE id = ?1 AND player = ?2 AND dead_at IS NULL) ORDER BY faction_id`).bind(character, player).all();
  return results.map((/** @type {any} */ r) => Number(r.faction_id));
}

/** @param {{ db: any, nowS: number, rand?: (b: Uint8Array) => Uint8Array }} ctx @param {{ id: string }} player
 *  @param {any} env @param {any} body */
export async function creditReceipt({ db, nowS, rand }, player, env, { character, kind, id, region } = {}) {
  try {
    if (!chaptersOpenFor(player, env)) return { counted: false, why: 'chapters-closed' };
    if (!RECEIPT_KINDS.includes(kind) || id == null || id === '') return { counted: false, why: 'no-receipt' };
    if (!regionOk(region)) return { counted: false, why: 'no-region' };
    if (kind === 'gate' && (!Number.isSafeInteger(id) || meritWeekOf(Math.floor(gateTimes(Number(id)).riseAt / 1000)) !== meritWeekOf(nowS))) {
      return { counted: false, why: 'old-week' };
    }
    const members = await membersOf(db, player.id, character);
    if (!members.length) return { counted: false, why: 'no-member' };
    const credits = receiptCreditsOf({ kind, id, day: utcDay(nowS), members, chapters: await regionChapters(db, region, nowS * 1000) });
    if (!credits.length) return { counted: false, why: 'no-chapter' };
    const { results: had = [] } = await db.prepare(`SELECT faction_id, ref FROM npc_receipt_credits WHERE char_id = ?1 AND ref IN (${credits.map((_, i) => `?${i + 2}`).join(', ')})`)
      .bind(character, ...credits.map((c) => c.ref)).all();
    const stood = new Set(had.map((/** @type {any} */ r) => `${r.faction_id}|${r.ref}`));
    if (credits.every((c) => stood.has(`${c.faction}|${c.ref}`))) return { counted: false, why: 'credited' };
    const tag = mintTag(rand);
    const own = credits.filter((c) => c.ref === receiptRef(kind, id));
    const tagged = 'EXISTS (SELECT 1 FROM npc_roll_heads WHERE char_id = ?1 AND tag = ?2)';
    const sum = '(SELECT COALESCE(SUM(amount), 0) FROM npc_receipt_credits WHERE char_id = ?1 AND faction_id = ?3 AND tag = ?2)';
    await db.batch([
      db.prepare(`UPDATE npc_roll_heads SET seq = seq + 1, tag = ?2, updated_at = ?3 WHERE char_id = ?1 AND player = ?4
        AND EXISTS (SELECT 1 FROM realm_characters WHERE id = ?1 AND player = ?4 AND dead_at IS NULL)`).bind(character, tag, nowS, player.id),
      ...credits.map((c) => db.prepare(`INSERT OR IGNORE INTO npc_receipt_credits (char_id, faction_id, ref, player, amount, tag, at)
        SELECT ?1, ?3, ?4, ?5, ?6, ?2, ?7 WHERE ${tagged}`).bind(character, tag, c.faction, c.ref, player.id, c.amount, nowS)),
      ...[...new Set(credits.map((c) => c.faction))].map((f) => db.prepare(`UPDATE npc_roll SET rep = MIN(?4, rep + ${sum}),
        owed = MAX(0, MIN(owed, ?4 - MIN(?4, rep + ${sum}))) WHERE char_id = ?1 AND faction_id = ?3 AND ${tagged}`).bind(character, tag, f, MAX_REPUTATION)),
      ...own.map((c) => meritStatement(db, {
        player: player.id, character, faction: c.faction, region, source: kind, ref: c.ref, nowS, amountSql: '?11',
        guard: 'EXISTS (SELECT 1 FROM npc_receipt_credits WHERE char_id = ?2 AND faction_id = ?3 AND ref = ?7 AND tag = ?12)', binds: [meritOfReceipt(own.length), tag],
      })),
    ]);
    const { results: got = [] } = await db.prepare('SELECT faction_id AS f, SUM(amount) AS amount FROM npc_receipt_credits WHERE char_id = ?1 AND tag = ?2 GROUP BY faction_id ORDER BY faction_id')
      .bind(character, tag).all();
    if (!got.length) return { counted: false, why: 'busy' };
    return {
      counted: true, credited: got.map((/** @type {any} */ r) => ({ f: Number(r.f), amount: Number(r.amount) })),
      merit: await meritOfAct(db, character, kind, receiptRef(kind, id)),
    };
  } catch {
    return { counted: false, why: 'server' };
  }
}

/** @param {any} db @param {{ id: string }} player @param {any} env @param {unknown} character
 *  @param {number} region @param {number} nowS */
export async function receiptAsks(db, player, env, character, region, nowS) {
  if (!chaptersOpenFor(player, env) || !regionOk(region)) return [];
  const chapters = await regionChapters(db, region, nowS * 1000);
  if (!chapters.length) return [];
  const members = new Set(await membersOf(db, player.id, character));
  const day = utcDay(nowS);
  /** @type {Set<string>} */
  const done = new Set();
  if (members.size) {
    const { results = [] } = await db.prepare('SELECT faction_id, ref FROM npc_receipt_credits WHERE char_id = ?1 AND ref IN (?2, ?3)')
      .bind(character, receiptWritRef('gate', day), receiptWritRef('raid', day)).all();
    for (const r of results) done.add(`${r.faction_id}|${r.ref}`);
  }
  const out = [];
  for (const f of chapters) {
    if (hallHidden(f) && !members.has(f)) continue;
    for (const kind of hallReceiptKindsOf(f)) out.push({ faction: f, kind, member: members.has(f), done: done.has(`${f}|${receiptWritRef(kind, day)}`) });
  }
  return out;
}
