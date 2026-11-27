// @ts-check

import { idStream, signatureFamily, SIG, pyreElement, pyreSpell } from './revenantFeud.js';
import { makeBlow, setLiveBlow, shatterBlow, windupNear, inBlow, BLOW, BLOW_STALE, fitBlowToGround } from '../ai/foeBlows.js';
import { tacticsNow } from '../ai/tacticsClock.js';
import { tacticsSwitchOn } from '../ai/tactics.js';
import { revenantById, revenantEvent } from './revenant.js';
import { healMine } from '../player/playerHeal.js';
import { t } from '../ui/textManager.js';
import { silenceBlocksCast } from '../magic/mysticism.js';
import { rvnStatsOf, rvnAwakened } from './revenantStars.js';

export const ARTS = Object.freeze(['mending', 'warding', 'warcry', 'siphon', 'barrage', 'nova']);
export const ARTS_CHANCE = 0.35;
export const ART_RANK = 2;
export const ART_POOL = Object.freeze({
  blade: Object.freeze(['warding', 'warcry', 'siphon', 'mending']),
  beast: Object.freeze(['warcry', 'mending', 'nova']),
  brute: Object.freeze(['warcry', 'nova', 'warding']),
  caster: Object.freeze(['mending', 'warding', 'barrage', 'siphon', 'nova']),
});
export const ART_NAMES = Object.freeze({
  get mending() { return t('rvn.art.name.mending', 'Mending'); }, get warding() { return t('rvn.art.name.warding', 'Ward'); },
  get warcry() { return t('rvn.art.name.warcry', 'War Cry'); }, get siphon() { return t('rvn.art.name.siphon', 'Siphon'); },
  get barrage() { return t('rvn.art.name.barrage', 'Barrage'); }, get nova() { return t('rvn.art.name.nova', 'Nova'); },
});
export const ART_CHANNELS = Object.freeze(['mending', 'warding', 'warcry']);
export const ART_LAW = Object.freeze({
  MEND: Object.freeze({ AT: 0.5, CHANNEL: 2.0, HEAL: 0.2 }),
  WARD: Object.freeze({ AT: 0.75, CHANNEL: 1.5, TAKEN: 0.65, SECONDS: 10 }),
  CRY: Object.freeze({ REACH: 20, CHANNEL: 1.0, BLOWS: 1.2, SECONDS: 12 }),
  SIPHON: Object.freeze({ REACH: 8.5, WINDUP: 1.3, MULT: 1.0 }),
  BARRAGE: Object.freeze({ REACH: 12, WINDUP: 1.1, STEP: 0.45, COUNT: 3, MULT: 0.6 }),
  NOVA: Object.freeze({ REACH: 3.8, WINDUP: 1.4, MULT: 1.2 }),
  COOLDOWN: Object.freeze([14, 20]),
  FIRST: Object.freeze([3, 6]),
  SWORN_MEND: Object.freeze({ AT: 0.4, SHARE: 0.12, PER_RANK: 0.02, COOLDOWN: 120, SIDE: 0.5 }),
  SWORN_TAUGHT: 0.75,
  SWORN_WARD: Object.freeze({ BASE: 6, PER_RANK: 3, ROUNDS: 6, COOLDOWN: 90 }),
  SWORN_CRY: Object.freeze({ BASE: 4, PER_RANK: 2, ROUNDS: 6, COOLDOWN: 90 }),
  SWORN_STRIKE: Object.freeze({ COOLDOWN: Object.freeze([16, 22]), SIPHON: 1.0, SIPHON_HEAL: 1 / 4, BARRAGE: 1.5, NOVA: 0.8, NOVA_REACH: 5, REACH: 12, RANK: Object.freeze([0.5, 0.1]) }),
});
export const ART_COLORS = Object.freeze({
  mending: Object.freeze([0.3, 0.9, 0.5]), warding: Object.freeze([0.35, 0.6, 1.0]), warcry: Object.freeze([1.0, 0.82, 0.25]),
  siphon: Object.freeze([0.85, 0.15, 0.45]), barrage: Object.freeze([0.7, 0.35, 1.0]), nova: Object.freeze([0.6, 0.9, 1.0]),
});
const WARD_CLASSES = Object.freeze(['blade', 'blunt', 'axe', 'h2h', 'arrow']);

