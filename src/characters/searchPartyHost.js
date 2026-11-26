// Host wiring for the graveyard search party, called from bootWorld.
import { ActionTextBox } from '../ui/actionText.js';
import { droppedLootHooks } from '../items/droppedLoot.js';
import { dungeonFamily, dungeonRarityTier } from '../items/lootRarity.js';
import { effectiveLevel } from './mentorMode.js';
import { enemyDisplayName } from './enemyBasics.js';
import { liveStat } from './statMods.js';
import { markSearched, mintSearchFind, pickSearchUndead, rollSearchElite, rollSearchOutcome, SEARCH_FOE_SPACING, SEARCH_FOES_PER_PLAYER, searchCooldownLeft, searchKey, searchMessage, searchedText, setSearchParty, searchKinOf, searchToldBy, SEARCH_COOLDOWN_MINUTES } from '../items/searchables.js';
import { playerEntity } from './playerEntity.js';
import { randomEpitaph } from '../world/gravestoneLore.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { silverFindAt } from '../items/silverFinds.js';
import { worldMinutes, sharedClockOn } from '../world/worldTick.js';
import { isCellRoom } from '../net/wire.js';

export const GRAVE_SAY_MS = 1000;
export const GRAVE_OWED_KEEP_MS = 10 * 60 * 1000;
export const GRAVE_OWED_MAX = 32;
export const GRAVE_BOOK_MAX = 256;
const GRAVE_LOC_RE = /^g(\d{1,3}),(\d{1,3})$/;

/** @param {any} host */
export function createSearchParty(host) {
  const {
    dropFeet, droppedLoot, exteriorFoes, makeInventoryWindow, player, playerTravelPixel, townTalk
  } = host;
  setSearchParty({
    self: () => host.social?.acct ?? null,
    selfName: () => host.online?.name || host.social?.name || null,
    inParty: (acct) => !!host.social?.inMyParty?.(acct),
    nameOf: (acct) => host.social?.party?.members?.find((m) => m.acct === acct)?.name ?? null,
    acctOfPeer: (id) => host.social?.accountOfPeer?.(id) ?? null,
  });
  const owed = new Map();
  const book = new Map();
  let saidAt = -Infinity;
  function rowOf(g) {
    const m = GRAVE_LOC_RE.exec(typeof g?.loc === 'string' ? g.loc : '');
    const n = Number(g?.key);
    return m && Number.isInteger(n) && n >= 0 ? [Number(m[1]), Number(m[2]), n] : null;
  }
  function land(g) {
    if (!searchKinOf(g[4])) return false;
    const now = worldMinutes();
    markSearched(searchKey(`g${g[0]},${g[1]}`, String(g[2])), sharedClockOn() ? Math.min(g[3], now) : now, searchToldBy(g[4], g[5]));
    return true;
  }
  function heard(msg) {
    if (msg?.k !== 'gr' || !Array.isArray(msg.rows)) return;
    const now = worldMinutes();
    for (const [k, g] of [...book]) if (sharedClockOn() && now - g[3] >= SEARCH_COOLDOWN_MINUTES) book.delete(k);
    for (const g of msg.rows) {
      const k = `${g[0]},${g[1]}|${g[2]}|${g[4]}`;
      book.delete(k); book.set(k, g);
      land(g);
    }
    while (book.size > GRAVE_BOOK_MAX) book.delete(book.keys().next().value);
  }
  function adopt(row) {
    if (!row) return;
    const head = `${row[0]},${row[1]}|${row[2]}|`;
    for (const [k, g] of book) if (k.startsWith(head)) land(g);
  }
  function owe(row) {
    if (!row) return;
    const k = `${row[0]},${row[1]}|${row[2]}`;
    owed.delete(k); owed.set(k, { row, since: performance.now() });
    while (owed.size > GRAVE_OWED_MAX) owed.delete(owed.keys().next().value);
  }
  function frame(now) {
    const online = host.online;
    if (!owed.size || !online?.owGraveOk || now - saidAt < GRAVE_SAY_MS) return;
    saidAt = now;
    for (const [k, o] of [...owed]) if (now - o.since > GRAVE_OWED_KEEP_MS) owed.delete(k);
    if (!owed.size || !isCellRoom(online.room)) return;
    for (const r of online.sendOverworld('gr', [...owed.values()].map((o) => o.row))) owed.delete(`${r[0]},${r[1]}|${r[2]}`);
  }
  function activateGrave(g, mode = 'grab') {
    if (!g) return false;
    if (mode === 'info') { townTalk.say(randomEpitaph()); return true; }
    const key = searchKey(g.loc, g.key);
    const now = worldMinutes();
    const row = rowOf(g);
    adopt(row);
    if (searchCooldownLeft(key, now) > 0) { setMidScreenText(searchedText(key)); return true; }
    markSearched(key, now);
    owe(row);
    const outcome = rollSearchOutcome({ graveyard: true });
    const level = effectiveLevel(playerEntity);
    let rows, onClose = null;
    if (outcome === 'foe') {
      const type = pickSearchUndead(level);
      const elite = rollSearchElite();
      const count = SEARCH_FOES_PER_PLAYER * (1 + host.partyNear().length);
      rows = searchMessage('tombstone', 'foe', { foeName: enemyDisplayName(type) ?? 'creature', elite, count });
      onClose = () => {
        const feet = player.pos;
        const c = [(g.min[0] + g.max[0]) / 2, Math.min(g.min[1], feet[1]), (g.min[2] + g.max[2]) / 2];
        const half = Math.max(g.max[0] - g.min[0], g.max[2] - g.min[2]) / 2;
        const toward = Math.atan2(feet[0] - c[0], feet[2] - c[2]);
        for (let n = 0; n < count; n++) {
          const a = toward + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * (Math.PI / 5);
          const r = half + 0.7 + Math.floor(n / 10) * SEARCH_FOE_SPACING;
          const at = [c[0] + Math.sin(a) * r, c[1] + 0.05, c[2] + Math.cos(a) * r];
          exteriorFoes.spawnFoe(type, at, { yaw: Math.atan2(-(feet[0] - at[0]), -(feet[2] - at[2])), feetGiven: true, loose: true, eliteFoe: elite && n === 0 })
            .catch((e) => console.warn('[search] a grave\'s foe would not stand', e));
        }
      };
    } else if (outcome === 'loot') {
      const items = mintSearchFind('tombstone', { level, gender: playerEntity.gender, tier: dungeonRarityTier(18), family: dungeonFamily(18), luck: liveStat(playerEntity, 'luck') });
      rows = searchMessage('tombstone', 'loot');
      onClose = () => {
        const pile = droppedLoot.dropPile(items, dropFeet(), `${playerTravelPixel().x},${playerTravelPixel().y}`);
        if (!pile) return;
        silverFindAt('search', items);
        const w = makeInventoryWindow({ onClose: () => droppedLoot.releaseEmptied(), loot: droppedLootHooks(pile) });
        if (w) townTalk.showOverlay(w);
      };
    } else rows = searchMessage('tombstone', 'nothing');
    townTalk.showOverlay(new ActionTextBox(rows, { onClose }));
    return true;
  }
  return { activateGrave, frame, heard };
}
