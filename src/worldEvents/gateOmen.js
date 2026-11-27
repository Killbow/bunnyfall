// @ts-check
import { gateAt, gatePhase, gateCountdown, countdownText, countdownWords, gateMarked, gateStands, gateBossOf, gateModsOf, riseLine, wrathLine, marksLine, gatePortentsOf, portentsLine, GATE_OPEN_MINUTE, GATE_SEAL_MINUTE, GATE_WRATH_MINUTE, GATE_DAY_MINUTES, GATE_COLLAPSE_MS, PIXEL_M } from '../net/gateLaw.js';
import { gateModsWords, gatePortentsWords } from '../net/gateMods.js';
import { GATE_TOWN_MAX_PX } from './gateSite.js';
import { t } from '../ui/textManager.js';
import { RITE_OMEN_LINE, cageStands } from '../net/gateRite.js';

// These lines name real local time only: the gate runs on the real-time event clock, and the sky the player sees
// turns at a different rate.
export const omenTimeLine = ({ place, at }) => `The sky burns near ${place}. Dagon's faithful open a breach at ${at} your time.`;
export const openTimeLine = ({ near, at }) => `Dagon's Breach near ${near} is open. The Covenant seals it at ${at} your time.`;
export const sealTimeLine = ({ near, at }) => `The Covenant has sealed Dagon's Breach near ${near}. It collapses at ${at} your time.`;

export const insideGateRing = (mark, px, py, slack = 1) => !!mark && Math.hypot(px + 0.5 - mark.cx, py + 0.5 - mark.cy) <= mark.r + slack;
export const gateSceneXZ = (standing, t) => [t[0] + standing.spot[0], t[2] + standing.spot[1]];
export const riteOmenLine = () => RITE_OMEN_LINE;

export const GATE_SKY_KINDLE = 0.35;
export const GATE_SKY_KINDLE_MS = 30_000;
export const GATE_SKY_OMEN = 0.6;
export const GATE_SKY_RISEN = 0.85;
export const GATE_SKY_FULL_M = Math.ceil((GATE_TOWN_MAX_PX + 1) * PIXEL_M);
export const GATE_SKY_EDGE_M = 12_000;
export const GATE_STORM_RING = Object.freeze({ salt: 0x6a7e5b1d, near: 120, split: 1400, far: 4500, nearShare: 0.55 });

const smooth01 = (x) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };

/**
 * @param {{omenAt:number, riseAt:number, openAt:number, sealAt:number, wrathAt:number}|null} t
 * @param {number} nowMs
 * @param {number|null} [fellAt]
 */
export function gateSkyPhaseWeight(t, nowMs, fellAt = null) {
  if (!t || !Number.isFinite(nowMs) || nowMs < t.omenAt) return 0;
  if (nowMs < t.riseAt) {
    return GATE_SKY_KINDLE * smooth01((nowMs - t.omenAt) / GATE_SKY_KINDLE_MS) + (GATE_SKY_OMEN - GATE_SKY_KINDLE) * smooth01((nowMs - t.omenAt) / (t.riseAt - t.omenAt));
  }
  if (nowMs < t.openAt) return GATE_SKY_OMEN + (GATE_SKY_RISEN - GATE_SKY_OMEN) * smooth01((nowMs - t.riseAt) / (t.openAt - t.riseAt));
  const end = Number.isFinite(fellAt) && /** @type {number} */ (fellAt) >= t.openAt ? Math.min(/** @type {number} */ (fellAt), t.wrathAt) : t.wrathAt;
  const whole = GATE_SKY_RISEN + (1 - GATE_SKY_RISEN) * smooth01((nowMs - t.openAt) / GATE_SKY_KINDLE_MS);
  if (nowMs < end) return whole;
  return whole * (1 - smooth01((nowMs - end) / GATE_COLLAPSE_MS));
}

export function gateSkyNear(distM) {
  if (!Number.isFinite(distM)) return 0;
  return 1 - smooth01((distM - GATE_SKY_FULL_M) / (GATE_SKY_EDGE_M - GATE_SKY_FULL_M));
}

