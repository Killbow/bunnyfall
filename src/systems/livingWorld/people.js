// @ts-check
import { mintResident, travellerRoster } from './census.js';
import { companyOfPlace, namedIn } from './companies.js';
import { regardStanding, FRIEND_AT, ENEMY_AT, HOSTILE_AT, REGARD_MAX } from './relations.js';
import { placeKeyOf } from './lives.js';

export const RESIDENT_ID = /^L(\d+)\.([tw]?)(\d+)(?:~(\d+))?$/;
export const PEOPLE_MAX = 60;

/**
 * @param {string} id
 * @param {(mapId: number) => any} townOf
 */
export function residentOfId(id, townOf) {
  const m = RESIDENT_ID.exec(String(id ?? ''));
  if (!m) return null;
  const town = townOf(Number(m[1]));
  if (!town) return null;
  const roll = /** @type {'h'|'t'|'w'} */ (m[2] || 'h');
  return mintResident(town, roll, Number(m[3]), roll === 'w' ? 'guard' : 'resident', { gen: m[4] != null ? Number(m[4]) : null });
}

/**
 * @param {{ entries: () => { id: string, seen: number }[], regard: (id: string, day: number) => number, turns: () => any }} rel
 * @param {number} day
 * @param {(mapId: number) => any} townOf
 * @returns {{ friends: any[], enemies: any[], known: any[], companies: { name: string, town: string, members: string[] }[] }}
 */
export function peoplePage(rel, day, townOf) {
  /** @type {Map<number, any[]>} */
  const rosters = new Map();
  const companyOf = (/** @type {any} */ res, /** @type {any} */ town) => {
    if (res.roll !== 't' || !town) return '';
    let roster = rosters.get(town.mapId);
    if (!roster) { roster = travellerRoster(town); rosters.set(town.mapId, roster); }
    const place = roster.find((r) => r.slot === res.slot);
    const c = place ? companyOfPlace(place, roster) : null;
    return c ? namedIn(c, town.name ?? '').name : '';
  };
  const t = rel.turns?.() ?? {};
  /** @type {Map<string, 'slain'|'died'>} */
  const fates = new Map();
  for (const kind of /** @type {const} */ (['died', 'slain'])) {
    for (const [key, h] of t[kind] ?? []) if (h?.who) fates.set(`${key.slice(0, key.lastIndexOf('@'))}|${h.who}`, kind);
  }
  const rows = [];
  for (const e of rel.entries()) {
    const res = residentOfId(e.id, townOf);
    if (!res) continue;
    const r = rel.regard(e.id, day);
    const town = townOf(res.town);
    const row = { id: e.id, name: res.name, town: town?.name ?? '', standing: regardStanding(r), regard: Math.round(r), days: Math.max(0, day - e.seen),
      fate: fates.get(`${placeKeyOf(res)}|${res.name}`) ?? null, words: '', company: companyOf(res, town) };
    row.words = personWords(row);
    rows.push(row);
  }
  const friends = rows.filter((p) => p.standing === 'friend').sort((a, b) => b.regard - a.regard || a.days - b.days);
  const enemies = rows.filter((p) => p.standing === 'enemy' || p.standing === 'hostile').sort((a, b) => a.regard - b.regard || a.days - b.days);
  const known = rows.filter((p) => p.standing === 'neutral').sort((a, b) => a.days - b.days || (a.name < b.name ? -1 : 1));
  /** @type {Map<string, { name: string, town: string, members: string[] }>} */
  const companies = new Map();
  for (const p of [...friends, ...enemies, ...known]) {
    if (!p.company) continue;
    const key = `${p.company}|${p.town}`;
    if (!companies.has(key)) companies.set(key, { name: p.company, town: p.town, members: [] });
    companies.get(key)?.members.push(p.name);
  }
  return { friends: friends.slice(0, PEOPLE_MAX), enemies: enemies.slice(0, PEOPLE_MAX), known: known.slice(0, PEOPLE_MAX), companies: [...companies.values()] };
}

export function personWords(p) {
  if (p.fate === 'slain') return 'Slain by your hand.';
  if (p.fate === 'died') return 'Fell fighting at your side.';
  const said = p.standing === 'friend' ? 'A friend.' : p.standing === 'hostile' ? 'Hostile. They mean you harm.'
    : p.standing === 'enemy' ? 'An enemy. They will not speak to you.' : 'Knows you.';
  const seen = p.days === 0 ? 'Seen today.' : p.days === 1 ? 'Last seen yesterday.' : `Last seen ${p.days} days ago.`;
  return `${said} ${seen}`;
}

export const STANDING_NAMES = Object.freeze({ friend: 'Friend', neutral: 'Known', enemy: 'Enemy', hostile: 'Hostile' });
/** @param {{ regard: number, standing: string } | null} card */
export function regardBadge(card) {
  if (!card || !Number.isFinite(card.regard)) return null;
  // Truncates toward zero so the shown value never reaches a standing threshold the unrounded regard has not;
  // marriage.js reads the unrounded regard.
  const r = Math.trunc(card.regard) || 0;
  const standing = /** @type {keyof typeof STANDING_NAMES} */ (Object.hasOwn(STANDING_NAMES, card.standing) ? card.standing : regardStanding(r));
  return {
    standing, label: STANDING_NAMES[standing], value: `${r > 0 ? '+' : ''}${r}`, share: (r + REGARD_MAX) / (2 * REGARD_MAX),
    words: `How they regard you: ${r > 0 ? '+' : ''}${r}, from -${REGARD_MAX} to +${REGARD_MAX}. A friend from +${FRIEND_AT}; an enemy from ${ENEMY_AT}, who will not speak to you; hostile from ${HOSTILE_AT}. `
      + 'Talking once a day, speaking in a tone they like and fighting at their side raise it; with Project Legacy, so do the deeds Tell me about offers a townsperson you could court - a compliment, a gift, and a hug once you are friends - each once a day. A tone they dislike, a crime they see, a blow, and worst of all killing one of their own lower it. Townsfolk prefer Blunt to Polite. It fades back toward 0 by half a point for each of your days apart - time away from the game does not count. A townsperson who is your friend - not one of the watch, a traveller or your own blood - can be courted: ask about Courtship under Tell me about.',
  };
}
