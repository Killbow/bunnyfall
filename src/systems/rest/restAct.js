// REST1 (2026-10-03, bible/06-Systems/Rest-Arc.md; Mac: "Resting is no longer time based online with campfires, beds,
// camping sets, being the main way to rest", then "Go") - THE REST ACT ONLINE.
//
// Online a rest is no longer hours on a dial. It is an ACT at a REST POINT - a lit fire (a placed Campfire, a tent's
// fire, a world brazier or hearth), a bed where DFU lets you sleep indoors - and it is ONE NIGHT: the character's own
// clock moves eight hours in a single step, so everything that reads their time (spells, diseases, needs, rooms,
// training, guild waits - the arc's 29-row census, section 7) sees exactly the eight hours a rest gave it before.
//
// THE NIGHT IS THE SAME NIGHT. It is the timed rest's own RestSession - its sub-ticks, its quest ticks, its hourly
// enemy check, its vitals, its rent count - run to its end in one call instead of paced over the window's timer, with
// the host's own rest deps (scenes/shared.js createRestDeps). Nothing a sub-tick does is restated here, so nothing can
// drift from what an eight-hour rest does everywhere else. The resting encounter roll still rides each sub-tick's
// advance at the odds it always had; a foe it spawns breaks the night at the hour it lands, as it always did.
//
// LONG OR SHORT. At a rest point the player picks a LONG REST (the eight-hour night) or a SHORT REST: two hours on the
// character's own clock, run through the same session as the night (runRestNight with SHORT_REST_HOURS), so buffs and
// other timed effects run down, the sleep need is paid for those two hours, and the resting encounter roll applies.
// A short rest used to move no clock at all, which let players recast buffs and rest them back without any of them
// expiring. There is no wait between long rests (NIGHT_INTERVAL_MINUTES is 0); the rest point, town and building
// checks still decide where a rest may happen.
//
// THE YIELD. A night at a bed or a fire, or any rest the tier prices whole (Casual's rough, or the arc off), ends full:
// health, fatigue and magicka (online no career rests short of its magicka - REST-MANA1). A rough night the tier prices
// at half (Hard's) keeps what its eight hours gave. A short rest heals in full where the tier prices whole, and half of
// what is missing where it does not.
//
// Offline nothing here runs: DFU's rest window, byte for byte.

import { RestSession, REST_TEXT, REST_WAIT_PER_HOUR, MINUTES_PER_TICK } from './restSession.js';
import { restCost, REST_KIND } from '../survival/rest.js';
import { liveVampirism } from '../racialLive.js';
import { roomRemainingHours } from '../tavern.js';   // AUDIT REST II P6: an old save's room, its nights read off its hours
import { BY_FIRE_REACH } from '../survival/camp.js';   // FIELD BUGS 2026-10-05 DUNGEON-BEDS: a bed's reach is a fire's

/** A night: DFU's customary eight hours, on the character's own clock. */
export const NIGHT_HOURS = 8;
export const NIGHT_MINUTES = NIGHT_HOURS * 60;
/** A short rest: two hours on the character's own clock. */
export const SHORT_REST_HOURS = 2;
/** Character-clock minutes required between long rests. 0: no wait (the player chooses long or short instead). */
export const NIGHT_INTERVAL_MINUTES = 0;
/** The character's clock runs at TimeScale 12 while they play: twelve of its minutes a real minute. */
export const OWN_MINUTES_PER_REAL_MINUTE = 12;
/** The act's hold, in real seconds: long enough to need safety, short enough not to bore. */
export const REST_CHANNEL_SECONDS = 6;

