// @ts-check
import { sdPhase, sdStands, sdFoundLine, sdFellLine, sdFadeLine, SD_FOUND_NEAR_M, SD_FOUND_RESEND_MS, SD_COLLAPSE_MS } from '../net/sdLaw.js';
import { countdownText } from '../net/gateLaw.js';
import { findSdSite, pickSdTemplate, sdHollowLocation } from './sdSite.js';
import { worldRoom } from '../net/wire.js';
import { sdMapMark, sdOmenLight, sdRumor, sdMarksLine, sdHourLine, SD_HOUR_LEFT_MS } from './sdOmen.js';

export const SD_LINE_WAIT_MS = 30_000;
// A death in the frame after a cast-out can drop the exit, so the cast-out is asked again after this delay.
export const SD_CAST_OUT_AGAIN_MS = 2000;

export const SD_COLLAPSE_WARN_MS = Object.freeze([60_000, 30_000, 10_000]);
export function sdCollapseDue(left, said = Infinity) {
  if (!(left > 0)) return null;
  let due = SD_COLLAPSE_MS;
  for (const m of SD_COLLAPSE_WARN_MS) if (left <= m) due = m;
  return due < said ? due : null;
}
export function sdCollapseLine(left, { hour = false, first = false } = {}) {
  const t = countdownText(left);
  if (hour) return first ? `The Hour collapses in ${t}. The way home opens where the Remnant fell.` : `The Hour collapses in ${t}.`;
  return first ? `The Hour is broken. The Abyss Dungeon collapses in ${t}.` : `The Abyss Dungeon collapses in ${t}.`;
}
export const SD_FADE_WARN_MS = Object.freeze([300_000, 60_000, 30_000, 10_000]);
export function sdFadeDue(left, said = Infinity) {
  if (!(left > 0) || left > SD_FADE_WARN_MS[0]) return null;
  let due = SD_FADE_WARN_MS[0];
  for (const m of SD_FADE_WARN_MS) if (left <= m) due = m;
  return due < said ? due : null;
}
export const sdFadeReadout = (left, { hour = false } = {}) => `${hour ? 'The Hour closes' : 'The Abyss Dungeon fades'} in ${countdownText(left)}.`;

/** @typedef {import('../net/wire.js').SdRecord} SdRecord */

