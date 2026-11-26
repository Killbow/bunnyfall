// @ts-check
// The sender's rate is spent before the reader lookup, so nobody can probe the lookup for accounts.
// A full box refuses the sender and never drops the reader's oldest letter.
// Every read names the reader, so another's letter answers no-letter.
import { mintId, accountKind, displayName, isMuted, overRate } from './accounts.js';
import { ID_RE } from '../../src/net/identityToken.js';
import { titleWorn, glyphsShown } from './titles.js';
import { withIliacHonours, withIliacHonoursAll } from './iliac.js';
import { withGambitHonours, withGambitHonoursAll } from './gambit.js';
import { withArenaHonours, withArenaHonoursAll } from './arena.js';
import { withEgHonours, withEgHonoursAll } from './egHonours.js';
import { withMasteryMarks, withMasteryMarksAll } from './hunts.js';
import { HANDLE_RE } from '../../src/net/handleShape.js';
import {
  letterWords, LETTERS_INBOX_MAX, LETTERS_SENT_MAX, LETTERS_SENT_WINDOW_S, LETTERS_PAIR_MAX, LETTER_ID_RE,
} from '../../src/net/letterLaw.js';

/** @param {{db: any, rand: (b: Uint8Array) => void, nowS: number}} ctx @param {any} sender
 * @param {{to?: unknown, toAccount?: unknown, subject?: unknown, body?: unknown}} letter
 * @returns {Promise<{ok: true, id: string, to: string} | {error: string}>} */
export async function sendLetter({ db, rand, nowS }, sender, { to, toAccount, subject, body } = {}) {
  if (accountKind(sender) !== 'linked') return { error: 'mail-needs-account' };
  if (isMuted(sender, nowS)) return { error: 'muted' };
  const words = letterWords({ subject, body });
  if ('error' in words) return words;
  const account = typeof toAccount === 'string' && ID_RE.test(toAccount) ? toAccount : null;
  const handle = account ? '' : typeof to === 'string' ? to.trim() : '';
  if (!account && !HANDLE_RE.test(handle)) return { error: 'no-reader' };
  if (await overRate({ db, nowS }, `mail:${sender.id}`, LETTERS_SENT_MAX, LETTERS_SENT_WINDOW_S)) return { error: 'mail-rate' };
  const reader = account
    ? await db.prepare('SELECT id, handle, guest_name FROM players WHERE id = ?').bind(account).first()
    : await db.prepare('SELECT id, handle FROM players WHERE handle_lc = ?').bind(handle.toLowerCase()).first();
  if (!reader) return { error: 'no-reader' };
  if (!reader.handle) return { error: 'reader-guest' };
  if (reader.id === sender.id) return { error: 'to-self' };
  if (await overRate({ db, nowS }, `mail:${sender.id}>${reader.id}`, LETTERS_PAIR_MAX, LETTERS_SENT_WINDOW_S)) return { error: 'mail-rate' };
  const id = mintId(rand);
  // A blocked sender is answered as if the letter went, because a block is never told to the blocked.
  if (await db.prepare('SELECT 1 AS y FROM blocks WHERE player = ?1 AND blocked = ?2').bind(reader.id, sender.id).first()) return { ok: true, id, to: account ? displayName(reader) : reader.handle };
  const r = await db.prepare(`INSERT INTO letters (id, to_id, from_id, from_name, subject, body, sent_at)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM letters WHERE to_id = ?) < ?`)
    .bind(id, reader.id, sender.id, displayName(sender), words.subject, words.body, nowS, reader.id, LETTERS_INBOX_MAX).run();
  if (!r?.meta?.changes) return { error: 'inbox-full' };
  return { ok: true, id, to: account ? displayName(reader) : reader.handle };
}

const badgeOf = (row, env, nowS) => (row ? { title: titleWorn(row, env) ?? null, glyphs: glyphsShown(row, env, nowS) } : { title: null, glyphs: [] });

/** @param {{db: any, nowS: number}} ctx @param {any} reader @param {any} env */
export async function inboxOf({ db, nowS, primary = db }, reader, env) {
  const { results = [] } = await db.prepare(`SELECT id, from_id, from_name, subject, sent_at, read_at FROM letters
    WHERE to_id = ? ORDER BY sent_at DESC, id DESC LIMIT ?`).bind(reader.id, LETTERS_INBOX_MAX).all();
  const senders = [...new Set(results.map((l) => l.from_id))];
  const rows = new Map();
  if (senders.length) {
    const { results: found = [] } = await db.prepare(`SELECT * FROM players WHERE id IN (${senders.map(() => '?').join(', ')})`)
      .bind(...senders).all();
    // Honours read on the primary, because a stale champion is counted again and stored, never from a replica.
    for (const p of await withIliacHonoursAll({ db: primary }, await withArenaHonoursAll({ db: primary }, found, nowS), nowS)) rows.set(p.id, p);
    for (const p of await withEgHonoursAll({ db: primary }, [...rows.values()], nowS)) rows.set(p.id, p);
    for (const p of await withGambitHonoursAll({ db: primary }, [...rows.values()], nowS)) rows.set(p.id, p);
    for (const p of await withMasteryMarksAll({ db }, [...rows.values()])) rows.set(p.id, p);
  }
  const letters = results.map((l) => ({
    id: l.id, from: l.from_name, ...badgeOf(rows.get(l.from_id), env, nowS),
    subject: l.subject, sentAt: l.sent_at, read: l.read_at != null,
  }));
  return { letters, unread: letters.filter((l) => !l.read).length, max: LETTERS_INBOX_MAX };
}

/** @param {{db: any, nowS: number}} ctx */
export async function readLetter({ db, nowS }, reader, env, id) {
  if (typeof id !== 'string' || !LETTER_ID_RE.test(id)) return { error: 'no-letter' };
  const l = await db.prepare('SELECT id, from_id, from_name, subject, body, sent_at, read_at FROM letters WHERE id = ? AND to_id = ?')
    .bind(id, reader.id).first();
  if (!l) return { error: 'no-letter' };
  if (l.read_at == null) await db.prepare('UPDATE letters SET read_at = ? WHERE id = ? AND to_id = ? AND read_at IS NULL').bind(nowS, id, reader.id).run();
  const row = await withIliacHonours({ db }, await withArenaHonours({ db }, await db.prepare('SELECT * FROM players WHERE id = ?').bind(l.from_id).first(), nowS), nowS);
  return {
    letter: {
      id: l.id, from: l.from_name, ...badgeOf(await withMasteryMarks({ db }, await withGambitHonours({ db }, await withEgHonours({ db }, row, nowS), nowS)), env, nowS), subject: l.subject, body: l.body,
      sentAt: l.sent_at, readAt: l.read_at ?? nowS,
    },
  };
}

export async function deleteLetter({ db }, reader, id) {
  if (typeof id !== 'string' || !LETTER_ID_RE.test(id)) return { error: 'no-letter' };
  const r = await db.prepare('DELETE FROM letters WHERE id = ? AND to_id = ?').bind(id, reader.id).run();
  return r?.meta?.changes ? { ok: true, id } : { error: 'no-letter' };
}
