// @ts-check
import { ADVENTURERS_FACTION, companyRenameCost } from '../../src/net/bunnyGuildLaw.js';
import { accountKind, displayName, overRate } from './accounts.js';
import { CHAR_ID_RE } from './service.js';
import { prepareRealmRecord, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed, REALM_ID_RE } from './realm.js';
import { payFromSave, creditSave } from '../../src/net/realmGoldLaw.js';
import { renownTrackOf } from './renownTracks.js';
import { HANDLE_RE } from '../../src/net/handleShape.js';
import { MARKS_LEDGER_SHOWN, MARKS_MAX } from '../../src/net/marksLaw.js';
import { marksOpenFor, guildMarksSweep, guildDeedsToday } from './marks.js';
import { hallViewOf, heraldryOfRow } from './halls.js';
import {
  GUILD_FOUND_GOLD, GUILD_FOUND_RENOWN, GUILD_MEMBERS_MAX, GUILD_RANK_NAMES, GUILD_RANK_MASTER, GUILD_RANK_OFFICER, GUILD_RANK_RECRUIT,
  GUILD_TREASURY_MAX, GUILD_LEDGER_SHOWN, GUILD_OPS_MAX, GUILD_OPS_WINDOW_S, GUILD_INVITE_TTL_S, GUILD_ID_RE, GUILD_MEMBER_RE,
  guildMay, guildMayMove, guildOutranks, guildNameOf, guildNameKey, guildTagOf, guildRankNamesOf, guildGoldOk,
  GUILD_RENAME_GOLD, GUILD_RENAME_COOLDOWN_S, guildRenameAt, guildRenameOpen,
} from '../../src/net/guildLaw.js';
import { vaultStanding, guildVaultSlots } from '../../src/net/guildVaultLaw.js';
import { checkName, normaliseName, standsAlone, IMPERSONATION, textCaught } from '../../src/net/nameFilter.js';
import { seatWeekOf } from '../../src/net/townSeatLaw.js';

const charOk = (c) => typeof c === 'string' && CHAR_ID_RE.test(c);
const memberIdOf = (m) => (typeof m === 'string' && GUILD_MEMBER_RE.test(m) ? Number(m.slice(1)) : null);

export function mintGuildId(rand) {
  const b = new Uint8Array(10);
  rand(b);
  return `g${[...b].map((x) => (x % 36).toString(36)).join('')}`;
}

async function memberRow(db, playerId, charId) {
  return db.prepare('SELECT rowid AS rid, * FROM guild_members WHERE player = ? AND char_id = ?').bind(playerId, charId).first();
}

export async function mintMemberOf({ db }, playerId, character) {
  if (!charOk(character)) return null;
  return (await db.prepare('SELECT m.rowid AS rid, m.guild_id AS guild_id, m.rank AS rank, m.joined_at AS joined_at, g.id AS gid, g.tag AS tag, g.heraldry AS heraldry'
    + ' FROM guild_members m LEFT JOIN guilds g ON g.id = m.guild_id WHERE m.player = ? AND m.char_id = ?').bind(playerId, character).first()) ?? null;
}

export async function guildBadgeOf({ db }, playerId, character, member = undefined) {
  if (!charOk(character)) return null;
  const r = member !== undefined ? (member && member.gid != null ? member : null)
    : await db.prepare('SELECT m.rowid AS rid, g.id AS gid, g.tag AS tag FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.player = ? AND m.char_id = ?')
      .bind(playerId, character).first();
  return r ? { gi: r.gid, gt: r.tag, gm: `m${r.rid}` } : null;
}
const badgeOfRow = (me, tag) => ({ gi: me.guild_id, gt: tag, gm: `m${me.rid}` });

async function succeed(db, guildId) {
  const first = await db.prepare('SELECT rank FROM guild_members WHERE guild_id = ? ORDER BY rank, joined_at, rowid LIMIT 1').bind(guildId).first();
  if (!first || Number(first.rank) === GUILD_RANK_MASTER) return;
  await db.prepare(`UPDATE guild_members SET rank = ${GUILD_RANK_MASTER}
    WHERE rowid = (SELECT rowid FROM guild_members WHERE guild_id = ? ORDER BY rank, joined_at, rowid LIMIT 1) AND rank <> ${GUILD_RANK_MASTER}`).bind(guildId).run();
}

