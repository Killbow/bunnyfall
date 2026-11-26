// @ts-check
import { mintId, accountKind, displayName, isMuted, overRate } from './accounts.js';
import { isDeveloper, canModerate, titleWorn, glyphsShown, SPROUT_S } from './titles.js';
import { withIliacHonoursAll } from './iliac.js';
import { withGambitHonoursAll } from './gambit.js';
import { withArenaHonoursAll } from './arena.js';
import { withEgHonoursAll } from './egHonours.js';
import { withMasteryMarksAll } from './hunts.js';
import { guildActorOf } from './guilds.js';
import { heraldryOfRow } from './halls.js';
import { guildMay } from '../../src/net/guildLaw.js';
import { maskText } from '../../src/net/nameFilter.js';
import {
  NOTES_LIVE_MAX, NOTE_DAY_S, BOARD_NOTES_SHOWN, BOARD_NOTICES_SHOWN, NOTES_PINNED_MAX, BOARD_OPS_MAX, BOARD_WINDOW_S,
  NOTE_REPORTS_HIDE, NOTE_ID_RE, BOARD_RID_RE, boardSwitchOf, boardKeyOk, noteWords, noticeWords,
} from '../../src/net/boardLaw.js';

export function boardOpenFor(player, env) {
  const s = boardSwitchOf(env?.BOARD_OPEN);
  return s === 'on' || (s === 'dev' && isDeveloper(player, env));
}

const badgeOf = (row, env, nowS) => (row ? { title: titleWorn(row, env) ?? null, glyphs: glyphsShown(row, env, nowS) } : { title: null, glyphs: [] });

export async function sweepBoard(db, nowS, limit = 200) {
  const a = await db.prepare('DELETE FROM board_notes WHERE id IN (SELECT id FROM board_notes WHERE expires_at <= ? LIMIT ?)').bind(nowS, limit).run();
  const b = await db.prepare('DELETE FROM board_notices WHERE id IN (SELECT id FROM board_notices WHERE expires_at <= ? LIMIT ?)').bind(nowS, limit).run();
  return Number(a?.meta?.changes ?? 0) + Number(b?.meta?.changes ?? 0);
}

const recruits = (n) => !!n.guild_name && n.author_rank != null && guildMay(Number(n.author_rank), 'invite');

function noteView(n, row, env, nowS, { mine = false, mod = false, reports = 0 } = {}) {
  const guildOk = recruits(n);
  return {
    id: n.id, from: n.author_name, by: n.author, ...badgeOf(row, env, nowS), subject: maskText(n.subject), body: maskText(n.body),
    button: n.button === 'guild' && !guildOk ? null : (n.button ?? null),
    ...(guildOk ? { guild: { name: n.guild_name, tag: n.guild_tag, heraldry: heraldryOfRow(n.guild_heraldry) } } : {}),
    at: n.at, expiresAt: n.expires_at, mine,
    ...(mod ? { hidden: n.hidden === 1, restored: n.hidden === 2, reports } : mine && n.hidden === 1 ? { hidden: true } : {}),
  };
}

