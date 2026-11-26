// @ts-check
import { sdPhase, sdStands, sdMarked, sdNameIn, sdWhere, SD_COLLAPSE_MS } from '../net/sdLaw.js';
import { timerText } from './eventTimers.js';
import { pixelOfLoc } from './sdSite.js';
import { MAX_ANSWERS_TELL_ME_ABOUT_OR_RUMORS } from '../talk/rumorMill.js';
import { sdMarksOf, sdEndingOf, sdOmensOf } from '../net/sdMarks.js';

export const SD_OMEN_PX = 12;
export const SD_OMEN_KINDLE_MS = 20_000;
export const SD_OMEN_FADE_MS = 20_000;
export const SD_RING_R = 1.25;
export const SD_COMPASS_M = 1000;
export const SD_RUMOR_CHANCE = 0.5;

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

/**
 * @param {import('../net/wire.js').SdRecord|null|undefined} rec
 * @param {number} now
 */
export function sdOmenLight(rec, now) {
  if (!rec || !sdStands(sdPhase(rec, now))) return 0;
  const end = rec.fellAt != null ? rec.fellAt + SD_COLLAPSE_MS : rec.until;
  return Math.min(clamp01((now - rec.at) / SD_OMEN_KINDLE_MS), clamp01((end - now) / SD_OMEN_FADE_MS));
}

export const sdOmenSeen = (site, x, y) => !!site && Math.max(Math.abs(x - site.px), Math.abs(y - site.py)) <= SD_OMEN_PX;

export function sdStateWords(rec, now) {
  const phase = sdPhase(rec, now);
  if (phase === 'fell') return 'collapsing';
  if (phase === 'found' || phase === 'risen') return `fades in ${timerText(rec.until - now)}`;
  return '';
}

/**
 * @param {import('../net/wire.js').SdRecord|null|undefined} rec
 * @param {{ s:number, site?:any, loc?:any }|null|undefined} hollow
 * @param {number} now
 */
export function sdMapMark(rec, hollow, now) {
  const phase = sdPhase(rec, now);
  if (!rec || !sdMarked(phase) || !hollow?.site || hollow.s !== rec.s) return null;
  const name = String(hollow.loc?.name ?? 'An Abyss Dungeon');
  const words = sdStateWords(rec, now);
  const E = sdEndingOf(sdMarksOf(rec.s));
  const lines = [`Near ${hollow.site.cityName || 'the Iliac Bay'}`, ...(E ? [`It keeps the Ending of ${E.stone}`] : []), ...(rec.fb ? [`Found by ${rec.fb}`] : []), ...(words ? [words[0].toUpperCase() + words.slice(1)] : [])];
  return { day: rec.s, cx: hollow.site.px + 0.5, cy: hollow.site.py + 0.5, r: SD_RING_R, label: words ? `${name} · ${words}` : name, phase, tip: { title: `${name}, an Abyss Dungeon`, lines } };
}

// Splits `mark.label` on the ' · ' separator that `sdMapMark` writes, so the two formats must match.
export function sdNoticeCard(mark, cityName) {
  if (!mark) return null;
  const [name, words] = String(mark.label).split(' · ');
  const where = cityName ? `${name}, near ${cityName}.` : `${name}.`;
  return { subject: 'Abyss Dungeon', body: words ? `${where} ${words[0].toUpperCase()}${words.slice(1)}.` : where };
}

