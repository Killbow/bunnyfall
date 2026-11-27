// @ts-check
import { CROWNS } from './navalShips.js';
import { LEAGUE_M, inEtherLaw, ETHER_WORD } from '../../world/ethericSea.js';
import { HARBOUR_CONTRACT_KINDS, CONTRACTS_MAX, STANDING_FAILED, STANDING_ABANDONED, advance, expired, restoreContract } from './harbourBoard.js';
import { captainOf, heldStars, starStats } from './captainTree.js';
import { seaSeasonOfDay, SEA_DEEPEST_MAX } from '../../net/sea/seaSeasonLaw.js';

export const CAPTAIN_SAVE_VENDOR = 'Captain';
export const CAPTAIN_SAVE_VERSION = 1;
export const CROWN_STANDING_MAX = 999;
export const CROWN_STANDING_MIN = -99;
export const CROWN_RANKS = Object.freeze([
  Object.freeze({ rank: 0, at: -Infinity, key: 'unsworn', title: 'Unsworn' }),
  Object.freeze({ rank: 1, at: 15, key: 'sworn', title: 'Sworn Captain' }),
  Object.freeze({ rank: 2, at: 50, key: 'privateer', title: 'Privateer' }),
  Object.freeze({ rank: 3, at: 120, key: 'commodore', title: 'Commodore' }),
  Object.freeze({ rank: 4, at: 250, key: 'admiral', title: 'Admiral' }),
]);
export function crownRankOf(standing) {
  const s = Number(standing) || 0;
  let r = CROWN_RANKS[0];
  for (const x of CROWN_RANKS) if (s >= x.at) r = x;
  return r;
}
export function nextRankOf(standing) {
  const r = crownRankOf(standing);
  const next = CROWN_RANKS[r.rank + 1];
  return next ? { rank: next, wanting: Math.max(0, next.at - (Number(standing) || 0)) } : null;
}
export const RANK_PERKS = Object.freeze([
  Object.freeze({ yard: 0, pay: 0, offers: 0, marque: false, admiralty: false, seasoned: false, relief: false }),
  Object.freeze({ yard: 0.05, pay: 0.1, offers: 1, marque: false, admiralty: false, seasoned: false, relief: false }),
  Object.freeze({ yard: 0.1, pay: 0.2, offers: 1, marque: true, admiralty: false, seasoned: false, relief: false }),
  Object.freeze({ yard: 0.15, pay: 0.3, offers: 2, marque: true, admiralty: true, seasoned: true, relief: false }),
  Object.freeze({ yard: 0.2, pay: 0.4, offers: 2, marque: true, admiralty: true, seasoned: true, relief: true }),
]);
export const PERKS_REFUSED_AT = 25;
export const perksOf = (rank, notoriety = 0) => ((Number(notoriety) || 0) >= PERKS_REFUSED_AT ? RANK_PERKS[0] : RANK_PERKS[Math.max(0, Math.min(RANK_PERKS.length - 1, rank | 0))]);
export const DEED_STANDING = Object.freeze({ sunk: 2, taken: 3, repelled: 2 });
export const PIRACY_STANDING = Object.freeze({ fire: -5, sink: -8, board: -10 });
export const MARQUE_STANDING = Object.freeze({ sink: 2, board: 3 });
export const LEGEND_STANDING = 10;
export { LEAGUE_M };
export const LOG_TRADES = Object.freeze(['pirate', 'merchant', 'navy', 'ether', 'legend']);
export const LOG_CONTRACTS = HARBOUR_CONTRACT_KINDS;
export const BOARD_TAKEN_MAX = 64;
export const CHARTS_MAX = 8;
export const CHARTS_RAISED_KEEP = 64;
export const DEALT_PORTS_MAX = 64;
export const SAILED_MAX_M = 1e10;
export const MARQUE_UNTIL_MAX = 1e9;
export const LOG_LIST_MAX = 32;
export const ETHER_CHARTED_MAX = 4096;
export const ETHER_HARVEST_KEEP = 128;
export const newEther = () => ({ charted: [], legends: {}, harvested: {}, from: null, crossings: 0, heard: [], season: null, fleets: [], wrack: [] });
export const ETHER_FLEETS_KEEP = 4;
export const ETHER_WRACK_KEEP = 16;
export const restoreSeason = (/** @type {any} */ v) => (v && Number.isSafeInteger(v.n) && v.n >= 1 && Number.isSafeInteger(v.deepest) && v.deepest >= 0 && v.deepest <= SEA_DEEPEST_MAX
  && Number.isSafeInteger(v.legends) && v.legends >= 0 ? { n: v.n, deepest: v.deepest, legends: v.legends } : null);
