// @ts-check
import { regionChaseHeard, regionChaseWithdraw, TRAV_BAND_HOLD_MS } from './regionChase.js';
import { travellerWorldOf } from './travellerMarks.js';
import { travellerKin } from './travelViewFilters.js';

const chasing = (word) => new Set(word.filter((e) => e[3] === 1).map((e) => e[0]));

/** @param {{ bandHear: (from: string, raw: any[], hold?: number, aged?: number) => void, seaRaidHear: (from: string, raw: any[], hold?: number, aged?: number) => void, bands: () => Map<string, any>, raids: () => Map<string, any>, me: () => ({ x: number, y: number }), wildHides: (who: { kin?: any, wire?: number[], party?: boolean }) => boolean, social: () => any, guildTag: () => any }} host */
export function createRegionChaseHearing(host) {
  const { bandHear, seaRaidHear, bands, raids, me, wildHides, social, guildTag } = host;
  const hidden = (f, w) => {
    const s = social();
    return wildHides({ kin: travellerKin({ friend: !!s?.isFriendPeer(f.id), gt: f.gt }, guildTag()), wire: [w.x, 0, w.z], party: !!s?.isPartyPeer(f.id) });
  };
  function hear(f, aged = 0) {
    const w = f.p ? travellerWorldOf(f.p) : null;
    const words = w && hidden(f, w) ? null : regionChaseHeard(f, me());
    regionChaseWithdraw(bands(), f.id, words && chasing(words.bd));
    regionChaseWithdraw(raids(), f.id, words && chasing(words.sr));
    if (words) { bandHear(f.id, words.bd, TRAV_BAND_HOLD_MS, aged); seaRaidHear(f.id, words.sr, TRAV_BAND_HOLD_MS, aged); }
  }
  function room(list) {
    const here = new Set((list ?? []).map((f) => f.id));
    for (const peers of [bands(), raids()]) for (const [, p] of peers) if (!here.has(p.from)) regionChaseWithdraw(peers, p.from);
    for (const f of list ?? []) if (f.ag * 1000 < TRAV_BAND_HOLD_MS) hear(f, f.ag * 1000); else hear({ id: f.id, p: null });
  }
  return { hear, room };
}