const artPool = (mobileType) => ART_POOL[signatureFamily(mobileType) ?? 'caster'];
export function drawArt(id, mobileType) {
  if (typeof id !== 'string' || !id || !Number.isInteger(mobileType)) return null;
  const rolls = idStream(id, 'art');
  if (rolls() >= ARTS_CHANCE) return null;
  const pool = artPool(mobileType);
  return pool[Math.min(pool.length - 1, Math.floor(rolls() * pool.length))];
}
export function taughtArt(id, mobileType) {
  if (typeof id !== 'string' || !id || !Number.isInteger(mobileType)) return null;
  const pool = artPool(mobileType);
  return pool[Math.min(pool.length - 1, Math.floor(idStream(id, 'art:taught')() * pool.length))];
}
// Derived from the id and the stars, never stored in the save.
export const artOf = (r) => drawArt(r?.id, r?.mobileType) ?? (rvnAwakened(r) ? taughtArt(r.id, r.mobileType) : null);
export function swornArtNumbers(r) {
  const rank = Math.max(1, Math.min(5, r?.rank | 0)), st = rvnStatsOf(r), quick = 1 - st.haste;
  const more = (1 + st.art) * (drawArt(r?.id, r?.mobileType) ? 1 : ART_LAW.SWORN_TAUGHT);
  const S = ART_LAW.SWORN_STRIKE;
  return {
    mendShare: (ART_LAW.SWORN_MEND.SHARE + ART_LAW.SWORN_MEND.PER_RANK * rank) * more, mendCooldown: ART_LAW.SWORN_MEND.COOLDOWN * quick,
    wardPoints: Math.round((ART_LAW.SWORN_WARD.BASE + ART_LAW.SWORN_WARD.PER_RANK * rank) * more), wardCooldown: ART_LAW.SWORN_WARD.COOLDOWN * quick,
    cryPoints: Math.round((ART_LAW.SWORN_CRY.BASE + ART_LAW.SWORN_CRY.PER_RANK * rank) * more), cryCooldown: ART_LAW.SWORN_CRY.COOLDOWN * quick,
    weight: (S.RANK[0] + S.RANK[1] * rank) * more, strikeCooldown: [S.COOLDOWN[0] * quick, S.COOLDOWN[1] * quick],
  };
}
export const artMagnitude = (level, mult) => ((SIG.PYRE_BASE[0] + SIG.PYRE_BASE[1]) / 2 + SIG.PYRE_PER * Math.max(1, level | 0)) * mult;
export function artSpell(name, element, level, mult) {
  const lv = Math.max(1, level | 0), base = pyreSpell(name, element, /** @type {any} */ (1));
  const lo = Math.round((SIG.PYRE_BASE[0] + SIG.PYRE_PER * lv) * mult), hi = Math.round((SIG.PYRE_BASE[1] + SIG.PYRE_PER * lv) * mult);
  return Object.freeze({ ...base, effects: [{ ...base.effects[0], magnitudeBaseLow: lo, magnitudeBaseHigh: hi, magnitudeLevelBase: 0, magnitudeLevelHigh: 0 }, ...base.effects.slice(1)] });
}

