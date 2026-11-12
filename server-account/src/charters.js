// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, City Charters): WHAT THE SERVICE KEEPS OF THE CHARTERS - who holds which capital, its
// Companies and its invitations (migration 0198). The law both ends read is src/net/charterLaw.js; the maps read every
// Charter through territory.js's answer (chartersRead).
//
// The capital is the client's word: the service knows no map, so a Charter is founded at the map id its founder's client
// names as its hall region's hub, one a region. A friends' server takes it.
import { guildActorOf } from './guilds.js';
import { GUILD_RANK_MASTER, guildTagOf } from '../../src/net/guild/guildLaw.js';
import { CHARTER_COMPANIES_MAX, CHARTER_INVITE_TTL_S, charterNameOf } from '../../src/net/charterLaw.js';

const regionOk = (r) => Number.isSafeInteger(r) && r >= 0 && r <= 61;
const mapIdOk = (m) => Number.isSafeInteger(m) && m >= 0 && m <= 0xffffffff;

/** The acting Captain: `{ guildId, name }`, or a refusal. */
async function captainOf(db, player, character) {
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (a.me.rank !== GUILD_RANK_MASTER) return { error: 'charter-captain' };
  return { guildId: a.me.guild_id, name: String(a.me.name ?? '') };
}
const hallRegionOf = async (db, guildId) => {
  const h = await db.prepare('SELECT region FROM homes WHERE guild_id = ?').bind(guildId).first();
  return h ? Number(h.region) : null;
};
const charterOfGuild = (db, guildId) => db.prepare(`SELECT c.map_id, c.region, c.name FROM city_charter_members m
  JOIN city_charters c ON c.map_id = m.map_id WHERE m.guild_id = ?`).bind(guildId).first();
/** The Companies a Charter holds and those invited, while the invitations stand. */
const seatsTaken = async (db, mapId, nowS) => {
  const r = await db.prepare(`SELECT (SELECT COUNT(*) FROM city_charter_members WHERE map_id = ?1)
    + (SELECT COUNT(*) FROM city_charter_invites WHERE map_id = ?1 AND at > ?2) AS n`).bind(mapId, nowS - CHARTER_INVITE_TTL_S).first();
  return Number(r?.n ?? 0);
};

