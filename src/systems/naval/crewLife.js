// @ts-check
// One ship's crew at work on her deck, in the deck's frame. Every draw is seeded by the ship, so every player in a
// room sees the same crew doing the same kind of work.

import { musterOf, MOBILE, CREW_PER_HAND, MUSTER_MIN, MUSTER_MAX } from './navalBoarding.js';
import { seededRng } from '../../weather/wind.js';
import { mainLevel, DECK_STEP, FLIGHT_OVER } from './navalDeck.js';
import { watchCount } from './shipWatch.js';

export const CREW_WALK = 1.2;
export const CREW_HURRY = 2.4;
export const CREW_TURN = 5;
export const CREW_IDLE_S = Object.freeze([4, 11]);
export const CREW_TALK_REACH = 1.6;
export const CREW_TALK_SEEK = 14;
export const CREW_BLOCKED_S = 2;
export const CREW_LINE_S = 3.4;
export const CREW_BLURB_S = Object.freeze([22, 70]);
export const CHANTY_S = Object.freeze([75, 150]);
export const CHANTY_FIRST_S = Object.freeze([20, 55]);
export const CREW_SHOWN = Object.freeze([0, 2, 6, 8, 8]);
export const CREW_MUSTER_M = 115;
export const WORK_S = Object.freeze([7, 16]);
export const WORK_SWING_S = Object.freeze([0.9, 1.8]);
export const CHORE_SHARE = 0.15;
export const WORK_SHARE = 0.75;
export const LOOKOUT_BACK = 0.75;
export const ROLE_POSTS = Object.freeze(['First Mate', 'Bosun', 'Carpenter', 'Cook', 'Gunner']);
export const LOOKOUT_YIELD = Object.freeze(['Gunner', 'Cook', 'Carpenter', 'Bosun']);
export const POST_SHARE = 0.8;
export const POST_REACH = 0.6;
export const POST_STAND = 2.5;
export const POST_APART = 1.0;
const POST_RING = Object.freeze([[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2], [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]].map((v) => Object.freeze(v)));
export const PLAYER_CREW = Object.freeze([MOBILE.Warrior, MOBILE.Barbarian, MOBILE.Bard, MOBILE.Archer, MOBILE.Warrior, MOBILE.Monk, MOBILE.Rogue, MOBILE.Warrior]);
export const playerCrewCount = (hull, crew) => (crew > 0 ? Math.min(CREW_SHOWN[hull] ?? 0, Math.max(1, Math.round(crew / CREW_PER_HAND))) : 0);

export function crewCount({ hull, shipClass = null, crewShare = 1, crew = 0 }) {
  if (!shipClass) return playerCrewCount(hull, crew);
  const n = Math.min(MUSTER_MAX, Math.max(MUSTER_MIN, Math.round(shipClass.boarders * Math.min(1, Math.max(0, crewShare)))));
  return Math.min(CREW_SHOWN[hull] ?? 0, n);
}

const HUMAN = new Set(Object.values(MOBILE));

/**
 * @param {{ hull: number, seed: number, shipClass?: any, crewShare?: number, crew?: number }} o
 * @returns {{ mobile: number, gender: 'male'|'female' }[]}
 */
export function crewRoster({ hull, seed, shipClass = null, crewShare = 1, crew = 0 }) {
  const rng = seededRng(((seed >>> 0) ^ 0x6c1e5ea) >>> 0);
  let mobiles;
  if (shipClass) {
    const m = musterOf(shipClass, crewShare);
    mobiles = [m.captain, ...m.men].slice(0, CREW_SHOWN[hull] ?? 0);
  } else {
    const n = playerCrewCount(hull, crew);
    const start = Math.floor(rng() * PLAYER_CREW.length);
    const round = PLAYER_CREW.map((_, i) => PLAYER_CREW[(start + i) % PLAYER_CREW.length]);
    const bard = round.indexOf(MOBILE.Bard);
    // The Bard moves up to second in line, so any crew of two or more has one to lead the song.
    if (bard > 1) round.splice(1, 0, ...round.splice(bard, 1));
    mobiles = Array.from({ length: n }, (_, i) => round[i % round.length]);
  }
  return mobiles.map((mobile) => ({ mobile, gender: HUMAN.has(mobile) && rng() < 0.35 ? 'female' : 'male' }));
}

