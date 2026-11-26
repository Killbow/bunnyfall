// @ts-check
import { GUILDS, isMember, questRankFor } from '../../guilds/guilds.js';
import { templeOf, orderOf } from '../../guilds/guildVariants.js';
import { MEMBERSHIP_STATUS } from '../quest/questLists.js';
import { sheetFor } from './qlSheets.js';

// A list row floor under 10 is a rank; 10 and above is a reputation, which has no rung.
const RANK_FLOORS = 10;

export function guildOfMembership(m) {
  const name = String(m?.guild ?? '');
  if (name.startsWith('Temple:')) return templeOf(name.slice(7));
  if (name.startsWith('Order:')) return orderOf(name.slice(6));
  return Object.values(GUILDS).find((g) => g.name === name) ?? null;
}

/**
 * @param {{ memberships: Record<string, any>, pools: Map<number, any[]>, history?: Record<string, string>, level?: number,
 *   adult?: boolean }} deps
 */
export function ladders({ memberships, pools, history = {}, level = 1, adult = false }) {
  const out = [];
  for (const [group, m] of Object.entries(memberships ?? {})) {
    if (!isMember(m)) continue;
    const g = guildOfMembership(m);
    if (!g) continue;
    const divine = /** @type {any} */ (g).divine ? /** @type {Record<string, string>} */ (MEMBERSHIP_STATUS)[/** @type {any} */ (g).divine] ?? null : null;
    const offers = questRankFor(g, m.rank, level);
    const rows = (pools?.get?.(g.guildGroup) ?? pools?.get?.(Number(group)) ?? [])
      .filter((r) => (r.membership === 'M' || (divine && r.membership === divine)) && r.minReq >= 0 && r.minReq < RANK_FLOORS && (!r.adult || adult));
    const byRank = new Map();
    for (const r of rows) {
      const name = String(r.name).toUpperCase();
      if (!byRank.has(r.minReq)) byRank.set(r.minReq, new Map());
      byRank.get(r.minReq).set(name, { name, done: Object.hasOwn(history, name), flagship: !!sheetFor(name)?.branches?.length });
    }
    const titles = g.rankTitles ?? [];
    const rungs = [...byRank.keys()].sort((a, b) => a - b).map((rank) => ({
      rank, title: titles[rank] ?? String(rank), reached: offers >= rank,
      quests: [...byRank.get(rank).values()].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    out.push({ key: g.name, group: g.guildGroup, factionId: g.factionId, rank: m.rank, rankTitle: titles[m.rank] ?? String(m.rank), rungs });
  }
  return out;
}
