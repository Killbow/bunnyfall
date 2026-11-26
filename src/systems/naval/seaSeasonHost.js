// @ts-check
import { accountSeaSeason, accountRefusalText } from '../../net/accountClient.js';
import { appStorage } from '../../platform/appStorage.js';
import { readSeaSeasonBoard } from '../../net/sea/seaSeasonLaw.js';
import { repaintNavalYard } from '../../ui/navalPlunderDoor.js';

export const SEA_SEASON_FRESH_MS = 60_000;
export const SEA_SEASON_RETRY_MS = 5_000;

/** @param {any} deps */
export function createSeaSeason(deps) {
  const now = () => Number(deps.now?.()) || Date.now();
  let door = deps.door ?? null;
  const doorNow = () => (door ??= accountSeaSeason({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }));
  let board = null, nextAt = -Infinity, fails = 0, reading = false, line = null;
  const on = () => !!deps.live?.() && !!deps.session;
  const repaint = () => { try { repaintNavalYard(); } catch { } };
  async function read() {
    if (reading || !on()) return;
    reading = true;
    try {
      const r = await doorNow().board({ character: deps.character?.() }).catch(() => null);
      const b = r?.ok ? readSeaSeasonBoard(r.data) : null;
      if (b) { board = b; line = null; fails = 0; nextAt = now() + SEA_SEASON_FRESH_MS; }
      else { line = { text: accountRefusalText(r?.error), warn: true }; nextAt = now() + Math.min(SEA_SEASON_FRESH_MS, SEA_SEASON_RETRY_MS * 2 ** fails++); }
    } finally { reading = false; repaint(); }
  }
  function office() {
    if (!on()) return null;
    if (!reading && now() >= nextAt) void read();
    if (!board) return { asking: true, season: 0, daysLeft: 0, deep: [], legends: [], mine: { deep: null, legends: null }, last: { deep: [], legends: [] }, line };
    return { asking: false, ...board, daysLeft: Math.max(0, Math.ceil((board.ends * 1000 - now()) / 86_400_000)), line };
  }
  return { office, read };
}
