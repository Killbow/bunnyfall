// Seeded model of a guild's weekly seat influence and writ income, read from the seat and profession rule modules.
// Usage: node tools/seatEconomy.mjs [--runs <n>] [--seed <n>] [--json]

import {
  WATCH_INFLUENCE, WATCH_DAY_CAP, GATE_INFLUENCE, GATE_WEEK_CAP, RENOWN_XP_PER_INFLUENCE, RENOWN_WEEK_CAP, WRIT_INFLUENCE_PER_MARK,
  ACCOUNT_SEAT_WEEK_CAP, SEAT_UPKEEP, CLAIM_THRESHOLD, crownScale,
} from '../src/net/townSeatLaw.js';
import { COURT_WRITS_PER_DAY, WRIT_UNITS, WRIT_TIER_WEIGHTS, writPay } from '../src/net/professionLaw.js';
import { isMain } from './lib/isMain.mjs';

// PROFILES and ASSUME are modeling assumptions; every cap and rate comes from the imported rule modules.
export const PROFILES = Object.freeze({
  casual: Object.freeze({ share: 0.35, sessions: 3, town: 20, harvests: 20, writs: 1, gates: 0.3, renownXp: 3000 }),
  regular: Object.freeze({ share: 0.45, sessions: 5, town: 30, harvests: 45, writs: 2, gates: 1.5, renownXp: 9000 }),
  hardcore: Object.freeze({ share: 0.20, sessions: 7, town: 60, harvests: 90, writs: 4, gates: 4, renownXp: 25000 }),
});
export const ASSUME = Object.freeze({ inRegion: 0.6, unitsAHarvest: 2.5, marksAUnit: 2.5, toCamp: 0.25, daylight: 55 / 120 + (65 / 120) * 0.5 });
export const SIZES = Object.freeze([5, 8, 12, 20, 30, 50]);
export const SERVER_ACTIVE = 100;

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const poisson = (mean, r) => { const l = Math.exp(-mean); let k = 0, p = 1; do { k++; p *= r(); } while (p > l); return k - 1; };
const around = (mean, r) => mean * (0.5 + r());
const pickProfile = (r) => { const u = r(); let acc = 0; for (const [k, p] of Object.entries(PROFILES)) { acc += p.share; if (u < acc) return k; } return 'regular'; };
function writOf(r) {
  const total = WRIT_TIER_WEIGHTS.reduce((a, b) => a + b, 0);
  let u = r() * total, tier = 1;
  for (let i = 0; i < WRIT_TIER_WEIGHTS.length; i++) { u -= WRIT_TIER_WEIGHTS[i]; if (u < 0) { tier = i + 1; break; } }
  const [lo, hi] = WRIT_UNITS[tier];
  const units = (lo + Math.floor(r() * ((hi - lo) / 10 + 1)) * 10);
  return writPay(units, ASSUME.marksAUnit);
}

export function memberWeek(profile, r) {
  const p = PROFILES[profile];
  let watch = 0, harvests = 0, writs = 0, writMarks = 0;
  for (let day = 0; day < 7; day++) {
    if (r() >= p.sessions / 7) continue;
    watch += Math.min(WATCH_DAY_CAP, Math.floor(around(p.town, r) / 2) * WATCH_INFLUENCE);
    harvests += around(p.harvests, r) * ASSUME.daylight;
    const n = Math.min(COURT_WRITS_PER_DAY, Math.round(around(p.writs, r)));
    for (let i = 0; i < n; i++) writMarks += writOf(r);
    writs += n;
  }
  const gates = Math.min(GATE_WEEK_CAP, poisson(p.gates * ASSUME.inRegion, r) * GATE_INFLUENCE);
  const renown = Math.min(RENOWN_WEEK_CAP, Math.floor(around(p.renownXp, r) * ASSUME.inRegion / RENOWN_XP_PER_INFLUENCE));
  const camp = Math.floor(harvests * ASSUME.inRegion * ASSUME.unitsAHarvest * ASSUME.marksAUnit * ASSUME.toCamp) * WRIT_INFLUENCE_PER_MARK;
  return { influence: Math.min(ACCOUNT_SEAT_WEEK_CAP, watch + gates + renown + camp), writMarks: Math.round(writMarks), writs };
}

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
export function runModel({ runs = 400, seed = 1, sizes = SIZES } = {}) {
  const r = seeded(seed);
  return sizes.map((size) => {
    const inf = [], marks = [];
    for (let i = 0; i < runs; i++) {
      let a = 0, m = 0;
      for (let k = 0; k < size; k++) { const w = memberWeek(pickProfile(r), r); a += w.influence; m += w.writMarks; }
      inf.push(a); marks.push(m);
    }
    inf.sort((x, y) => x - y); marks.sort((x, y) => x - y);
    const writP50 = pct(marks, 0.5);
    return {
      size, p10: pct(inf, 0.1), p50: pct(inf, 0.5), p90: pct(inf, 0.9), writP50,
      palaceShare: SEAT_UPKEEP.palace / writP50, crownShare: (SEAT_UPKEEP.crown * crownScale(SERVER_ACTIVE)) / writP50,
    };
  });
}

export function tableText(rows) {
  const n = (v) => Math.round(v).toLocaleString('en-US');
  const p = (v) => `${Math.round(v * 100)}%`;
  return ['| Guild size | Influence a week (p10 / p50 / p90) | Writ Marks a week (p50) | Palace upkeep, of that | Crown upkeep, of that |', '|---|---|---|---|---|',
    ...rows.map((x) => `| ${x.size} | ${n(x.p10)} / ${n(x.p50)} / ${n(x.p90)} | ${n(x.writP50)} | ${p(x.palaceShare)} | ${p(x.crownShare)} |`)].join('\n');
}

if (isMain(import.meta.url)) {
  const arg = (name, d) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const rows = runModel({ runs: arg('--runs', 400), seed: arg('--seed', 1) });
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else {
    console.log(tableText(rows));
    console.log(`\nThe lines: a palace ${CLAIM_THRESHOLD.palace.toLocaleString('en-US')}, a crown ${CLAIM_THRESHOLD.crown.toLocaleString('en-US')}; the crown's upkeep at ${SERVER_ACTIVE} accounts.`);
  }
}
