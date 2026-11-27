// @ts-check
import { TRAV_KEEPALIVE_MS, TRAV_STALE_MS, TRAV_MODES, WORLD_PIXEL_BOUND, TRAV_SEND_MIN_MS } from '../net/wire.js';

const NATIVE_PIXEL = 32768;
export const TRAV_FRACTION = NATIVE_PIXEL / 256;

export const TRAV_SHIP = TRAV_MODES.indexOf('ship');
export const isShipMark = (p) => p?.m === TRAV_SHIP;

export function travelModeIndex(mode) {
  const i = TRAV_MODES.indexOf(String(mode ?? '').toLowerCase());
  return i < 0 ? 0 : i;
}

// Yaw is radians from north, clockwise, as `forwardOf` uses it; the byte is a 256th of a turn.
export const headingByte = (yaw) => {
  const t = (((yaw / (2 * Math.PI)) % 1) + 1) % 1;
  return Math.round(t * 256) & 255;
};
export const yawOfHeading = (h) => (h / 256) * 2 * Math.PI;

/**
 * The pixel row counts south (`py` is 499 minus the row), as in `worldCoordToMapPixel`; past the Bay the pixel is
 * floored, so the 256ths stay 0 to 255.
 * @returns {{px:number, py:number, fx:number, fy:number, h:number, m:number, tv:number}}
 */
export function travellerMarkOf({ x, z, yaw = 0, mode = 'Foot', journey = false }) {
  const cx = Math.max((1 - WORLD_PIXEL_BOUND) * NATIVE_PIXEL, Math.min(WORLD_PIXEL_BOUND * NATIVE_PIXEL - 1, x));
  const cz = Math.max((500 - WORLD_PIXEL_BOUND) * NATIVE_PIXEL, Math.min((499 + WORLD_PIXEL_BOUND) * NATIVE_PIXEL - 1, z));
  const px = Math.floor(cx / NATIVE_PIXEL), pzRow = Math.floor(cz / NATIVE_PIXEL);
  const fx = Math.min(255, Math.floor((cx - px * NATIVE_PIXEL) / TRAV_FRACTION));
  const fy = Math.min(255, Math.floor((cz - pzRow * NATIVE_PIXEL) / TRAV_FRACTION));
  return { px, py: 499 - pzRow, fx, fy, h: headingByte(yaw), m: travelModeIndex(mode), tv: journey ? 1 : 0 };
}

export function travellerWorldOf(p) {
  const zRow = 499 - p.py;
  return { x: p.px * NATIVE_PIXEL + (p.fx + 0.5) * TRAV_FRACTION, z: zRow * NATIVE_PIXEL + (p.fy + 0.5) * TRAV_FRACTION };
}

export const TRAV_CHASE_REFRESH_MS = TRAV_SEND_MIN_MS;
export const chaseWordKey = (bd, sr = null) => [bd, sr].map((w) => (Array.isArray(w) ? w.map((e) => `${e[0]}:${e[3]}`).join(',') : '')).join('|');

/**
 * The host must reset `st` when the region's room changes, since a new room holds no mark of this player.
 * @param {{ last: any, at: number }} st
 * @param {{ now: number, mark: any, alone: boolean, shown: boolean, chasing?: boolean }} q
 */
export function travellerDue(st, { now, mark, alone, shown, chasing = undefined }) {
  if (!shown || !mark) return st.last ? 'clear' : null;
  if (alone) return null;
  const l = st.last;
  if (!l) return 'send';
  if (l.px !== mark.px || l.py !== mark.py || l.m !== mark.m || l.tv !== mark.tv) return 'send';
  if (chaseWordKey(l.bd, l.sr) !== chaseWordKey(mark.bd, mark.sr)) return 'send';
  const running = chasing ?? [...(mark.bd ?? []), ...(mark.sr ?? [])].some((e) => e[3] === 1);
  if (running && now - st.at >= TRAV_CHASE_REFRESH_MS) return 'send';
  if (now - st.at >= TRAV_KEEPALIVE_MS) return 'send';
  return null;
}

export function createTravellerBook() {
  const marks = new Map();
  const put = (f, now) => {
    if (!f?.id) return;
    if (!f.p) { marks.delete(f.id); return; }
    // A welcome row carries its age `ag` in seconds, so the mark is backdated by that much.
    const age = Number.isFinite(f.ag) && f.ag > 0 ? f.ag * 1000 : 0;
    marks.set(f.id, { id: f.id, name: f.name ?? '', sub: f.sub ?? null, title: f.title ?? null, glyphs: f.glyphs ?? [], lv: f.lv ?? null, gt: f.gt ?? null, p: f.p, at: now - age });
  };
  return {
    put,
    drop(id) { marks.delete(id); },
    reset(list, now) { marks.clear(); for (const f of list ?? []) put(f, now); },
    clear() { marks.clear(); },
    live(now) {
      const out = [];
      for (const [id, m] of marks) { if (now - m.at > TRAV_STALE_MS) marks.delete(id); else out.push(m); }
      return out;
    },
    get size() { return marks.size; },
  };
}
