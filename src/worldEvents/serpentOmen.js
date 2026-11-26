// @ts-check
import {
  serpentAt, serpentPhase, serpentCountdown, serpentCountdownWords, serpentClock, serpentMarked, serpentSwims, serpentBossOf,
  sightingLine, risingLine, sealLine, soundLine, SERPENT_RISE_MINUTE, SERPENT_SOUND_MINUTE, SERPENT_DAY_MINUTES,
} from '../net/serpentLaw.js';

const SAYS = Object.freeze({ omen: 'omen', rising: 'rise', hunt: 'rise', late: 'seal', sounding: 'sound' });
const LINE_ORDER = Object.freeze(['omen', 'rise', 'seal', 'sound']);
// The hub reports a kill just after its welcome, so the omen stays silent this long after the host is ready.
export const SERPENT_OMEN_SETTLE_MS = 1500;
export const SITE_RETRY_MS = 5000;
export const insideSerpentRing = (mark, px, py, slack = 1) => !!mark && Math.hypot(px + 0.5 - mark.cx, py + 0.5 - mark.cy) <= mark.r + slack;

/** @param {{now: () => number, site: (day: number) => any, say: (text: string) => void, localTime?: (classicMinutes: number) => (string|null), fellAt?: (day: number, site: {sx: number, sz: number}) => (number|null), ready?: () => boolean, settleMs?: number}} deps */
export function createSerpentOmen({ now, site, say, localTime = () => null, fellAt = () => null, ready = () => true, settleMs = 0 }) {
  let saidDay = null, saidRank = -1;
  let readyAt = null, settled = false;
  let cache = { day: null, site: null, at: -Infinity };
  const siteOf = (day) => {
    if (cache.day !== day || (!cache.site && now() - cache.at >= SITE_RETRY_MS)) {
      let s = null;
      try { s = site(day) ?? null; } catch { s = null; }
      cache = { day, site: s, at: now() };
    }
    return cache.site;
  };
  const at = (day, minute) => localTime(day * SERPENT_DAY_MINUTES + minute) ?? '?';
  let current = null;
  return {
    frame() {
      if (!ready()) { readyAt = null; settled = false; current = null; return null; }
      if (!settled) {
        if (readyAt == null || now() < readyAt) readyAt = now();
        if (now() - readyAt < settleMs) { current = null; return null; }
        settled = true;
      }
      const t = serpentAt(now());
      const bare = serpentPhase(t, now());
      if (bare === 'quiet' || bare === 'gone') { current = { t, phase: bare, site: null }; return current; }
      const s = siteOf(t.day);
      const phase = serpentPhase(t, now(), s ? fellAt(t.day, s) : null);
      if (phase === 'gone') { current = { t, phase, site: null }; return current; }
      current = { t, phase, site: s };
      if (!s) return current;
      const line = SAYS[phase];
      const rank = LINE_ORDER.indexOf(line);
      if (line && (t.day !== saidDay || rank > saidRank)) {
        saidDay = t.day; saidRank = rank;
        const words = { near: s.near, boss: serpentBossOf(t.day).name };
        if (line === 'omen') say(sightingLine({ ...words, near: s.place, at: at(t.day, SERPENT_RISE_MINUTE) }));
        else if (line === 'rise') say(risingLine({ ...words, left: serpentClock(t.soundAt - now()) }));
        else if (line === 'seal') say(sealLine({ ...words, at: at(t.day, SERPENT_SOUND_MINUTE) }));
        else if (line === 'sound') say(soundLine(words));
      }
      return current;
    },
    current: () => current,
    ahead() {
      if (!settled) return null;
      const t = serpentAt(now());
      const s = siteOf(t.day);
      return s ? { day: t.day, site: s } : null;
    },
    reset() { current = null; readyAt = null; settled = false; },
    mapMark() {
      const c = current;
      if (!c?.site || !serpentMarked(c.phase)) return null;
      const cd = serpentCountdown(c.t, now(), c.phase);
      const boss = serpentBossOf(c.t.day);
      const words = c.phase === 'slain' ? 'slain' : serpentCountdownWords(cd);
      const label = words ? `${boss.name} - ${words}` : boss.name;
      const [a, b] = c.site.between ?? [];
      const tip = { title: `${boss.name}, ${boss.title}`, lines: [`Off ${c.site.place}`, ...(a && b ? [`On the packet lane from ${a} to ${b}`] : []), ...(words ? [words[0].toUpperCase() + words.slice(1)] : [])] };
      return { day: c.t.day, cx: c.site.ring.cx, cy: c.site.ring.cy, r: c.site.ring.r, label, phase: c.phase, tip };
    },
    swimming() {
      const c = current;
      return c?.site && serpentSwims(c.phase) ? { day: c.t.day, site: c.site, phase: c.phase, t: c.t, fellAt: fellAt(c.t.day, c.site) } : null;
    },
  };
}
