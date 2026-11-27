// @ts-check
import { boardFor, takeContract, contractLine, contractSites, marqueOffer, admiraltyOffer, deliveryPort, CONTRACTS_MAX, STANDING_ABANDONED } from './harbourBoard.js';
import { MINUTES_PER_DAY } from '../../world/gameDate.js';
import { perksOf, PERKS_REFUSED_AT, LEAGUE_M } from './captainLedger.js';
import { exchangeOf, goodById, goodIn, takeGood, mintGood, goodsWeight, CREW } from './tradeGoods.js';
import { crewRowOf, CREW_TRADE_TEXT, handsNamed } from './crewTrade.js';
import { markCounterBought } from '../../trade/tradeModes.js';
import { chartAboard, chartSite, mintChart, cacheGold, CHART_SITE } from './treasureCharts.js';
import { t } from '../../ui/textManager.js';
import { noteAct } from '../questlines/qlActs.js';

const gold = (n) => `${Math.round(n).toLocaleString('en-US')} gold`;
const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
const cargoVoidWords = (c) => t('sea.board.cargoVoid', 'Contract void: {title}. No ship can make port there.', { title: c.title });
const movedWords = (c) => (c.kind === 'hunt' ? `${c.done} of ${c.need} pirate ships ended` : c.kind === 'survey' ? `${c.done} of ${c.need} ships studied`
  : c.kind === 'salvage' ? `${c.done} of ${c.need} casks raised` : '');

// A voyage counts from the port she last lay still in: a slow boat berths every second she is in a port's waters.
export const PORT_VOYAGE_M = LEAGUE_M / 4;

