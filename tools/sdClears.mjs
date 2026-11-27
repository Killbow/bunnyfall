#!/usr/bin/env node
// Reads who cleared each Abyss Dungeon from the account service's sd_kills rows. It writes nothing.
// Run: node tools/sdClears.mjs --list, or --names [slot]. Only registered accounts have rows.

import { isMain } from './lib/isMain.mjs';

// Digits only, so nothing in the slot can reach the SQL.
export function sdSlot(raw) {
  const s = String(raw ?? '').trim();
  const slot = /^[1-9][0-9]{0,8}$/.test(s) ? Number(s) : NaN;
  if (!Number.isSafeInteger(slot)) throw new Error(`not a slot: ${JSON.stringify(raw)} - digits only, 1 or more`);
  return slot;
}

export function listSql() {
  return 'SELECT slot, COUNT(*) AS fighters, MIN(at) AS first_at FROM sd_kills GROUP BY slot ORDER BY slot;';
}

/** @param {string|number} [slotRaw] */
export function namesSql(slotRaw) {
  const slot = slotRaw == null || String(slotRaw).trim() === '' ? '(SELECT MIN(slot) FROM sd_kills)' : sdSlot(slotRaw);
  return `SELECT k.slot, p.handle AS name, k.earned, k.lv, k.title, k.aura, k.at FROM sd_kills k JOIN players p ON p.id = k.account WHERE k.slot = ${slot} ORDER BY k.at, p.handle_lc;`;
}

function main(argv) {
  if (argv[0] === '--list' && argv.length === 1) return void process.stdout.write(`${listSql()}\n`);
  if (argv[0] === '--names' && argv.length <= 2) return void process.stdout.write(`${namesSql(argv[1])}\n`);
  throw new Error('usage: node tools/sdClears.mjs --list | --names [slot]');
}

if (isMain(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}
