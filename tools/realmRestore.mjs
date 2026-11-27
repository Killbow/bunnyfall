#!/usr/bin/env node
// Plans the return of homes, guild places, and Renown tracks that deleted customs characters took, from a snapshot.
// Run: node tools/realmRestore.mjs --then then.sql --now now.sql --out r.sql [--handles h.json] [--summary s.md].
// The SQL only inserts missing rows and makes guarded updates, so a run cut short can run again.

import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { GUILD_MEMBERS_MAX, GUILD_RANK_MASTER } from '../src/net/guildLaw.js';
import { isMain } from './lib/isMain.mjs';
import { lit } from './lib/sqlLit.mjs';
import { reseatRestored } from './yardReseat.mjs';

// Must match REALM_ID_RE in server-account/src/realm.js.
const REALM_ID_RE = /^r[0-9a-f]{20}$/;
export const THEN_TABLES = Object.freeze(['homes', 'home_decor', 'home_hidden', 'guild_members', 'renown_tracks']);
export const NOW_TABLES = Object.freeze(['homes', 'home_decor', 'home_hidden', 'guild_members', 'guilds', 'renown_tracks', 'realm_census', 'realm_characters', 'realm_trades']);

export function loadDump(/** @type {string} */ sql) {
  // Foreign keys are off because a dump carries some tables but not the ones they point at.
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  db.exec(sql);
  return db;
}

export { lit };
// The score is left out: migration 0108's vote triggers keep it, and a score with no votes hides the home.
export const homeRowOf = (/** @type {Record<string, unknown>} */ home) => {
  const { score: _score, ...row } = home;
  return row;
};
const insert = (/** @type {string} */ table, /** @type {Record<string, unknown>} */ row) => {
  const cols = Object.keys(row);
  return `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => lit(row[c])).join(', ')});`;
};
const all = (/** @type {DatabaseSync} */ db, /** @type {string} */ sql, /** @type {unknown[]} */ ...a) => db.prepare(sql).all(...a).map((r) => ({ ...r }));
const one = (/** @type {DatabaseSync} */ db, /** @type {string} */ sql, /** @type {unknown[]} */ ...a) => {
  const r = db.prepare(sql).get(...a);
  return r ? { ...r } : null;
};

/** @param {{ then: DatabaseSync, now: DatabaseSync, handles?: Map<string, string> }} at */
export function planRestore({ then, now, handles = new Map() }) {
  const who = (/** @type {string} */ p) => handles.get(p) ?? `(an account, ${String(p).slice(0, 8)})`;
  const standing = new Set(all(now, 'SELECT origin_id FROM realm_characters WHERE origin_id IS NOT NULL').map((r) => r.origin_id));
  const realmIds = new Set(all(now, 'SELECT id FROM realm_characters').map((r) => r.id));
  const gone = all(now, 'SELECT DISTINCT char_id FROM realm_census WHERE spent = 1').map((r) => r.char_id).filter((o) => !standing.has(o)).sort();
  // An account whose deleted realm character made a completed trade is held for review, with nothing restored.
  const held = new Set();
  for (const t of all(now, "SELECT a_player AS p, a_char AS c FROM realm_trades WHERE state = 'done' UNION SELECT b_player, b_char FROM realm_trades WHERE state = 'done' AND b_player IS NOT NULL")) {
    if (t.p && !realmIds.has(t.c)) held.add(t.p);
  }
  const censusPlayers = (/** @type {string} */ o) => all(now, 'SELECT player FROM realm_census WHERE char_id = ?', o).map((r) => r.player);

  /** @type {string[]} */
  const sql = [];
  /** @type {any[]} */
  const restored = [];
  /** @type {any[]} */
  const heldOut = [];
  /** @type {any[]} */
  const taken = [];
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const reopened = [];

  for (const origin of gone) {
    if (REALM_ID_RE.test(origin)) continue;
    const owners = new Set([
      ...all(then, 'SELECT player FROM homes WHERE char_id = ?', origin).map((r) => r.player),
      ...all(then, 'SELECT player FROM guild_members WHERE char_id = ?', origin).map((r) => r.player),
      ...all(then, 'SELECT player FROM renown_tracks WHERE char_id = ?', origin).map((r) => r.player),
      ...censusPlayers(origin),
    ]);
    const heldBy = [...owners].filter((p) => held.has(p));
    if (heldBy.length) {
      for (const p of heldBy) heldOut.push({ player: p, handle: who(p), origin, why: 'a realm character of this account that no longer stands traded in the realm' });
      continue;
    }
    for (const player of owners) {
      const entry = { player, handle: who(player), origin, homes: /** @type {any[]} */ ([]), pieces: 0, hidden: 0, guild: false, track: false };
      for (const home of all(then, 'SELECT * FROM homes WHERE player = ? AND char_id = ?', player, origin)) {
        const place = `${home.map_id}/${home.building_key}`;
        const nowHome = one(now, 'SELECT player, char_id FROM homes WHERE map_id = ? AND building_key = ?', home.map_id, home.building_key);
        if (nowHome && nowHome.player === player && nowHome.char_id === origin) continue;
        // A home now held as a guild hall (char_id 'guild:...') is reported as taken, never written back.
        if (nowHome && (nowHome.player !== player || String(nowHome.char_id).startsWith('guild:'))) {
          taken.push({ player, handle: who(player), origin, building: place, by: who(nowHome.player) });
          continue;
        }
        if (!nowHome) sql.push(insert('homes', homeRowOf(home)));
        const pieces = all(then, 'SELECT * FROM home_decor WHERE map_id = ? AND building_key = ?', home.map_id, home.building_key);
        // Restored yard stalls and boulders placed before migration 0121 are reseated, as 0121 reseated all the others.
        for (const p of pieces) {
          const back = reseatRestored(p);
          sql.push(insert('home_decor', back.row));
          if (back.unsure) notes.push(`${who(player)}: yard piece ${p.id} at ${place} (model ${p.model}) is written as the snapshot holds it - placed between TEMPLE-STEPS' deploy and STALL-SHAPE's, against either stand-in; if it was TEMPLE-STEPS' and the snapshot is from before migration 0121 ran, it stands 0.26 m further back than it was put`);
        }
        const hidden = all(then, 'SELECT * FROM home_hidden WHERE map_id = ? AND building_key = ?', home.map_id, home.building_key);
        for (const h of hidden) sql.push(insert('home_hidden', h));
        entry.homes.push({ building: place, rebought: !!nowHome });
        entry.pieces += pieces.length;
        entry.hidden += hidden.length;
      }
      const place = one(then, 'SELECT * FROM guild_members WHERE player = ? AND char_id = ?', player, origin);
      if (place && !one(now, 'SELECT 1 AS x FROM guild_members WHERE player = ? AND char_id = ?', player, origin)) {
        const guild = one(now, 'SELECT id, name FROM guilds WHERE id = ?', place.guild_id);
        const members = one(now, 'SELECT COUNT(*) AS n FROM guild_members WHERE guild_id = ?', place.guild_id)?.n ?? 0;
        const master = one(now, 'SELECT 1 AS x FROM guild_members WHERE guild_id = ? AND rank = ?', place.guild_id, GUILD_RANK_MASTER);
        if (!guild) notes.push(`${who(player)}: the guild ${place.guild_id} is gone - the place cannot come back`);
        else if (members >= GUILD_MEMBERS_MAX) notes.push(`${who(player)}: ${guild.name} is full - the place waits for you`);
        else if (place.rank === GUILD_RANK_MASTER && master) notes.push(`${who(player)}: ${guild.name} has a master again - the place waits for you`);
        else { sql.push(insert('guild_members', place)); entry.guild = true; }
      }
      const track = one(then, 'SELECT * FROM renown_tracks WHERE player = ? AND char_id = ?', player, origin);
      if (track && !one(now, 'SELECT 1 AS x FROM renown_tracks WHERE player = ? AND char_id = ?', player, origin)) {
        sql.push(insert('renown_tracks', track));
        entry.track = true;
      }
      if (entry.homes.length || entry.guild || entry.track) restored.push(entry);
    }
    sql.push(`UPDATE realm_census SET spent = 0 WHERE char_id = ${lit(origin)} AND NOT EXISTS (SELECT 1 FROM realm_characters WHERE origin_id = ${lit(origin)});`);
    reopened.push(origin);
  }
  return { restored, held: heldOut, taken, notes, reopened, sql: sql.join('\n') + (sql.length ? '\n' : '') };
}