export async function guildMemberDead(db, player, character) {
  const row = await db.prepare('SELECT rowid AS rid, guild_id FROM guild_members WHERE player = ? AND char_id = ?').bind(player, character).first();
  if (!row) return;
  await db.prepare('DELETE FROM guild_members WHERE rowid = ?').bind(row.rid).run();
  await succeed(db, row.guild_id);
  await db.prepare(`DELETE FROM guilds WHERE id = ?1 AND treasury = 0 AND NOT EXISTS (SELECT 1 FROM guild_members WHERE guild_id = ?1)
    AND NOT EXISTS (SELECT 1 FROM guild_marks WHERE guild_id = ?1 AND balance > 0) AND NOT ${guildKeepsSql('?1')}`).bind(row.guild_id).run();
}

export async function guildActorOf(db, player, character) { return actorOf(db, player, character); }
async function actorOf(db, player, character) {
  if (accountKind(player) !== 'linked') return { error: 'guilds-need-account' };
  if (!charOk(character)) return { error: 'guild-character' };
  const first = await memberRow(db, player.id, character);
  if (!first) return { error: 'no-guild' };
  await succeed(db, first.guild_id);
  return { me: first.rank === GUILD_RANK_MASTER ? first : await memberRow(db, player.id, character) };
}

async function viewOf(db, guildId, me, nowS, marksOpen = false, env = null) {
  const g = await db.prepare('SELECT * FROM guilds WHERE id = ?').bind(guildId).first();
  if (!g) return null;
  const members = await db.prepare(`SELECT m.rowid AS rid, m.name, m.rank, m.joined_at, m.player, m.char_id, m.vault_level, m.vault_limit, m.vault_day, m.vault_taken, p.staff_hide_on AS hide_on,
    COALESCE(p.played_at, p.last_seen) AS seen_at FROM guild_members m LEFT JOIN players p ON p.id = m.player WHERE m.guild_id = ? ORDER BY m.rank, m.joined_at, m.rowid`)
    .bind(guildId).all();
  const hidAt = new Map();
  const hiding = (members?.results ?? []).filter((m) => m.hide_on === 1 && m.player);
  if (hiding.length) {
    // Loaded lazily: a static import closes the cycle realm.js, guilds.js, staffHidden.js, staff.js, market.js,
    // and back to realm.js before realm.js has run.
    const { hiddenSince } = await import('./staffHidden.js');
    for (const m of hiding) if (!hidAt.has(m.player)) hidAt.set(m.player, await hiddenSince(db, env, m.player));
  }
  const hall = await hallViewOf(db, guildId);
  const used = Number((await db.prepare('SELECT COUNT(*) AS n FROM guild_vault WHERE guild_id = ?').bind(guildId).first())?.n ?? 0);
  const today = Math.floor(nowS / 86_400);
  const standingOf = (m) => vaultStanding(Number(m.rank), m.vault_level == null ? null : { level: m.vault_level, limit: Number(m.vault_limit) });
  const invites = guildMay(me.rank, 'invite')
    ? await db.prepare('SELECT p.handle AS name, i.by_name, i.at FROM guild_invites i JOIN players p ON p.id = i.player WHERE i.guild_id = ? AND i.at > ? ORDER BY i.at DESC')
      .bind(guildId, nowS - GUILD_INVITE_TTL_S).all()
    : { results: [] };
  const ledger = await db.prepare('SELECT at, who, kind, amount, balance FROM guild_ledger WHERE guild_id = ? ORDER BY seq DESC LIMIT ?').bind(guildId, GUILD_LEDGER_SHOWN).all();
  const marks = marksOpen ? await db.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').bind(guildId).first() : null;
  const marksLines = marksOpen ? await db.prepare(`SELECT at, who, kind, amount, src_kind, src_id FROM marks_ledger
    WHERE (dst_kind = 'guild' AND dst_id = ?1) OR (src_kind = 'guild' AND src_id = ?1) ORDER BY seq DESC LIMIT ?2`).bind(guildId, MARKS_LEDGER_SHOWN).all() : null;
  let ranks = GUILD_RANK_NAMES;
  try { ranks = guildRankNamesOf(JSON.parse(g.ranks)) ?? GUILD_RANK_NAMES; } catch { }
  if (ranks[0] === 'Guildmaster') ranks = [GUILD_RANK_NAMES[0], ...ranks.slice(1)];
  return {
    id: g.id, name: g.name, tag: g.tag, ranks: [...ranks], treasury: g.treasury, foundedAt: g.founded_at, rank: me.rank,
    hallGold: Number(g.realm_gold ?? 0),
    hall, heraldry: heraldryOfRow(g.heraldry),
    renamedAt: g.renamed_at == null ? null : Number(g.renamed_at), renameAt: guildRenameAt(g.renamed_at == null ? null : Number(g.renamed_at)),
    ...(me.rank === GUILD_RANK_MASTER ? { keeps: (await guildHolds(db, guildId, me.player)) ?? [] } : {}),
    vault: (() => {
      const mine = (members?.results ?? []).find((m) => m.player === me.player && m.char_id === me.char_id) ?? me;
      return { used, max: guildVaultSlots(!!hall), me: { ...standingOf(mine), taken: Number(mine.vault_day) === today ? Number(mine.vault_taken ?? 0) : 0 } };
    })(),
    members: (members?.results ?? []).map((m) => {
      const you = m.player === me.player && m.char_id === me.char_id, hid = hidAt.get(m.player) ?? null;
      return {
        member: `m${m.rid}`, name: m.name, rank: m.rank, joinedAt: m.joined_at, you,
        vault: standingOf(m),
        seenAt: Number.isSafeInteger(m.seen_at) ? (hid == null ? m.seen_at : Math.min(m.seen_at, hid)) : null,
        ...(you && hid != null ? { hidden: true } : {}),
      };
    }),
    invites: (invites?.results ?? []).map((i) => ({ name: i.name, by: i.by_name, at: i.at })),
    ledger: (ledger?.results ?? []).map((l) => ({ at: l.at, who: l.who, kind: l.kind, amount: l.amount, balance: l.balance })),
    ...(marksOpen ? {
      marks: Number(marks?.balance ?? 0),
      marksLedger: (marksLines?.results ?? []).map((l) => ({ at: l.at, who: l.who, kind: GUILD_MARKS_LINE_KIND[l.kind] ?? 'deposit', raw: String(l.kind),
        out: l.src_kind === 'guild' && String(l.src_id) === String(guildId), amount: l.amount })),
      ...(await guildDeedsToday(db, guildId, nowS)),
    } : {}),
  };
}

