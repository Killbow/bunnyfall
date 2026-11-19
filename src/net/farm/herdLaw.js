// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 3 (docs/FARM-EXPANSION.md section 5): THE HERD - the Company's animals, kept in the
// garden like the beds. Every one is the Company's: any member feeds, waters, milks and mucks out, and what they give
// goes to the Company Stores. They never die and never run off; neglected, they only stop giving.
//
//   CONTENTMENT (0..100) rises CONTENT_UP a day while an animal is both fed and watered and falls CONTENT_DOWN a day for
//   each it lacks; mucking out its pen lifts it MUCK_LIFT once a day. Feeding takes FEED_UNITS of food from the Company
//   Stores (cows and horses grain or corn; pigs, dogs and cats any food) and lasts a day; water is the well's, free.
//   THE DROVER comes to each farm one UTC day a week (its map id's) with three animals for sale; an officer buys them
//   with Company gold. EACH KIND'S WORK, while content (>= CONTENT_GOOD):
//     cow   - milk once a UTC day into the Stores, more the happier, more again with the milking game;
//     pig   - a mucked-out sty gives manure; each sown bed takes one, +1 care;
//     dog   - guards the field: birds take at most 1 care from a crop;
//     cat   - keeps the granary: sacks wait SACK_LIFE_CAT before going;
//     horse - draws the wagon: a hauled sack is worth more farm work.
// Pure: no clock, no network; the service turns its answers into the Stores' and treasury's statements.
import { validGame, recordPlay, GAMES } from './farmGameLaw.js';
import { herdKeep } from './stationLaw.js';   // PHASE 5: a stationed wolf keeps the herd content

export const HERD_MAX = 16;
/** The kinds, their art (the art register's TEXTURE.201), their drover price, their pen and their most. */
export const ANIMALS = Object.freeze({
  cow: Object.freeze({ art: [201, 3], graze: [201, 4], price: 1500, pen: 'pen', max: 4, feed: 'grain', h: 1.6 }),
  horse: Object.freeze({ art: [201, 0], graze: [201, 1], price: 3000, pen: 'pen', max: 2, feed: 'grain', h: 1.9 }),
  pig: Object.freeze({ art: [201, 5], graze: [201, 6], price: 800, pen: 'sty', max: 4, feed: 'any', h: .85 }),
  dog: Object.freeze({ art: [201, 9], graze: [201, 10], price: 500, pen: 'yard', max: 2, feed: 'any', h: .8 }),
  cat: Object.freeze({ art: [201, 7], graze: [201, 8], price: 200, pen: 'yard', max: 2, feed: 'any', h: .45 }),
});
export const ANIMAL_KINDS = Object.freeze(Object.keys(ANIMALS));
export const CONTENT_UP = 10, CONTENT_DOWN = 15, MUCK_LIFT = 10, CONTENT_GOOD = 50, CONTENT_START = 60;
export const FEED_UNITS = 2, FED_S = 86400, WATERED_S = 86400;
export const MANURE_MAX = 20, SACK_LIFE_CAT = 30 * 60;
const DAY = 86400;
const NAMES = Object.freeze({ cow: ['Bessie', 'Clover', 'Daisy', 'Marigold', 'Buttercup', 'Hazel'], horse: ['Ash', 'Thunder', 'Old Tom', 'Bramble'],
  pig: ['Truffle', 'Mudge', 'Porridge', 'Snout', 'Gristle'], dog: ['Rex', 'Biscuit', 'Fang', 'Patch'], cat: ['Mouser', 'Smudge', 'Whiskers', 'Sooty'] });

function hash(...xs) { let h = 0x811c9dc5; for (const x of xs) { h = Math.imul(h ^ (x | 0), 0x01000193) >>> 0; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; } return (h ^ (h >>> 15)) >>> 0; }