/**
 * FOUND A CHARTER at a capital (`mapId`, the hub of `region` as the client names it), with its `name`. The Captain's
 * Company holds a hall in that region and is in no Charter; the region holds no Charter.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function foundCharter({ db, nowS }, player, { character, mapId, region, name } = {}) {
  if (!mapIdOk(mapId) || !regionOk(region)) return { error: 'charter-bad' };
  const nm = charterNameOf(name);
  if (!nm) return { error: 'charter-name' };
  const c = await captainOf(db, player, character);
  if ('error' in c) return c;
  if ((await hallRegionOf(db, c.guildId)) !== region) return { error: 'charter-no-hall' };
  if (await charterOfGuild(db, c.guildId)) return { error: 'charter-already' };
  if (await db.prepare('SELECT 1 FROM city_charters WHERE region = ? OR map_id = ?').bind(region, mapId).first()) return { error: 'charter-region-held' };
  try {
    await db.batch([
      db.prepare('INSERT INTO city_charters (map_id, region, name, founded_by, founded_at) VALUES (?, ?, ?, ?, ?)').bind(mapId, region, nm, c.guildId, nowS),
      db.prepare('INSERT INTO city_charter_members (guild_id, map_id, joined_at) VALUES (?, ?, ?)').bind(c.guildId, mapId, nowS),
      db.prepare('DELETE FROM city_charter_invites WHERE guild_id = ?').bind(c.guildId),
    ]);
  } catch { return { error: 'charter-region-held' }; }   // a founding that raced another: the unique keys refuse it
  return { ok: true, mapId };
}

/**
 * INVITE A COMPANY by its tag into the Captain's Charter: it holds a hall in the Charter's region and is in no Charter,
 * and the Charter has room for it, its standing invitations counted.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function inviteToCharter({ db, nowS }, player, { character, tag } = {}) {
  const t = guildTagOf(tag);
  if (!t) return { error: 'charter-no-company' };
  const c = await captainOf(db, player, character);
  if ('error' in c) return c;
  const ch = await charterOfGuild(db, c.guildId);
  if (!ch) return { error: 'charter-none' };
  const them = await db.prepare('SELECT id FROM guilds WHERE tag = ?').bind(t).first();
  if (!them) return { error: 'charter-no-company' };
  if (await charterOfGuild(db, them.id)) return { error: 'charter-they-joined' };
  if ((await hallRegionOf(db, them.id)) !== Number(ch.region)) return { error: 'charter-their-hall' };
  if (await db.prepare('SELECT 1 FROM city_charter_invites WHERE map_id = ? AND guild_id = ? AND at > ?').bind(ch.map_id, them.id, nowS - CHARTER_INVITE_TTL_S).first()) return { error: 'charter-invited' };
  if ((await seatsTaken(db, ch.map_id, nowS)) >= CHARTER_COMPANIES_MAX) return { error: 'charter-full' };
  await db.prepare(`INSERT INTO city_charter_invites (map_id, guild_id, by_name, at) VALUES (?, ?, ?, ?)
    ON CONFLICT (map_id, guild_id) DO UPDATE SET by_name = excluded.by_name, at = excluded.at`).bind(ch.map_id, them.id, c.name, nowS).run();
  return { ok: true };
}

/**
 * ANSWER AN INVITATION to the Charter at `mapId`: accepted, the Captain's Company joins (still with its hall in the
 * region, in no Charter, and the Charter not full of members); declined, the invitation goes.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function answerCharter({ db, nowS }, player, { character, mapId, accept } = {}) {
  if (!mapIdOk(mapId)) return { error: 'charter-bad' };
  const c = await captainOf(db, player, character);
  if ('error' in c) return c;
  const inv = await db.prepare(`SELECT i.map_id, ch.region FROM city_charter_invites i JOIN city_charters ch ON ch.map_id = i.map_id
    WHERE i.map_id = ? AND i.guild_id = ? AND i.at > ?`).bind(mapId, c.guildId, nowS - CHARTER_INVITE_TTL_S).first();
  if (!inv) return { error: 'charter-no-invite' };
  if (accept !== true) {
    await db.prepare('DELETE FROM city_charter_invites WHERE map_id = ? AND guild_id = ?').bind(mapId, c.guildId).run();
    return { ok: true, declined: true };
  }
  if (await charterOfGuild(db, c.guildId)) return { error: 'charter-already' };
  if ((await hallRegionOf(db, c.guildId)) !== Number(inv.region)) return { error: 'charter-no-hall' };
  const members = await db.prepare('SELECT COUNT(*) AS n FROM city_charter_members WHERE map_id = ?').bind(mapId).first();
  if (Number(members?.n ?? 0) >= CHARTER_COMPANIES_MAX) return { error: 'charter-full' };
  try {
    await db.batch([
      db.prepare('INSERT INTO city_charter_members (guild_id, map_id, joined_at) VALUES (?, ?, ?)').bind(c.guildId, mapId, nowS),
      db.prepare('DELETE FROM city_charter_invites WHERE guild_id = ?').bind(c.guildId),
    ]);
  } catch { return { error: 'charter-already' }; }
  return { ok: true, joined: true };
}

/**
 * TAKE THE CAPTAIN'S COMPANY OUT of its Charter. The last Company out ends the Charter, its invitations with it.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function leaveCharter({ db }, player, { character } = {}) {
  const c = await captainOf(db, player, character);
  if ('error' in c) return c;
  const ch = await charterOfGuild(db, c.guildId);
  if (!ch) return { error: 'charter-none' };
  await db.batch([
    db.prepare('DELETE FROM city_charter_members WHERE guild_id = ?').bind(c.guildId),
    db.prepare('DELETE FROM city_charter_invites WHERE map_id = ?1 AND NOT EXISTS (SELECT 1 FROM city_charter_members WHERE map_id = ?1)').bind(ch.map_id),
    db.prepare('DELETE FROM city_charters WHERE map_id = ?1 AND NOT EXISTS (SELECT 1 FROM city_charter_members WHERE map_id = ?1)').bind(ch.map_id),
  ]);
  return { ok: true };
}

/**
 * EVERY CHARTER as the maps and the Company page read it: its capital, region and name, its Companies' ids and the
 * Companies invited (with who invited them), the standing invitations alone.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function chartersRead({ db, nowS }) {
  const [charters, members, invites] = await db.batch([
    db.prepare('SELECT map_id, region, name, founded_at FROM city_charters'),
    db.prepare('SELECT guild_id, map_id FROM city_charter_members ORDER BY joined_at'),
    db.prepare('SELECT map_id, guild_id, by_name FROM city_charter_invites WHERE at > ?').bind(nowS - CHARTER_INVITE_TTL_S),
  ]);
  const by = new Map((charters?.results ?? []).map((c) => [Number(c.map_id), {
    mapId: Number(c.map_id), region: Number(c.region), name: c.name, foundedAt: Number(c.founded_at), members: /** @type {string[]} */ ([]), invites: /** @type {{ id: string, by: string }[]} */ ([]),
  }]));
  for (const m of members?.results ?? []) by.get(Number(m.map_id))?.members.push(m.guild_id);
  for (const i of invites?.results ?? []) by.get(Number(i.map_id))?.invites.push({ id: i.guild_id, by: i.by_name });
  return [...by.values()];
}