export function artWords(r, { sworn = !!r?.sworn } = {}) {
  const art = artOf(r);
  if (!art) return null;
  const n = ART_NAMES[art];
  if (sworn) {
    const A = swornArtNumbers(r);
    switch (art) {
      case 'mending': return t('rvn.art.sworn.mendingSecs', 'Art: {n}. When you fall below {at} health, it restores {share} of your maximum health (every {s} seconds).', { n, at: pct(ART_LAW.SWORN_MEND.AT), share: pct(A.mendShare), s: Math.round(A.mendCooldown) });   // AUDIT RVN-STARS S9: seconds, as the Ward's and the War Cry's - a minute and a half read as a minute
      case 'warding': return t('rvn.art.sworn.warding', 'Art: {n}. Shields you for {points} at the start of combat (every {s} seconds).', { n, points: A.wardPoints, s: Math.round(A.wardCooldown) });
      case 'warcry': return t('rvn.art.sworn.warcry', 'Art: {n}. Raises your Strength by {points} at the start of combat (every {s} seconds).', { n, points: A.cryPoints, s: Math.round(A.cryCooldown) });
      case 'siphon': return t('rvn.art.sworn.siphonShare', 'Art: {n}. Now and then it drains life from an enemy and gives you {share} of it.', { n, share: pct(ART_LAW.SWORN_STRIKE.SIPHON_HEAL) });   // AUDIT RVN D13: its share, its constant's
      case 'barrage': return t('rvn.art.sworn.barrage', 'Art: {n}. Now and then it looses a barrage on its enemy.', { n });
      default: return t('rvn.art.sworn.nova', 'Art: {n}. Now and then it strikes every enemy around it.', { n });
    }
  }
  const young = (r.rank | 0) < ART_RANK, on = tacticsSwitchOn(), from = ROMAN[ART_RANK];
  const below = young ? (on ? t('rvn.art.note.fromRank', ' (from Rank {rank})', { rank: from }) : t('rvn.art.note.fromRankSwitch', ' (from Rank {rank}, with Enhanced AI)', { rank: from })) : on ? '' : t('rvn.art.note.switch', ' (with Enhanced AI)');
  switch (art) {
    case 'mending': return t('rvn.art.hunt.mending', 'Art: {n}. When hurt, it gathers itself to heal. Strike it to break the spell{below}.', { n, below });
    case 'warding': return t('rvn.art.hunt.warding', 'Art: {n}. When hurt, it raises a ward against your blows. Strike it to break the spell{below}.', { n, below });
    case 'warcry': return t('rvn.art.hunt.warcry', 'Art: {n}. It roars as the fight begins, making itself and its band hit harder. Strike it to cut the roar short{below}.', { n, below });
    case 'siphon': return t('rvn.art.hunt.siphon', 'Art: {n}. A beam that drains your life. Step out of its line{below}.', { n, below });
    case 'barrage': return t('rvn.art.hunt.barrageCount', 'Art: {n}. {count} blasts at your feet, one after another. Keep moving{below}.', { n, count: ART_LAW.BARRAGE.COUNT, below });
    default: return t('rvn.art.hunt.novaRing', 'Art: {n}. A ring bursts around it. Step out of it, or into its center{below}.', { n, below });
  }
}
const pct = (x) => `${Math.round(x * 100)}%`;
const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V']);
const U = (lo, hi, rolls) => lo + rolls() * (hi - lo);

const keyFor = (now) => ({ _tac: { seen: now } });
const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[2] - from[2]);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
function mayArt(f) {
  const e = f?.entity, rev = e?.revenant;
  if (!rev?.id || rev.sworn || f.dead || f.puppet || !(e.health > 0)) return false;
  if (f.fleeing || f.scattering || f.yielded || f.roaring || f.executing || f.sparing || f._knockedOut || e.team === 'PlayerAlly') return false;
  if (f.ai?.canAct === false || f.ai?.isHostile === false) return false;
  return (rev.rank | 0) >= ART_RANK;
}
const stateOf = (f, art) => (f._art ??= { art, used: {}, ready: null, live: null, seen: 0, wardUntil: 0, wardWas: null, wardOn: null, cryUntil: 0, cryBand: [], called: false });

// Runs only in the owner's game: a peer sees no marks, and the wire carries no ward or cry.
/**
 * @param {any} f @param {number[]|null} feet
 * @param {{ onMe?: () => boolean, strike: (spell: any) => (number|void), say?: (ev: any) => void, sfx?: (element: number, at: number[]) => void, foes?: () => any[], rolls?: () => number }} ctx
 */
