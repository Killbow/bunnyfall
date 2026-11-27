// @ts-check
import { starTimes, starRoll, STAR_WAVES, STAR_LIGHT, STAR_LOW_LIGHT, P_FALLEN, P_GATHER, P_WAVE, P_BREATH, P_MASTER, P_HELD, P_LOST } from '../../net/starfall/starfallLaw.js';
import { STAR_CARD_TEXT, STAR_REGION_TEXT } from './starWords.js';
import { starMasterOf } from './starCoven.js';
import { covenWitches } from './starfallCovens.js';
import { heartStar } from './starfallNight.js';

// Inside the relay's 60 m reach, so a pose a frame behind the feet is never refused at the edge.
export const STAR_SAY_M = 55;
export const STAR_HUD_M = 400;
export const STAR_SHAKE_M = 300;
export const STAR_STAND_R = Object.freeze([14, 20]);
// The stands' starRoll indices start here, above every other block a star rolls from, so no two share a roll.
export const STAR_STAND_ROLLS = 1000;
// A changed word is said once more after this, since the relay's bucket may drop it.
export const STAR_RESAY_MS = 1000;
export const STAR_WARN_MS = 10 * 60_000;
export const STAR_CIRCLE_R = 6;

export function starClockPhase(n, k, t) {
  const T = starTimes(n, k);
  if (!(t >= T.omenAt)) return 'none';
  if (t < T.streakAt) return 'omen';
  if (t < T.fallAt) return 'streak';
  if (t < T.endAt) return 'fallen';
  if (t < T.goneAt) return 'after';
  return 'gone';
}

export function starStandPlaces(n, k, w, count) {
  const out = [];
  const a0 = (starRoll(n, k, 700 + w) / 4294967296) * 2 * Math.PI;
  for (let i = 0; i < count; i++) {
    const a = a0 + (i / Math.max(1, count)) * 2 * Math.PI + ((starRoll(n, k, STAR_STAND_ROLLS + w * 32 + i) % 1000) / 1000 - 0.5) * 0.5;
    const r = STAR_STAND_R[0] + ((starRoll(n, k, STAR_STAND_ROLLS + 200 + w * 32 + i) % 1000) / 1000) * (STAR_STAND_R[1] - STAR_STAND_R[0]);
    const dx = Math.sin(a) * r, dz = Math.cos(a) * r;
    out.push([dx, dz, Math.atan2(-dx, -dz)]);
  }
  return out;
}
export const starCirclePlaces = (count) => Array.from({ length: count }, (_, i) => { const a = (i / Math.max(1, count)) * 2 * Math.PI; return [Math.sin(a) * STAR_CIRCLE_R, Math.cos(a) * STAR_CIRCLE_R]; });

/**
 * @param {{ n: number, k: number, px: number, py: number }} star
 * @param {{ struck: boolean, own: boolean, kw?: number, kn: number, wc: number, hb: number, mf: boolean }} mine
 * @param {number} level
 */
export const starWordOf = (star, mine, level) => {
  // Deaths count only with a wave, because the cell credits them to that wave alone.
  const kw = Math.max(0, Math.min(STAR_WAVES, mine.kw | 0));
  return {
    n: star.n, k: star.k, px: star.px, py: star.py, lv: Math.max(1, Math.min(60, level | 0)),
    s: mine.struck ? 1 : 0, o: mine.own ? 1 : 0, kw, kn: kw ? Math.max(0, Math.min(99, mine.kn | 0)) : 0, wc: Math.max(0, Math.min(STAR_WAVES, mine.wc | 0)),
    hb: Math.max(0, Math.min(9999, mine.hb | 0)), mf: mine.mf ? 1 : 0,
  };
};
export const starWordKey = (w) => `${w.s}.${w.o}.${w.kw}.${w.kn}.${w.wc}.${w.hb}.${w.mf}`;

export function starPhaseLine(led, masterName) {
  if (!led) return STAR_CARD_TEXT.waits();
  switch (led.p) {
    case P_FALLEN: return STAR_CARD_TEXT.waits();
    case P_GATHER: return STAR_CARD_TEXT.gathers();
    case P_WAVE: return STAR_CARD_TEXT.wave(led.w, STAR_WAVES);
    case P_BREATH: return STAR_CARD_TEXT.breath();
    case P_MASTER: return masterName;
    case P_HELD: return STAR_CARD_TEXT.held();
    default: return STAR_CARD_TEXT.lost();
  }
}