/** An animal's contentment at `nowS`: its stored value moved by the time since it was last tended. */
export function contentAt(a, nowS, keep = 0) {   // PHASE 5: `keep` the herding beasts' daily lift (stationLaw.js herdKeep)
  if (!a) return 0;
  const span = Math.max(0, nowS - a.tick), fed = Math.max(0, Math.min(nowS, a.fedUntil) - a.tick), wet = Math.max(0, Math.min(nowS, a.wateredUntil) - a.tick);
  const both = Math.min(fed, wet), delta = both / DAY * CONTENT_UP - (span - fed) / DAY * CONTENT_DOWN - (span - wet) / DAY * CONTENT_DOWN + span / DAY * keep;
  return Math.max(0, Math.min(100, a.content + delta));
}
/** Whether some animal of `kind` is content now (a kind's work runs while one is). */
export const kindContent = (garden, kind, nowS) => (garden?.herd ?? []).some((a) => a.kind === kind && contentAt(a, nowS, herdKeep(garden)) >= CONTENT_GOOD);
/** An animal's contentment in this garden: its own, with the stationed herders' lift (PHASE 5). */
export const contentIn = (garden, a, nowS) => contentAt(a, nowS, herdKeep(garden));
/** How long a sack waits at its bed on this farm: longer while a content cat keeps the granary. */
export const sackLifeOf = (garden, nowS, base) => (kindContent(garden, 'cat', nowS) ? SACK_LIFE_CAT : base);

// ─── THE DROVER ────────────────────────────────────────────────────────
/** The drover's day at a farm in week `week` (farmWeek), as a UTC day number, and the three kinds he brings. */
export function droverVisit(mapId, week) {
  const dayOfWeek = hash(mapId >>> 0, 77) % 7, day = week * 7 - 3 + dayOfWeek;   // farmWeek's Monday is day week*7-3
  const kinds = [0, 1, 2].map((k) => ANIMAL_KINDS[hash(mapId >>> 0, week, k) % ANIMAL_KINDS.length]);
  return { day, kinds };
}
/** The drover's offer at `nowS`, if he is at the farm today: { week, kinds, sold }. */
export function droverHere(garden, mapId, nowS, farmWeekOf) {
  const week = farmWeekOf(nowS), visit = droverVisit(mapId, week);
  if (Math.floor(nowS / DAY) !== visit.day) return null;
  const sold = garden?.drover?.week === week ? garden.drover.sold : [];
  return { week, kinds: visit.kinds, sold };
}

// ─── VALIDATION ────────────────────────────────────────────────────────
export function validHerd(garden) {
  const fin = (n) => Number.isFinite(n) && n >= 0;
  if (garden.manure !== undefined && !(Number.isSafeInteger(garden.manure) && garden.manure >= 0 && garden.manure <= MANURE_MAX)) return false;
  if (garden.drover !== undefined && !(garden.drover && Number.isSafeInteger(garden.drover.week) && Array.isArray(garden.drover.sold) && garden.drover.sold.length <= 3 && garden.drover.sold.every((i) => [0, 1, 2].includes(i)))) return false;
  if (garden.mucked !== undefined && !(garden.mucked && typeof garden.mucked === 'object' && Object.entries(garden.mucked).every(([k, v]) => ['pen', 'sty', 'yard'].includes(k) && Number.isSafeInteger(v)))) return false;
  return garden.herd === undefined || (Array.isArray(garden.herd) && garden.herd.length <= HERD_MAX && garden.herd.every((a) =>
    a && Number.isSafeInteger(a.id) && a.id >= 1 && ANIMAL_KINDS.includes(a.kind) && typeof a.name === 'string' && a.name.length <= 24
    && ['tick', 'fedUntil', 'wateredUntil'].every((k) => fin(a[k])) && Number.isFinite(a.content) && a.content >= 0 && a.content <= 100
    && (a.milked === undefined || Number.isSafeInteger(a.milked))));
}

// ─── THE ACTS ──────────────────────────────────────────────────────────
/** The animal's state moved to `nowS` (its contentment banked), for an act to change. */
const settle = (a, nowS, keep = 0) => ({ ...a, content: Math.round(contentAt(a, nowS, keep) * 10) / 10, tick: nowS });

/**
 * ONE ACT ON THE HERD: `buy` (an offer's index, the officer's - the service checks rank and gold), `feed`, `water`,
 * `milk` (a cow), `muck` (a pen: 'pen', 'sty' or 'yard'). Answers { garden, gold?: price, consume?: { feed, units },
 * deposit?: [{ material, qty }], muckedKinds?: [], worked: [] } or an error. `score` a milking game's (0..1), when played.
 */