/** @param {{db: any, nowS: number}} ctx @param {any} reader @param {any} env @param {unknown} map */
export async function readBoard({ db, nowS, primary = db }, reader, env, map, { lean = false } = {}) {
  if (!boardOpenFor(reader, env)) return { error: 'board-closed' };
  const mapId = Number(map);
  if (!boardKeyOk(mapId)) return { error: 'bad-board' };
  const mod = canModerate(reader, env);
  const { results: notes = [] } = await db.prepare(`SELECT n.*, g.name AS guild_name, g.tag AS guild_tag, g.heraldry AS guild_heraldry, gm.rank AS author_rank,
      (SELECT COUNT(*) FROM board_reports r WHERE r.note_id = n.id) AS reports
    FROM board_notes n JOIN players p ON p.id = n.author LEFT JOIN guilds g ON g.id = n.guild_id
      LEFT JOIN guild_members gm ON gm.player = n.author AND gm.char_id = n.char_id AND gm.guild_id = n.guild_id
    WHERE n.map_id = ?1 AND n.expires_at > ?2
      AND (COALESCE(p.muted_until, 0) <= ?2 OR ?3 = 1 OR n.author = ?4)
      AND (n.hidden <> 1 OR ?3 = 1 OR n.author = ?4)
      AND NOT EXISTS (SELECT 1 FROM board_reports r WHERE r.note_id = n.id AND r.reporter = ?4)
    ORDER BY n.at DESC, n.id DESC LIMIT ?5`)
    .bind(mapId, nowS, mod ? 1 : 0, reader.id, BOARD_NOTES_SHOWN).all();
  const { results: notices = [] } = await db.prepare('SELECT * FROM board_notices WHERE expires_at > ? ORDER BY at DESC, id DESC LIMIT ?')
    .bind(nowS, BOARD_NOTICES_SHOWN).all();
  const authors = lean ? [] : [...new Set(notes.map((n) => n.author))];
  const rows = new Map();
  if (authors.length) {
    const { results: found = [] } = await db.prepare(`SELECT * FROM players WHERE id IN (${authors.map(() => '?').join(', ')})`).bind(...authors).all();
    // The honor reads use `primary` because a stale #1 is counted again and written, which a replica cannot do.
    for (const p of await withIliacHonoursAll({ db: primary }, await withArenaHonoursAll({ db: primary }, found, nowS), nowS)) rows.set(p.id, p);
    for (const p of await withEgHonoursAll({ db: primary }, [...rows.values()], nowS)) rows.set(p.id, p);
    for (const p of await withGambitHonoursAll({ db: primary }, [...rows.values()], nowS)) rows.set(p.id, p);
    for (const p of await withMasteryMarksAll({ db }, [...rows.values()])) rows.set(p.id, p);
  }
  const live = await liveCount(db, reader.id, nowS);
  return {
    map: mapId,
    ...(lean ? { lean: true } : {}),
    notices: notices.map((x) => ({ id: x.id, from: x.author_name, subject: maskText(x.subject), body: maskText(x.body), at: x.at, expiresAt: x.expires_at })),
    notes: notes.map((n) => noteView(n, rows.get(n.author), env, nowS, { mine: n.author === reader.id, mod, reports: Number(n.reports ?? 0) })),
    me: {
      canPin: accountKind(reader) === 'linked' && !isMuted(reader, nowS),
      muted: isMuted(reader, nowS),
      live, max: NOTES_LIVE_MAX, moderator: mod, developer: isDeveloper(reader, env),
    },
  };
}

const NOTE_ROW = `SELECT n.*, g.name AS guild_name, g.tag AS guild_tag, g.heraldry AS guild_heraldry, gm.rank AS author_rank FROM board_notes n
  LEFT JOIN guilds g ON g.id = n.guild_id LEFT JOIN guild_members gm ON gm.player = n.author AND gm.char_id = n.char_id AND gm.guild_id = n.guild_id`;

async function liveCount(db, author, nowS) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM board_notes WHERE author = ? AND expires_at > ?').bind(author, nowS).first();
  return Number(r?.n ?? 0);
}

function gate(player, env, nowS) {
  if (accountKind(player) !== 'linked') return { error: 'board-need-account' };
  if (!boardOpenFor(player, env)) return { error: 'board-closed' };
  if (isMuted(player, nowS)) return { error: 'muted' };
  return null;
}

/** @param {{db: any, rand: (b: Uint8Array) => void, nowS: number}} ctx */
export async function pinNote({ db, rand, nowS }, author, env, { map, subject, body, days, button, rid, character } = {}) {
  const shut = gate(author, env, nowS);
  if (shut) return shut;
  const mapId = Number(map);
  if (!boardKeyOk(mapId)) return { error: 'bad-board' };
  if (typeof rid !== 'string' || !BOARD_RID_RE.test(rid)) return { error: 'board-rid' };
  const prior = await db.prepare(`${NOTE_ROW} WHERE n.author = ? AND n.rid = ?`).bind(author.id, rid).first();
  if (prior) return { ok: true, repeat: true, note: noteView(prior, author, env, nowS, { mine: true }) };
  const words = noteWords({ subject, body, days, button });
  if ('error' in words) return words;
  let guildId = null;
  if (words.button === 'guild') {
    const a = await guildActorOf(db, author, character);
    if ('error' in a) return { error: a.error === 'no-guild' || a.error === 'guild-character' ? 'note-no-guild' : a.error };
    if (!guildMay(a.me.rank, 'invite')) return { error: 'guild-rank' };
    guildId = a.me.guild_id;
  }
  if (await overRate({ db, nowS }, `board-pin:${author.id}`, NOTES_PINNED_MAX, BOARD_WINDOW_S)) return { error: 'board-rate' };
  const id = mintId(rand);
  const expires = nowS + words.days * NOTE_DAY_S;
  let r;
  try {
    // The live-note cap is checked inside the INSERT, so two pins racing for the last slot cannot both land.
    r = await db.prepare(`INSERT INTO board_notes (id, map_id, author, author_name, subject, body, button, guild_id, char_id, at, expires_at, rid)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM board_notes WHERE author = ? AND expires_at > ?) < ?`)
      .bind(id, mapId, author.id, displayName(author), words.subject, words.body, words.button, guildId, guildId ? character : null, nowS, expires, rid, author.id, nowS, NOTES_LIVE_MAX).run();
  } catch (e) {
    // A unique clash means a twin request landed first. Any other error stays a 500, so the client retries.
    if (!/UNIQUE/i.test(String(/** @type {any} */ (e)?.message ?? e))) throw e;
    r = null;
  }
  if (!r?.meta?.changes) {
    const again = await db.prepare(`${NOTE_ROW} WHERE n.author = ? AND n.rid = ?`).bind(author.id, rid).first();
    if (again) return { ok: true, repeat: true, note: noteView(again, author, env, nowS, { mine: true }) };
    return { error: 'notes-full' };
  }
  const note = await db.prepare(`${NOTE_ROW} WHERE n.id = ?`).bind(id).first();
  return { ok: true, note: noteView(note, author, env, nowS, { mine: true }), live: await liveCount(db, author.id, nowS) };
}