export const gateSkyWeight = (t, nowMs, fellAt, distM) => gateSkyPhaseWeight(t, nowMs, fellAt) * gateSkyNear(distM);

export const SEAL_SAY_HOLD_MS = 6_000;
export const fellLine = ({ near, boss, top }) => `${boss} has fallen at Dagon's Breach ${near ? `near ${near}` : 'in the wilds'}${top?.length ? `, struck down by ${top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0]}` : ''}. The breach collapses.`;
export const courtFellLine = ({ near, boss, top, c = 0 }) => {
  const args = { boss, court: c + 1, near: near ?? '', by: (top ?? []).join(', '), struck: top?.length ? 'yes' : 'no' };
  return near
    ? t('net.gate.courtFell', "{boss} has fallen in court {court} of Dagon's Breach near {near}{struck, select, yes {, struck down by {by}} other {}}.", args)
    : t('net.gate.courtFellWilds', "{boss} has fallen in court {court} of Dagon's Breach in the wilds{struck, select, yes {, struck down by {by}} other {}}.", args);
};

/**
 * @param {{site: {place: string}, phase: string, t: {day: number}}} c
 * @param {{to: string, ms: number}|null} cd
 * @param {number|null} [fell]
 */
export function gateTip(c, cd, fell = null, boss = gateBossOf(c.t.day)) {
  const when = cd
    ? (cd.to === 'open' ? `Opens in ${countdownText(cd.ms)}` : cd.to === 'seal' ? `Open. Seals in ${countdownText(cd.ms)}` : `Sealed. Collapses in ${countdownText(cd.ms)}`)
    : (c.phase === 'collapsing' ? 'Collapsing' : null);
  const pt = gatePortentsWords(gatePortentsOf(c.t.day));
  return { title: 'Dagon\'s Breach', lines: [`Near ${c.site.place}`, ...(when ? [when] : []), ...(Number.isFinite(fell) ? [`${boss.name} has fallen`] : [`${boss.name}, ${boss.title}`, marksLineOf(c.t.day), ...(pt ? [pt] : [])])] };
}
let _marksDay = null, _marksLine = '';
function marksLineOf(day) {
  if (day !== _marksDay) {
    const marks = gateModsWords(gateModsOf(day));
    _marksLine = `${marks.charAt(0).toUpperCase()}${marks.slice(1)}`;
    _marksDay = day;
  }
  return _marksLine;
}

const SAYS = Object.freeze({ omen: 'omen', rising: 'rise', sealed: 'rise', open: 'open', closed: 'seal', collapsing: 'wrath' });
// A line is said only when it is later in this order than the last line said for its day, so a clock that steps
// back never repeats one.
const LINE_ORDER = Object.freeze(['omen', 'rise', 'open', 'seal', 'wrath']);
// The hub's word of a kill arrives just after its welcome, so the omen waits this long after the host is ready
// before it says anything.
export const OMEN_SETTLE_MS = 1500;