// A way out inside the Eltheric Ocean is refused, so the way home never lands back in it.
export const wayOutOf = (at) => (at && Number.isFinite(at.px) && Number.isFinite(at.py) && Math.abs(at.px) < 8192 && Math.abs(at.py) < 8192 && !inEtherLaw(at.px, at.py)
  ? { px: Math.floor(at.px), py: Math.floor(at.py) } : null);

const size = (cls) => Math.max(1, Math.min(4, (cls?.cargo ?? 1) | 0));
/**
 * @param {'fire'|'sink'|'board'|'repel'} act
 * @param {{ faction?: string, cargo?: number }} cls
 * @param {{ marque?: boolean }} [o]
 */
export function standingFor(act, cls, { marque = false } = {}) {
  if (!cls) return 0;
  if (cls.faction === 'pirate') {
    const k = act === 'sink' ? DEED_STANDING.sunk : act === 'board' ? DEED_STANDING.taken : act === 'repel' ? DEED_STANDING.repelled : 0;
    return k * size(cls);
  }
  if (cls.faction === 'merchant' || cls.faction === 'navy') {
    if (marque) return act === 'sink' ? MARQUE_STANDING.sink * size(cls) : act === 'board' ? MARQUE_STANDING.board * size(cls) : 0;
    return PIRACY_STANDING[act] ?? 0;
  }
  return 0;
}

const crownNames = () => CROWNS.map((c) => c.name);
const whole = (v, max = Number.MAX_SAFE_INTEGER) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
const zeros = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
export function newLog() {
  return {
    sunk: zeros(LOG_TRADES), taken: zeros(LOG_TRADES), repelled: 0, claimed: 0, plunder: 0,
    contracts: zeros(LOG_CONTRACTS), earned: 0, traded: 0, sailed: 0, maps: 0, islands: 0, deepest: 0,
    legends: [], best: null, departed: null,
  };
}
export const restoreDeparted = (/** @type {any} */ d, /** @type {number} */ sailed) => (d && typeof d.port === 'string' && d.port.length > 0 && d.port.length <= 64
  && Number.isFinite(d.sailed) && d.sailed >= 0 && d.sailed <= sailed ? { port: d.port, sailed: d.sailed } : null);