export async function takeDownNote({ db, nowS }, author, env, id) {
  if (accountKind(author) !== 'linked') return { error: 'board-need-account' };
  if (typeof id !== 'string' || !NOTE_ID_RE.test(id)) return { error: 'no-note' };
  if (await overRate({ db, nowS }, `board-ops:${author.id}`, BOARD_OPS_MAX, BOARD_WINDOW_S)) return { error: 'board-ops-rate' };
  const r = await db.prepare('DELETE FROM board_notes WHERE id = ? AND author = ?').bind(id, author.id).run();
  if (!r?.meta?.changes) return { error: 'no-note' };
  return { ok: true, id, live: await liveCount(db, author.id, nowS) };
}

export async function reportNote({ db, nowS }, reader, env, id) {
  const shut = gate(reader, env, nowS);
  if (shut && shut.error !== 'muted') return shut;
  if (typeof id !== 'string' || !NOTE_ID_RE.test(id)) return { error: 'no-note' };
  if (await overRate({ db, nowS }, `board-ops:${reader.id}`, BOARD_OPS_MAX, BOARD_WINDOW_S)) return { error: 'board-ops-rate' };
  const note = await db.prepare('SELECT author FROM board_notes WHERE id = ? AND expires_at > ?').bind(id, nowS).first();
  if (!note) return { error: 'no-note' };
  if (note.author === reader.id) return { error: 'own-note' };
  await db.prepare('INSERT OR IGNORE INTO board_reports (note_id, reporter, at) VALUES (?, ?, ?)').bind(id, reader.id, nowS).run();
  await db.prepare(`UPDATE board_notes SET hidden = 1 WHERE id = ?1 AND hidden = 0
    AND (SELECT COUNT(*) FROM board_reports r JOIN players p ON p.id = r.reporter
      WHERE r.note_id = ?1 AND COALESCE(p.muted_until, 0) <= ?2 AND p.created_at <= ?2 - ?4) >= ?3`).bind(id, nowS, NOTE_REPORTS_HIDE, SPROUT_S).run();
  return { ok: true, id };
}

export async function moderateNote({ db }, mod, env, id, act) {
  if (!canModerate(mod, env)) return { error: 'not-moderator' };
  if (typeof id !== 'string' || !NOTE_ID_RE.test(id)) return { error: 'no-note' };
  const r = act === 'remove'
    ? await db.prepare('DELETE FROM board_notes WHERE id = ?').bind(id).run()
    : act === 'restore'
      ? await db.prepare('UPDATE board_notes SET hidden = 2 WHERE id = ?').bind(id).run()
      : null;
  if (!r) return { error: 'bad-act' };
  if (!r.meta?.changes) return { error: 'no-note' };
  return { ok: true, id, act };
}

export async function postNotice({ db, rand, nowS }, dev, env, { subject, body, days, rid } = {}) {
  if (!isDeveloper(dev, env)) return { error: 'not-developer' };
  if (typeof rid !== 'string' || !BOARD_RID_RE.test(rid)) return { error: 'board-rid' };
  const words = noticeWords({ subject, body, days });
  if ('error' in words) return words;
  const id = mintId(rand);
  const r = await db.prepare('INSERT OR IGNORE INTO board_notices (id, subject, body, author, author_name, at, expires_at, rid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, words.subject, words.body, dev.id, displayName(dev), nowS, nowS + words.days * NOTE_DAY_S, rid).run();
  if (!r?.meta?.changes) {
    const made = await db.prepare('SELECT id FROM board_notices WHERE author = ? AND rid = ?').bind(dev.id, rid).first();
    return made ? { ok: true, repeat: true, id: made.id } : { error: 'server' };
  }
  return { ok: true, id };
}
export async function removeNotice({ db }, dev, env, id) {
  if (!isDeveloper(dev, env)) return { error: 'not-developer' };
  if (typeof id !== 'string' || !NOTE_ID_RE.test(id)) return { error: 'no-notice' };
  const r = await db.prepare('DELETE FROM board_notices WHERE id = ?').bind(id).run();
  return r?.meta?.changes ? { ok: true, id } : { error: 'no-notice' };
}
