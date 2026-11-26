// @ts-check
import { createStarClaims } from '../../net/starfall/starClaims.js';
import { readStarReceipt } from '../../net/starfall/starReceipt.js';
import { accountStars } from '../../net/accountClient.js';
import { renownAnswer } from '../../net/renownTracker.js';
import { appStorage } from '../../platform/appStorage.js';
import { characterIdOf } from '../../characters/characterId.js';
import { onSlotSaved, onSlotLoaded, enumerateSaves } from '../../saves/saveSlots.js';
import { starSpoilsList, starSpoilsDay, STAR_SPOILS_KEYS, STAR_SPOILS_TEXT, STAR_SPOILS_RECORDS_MAX } from './starSpoils.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { setMidScreenText } from '../../ui/midScreenText.js';
import { showHaul } from '../../ui/pickupFeed.js';
import { claimHauls } from '../../ui/haulCards.js';
import { createSpoilsPool, spoilsStore, recoverSpoils, spoilsLevel, spoilsLock } from '../../worldEvents/spoilsPool.js';

/** @param {any} host */
export function createStarRewards(host) {
  const storage = host.rewardsStorage !== undefined ? host.rewardsStorage : appStorage();
  const store = spoilsStore(storage);
  const account = host.starAccount ?? accountStars({ fetch: (u, i) => globalThis.fetch(u, i), storage });
  const who = () => characterIdOf(playerEntity);
  const spoils = createSpoilsPool({
    ray: () => null, now: () => Date.now() + (host._sharedOffsetMs ?? 0), take: (p) => host.takeSpoil?.(p), say: (text) => setMidScreenText(text),
    store, who, keys: STAR_SPOILS_KEYS, recordsMax: STAR_SPOILS_RECORDS_MAX,
  });
  onSlotSaved((characterId) => { try { spoils.saved(characterId); } catch (e) { console.warn('[star] spoils', e?.message ?? e); } });
  // A load in the session counts as a stand-up: the pool lets go of what it held for the old pack.
  onSlotLoaded((characterId) => { try { spoils.loaded(characterId); } catch (e) { console.warn('[star] spoils', e?.message ?? e); } });
  function grant(entry) {
    const c = readStarReceipt(entry?.r);
    if (!c) return undefined;
    // A grant that fails leaves the receipt unsettled, so it is asked again.
    const level = spoilsLevel(entry.ch === who() ? playerEntity.level ?? 1 : Number(entry.lv) || c.l || 1, c.l);
    return spoilsLock(() => spoils.grant({
      day: starSpoilsDay(c.night, c.star), acct: c.s, roll: () => starSpoilsList(c.c, level, c.night, c.star), text: STAR_SPOILS_TEXT.granted(),
      owner: entry.ch, kept: STAR_SPOILS_TEXT.kept(entry.nm),
    }));
  }
  function adopt(data) {
    if (data?.renown?.character !== who()) return;
    const a = renownAnswer({ ...data.renown, order: data.order ?? null }, data.renown.credited ?? 0, host.renownSaid ?? null);
    if (a.xp !== null) host.renownXpAdopt?.(a.xp);
    if (a.level !== null) host.renownAdopt?.(a.level);
    if (a.order) host.online?.sendRenownOrder?.(a.order, a.level);
    if (a.announce !== null) host.renownRose?.(a.announce);
  }
  const claims = createStarClaims({
    claim: account.claim, me: account.me, who,
    nowS: () => host.relayNowS?.() ?? null,
    store,
    say: (text) => host.chatNotice?.(text),
    onSpoils: (entry) => grant(entry),
    onMarks: (data) => { showHaul(claimHauls(data, 'star')); return host.marksBook?.claimLines?.(data, 'star') ?? null; },
    onRecorded: (data) => adopt(data),
  });
  return {
    receipt: (r) => claims.add(r, who(), typeof playerEntity?.name === 'string' ? playerEntity.name : null, playerEntity.level ?? 1),
    tick: () => claims.tick(),
    recover(characterId, inSave = null) {
      try {
        if (recoverSpoils(store, (p) => host.takeSpoil?.(p), { who: characterId, saves: enumerateSaves().info.values(), onHanded: (rec) => spoils.adopt(rec), key: STAR_SPOILS_KEYS.store, inSave })) setMidScreenText(STAR_SPOILS_TEXT.recovered());
      } catch (e) { console.warn('[star] spoils', e?.message ?? e); }
    },
    held: (characterId) => { try { return spoils.heldIds?.(characterId) ?? []; } catch { return []; } },
    saved(characterId, ids) { try { spoils.saved(characterId, ids); } catch (e) { console.warn('[star] spoils', e?.message ?? e); } },
    claims,
    spoils,
  };
}
