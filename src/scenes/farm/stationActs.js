// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 5 (docs/FARM-EXPANSION.md section 6.3): STATIONING A SWORN BEAST, WITHOUT A MENU. Walk a
// sworn beast to the farm, click an empty beast post, answer DFU's Y/N: it is chained there and works its patch. Click it at
// its post and answer Y/N: it comes back. The service (the garden's `station` and `recall` ops) is asked first; the
// character's own record (revenantCompanions.js) is written when it says yes. Also here: the ploughing row (a stationed
// grizzly's game) and the reconcile that lets the service's word win for where a beast stands. Wired by farmingMode.js.
import { t } from '../../systems/textManager.js';
import { revenantsWithYou, stationRevenant, recallStationed, reconcileStations } from '../../systems/revenant/revenantCompanions.js';
import { swornRevenants } from '../../systems/revenant/revenant.js';
import { artOf } from '../../systems/revenant/revenantArts.js';
import { stationKind, stationsOf, isStationBeast, KIND_WORDS, ROLE_WORDS, PLOUGH_BEDS } from '../../net/farm/stationLaw.js';
import { postIndexOf } from '../../world/farm/farmstead.js';
import { FARM_BED_SPACING } from '../../net/farmGardenLaw.js';

/** A kind's name in the player's words. */
export const kindWord = (mobileType) => t(`farm.beast.kind.${stationKind(mobileType)?.key}`, KIND_WORDS[stationKind(mobileType)?.key] ?? 'beast');
const roleWord = (mobileType) => { const r = stationKind(mobileType)?.role; return r ? t(`farm.beast.role.${r}`, ROLE_WORDS[r]) : ''; };

/**
 * @param {{ garden: () => any, farm: () => ({ mapId: number } | null), now: () => number, say: (s: string) => void, busy: () => boolean,
 *   ask: (lines: string[], yes: () => void) => void, act: (action: any) => any, passive: boolean, beds: () => number[][] }} d
 */
export function createStationActs(d) {
  const entryAt = (post) => stationsOf(d.garden()).find((s) => s.post === post) ?? null;
  /** A station of mine: its revenant is one of this character's sworn. */
  const mine = (entry) => !!entry && swornRevenants().some((r) => r.id === entry.revenantId);
  /** The sworn beast to station: the first walking with me that is a beast. */
  const candidate = () => revenantsWithYou().find((r) => isStationBeast(r.mobileType)) ?? null;

  return {
    /** The hover line over a post. */
    label(id) {
      const post = postIndexOf(id), e = post >= 0 ? entryAt(post) : null;
      if (!e) return t('farm.beast.postEmpty', 'A beast post · bring a sworn beast and click it to station it');
      const line = t('farm.beast.stationed', '{name} the {kind}, {work}.', { name: e.name, kind: kindWord(e.kind), work: roleWord(e.kind) });
      return mine(e) ? `${line} ${t('farm.beast.callHint', 'Click to call it back.')}` : line;
    },
    /** A post's pick target made to fit the beast standing at it, if one does (the pick's cylinder). */
    target(tg, heights) {
      const post = postIndexOf(tg.id);
      if (post < 0) return tg;
      const e = entryAt(post), h = e ? heights.get(e.revenantId) : null;
      return h ? { ...tg, r: Math.max(tg.r, .9), h: Math.max(tg.h, h) } : tg;
    },
    /** A post clicked, in reach. */
    use(target) {
      const post = postIndexOf(target.id); if (post < 0 || d.busy()) return;
      const e = entryAt(post);
      if (e) {
        if (!mine(e)) { d.say(t('farm.beast.notYours', '{name} stands here, kept by another of the Company.', { name: e.name })); return; }
        d.ask([t('farm.beast.recallAsk', 'Call {name} back from its post?', { name: e.name }), t('farm.beast.recallMore', 'It will walk at your heel again, or wait away if your companions are full.')],
          () => d.act({ op: 'recall', revenantId: e.revenantId }));
        return;
      }
      const r = candidate();
      if (!r) { d.say(revenantsWithYou().length ? t('farm.beast.noBeast', 'None of the sworn at your side is a beast fit to stand at a post.') : t('farm.beast.noneWith', 'Walk a sworn beast to the post first: a wolf, a bear, a boar, a spider, a bat...')); return; }
      d.ask([t('farm.beast.stationAsk', 'Station {name} the {kind} at this post?', { name: r.name, kind: kindWord(r.mobileType) }),
        t('farm.beast.stationMore', 'It will stand here, {work}, and never leave you. It does not count as a companion at your side.', { work: roleWord(r.mobileType) })],
      () => d.act({ op: 'station', post, revenantId: r.id, kind: r.mobileType, name: r.name, rank: r.rank, art: artOf(r) ?? null }));
    },
    /** The service said yes: write the record, and say it. Answers whether the notice was given. */
    done(action, data) {
      const farm = d.farm();
      if (action.op === 'station' && farm) {
        const r = swornRevenants().find((x) => x.id === action.revenantId);
        if (r && r.companion?.state !== 'station') stationRevenant(action.revenantId, farm.mapId, Math.floor(d.now()));   // a read may already have marked it (reconcileStations)
        d.say(t('farm.beast.chained', '{name} sniffs the post, and lies down.', { name: action.name }));
        return true;
      }
      if (action.op === 'recall') {
        const place = recallStationed(action.revenantId);
        const name = data?.recalled?.name ?? '';
        d.say(place === 'away' ? t('farm.beast.recalledAway', '{name} comes off its post, and will wait until there is room at your side.', { name }) : t('farm.beast.recalled', '{name} shakes off the chain and comes to your heel.', { name }));
        return true;
      }
      return false;
    },
    /** A garden read: the service's word wins for where my beasts stand (reconcileStations). */
    sync(garden) {
      const farm = d.farm(); if (d.passive || !farm) return;
      const { home } = reconcileStations(farm.mapId, stationsOf(garden).map((s) => s.revenantId));
      for (const name of home) d.say(t('farm.beast.cameHome', '{name} has come home from the farm.', { name }));
    },
    /** The row a plough turns from bed `index`: the untilled beds in line with it, the longer of the two ways, up to PLOUGH_BEDS. */
    ploughRow(index) {
      const beds = d.beds(), gardenBeds = d.garden().beds ?? {}, at = beds[index]; if (!at) return [];
      const wild = (i) => (gardenBeds[i] ?? null) === null;
      const chain = (axis) => {   // the beds sharing the clicked one's other coordinate, stepped outward bed by bed
        const other = axis === 0 ? 2 : 0, line = beds.map((p, i) => ({ p, i })).filter(({ p, i }) => Math.abs(p[other] - at[other]) < .3 && wild(i)).sort((a, b) => a.p[axis] - b.p[axis]);
        const k = line.findIndex((x) => x.i === index); if (k < 0) return [index];
        let lo = k, hi = k;
        while (lo > 0 && line[lo].p[axis] - line[lo - 1].p[axis] <= FARM_BED_SPACING + .15) lo--;
        while (hi < line.length - 1 && line[hi + 1].p[axis] - line[hi].p[axis] <= FARM_BED_SPACING + .15) hi++;
        // the window of PLOUGH_BEDS about the clicked bed
        const from = Math.max(lo, Math.min(k - Math.floor(PLOUGH_BEDS / 2), hi - PLOUGH_BEDS + 1));
        return line.slice(from, Math.min(hi + 1, from + PLOUGH_BEDS)).map((x) => x.i);
      };
      const a = chain(0), b = chain(2);
      return b.length > a.length ? b : a;
    },
  };
}