export const clockText = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * @param {{ n: number, k: number, coven: any, near: string }} site
 * @param {any} led
 * @param {number} t
 * @param {string} masterName
 * @param {boolean} [held]
 */
export function starTrackerModel(site, led, t, masterName, held = false) {
  const heart = heartStar(site.n, site.k), T = starTimes(site.n, site.k);
  const over = held || led?.p === P_HELD ? P_HELD : led?.p === P_LOST ? P_LOST : null;
  const lt = led ? led.lt : STAR_LIGHT;
  return {
    title: STAR_CARD_TEXT.name(heart),
    near: STAR_CARD_TEXT.near(site.near),
    coven: covenWitches(site.coven),
    phase: over === P_HELD ? STAR_CARD_TEXT.held() : over === P_LOST ? STAR_CARD_TEXT.lost() : starPhaseLine(led, masterName),
    light: over === P_LOST ? 0 : Math.max(0, Math.min(1, lt / STAR_LIGHT)),
    low: !over && lt <= STAR_LOW_LIGHT,
    left: over ? '' : STAR_CARD_TEXT.left(clockText(T.endAt - t)),
    heart,
    held: over === P_HELD,
  };
}

export const starHeldKey = (n, s, px, py) => `${n}.${s}@${px},${py}`;

/**
 * @param {any[]} sites
 * @param {number} t
 * @param {{ held?: Map<string, any>, led?: Map<string, any>, localTime?: (ms: number) => string }} [o]
 */
export function starMapMarks(sites, t, { held = new Map(), led = new Map(), localTime = () => '' } = {}) {
  const out = [];
  for (const s of sites ?? []) {
    const phase = starClockPhase(s.n, s.k, t);
    if (phase === 'none' || phase === 'gone') continue;
    const key = starHeldKey(s.n, s.k, s.px, s.py), h = held.get(key), l = led.get(key), T = starTimes(s.n, s.k);
    const title = STAR_CARD_TEXT.name(heartStar(s.n, s.k));
    const state = h ? STAR_CARD_TEXT.heldBy(h.top, h.c)
      : l?.p === P_LOST || phase === 'after' ? STAR_CARD_TEXT.lost()
        : phase === 'omen' ? STAR_CARD_TEXT.falls(localTime(T.fallAt))
          : phase === 'streak' ? STAR_CARD_TEXT.falling()
            : starPhaseLine(l, l ? starMasterOf(l.b, s.k).name() : '');
    out.push({ key, px: s.px, py: s.py, label: `${title}, ${s.near}`, tip: { title, lines: [STAR_CARD_TEXT.near(s.near), covenWitches(s.coven), state] } });
  }
  return out;
}

/**
 * @param {any[]} sites
 * @param {number} t
 * @param {(key: string) => boolean} [decided]
 */
export function starTimerRows(sites, t, decided = () => false) {
  const rows = [];
  let next = null;
  const coming = (s, at, heart, warned) => ({ id: `star:${s.n}.${s.k}`, kind: 'star', title: STAR_CARD_TEXT.comes(heart), where: warned ? STAR_CARD_TEXT.near(s.near) : null, detail: STAR_CARD_TEXT.rite(covenWitches(s.coven)), live: false, at, until: null, ...(warned ? { px: s.px, py: s.py } : {}) });
  for (const s of sites ?? []) {
    const T = starTimes(s.n, s.k), heart = heartStar(s.n, s.k);
    if (T.fallAt <= t && t < T.endAt && !decided(starHeldKey(s.n, s.k, s.px, s.py))) {
      rows.push({ id: `star:${s.n}.${s.k}`, kind: 'star', title: STAR_CARD_TEXT.name(heart), where: STAR_CARD_TEXT.near(s.near), detail: STAR_CARD_TEXT.takes(), live: true, at: T.endAt, until: T.endAt, px: s.px, py: s.py });
    } else if (T.fallAt > t) {
      if (T.fallAt - STAR_WARN_MS <= t) rows.push(coming(s, T.fallAt, heart, true));
      if (!next || T.fallAt < next.at) next = { s, at: T.fallAt, warned: T.fallAt - STAR_WARN_MS <= t, heart };
    }
  }
  if (next && !next.warned) rows.push(coming(next.s, next.at, next.heart, false));
  return rows.sort((a, b) => (a.live === b.live ? 0 : a.live ? -1 : 1) || (a.live ? 0 : a.at - b.at));
}

export const starHeldLine = (site, top, c) => (site ? STAR_REGION_TEXT.held(site.near, top, c) : null);