/** @param {{now: () => number, site: (day: number) => any, say: (text: string) => void, localTime?: (classicMinutes: number) => (string|null), fellAt?: (day: number) => (number|null), ready?: () => boolean, settleMs?: number, riteBroken?: (day: number, site: any) => boolean, riteReady?: () => boolean}} deps */
export function createGateOmen({ now, site, say, localTime = () => null, fellAt = () => null, ready = () => true, settleMs = 0, riteBroken = () => false, riteReady = () => true }) {
  let saidDay = null, saidRank = -1;
  let marksDay = null;
  let riteDay = null;
  let readyAt = null, settled = false;
  let cache = { day: null, site: null };
  let cage = null;
  const siteOf = (day) => {
    if (cache.day !== day) cache = { day, site: site(day) ?? null };
    return cache.site;
  };
  const at = (day, minute) => localTime(day * GATE_DAY_MINUTES + minute) ?? '?';
  let current = null;

  return {
    frame() {
      if (!ready()) { readyAt = null; settled = false; current = null; return null; }
      if (!settled) {
        if (readyAt == null || now() < readyAt) readyAt = now();
        if (now() - readyAt < settleMs) { current = null; return null; }
        settled = true;
      }
      const t = gateAt(now());
      const fell = fellAt(t.day);
      const phase = gatePhase(t, now(), fell);
      if (phase === 'quiet' || phase === 'gone') { current = { t, phase, site: null }; return current; }
      const s = siteOf(t.day);
      current = { t, phase, site: s };
      if (!s) return current;
      const line = SAYS[phase];
      // The seal line waits `SEAL_SAY_HOLD_MS` because on a night where every court has won, the word of the fall
      // arrives at the seal itself.
      if (line === 'seal' && now() - t.sealAt < SEAL_SAY_HOLD_MS) return current;
      const rank = LINE_ORDER.indexOf(line);
      if (line && (t.day !== saidDay || rank > saidRank) && !(line === 'wrath' && Number.isFinite(fell))) {
        saidDay = t.day; saidRank = rank;
        const words = { place: s.place, near: s.near, boss: gateBossOf(t.day).name };
        if (line === 'omen') say(omenTimeLine({ ...words, at: at(t.day, GATE_OPEN_MINUTE) }));
        else if (line === 'rise') say(riseLine({ ...words, left: countdownText(t.openAt - now()) }));
        else if (line === 'open') say(openTimeLine({ ...words, at: at(t.day, GATE_SEAL_MINUTE) }));
        if ((line === 'omen' || line === 'rise') && riteDay !== t.day) { riteDay = t.day; if (riteReady() && !riteBroken(t.day, s)) say(riteOmenLine()); }
        if ((line === 'omen' || line === 'rise' || line === 'open') && marksDay !== t.day) {
          marksDay = t.day;
          say(marksLine({ boss: words.boss, md: gateModsOf(t.day) }));
          const pt = portentsLine(gatePortentsOf(t.day));
          if (pt) say(pt);
        }
        else if (line === 'seal') say(sealTimeLine({ ...words, at: at(t.day, GATE_WRATH_MINUTE) }));
        else if (line === 'wrath') say(wrathLine(words));
      }
      return current;
    },
    current: () => current,
    mapMark() {
      const c = current;
      if (!c?.site || !gateMarked(c.phase)) return null;
      const cd = gateCountdown(c.t, now(), c.phase);
      const label = cd ? `Dagon's Breach - ${cd.to === 'collapse' ? 'sealed, ' : ''}${countdownWords(cd)}` : 'Dagon\'s Breach';
      return { day: c.t.day, cx: c.site.ring.cx, cy: c.site.ring.cy, r: c.site.ring.r, label, phase: c.phase, tip: gateTip(c, cd, fellAt(c.t.day)) };
    },
    sky(eye, pixelTranslation) {
      const c = current;
      if (!c?.site || !eye) return null;
      const [x, z] = gateSceneXZ(c.site, pixelTranslation(c.site.px, c.site.py));
      const weight = gateSkyWeight(c.t, now(), fellAt(c.t.day), Math.hypot(eye[0] - x, eye[2] - z));
      return weight > 0 ? { weight, x, z } : null;
    },
    cageSite() {
      const c = current;
      if (!c?.t || !cageStands(c.t.day, now())) return null;
      const s = c.site ?? siteOf(c.t.day);
      if (!s) return null;
      if (cage?.day !== c.t.day || cage.px !== s.px || cage.py !== s.py) cage = Object.freeze({ day: c.t.day, px: s.px, py: s.py });
      return cage;
    },
    standing() {
      const c = current;
      return c?.site && gateStands(c.phase) ? { day: c.t.day, px: c.site.px, py: c.site.py, spot: c.site.spot, phase: c.phase, t: c.t, fellAt: fellAt(c.t.day), near: c.site.near } : null;
    },
  };
}