export function createCaptainLedger() {
  let log = newLog();
  /** @type {Record<string, number>} */
  let standing = zeros(crownNames());
  /** @type {{ crown: string, until: number } | null} */
  let marque = null;
  let contracts = [];
  let taken = [];
  let dealt = null;
  let charts = [];
  let raised = [];
  let tree = ['helm'];
  let stats = starStats(tree);
  let ether = newEther();
  let chartedSet = new Set();
  const seasonAt = (/** @type {unknown} */ day) => {
    if (!Number.isFinite(day)) return null;
    const n = seaSeasonOfDay(/** @type {number} */ (day));
    if (ether.season && n < ether.season.n) return null;
    if (!ether.season || n > ether.season.n) ether.season = { n, deepest: 0, legends: 0 };
    return ether.season;
  };

  const standingOf = (crown) => (typeof crown === 'string' && Object.hasOwn(standing, crown) ? standing[crown] : 0);
  const rankChanges = [];
  function regard(crown, n) {
    if (typeof crown !== 'string' || !Object.hasOwn(standing, crown) || !Number.isFinite(n) || n === 0) return null;
    const before = crownRankOf(standing[crown]);
    standing[crown] = Math.max(CROWN_STANDING_MIN, Math.min(CROWN_STANDING_MAX, Math.round(standing[crown] + n)));
    const after = crownRankOf(standing[crown]);
    if (after.rank === before.rank) return null;
    const change = { crown, from: before, to: after };
    rankChanges.push(change);
    return change;
  }
  const ledger = {
    get log() { return log; },
    standing: (crown) => standingOf(crown),
    rank: (crown) => crownRankOf(standingOf(crown)),
    crowns: () => CROWNS.map((c) => ({ crown: c.name, ruler: c.ruler, standing: standing[c.name] ?? 0, rank: crownRankOf(standing[c.name] ?? 0), next: nextRankOf(standing[c.name] ?? 0) })),
    regard,
    /**
     * @param {'fire'|'sink'|'board'|'repel'} act
     * @param {any} cls
     * @param {{ crown?: string|null, marque?: string|null, trade?: string|null, legend?: string|null }} [o]
     */
    deed(act, cls, { crown = null, marque: under = null, trade = null, legend = null } = {}) {
      const changes = [];
      const kind = trade ?? cls?.faction ?? null;
      if (act === 'sink' && kind && kind in log.sunk) log.sunk[kind]++;
      if (act === 'board' && kind && kind in log.taken) log.taken[kind]++;
      if (act === 'repel') log.repelled++;
      if (legend && (act === 'sink' || act === 'board') && !log.legends.includes(legend)) {
        log.legends.push(legend);
        if (log.legends.length > LOG_LIST_MAX) log.legends.shift();
        for (const c of crownNames()) { const ch = regard(c, LEGEND_STANDING); if (ch) changes.push(ch); }
        return changes;
      }
      if (trade === 'ether') return changes;
      const n = standingFor(act, cls, { marque: !!under });
      const to = under ?? crown;
      if (to && n) { const ch = regard(to, n); if (ch) changes.push(ch); }
      return changes;
    },
    note(field, n = 1) {
      if (!Number.isFinite(n) || n <= 0) return;
      if (LOG_CONTRACTS.includes(field)) { log.contracts[field] += Math.floor(n); return; }
      if (field in log && typeof log[field] === 'number' && field !== 'deepest' && field !== 'sailed') log[field] = whole(log[field] + n);
    },
    sailed(m) { if (Number.isFinite(m) && m > 0 && m < 1e5) log.sailed += m; },
    deepest(d, day) {
      if (!Number.isFinite(d)) return;
      if (d > log.deepest) log.deepest = Math.floor(d);
      const s = seasonAt(day);
      if (s) s.deepest = Math.max(s.deepest, Math.min(SEA_DEEPEST_MAX, Math.floor(d)));
    },
    prize(name, worth) { if (Number.isFinite(worth) && worth > 0 && (!log.best || worth > log.best.worth)) log.best = { name: String(name ?? 'a prize').slice(0, 48), worth: Math.floor(worth) }; },
    takeRankChanges: () => rankChanges.splice(0),
    marque: (now) => (marque && Number.isFinite(now) && now < marque.until ? { ...marque } : null),
    setMarque(crown, until) { if (crownNames().includes(crown) && Number.isFinite(until)) marque = { crown, until: Math.floor(until) }; },
    tearMarque() { const was = marque; marque = null; return was; },
    contracts: () => contracts.slice(),
    taken: () => taken.slice(),
    holdContract(c) {
      if (!c || contracts.length >= CONTRACTS_MAX || contracts.some((x) => x.id === c.id)) return false;
      contracts.push(c);
      taken.push(c.id);
      if (taken.length > BOARD_TAKEN_MAX) taken.splice(0, taken.length - BOARD_TAKEN_MAX);
      return true;
    },
    contractEvent(ev) {
      const done = [], failed = [], moved = [], voided = [];
      // An end, study, or haul advances one contract only: the bounty's own quarry first, else the soonest due.
      const one = ev?.type === 'end' || ev?.type === 'study' || ev?.type === 'haul';
      const own = (c) => (c.kind === 'bounty' && c.id === ev.bounty ? 1 : 0);
      const order = one ? [...contracts].sort((a, b) => own(b) - own(a) || a.until - b.until) : [...contracts];
      for (const c of order) {
        const was = c.done | 0;
        const r = advance(c, ev);
        if (r === 'done') { finish(c, true); done.push(c); } else if (r === 'failed') { finish(c, false); failed.push(c); } else if (r === 'void') { contracts = contracts.filter((x) => x !== c); voided.push(c); } else if ((c.done | 0) !== was) moved.push(c);
        if (one && (r || (c.done | 0) !== was)) break;
      }
      return { done, failed, moved, voided };
    },
    expireContracts(now) {
      const failed = contracts.filter((c) => expired(c, now));
      for (const c of failed) finish(c, false);
      return failed;
    },
    abandonContract(id) {
      const c = contracts.find((x) => x.id === id);
      if (!c) return null;
      contracts = contracts.filter((x) => x !== c);
      regard(c.crown, STANDING_ABANDONED);
      return c;
    },
    charts: () => charts.slice(),
    markChart(c) {
      if (!c || typeof c.id !== 'string' || charts.some((x) => x.id === c.id) || charts.length >= CHARTS_MAX) return false;
      charts.push({ ...c });
      return true;
    },
    raiseChart(id) {
      const c = charts.find((x) => x.id === id);
      if (!c) return null;
      charts = charts.filter((x) => x !== c);
      raised = [...raised.filter((x) => x !== id), id].slice(-CHARTS_RAISED_KEEP);
      ledger.note('maps');
      return c;
    },
    wasRaised: (id) => raised.includes(id),
    dealtAt(port, day) {
      const at = dealt && dealt.day === day && typeof port === 'string' && Object.hasOwn(dealt.at, port) ? dealt.at[port] : null;
      return at ? { bought: { ...at.bought }, sold: { ...at.sold } } : { bought: {}, sold: {} };
    },
    deal(port, day, id, n, side) {
      if (typeof port !== 'string' || (side !== 'bought' && side !== 'sold')) return;
      if (!(dealt && dealt.day === day)) dealt = { day, at: Object.create(null) };
      if (!Object.hasOwn(dealt.at, port)) {
        const ports = Object.keys(dealt.at);
        if (ports.length >= DEALT_PORTS_MAX) delete dealt.at[ports[0]];
        dealt.at[port] = { bought: {}, sold: {} };
      }
      const at = dealt.at[port];
      at[side][id] = (Object.hasOwn(at[side], id) ? at[side][id] | 0 : 0) + Math.max(0, n | 0);
    },
    chartIsle(key) {
      if (typeof key !== 'string' || chartedSet.has(key) || ether.charted.length >= ETHER_CHARTED_MAX) return false;
      ether.charted.push(key);
      chartedSet.add(key);
      ledger.note('islands');
      return true;
    },
    isCharted: (key) => chartedSet.has(key),
    charted: () => ether.charted.slice(),
    chartedCount: () => ether.charted.length,
    endLegend(id, day) {
      if (typeof id !== 'string' || !Number.isFinite(day)) return;
      ether.legends[id] = Math.floor(day);
      const s = seasonAt(day);
      if (s) s.legends = whole(s.legends + 1);
    },
    legendDay: (id) => (Number.isFinite(ether.legends[id]) ? ether.legends[id] : null),
    endFleet(n) {
      if (!Number.isSafeInteger(n) || ether.fleets.includes(n)) return false;
      ether.fleets = [...ether.fleets, n].slice(-ETHER_FLEETS_KEEP);
      return true;
    },
    fleetEnded: (n) => ether.fleets.includes(n),
    haulWrack(id) {
      if (typeof id !== 'string' || id.length > 48 || ether.wrack.includes(id)) return false;
      ether.wrack = [...ether.wrack, id].slice(-ETHER_WRACK_KEEP);
      return true;
    },
    wrackHauled: (id) => ether.wrack.includes(id),
    gathered(key, day) {
      if (typeof key !== 'string' || !Number.isFinite(day)) return;
      delete ether.harvested[key];
      ether.harvested[key] = Math.floor(day);
      const keys = Object.keys(ether.harvested);
      for (let i = 0; i < keys.length - ETHER_HARVEST_KEEP; i++) delete ether.harvested[keys[i]];
    },
    gatheredDay: (key) => (Number.isFinite(ether.harvested[key]) ? ether.harvested[key] : null),
    setCrossedFrom(at) { ether.from = wayOutOf(at); },
    crossedFrom: () => (ether.from ? { ...ether.from } : null),
    crossed() { ether.crossings = whole(ether.crossings + 1); },
    hearLegend(id) { if (typeof id === 'string' && !ether.heard.includes(id) && ether.heard.length < LOG_LIST_MAX) ether.heard.push(id); },
    heard: () => ether.heard.slice(),
    get crossings() { return ether.crossings; },
    season: () => (ether.season ? { ...ether.season } : null),
    captain: () => captainOf(log),
    tree: () => tree.slice(),
    setTree(ids) { tree = heldStars(ids, captainOf(log).points); stats = starStats(tree); return tree.slice(); },
    stats: () => stats,
    newSaveData: () => ({ v: CAPTAIN_SAVE_VERSION, log: newLog(), standing: zeros(crownNames()), marque: null, contracts: [], taken: [], dealt: null, charts: [], raised: [], ether: newEther(), tree: ['helm'] }),
    getSaveData: () => ({ v: CAPTAIN_SAVE_VERSION, log: JSON.parse(JSON.stringify(log)), standing: { ...standing }, marque: marque ? { ...marque } : null, contracts: JSON.parse(JSON.stringify(contracts)), taken: taken.slice(), dealt: dealt ? JSON.parse(JSON.stringify(dealt)) : null, charts: JSON.parse(JSON.stringify(charts)), raised: raised.slice(), ether: JSON.parse(JSON.stringify(ether)), tree: tree.slice() }),
    restoreSaveData(r) {
      log = newLog();
      standing = zeros(crownNames());
      marque = null;
      contracts = [];
      taken = [];
      dealt = null;
      charts = [];
      raised = [];
      ether = newEther();
      chartedSet = new Set();
      rankChanges.length = 0;
      tree = ['helm'];
      stats = starStats(tree);
      if (!r || typeof r !== 'object') return;
      const l = r.log && typeof r.log === 'object' ? r.log : {};
      for (const k of LOG_TRADES) { log.sunk[k] = whole(l.sunk?.[k]); log.taken[k] = whole(l.taken?.[k]); }
      for (const k of LOG_CONTRACTS) log.contracts[k] = whole(l.contracts?.[k]);
      for (const k of ['repelled', 'claimed', 'plunder', 'earned', 'traded', 'maps', 'islands', 'deepest']) log[k] = whole(l[k]);
      log.sailed = Number.isFinite(l.sailed) && l.sailed > 0 ? Math.min(SAILED_MAX_M, l.sailed) : 0;
      log.legends = Array.isArray(l.legends) ? l.legends.filter((n) => typeof n === 'string').map((n) => n.slice(0, 48)).slice(-LOG_LIST_MAX) : [];
      log.best = l.best && typeof l.best.name === 'string' && Number.isFinite(l.best.worth) ? { name: l.best.name.slice(0, 48), worth: whole(l.best.worth) } : null;
      log.departed = restoreDeparted(l.departed, log.sailed);
      for (const c of crownNames()) {
        const v = Number(r.standing?.[c]);
        standing[c] = Number.isFinite(v) ? Math.max(CROWN_STANDING_MIN, Math.min(CROWN_STANDING_MAX, Math.round(v))) : 0;
      }
      if (r.marque && crownNames().includes(r.marque.crown) && Number.isFinite(r.marque.until)) marque = { crown: r.marque.crown, until: Math.floor(Math.min(MARQUE_UNTIL_MAX, r.marque.until)) };
      // Duplicate contract and chart ids in a save load once, so they are never paid twice.
      const once = (list) => list.filter((c, i) => list.findIndex((x) => x.id === c.id) === i);
      contracts = once((Array.isArray(r.contracts) ? r.contracts : []).map(restoreContract).filter((c) => c && crownNames().includes(c.crown))).slice(0, CONTRACTS_MAX);
      taken = (Array.isArray(r.taken) ? r.taken : []).filter((id) => typeof id === 'string').slice(-BOARD_TAKEN_MAX);
      const d = r.dealt;
      const counts = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, n]) => Number.isFinite(n) && n > 0).map(([k, n]) => [k, Math.floor(n)]));
      // Older saves stored a single port's dealing as `{ day, port, bought, sold }`.
      if (d && Number.isFinite(d.day) && d.at && typeof d.at === 'object') {
        dealt = { day: Math.floor(d.day), at: Object.create(null) };
        for (const [port, x] of Object.entries(d.at).slice(-DEALT_PORTS_MAX)) dealt.at[port] = { bought: counts(x?.bought), sold: counts(x?.sold) };
      } else if (d && typeof d.port === 'string' && Number.isFinite(d.day)) dealt = { day: Math.floor(d.day), at: Object.assign(Object.create(null), { [d.port]: { bought: counts(d.bought), sold: counts(d.sold) } }) };
      charts = once((Array.isArray(r.charts) ? r.charts : []).filter((c) => c && typeof c.id === 'string' && Number.isFinite(c.px) && Number.isFinite(c.py) && Number.isFinite(c.seed))
        .map((c) => ({ id: c.id, seed: c.seed >>> 0, px: Math.floor(c.px), py: Math.floor(c.py), near: String(c.near ?? ''), words: String(c.words ?? '') }))).slice(0, CHARTS_MAX);
      raised = [...new Set((Array.isArray(r.raised) ? r.raised : []).filter((id) => typeof id === 'string' && id.length <= 64))].slice(-CHARTS_RAISED_KEEP);
      const e = r.ether && typeof r.ether === 'object' ? r.ether : {};
      const days = (o, keep) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k, d]) => typeof k === 'string' && Number.isFinite(d)).map(([k, d]) => [k, Math.floor(d)]).slice(-keep));
      ether.charted = [...new Set((Array.isArray(e.charted) ? e.charted : []).filter((k) => typeof k === 'string' && /^\d{1,4},\d{1,4}$/.test(k)))].slice(0, ETHER_CHARTED_MAX);
      chartedSet = new Set(ether.charted);
      ether.legends = days(e.legends, LOG_LIST_MAX);
      ether.harvested = days(e.harvested, ETHER_HARVEST_KEEP);
      ether.from = wayOutOf(e.from);
      ether.crossings = whole(e.crossings);
      ether.heard = [...new Set((Array.isArray(e.heard) ? e.heard : []).filter((id) => typeof id === 'string' && id.length <= 24))].slice(0, LOG_LIST_MAX);
      ether.season = restoreSeason(e.season);
      // Fleets and wrack casks are saved so a reload never pays for the same one again.
      ether.fleets = [...new Set((Array.isArray(e.fleets) ? e.fleets : []).filter((n) => Number.isSafeInteger(n) && n >= 0))].slice(-ETHER_FLEETS_KEEP);
      ether.wrack = [...new Set((Array.isArray(e.wrack) ? e.wrack : []).filter((id) => typeof id === 'string' && id.length <= 48))].slice(-ETHER_WRACK_KEEP);
      tree = heldStars(r.tree, captainOf(log).points);
      stats = starStats(tree);
    },
  };
  function finish(c, ok) {
    contracts = contracts.filter((x) => x !== c);
    if (!ok) { regard(c.crown, STANDING_FAILED); return; }
    regard(c.crown, c.standing);
    ledger.note(c.kind);
    ledger.note('earned', c.pay);
  }
  return ledger;
}

