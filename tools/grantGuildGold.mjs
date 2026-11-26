#!/usr/bin/env node
// Prints the SQL for an operator gold award into one guild's treasury, run by the guild-grant workflow.
// Run: node tools/grantGuildGold.mjs --look <guild name> | --sql <guild name> <gold>
// The award also raises realm_gold, the part of the treasury that buys a hall and can be withdrawn.

import { isMain } from './lib/isMain.mjs';
import { guildNameOf, guildNameKey, GUILD_TREASURY_MAX } from '../src/net/guildLaw.js';

export const GRANT_BY = 'The developers';

// The key is [a-z0-9]+ alone, so nothing in it can end an SQL string.
function keyOf(name) {
  const n = guildNameOf(name);
  if (!n) throw new Error(`not a guild name: ${JSON.stringify(name)}`);
  return guildNameKey(n);
}

export function grantGold(raw) {
  const s = String(raw ?? '').trim();
  const gold = /^[1-9][0-9]*$/.test(s) ? Number(s) : NaN;
  if (!Number.isSafeInteger(gold) || gold > GUILD_TREASURY_MAX) throw new Error(`not an award: ${JSON.stringify(raw)} - digits only, 1 to ${GUILD_TREASURY_MAX}`);
  return gold;
}

export function lookSql(name) {
  return `SELECT g.name, g.tag, g.treasury, g.realm_gold, (SELECT COUNT(*) FROM guild_members m WHERE m.guild_id = g.id) AS members FROM guilds g WHERE g.name_key = '${keyOf(name)}';`;
}

// The ledger trigger in 0046_guild_halls.sql writes the grant line from the moved_* columns in this statement.
// RETURNING names the changed row, so the workflow can refuse a run that changed none.
/**
 * @param {string} name
 * @param {string|number} goldRaw
 */
export function grantSql(name, goldRaw) {
  const key = keyOf(name);
  const gold = grantGold(goldRaw);
  return `UPDATE guilds SET treasury = treasury + ${gold}, realm_gold = realm_gold + ${gold}, moved_by = '${GRANT_BY}', moved_at = CAST(strftime('%s', 'now') AS INTEGER), moved_kind = 'grant' WHERE name_key = '${key}' AND treasury + ${gold} <= ${GUILD_TREASURY_MAX} RETURNING name, tag, treasury, realm_gold;`;
}

function main(argv) {
  if (argv[0] === '--look' && argv.length === 2) return void process.stdout.write(`${lookSql(argv[1])}\n`);
  if (argv[0] === '--sql' && argv.length === 3) return void process.stdout.write(`${grantSql(argv[1], argv[2])}\n`);
  throw new Error('usage: node tools/grantGuildGold.mjs --look <guild name> | --sql <guild name> <gold>');
}

if (isMain(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}
