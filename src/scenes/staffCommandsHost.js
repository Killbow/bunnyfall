// @ts-check
// BUNNYFALL STAFF COMMANDS (2026-11-12, the owner: "a vanish to disappear from both players and enemies, a spawn command
// to spawn enemies and a greed command to give gold to players or dusk tokens") - the game's half, three chat lines a staff
// member types (local, never said to the room). The account service says who is staff (server-account/src/staffCommands.js);
// a player who is not hears that the command is staff-only.
//
//   /vanish                  on, then off again. On, the game leaves every room and opens each again on a fresh token
//                            that carries the vanish mark (`vn`, signed by the service). The relay plays the socket as
//                            ever - monsters, chat, trade and everything else stay networked - and passes the mark on
//                            the join: every other game leaves the player undrawn, out of its lists and no foe's quarry
//                            (net/online.js `visible`, the foes' peer lists), and this game, holding the mark, is no one
//                            to its own monsters (staffFollowHost.js `unseen`).
//   /spawn <monster> [n]     n (1-10, 1 by default) of a monster stood near you through the game's own placement
//                            (hostEnchant.js standLooseFoe) - outdoors, in a dungeon or indoors. The monster by its
//                            name, spaces ignored ("giant bat", "orcwarlord", "fire daedra"), or its number.
//   /greed <player> <n> [gold|nyx]   n gold (the default) or Dusk Tokens kept for the player (a handle or a character's
//                            name, "me" yourself) - an Admin's. Their game takes it within a minute while they play
//                            (`tick`): the gold into the purse, the coins into the pack.
import { staffVanish, staffGreed, greedMine, greedClaim } from '../net/accountClient.js';
import { MOBILE_TYPES } from '../characters/mobile/mobileTypes.js';
import { SIFRIT_ID } from '../systems/sifrit/sifritLaw.js';   // SIFRIT: she is no DFU monster - staff's list adds her
import { addGoldPieces } from '../systems/inventory.js';
import { giveNyxCoins, nyxCoinsText } from '../systems/wild/nyxShop.js';

export const SPAWN_MAX = 10;
export const GIFT_POLL_MS = 60_000;
const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const MONSTERS = Object.entries(MOBILE_TYPES).filter(([n, id]) => id !== MOBILE_TYPES.None && !/invalid/i.test(n)).concat([['Sifrit', SIFRIT_ID]]);

/** A monster's mobile type by a typed name or number, or null - an exact name first, then the one name it begins. */
export function monsterOf(raw) {
  const k = key(raw);
  if (!k) return null;
  if (/^\d+$/.test(k)) { const id = Number(k); return MONSTERS.find(([, v]) => v === id) ?? null; }
  const exact = MONSTERS.find(([n]) => key(n) === k);
  if (exact) return exact;
  const starts = MONSTERS.filter(([n]) => key(n).startsWith(k));
  return starts.length === 1 ? starts[0] : null;
}

/**
 * @param {{
 *   io: () => any,                           the account service's door, or null signed out
 *   relink: () => void,                      leave every room and open each again on a fresh token (staffFollowHost.js relinkGame)
 *   spawn: (mobileType: number) => any,      stand one monster near the player
 *   entity: () => any,                       the player
 *   saved: () => void,                       the save after a gift lands
 * }} deps
 */
