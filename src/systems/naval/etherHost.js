// @ts-check
import { islesNear, isleByKey, etherDepthAt, etherBandOf, BANDS, LEAGUE_PX, KIND_WORDS, inEther, inVeil, ETHER_SEA_NAME, ETHER_SEA_TITLE } from '../../world/ethericSea.js';
import { ETHER_CHARTED_MAX } from './captainLedger.js';
import { LEGENDS, legendAt, legendSails, legendAbroad, legendById, rumourOf } from './etherShips.js';
import { mintGood, goodById } from './tradeGoods.js';
import { mulberry32 } from '../../combat/bloodArt.js';

export const SIGHT_PX = 3;
export const HARVEST_REACH_PX = 1;
export const HARVEST_CASKS = 3;
export const STRAND_YIELD = Object.freeze([2, 3, 4, 6]);
export const HARVEST_DAYS = 7;
export const STRAND_SITE = 'strand:';
export const CHART_BUY_PX = 40;
export const CHART_BUY_PRICE = Object.freeze({ base: 150, band: 75 });
export const PAPERS_CHANCE = 0.25;
export const PAPERS_PX = 30;
export const PAPERS_SALT = 0x9a9e;

const gold = (n) => `${Math.round(n).toLocaleString('en-US')} gold`;
const bandIndex = (id) => Math.max(0, BANDS.findIndex((b) => b.id === id));