export function planReport(/** @type {ReturnType<typeof planRestore>} */ plan) {
  const out = ['## Realm restore: what a deleted customs character took with it', ''];
  out.push(`- **Coming back:** ${plan.restored.length} (account, character) - ${plan.restored.reduce((n, e) => n + e.homes.length, 0)} homes, ${plan.restored.reduce((n, e) => n + e.pieces, 0)} pieces, ${plan.restored.filter((e) => e.guild).length} guild places.`);
  out.push(`- **May be brought in again:** ${plan.reopened.length} offline characters.`);
  out.push(`- **Held for you:** ${plan.held.length}. **Taken by someone else since:** ${plan.taken.length}.`, '');
  for (const e of plan.restored) out.push(`- ${e.handle}: ${e.homes.map((h) => `home ${h.building}${h.rebought ? ' (its pieces, into the house bought again)' : ''}`).join(', ') || 'no home'}${e.guild ? ', guild place' : ''}${e.pieces ? `, ${e.pieces} pieces` : ''}`);
  for (const h of plan.held) out.push(`- HELD ${h.handle}: ${h.why}`);
  for (const t of plan.taken) out.push(`- TAKEN ${t.handle}: building ${t.building} belongs to ${t.by} now`);
  for (const n of plan.notes) out.push(`- NOTE ${n}`);
  return out.join('\n') + '\n';
}

export function handlesOf(/** @type {string} */ json) {
  const map = new Map();
  let parsed = null;
  try { parsed = JSON.parse(json); } catch { return map; }
  for (const block of Array.isArray(parsed) ? parsed : [parsed]) {
    for (const r of block?.results ?? []) if (typeof r?.id === 'string' && typeof r?.handle === 'string' && r.handle) map.set(r.id, r.handle);
  }
  return map;
}

const arg = (/** @type {string} */ name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
if (isMain(import.meta.url)) {
  const thenPath = arg('then'), nowPath = arg('now'), out = arg('out');
  if (!thenPath || !nowPath || !out) {
    console.error('usage: node tools/realmRestore.mjs --then then.sql --now now.sql --out restore.sql [--handles handles.json] [--summary summary.md]');
    process.exit(2);
  }
  const handlesPath = arg('handles');
  const plan = planRestore({
    then: loadDump(readFileSync(thenPath, 'utf8')),
    now: loadDump(readFileSync(nowPath, 'utf8')),
    handles: handlesPath ? handlesOf(readFileSync(handlesPath, 'utf8')) : new Map(),
  });
  writeFileSync(out, plan.sql);
  const report = planReport(plan);
  const summary = arg('summary');
  if (summary) writeFileSync(summary, report);
  process.stdout.write(report);
}