/** @param {{ now: () => number, scan: () => any, warmScan?: () => void, cities: (r: number) => any[], templates: () => any[], where: (px: number, py: number) => object, stand: (key: string, loc: any) => void, unstand: (key: string) => void, inside: (loc: any) => boolean, door: (key: string) => (number[]|null), feet: () => (number[]|null), sendFound: (word: {s:number, px:number, py:number}, cell: string) => boolean, say: (text: string) => void, regionName?: (r: number) => string, castOut?: (key: string) => (boolean|void), warn?: (text: string) => void, inHour?: () => boolean, standing?: () => (number|null), ground?: (px: number, py: number) => boolean, }} o */
export function createSdHost({ now, scan, warmScan = () => {}, cities, templates, where, stand, unstand, inside, door, feet, sendFound, say, regionName = () => '', castOut = () => {}, warn = () => {}, inHour = () => false, standing = () => null, ground = () => true }) {
  /** @type {SdRecord|null} */
  let rec = null;
  let heardAny = false;
  let memo = null;
  let stood = null;
  const owed = [];
  let foundSentAt = -Infinity, foundSentS = 0;
  let castOutS = 0, castOutAt = -Infinity;
  let warned = { s: 0, at: Infinity }, fadeWarned = { s: 0, at: Infinity };
  let hourSaidS = 0;

  function hollowOf(r) {
    if (!r || !r.s) return null;
    if (memo && memo.s === r.s) return memo.none ? null : memo;
    const sc = scan();
    if (!sc) { warmScan(); return null; }
    let at = r, near = cities(r.r);
    if (!near.length && r.r >= 0) { at = { ...r, r: -1 }; near = cities(-1); }
    const site = findSdSite(at, sc, near, ground);
    const template = site ? pickSdTemplate(r.s, templates()) : null;
    const loc = site && template ? sdHollowLocation(r, site, template, where(site.px, site.py)) : null;
    if (!loc) { memo = { s: r.s, none: true }; console.warn(`[sd] slot ${r.s}: the world offers no Hollow (${site ? 'no template' : 'no site'})`); return null; }
    memo = { s: r.s, site, loc, key: `${site.px},${site.py}` };
    return memo;
  }

  function heard(w) {
    if (!w || !Number.isSafeInteger(w.s) || w.s < 1) return;
    if (rec && w.s < rec.s) return;
    const was = rec;
    rec = { ...w };
    delete /** @type {any} */ (rec).k;
    const first = !heardAny;
    heardAny = true;
    // The first record is the welcome snapshot, so it owes no lines for what happened earlier.
    if (first) return;
    const t = now();
    if (rec.ph === 'found' && !(was && was.s === rec.s && (was.ph === 'found' || was.ph === 'fell'))) owed.push({ kind: 'found', rec, at: t });
    if (rec.ph === 'fell' && !(was && was.s === rec.s && was.ph === 'fell')) owed.push({ kind: 'fell', rec, at: t });
    if (rec.ph === 'gone' && rec.fellAt == null && rec.foundAt != null && was && was.s === rec.s && was.ph !== 'gone') owed.push({ kind: 'fade', rec, at: t });
  }

  function sayOwed(t) {
    while (owed.length) {
      const o = owed[0];
      const h = hollowOf(o.rec);
      if (!h && t - o.at < SD_LINE_WAIT_MS && !(memo && memo.s === o.rec.s && memo.none)) return;
      owed.shift();
      const near = h?.site?.cityName || '', region = regionName(o.rec.r) || '';
      const name = h?.loc?.name || 'an Abyss Dungeon';
      if (o.kind === 'found') { say(sdFoundLine({ who: o.rec.fb || 'Someone', near, region })); const m = sdMarksLine({ name: h?.loc?.name, s: o.rec.s }); if (m) say(m); }
      else if (o.kind === 'fell') say(sdFellLine({ top: o.rec.top || 'Someone', n: o.rec.n ?? 1, name }));
      else say(sdFadeLine({ name }));
    }
  }

  function frame() {
    const t = now();
    const phase = sdPhase(rec, t);
    const h = sdStands(phase) ? hollowOf(rec) : null;
    // Never unstand a Hollow the player is inside; cast them out instead, and a later frame removes it once they
    // are outside.
    let asked = false;
    const again = (s) => castOutS !== s || t - castOutAt >= SD_CAST_OUT_AGAIN_MS;
    const ask = (s, key) => { if (castOut(key) !== false) { castOutS = s; castOutAt = t; } };
    if (stood && (!h || h.s !== stood.s)) {
      if (!inside(stood.loc)) { unstand(stood.key); stood = null; }
      // The cast-out latches only when `castOut` acted, so a dead player raised in place is still cast out.
      else if (again(stood.s)) { asked = true; ask(stood.s, stood.key); }
    }
    // Also check where the player stands: a dungeon build that finishes after the end can land them in a Hollow or
    // Hour nothing else casts them out of.
    const at = standing();
    if (at == null && !(stood && inside(stood.loc))) castOutS = 0;
    if (!asked && at != null && rec && !(rec.s === at && sdStands(phase)) && again(at)) ask(at, `slot:${at}`);
    if (h && !stood) { stand(h.key, h.loc); stood = { s: h.s, key: h.key, loc: h.loc }; }
    if (phase === 'fell' && stood && stood.s === rec?.s && rec.fellAt != null && inside(stood.loc)) {
      const left = rec.fellAt + SD_COLLAPSE_MS - t;
      const due = sdCollapseDue(left, warned.s === rec.s ? warned.at : Infinity);
      if (due != null) { const first = warned.s !== rec.s; warned = { s: rec.s, at: due }; warn(sdCollapseLine(left, { hour: inHour(), first })); }
    }
    if ((phase === 'risen' || phase === 'found') && stood && stood.s === rec?.s && Number.isFinite(rec.until) && inside(stood.loc)) {
      const left = rec.until - t;
      const due = sdFadeDue(left, fadeWarned.s === rec.s ? fadeWarned.at : Infinity);
      if (due != null) { fadeWarned = { s: rec.s, at: due }; warn(sdFadeReadout(left, { hour: inHour() })); }
    }
    if (phase === 'risen' && stood && stood.s === rec?.s && (foundSentS !== stood.s || t - foundSentAt >= SD_FOUND_RESEND_MS)) {
      const d = door(stood.key), f = feet();
      if (d && f && Math.hypot(f[0] - d[0], f[2] - d[2]) <= SD_FOUND_NEAR_M) {
        const [px, py] = stood.key.split(',').map(Number);
        if (sendFound({ s: stood.s, px, py }, worldRoom(px, py))) { foundSentAt = t; foundSentS = stood.s; }
      }
    }
    // Owed lines go out before the last-hour line, so a Hollow found in its final hour is reported found first.
    sayOwed(t);
    if (phase === 'found' && rec && hourSaidS !== rec.s && Number.isFinite(rec.until) && rec.until > t && rec.until - t <= SD_HOUR_LEFT_MS) {
      const hh = hollowOf(rec);
      if (hh || (memo && memo.s === rec.s && memo.none)) { hourSaidS = rec.s; say(sdHourLine({ name: hh?.loc?.name, near: hh?.site?.cityName || '', region: regionName(rec.r) || '' })); }
    }
  }

  return {
    heard,
    frame,
    record: () => rec,
    hollow: () => (stood ? (memo && memo.s === stood.s ? memo : { s: stood.s, key: stood.key, loc: stood.loc }) : null),
    isHollow: (loc) => !!loc?.superTier && Number.isSafeInteger(loc?.sdSlot),
    phase: () => sdPhase(rec, now()),
    mapMark: () => sdMapMark(rec, stood && memo && memo.s === stood.s ? memo : null, now()),
    omen() {
      const h = stood && memo && memo.s === stood.s && rec?.s === stood.s ? memo : null;
      const light = h ? sdOmenLight(rec, now()) : 0;
      return light > 0 ? { hollow: h, light } : null;
    },
    rumor: (here, session, o) => sdRumor(rec, stood && memo && memo.s === stood.s ? memo : null, now(), here, session, o),
  };
}