export const CREW_BLURBS = Object.freeze({
  calm: Object.freeze([
    'Fair wind today.', 'Mind that line!', 'Smell that salt air.', 'Another day on the Iliac Bay.', 'Steady as we go.',
    'Anyone seen my pipe?', 'Wind\'s backing westerly.', 'Coil it proper, or the bosun\'ll have you.', 'Land\'s near. I can smell it.',
    'Gulls off the bow!', 'Sentinel spice fetches a fine price.', 'Wayrest by week\'s end, mark me.', 'My back\'s not what it was.',
    'Who\'s on the next watch?', 'Swab that, you lubber.', 'Calm as a Wayrest pond.', 'I\'d trade my ration for a dry bunk.',
    'Ever seen the lights of Daggerfall from the water?', 'Haul away!', 'Good ship, this one.',
  ]),
  battle: Object.freeze([
    'Run out the guns!', 'Fire when ready!', 'Reload! Reload!', 'Keep your heads down!', 'Hold fast!',
    'Coming about!', 'Powder, more powder!', 'Mind the rigging!', 'Put the fire out!', 'Steady, lads, steady!',
  ]),
  board: Object.freeze(['Grapples - make ready!', 'Over the rail!', 'Blades out, lads!', 'For the ship!']),
  repel: Object.freeze(['Stand by to repel boarders!', 'Here they come!', 'Hold the rail!', 'Nobody sets foot on our deck!']),
  pirate: Object.freeze([
    'Plunder waits for no one.', 'A fat merchant\'d suit me fine.', 'The captain\'s share, the captain\'s share...',
    'Keep a weather eye for the navy.', 'Gold, lads. Think of the gold.',
  ]),
  navy: Object.freeze([
    'For the crown.', 'Eyes sharp. Pirates about.', 'The captain wants everything shipshape.', 'Steady, men.',
  ]),
  merchant: Object.freeze([
    'Mind the cargo!', 'Every crate counted.', 'Pray we meet no pirates.', 'Wine for Sentinel, wool for Wayrest.',
  ]),
  night: Object.freeze([
    'Quiet watch tonight.', 'Stars are out.', 'Keep it down - the lads are sleeping.', 'Two bells. Long way to dawn.',
    'Mind the lantern.', 'Cold one, this.', 'Hear that? Just the swell.', 'Eyes open, now.',
  ]),
  work: Object.freeze([
    'Swab that deck!', 'Splice that line.', 'Hand me the mallet.', 'Plug that hole, quick!', 'Mind the splinters.',
    'Haul away!', 'Fresh canvas here!', 'Keep the pumps going, lads.', 'Who\'s got the tar?', 'Coil it proper.',
  ]),
  chore: Object.freeze([
    'Swab that deck!', 'Haul away!', 'Coil it proper.', 'Mind that line!', 'Tar\'s gone thin on this rail.',
    'Bosun wants it shipshape.',
  ]),
  struck: Object.freeze([
    'We yield! We yield!', 'Hold your fire!', 'Quarter! Give us quarter!', 'It\'s over, lads.', 'Gods preserve us.',
  ]),
});

export const ALL_HANDS = 'All hands on deck!';

export const CREW_TALKS = Object.freeze([
  Object.freeze(['Heard the court at Daggerfall\'s hiring blades.', 'Aye, and paying in promises.']),
  Object.freeze(['What\'s for supper?', 'Hardtack and regret.', 'Again?']),
  Object.freeze(['You ever seen a sea serpent?', 'Once. Off Anticlere. Never again.']),
  Object.freeze(['Captain\'s in a mood.', 'Captain\'s always in a mood.', 'Fair point.']),
  Object.freeze(['Storm\'s brewing to the west.', 'Then we\'d best make port before it breaks.']),
  Object.freeze(['First round\'s on me when we make port.', 'You said that last time.', 'And I meant it last time too.']),
  Object.freeze(['They say the Orsinium lot are building ships now.', 'Orcs at sea? Gods help us all.']),
  Object.freeze(['How long have you sailed?', 'Since I could walk. Longer, some days.']),
  Object.freeze(['Sentinel or Wayrest?', 'Sentinel. Better wine.', 'Wayrest. Better company.']),
  Object.freeze(['Did you hear that?', 'Just the timbers.', '...I hope.']),
  Object.freeze(['My old mother wanted me a smith.', 'And here you are, hauling rope.', 'She\'d still say I chose wrong.']),
  Object.freeze(['Think we\'ll see a fight this voyage?', 'Pray not. I just mended this shirt.']),
]);

export const CHANTIES = Object.freeze([
  Object.freeze({
    name: 'The Iliac Bay',
    chorus: 'Heave away, haul away, bound for the Iliac Bay!',
    verses: Object.freeze([
      'Oh, we sailed out of Daggerfall under a gray sky,',
      'With a hold full of wool and a keg running dry,',
      'The bosun he swore by Stendarr and by Kyne,',
      'We\'d be drinking in Sentinel ere the next bell\'s chime!',
    ]),
  }),
  Object.freeze({
    name: 'Haul the Line',
    chorus: 'So haul, boys, haul the line!',
    verses: Object.freeze([
      'There\'s a lass in Wayrest with eyes like the sea,',
      'She\'s promised her heart to a sailor like me,',
      'But the wind\'s in the west and the tide\'s running strong,',
      'So I\'ll sing her my love in a hauling song!',
    ]),
  }),
  Object.freeze({
    name: 'The Captain\'s Gold',
    chorus: 'Yo-ho, and away we go!',
    verses: Object.freeze([
      'The captain keeps his gold in a chest by his bed,',
      'He counts it by lantern and sleeps on its head,',
      'But the gold of the sea is the wind and the spray,',
      'And we spend it like kings every day, every day!',
    ]),
  }),
]);

export const sung = (text) => `♪ ${text} ♪`;