/** @param {any} deps */
export function createEtherHost(deps) {
  const L = deps.ledger;
  const day = () => Math.floor(Number(deps.day?.()) || 0);

  function waters(px, py) {
    if (!inEther(px, py)) return null;
    const depth = etherDepthAt(px);
    const band = etherBandOf(depth);
    return { band: band.id, bandName: band.name, depth, veil: inVeil(px, py) };
  }

  function sight(px, py) {
    if (!inEther(px, py)) return [];
    L.deepest?.(etherDepthAt(px), day());
    const fresh = islesNear(px, py, SIGHT_PX).filter((i) => L.chartIsle(i.key));
    for (const i of fresh) deps.say?.(`Land ho! ${i.name.replace(/^./, (c) => c.toUpperCase())}${i.kind === 'port' || i.kind === 'ruin' ? ` - ${KIND_WORDS[i.kind]}` : ''}. It is on your charts.`, 4);
    return fresh;
  }

  const bare = (key) => { const d = L.gatheredDay(key); return d != null && day() - d < HARVEST_DAYS; };
  function sites(px, py) {
    if (!inEther(px, py)) return [];
    return islesNear(px, py, HARVEST_REACH_PX).filter((i) => i.kind === 'wild' && i.good && !bare(i.key))
      .map((i) => ({ id: `${STRAND_SITE}${i.key}`, kind: 'strand', px: i.px, py: i.py, seed: i.seed, n: HARVEST_CASKS }));
  }
  function gather(siteId) {
    const key = String(siteId ?? '').startsWith(STRAND_SITE) ? String(siteId).slice(STRAND_SITE.length) : null;
    const isle = key ? isleByKey(key) : null;
    if (!isle?.good) return { items: [], text: '' };
    if (!bare(isle.key)) L.gathered(isle.key, day());
    const n = STRAND_YIELD[bandIndex(isle.band)] ?? STRAND_YIELD[0];
    const g = goodById(isle.good);
    return { items: [mintGood(isle.good, n)], text: `${n} ${n === 1 ? g?.unit : g?.units} of ${g?.name.toLowerCase()} from the strand of ${isle.name}.` };
  }

  function legendHere(px, py, { night = false } = {}) {
    const l = inEther(px, py) ? legendAt(px, py) : null;
    if (!l || !legendSails(L.legendDay(l.id), day()) || !legendAbroad(l, { night })) return null;
    return l;
  }
  function legendEnded(id, act) {
    const l = legendById(id);
    // A legend this captain ended pays nothing until she rises, even when another player's copy of her sinks.
    if (!l || !legendSails(L.legendDay(l.id), day())) return 0;
    L.endLegend(l.id, day());
    deps.credit?.(l.purse);
    deps.mid?.(`${l.name} is ${act === 'board' ? 'taken' : 'sunk'}! ${ETHER_SEA_TITLE} will speak of this. ${gold(l.purse)} from the captain's hoard.`, 6);
    return l.purse;
  }
  const rumours = (port) => LEGENDS.map((l) => rumourOf(l, port, { endedDay: L.legendDay(l.id), day: day() }));

  function chartOffer(port) {
    const price = CHART_BUY_PRICE.base + CHART_BUY_PRICE.band * bandIndex(etherBandOf(etherDepthAt(port.px)).id);
    const isles = islesNear(port.px, port.py, CHART_BUY_PX).filter((i) => !L.isCharted(i.key));
    const room = Math.max(0, ETHER_CHARTED_MAX - L.charted().length);
    const fresh = Math.min(isles.length, room);
    const purse = Number(deps.gold?.()) || 0;
    return { price, fresh, can: fresh > 0 && purse >= price, why: !isles.length ? 'Every isle in these waters is already on your charts.' : !room ? 'Your charts can hold no more isles.' : purse < price ? `You need ${gold(price)}.` : '' };
  }
  function buyChart(port) {
    const o = chartOffer(port);
    if (!o.can) return { ok: false, text: o.why };
    deps.pay?.(o.price);
    const n = islesNear(port.px, port.py, CHART_BUY_PX).filter((i) => L.chartIsle(i.key)).length;
    return { ok: true, text: `The harbormaster unrolls a chart of these waters: ${n} ${n === 1 ? 'isle' : 'isles'} marked on yours.` };
  }
  function papers(cls, seed, px, py) {
    if (cls?.faction !== 'pirate' || !inEther(px, py)) return 0;
    const r = mulberry32(((seed >>> 0) ^ PAPERS_SALT) >>> 0);
    if (!(r() < PAPERS_CHANCE)) return 0;
    const n = islesNear(px, py, PAPERS_PX).filter((i) => L.chartIsle(i.key)).length;
    if (n) deps.say?.(`Among the ship's papers is a chart of these waters: ${n} ${n === 1 ? 'isle' : 'isles'} marked on yours.`, 5);
    return n;
  }

  function office(port) {
    if (!port?.ether) return null;
    const depth = etherDepthAt(port.px);
    return {
      ether: true, port: port.name, waters: `${etherBandOf(depth).name}, ${Math.round(depth)} leagues past the Veil`,
      rumours: rumours(port), charted: L.charted().length, chart: chartOffer(port),
      hear: () => { for (const l of LEGENDS) L.hearLegend?.(l.id); },
    };
  }

  function chart(px, py, yaw) {
    const log = L.log ?? {};
    return {
      px, py, yaw, charted: L.charted(), day: day(),
      legends: (L.heard?.() ?? []).map((id) => legendById(id)).filter(Boolean).map((l) => ({ id: l.id, name: l.name, trait: l.trait, sails: legendSails(L.legendDay(l.id), day()) })),
      stats: { charted: L.charted().length, deepest: log.deepest ?? 0, crossings: L.crossings ?? 0, legends: (log.legends ?? []).length },
    };
  }

  return {
    waters, sight, sites, gather, legendHere, legendEnded, rumours, chartOffer, buyChart, papers, office, chart, seaName: ETHER_SEA_NAME, leaguePx: LEAGUE_PX,
    credit: (n) => deps.credit?.(n), mid: (text, s) => deps.mid?.(text, s), say: (text, s) => deps.say?.(text, s),
    // The ledger saves each ended flagship and hauled wreck cask, so a reload neither pays nor floats them again.
    endFleet: (n) => !!L.endFleet?.(n), fleetDone: (n) => !!L.fleetEnded?.(n), haulWrack: (id) => !!L.haulWrack?.(id), wrackHauled: (id) => !!L.wrackHauled?.(id),
  };
}