export const leagueWords = (m) => `${(Math.max(0, Number(m) || 0) / LEAGUE_M).toFixed(1)} leagues`;
/** @param {ReturnType<typeof newLog>} log */
export function logLines(log) {
  const sum = (o) => Object.values(o ?? {}).reduce((s, v) => s + (v | 0), 0);
  const gold = (n) => `${Math.round(n).toLocaleString('en-US')} gold`;
  const byTrade = (o) => LOG_TRADES.filter((k) => o[k]).map((k) => `${o[k]} ${(o[k] === 1 ? TRADE_WORD : TRADE_WORDS)[k]}`).join(', ');
  const lines = [
    ['Ships sunk', sum(log.sunk) ? `${sum(log.sunk)} - ${byTrade(log.sunk)}` : 'none'],
    ['Ships taken', sum(log.taken) ? `${sum(log.taken)} - ${byTrade(log.taken)}` : 'none'],
    ['Leagues sailed', leagueWords(log.sailed)],
  ];
  if (log.repelled) lines.push(['Boarders thrown back', `${log.repelled}`]);
  if (log.claimed) lines.push(['Prizes claimed', `${log.claimed}`]);
  if (log.plunder) lines.push(['Plunder hauled', gold(log.plunder)]);
  if (log.best) lines.push(['Richest prize', `${log.best.name} (${gold(log.best.worth)})`]);
  const done = sum(log.contracts);
  if (done) lines.push(['Contracts done', `${done} - ${LOG_CONTRACTS.filter((k) => log.contracts[k]).map((k) => `${log.contracts[k]} ${(log.contracts[k] === 1 ? CONTRACT_WORD : CONTRACT_WORDS)[k]}`).join(', ')}`]);
  if (log.earned) lines.push(['Contract purses', gold(log.earned)]);
  if (log.traded) lines.push(['Sold at the exchange', gold(log.traded)]);
  if (log.maps) lines.push(['Treasure found', `${log.maps} ${log.maps === 1 ? 'cache' : 'caches'}`]);
  if (log.islands) lines.push([`${ETHER_WORD} isles charted`, `${log.islands}`]);
  if (log.deepest) lines.push([`Deepest ${ETHER_WORD} waters`, `${log.deepest} ${log.deepest === 1 ? 'league' : 'leagues'} past the Veil`]);
  if (log.legends.length) lines.push(['Legends ended', log.legends.join(', ')]);
  return lines;
}
export const TRADE_WORD = Object.freeze({ pirate: 'pirate', merchant: 'merchantman', navy: 'crown\'s ship', ether: `${ETHER_WORD} ship`, legend: 'legend' });
export const TRADE_WORDS = Object.freeze({ pirate: 'pirates', merchant: 'merchantmen', navy: 'crown\'s ships', ether: `${ETHER_WORD} ships`, legend: 'legends' });
export const CONTRACT_WORD = Object.freeze({ bounty: 'bounty', hunt: 'hunt', delivery: 'delivery', salvage: 'salvage', survey: 'survey' });
export const CONTRACT_WORDS = Object.freeze({ bounty: 'bounties', hunt: 'hunts', delivery: 'deliveries', salvage: 'salvages', survey: 'surveys' });