export function revenantArtFrame(f, feet, ctx) {
  const now = tacticsNow();
  const e = f?.entity, rev = e?.revenant;
  const s = f?._art ?? null;
  if (s?.live && now - s.seen > BLOW_STALE) endLive(s, now, true);
  if (s) { s.seen = now; stepTimers(f, s, now); }
  if (!mayArt(f) || !tacticsSwitchOn() || !feet) { if (s?.live) endLive(s, now, true); return null; }
  const art = drawArt(rev.id, f.mobileType ?? e.mobileType);
  if (!art) return null;
  if (art !== 'warcry' && silenceBlocksCast(e)) { if (s?.live) endLive(s, now, true); return null; }
  const st = stateOf(f, art);
  st.seen = now;
  const rolls = ctx.rolls ?? Math.random;
  const at = f.ai?.feet;
  if (!at) return null;
  if (st.live) return liveStep(f, st, now, ctx, feet);
  const engaged = !!f.ai?.detected && !!f.ai?.inSight && (ctx.onMe?.() ?? true);
  if (!engaged) return null;
  if (st.ready == null) st.ready = now + U(ART_LAW.FIRST[0], ART_LAW.FIRST[1], rolls);
  if (windupNear(feet, now)) return null;
  const d = flat(at, feet), hp = e.health / Math.max(1, e.maxHealth || 1);
  const yaw = yawTo(at, feet);
  if (art === 'mending' && !st.used.mending && hp < ART_LAW.MEND.AT) return channel(f, st, now, ART_LAW.MEND.CHANNEL, ctx);
  if (art === 'warding' && !st.used.warding && hp < ART_LAW.WARD.AT) return channel(f, st, now, ART_LAW.WARD.CHANNEL, ctx);
  if (art === 'warcry' && !st.used.warcry && d <= ART_LAW.CRY.REACH) return channel(f, st, now, ART_LAW.CRY.CHANNEL, ctx);
  if (now < st.ready) return null;
  if (art === 'siphon' && d <= ART_LAW.SIPHON.REACH) return thrown(f, st, now, [{ kind: 'charge', origin: at, yaw, windup: ART_LAW.SIPHON.WINDUP, at: now }], ctx, feet);
  if (art === 'nova' && d <= ART_LAW.NOVA.REACH + 1) return thrown(f, st, now, [{ kind: 'ring', origin: at, yaw, windup: ART_LAW.NOVA.WINDUP, at: now }], ctx, feet);
  if (art === 'barrage' && d <= ART_LAW.BARRAGE.REACH) {
    const marks = [];
    for (let i = 0; i < ART_LAW.BARRAGE.COUNT; i++) marks.push({ kind: 'pyre', aimed: true, windup: ART_LAW.BARRAGE.WINDUP, at: now + i * ART_LAW.BARRAGE.STEP });
    return thrown(f, st, now, marks, ctx, feet);
  }
  return null;
}
function channel(f, st, now, seconds, ctx) {
  const b = makeBlow('pyre', f.ai.feet, f.ai.yaw ?? 0, now, ART_COLORS[st.art], 'poise', seconds);
  /** @type {any} */ (b).ahead = 0;
  /** @type {any} */ (b).art = st.art;
  fitBlowToGround(b, f.ai.collider);
  const key = keyFor(now);
  setLiveBlow(key, b);
  st.live = { channel: true, hp: f.entity.health, land: b.land, marks: [{ key, blow: b, landed: false, at: now }] };
  st.used[st.art] = true;
  call(f, st, ctx, 'start');
  ctx.sfx?.(4, f.ai.feet);
  return 'start';
}
function thrown(f, st, now, marks, ctx, feet) {
  st.live = { channel: false, marks: marks.map((m) => ({ ...m, key: null, blow: null, landed: false })) };
  st.ready = now + U(ART_LAW.COOLDOWN[0], ART_LAW.COOLDOWN[1], ctx.rolls ?? Math.random);
  liveStep(f, st, now, ctx, feet);
  call(f, st, ctx, 'start');
  ctx.sfx?.(element(f, st.art), f.ai.feet);
  return 'start';
}
const element = (f, art) => (art === 'siphon' ? 4 : pyreElement(f.mobileType ?? f.entity?.mobileType));
function call(f, st, ctx, what) {
  const r = revenantById(f.entity?.revenant?.id);
  if (!r || !ctx.say) return;
  const n = ART_NAMES[st.art];
  if (what === 'start') {
    if (st.called) return;
    st.called = true;
    const body = ART_CHANNELS.includes(st.art) ? t('rvn.art.call.channel', 'Strike it to break the spell.') : st.art === 'siphon' ? t('rvn.art.call.siphon', 'Step out of its line.') : st.art === 'nova' ? t('rvn.art.call.nova', 'Step away from it.') : t('rvn.art.call.barrage', 'Keep moving.');
    ctx.say(revenantEvent('art', r, { body, line: t('rvn.art.call.line', '{given} calls on its {n}. {body}', { given: r.given, n, body }) }));
  } else if (what === 'broken') ctx.say(revenantEvent('art', r, { body: t('rvn.art.broken.body', 'Its {n} is broken.', { n }), line: t('rvn.art.broken.line', '{given}\'s {n} is broken.', { given: r.given, n }) }));
}
function liveStep(f, st, now, ctx, feet) {
  const L = st.live;
  let out = null;
  for (const m of L.marks) {
    if (!m.blow && now >= m.at) {
      const origin = f.ai.feet, yaw = yawTo(origin, feet);
      const b = makeBlow(m.kind, origin, yaw, now, ART_COLORS[st.art], 'poise', m.windup);
      if (m.aimed) /** @type {any} */ (b).ahead = Math.min(BLOW.pyre.range, flat(origin, feet));
      /** @type {any} */ (b).art = st.art;
      fitBlowToGround(b, f.ai.collider);
      m.blow = b; m.key = keyFor(now);
      setLiveBlow(m.key, b);
    }
    if (m.key) m.key._tac.seen = now;
  }
  if (L.channel) {
    if (!L.marks[0].landed && f.entity.health < L.hp - 1e-6) {
      for (const m of L.marks) if (m.key) shatterBlow(m.key, now);
      st.live = null;
      call(f, st, ctx, 'broken');
      return 'broken';
    }
    // The line follows health every frame, so a heal between frames never hides a blow.
    L.hp = f.entity.health;
    const m = L.marks[0];
    const b = m.blow, here = f.ai.feet;
    if (b && (b.origin[0] !== here[0] || b.origin[2] !== here[2])) {
      b.origin[0] = here[0]; b.origin[1] = here[1]; b.origin[2] = here[2];
      fitBlowToGround(b, f.ai.collider);
    }
    if (!m.landed && now >= m.blow.land) { m.landed = true; resolveChannel(f, st, now, ctx); out = 'landed'; }
  } else {
    for (const m of L.marks) {
      if (!m.blow || m.landed || now < m.blow.land) continue;
      m.landed = true;
      const hit = inBlow(m.blow, feet[0], feet[2]);
      out = hit ? 'hit' : (out ?? 'missed');
      if (hit) landOnMe(f, st, ctx);
    }
  }
  if (L.marks.every((m) => m.landed) && L.marks.every((m) => now >= m.blow.land + 0.3)) endLive(st, now, false);
  return out;
}
function landOnMe(f, st, ctx) {
  const e = f.entity, lvl = e.level ?? 1;
  const mult = st.art === 'siphon' ? ART_LAW.SIPHON.MULT : st.art === 'barrage' ? ART_LAW.BARRAGE.MULT : ART_LAW.NOVA.MULT;
  const took = Number(ctx.strike(artSpell(ART_NAMES[st.art], element(f, st.art), lvl, mult)));
  // A siphon drinks only what the door took, so a blast saved, resisted, or reflected draws nothing.
  if (st.art === 'siphon' && took > 0) e.health = Math.min(e.maxHealth || e.health, e.health + Math.min(took, Math.round(artMagnitude(lvl, ART_LAW.SIPHON.MULT))));
}
function resolveChannel(f, st, now, ctx) {
  const e = f.entity, rev = e.revenant;
  if (st.art === 'mending') e.health = Math.min(e.maxHealth || e.health, e.health + Math.round((e.maxHealth || 0) * ART_LAW.MEND.HEAL));
  else if (st.art === 'warding' && rev?.edge && !st.wardWas) {
    st.wardWas = rev.edge;
    st.wardOn = rev;
    rev.edge = wardEdge(rev.edge);
    st.wardUntil = now + ART_LAW.WARD.SECONDS;
  } else if (st.art === 'warcry' && st.cryUntil === 0) {
    st.cryBand = [f, ...(ctx.foes?.() ?? []).filter((x) => x !== f && !x.dead && x.retinueOf === rev?.id && x.entity)];
    for (const x of st.cryBand) x.entity.damageScale = (Number.isFinite(x.entity.damageScale) && x.entity.damageScale > 0 ? x.entity.damageScale : 1) * ART_LAW.CRY.BLOWS;
    st.cryUntil = now + ART_LAW.CRY.SECONDS;
  }
}
export function wardEdge(edge) {
  /** @type {Record<string, number>} */
  const taken = { ...(edge?.taken ?? {}) };
  for (const cls of WARD_CLASSES) if (cls !== edge?.weak) taken[cls] = Math.min(taken[cls] ?? 1, ART_LAW.WARD.TAKEN);
  return Object.freeze({ ...(edge ?? {}), taken: Object.freeze(taken) });
}
function stepTimers(f, s, now) {
  const rev = f?.entity?.revenant;
  // The ward wraps the edge stamp it found, so a stamp made since keeps its own edge.
  if (s.wardWas && (now >= s.wardUntil || rev !== s.wardOn)) { if (rev && rev === s.wardOn) rev.edge = s.wardWas; s.wardWas = null; s.wardOn = null; }
  if (s.cryUntil > 0 && now >= s.cryUntil) {
    for (const x of s.cryBand) if (x.entity && Number.isFinite(x.entity.damageScale)) x.entity.damageScale /= ART_LAW.CRY.BLOWS;
    s.cryBand = []; s.cryUntil = -1;
  }
}
function endLive(st, now, cut) {
  if (!st.live) return;
  for (const m of st.live.marks) if (m.key) { if (cut && m.blow && now < m.blow.land) shatterBlow(m.key, now); else setLiveBlow(m.key, null); }
  st.live = null;
}