/** @param {any} deps */
export function createHarbourOffice(deps) {
  const L = deps.ledger;
  const now = () => Math.floor(Number(deps.now?.()) || 0);
  const perksAt = (crown) => (crown ? perksOf(L.rank(crown).rank, deps.notorietyOf?.(crown) ?? 0) : perksOf(0));
  const portHere = () => deps.port?.() ?? null;
  const townAt = (port) => deps.town?.exchangeAt?.(port) ?? null;
  const perksHere = () => perksAt(portHere()?.crown ?? deps.waters?.() ?? null);

  function berthed(ev) {
    const log = L.log;
    if (!log) return;
    const sailed = Number(log.sailed) || 0, from = log.departed ?? null;
    if (from && from.port !== ev.port && sailed - from.sailed >= PORT_VOYAGE_M) { noteAct('port-reached'); log.departed = { port: ev.port, sailed }; return; }
    if (!from || ev.still !== false) log.departed = { port: ev.port, sailed };
  }
  function event(ev) {
    if (ev?.type === 'berth' && typeof ev.port === 'string') berthed(ev);
    const r = L.contractEvent(ev);
    for (const c of r.done) { deps.credit?.(c.pay); deps.mid?.(`Contract done: ${c.title}. ${gold(c.pay)} paid by ${c.port?.name ?? c.crown}'s harbormaster.`, 5); }
    for (const c of r.done) if (c.kind === 'delivery') noteAct('cargo-delivered');
    for (const c of r.failed) deps.mid?.(`Contract failed: ${c.title}.${c.kind === 'delivery' ? ' The cargo went down with the ship.' : ''}`, 5);
    for (const c of r.moved) deps.say?.(`${c.title}: ${movedWords(c)}.`, 3);
    for (const c of r.voided ?? []) deps.mid?.(c.kind === 'delivery' ? cargoVoidWords(c) : `Bounty void: ${c.title}. Someone else sank it.`, 5);
    return r;
  }
  function tick() {
    const failed = L.expireContracts(now());
    for (const c of failed) deps.mid?.(`Contract failed: ${c.title}. Its term ran out.`, 5);
    const ports = deps.ports?.() ?? [];
    if (ports.length && typeof deps.seaAt === 'function') {
      for (const c of L.contracts()) {
        if (c.kind !== 'delivery' || (ports.some((p) => p.key === c.to?.key) && deliveryPort(c.to, deps.seaAt))) continue;
        event({ type: 'unported', port: c.to?.key });
      }
    }
    return failed;
  }
  function board(port = portHere()) {
    if (!port?.crown) return [];
    return boardFor({ port, crown: port.crown, day: deps.day?.() ?? 0, level: deps.level?.() ?? 1, perks: perksAt(port.crown), ports: deps.ports?.() ?? [], seaAt: deps.seaAt ?? null, regionIndex: port.region ?? 17, taken: L.taken() });
  }
  function take(id, boat = null) {
    const o = board().find((x) => x.id === id);
    if (!o) return { ok: false, text: 'That contract is no longer on the board.' };
    if (L.contracts().length >= CONTRACTS_MAX) return { ok: false, text: `You hold ${CONTRACTS_MAX} contracts already.` };
    if (o.kind === 'delivery' && boat?.uid == null) return { ok: false, text: 'A cargo needs a ship of your own to carry it.' };
    const c = takeContract(o, { now: now(), boat: o.kind === 'delivery' ? boat.uid : null });
    if (!L.holdContract(c)) return { ok: false, text: 'The harbormaster will not give it to you.' };
    return { ok: true, text: o.kind === 'delivery' ? `The cargo is stowed in your hold. ${days(o.days)} to ${o.to.name}.` : `Taken: ${o.title}. ${days(o.days)}.` };
  }
  function abandon(id) {
    const c = L.abandonContract(id);
    return c ? { ok: true, text: `You give up ${c.title}. ${c.crown} thinks the less of you (${STANDING_ABANDONED}).` } : { ok: false, text: '' };
  }
  function buyMarque() {
    const port = portHere();
    if (!port?.crown) return { ok: false, text: '' };
    const o = marqueOffer({ crown: port.crown, perks: perksAt(port.crown), gold: deps.gold?.() ?? 0, held: L.marque(now()) });
    if (!o.can) return { ok: false, text: o.why };
    deps.pay?.(o.price);
    L.setMarque(port.crown, now() + o.days * MINUTES_PER_DAY);
    return { ok: true, text: `${port.crown}'s letter of marque is yours for ${days(o.days)}. ${port.crown} counts its rivals' ships as fair prizes, but their own crowns still call it piracy.` };
  }
  function buyCarrack() {
    const port = portHere();
    if (!port?.crown) return { ok: false, text: '' };
    const o = admiraltyOffer({ crown: port.crown, perks: perksAt(port.crown), gold: deps.gold?.() ?? 0 });
    if (!o.can) return { ok: false, text: o.why };
    if (!deps.carrack?.(o.price, port)) return { ok: false, text: 'The Admiralty\'s yard has no carrack to give today.' };
    deps.pay?.(o.price);
    return { ok: true, text: `The Admiralty's carrack is yours. It is waiting at ${port.name}. See Holdings > Fleet.` };
  }

  /** @param {any} boat */
  function model(boat = null) {
    const port = portHere();
    if (!port?.crown) return null;
    const rank = L.rank(port.crown), perks = perksAt(port.crown), t = now();
    const held = L.contracts();
    const full = held.length >= CONTRACTS_MAX;
    const hunted = (deps.notorietyOf?.(port.crown) ?? 0) >= PERKS_REFUSED_AT;
    const mq = marqueOffer({ crown: port.crown, perks, gold: deps.gold?.() ?? 0, held: L.marque(t) });
    const ad = admiraltyOffer({ crown: port.crown, perks, gold: deps.gold?.() ?? 0 });
    return {
      port: port.name, crown: port.crown, rank: rank.title, standing: L.standing(port.crown), hunted,
      board: board(port).map((o) => ({
        id: o.id, kind: o.kind, title: o.title, words: o.words, pay: gold(o.pay), term: days(o.days), standing: `+${o.standing} with ${o.crown}`,
        can: !full && (o.kind !== 'delivery' || boat?.uid != null), why: full ? `You hold ${CONTRACTS_MAX} contracts already.` : o.kind === 'delivery' && boat?.uid == null ? 'A cargo needs a ship of your own.' : '',
      })),
      held: held.map((c) => ({ id: c.id, ...contractLine(c, t) })),
      marque: { price: gold(mq.price), days: days(mq.days), can: mq.can, why: mq.why, held: L.marque(t) },
      admiralty: { price: gold(ad.price), can: ad.can, why: ad.why, open: !!perks.admiralty },
      take: (id) => take(id, boat), abandon, buyMarque, buyCarrack,
    };
  }

  const units = (r, n) => `${n} ${n === 1 ? r.unit : r.units} of ${r.name}`;
  const asked = (n) => Math.max(1, Number.isFinite(n) ? Math.floor(n) : Number.MAX_SAFE_INTEGER);
  const roomFor = (room, kg) => (room && Number.isFinite(room.stops) && Number.isFinite(room.load) ? Math.max(0, Math.floor((room.stops - room.load - 1e-6) / Math.max(1e-6, kg))) : Infinity);
  function buyGood(port, day, hold, id, n, room = null) {
    if (!hold) return { ok: false, text: 'Goods go in a ship\'s hold. Trade at the exchange from the helm.' };
    const r = exchangeOf(port, day, L.dealtAt(port.key, day), L.stats?.().trade, townAt(port)).find((x) => x.id === id);
    if (!r || r.sells <= 0) return { ok: false, text: r?.exotic ? `${r.name} is not sold here.` : `The exchange sells no more ${goodById(id)?.name ?? 'of that'} today.` };
    const fit = roomFor(room?.(), r.kg);
    if (fit <= 0) return { ok: false, text: 'The ship can\'t carry any more.' };
    const k = Math.min(asked(n), r.sells, Math.floor((deps.gold?.() ?? 0) / r.sell), fit);
    if (k <= 0) return { ok: false, text: `Not enough gold: ${gold(r.sell)} a ${r.unit}.` };
    deps.pay?.(k * r.sell);
    const goods = mintGood(id, k);
    // Mark the cost before a stack merge takes the item.
    markCounterBought([goods], { price: k * r.sell });
    deps.stow?.(hold, goods);
    L.deal(port.key, day, id, k, 'bought');
    deps.town?.seaDeal?.(port);
    return { ok: true, text: `Bought ${units(r, k)} for ${gold(k * r.sell)}.` };
  }
  function sellGood(port, day, hold, id, n) {
    if (!hold) return { ok: false, text: 'Goods are sold from a ship\'s hold. Trade at the exchange from the helm.' };
    const r = exchangeOf(port, day, L.dealtAt(port.key, day), L.stats?.().trade, townAt(port)).find((x) => x.id === id);
    const have = goodIn(hold, id);
    if (!r || have <= 0) return { ok: false, text: `You carry no ${goodById(id)?.name ?? 'such goods'}.` };
    if (r.buys <= 0) return { ok: false, text: `The exchange will take no more ${r.name} today.` };
    const k = takeGood(hold, id, Math.min(asked(n), have, r.buys));
    deps.credit?.(k * r.buy);
    L.deal(port.key, day, id, k, 'sold');
    L.note('traded', k * r.buy);
    deps.town?.seaDeal?.(port);
    return { ok: true, text: `Sold ${units(r, k)} for ${gold(k * r.buy)}.` };
  }
  const crewRow = (port, day) => crewRowOf(port, day, { dealt: L.dealtAt(port.key, day), edge: L.stats?.().trade, town: townAt(port), discount: perksHere().yard });
  const crewRefused = (s) => (!s?.crewed ? CREW_TRADE_TEXT.noCrew : s.charter ? CREW_TRADE_TEXT.charter : s.fighting ? CREW_TRADE_TEXT.fighting : null);
  function buyCrew(port, day, deal, n) {
    const s = deal?.stands?.() ?? null;
    const no = crewRefused(s);
    if (no) return { ok: false, text: no };
    const r = crewRow(port, day);
    if (r.sells <= 0) return { ok: false, text: CREW_TRADE_TEXT.noneToday };
    if (s.room <= 0) return { ok: false, text: CREW_TRADE_TEXT.full };
    const k = Math.min(asked(n), r.sells, Math.floor((deps.gold?.() ?? 0) / r.sell));
    if (k <= 0) return { ok: false, text: CREW_TRADE_TEXT.short(r.sell) };
    const on = deal.signOn(k), got = on.n;
    deps.pay?.(got * r.sell);
    L.deal(port.key, day, CREW.id, got, 'bought');
    deps.town?.seaDeal?.(port);
    return { ok: true, text: [CREW_TRADE_TEXT.bought(got, got * r.sell), on.joined.length ? CREW_TRADE_TEXT.signedOn(handsNamed(on.joined)) : ''].filter(Boolean).join(' ') };
  }
  function sellCrew(port, day, deal, n) {
    const s = deal?.stands?.() ?? null;
    const no = crewRefused(s);
    if (no) return { ok: false, text: no };
    if (s.spare <= 0) return { ok: false, text: s.why };
    const r = crewRow(port, day);
    if (r.buys <= 0) return { ok: false, text: CREW_TRADE_TEXT.noneWanted };
    const off = deal.signOff(Math.min(asked(n), r.buys)), gone = off.n;
    deps.credit?.(gone * r.buy);
    L.deal(port.key, day, CREW.id, gone, 'sold');
    L.note('traded', gone * r.buy);
    deps.town?.seaDeal?.(port);
    return { ok: true, text: [CREW_TRADE_TEXT.sold(gone, gone * r.buy), off.left.length ? CREW_TRADE_TEXT.paidOff(handsNamed(off.left)) : ''].filter(Boolean).join(' ') };
  }
  /** @param {{ uid?: any, cargo?: any[] | (() => any[] | null) | null, room?: () => ({ load: number, slows: number, stops: number } | null), crewDeal?: any } | null} boat */
  function exchange(boat = null) {
    const port = portHere();
    if (!port) return null;
    const day = deps.day?.() ?? 0, hold = (typeof boat?.cargo === 'function' ? boat.cargo() : boat?.cargo) ?? null, room = typeof boat?.room === 'function' ? boat.room : null;
    const others = deps.etherGoods?.() !== false;
    const deal = boat?.crewDeal ?? null, hands = deal?.stands?.() ?? null;
    const rows = exchangeOf(port, day, L.dealtAt(port.key, day), L.stats?.().trade, townAt(port)).map((r) => ({ ...r, have: goodIn(hold, r.id) })).filter((r) => others || !r.exotic || r.have > 0);
    if (hands?.crewed && !hands.charter) rows.unshift({ ...crewRow(port, day), name: CREW_TRADE_TEXT.title, have: hands.crew, whole: hands.maxCrew, room: hands.room, spare: hands.spare, why: hands.why });
    const rm = room?.();
    return {
      port: port.name, ether: !!port.ether, gold: deps.gold?.() ?? 0, weight: hold ? goodsWeight(hold) : null, rows,
      band: deps.town?.bandAt?.(port) ?? null,
      room: rm && Number.isFinite(rm.stops) && Number.isFinite(rm.load) ? Math.max(0, Math.floor(rm.stops - rm.load)) : null,
      buy: (id, n) => (id === CREW.id ? buyCrew(port, day, deal, n) : buyGood(port, day, hold, id, n, room)),
      sell: (id, n) => (id === CREW.id ? sellCrew(port, day, deal, n) : sellGood(port, day, hold, id, n)),
    };
  }

  function chartFor(cls, seed, deep = false) {
    const c = chartAboard(cls, seed, { deep });
    return c == null ? null : mintChart(c);
  }
  function readChart(item) {
    const site = chartSite(item?.message ?? 0, deps.ports?.() ?? [], deps.seaAt ?? (() => false));
    if (!site) return { ok: false, text: 'The chart\'s ink has run. You know no coast on it.' };
    if (L.charts().some((c) => c.id === site.id)) return { ok: true, text: `You have marked this cache already: ${site.words}.` };
    if (L.wasRaised?.(site.id)) return { ok: true, text: `This cache was raised long ago. The chart is worth no more than its parchment.` };
    if (!L.markChart(site)) return { ok: false, text: 'Your charts are full of marks. Raise a cache first.' };
    return { ok: true, text: `You mark the chart's cache on your own charts: ${site.words}. Sail there and your lookout will find it.` };
  }
  function raiseCache(id) {
    const c = L.raiseChart(id);
    if (!c) return 0;
    const g = cacheGold(c.seed, deps.level?.() ?? 1);
    deps.credit?.(g);
    return g;
  }

  return {
    event, tick, board, take, abandon, buyMarque, buyCarrack, model, exchange, chartFor, readChart, raiseCache,
    sites: () => [...contractSites(L.contracts()), ...L.charts().map((c) => ({ id: c.id, kind: 'cache', px: c.px, py: c.py, seed: c.seed, n: 1 }))],
    pageCharts: () => L.charts().map((c) => ({ title: `A cache ${c.words}`, line: c.id.startsWith(CHART_SITE) ? 'Marked from a pirate\'s chart' : '' })),
    bountyWords: (id) => { const c = L.contracts().find((x) => x.id === id); return c ? `${gold(c.pay)} · posted at ${c.port?.name ?? c.crown}` : null; },
    perksHere,
    perksAt,
    pageContracts: () => L.contracts().map((c) => { const l = contractLine(c, now()); return { title: c.title, state: l.left, done: false, line: [l.progress, l.pay].filter(Boolean).join(' - ') }; }),
  };
}