export function stepFarmHerd(garden, { act, animal, offer, pen, score, mapId = 0 }, nowS, farmWeekOf) {
  const next = structuredClone(garden), herd = next.herd ?? [], day = Math.floor(nowS / DAY), keep = herdKeep(garden);   // PHASE 5: the stationed herders' lift
  if (act === 'buy') {
    const d = droverHere(garden, mapId, nowS, farmWeekOf);
    if (!d) return { error: 'farm-drover-away' };
    if (!Number.isInteger(offer) || offer < 0 || offer > 2 || d.sold.includes(offer)) return { error: 'farm-drover-sold' };
    const kind = d.kinds[offer], A = ANIMALS[kind];
    if (herd.length >= HERD_MAX || herd.filter((a) => a.kind === kind).length >= A.max) return { error: 'farm-herd-full' };
    const id = (next.nextAnimal ?? 1), names = NAMES[kind];
    const name = names.find((n) => !herd.some((a) => a.name === n)) ?? `${names[0]} ${id}`;
    next.herd = [...herd, { id, kind, name, tick: nowS, fedUntil: nowS, wateredUntil: nowS, content: CONTENT_START }];
    next.nextAnimal = id + 1; next.drover = { week: d.week, sold: [...d.sold, offer] };
    return { garden: next, gold: A.price, bought: { kind, name }, worked: [] };
  }
  if (act === 'muck') {
    if (!['pen', 'sty', 'yard'].includes(pen)) return { error: 'farm-herd-bad' };
    if ((garden.mucked?.[pen] ?? -1) === day) return { error: 'farm-herd-done' };
    const inPen = herd.filter((a) => ANIMALS[a.kind].pen === pen);
    if (!inPen.length) return { error: 'farm-herd-bad' };
    next.mucked = { ...(garden.mucked ?? {}), [pen]: day };
    next.herd = herd.map((a) => (ANIMALS[a.kind].pen === pen ? { ...settle(a, nowS, keep), content: Math.min(100, contentAt(a, nowS, keep) + MUCK_LIFT) } : a));
    // a content pig's sty gives manure for the beds
    if (pen === 'sty') next.manure = Math.min(MANURE_MAX, (garden.manure ?? 0) + inPen.filter((a) => contentAt(a, nowS, keep) >= CONTENT_GOOD).length * 2);
    return { garden: next, worked: [], tended: inPen.length };
  }
  const i = herd.findIndex((a) => a.id === animal);
  if (i < 0) return { error: 'farm-herd-bad' };
  const a = herd[i];
  if (act === 'feed') {
    if (a.fedUntil > nowS + FED_S / 2) return { error: 'farm-herd-done' };
    herd[i] = { ...settle(a, nowS, keep), fedUntil: nowS + FED_S };
    next.herd = herd;
    return { garden: next, consume: { feed: ANIMALS[a.kind].feed, units: FEED_UNITS }, worked: [], tended: 1 };
  }
  if (act === 'water') {
    if (a.wateredUntil > nowS + WATERED_S / 2) return { error: 'farm-herd-done' };
    herd[i] = { ...settle(a, nowS, keep), wateredUntil: nowS + WATERED_S };
    next.herd = herd;
    return { garden: next, worked: [], tended: 1 };
  }
  if (act === 'milk') {
    if (a.kind !== 'cow') return { error: 'farm-herd-bad' };
    if (a.milked === day) return { error: 'farm-herd-done' };
    const c = contentAt(a, nowS, keep);
    if (c < CONTENT_GOOD / 2) return { error: 'farm-herd-unhappy' };
    const qty = (c >= 90 ? 3 : c >= CONTENT_GOOD ? 2 : 1) + (Number.isFinite(score) && score >= .7 ? 1 : 0);
    herd[i] = { ...settle(a, nowS, keep), milked: day };
    next.herd = herd;
    return { garden: next, deposit: [{ material: 'food:milk', qty }], worked: [], tended: 1, milk: qty };
  }
  return { error: 'farm-herd-bad' };
}

/** A herd act as the garden route takes it: the milking game judged (its bonus within the account's day), then the act. */
export function stepFarmHerdAction(garden, body, nowS, farmWeekOf) {
  let score;
  const day = Math.floor(nowS / DAY), who = String(body.who ?? 'local');
  if (body.game !== undefined) {
    if (body.act !== 'milk' || !validGame(body.game, 'milk')) return { error: 'farm-game-bad' };
    const full = (garden.plays?.day === day ? garden.plays.by?.[who]?.milk ?? 0 : 0) < GAMES.milk.cap;
    score = full ? body.game.score : undefined;
  }
  const step = stepFarmHerd(garden, { ...body, score }, nowS, farmWeekOf);
  if ('error' in step) return step;
  const played = body.game !== undefined ? { kind: 'milk', full: recordPlay(step.garden, who, 'milk', day) } : null;
  return { ...step, played };
}