const _sworn = new Map();
const swornState = (id) => { let s = _sworn.get(id); if (!s) { s = { ready: 0, fighting: false, mendReady: 0 }; _sworn.set(id, s); } return s; };
export const shieldBundle = (points, rounds) => ({
  name: ART_NAMES.warding, rangeType: 0, element: 4, icon: 0,
  effects: [{ type: 35, subType: 255, durationBase: rounds + 1, durationMod: 0, durationPerLevel: 1, chanceBase: 0, chanceMod: 0, chancePerLevel: 1,
    magnitudeBaseLow: points, magnitudeBaseHigh: points, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1 }],
});
export const mightBundle = (points, rounds) => ({
  name: ART_NAMES.warcry, rangeType: 0, element: 4, icon: 0,
  effects: [{ type: 9, subType: 0, durationBase: rounds + 1, durationMod: 0, durationPerLevel: 1, chanceBase: 0, chanceMod: 0, chancePerLevel: 1,
    magnitudeBaseLow: points, magnitudeBaseHigh: points, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1 }],
});

/** @param {any} rec @param {any} r @param {any} door @param {{ rolls?: () => number, say?: (line: string) => void }} [o] */
export function swornArtStep(rec, r, door, { rolls = Math.random, say = null } = {}) {
  const art = artOf(r);
  if (!art || !r?.sworn || !door || !rec?.entity || rec.dead || rec._knockedOut || !(rec.entity.health > 0)) return null;
  // Never name a local t in this function, because t is the text function its lines call.
  const now = tacticsNow(), s = swornState(r.id);
  const aim = rec.ai?.target;
  const tgt = aim?.entity && !aim.dead && aim.entity.health > 0 ? aim : null;
  const began = !!tgt && !s.fighting;
  s.fighting = !!tgt;
  const A = swornArtNumbers(r);
  if (art === 'warding' || art === 'warcry') {
    if (!began || now < s.ready) return null;
    const ward = art === 'warding';
    door.castOnPlayer?.(ward ? shieldBundle(A.wardPoints, ART_LAW.SWORN_WARD.ROUNDS) : mightBundle(A.cryPoints, ART_LAW.SWORN_CRY.ROUNDS));
    s.ready = now + (ward ? A.wardCooldown : A.cryCooldown);
    say?.(art === 'warding' ? t('rvn.art.sworn.wards', '{given} wards you.', { given: r.given }) : t('rvn.art.sworn.roars', '{given} roars, and your arm grows stronger.', { given: r.given }));
    return art;
  }
  if (art === 'mending' || !tgt) return null;
  if (began && s.ready < now) s.ready = now + U(ART_LAW.FIRST[0], ART_LAW.FIRST[1], rolls);
  if (now < s.ready) return null;
  const mine = new Set(door.foes?.() ?? []);
  const lvl = door.player?.()?.level ?? 1, S = ART_LAW.SWORN_STRIKE, weight = A.weight;
  const at = rec.ai?.feet;
  if (!at) return null;
  const sees = (x) => door.clear?.(at, x.ai.feet) !== false;
  if (art === 'nova') {
    const near = [...mine].filter((x) => fair(x, rec) && flat(x.ai.feet, at) <= S.NOVA_REACH && sees(x));
    if (!near.length) return null;
    for (const x of near) door.hurtFoe?.(x, Math.round(artMagnitude(lvl, S.NOVA) * weight));
  } else {
    if (!mine.has(tgt) || !fair(tgt, rec) || flat(tgt.ai.feet, at) > S.REACH || !sees(tgt)) return null;
    const n = Math.round(artMagnitude(lvl, art === 'siphon' ? S.SIPHON : S.BARRAGE) * weight);
    door.hurtFoe?.(tgt, n);
    if (art === 'siphon') { const me = door.player?.(); if (me) healMine(me, n * S.SIPHON_HEAL); }
  }
  s.ready = now + U(A.strikeCooldown[0], A.strikeCooldown[1], rolls);
  return art;
}
const fair = (x, rec) => !!x?.ai?.feet && x !== rec && !x.dead && x.ai.isHostile !== false && x.entity?.team !== 'PlayerAlly';
let _sideMendReady = 0;
export function swornMendStep(entity, after, sworn, standing, { say = null } = {}) {
  if (!entity?.isPlayer || entity.peer || !(after > 0) || after >= (entity.maxHealth || 1) * ART_LAW.SWORN_MEND.AT) return null;
  const now = tacticsNow();
  if (now < _sideMendReady) return null;
  for (const r of sworn ?? []) {
    if (artOf(r) !== 'mending' || !standing?.(r.id)) continue;
    const s = swornState(r.id);
    if (now < s.mendReady) continue;
    const A = swornArtNumbers(r);
    healMine(entity, (entity.maxHealth || 0) * A.mendShare);
    s.mendReady = now + A.mendCooldown;
    _sideMendReady = now + A.mendCooldown * ART_LAW.SWORN_MEND.SIDE;
    say?.(t('rvn.art.sworn.mends', '{given} mends your wounds.', { given: r.given }));
    return r;
  }
  return null;
}
export function forgetSwornArt(id = null) { if (id == null) { _sworn.clear(); _sideMendReady = 0; } else _sworn.delete(id); }
export function _resetArtsForTests() { _sworn.clear(); _sideMendReady = 0; }