export const REST_ACT_TEXT = Object.freeze({
  noPoint: 'Find a fire or a bed to rest.',
  inTown: 'It is illegal to camp in town.',
  shortRest: 'You rest for a moment..',
  choose: 'How would you like to rest?',
  longChoice: 'Long Rest',
  shortChoice: 'Short Rest',
  interrupted: 'Your rest is interrupted.',
  channel: (where) => `Resting by the ${where}...`,
  channelBed: 'Resting...',
  meditating: 'Meditating by the candle...',   // REST6: the Meditation Candle's kneel
  noVote: 'Online there is no vote. Each player rests for themselves at a fire, tent or bed.',   // AUDIT REST: /ready online
  nextNight: (minutes) => `A night can pass again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
  rested: 'Next night',   // AUDIT C&C (lens S): the interval's tile (ui/hud/hudStatus.js) - "Rested" stood beside Boons' Well rested
  carried: (name) => `${name} rests here, and you rest with them through the night.`,   // REST5: a member's night, carried
  carriedShort: (name) => `${name} rests here, and you rest for a moment with them.`,
  carriedSkipped: (name) => `${name} rests here, but you are too busy to rest with them.`,
  carriedFar: (name) => `${name} rested a night without you. Come within 15 m of them to rest with the party.`,   // AUDIT REST-PARTY: PARTY-REST-FAR1's word, online
  carriedTown: (name) => `${name} rests here, but it is illegal to camp in town.`,   // AUDIT REST II P4: the act's own town law, for a member it would carry
  campWait: (name) => `Resting with ${name}...`,   // CAMP-ROLL: a camp mate's night is the camp's - held until it lands
});

/**
 * FIELD BUGS 2026-10-05 DUNGEON-BEDS (Discord, "Dungeon Beds (Sleeping)": "Beds in dungeons should count as beds so I
 * can rest in a dungeon" - "Find a fire or a bed to rest." beside one). Whether the feet stand within `reach` of a
 * bed - each `{ aabb }` a placed bed model's world box (Roleplay Realism's three, rrRealism.js BED_MODELS) - measured
 * to the box's nearest point, a fire's own BY_FIRE_REACH. The dungeon host's rest point (dungeonContext.js): 108 beds
 * stand in 42 of Daggerfall's 187 RDB blocks, in 2,056 of its 4,232 dungeons, and the online rest saw none of them.
 * AUDIT FB1005 B4: on the bed's own floor - the feet within BED_STOREY_M of the bed's foot; a dungeon's storeys stand
 * some 3.2 m apart, and five of the 108 beds were in reach from the storey above or below.
 */
export const BED_STOREY_M = 1.5;
export function bedInReach(beds, pos, reach = BY_FIRE_REACH) {
  if (!pos || !beds?.length) return false;
  for (const { aabb } of beds) {
    if (Math.abs(pos[1] - aabb.min[1]) > BED_STOREY_M) continue;   // AUDIT FB1005 B4: the bed's own floor, not the storey above or below
    const d = [0, 1, 2].map((k) => Math.max(aabb.min[k] - pos[k], 0, pos[k] - aabb.max[k]));
    if (Math.hypot(d[0], d[1], d[2]) <= reach) return true;
  }
  return false;
}

/** Whether a night may pass now: none yet, the interval run out, or a clock behind the stamp (a load from another
 *  timeline) - never a night refused for a stamp from the future. */
export function nightDue(entity, ownNow) {
  const at = entity?.restNightAt;
  if (!Number.isFinite(at) || !Number.isFinite(ownNow)) return true;
  return ownNow < at || ownNow - at >= NIGHT_INTERVAL_MINUTES;
}

/** Real minutes until a night may pass again (0 when one may now) - the Next night tile's foot. */
export function nightRealMinutesLeft(entity, ownNow) {
  if (nightDue(entity, ownNow)) return 0;
  return Math.max(1, Math.ceil((NIGHT_INTERVAL_MINUTES - (ownNow - entity.restNightAt)) / OWN_MINUTES_PER_REAL_MINUTE));
}

/** The night's end, stamped on the character's clock. */
export function stampNight(entity, ownNow) {
  if (entity && Number.isFinite(ownNow)) entity.restNightAt = Math.floor(ownNow);
}

/**
 * One night: the timed rest's own session, eight hours, run to its end in one call. `deps` is the host's rest bag
 * (createRestDeps' output); `rentedHours` is CanRest's out-parameter, so a room that runs out mid-night ends the night
 * with the landlord's line, as an eight-hour rest always has. Answers the session's own result and the hours slept.
 *
 * AUDIT REST-PARTY A1: ONE SUB-TICK A CALL, AND THE AMBUSH HEARD AT ONCE. A host's resting encounter is rolled inside
 * a sub-tick's advance and STOOD asynchronously (its art awaited), so the foe joins no pool while one synchronous call
 * runs the whole night: the hour's enemy check never saw it, a night a hit rolled was slept to its end - healed whole,
 * stamped, the party carried - with the foe arriving after the wake, and every later sub-tick rolled again. A host
 * that stands a resting encounter now says so here (ambushNight) the moment its spot is found, which is the
 * session's own OnEncounter latch (DFU's AbortRestForEnemySpawn), and the night is ticked a sub-tick a call so the
 * latch is read before the next ten minutes roll: the night breaks with DFU's "enemies nearby" at the sub-tick the
 * hit fell in, its hours slept counted.
 *
 * AUDIT REST II P7: AND ON THE LAST SUB-TICK. The latch is read at the START of a tick, and the tick that stands a foe
 * in its LAST sub-tick's advance goes on to finish the night's last hour in the same call - the foe not yet in any
 * pool, so the hour's own check finds nobody, and the night ended "You wake up." with the latch never read: healed
 * whole, stamped, fuel spent, the party carried, the foe at the wake. A night that ends with the latch set is the
 * enemies' break, as it would have been one sub-tick sooner (EndRest's ladder: the enemy break first) - unless it
 * already ended as one, or in death. Only the act's night runs here; the paced window's session is DFU's, untouched.
 */
let _night = null;
export function runRestNight(deps, { rentedHours = -1, hours = NIGHT_HOURS } = {}) {
  const s = new RestSession('timed', hours, deps, rentedHours, null);
  const step = REST_WAIT_PER_HOUR / MINUTES_PER_TICK;   // the session's own sub-tick (RestSession _subTickEvery), one a call
  const outer = _night;
  _night = s;
  let r = null;
  // a night is hours * 6 sub-ticks; the guard is twice that, so a float that falls a sub-tick short each call still
  // finishes, and a session that never answers cannot hang the frame
  try { for (let i = 0; r === null && i < hours * 12 + 8; i++) r = s.tick(step); } finally { _night = outer; }
  r = r ?? s._finish(REST_TEXT.wakeUp);
  if (s._abortEnemySpawn && !r.died && !r.enemyBroke) {   // AUDIT REST II P7: a foe stood in the night's last sub-tick
    deps.onEnemyBreak?.();
    r = { textId: REST_TEXT.enemiesNearby, enemyBroke: true, died: false };
  }
  return { result: r, hours: s.totalHours };
}
/** AUDIT REST-PARTY A1: a host has stood a resting encounter - the night running now (runRestNight) breaks at its next
 *  sub-tick. Answers whether a night heard it; with none running (offline's paced window, which hears the stood foe
 *  itself through onEnemySpawn) nothing happens. */
export function ambushNight() {
  if (!_night) return false;
  _night.abortForEnemySpawn();
  return true;
}

/** AUDIT REST-PARTY A5: THE CHANNEL HELD TO ITS END ASKS AGAIN. The plan was read at the open, and only enemies were asked
 *  at the end - so a fire gone in the six seconds (picked up by its owner, burned out, an Ember Jar's last minute) still
 *  gave a night priced as a camp's, a blow taken while holding (a poison, a foe beyond the resting scan) was simply
 *  topped up, and a night that came due while holding slept short. `opened` is the plan at the open, `now` the host's
 *  restAct() at the end, `hpAtOpen`/`hpNow` the sleeper's health: the plan to finish on, or null - interrupted. A
 *  candle's kneel is its own (anywhere a rest may begin). */
export function actAtChannelEnd(opened, now, hpAtOpen, hpNow) {
  if (opened?.meditate) return opened;
  if (opened?.point?.where && !now?.point) return null;   // a fire, a tent or a Bedroll gone - a bed (no `where`) is the room's or the ship's, and a ship's press lasts only the press
  if (Number.isFinite(hpAtOpen) && Number.isFinite(hpNow) && hpNow < hpAtOpen) return null;
  return { ...opened, night: now ? !!now.night : !!opened?.night };   // the point it opened on, the interval read now
}

/** AUDIT REST II P8: THE HOLD IS BROKEN WHILE IT IS HELD. The channel asked for enemies and a blow only at its END, and
 *  online the world runs under the window - so a foe that struck in the first second had the rest of the six (ten on a
 *  Bedroll) for free blows while the modal window held the player still. The notes promise "the rest is broken ... if
 *  you are hurt while you hold". Asked every frame of the channel, in the end check's own order: a foe stood while
 *  holding (`pending`, the window's latch), one in reach (`enemiesNearby`, asked only then), a blow since the open
 *  (`hpAtOpen`/`hpNow` - never a candle's kneel, which actAtChannelEnd lets finish hurt). True ends the channel now,
 *  through the end check itself - so the lines are its lines, and a night is never landed early.
 *  AUDIT REST III C6: AND THE POINT, WHILE IT IS HELD. The notes promise the rest is broken the moment "the fire you rest
 *  by goes out", and the point was asked only at the end (actAtChannelEnd): a fire burned out or picked up in the first
 *  second held the player still for the other five (nine on a Bedroll) before the same "interrupted". `restActNow` is
 *  the host's restAct, asked only of a channel opened on a fire, a tent or a Bedroll (actAtChannelEnd's own test; a
 *  bed's room stands, and a candle's kneel finishes wherever it began). */
export function channelBroken(opened, pending, enemiesNearby, hpAtOpen, hpNow, restActNow = null) {
  if (pending || enemiesNearby?.()) return true;
  if (opened?.meditate) return false;
  if (Number.isFinite(hpAtOpen) && Number.isFinite(hpNow) && hpNow < hpAtOpen) return true;
  return !!opened?.point?.where && typeof restActNow === 'function' && !restActNow()?.point;
}

/** Whether the tier prices a rest of this kind whole (a bed, a fire, Casual's rough, the arc off). */
export const restPricedWhole = (kind, rules) => !rules || (restCost(kind, rules)?.recovery ?? 1) >= 1;

/**
 * The yield's top-up. `maxFatigueOf` is the host's (statMods.maxFatigue). A night or short rest priced whole ends
 * full; a short rest priced at half heals half of what is missing; a night priced at half keeps what its hours gave.
 */
export function topUpRest(entity, kind, rules, { night = true, maxFatigueOf = (e) => e.maxFatigue ?? 0 } = {}) {
  if (!entity) return;
  const fill = (cur, max, frac) => Math.min(max, Math.round((cur ?? 0) + Math.max(0, max - (cur ?? 0)) * frac));
  const frac = restPricedWhole(kind, rules) ? 1 : night ? 0 : 0.5;
  if (frac <= 0) return;
  entity.health = fill(entity.health, entity.maxHealth ?? 0, frac);
  entity.fatigue = fill(entity.fatigue, maxFatigueOf(entity), frac);
  if (Number.isFinite(entity.maxMagicka)) entity.magicka = fill(entity.magicka, entity.maxMagicka, frac);
}

/** REST-CHANNEL-HEAL (2026-10-04, from play: "make it so when you rest on the campfire the loading bar you see also
 *  heals you so you dont wake up with 1% stamina bar as example when it gets canceled half way through"; "not only
 *  stamina all other magicka and health aswell"): THE BAR HEALS AS IT FILLS. The channel paid nothing until its end, so
 *  a hold broken at its fifth second - a foe in reach, the fire gone out, Stop pressed - left the sleeper exactly as
 *  they sat down. Now health, fatigue and magicka rise with the bar toward what the rest gives at its end - topUpRest's
 *  yield: full where the tier prices the rest whole, half of what was missing where it does not (Hard's rough ground,
 *  its short rest's own price) - and whatever the bar has paid is KEPT however the hold ends. The end still lands the
 *  rest as before (the night, or the short rest), from where the bar left the sleeper.
 *  `openChannelHeal` reads the plan once, at the channel's open (the tier and the kind the window opened on): per field
 *  where it starts and where the bar ends it, or null with no body. */
export function openChannelHeal(entity, kind, rules, { maxFatigueOf = (e) => e.maxFatigue ?? 0 } = {}) {
  if (!entity) return null;
  const frac = restPricedWhole(kind, rules) ? 1 : 0.5;
  const field = (cur, max) => {
    const from = Number.isFinite(cur) ? cur : 0;
    return { from, to: Math.min(max, Math.round(from + Math.max(0, max - from) * frac)) };
  };
  return {
    health: field(entity.health, entity.maxHealth ?? 0),
    fatigue: field(entity.fatigue, maxFatigueOf(entity)),
    magicka: Number.isFinite(entity.maxMagicka) ? field(entity.magicka, entity.maxMagicka) : null,
  };
}
/** REST-CHANNEL-HEAL: the bar at `frac` (0..1) of its hold - each field raised to its share of the way from the open to
 *  the end, NEVER lowered (a potion drunk while holding stays drunk), never past the plan's end. Answers the health it
 *  leaves. A field already at or past its end (a buff over the maximum) is left alone. */
export function stepChannelHeal(entity, plan, frac) {
  if (!entity || !plan) return entity?.health;
  const f = Number.isFinite(frac) ? Math.max(0, Math.min(1, frac)) : 0;
  for (const key of ['health', 'fatigue', 'magicka']) {
    const p = plan[key];
    if (!p || p.to <= p.from) continue;
    const want = Math.round(p.from + (p.to - p.from) * f);
    if (!((entity[key] ?? 0) >= want)) entity[key] = want;
  }
  return entity.health;
}
/** REST-CHANNEL-HEAL: one frame of the channel (both skins - restWindow.js, enhancedRest.js): the bar's share paid
 *  through the host's bag (createRestDeps restChannelHeal), and the health that leaves the sleeper with, which is the
 *  hold's NEW MARK for a blow (channelBroken, actAtChannelEnd compare health against it) - a bar that heals would
 *  otherwise hide any blow smaller than what it had already paid. A candle's kneel heals nothing here (meditate is its
 *  own), and a bag without the door answers the old mark. Called only while the hold stands: a broken hold pays no
 *  more, and keeps what it was paid. */
export function channelHealTick(opened, deps, t, mark) {
  if (!opened || opened.meditate || typeof deps?.restChannelHeal !== 'function') return mark;
  const hp = deps.restChannelHeal(Math.max(0, Math.min(1, t / (opened.channelSeconds || 1))));
  return Number.isFinite(hp) ? hp : mark;
}

/** AUDIT REST II P6: A ROOM COUNTS NIGHTS (the arc's OPEN 10, section 5: "a room rented for N days buys N nights ... and
 *  the room also lapses after N days lived, whichever comes first"). The night spent was a day off the room's expiry:
 *  its eight hours ran it down while slept and sixteen more went at the wake, so the play between nights spent the
 *  same days again - three days rented with an hour of play between nights gave two nights, not three. The nights are
 *  counted on the room (`nights`, tavern.js rentRoom: the days at renting, and each extension's), a night spends one,
 *  and the expiry is left to the days lived, through the sweep as before. An old save's room carries no count: it is
 *  read once, here, as the days its hours left make (ceil(hours / 24)) - asked as the night begins (createRestDeps'
 *  restNight), so the night's own eight hours do not shorten it. */
export function roomNightsLeft(room, nowMinutes) {
  if (!room) return 0;
  if (!Number.isFinite(room.nights)) {
    const h = roomRemainingHours(room, nowMinutes);
    room.nights = Number.isFinite(h) ? Math.max(0, Math.ceil(h / 24)) : 0;
  }
  return room.nights;
}
/** A rented room's night slept: one of its nights spent; the last one spent, the room is over now - its expiry brought
 *  to `nowMinutes`, so CanRest finds no room and the sweep (tavern.js removeExpiredRooms) takes it as it takes any. */
export function spendRoomNight(room, nowMinutes) {
  if (!room || !Number.isFinite(room.expiryMinutes)) return;
  room.nights = Math.max(0, roomNightsLeft(room, nowMinutes) - 1);
  if (room.nights === 0 && Number.isFinite(nowMinutes)) room.expiryMinutes = Math.min(room.expiryMinutes, Math.floor(nowMinutes));
}

/** REST5 (bible/06-Systems/Rest-Arc.md 2.6): THE NIGHT IS HEARD. A host that shares the night (world.js, the party's
 *  pose) listens here; createRestDeps' restNight calls it after a night slept whole - never a carried one (a member's
 *  night carried for me is theirs, and is not passed on again). One listener: the page has one party. AUDIT REST-PARTY:
 *  it hears WHERE - the rest kind of the spot the night was slept at (survival/rest.js REST_KIND), so the party sleeps
 *  it at the rester's fire and not on the ground beside it. */
let _nightListener = null;
export function setNightListener(fn) { const prev = _nightListener; _nightListener = typeof fn === 'function' ? fn : null; return prev; }
/** `long` false: a short rest slept whole (createRestDeps restShort), stamped with the short marks so the camp can tell. */
export const heardNight = (kind = null, long = true) => { _nightListener?.(kind, long); };

/** AUDIT REST II P3: A NIGHT SLEPT WHOLE - the session ended on its own: not in death, not broken by a foe, not cut by a
 *  prevent-rest condition (RestSession _prevented) - whatever the shape answers, the night was not slept to its end.
 *  AUDIT REST III C2: no room's end - a carried night, the one this reads, is slept with no room (createRestDeps
 *  restNight's rentedHours -1, and a tavern carries nobody), so _finish's rentExpired never stands on it. */
export const nightWhole = (r) => !!r && !r.died && !r.enemyBroke && !r.prevented;

/** AUDIT REST II P3: WHAT A CARRIED NIGHT SAYS AND GIVES. The party's night (world.js sleepCarriedNight) said "you rest
 *  with them through the night" for any night that was neither death nor a foe's break - so a night cut at its second
 *  hour by a quest's prevent-rest condition said it was slept through, the condition's own words dropped. `night` - a
 *  night was due (else the short rest's line); `r` - the bag's result; `endLines` - the host's TEXT.RSC reader
 *  (createRestDeps endLines). A night slept whole says so; one that was not says its own line (none in death: the
 *  death screen owns it). AUDIT REST III C3: AND EVERY ONE RAISES. P3 took the raise from a night cut short, and the
 *  port's own law is the other way: closing the rest is THE advancement moment on every one of EndRest's arms, the
 *  foe's, the condition's and death's included (DaggerfallRestWindow.cs's OnClose - restWindow.js, enhancedRest.js),
 *  and a short rest's close as well - so the rester beside me raised and I did not. A rest that never ran raises
 *  nothing. */
export function carriedNightEnd(name, night, r, endLines = null) {
  const raise = !!r;
  if (nightWhole(r)) return { raise, text: night ? REST_ACT_TEXT.carried(name) : REST_ACT_TEXT.carriedShort(name) };
  if (!r || r.died) return { raise, text: null };
  const own = r.text ?? (endLines?.(r.textId) ?? []).join(' ');
  return { raise, text: own || null };
}

/** AUDIT REST F7: A NIGHT'S STAMP IS MARKED. The party's night rides the pose's `restStartedAt` (REST5, no relay bump),
 *  and an older build stamps that same field when its rest window OPENS - so a mate on an older build who opened the
 *  window, chose an hour or walked away from it would have carried every newer member into a whole night. A night's
 *  stamp is the shared clock's second with a night's mark for its milliseconds; an older build's open lands on one of
 *  them three times in a thousand.
 *  AUDIT REST-PARTY: THE MARK SAYS WHERE. One mark a rest kind - the night's spot, which a carried member sleeps at
 *  (partyRestLaw.js carriedRestKind) - still with no relay bump: the field and its bounds are the wire's already. A
 *  kind the table does not know stamps as a fire's. */
export const PARTY_NIGHT_MARKS = Object.freeze({ [REST_KIND.Rough]: 775, [REST_KIND.Camp]: 776, [REST_KIND.Bed]: 777 });
/** AUDIT REST II P5: the marks' kinds, read once - the party's watch asks of a stamp every frame, and a key array a call
 *  was an allocation a member a frame. */
const NIGHT_KINDS = Object.freeze(Object.keys(PARTY_NIGHT_MARKS));
const markOf = (kind) => (typeof kind === 'string' && Object.hasOwn(PARTY_NIGHT_MARKS, kind) ? PARTY_NIGHT_MARKS[kind] : PARTY_NIGHT_MARKS[REST_KIND.Camp]);
export const nightStamp = (t, kind = REST_KIND.Camp) => Math.floor(t / 1000) * 1000 + markOf(kind);
/** The rest kind a night's stamp names, or null for a stamp that is no night's. */
export const nightKindOf = (t) => {
  if (!Number.isFinite(t)) return null;
  const ms = ((t % 1000) + 1000) % 1000;
  for (const kind of NIGHT_KINDS) if (PARTY_NIGHT_MARKS[kind] === ms) return kind;
  return null;
};
export const isNightStamp = (t) => nightKindOf(t) !== null;
/** A short rest slept whole: the same stamp law as a night's, with its own marks, one per rest kind. A camp mate's
 *  short rest landing lets my short rest skip its roll, but never my long one (partyRestLaw.js createCampWatch). */
export const SHORT_REST_MARKS = Object.freeze({ [REST_KIND.Rough]: 778, [REST_KIND.Camp]: 779, [REST_KIND.Bed]: 780 });
const SHORT_KINDS = Object.freeze(Object.keys(SHORT_REST_MARKS));
export const shortRestStamp = (t, kind = REST_KIND.Camp) => Math.floor(t / 1000) * 1000 + (typeof kind === 'string' && Object.hasOwn(SHORT_REST_MARKS, kind) ? SHORT_REST_MARKS[kind] : SHORT_REST_MARKS[REST_KIND.Camp]);
/** The rest kind a short rest's stamp names, or null for a stamp that is no short rest's. */
export const shortRestKindOf = (t) => {
  if (!Number.isFinite(t)) return null;
  const ms = ((t % 1000) + 1000) % 1000;
  for (const kind of SHORT_KINDS) if (SHORT_REST_MARKS[kind] === ms) return kind;
  return null;
};

/** CAMP-ROLL: the camp marks, on the same field as a night's stamp. `open` - my long rest's channel is open;
 *  `openShort` - my short rest's channel is open (either may roll the camp's ambush; a long rest is preferred as the
 *  roller, so the shared roll covers the longest rest in the camp); `done` - my rest ended without landing (a stop, a
 *  foe, a prevent-rest condition). None of them is a night stamp (nightKindOf answers null). An older build's window
 *  open can land on one of these by chance, and costs a follower at most CAMP_WAIT_MS (partyRestLaw.js). */
export const CAMP_MARKS = Object.freeze({ open: 774, openShort: 772, done: 773 });
export const campStamp = (t, which) => Math.floor(t / 1000) * 1000 + (CAMP_MARKS[which] ?? CAMP_MARKS.done);
/** 'open', 'openShort', 'done', or null for a stamp that is none of them. */
export const campMarkOf = (t) => {
  if (!Number.isFinite(t)) return null;
  const ms = ((t % 1000) + 1000) % 1000;
  return ms === CAMP_MARKS.open ? 'open' : ms === CAMP_MARKS.openShort ? 'openShort' : ms === CAMP_MARKS.done ? 'done' : null;
};
/** Whether a camp mark is an open rest (long or short). */
export const campOpenMark = (mark) => mark === 'open' || mark === 'openShort';

/** CAMP-ROLL: THE CAMP SHARES ONE AMBUSH ROLL. At the channel's end, and every frame of the wait after it, both rest
 *  windows (restWindow.js, enhancedRest.js) hand the act's plan here, and the host's camp (`deps.camp`, world.js
 *  campRest) answers who rolls: me (no camp, no party, offline, or I am the camp's roller), a camp mate I wait on
 *  (`wait`), a camp mate whose rest landed (`night` - I rest my own long or short rest at the better of our spots, with
 *  no roll of mine), or a camp mate whose rest a foe broke (`enemy` - mine breaks with it). Long and short rests share
 *  the roll alike; a candle's kneel rolls nothing and asks nothing. Answers `{ wait: name }` while the wait holds,
 *  else `{ r }` - the result the window ends on. */
export function campNightStep(deps, act, rentedHours = -1) {
  const v = act && !act.meditate ? deps.camp?.verdict?.() ?? null : null;
  if (v?.act === 'wait') return { wait: v.name || 'A party member' };
  if (v?.act === 'enemy') { deps.onEnemyBreak?.(); return { r: { textId: REST_TEXT.enemiesNearby, enemyBroke: true, died: false } }; }
  if (v?.act === 'night') {
    const night = !!act.night;
    const r = deps.restCampNight?.(v.kind, night) ?? null;
    const end = carriedNightEnd(v.name || 'A party member', night, r, deps.endLines);
    return { r: r && end.text ? { ...r, textId: null, text: end.text } : r };
  }
  return { r: act?.night ? deps.restNight?.({ rentedHours }) : deps.restShort?.() };
}