const TAU = Math.PI * 2;
const TALK_TURNS = Object.freeze([0, 1, -1, 2, -2, 3].map((k) => k * TAU / 6));
const angleTo = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
/** @param {() => number} rng @param {readonly number[]} range */
const within = (rng, range) => range[0] + rng() * (range[1] - range[0]);

/**
 * @param {{
 *   deck: any,
 *   roster: { mobile: number, gender: string }[],
 *   seed: number,
 *   places?: number[][],
 *   faction?: string | null,
 * }} o
 */
export function createCrewLife({ deck, roster, seed, places = [], faction = null }) {
  const rng = seededRng(((seed >>> 0) ^ 0x51ce11fe) >>> 0);
  const main = deck?.y && deck.count ? mainLevel(deck) : NaN;
  const spots = deck?.count ? deck.spots(Math.max(16, roster.length * 3), Number.isNaN(main) ? undefined : main) : [];
  const onDeck = [], stations = [];
  for (const p of places) (deck?.walkable(p[0], p[2]) && !(p[1] > main + FLIGHT_OVER) ? onDeck : stations).push(p);
  const starts = [...stations.map((p) => ({ p, station: true })), ...onDeck.map((p) => ({ p, station: false })), ...spots.map((p) => ({ p, station: false }))];
  const member = (r, i) => {
    const start = starts[i] ?? { p: deck?.nearest?.(0, 0) ?? [0, 0, 0], station: false };
    return {
      i, mobile: r.mobile, gender: r.gender, station: start.station, post: [...start.p], pos: [...start.p],
      yaw: rng() * TAU, face: null, state: 'idle', t: within(rng, CREW_IDLE_S) * rng(), path: null, leg: 0, speed: CREW_WALK,
      mate: null, talk: null, line: null, blurbT: within(rng, CREW_BLURB_S) * (0.4 + rng()), moving: false, gone: false, taken: false,
      below: false, swing: false, swingT: 0,
    };
  };
  /** @type {any[]} */
  const members = roster.map(member);
  let chantyT = within(rng, CHANTY_FIRST_S), chanty = null;
  let musterKey = '', quiet = false;
  const mainExt = deck?.y && deck.count ? deckExtentZ(deck, main) : null;
  const bow = mainExt && deck?.nearest ? deck.nearest(0, mainExt[1] - LOOKOUT_BACK, main) : null;
  const hatch = deck?.count ? deck.nearest?.(0, mainExt ? (mainExt[0] + mainExt[1]) / 2 : 0) ?? null : null;
  /** @type {any} */ let lookout = null;
  let asleep = false, work = 0;
  let named = -1, stood = false, rising = false;
  /** @type {readonly (string | null)[]} */ let roles = [];
  /** @type {any} */ let posts;
  function rolePosts() {
    if (posts !== undefined) return posts;
    const main = deck?.count ? mainLevel(deck) : NaN;
    const e = deck?.count ? deckExtentZ(deck, main) ?? mainExt : null;
    if (!e || !deck?.nearest) return (posts = null);
    const mid = (e[0] + e[1]) / 2, len = Math.max(1, e[1] - e[0]);
    const taken = hatch ? [hatch] : [];
    const at = (x, z) => {
      for (const [dx, dz] of POST_RING) {
        const q = deck.nearest(x + dx, z + dz);
        if (q && !taken.some((t) => Math.hypot(t[0] - q[0], t[2] - q[2]) < POST_APART)) { taken.push(q); return q; }
      }
      return null;
    };
    // The Carpenter goes to port of the hatch when only that side is deck, so the post never lands in a hatchway.
    const cx = hatch && !deck.walkable?.(hatch[0] + 1.1, hatch[2]) && deck.walkable?.(hatch[0] - 1.1, hatch[2]) ? -1.1 : 1.1;
    const carpenter = hatch ? { at: at(hatch[0] + cx, hatch[2]), face: cx > 0 ? -Math.PI / 2 : Math.PI / 2 } : null;
    const guns = [];
    for (let k = 0; k < 6; k++) {
      const side = k % 2 === 0 ? 1 : -1, z = mid + (Math.floor(k / 2) - 1) * Math.min(3, len * 0.15);
      const r = deck.rail?.(side, z, [0, 0, 0], main);
      const p = r ? at(r[0] - side * 0.5, r[2]) : null;
      if (p) guns.push({ at: p, face: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    return (posts = {
      'First Mate': { at: at(0.8, e[0] + Math.min(2, len * 0.15)), face: 0 },
      Bosun: { at: at(0, mid + Math.min(2.5, len * 0.12)), face: 0 },
      Carpenter: carpenter,
      Cook: { at: at(-0.8, e[1] - Math.min(4, len * 0.25)), face: Math.PI },
      Gunner: guns,
      at,
    });
  }
  const atPost = (m) => { const p = postOf(m); return !!p && Math.hypot(m.pos[0] - p.at[0], m.pos[2] - p.at[2]) <= POST_REACH; };
  function postOf(m) {
    const role = roles[m.i];
    if (!role || m.station || m === lookout || !ROLE_POSTS.includes(role)) return null;
    const p = rolePosts();
    if (!p) return null;
    let n = 0;
    for (const o of members) { if (o === m) break; if (roles[o.i] === role && !o.station && o !== lookout && !o.gone) n++; }
    if (role === 'Gunner') {
      if (n < p.Gunner.length) return p.Gunner[n] ?? null;
      if (!p.Gunner.length) return null;
      const gun = p.Gunner[n % p.Gunner.length];
      gun.more ??= [];
      const k = Math.floor(n / p.Gunner.length) - 1;
      while (gun.more.length <= k) { const q = p.at(gun.at[0], gun.at[2]); gun.more.push(q ? { at: q, face: gun.face } : null); }
      return gun.more[k] ?? gun;
    }
    const base = p[role];
    if (!base?.at) return null;
    if (!n) return base;
    base.more ??= [];
    while (base.more.length < n) { const q = p.at(base.at[0], base.at[2]); base.more.push(q ? { at: q, face: base.face } : null); }
    return base.more[n - 1] ?? base;
  }
  const canLook = (m) => !!m && !m.gone && !m.below && !m.station && m.mobile !== MOBILE.Bard && m.state !== 'turnIn';
  function pickLookout() {
    const want = members[named];
    if (want !== lookout && canLook(want)) {
      if (lookout && (lookout.state === 'watch' || lookout.state === 'walk')) { lookout.path = null; lookout.state = 'idle'; lookout.t = 0; }
      lookout = want;
    }
    if (lookout && !lookout.gone && !lookout.below) return lookout;
    let first = null, best = null, bestRank = Infinity;
    lookout = null;
    for (let k = 0; k < members.length; k++) {
      const m = members[k];
      if (!canLook(m)) continue;
      if (m.i === 0) { first = first ?? m; continue; }
      const role = roles[m.i] ?? '', rank = LOOKOUT_YIELD.indexOf(role);
      const r = role === 'First Mate' ? LOOKOUT_YIELD.length : rank < 0 ? -1 : rank;
      if (r < bestRank) { best = m; bestRank = r; if (r < 0) break; }
    }
    return (lookout = best ?? first);
  }

  const live = () => members.filter((m) => !m.gone && !m.below);
  const offMain = (m) => !m.station && Math.abs(m.pos[1] - main) > DECK_STEP;
  const onAMan = (m) => members.some((o) => o !== m && !o.gone && !o.below && Math.hypot(o.pos[0] - m.pos[0], o.pos[2] - m.pos[2]) < 0.3);
  const say = (m, text, kind = 'talk') => { m.line = { text, kind, t: CREW_LINE_S }; };
  const dropLeader = (m) => { if (chanty?.leader === m) { chanty = null; chantyT = within(rng, CHANTY_S); } };
  function walkTo(m, to, speed = CREW_WALK) {
    if (m.station) { m.state = 'idle'; m.t = within(rng, CREW_IDLE_S); return false; }
    const path = deck?.path?.([m.pos[0], m.pos[2]], [to[0], to[2]]);
    if (!path || path.length < 2) return false;
    m.path = path; m.leg = 0; m.state = 'walk'; m.speed = speed;
    return true;
  }
  const claims = (o, s, r = 1.2) => Math.hypot(o.pos[0] - s[0], o.pos[2] - s[2]) < r || (!!o.path && Math.hypot(o.path[o.path.length - 1][0] - s[0], o.path[o.path.length - 1][2] - s[2]) < r);
  function freeSpot() {
    for (let tries = 0; tries < 8 && spots.length; tries++) {
      const s = spots[Math.floor(rng() * spots.length) % spots.length];
      if (!members.some((o) => !o.gone && !o.below && claims(o, s))) return s;
    }
    return null;
  }
  function startTalk(m, o) {
    const from = Math.atan2(m.pos[0] - o.pos[0], m.pos[2] - o.pos[2]);
    let to = null;
    for (const turn of TALK_TURNS) {
      const a = from + turn;
      const tx = o.pos[0] + Math.sin(a) * CREW_TALK_REACH, tz = o.pos[2] + Math.cos(a) * CREW_TALK_REACH;
      const p = deck?.clamp?.(tx, tz, undefined, 0, o.station || offMain(o) ? o.pos[1] : main) ?? deck?.clamp?.(tx, tz);
      if (!p) { to = o.pos; break; }
      if (Math.hypot(p[0] - o.pos[0], p[2] - o.pos[2]) >= 1 && !members.some((x) => x !== m && x !== o && !x.gone && claims(x, p, 0.6))) { to = p; break; }
    }
    if (!to) return false;
    const script = pick(rng, CREW_TALKS);
    m.mate = o; o.mate = m;
    m.talk = { script, line: -1, t: 0, lead: true }; o.talk = { script, line: -1, t: 0, lead: false };
    o.state = 'wait'; o.path = null;
    if (Math.hypot(m.pos[0] - to[0], m.pos[2] - to[2]) < 0.3 || !walkTo(m, to)) m.state = 'talk';
    else m.state = 'toTalk';
    return true;
  }
  function endTalk(m) {
    for (const x of [m, m.mate]) {
      if (!x) continue;
      x.mate = null; x.talk = null; x.state = 'idle'; x.t = within(rng, CREW_IDLE_S); x.face = null; x.path = null;
      if (offMain(x) || onAMan(x)) x.t = 0;
    }
  }
  function startWork(m) { m.state = 'work'; m.t = within(rng, WORK_S); m.swingT = within(rng, WORK_SWING_S) * rng(); m.face = rng() * TAU; }
  function turnIn(now) {
    const crew = live();
    const keep = new Set(crew.filter((m) => m.station));
    const lk = pickLookout();
    if (lk) keep.add(lk);
    let n = 0;
    for (const m of members) if (!m.gone) n++;
    const want = watchCount(n);
    for (const m of crew) { if (keep.size >= want) break; keep.add(m); }
    for (const m of crew) {
      if (keep.has(m)) continue;
      if (m.mate) endTalk(m);
      dropLeader(m);
      m.line = null; m.swing = false;
      if (!now && hatch && walkTo(m, hatch)) m.state = 'turnIn';
      else { m.below = true; m.state = 'below'; m.path = null; }
    }
  }
  function allUp(alarm) {
    let woke = false;
    for (const m of members) {
      if (m.gone || (!m.below && m.state !== 'turnIn')) continue;
      woke = true;
      if (m.below) { m.state = 'rise'; rising = true; continue; }
      m.path = null; m.state = 'idle'; m.t = within(rng, CREW_IDLE_S) * (alarm ? 0.1 : 0.5); m.face = null;
    }
    if (woke && alarm) { const caller = live()[0]; if (caller) say(caller, ALL_HANDS, 'shout'); }
  }
  function clearAt(p, avoid) {
    if (avoid && Math.hypot(avoid[0] - p[0], avoid[2] - p[2]) < 0.6) return false;
    for (let k = 0; k < members.length; k++) {
      const o = members[k];
      if (!o.gone && !o.below && Math.hypot(o.pos[0] - p[0], o.pos[2] - p[2]) < 0.6) return false;
    }
    return true;
  }
  function bringUp(all, avoid) {
    rising = false;
    for (const m of members) {
      if (m.gone || !m.below || m.state !== 'rise') continue;
      const from = hatch ?? m.post;
      let at = clearAt(from, avoid) ? from : null;
      if (!at && !all) { rising = true; return; }
      for (let r = 0.8; r < 2.5 && !at; r += 0.8) {
        for (const turn of TALK_TURNS) {
          const q = deck?.clamp?.(from[0] + Math.sin(turn) * r, from[2] + Math.cos(turn) * r);
          if (q && clearAt(q, avoid)) { at = q; break; }
        }
      }
      at = at ?? freeSpot() ?? from;
      m.below = false; m.pos = [...at]; m.path = null; m.face = null; m.state = 'idle'; m.t = within(rng, CREW_IDLE_S) * (all ? 0.1 : 0.5);
      const s = freeSpot();
      if (s) walkTo(m, s, all ? CREW_HURRY : CREW_WALK);
    }
  }
  function decide(m) {
    if (m.station) { m.face = m.face ?? m.yaw; m.t = within(rng, CREW_IDLE_S); if (rng() < 0.3) m.face = rng() * TAU; return; }
    if (m === lookout && bow) {
      if (Math.hypot(m.pos[0] - bow[0], m.pos[2] - bow[2]) > 0.6) {
        if (members.some((o) => o !== m && !o.gone && !o.below && Math.hypot(o.pos[0] - bow[0], o.pos[2] - bow[2]) < 0.6)) { m.t = within(rng, CREW_IDLE_S) * 0.25; return; }
        if (walkTo(m, bow)) return;
      }
      m.state = 'watch'; m.face = 0; m.t = within(rng, CREW_IDLE_S) * 2;
      return;
    }
    if (offMain(m)) { const s = freeSpot(); if (s && walkTo(m, s)) return; }
    const post = quiet ? null : postOf(m);
    if (post && rng() < POST_SHARE) {
      if (Math.hypot(m.pos[0] - post.at[0], m.pos[2] - post.at[2]) > POST_REACH && walkTo(m, post.at)) return;
      m.face = post.face; m.t = within(rng, CREW_IDLE_S) * POST_STAND;
      return;
    }
    const share = quiet ? 0 : (work > 0 ? WORK_SHARE * Math.min(1, work) : 0) + (asleep ? 0 : CHORE_SHARE);
    if (share > 0 && rng() < share) {
      const s = freeSpot();
      if (s && walkTo(m, s)) { m.state = 'toWork'; return; }
      if (s || !deck?.count) { startWork(m); return; }
    }
    if (rng() < 0.35 && !quiet && m !== chanty?.leader) {
      let best = null, bestD = CREW_TALK_SEEK;
      for (const o of members) {
        if (o === m || o.gone || o.below || o.state !== 'idle' || o.mate || o === chanty?.leader || o === lookout || offMain(o) || atPost(o)) continue;
        const d = Math.hypot(o.pos[0] - m.pos[0], o.pos[2] - m.pos[2]);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (best && startTalk(m, best)) return;
    }
    const s = freeSpot();
    if (!s || !walkTo(m, s)) { m.t = within(rng, CREW_IDLE_S); m.face = rng() * TAU; }
  }

  /**
   * @param {number} dt
   * @param {{ battle?: boolean, struck?: boolean, muster?: number, way?: 'board' | 'repel' | null, avoid?: number[] | null, order?: string | null, sings?: boolean, line?: (() => string | null) | null, asleep?: boolean, work?: number, call?: string | null, lookout?: number, roles?: readonly (string | null)[] | null }} [ctx]
   */
  function step(dt, ctx = {}) {
    // The first step runs even when no time passed, so night sleepers are below before the crew is first drawn.
    if (!(dt > 0)) { if (stood) return; dt = 0; }
    const fresh = !stood;
    stood = true;
    const muster = ctx.muster === 1 || ctx.muster === -1 ? ctx.muster : ctx.order === 'rail' ? 1 : 0;
    const way = muster && (ctx.way === 'board' || ctx.way === 'repel') ? ctx.way : null;
    const battle = !!ctx.battle || !!muster || ctx.order === 'guns';
    const struck = !!ctx.struck && !muster;
    if ((battle || struck) && !quiet) for (const m of members) if (m.mate && !m.gone) endTalk(m);
    quiet = battle || struck;
    roles = Array.isArray(ctx.roles) ? ctx.roles : [];
    named = Number.isInteger(ctx.lookout) ? /** @type {number} */ (ctx.lookout) : -1;
    pickLookout();
    work = Number.isFinite(ctx.work) ? Math.max(0, ctx.work) : 0;
    const sleep = !!ctx.asleep && !battle && !struck && ctx.order !== 'repair';
    if (sleep !== asleep) {
      asleep = sleep;
      if (asleep) turnIn(fresh); else allUp(battle || struck);
    } else if (rising && quiet && !asleep) allUp(true);
    if (rising && !asleep) bringUp(quiet, ctx.avoid ?? null);
    if (ctx.call) { const by = pickLookout() ?? live()[0]; if (by) { if (by.mate) endTalk(by); say(by, ctx.call, 'shout'); by.blurbT = Math.max(by.blurbT, CREW_LINE_S * 2); } }
    const key = muster ? String(muster) : '';
    if (key !== musterKey) {
      musterKey = key;
      const crew = live();
      if (muster) {
        for (const m of crew) { if (m.mate) endTalk(m); }
        const walkers = crew.filter((m) => !m.station);
        const zs = walkers.map((m) => walkers.reduce((k, o) => k + (o.pos[2] < m.pos[2] || (o.pos[2] === m.pos[2] && o.i < m.i) ? 1 : 0), 0));
        const level = deck?.count ? mainLevel(deck) : NaN;
        const ext = deckExtentZ(deck, level);
        for (const m of crew) if (m.station) { m.face = muster > 0 ? Math.PI / 2 : -Math.PI / 2; m.state = 'ready'; }
        walkers.forEach((m, n) => {
          const z = ext ? ext[0] + (ext[1] - ext[0]) * ((zs[n] + 0.5) / walkers.length) : m.pos[2];
          const at = deck?.rail?.(muster, z, undefined, level) ?? m.pos;
          m.post = [...at];
          m.face = muster > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (!walkTo(m, at, CREW_HURRY)) { m.state = 'ready'; }
          else m.state = 'toMuster';
        });
      } else {
        for (const m of crew) { m.state = 'idle'; m.t = within(rng, CREW_IDLE_S) * 0.5; m.face = null; m.path = null; }
      }
    }
    if (!battle && !muster && !struck && !asleep) {
      if (chanty) {
        chanty.t -= dt;
        if (chanty.t <= 0) {
          chanty.line++;
          const song = chanty.song, n = song.verses.length * 2;
          if (chanty.line >= n) { chanty = null; chantyT = within(rng, CHANTY_S); }
          else {
            chanty.t = CREW_LINE_S;
            const verse = chanty.line % 2 === 0;
            if (verse) { if (!chanty.leader.gone) say(chanty.leader, sung(song.verses[chanty.line / 2]), 'sing'); }
            else for (const m of live()) if (!m.mate) say(m, sung(song.chorus), 'sing');
          }
        }
      } else if ((chantyT -= dt) <= 0) {
        const crew = live();
        if (crew.length >= 2 && ctx.sings !== false) {
          const bard = crew.find((m) => m.mobile === MOBILE.Bard);
          chanty = { song: pick(rng, CHANTIES), line: -1, t: 0, leader: bard ?? pick(rng, crew) };
          if (chanty.leader.mate) endTalk(chanty.leader);
        } else chantyT = within(rng, CHANTY_S);
      }
    } else if (chanty) { chanty = null; chantyT = within(rng, CHANTY_S); }

    for (const m of members) {
      if (m.gone || m.below) continue;
      if (m.line && (m.line.t -= dt) <= 0) m.line = null;
      m.moving = false;
      m.swing = false;
      switch (m.state) {
        case 'idle':
          if ((m.t -= dt) > 0) break;
          if (!battle) decide(m);
          else if (!m.station) {
            const gun = roles[m.i] === 'Gunner' ? postOf(m) : null;
            if (gun && Math.hypot(m.pos[0] - gun.at[0], m.pos[2] - gun.at[2]) <= POST_REACH) { m.face = gun.face; m.t = within(rng, CREW_IDLE_S) * 0.5; break; }
            const s = gun?.at ?? freeSpot();
            if (!s || !walkTo(m, s, CREW_HURRY)) m.t = within(rng, CREW_IDLE_S) * 0.5;
          }
          else m.t = within(rng, CREW_IDLE_S);
          break;
        case 'watch':
          if (battle) { m.state = 'idle'; m.t = 0; break; }
          m.face = 0;
          if ((m.t -= dt) > 0) break;
          decide(m);
          break;
        case 'work':
          if (quiet || asleep && !(work > 0)) { m.state = 'idle'; m.t = within(rng, CREW_IDLE_S) * 0.3; break; }
          if ((m.swingT -= dt) <= 0) { m.swing = true; m.swingT = within(rng, WORK_SWING_S); }
          if ((m.t -= dt) <= 0) { m.state = 'idle'; m.t = within(rng, CREW_IDLE_S) * 0.5; }
          break;
        case 'walk': case 'toTalk': case 'toMuster': case 'toWork': case 'turnIn':
          if (quiet && m.state === 'toWork') { m.path = null; m.state = 'idle'; m.t = 0; break; }
          if (advance(m, dt, ctx.avoid ?? null)) { m.blockT = 0; } else if ((m.blockT = (m.blockT ?? 0) + dt) > CREW_BLOCKED_S) { m.path = null; m.blockT = 0; if (m.state === 'toTalk') endTalk(m); }
          if (m.state === 'walk' && !m.path) { m.state = 'idle'; m.t = within(rng, CREW_IDLE_S) * (m === lookout && !battle || offMain(m) || onAMan(m) ? 0 : 1); }
          else if (m.state === 'toWork' && !m.path) { if (asleep && !(work > 0)) { m.state = 'idle'; m.t = 0; } else startWork(m); }
          else if (m.state === 'turnIn' && !m.path) { m.below = true; m.state = 'below'; m.line = null; continue; }
          else if (m.state === 'toTalk' && !m.path) m.state = 'talk';
          else if (m.state === 'toMuster' && !m.path) m.state = 'ready';
          break;
        case 'wait':
          if (m.mate) m.face = Math.atan2(m.mate.pos[0] - m.pos[0], m.mate.pos[2] - m.pos[2]);
          if (!m.mate || m.mate.gone || m.mate.state !== 'toTalk' && m.mate.state !== 'talk') endTalk(m);
          break;
        case 'talk': {
          const o = m.mate;
          if (!o || o.gone) { endTalk(m); break; }
          m.face = Math.atan2(o.pos[0] - m.pos[0], o.pos[2] - m.pos[2]);
          o.face = Math.atan2(m.pos[0] - o.pos[0], m.pos[2] - o.pos[2]);
          if (o.state === 'wait') o.state = 'talk';
          if (!m.talk?.lead) break;
          if ((m.talk.t -= dt) > 0) break;
          m.talk.line++;
          const lines = m.talk.script;
          if (m.talk.line >= lines.length) { endTalk(m); break; }
          say(m.talk.line % 2 === 0 ? m : o, lines[m.talk.line]);
          m.talk.t = CREW_LINE_S;
          break;
        }
        case 'ready':
          m.face = muster > 0 ? Math.PI / 2 : muster < 0 ? -Math.PI / 2 : m.face;
          break;
        default: break;
      }
      if (!m.mate && !chanty && (m.blurbT -= dt) <= 0) {
        m.blurbT = within(rng, CREW_BLURB_S) * (battle ? 0.35 : struck ? 2 : 1);
        if (!m.line) {
          const theirs = !struck && !ctx.battle && !ctx.muster ? ctx.line?.() ?? null : null;
          const own = !battle && !struck && !asleep && faction && CREW_BLURBS[faction] && rng() < 0.3 ? CREW_BLURBS[faction] : null;
          const job = m.state === 'work' ? (work > 0 ? CREW_BLURBS.work : CREW_BLURBS.chore) : null;
          if (theirs && !asleep) say(m, theirs, muster || battle ? 'shout' : 'talk');
          else say(m, pick(rng, job ?? own ?? (way ? CREW_BLURBS[way] : battle ? CREW_BLURBS.battle : struck ? CREW_BLURBS.struck : asleep ? CREW_BLURBS.night : CREW_BLURBS.calm)), muster || battle ? 'shout' : 'talk');
        }
      }
      if (m.face != null && !m.moving) {
        const d = angleTo(m.yaw, m.face), s = CREW_TURN * dt;
        m.yaw += Math.abs(d) <= s ? d : Math.sign(d) * s;
      }
    }
  }

  // Roster order decides who gives way, so two walkers never wait on each other.
  function yields(m, ux, uz) {
    const px = m.pos[0] + ux * 0.8, pz = m.pos[2] + uz * 0.8;
    let wait = false;
    for (const o of members) {
      if (o === m || o.gone) continue;
      if (Math.hypot(o.pos[0] - m.pos[0], o.pos[2] - m.pos[2]) < 0.3) return false;
      if (o.i < m.i && o.path && o !== m.mate && Math.hypot(o.pos[0] - px, o.pos[2] - pz) < 0.8) wait = true;
    }
    return wait;
  }
  function advance(m, dt, avoid) {
    const p = m.path;
    if (!p) return true;
    let left = m.speed * dt;
    while (left > 0 && m.path) {
      const to = p[m.leg];
      const dx = to[0] - m.pos[0], dz = to[2] - m.pos[2], d = Math.hypot(dx, dz);
      if (avoid && Math.hypot(m.pos[0] + dx / (d || 1) * 0.8 - avoid[0], m.pos[2] + dz / (d || 1) * 0.8 - avoid[2]) < 0.8) return false;
      if (d > 1e-6 && yields(m, dx / d, dz / d)) return true;
      m.yaw = Math.atan2(dx, dz);
      m.moving = true;
      if (d <= left) {
        m.pos[0] = to[0]; m.pos[1] = to[1]; m.pos[2] = to[2];
        left -= d;
        if (++m.leg >= p.length) { m.path = null; break; }
      } else {
        const k = left / d;
        m.pos[0] += dx * k; m.pos[2] += dz * k;
        m.pos[1] = deck?.heightAt?.(m.pos[0], m.pos[2]) ?? m.pos[1];
        if (Number.isNaN(m.pos[1])) m.pos[1] = to[1];
        left = 0;
      }
    }
    return true;
  }

  return {
    members,
    step,
    speech() { const out = []; for (const m of members) if (!m.gone && m.line) out.push({ member: m, text: m.line.text, kind: m.line.kind }); return out; },
    trim(n) {
      let alive = members.filter((m) => !m.gone).length;
      for (let i = members.length - 1; i >= 0 && alive > n; i--) {
        const m = members[i];
        if (m.gone) continue;
        if (m.mate) endTalk(m);
        dropLeader(m);
        // A hand who is gone is never below, or a hand mended back would stay unseen until morning.
        m.gone = true; m.below = false; m.line = null; alive--;
      }
    },
    /** @param {number} n @param {{ mobile: number, gender: string }[]} [roster] */
    restore(n, roster = []) {
      let alive = members.reduce((a, m) => a + (m.gone ? 0 : 1), 0);
      for (const m of members) {
        if (alive >= n) return;
        // Hands a fight took come home when the fight ends, not here.
        if (!m.gone || m.taken || m.ashore) continue;
        const at = m.station ? m.post : freeSpot() ?? m.post;
        m.pos = [...at]; m.gone = false; m.state = 'idle'; m.t = within(rng, CREW_IDLE_S); m.path = null; m.face = null;
        alive++;
      }
      for (let i = members.length; alive < n && i < roster.length; i++, alive++) {
        const m = member(roster[i], i), at = m.station ? null : freeSpot();
        if (at) { m.pos = [...at]; m.post = [...at]; }
        members.push(m);
      }
    },
    /** @param {Set<number>} ids */
    away(ids) {
      let off = 0;
      for (const m of members) {
        const out = ids.has(m.i);
        if (out && !m.ashore) {
          if (!m.gone) { if (m.mate) endTalk(m); dropLeader(m); m.gone = true; m.line = null; }
          m.ashore = true; m.below = false;
        } else if (!out && m.ashore) {
          m.ashore = false;
          if (!m.taken) {
            const at = m.station ? m.post : freeSpot() ?? m.post;
            m.pos = [...at]; m.gone = false; m.state = 'idle'; m.t = within(rng, CREW_IDLE_S); m.path = null; m.face = null;
          }
        }
        if (m.ashore) off++;
      }
      return off;
    },
    standing: () => members.reduce((a, m) => a + (m.gone ? 0 : 1), 0),
    singing: () => !!chanty,
    lookout: () => pickLookout(),
    postOf: (i) => (members[i] ? postOf(members[i]) : null),
    asleep: () => asleep,
    belowCount: () => members.reduce((a, m) => a + (!m.gone && m.below ? 1 : 0), 0),
    hatch, bow,
    /** @param {number} n @param {{ from?: number }} [o] */
    take(n, { from = 0 } = {}) {
      const out = [];
      let skip = from;
      for (const m of members) {
        if (out.length >= n) break;
        if (m.gone) continue;
        if (skip > 0) { skip--; continue; }
        if (m.mate) endTalk(m);
        if (m.below) { m.below = false; m.pos = [...(hatch ?? m.post)]; }
        m.gone = true; m.taken = true; m.line = null;
        dropLeader(m);
        // A station's post is off the walkable deck, so the feet are clamped onto it.
        out.push({ mobile: m.mobile, gender: m.gender, pos: deck?.clamp?.(m.pos[0], m.pos[2]) ?? [...m.pos], yaw: m.yaw });
      }
      return out;
    },
  };
}

export function deckExtentZ(deck, level = NaN) {
  if (!deck?.count) return null;
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < deck.y.length; j++) {
    if (Number.isNaN(deck.y[j]) || Math.abs(deck.y[j] - level) > DECK_STEP) continue;
    const k = Math.floor(j / deck.nx), z = deck.minZ + (k + 0.5) * deck.cell;
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  return [lo, hi];
}
