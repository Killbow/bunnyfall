// @ts-check
import { appStorage } from '../platform/appStorage.js';

export const TRAVEL_PACE_STORE_KEY = 'dfjs.travel.pace2';
export const PACE_STEPS = Object.freeze([5, 10, 20, 30, 40, 60, 100]);
// `ROAD_PACE_MAX` must equal `MAX_TIME_SCALE` in src/world/timeScale.js, which imports both constants from here;
// this module cannot import timeScale back.
export const ROAD_PACE_MAX = 100;
export const OPEN_PACE_MAX = 60;
export const TRAVEL_PACE_DIALS = Object.freeze(['speed', 'foe']);
export const TRAVEL_PACE_DEFAULT = Object.freeze({ speed: OPEN_PACE_MAX, foe: 5 });
export const TRAVEL_PACE_TEXT = Object.freeze({
  title: 'Travel speed',
  speed: 'Speed',
  foe: 'Near enemies',
  way: 'Travel',
  cautious: 'Cautiously',
  reckless: 'Recklessly',
  tip: {
    speed: `How fast a journey runs (×${ROAD_PACE_MAX} on roads only, ×${OPEN_PACE_MAX} off them)`,
    foe: `The slowest the clock runs while enemies are near (×${ROAD_PACE_MAX} on a road only)`,
    way: 'Traveling Cautiously rolls on your Luck and Stealth to slip past enemies that reach you; Recklessly always stops to fight. Click to switch, including mid-journey.',
  },
  roadOnly: `×${ROAD_PACE_MAX} only on a road`,
  slower: 'Slower',
  faster: 'Faster',
});

export function clampPace(n, onRoad = false) {
  const v = Number(n);
  const top = onRoad ? ROAD_PACE_MAX : OPEN_PACE_MAX;
  if (!Number.isFinite(v)) return PACE_STEPS[0];
  let best = PACE_STEPS[0];
  for (const s of PACE_STEPS) if (s <= v && s <= top) best = s;
  return best;
}

let pace = null;
let ground = false;
export const WILD_PACE_CAP = Object.freeze({ road: 40, open: 20 });
let zoneCap = null;
const topOn = (onRoad) => {
  const t = onRoad ? ROAD_PACE_MAX : OPEN_PACE_MAX;
  return zoneCap ? Math.min(t, onRoad ? zoneCap.road : zoneCap.open) : t;
};
export function setPaceZoneCap(cap) {
  const next = cap ? { road: Number(cap.road) || WILD_PACE_CAP.road, open: Number(cap.open) || WILD_PACE_CAP.open } : null;
  if ((next?.road ?? 0) === (zoneCap?.road ?? 0) && (next?.open ?? 0) === (zoneCap?.open ?? 0)) return;
  zoneCap = next;
  const cur = travelPace();
  for (const fn of [...listeners]) { try { fn(cur, 'zone'); } catch { } }
}
export const paceZoneCap = () => zoneCap;
const listeners = new Set();

function read() {
  const p = { ...TRAVEL_PACE_DEFAULT };
  let raw = null;
  try { raw = appStorage()?.getItem(TRAVEL_PACE_STORE_KEY) ?? null; } catch { raw = null; }
  if (raw) {
    try {
      const v = JSON.parse(raw);
      for (const k of TRAVEL_PACE_DIALS) if (Number.isFinite(v?.[k])) p[k] = clampPace(v[k], false);
    } catch { }
  }
  return p;
}
function write(next, which) {
  pace = next;
  try { appStorage()?.setItem(TRAVEL_PACE_STORE_KEY, JSON.stringify(pace)); } catch { }
  for (const fn of [...listeners]) { try { fn(pace, which); } catch { } }
}

export function travelPace() {
  pace ??= read();
  return pace;
}
export const paceOnRoad = () => ground;

export function setPaceGround(onRoad) {
  const was = ground;
  ground = !!onRoad;
  if (was === ground) return;
  const cur = travelPace();
  for (const fn of [...listeners]) { try { fn(cur, 'ground'); } catch { } }
}

export function paceNow(which) {
  const v = travelPace()[which] ?? TRAVEL_PACE_DEFAULT[which];
  return Math.min(v, topOn(ground));
}
export const paceRateOn = (onRoad) => Math.min(topOn(onRoad), travelPace().speed);

export function setTravelPace(which, n) {
  if (!TRAVEL_PACE_DIALS.includes(which)) return null;
  const v = clampPace(n, ground);
  const cur = travelPace();
  if (cur[which] !== v) write({ ...cur, [which]: v }, which);
  return v;
}

export function stepTravelPace(which, dir) {
  if (!TRAVEL_PACE_DIALS.includes(which)) return null;
  const cur = paceNow(which);
  let i = PACE_STEPS.indexOf(clampPace(cur, true));
  i = Math.max(0, Math.min(PACE_STEPS.length - 1, i + (dir > 0 ? 1 : -1)));
  return setTravelPace(which, PACE_STEPS[i]);
}

export function paceCanRise(which) {
  return paceNow(which) < topOn(ground);
}

export function onTravelPace(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function _resetTravelPace() { pace = null; ground = false; zoneCap = null; listeners.clear(); }