const GUILD_MARKS_LINE_KIND = Object.freeze({
  'guild-withdraw': 'withdraw', heraldry: 'heraldry', 'guild-deed': 'deed', 'contract-escrow': 'contract', 'contract-return': 'contract-return',
});

async function targetOf(db, me, member) {
  const rid = memberIdOf(member);
  if (rid == null) return null;
  return db.prepare('SELECT rowid AS rid, * FROM guild_members WHERE rowid = ? AND guild_id = ?').bind(rid, me.guild_id).first();
}

const spend = (ctx, player) => overRate(ctx, `guild:${player.id}`, GUILD_OPS_MAX, GUILD_OPS_WINDOW_S);

export function guildWordRefusal(name, tag) {
  for (const w of [name, tag]) {
    if (!w || !normaliseName(w)) continue;
    const c = checkName(w);
    if (!c.ok) return c.word || w;
  }
  for (const w of String(name ?? '').split(/[\s'-]+/)) {
    const flat = normaliseName(w);
    if (!flat) continue;
    const c = checkName(w);
    if (c.ok) continue;
    if (c.kind !== 'impersonation') return c.word || w;
    const own = IMPERSONATION.find((x) => standsAlone(flat, x));
    if (own) return own;
  }
  return null;
}
export const guildWordsOk = (name, tag) => guildWordRefusal(name, tag) == null;

export async function renameGuild(ctx, player, { character, name = null, tag = null } = {}) {
  const { db, nowS } = ctx;
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  if (!guildMay(a.me.rank, 'rename')) return { error: 'guild-rank' };
  const gid = a.me.guild_id;
  const g = await db.prepare('SELECT * FROM guilds WHERE id = ?').bind(gid).first();
  if (!g) return { error: 'no-guild' };
  const n = name == null || name === '' ? g.name : guildNameOf(name);
  const t = tag == null || tag === '' ? g.tag : guildTagOf(tag);
  if (!n || !t) return { error: 'bad-guild' };
  if (n === g.name && t === g.tag) return { error: 'guild-rename-same' };
  const caught = guildWordRefusal(n, t);
  if (caught) return { error: 'guild-name-word', word: caught };
  const renamedAt = g.renamed_at == null ? null : Number(g.renamed_at);
  if (!guildRenameOpen(renamedAt, nowS)) return { error: 'guild-rename-soon', at: guildRenameAt(renamedAt) };
  const week = seatWeekOf(nowS * 1000);
  const battle = `EXISTS (SELECT 1 FROM town_seat_battles WHERE week = ${week} AND (attacker = ?1 OR defender = ?1) AND state <> 'void')`;
  if ((await db.prepare(`SELECT ${battle} AS b`).bind(gid).first())?.b) return { error: 'guild-rename-siege' };
  const advRank = await db.prepare('SELECT rank FROM npc_roll WHERE char_id = ? AND faction_id = ? AND member = 1').bind(character, ADVENTURERS_FACTION).first().catch(() => null);
  const cost = companyRenameCost(GUILD_RENAME_GOLD, advRank?.rank == null ? -1 : Number(advRank.rank));
  if (Number(g.realm_gold ?? 0) < cost) return { error: 'guild-rename-gold' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const key = guildNameKey(n);
  await db.prepare(`DELETE FROM guilds WHERE id != ?3 AND (name_key = ?1 OR tag = ?2) AND NOT EXISTS (SELECT 1 FROM guild_members m WHERE m.guild_id = guilds.id)
    AND treasury = 0 AND NOT EXISTS (SELECT 1 FROM guild_marks WHERE guild_id = guilds.id AND balance > 0) AND NOT ${guildKeepsSql('guilds.id')}`).bind(key, t, gid).run();
  const who = displayName(player);
  try {
    await db.batch([
      db.prepare(`UPDATE guilds SET name = ?2, name_key = ?3, tag = ?4, renamed_at = ?5, treasury = treasury - ?6, realm_gold = realm_gold - ?6,
          moved_by = ?7, moved_at = ?5, moved_kind = 'rename'
        WHERE id = ?1 AND name = ?8 AND tag = ?9 AND realm_gold >= ?6 AND treasury >= ?6
          AND (renamed_at IS NULL OR renamed_at + ?10 <= ?5) AND NOT ${battle}
          AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?11 AND guild_id = ?1 AND rank = ${GUILD_RANK_MASTER})`)
        .bind(gid, n, key, t, nowS, cost, who, g.name, g.tag, GUILD_RENAME_COOLDOWN_S, a.me.rid),
      mustChange(db),
      db.prepare('INSERT INTO guild_renames (guild_id, at, who, old_name, old_tag, new_name, new_tag, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(gid, nowS, who, g.name, g.tag, n, t, cost),
      db.prepare('UPDATE homes SET owner_name = ? WHERE guild_id = ?').bind(n, gid),
    ]);
  } catch {
    if (await db.prepare('SELECT 1 FROM guilds WHERE name_key = ? AND id != ?').bind(key, gid).first()) return { error: 'guild-name-taken' };
    if (await db.prepare('SELECT 1 FROM guilds WHERE tag = ? AND id != ?').bind(t, gid).first()) return { error: 'guild-tag-taken' };
    const now = await db.prepare('SELECT realm_gold, renamed_at FROM guilds WHERE id = ?').bind(gid).first();
    if (!now) return { error: 'no-guild' };
    if (Number(now.realm_gold ?? 0) < cost) return { error: 'guild-rename-gold' };
    const was = now.renamed_at == null ? null : Number(now.renamed_at);
    if (!guildRenameOpen(was, nowS)) return { error: 'guild-rename-soon', at: guildRenameAt(was) };
    return { error: 'guild-rename-moved' };
  }
  const me = await memberRow(db, player.id, character);
  if (!me) return { error: 'no-guild' };
  return { ok: true, guild: await viewOf(db, gid, me, nowS, marksOpenFor(player, ctx.env), ctx.env), badge: badgeOfRow(me, t), cost };
}

/** @param {{db: any, nowS: number, rand: (b: Uint8Array) => void}} ctx */
export async function foundGuild(ctx, player, { character, name, tag, realm = null, region = null } = {}) {
  const { db, nowS, rand } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'guilds-need-account' };
  if (!charOk(character)) return { error: 'guild-character' };
  if (!REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  const n = guildNameOf(name);
  const t = guildTagOf(tag);
  if (!n || !t) return { error: 'bad-guild' };
  const caught = guildWordRefusal(n, t);
  if (caught) return { error: 'guild-name-word', word: caught };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const track = await renownTrackOf({ db }, player.id, character);
  if ((track?.level ?? 1) < GUILD_FOUND_RENOWN) return { error: 'guild-renown' };
  if (await memberRow(db, player.id, character)) return { error: 'guild-already' };
  const key = guildNameKey(n);
  await db.prepare(`DELETE FROM guilds WHERE (name_key = ?1 OR tag = ?2) AND NOT EXISTS (SELECT 1 FROM guild_members m WHERE m.guild_id = guilds.id)
    AND treasury = 0 AND NOT EXISTS (SELECT 1 FROM guild_marks WHERE guild_id = guilds.id AND balance > 0) AND NOT ${guildKeepsSql('guilds.id')}`).bind(key, t).run();
  const id = mintGuildId(rand);
  const prep = side.at ? await prepareRealmRecord(ctx, player.id, side.at, (save) => (payFromSave(save, GUILD_FOUND_GOLD, region) ? null : 'realm-gold')) : null;
  if (prep?.error) return prep;
  try {
    await db.batch([
      ...(prep?.steps ?? []),
      db.prepare('INSERT INTO guilds (id, name, name_key, tag, ranks, treasury, founded_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .bind(id, n, key, t, JSON.stringify(GUILD_RANK_NAMES), nowS),
      db.prepare(`INSERT INTO guild_members (player, char_id, guild_id, rank, name, joined_at) VALUES (?, ?, ?, ${GUILD_RANK_MASTER}, ?, ?)`)
        .bind(player.id, character, id, displayName(player), nowS),
    ]);
  } catch {
    if (prep) await dropIfUnnamed(db, ctx.bucket, player.id, character, prep.key);
    const moved = side.at ? await recordMovedOf(db, player.id, side.at) : null;
    if (moved) return moved;
    if (await db.prepare('SELECT 1 FROM guilds WHERE name_key = ?').bind(key).first()) return { error: 'guild-name-taken' };
    if (await db.prepare('SELECT 1 FROM guilds WHERE tag = ?').bind(t).first()) return { error: 'guild-tag-taken' };
    return { error: 'guild-already' };
  }
  if (prep) await dropObjects(ctx.bucket, [prep.prev]);
  const me = await memberRow(db, player.id, character);
  return { ok: true, guild: await viewOf(db, id, me, nowS, marksOpenFor(player, ctx.env), ctx.env), badge: badgeOfRow(me, t), ...(prep ? { realm: { seq: prep.seq } } : {}) };
}

export async function guildOf({ db, nowS, env }, player, { character } = {}) {
  const a = await actorOf(db, player, character);
  if (a.error === 'no-guild') return { ok: true, guild: null, badge: {} };
  if (a.error) return a;
  const guild = await viewOf(db, a.me.guild_id, a.me, nowS, marksOpenFor(player, env), env);
  return { ok: true, guild, badge: guild ? badgeOfRow(a.me, guild.tag) : {} };
}

export async function invitesOf({ db, nowS }, player) {
  if (accountKind(player) !== 'linked') return { ok: true, invites: [] };
  const r = await db.prepare(`SELECT i.guild_id, i.by_name, i.at, g.name, g.tag FROM guild_invites i JOIN guilds g ON g.id = i.guild_id
    WHERE i.player = ? AND i.at > ? ORDER BY i.at DESC`).bind(player.id, nowS - GUILD_INVITE_TTL_S).all();
  return { ok: true, invites: (r?.results ?? []).map((i) => ({ guild: i.guild_id, name: i.name, tag: i.tag, by: i.by_name, at: i.at })) };
}

export async function inviteToGuild(ctx, player, { character, handle } = {}) {
  const { db, nowS } = ctx;
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  if (!guildMay(a.me.rank, 'invite')) return { error: 'guild-rank' };
  if (typeof handle !== 'string' || !HANDLE_RE.test(handle)) return { error: 'no-player' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const target = await db.prepare('SELECT id FROM players WHERE handle_lc = ?').bind(handle.toLowerCase()).first();
  if (!target) return { error: 'no-player' };
  const n = await db.prepare('SELECT COUNT(*) AS n FROM guild_members WHERE guild_id = ?').bind(a.me.guild_id).first();
  if ((n?.n ?? 0) >= GUILD_MEMBERS_MAX) return { error: 'guild-full' };
  await db.batch([
    db.prepare('DELETE FROM guild_invites WHERE guild_id = ? AND at <= ?').bind(a.me.guild_id, nowS - GUILD_INVITE_TTL_S),
    db.prepare('INSERT OR REPLACE INTO guild_invites (guild_id, player, by_name, at) VALUES (?, ?, ?, ?)').bind(a.me.guild_id, target.id, displayName(player), nowS),
  ]);
  return { ok: true };
}

export async function answerInvite({ db, nowS, env }, player, { character, guild, accept } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'guilds-need-account' };
  if (typeof guild !== 'string' || !GUILD_ID_RE.test(guild)) return { error: 'no-invite' };
  const live = nowS - GUILD_INVITE_TTL_S;
  if (accept !== true) {
    const gone = await db.prepare('DELETE FROM guild_invites WHERE guild_id = ? AND player = ? AND at > ? RETURNING guild_id').bind(guild, player.id, live).first();
    return gone ? { ok: true, guild: null } : { error: 'no-invite' };
  }
  if (!charOk(character)) return { error: 'guild-character' };
  const standing = () => db.prepare('SELECT 1 FROM guild_invites WHERE guild_id = ? AND player = ? AND at > ?').bind(guild, player.id, live).first();
  if (!(await standing())) return { error: 'no-invite' };
  if (await memberRow(db, player.id, character)) return { error: 'guild-already' };
  let joined;
  try {
    [joined] = await db.batch([
      db.prepare(`INSERT INTO guild_members (player, char_id, guild_id, rank, name, joined_at)
        SELECT ?1, ?2, ?3, ${GUILD_RANK_RECRUIT}, ?4, ?5
        WHERE EXISTS (SELECT 1 FROM guild_invites WHERE guild_id = ?3 AND player = ?1 AND at > ?6)
          AND (SELECT COUNT(*) FROM guild_members WHERE guild_id = ?3) < ?7`)
        .bind(player.id, character, guild, displayName(player), nowS, live, GUILD_MEMBERS_MAX),
      db.prepare('DELETE FROM guild_invites WHERE guild_id = ?1 AND player = ?2 AND EXISTS (SELECT 1 FROM guild_members WHERE player = ?2 AND char_id = ?3 AND guild_id = ?1)')
        .bind(guild, player.id, character),
    ]);
  } catch {
    return { error: 'guild-already' };
  }
  if (!joined?.meta?.changes) return { error: (await standing()) ? 'guild-full' : 'no-invite' };
  const me = await memberRow(db, player.id, character);
  const view = await viewOf(db, guild, me, nowS, marksOpenFor(player, env), env);
  return { ok: true, guild: view, badge: view ? badgeOfRow(me, view.tag) : {} };
}

const SEAT_BATTLE_PENDING = 'week > COALESCE((SELECT MAX(week) FROM town_seat_weeks), -1)';

/** @type {readonly (readonly [string, (p: string) => string])[]} */
const GUILD_HOLDS = Object.freeze([
  ['guild-stores', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM guild_prof_stores WHERE guild_id = ${p} AND qty > 0)`],
  ['guild-writs', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM guild_writs WHERE guild_id = ${p} AND state = 'open')`],
  // The unary + keeps SQLite on the (guild_id, state) index rather than the realm-wide returned one,
  // because D1 keeps no statistics.
  ['guild-writ-escrow', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM guild_writs WHERE guild_id = ${p} AND state IN ('filled', 'withdrawn', 'expired') AND +returned = 0 AND escrow > 0)`],
  ['guild-contracts', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM guild_contracts WHERE guild_id = ${p} AND state = 'open')`],
  ['guild-writ-escrow', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM guild_contracts WHERE guild_id = ${p} AND state IN ('filled', 'withdrawn', 'expired') AND +returned = 0 AND escrow > 0)`],
  ['guild-hall', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM homes WHERE guild_id = ${p})`],
  ['guild-vault', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM guild_vault WHERE guild_id = ${p})`],
  ['guild-seat', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM town_seat_holds WHERE guild_id = ${p})`],
  ['guild-battle', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM town_seat_rights WHERE (guild_id = ${p} OR against = ${p}) AND ${SEAT_BATTLE_PENDING})`],
  ['guild-patron', (/** @type {string} */ p) => `EXISTS (SELECT 1 FROM npc_chapter_patron_bids WHERE guild_id = ${p} AND state = 'open')`],
]);
// GUILD_HOLD_CODES in src/ui/socialPanel.js must include every code here.
export const GUILD_HOLD_KEEP_CODES = Object.freeze([...new Set(GUILD_HOLDS.map(([code]) => code))]);
export const guildKeepsSql = (/** @type {string} */ p) => `(${GUILD_HOLDS.map(([, sql]) => sql(p)).join('\n  OR ')})`;

async function endGuild(db, guildId, player, nowS, { alone = false } = {}) {
  const [, gone] = await db.batch([
    guildMarksSweep(db, guildId, player, nowS, { alone }),
    db.prepare(`DELETE FROM guilds WHERE id = ?1 AND treasury = 0 AND NOT EXISTS (SELECT 1 FROM guild_marks WHERE guild_id = ?1 AND balance > 0)
      AND NOT ${guildKeepsSql('?1')}
      AND (?2 = 0 OR (SELECT COUNT(*) FROM guild_members WHERE guild_id = ?1) = 1)`).bind(guildId, alone ? 1 : 0),
  ]);
  return gone;
}
export const GUILD_HOLDS_SQL = `SELECT (SELECT treasury FROM guilds WHERE id = ?1) AS treasury,
      ${GUILD_HOLDS.map(([, sql], n) => `${sql('?1')} AS h${n}`).join(',\n      ')},
      COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) > 0
        AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) + COALESCE((SELECT balance FROM marks WHERE account = ?2), 0) > ${MARKS_MAX} AS marks_full`;
async function guildHolds(db, guildId, account) {
  const r = await db.prepare(GUILD_HOLDS_SQL).bind(guildId, String(account ?? '')).first();
  if (!r || r.treasury == null) return null;
  /** @type {string[]} */
  const keeps = [];
  const holds = (/** @type {unknown} */ yes, /** @type {string} */ code) => { if (Number(yes) > 0 && !keeps.includes(code)) keeps.push(code); };
  holds(r.treasury, 'guild-treasury');
  GUILD_HOLDS.forEach(([code], n) => holds(r[`h${n}`], code));
  holds(r.marks_full, 'marks-full');
  return keeps;
}
async function whyNotGone(db, guildId, { alone = false, account = null } = {}) {
  /** @type {string[]} */
  const keeps = [];
  if (alone) {
    const n = await db.prepare('SELECT COUNT(*) AS n FROM guild_members WHERE guild_id = ?').bind(guildId).first();
    if ((n?.n ?? 0) > 1) keeps.push('guild-master-leaves');
  }
  const held = await guildHolds(db, guildId, account);
  if (!held) return keeps.length ? keeps : ['no-guild'];
  keeps.push(...held);
  return keeps.length ? keeps : ['marks-full'];
}
const notGone = (/** @type {string[]} */ keeps) => ({ error: keeps[0], keeps });

export async function leaveGuild({ db, nowS }, player, { character } = {}) {
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  if (a.me.rank === GUILD_RANK_MASTER) {
    const r = await endGuild(db, a.me.guild_id, player, nowS, { alone: true });
    if (r?.meta?.changes) return { ok: true, disbanded: true, badge: {}, out: { s: player.id, gi: a.me.guild_id } };
    return notGone(await whyNotGone(db, a.me.guild_id, { alone: true, account: player.id }));
  }
  const r = await db.prepare('DELETE FROM guild_members WHERE rowid = ? AND guild_id = ?').bind(a.me.rid, a.me.guild_id).run();
  if (!r?.meta?.changes) return { error: 'no-guild' };
  // The member row in the out order lets the hub drop every socket wearing it and refuse older tokens.
  return { ok: true, badge: {}, out: { s: player.id, gi: a.me.guild_id, gm: `m${a.me.rid}` } };
}

export async function removeFromGuild(ctx, player, { character, member } = {}) {
  const { db } = ctx;
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  const t = await targetOf(db, a.me, member);
  if (!t) return { error: 'no-member' };
  if (!guildMay(a.me.rank, 'remove') || !guildOutranks(a.me.rank, t.rank)) return { error: 'guild-rank' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const r = await db.prepare('DELETE FROM guild_members WHERE rowid = ? AND guild_id = ? AND rank = ?').bind(t.rid, a.me.guild_id, t.rank).run();
  return r?.meta?.changes ? { ok: true, out: { s: t.player, gi: a.me.guild_id, gm: `m${t.rid}` } } : { error: 'no-member' };
}

export async function rankGuildMember(ctx, player, { character, member, rank } = {}) {
  const { db } = ctx;
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  const t = await targetOf(db, a.me, member);
  if (!t) return { error: 'no-member' };
  if (!guildMayMove(a.me.rank, t.rank, rank)) return { error: 'guild-rank' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  const r = await db.prepare('UPDATE guild_members SET rank = ? WHERE rowid = ? AND guild_id = ? AND rank = ?').bind(rank, t.rid, a.me.guild_id, t.rank).run();
  return r?.meta?.changes ? { ok: true } : { error: 'no-member' };
}

export async function renameGuildRanks(ctx, player, { character, ranks } = {}) {
  const { db } = ctx;
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  if (!guildMay(a.me.rank, 'renameRanks')) return { error: 'guild-rank' };
  const names = guildRankNamesOf(ranks);
  if (!names) return { error: 'bad-ranks' };
  const caught = names.map(textCaught).find(Boolean);
  if (caught) return { error: 'guild-rank-word', word: caught };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  await db.prepare('UPDATE guilds SET ranks = ? WHERE id = ?').bind(JSON.stringify(names), a.me.guild_id).run();
  return { ok: true, ranks: names };
}

async function moveTreasury(db, me, who, kind, gold, nowS) {
  const row = kind === 'deposit'
    ? await db.prepare('UPDATE guilds SET treasury = treasury + ?1, moved_by = ?4, moved_at = ?5 WHERE id = ?2 AND treasury + ?1 <= ?3 RETURNING treasury')
      .bind(gold, me.guild_id, GUILD_TREASURY_MAX, who, nowS).first()
    : await db.prepare('UPDATE guilds SET treasury = treasury - ?1, realm_gold = MIN(realm_gold, treasury - ?1), moved_by = ?3, moved_at = ?4 WHERE id = ?2 AND treasury >= ?1 RETURNING treasury')
      .bind(gold, me.guild_id, who, nowS).first();
  return row ? row.treasury : null;
}

async function realmTreasury(ctx, player, me, at, kind, gold, region, letter = false) {
  const { db, bucket, nowS } = ctx;
  const prep = await prepareRealmRecord(ctx, player.id, at, (save) => (kind === 'deposit'
    ? (payFromSave(save, gold, region) ? null : 'realm-gold')
    : (creditSave(save, gold, { letter }) ? null : 'bad-gold')), { outbound: kind === 'deposit' });
  if (prep.error) return prep;
  const move = kind === 'deposit'
    ? db.prepare('UPDATE guilds SET treasury = treasury + ?1, realm_gold = realm_gold + ?1, moved_by = ?4, moved_at = ?5 WHERE id = ?2 AND treasury + ?1 <= ?3').bind(gold, me.guild_id, GUILD_TREASURY_MAX, displayName(player), nowS)
    : db.prepare('UPDATE guilds SET treasury = treasury - ?1, realm_gold = realm_gold - ?1, moved_by = ?3, moved_at = ?4 WHERE id = ?2 AND treasury >= ?1 AND realm_gold >= ?1').bind(gold, me.guild_id, displayName(player), nowS);
  try {
    await db.batch([...prep.steps, move, mustChange(db)]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, at.id, prep.key);
    const moved = await recordMovedOf(db, player.id, at);
    if (moved) return moved;
    if (kind === 'deposit') return { error: 'guild-treasury-full' };
    const g = await db.prepare('SELECT treasury FROM guilds WHERE id = ?').bind(me.guild_id).first();
    return { error: (g?.treasury ?? 0) >= gold ? 'guild-treasury-old' : 'guild-treasury-short' };
  }
  await dropObjects(bucket, [prep.prev]);
  const g = await db.prepare('SELECT treasury FROM guilds WHERE id = ?').bind(me.guild_id).first();
  return { ok: true, treasury: g?.treasury ?? 0, realm: { seq: prep.seq } };
}

export async function depositToGuild(ctx, player, { character, gold, realm = null, region = null } = {}) {
  const { db } = ctx;
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  if (!guildMay(a.me.rank, 'deposit')) return { error: 'guild-rank' };
  if (!guildGoldOk(gold)) return { error: 'bad-gold' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  if (side.at) return realmTreasury(ctx, player, a.me, side.at, 'deposit', gold, region);
  return { error: 'realm-needed' };
}

export async function withdrawFromGuild(ctx, player, { character, gold, realm = null, letter = false } = {}) {
  const { db, nowS } = ctx;
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  if (!guildMay(a.me.rank, 'withdraw')) return { error: 'guild-rank' };
  if (!guildGoldOk(gold)) return { error: 'bad-gold' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  if (side.at) return realmTreasury(ctx, player, a.me, side.at, 'withdraw', gold, null, letter);
  const treasury = await moveTreasury(db, a.me, displayName(player), 'withdraw', gold, nowS);
  return treasury == null ? { error: 'guild-treasury-short' } : { ok: true, treasury };
}

export async function handOverGuild(ctx, player, { character, member } = {}) {
  const { db } = ctx;
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  if (!guildMay(a.me.rank, 'handOver')) return { error: 'guild-rank' };
  const t = await targetOf(db, a.me, member);
  if (!t || t.rid === a.me.rid) return { error: 'no-member' };
  if (await spend(ctx, player)) return { error: 'guild-rate' };
  // The target is promoted only while the giver is guildmaster, and the giver steps down only once the target is.
  const [given] = await db.batch([
    db.prepare(`UPDATE guild_members SET rank = ${GUILD_RANK_MASTER} WHERE rowid = ?1 AND guild_id = ?2
      AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?3 AND guild_id = ?2 AND rank = ${GUILD_RANK_MASTER})`).bind(t.rid, a.me.guild_id, a.me.rid),
    db.prepare(`UPDATE guild_members SET rank = ${GUILD_RANK_OFFICER} WHERE rowid = ?1 AND guild_id = ?2
      AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?3 AND guild_id = ?2 AND rank = ${GUILD_RANK_MASTER})`).bind(a.me.rid, a.me.guild_id, t.rid),
  ]);
  return given?.meta?.changes ? { ok: true } : { error: 'no-member' };
}

export async function disbandGuild({ db, nowS }, player, { character } = {}) {
  const a = await actorOf(db, player, character);
  if (a.error) return a;
  if (!guildMay(a.me.rank, 'disband')) return { error: 'guild-rank' };
  const r = await endGuild(db, a.me.guild_id, player, nowS);
  return r?.meta?.changes ? { ok: true, badge: {}, out: { s: player.id, gi: a.me.guild_id } } : notGone(await whyNotGone(db, a.me.guild_id, { account: player.id }));
}
