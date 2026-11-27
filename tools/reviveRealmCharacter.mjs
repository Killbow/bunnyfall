#!/usr/bin/env node
// Plans the guarded SQL that revives a dead realm character. Run: node tools/reviveRealmCharacter.mjs <mode>, with:
// --query <q> --player <id> [--fallen <id>] [--line <id>] [--guild <id>] [--uids <file>].
// --find --handle <handle> --facts <find.json> [--character <id>].
// --plan --then <t.json> --now <n.json> --find <f.json> --out <r.sql> --summary <s> [--keep-homes, --keep-guild].

import { readFileSync, writeFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';
import { isHandleShaped } from '../src/net/handleShape.js';
import { stampRevived, dropRevived, revivedOf } from '../src/systems/legacy/revived.js';
import { GUILD_RANK_MASTER, GUILD_MEMBERS_MAX, GUILD_ID_RE } from '../src/net/guildLaw.js';
import { ID_RE, REALM_CHARACTER_RE } from '../src/net/identityToken.js';
import { ITEM_UID_RE } from '../src/items/itemLaw.js';
import { REALM_CHARACTERS_MAX } from '../server-account/src/realm.js';
import { LINEAGE_ID_RE } from '../server-account/src/legacy.js';

export const DEATH_WINDOW = Object.freeze({ from: Date.parse('2026-10-12T12:00:00Z') / 1000, to: Date.parse('2026-10-14T12:00:00Z') / 1000 });
export const BEFORE_DEATH_S = 120;
// The rev moves this far past every copy's so the stored record stays newest; a stale copy merges it in.
export const REV_MARGIN = 100;
export const STATEMENT_MAX_BYTES = 100_000;

export const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const KEY_RE = ITEM_UID_RE;

// Each query is scoped to one account, and every id is checked against its shape before it is spliced in.
export function query(name, { player, fallen = null, line = null, guild = null, uids = [] }) {
  if (typeof player !== 'string' || !ID_RE.test(player)) throw new Error('the player is not an account id');
  if (fallen != null && !REALM_CHARACTER_RE.test(fallen)) throw new Error('the fallen is not a realm character id');
  if (line != null && !LINEAGE_ID_RE.test(line)) throw new Error('the line is not a line id');
  if (guild != null && !GUILD_ID_RE.test(guild)) throw new Error('the guild is not a guild id');
  const P = sqlStr(player), F = fallen && sqlStr(fallen);
  switch (name) {
    case 'player': throw new Error('the player is asked by handle: playerQuery');
    case 'chars': return `SELECT id, name, lineage_id, person_id, dead_at, dead_why, created_at FROM realm_characters WHERE player = ${P}`;
    case 'lineages': return `SELECT id, model, rev, record FROM lineages WHERE player = ${P}`;
    case 'homes': return `SELECT map_id, building_key, char_id, guild_id, deed FROM homes WHERE player = ${P}`;
    case 'seat': return `SELECT player, char_id, guild_id, rank, name, joined_at, vault_level, vault_limit, vault_day, vault_taken FROM guild_members WHERE player = ${P} AND char_id = ${F}`;
    case 'guild': return guild ? `SELECT g.id, (SELECT COUNT(*) FROM guild_members m WHERE m.guild_id = g.id) AS members, (SELECT player || ':' || char_id FROM guild_members m WHERE m.guild_id = g.id AND m.rank = ${GUILD_RANK_MASTER} LIMIT 1) AS master FROM guilds g WHERE g.id = ${sqlStr(guild)}` : 'SELECT 1 WHERE 0';
    case 'items': return `SELECT uid, state FROM item_uids WHERE char_id = ${F}`;
    case 'itemsNow': {
      const list = uids.filter((u) => typeof u === 'string' && KEY_RE.test(u));
      return list.length ? `SELECT uid, player, char_id, state FROM item_uids WHERE uid IN (${list.map(sqlStr).join(', ')})` : 'SELECT 1 WHERE 0';
    }
    case 'unions': return `SELECT sid, a_player, a_char, b_player, b_char, ended_at, ended_why, ended_by FROM realm_unions WHERE a_char = ${F} OR b_char = ${F}`;
    default: throw new Error(`no query named ${name}`);
  }
}

export function playerQuery(handle) {
  if (!isHandleShaped(handle)) throw new Error('not a handle');
  return `SELECT id, handle FROM players WHERE handle_lc = ${sqlStr(handle.toLowerCase())} AND handle IS NOT NULL`;
}

const parseRecord = (text) => { try { return typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; } };
const personOf = (rec, id) => (rec?.people ?? []).find((p) => p?.id === id) ?? null;

/** @param {{ player: {id:string,handle:string}|null, chars: any[], lineages: any[] }} facts */
export function findFallen(facts, { character = null, window = DEATH_WINDOW } = {}) {
  if (!facts.player) return { error: 'no registered account by that handle' };
  const chars = facts.chars ?? [];
  const dead = character ? chars.filter((c) => c.id === character)
    : chars.filter((c) => c.dead_at != null && c.dead_at >= window.from && c.dead_at <= window.to && c.dead_why === 'fell');
  if (dead.length !== 1) return { error: character ? `no realm character ${character} on this account` : `${dead.length} realm characters of this account fell in the window - name one with --character` };
  const fallen = dead[0];
  const lineRow = (facts.lineages ?? []).find((l) => l.id === fallen.lineage_id);
  if (!lineRow) return { error: 'the character is no member of a line this account holds online' };
  const rec = parseRecord(lineRow.record);
  const person = personOf(rec, fallen.person_id);
  if (!person) return { error: 'the line holds no such person' };
  const diedAt = person.died ? Number(person.died.at) : revivedOf(person).at(-1);
  if (!Number.isFinite(diedAt)) return { error: 'the line says nothing of a death to take back' };
  const living = chars.filter((c) => c.dead_at == null).length;
  const heirs = chars.filter((c) => c.lineage_id === fallen.lineage_id && c.dead_at == null && c.id !== fallen.id && (fallen.dead_at == null || c.created_at >= fallen.dead_at)).map((c) => c.id);
  return { fallen: fallen.id, name: fallen.name, line: lineRow.id, model: lineRow.model, rev: lineRow.rev, person: person.id, diedAt, deadAt: fallen.dead_at, cause: person.died?.cause ?? null, place: person.died?.place ?? null, heirs, living };
}

export function planRevive({ then, now, found, player, nowS, restoreHomes = true, restoreGuild = true }) {
  const sql = [], held = [], said = [];
  const P = sqlStr(player), F = sqlStr(found.fallen);
  const fallenNow = (now.chars ?? []).find((c) => c.id === found.fallen);
  let tombstone = null;
  if (fallenNow?.dead_at != null) {
    if (found.living >= REALM_CHARACTERS_MAX) held.push(`the account holds ${found.living} living realm characters - the revived one would fall off the roster's ${REALM_CHARACTERS_MAX}; delete one first`);
    else {
      tombstone = `UPDATE realm_characters SET dead_at = NULL, dead_why = NULL, lease = NULL, updated_at = ${nowS} WHERE id = ${F} AND player = ${P} AND dead_at = ${fallenNow.dead_at} AND dead_why = 'fell' AND (SELECT COUNT(*) FROM realm_characters WHERE player = ${P} AND dead_at IS NULL) < ${REALM_CHARACTERS_MAX};`;
      said.push(`the tombstone of ${found.name ?? found.fallen} (dead at ${new Date(fallenNow.dead_at * 1000).toISOString()}) cleared`);
    }
  } else said.push(`${found.name ?? found.fallen} stands already - no tombstone to clear`);

  const lineNow = (now.lineages ?? []).find((l) => l.id === found.line);
  const rec = parseRecord(lineNow?.record);
  const me = personOf(rec, found.person);
  const heirPersons = new Set((now.chars ?? []).filter((c) => found.heirs.includes(c.id)).map((c) => c.person_id));
  if (rec && me) {
    const was = JSON.parse(JSON.stringify(rec));
    const before = JSON.stringify(rec);
    stampRevived(me, found.diedAt);
    dropRevived(rec);
    let houses = 0;
    if (restoreHomes) {
      rec.houses = (rec.houses ?? []).map((h) => {
        if (h?.from !== me.id || !heirPersons.has(h.by)) return h;
        houses++;
        const { from, ...row } = h;   // eslint-disable-line no-unused-vars
        return { ...row, by: me.id };
      });
    }
    if (JSON.stringify(rec) !== before) {
      rec.rev = Math.max(Number(lineNow.rev) || 0, Number(rec.rev) || 0) + REV_MARGIN;
      const edit = recordEdit(was, rec);
      if (!edit) held.push('the line\'s record changed past what an edit in place can say - nothing written to it');
      else {
        sql.push(`UPDATE lineages SET record = ${edit}, rev = ${rec.rev}, updated_at = ${nowS} WHERE player = ${P} AND id = ${sqlStr(found.line)} AND rev = ${lineNow.rev};`);
        said.push(`the line's record: her death (at ${found.diedAt}) taken back and stamped, its remains and its Succession dropped${houses ? `, ${houses} house row(s) hers again` : ''}; rev ${lineNow.rev} -> ${rec.rev}`);
      }
    } else said.push('the line\'s record already holds her alive and stamped');
  } else held.push('the line or her person is not in the record as it stands - nothing written to it');
  // The tombstone clears after the line is written: a run cut between them leaves the character dead,
  // never alive under a line whose next write entombs it again.
  if (tombstone) sql.push(tombstone);

  const homesThen = (then.homes ?? []).filter((h) => h.char_id === found.fallen);
  for (const h of homesThen) {
    const n = (now.homes ?? []).find((x) => x.map_id === h.map_id && x.building_key === h.building_key);
    const where = `home ${h.map_id}:${h.building_key}`;
    if (!n) { held.push(`${where} is no longer this account's - not written`); continue; }
    if (n.char_id === found.fallen) { said.push(`${where} is hers already`); continue; }
    if (!restoreHomes) { said.push(`${where} stays with ${n.char_id} (homes kept)`); continue; }
    if (!found.heirs.includes(n.char_id) || n.guild_id != null) { held.push(`${where} is held by ${n.char_id}${n.guild_id ? ' as a guild hall' : ''}, not her heir - not written`); continue; }
    sql.push(`UPDATE homes SET char_id = ${F} WHERE player = ${P} AND char_id = ${sqlStr(n.char_id)} AND map_id = ${h.map_id} AND building_key = ${h.building_key} AND guild_id IS NULL;`);
    said.push(`${where} hers again (from ${n.char_id})${n.deed ? ' - a knight\'s house: the heir\'s save still holds its bank deed' : ''}`);
  }

  const seat = (then.seat ?? [])[0];
  if (seat) {
    const g = (now.guild ?? [])[0];
    const where = `her seat in guild ${seat.guild_id} (rank ${seat.rank})`;
    if (!restoreGuild) said.push(`${where} not put back (guild kept)`);
    else if (!g) held.push(`${where}: the guild is gone - not written`);
    else if (seat.rank === GUILD_RANK_MASTER && g.master && g.master !== `${player}:${found.fallen}`) held.push(`${where}: she was its master, and ${g.master} was made master at her death - not written; the master's call`);
    else if (g.members >= GUILD_MEMBERS_MAX) held.push(`${where}: the guild is full (${g.members}) - not written`);
    else {
      const v = (x) => (x == null ? 'NULL' : typeof x === 'number' ? String(x) : sqlStr(x));
      sql.push(`INSERT OR IGNORE INTO guild_members (player, char_id, guild_id, rank, name, joined_at, vault_level, vault_limit, vault_day, vault_taken) SELECT ${[seat.player, seat.char_id, seat.guild_id, seat.rank, seat.name, seat.joined_at, seat.vault_level, seat.vault_limit, seat.vault_day, seat.vault_taken].map(v).join(', ')} WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ${sqlStr(seat.guild_id)}) AND (SELECT COUNT(*) FROM guild_members WHERE guild_id = ${sqlStr(seat.guild_id)}) < ${GUILD_MEMBERS_MAX};`);
      said.push(`${where} put back, joined as she joined`);
    }
  } else said.push('she held no guild seat');

  const heldThen = (then.items ?? []).filter((r) => r.state === 'held').map((r) => r.uid);
  const byUid = new Map((now.items ?? []).map((r) => [r.uid, r]));
  let back = 0, others = 0, free = 0;
  for (const uid of heldThen) {
    const r = byUid.get(uid);
    if (!r) { free++; continue; }
    if (r.char_id === found.fallen) continue;
    if (r.player === player && found.heirs.includes(r.char_id)) {
      sql.push(`UPDATE item_uids SET char_id = ${F}, state = 'held', claim_char = NULL, claim_at = NULL, at = ${nowS} WHERE uid = ${sqlStr(uid)} AND char_id = ${sqlStr(r.char_id)};`);
      sql.push(`INSERT OR IGNORE INTO item_dupes (uid, char_id, at) VALUES (${sqlStr(uid)}, ${sqlStr(r.char_id)}, ${nowS});`);
      back++;
    } else if (r.player !== player) others++;
  }
  said.push(`the ledger: ${heldThen.length} piece(s) she held; ${back} her heir holds, hers again; ${free} nobody holds (her next checkpoints register them)${others ? `; ${others} another account holds now - not written` : ''}`);
  if (others) held.push(`${others} of her pieces are held by another account now - not written`);

  for (const u of then.unions ?? []) {
    if (u.ended_at != null) continue;
    const other = u.a_char === found.fallen ? `${u.b_player}:${u.b_char}` : `${u.a_player}:${u.a_char}`;
    held.push(`she was wed to ${other}; the union ended at her death and their house heard it - not reopened`);
  }
  // A partial revive is worse than none, so one statement past D1's limit empties the whole plan.
  const long = sql.filter((q) => new TextEncoder().encode(q).length > STATEMENT_MAX_BYTES);
  if (long.length) {
    held.push(`${long.length} statement(s) longer than D1 takes (${STATEMENT_MAX_BYTES} bytes) - NOTHING written: ${long.map((q) => q.slice(0, 40)).join('; ')}`);
    sql.length = 0;
  }
  return { sql, held, said };
}

// The record is edited in place because a whole record can pass D1's statement limit; a replay proves the edit.
/** @param {any} was @param {any} rec @returns {string | null} */
export function recordEdit(was, rec) {
  const same = (a, b) => canon(a) === canon(b);
  const keys = new Set([...Object.keys(was ?? {}), ...Object.keys(rec ?? {})]);
  for (const k of keys) if (!['people', 'remains', 'pending', 'houses', 'rev'].includes(k) && !same(was[k], rec[k])) return null;
  if ((was.people ?? []).length !== (rec.people ?? []).length || (was.houses ?? []).length !== (rec.houses ?? []).length) return null;
  const sets = [];
  rec.people.forEach((p, i) => { if (!same(was.people[i], p)) sets.push([`$.people[${i}]`, p]); });
  (rec.houses ?? []).forEach((h, i) => { if (!same(was.houses[i], h)) sets.push([`$.houses[${i}]`, h]); });
  if (!same(was.pending ?? null, rec.pending ?? null)) sets.push(['$.pending', rec.pending ?? null]);
  sets.push(['$.rev', rec.rev]);
  const gone = [];
  const kept = rec.remains ?? [];
  let m = 0;
  (was.remains ?? []).forEach((r, k) => { if (m < kept.length && same(r, kept[m])) m++; else gone.push(k); });
  if (m !== kept.length) return null;
  const made = JSON.parse(JSON.stringify(was));
  for (const k of [...gone].reverse()) made.remains.splice(k, 1);
  for (const [path, v] of sets) {
    const at = /^\$\.(\w+)(?:\[(\d+)\])?$/.exec(path);
    if (at[2] == null) made[at[1]] = v; else made[at[1]][Number(at[2])] = v;
  }
  if (!same(made, rec)) return null;
  const removed = gone.length ? `json_remove(record, ${[...gone].reverse().map((k) => sqlStr(`$.remains[${k}]`)).join(', ')})` : 'record';
  return `json_set(${removed}, ${sets.map(([path, v]) => `${sqlStr(path)}, json(${sqlStr(JSON.stringify(v))})`).join(', ')})`;
}
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

export function summaryOf({ handle, found, plan, apply }) {
  const lines = [
    `## Revive: ${handle}`,
    '',
    `- **${found.name ?? found.fallen}** (${found.fallen}), a member of the ${found.model} line ${found.line} - died ${found.cause ?? 'of an unknown cause'}${found.place?.region ? ` in ${found.place.region}` : ''} (world minute ${found.diedAt}).`,
    `- Heir(s) since: ${found.heirs.length ? found.heirs.join(', ') : 'none'}. Living realm characters now: ${found.living}.`,
    '',
    '### What the run writes',
    ...plan.said.map((s) => `- ${s}`),
    '',
    '### Held for you (nothing written)',
    ...(plan.held.length ? plan.held.map((s) => `- ${s}`) : ['- nothing']),
    '',
    `${plan.sql.length} statement(s).`,
    apply ? '**Applied.**' : '**A dry run: nothing was written.** Run again with apply on to write it.',
    '',
    'Tell the player: close every tab of the game, then play her from the Online door. Her years are still spent - an Enduring elder\'s next death is final.',
  ];
  return `${lines.join('\n')}\n`;
}

const rowsOf = (text) => { const j = JSON.parse(text); return Array.isArray(j) ? (j[0]?.results ?? []) : (j.results ?? []); };

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const has = (k) => argv.includes(k);
  // The mode is the first argument only, because the --plan command line also carries --find <file>.
  const mode = argv[0];
  try {
    if (mode === '--player-query') {
      process.stdout.write(playerQuery(arg('--handle')));
    } else if (mode === '--query') {
      const uids = arg('--uids') ? rowsOf(readFileSync(arg('--uids'), 'utf8')).filter((r) => r.state === 'held').map((r) => r.uid) : [];
      process.stdout.write(query(arg('--query'), { player: arg('--player'), fallen: arg('--fallen') || null, line: arg('--line') || null, guild: arg('--guild') || null, uids }));
    } else if (mode === '--find') {
      const handle = arg('--handle');
      if (!isHandleShaped(handle)) throw new Error('not a handle');
      const facts = JSON.parse(readFileSync(arg('--facts'), 'utf8'));
      const character = arg('--character') || null;
      if (character && !REALM_CHARACTER_RE.test(character)) throw new Error('not a realm character id');
      const found = findFallen(facts, { character });
      if (found.error) throw new Error(found.error);
      process.stdout.write(JSON.stringify({ player: facts.player.id, ...found, before: found.deadAt != null ? found.deadAt - BEFORE_DEATH_S : null }));
    } else if (mode === '--plan') {
      const found = JSON.parse(readFileSync(arg('--find'), 'utf8'));
      const then = JSON.parse(readFileSync(arg('--then'), 'utf8'));
      const now = JSON.parse(readFileSync(arg('--now'), 'utf8'));
      const plan = planRevive({ then, now, found, player: found.player, nowS: Math.floor(Date.now() / 1000), restoreHomes: !has('--keep-homes'), restoreGuild: !has('--keep-guild') });
      writeFileSync(arg('--out'), plan.sql.join('\n') + (plan.sql.length ? '\n' : ''));
      writeFileSync(arg('--summary'), summaryOf({ handle: arg('--handle') ?? found.player, found, plan, apply: has('--apply') }));
      process.stdout.write(`${plan.sql.length} statement(s), ${plan.held.length} held\n`);
    } else {
      console.error('usage: see the head of this file');
      process.exit(2);
    }
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