export function createStaffCommands({ io, relink, spawn, entity, saved }) {
  let lastPoll = 0, polling = false;

  const words = {
    vanish: /^\/vanish\s*$/i,
    spawn: /^\/spawn(?:\s+(.+?))?\s*$/i,
    greed: /^\/greed(?:\s+(.*))?$/i,
  };

  async function vanish(say) {
    const door = io();
    if (!door) { say('Sign in to use staff commands.'); return; }
    const now = await staffVanish(door);
    if (!now?.ok) { say(now?.error === 'staff-only' ? '/vanish is for staff.' : 'The server could not be reached.'); return; }
    const r = await staffVanish(door, !now.data.vanished);
    if (!r?.ok) { say('The server could not be reached.'); return; }
    relink();
    say(r.data.vanished ? 'You vanish. Players and monsters no longer see you; everything else plays on as usual. /vanish again to come back.' : 'You are visible again.');
  }

  async function spawnCmd(arg, say) {
    const door = io();
    if (!door) { say('Sign in to use staff commands.'); return; }
    const m = /^(.*?)(?:\s+(\d+))?$/.exec(String(arg ?? '').trim());
    const name = m?.[1] ?? '', n = Math.max(1, Math.min(SPAWN_MAX, Number(m?.[2] ?? 1) || 1));
    const who = monsterOf(name);
    if (!name || !who) { say(`Usage: /spawn <monster> [1-${SPAWN_MAX}]. Monsters: ${MONSTERS.map(([k]) => k).join(', ')}.`); return; }
    const st = await staffVanish(door);
    if (!st?.ok) { say(st?.error === 'staff-only' ? '/spawn is for staff.' : 'The server could not be reached.'); return; }
    let stood = 0;
    for (let i = 0; i < n; i++) { try { if (await spawn(who[1]) != null) stood++; } catch { /* a spot not found: the next try */ } }
    say(stood ? `${stood} ${who[0]} stood near you.` : `No room to stand a ${who[0]} here.`);
  }

  async function greed(arg, say) {
    const door = io();
    if (!door) { say('Sign in to use staff commands.'); return; }
    const m = /^(.+?)\s+(\d+)(?:\s+(gold|nyx|coins?))?\s*$/i.exec(String(arg ?? '').trim());
    if (!m) { say('Usage: /greed <player> <amount> [gold|nyx]. "me" gives it to yourself.'); return; }
    const nyx = /^(nyx|coins?)$/i.test(m[3] ?? '');
    const n = Number(m[2]);
    const r = await staffGreed(door, { to: m[1], ...(nyx ? { nyx: n } : { gold: n }) });
    if (!r?.ok) {
      say(r?.error === 'staff-admin' ? '/greed is for Admins.' : r?.error === 'greed-no-player' ? `No player named ${m[1]}.` : r?.error === 'greed-amount' ? 'Give between 1 and 1,000,000 gold, or 1 and 1,000 Dusk Tokens.' : 'The server could not be reached.');
      return;
    }
    say(`${nyx ? nyxCoinsText(n) : `${n.toLocaleString('en-US')} gold`} on its way to ${r.data.to}. Their game takes it within a minute while they play.`);
    lastPoll = 0;   // a gift to yourself lands now
  }

  /** The gifts waiting for this account, taken: gold to the purse, coins to the pack, each said. */
  async function takeGifts(say) {
    const door = io();
    if (!door || polling) return;
    polling = true;
    try {
      const r = await greedMine(door);
      for (const g of r?.ok ? r.data.gifts ?? [] : []) {
        const c = await greedClaim(door, g.id);
        if (!c?.ok) continue;
        const ent = entity();
        if (!ent) continue;
        if (c.data.gold > 0) addGoldPieces(ent, c.data.gold);
        if (c.data.nyx > 0) giveNyxCoins((ent.items ??= []), c.data.nyx);
        const bits = [c.data.gold > 0 ? `${c.data.gold.toLocaleString('en-US')} gold` : null, c.data.nyx > 0 ? nyxCoinsText(c.data.nyx) : null].filter(Boolean);
        say(`${c.data.from} gave you ${bits.join(' and ')}.`);
        saved();
      }
    } finally { polling = false; }
  }

  return {
    /** A chat line: true when it was one of these commands (handled, never said to the room). */
    command(text, say) {
      const s = String(text ?? '').trim();
      if (words.vanish.test(s)) { void vanish(say); return true; }
      const sp = words.spawn.exec(s);
      if (sp) { void spawnCmd(sp[1], say); return true; }
      const gr = words.greed.exec(s);
      if (gr) { void greed(gr[1], say); return true; }
      return false;
    },
    /** Each frame: now and then, the gifts waiting for this account taken. */
    tick(nowMs, say) {
      if (nowMs - lastPoll < GIFT_POLL_MS) return;
      lastPoll = nowMs;
      void takeGifts(say).catch(() => {});
    },
  };
}