export const SD_AIR = Object.freeze({ fullM: 1000, edgeM: 8000, max: 0.55, duskAt: 1170, duskHalf: 150, base: 0.45 });
const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
export const sdAirNear = (d) => (Number.isFinite(d) ? 1 - smooth(SD_AIR.fullM, SD_AIR.edgeM, d) : 0);
export function sdAirDusk(minute) {
  const m = ((Number(minute) || 0) % 1440 + 1440) % 1440, dm = Math.abs(((m - SD_AIR.duskAt + 720) % 1440 + 1440) % 1440 - 720);
  const k = dm >= SD_AIR.duskHalf ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * dm) / SD_AIR.duskHalf);
  return SD_AIR.base + (1 - SD_AIR.base) * k;
}
export const sdAirWeight = (light, d, minute) => SD_AIR.max * clamp01(light) * sdAirNear(d) * sdAirDusk(minute);
export { SD_BRASS_RAMP, sdBrassGrade } from '../world/sdBrassSky.js';
// Returns `rgb` itself, not a copy, when `w` is not positive and `rgb` is already a Float32Array, so callers must
// not mutate the result.
export const SD_BRASS_TINT = Object.freeze([1.1, 0.92, 0.62]);
export const sdBrassLight = (rgb, w) => (!(w > 0) && rgb instanceof Float32Array ? rgb : new Float32Array([0, 1, 2].map((i) => rgb[i] * (1 + (SD_BRASS_TINT[i] - 1) * clamp01(w || 0)))));
export const SD_BANNER_M = 60;
export const sdBannerText = (name, rec, now) => { const w = sdStateWords(rec, now); return `${name || 'An Abyss Dungeon'}${w ? ` - ${w}` : ''}`; };
export function sdMarksLine({ name, s }) {
  const mk = sdMarksOf(s), E = sdEndingOf(mk), O = sdOmensOf(mk);
  return E ? `${name || 'The Abyss Dungeon'} keeps the Ending of ${E.stone}, its ${E.sig.replace(/^The /, '')}, under ${O.map((o) => sdNameIn(o.name)).join(' and ')}.` : '';
}
export const SD_HOUR_LEFT_MS = 60 * 60 * 1000;
export const sdHourLine = ({ name, near, region }) => `${name || 'The Abyss Dungeon'} ${sdWhere(near, region)} will fade within the hour.`;

export const SD_ENDING_RUMOR = Object.freeze({
  daggerfall: 'a lion roars where there is no lion',
  sentinel: 'the sun goes down twice',
  wayrest: 'the tide comes in where there is no sea',
  orsinium: 'something heavy walks just under the earth',
  underking: 'the dead in their barrows turn their heads toward the walls',
  blades: 'a dragon\'s shadow crosses where no dragon flies',
});
export const sdRumorLine = (city, ending = null) => `They say the air goes brass-colored past the walls of ${city} at dusk, and ${SD_ENDING_RUMOR[ending] ?? 'a bell rings where there is no bell'}.`;

/**
 * Shares the rumor mill's per-NPC answer limit: returns null once the limit is reached (unless the NPC is a
 * spymaster), and counts as one answer when it returns a line.
 * @param {import('../net/wire.js').SdRecord|null|undefined} rec
 * @param {{ s:number, site?:any }|null|undefined} hollow
 * @param {number} now
 * @param {{ px:number, py:number }|null} here
 * @param {any} session
 * @param {{ rolls?: () => number }} [o]
 */
export function sdRumor(rec, hollow, now, here, session, { rolls = Math.random } = {}) {
  const phase = sdPhase(rec, now);
  if (!rec || (phase !== 'risen' && phase !== 'found') || !hollow?.site?.city || hollow.s !== rec.s || !here || !session) return null;
  const c = pixelOfLoc(hollow.site.city);
  if (here.px !== c.px || here.py !== c.py) return null;
  if (!((session.numAnswersGivenTellMeAboutOrRumors | 0) < MAX_ANSWERS_TELL_ME_ABOUT_OR_RUMORS || session.isSpyMaster)) return null;
  if (!(rolls() < SD_RUMOR_CHANCE)) return null;
  session.numAnswersGivenTellMeAboutOrRumors = (session.numAnswersGivenTellMeAboutOrRumors | 0) + 1;
  return sdRumorLine(hollow.site.cityName || 'the city', sdMarksOf(rec.s)[0]);
}
