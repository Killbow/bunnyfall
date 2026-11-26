// @ts-check
// The Wrothgarian Mountains open zone: the region test, the map mask, the zone's numbers, and the live
// flag the spawn pools read.

import { t } from '../ui/textManager.js';
import { isLetterOfCredit } from '../net/peerWord.js';
import { cromwarkPeace, nyxCoinChance, setCromwarkCombatHere } from './wild/cromwark.js';

export const WILD_REGION = 16;
export const WILD_NAME = 'Wrothgarian Mountains';
export const WILD_FOE_HEALTH_MULT = 4;
export const WILD_FOE_DAMAGE_MULT = 4;
export const WILD_LOOT_GOLD_MULT = 2;
export const WILD_LOOT_DROP_MULT = 2;
export const WILD_LOOT_RARE_MULT = 2;
export const WILD_RINGS = 4;
export const WILD_RING_LOOT = Object.freeze([1.25, 1.5, 1.75, 2]);
export const wildRingTier = (ring) => WILD_RING_LOOT[(ring | 0) - 1] ?? WILD_RING_LOOT[WILD_RINGS - 1];
export const wildRingLoot = (ring, kind = _kind) => (cromwarkPeace(kind) ? 1 : wildRingTier(ring));
export const wildRingName = (ring) => ['The Foothills', 'The Passes', 'The High Crags', 'The Heart'][(ring | 0) - 1] ?? 'The Heart';
export const wildRingBonus = (ring) => (cromwarkPeace(WILD_KIND) ? `${Math.round(nyxCoinChance(ring) * 100)}% Dusk` : `+${Math.round((wildRingLoot(ring) - 1) * 100)}% loot`);
export const WILD_DEATH_HOLD_S = 120;
export const WILD_KILL_CREDIT_MS = 10_000;
export const WILD_NEAR_PX = 6;

export const WILD_TRAVEL_FEE = 2500;
export const WILD_TRAVEL_FEES = Object.freeze([2500, 5000, 10000, 15000]);
export const wildTravelFee = (ring) => WILD_TRAVEL_FEES[Math.max(1, Math.min(4, ring | 0 || 1)) - 1];
export const WILD_TRAVEL_COOLDOWN_MS = 10 * 60_000;

export const WILD_GIANT = 16;
export const WILD_GIANT_SIZE = 4;
export const WILD_GIANT_CHANCE = 0.15;
export const WILD_GIANT_MAX = 2;
export const WILD_GIANT_HEALTH_MULT = 10;
export const WILD_GIANT_DAMAGE_MULT = 4;
export const ZONE_WATCH_SCALE = 10;
export const wildGiantSize = (entity) => (entity?.wildGiant ? WILD_GIANT_SIZE : 1);
export const GREATER_GIANT_NAME = 'Greater Giant';
export const GREATER_GIANT_CALL = 10;
export const GREATER_GIANT_CALL_AT = 0.5;

export const WILD_STRANGER_M = 600;
export const WILD_STRANGER_SEE_M = 1500;
export const WILD_STRANGER_SLOW_M = 200;
export const WILD_STRANGER_RGBA = Object.freeze([1, 0.23, 0.18, 1]);

export const WILD_CUT = Object.freeze([[0.4103,0.0],[0.4097,0.0375],[0.4166,0.0778],[0.4103,0.1056],[0.4007,0.1278],[0.3952,0.1736],[0.3924,0.1764],[0.3924,0.1903],[0.4007,0.2083],[0.3862,0.2278],[0.3848,0.25],[0.3972,0.3014],[0.3993,0.3403],[0.4048,0.3681],[0.4055,0.4292],[0.4124,0.4639],[0.4193,0.4792],[0.42,0.4986],[0.4379,0.4736],[0.4641,0.4542],[0.5828,0.4458],[0.5897,0.4653],[0.5952,0.4625],[0.6159,0.4792],[0.6421,0.4819],[0.66,0.5056],[0.6938,0.5139],[0.7152,0.5417],[0.7331,0.5444],[0.7131,0.4833],[0.7138,0.4514],[0.7359,0.4042],[0.7503,0.3833],[0.7545,0.3472],[0.8103,0.2361],[0.8103,0.2236],[0.8,0.2083],[0.7614,0.2069],[0.7352,0.1819],[0.731,0.1875],[0.7338,0.1764],[0.7276,0.1597],[0.7241,0.1153],[0.7117,0.0569],[0.7179,0.0417],[0.7324,0.0389],[0.7414,0.0]]);
const inCut = (cut, u, v) => {
  let c = false;
  for (let i = 0, j = cut.length - 1; i < cut.length; j = i++) {
    const [xi, yi] = cut[i], [xj, yj] = cut[j];
    if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

export const isWildRegion = (regionIndex) => regionIndex === WILD_REGION;

let _here = false;
let _ring = 0;
let _kind = null;
export function setWildHere(on, ring = 0, kind = WILD_KIND) {
  _here = !!on; _ring = _here ? Math.max(1, Math.min(WILD_RINGS, ring | 0 || WILD_RINGS)) : 0; _kind = _here ? (kind || WILD_KIND) : null;
  setCromwarkCombatHere(cromwarkPeace(_kind), _ring);
}
export const wildHere = () => _here;
export const wildRing = () => _ring;
export const wildZoneKind = () => _kind;

export const WILD_KIND = 'wroth';
/** @type {Map<string, Record<string, any>>} */
const _kindWords = new Map();
export function registerZoneWords(kind, words) { _kindWords.set(kind, words); }
export const zoneWord = (key, kind = _kind) => (kind ? _kindWords.get(kind)?.[key] : undefined) ?? WILD_TEXT[key];
export const zoneName = (kind = _kind) => (kind ? _kindWords.get(kind)?.name : undefined) ?? WILD_NAME;
export const zoneRingName = (ring, kind = _kind) => ((kind ? _kindWords.get(kind)?.ringName : undefined) ?? wildRingName)(ring);
let _mask = null;
export function setWildMask(mask) { _mask = mask ?? null; }
export const wildMask = () => _mask;

export function buildWildMask({ width, height, regionAt, nearPx = WILD_NEAR_PX, keepOut = [], cut = WILD_CUT }) {
  const inside = new Uint8Array(width * height);
  const region = new Uint8Array(width * height);
  let rx0 = width, ry0 = height, rx1 = -1, ry1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (regionAt(x, y) !== WILD_REGION) continue;
      region[y * width + x] = 1;
      if (x < rx0) rx0 = x; if (x > rx1) rx1 = x; if (y < ry0) ry0 = y; if (y > ry1) ry1 = y;
    }
  }
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = ry0; y <= ry1; y++) {
    for (let x = rx0; x <= rx1; x++) {
      if (!region[y * width + x]) continue;
      if (cut && !inCut(cut, (x + 0.5 - rx0) / (rx1 - rx0 + 1), (y + 0.5 - ry0) / (ry1 - ry0 + 1))) continue;
      inside[y * width + x] = 1;
    }
  }
  if (keepOut.length) {
    const run = new Uint16Array(width * height);
    for (let y = ry0; y <= ry1; y++) for (let x = rx0, n = 0; x <= rx1; x++) { const i = y * width + x; n = inside[i] ? n + 1 : 0; run[i] = n; }
    let shift = 0;
    for (const k of keepOut) {
      for (let y = k.y - WILD_KEEPOUT_PX; y <= k.y + WILD_KEEPOUT_PX; y++) {
        for (let x = k.x - WILD_KEEPOUT_PX; x <= k.x + WILD_KEEPOUT_PX; x++) {
          if (x >= 0 && y >= 0 && x < width && y < height) shift = Math.max(shift, run[y * width + x]);
        }
      }
    }
    if (shift > 0) for (let i = 0; i < run.length; i++) if (inside[i] && run[i] <= shift) inside[i] = 0;
  }
  for (let y = ry0; y <= ry1; y++) {
    for (let x = rx0; x <= rx1; x++) {
      if (!inside[y * width + x]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const near = new Uint8Array(width * height);
  if (x1 >= 0) {
    const bx0 = Math.max(0, x0 - nearPx), bx1 = Math.min(width - 1, x1 + nearPx);
    const by0 = Math.max(0, y0 - nearPx), by1 = Math.min(height - 1, y1 + nearPx);
    const row = new Uint8Array(width * height);
    for (let y = y0; y <= y1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        let hit = 0;
        for (let k = Math.max(0, x - nearPx); k <= Math.min(width - 1, x + nearPx) && !hit; k++) hit = inside[y * width + k];
        row[y * width + x] = hit;
      }
    }
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        let hit = 0;
        for (let k = Math.max(0, y - nearPx); k <= Math.min(height - 1, y + nearPx) && !hit; k++) hit = row[k * width + x];
        near[y * width + x] = hit;
      }
    }
  }
  const depth = new Uint16Array(width * height);
  let maxDepth = 0;
  if (x1 >= 0) {
    const BIG = 65000;
    const D = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : depth[y * width + x]);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) depth[y * width + x] = inside[y * width + x] ? BIG : 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x;
        if (!depth[i]) continue;
        depth[i] = Math.min(depth[i], D(x - 1, y) + 3, D(x, y - 1) + 3, D(x - 1, y - 1) + 4, D(x + 1, y - 1) + 4);
      }
    }
    for (let y = y1; y >= y0; y--) {
      for (let x = x1; x >= x0; x--) {
        const i = y * width + x;
        if (!depth[i]) continue;
        depth[i] = Math.min(depth[i], D(x + 1, y) + 3, D(x, y + 1) + 3, D(x + 1, y + 1) + 4, D(x - 1, y + 1) + 4);
        if (depth[i] > maxDepth) maxDepth = depth[i];
      }
    }
  }
  return {
    width, height, inside, region, near, depth, maxDepth, box: x1 >= 0 ? { x0, y0, x1, y1 } : null,
    regionBox: rx1 >= 0 ? { x0: rx0, y0: ry0, x1: rx1, y1: ry1 } : null,
  };
}

/**
 * @param {any} mask
 * @param {(x: number, y: number) => boolean} isRegion
 * @param {number} width
 * @param {number} height
 */
export function wildPictureZone(mask, isRegion, width, height) {
  const rb = mask?.regionBox;
  if (!rb) return () => false;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isRegion(x, y)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return () => false;
  const sx = (rb.x1 - rb.x0 + 1) / (x1 - x0 + 1), sy = (rb.y1 - rb.y0 + 1) / (y1 - y0 + 1);
  return (x, y) => isRegion(x, y) && wildInside(mask, rb.x0 + (x - x0 + 0.5) * sx, rb.y0 + (y - y0 + 0.5) * sy);
}

export function wildRingAt(x, y, mask = _mask) {
  if (!mask?.depth || !mask.maxDepth) return wildInside(mask, x, y) ? WILD_RINGS : 0;
  const px = Math.floor(x), py = Math.floor(y);
  if (!(px >= 0 && py >= 0 && px < mask.width && py < mask.height)) return 0;
  const d = mask.depth[py * mask.width + px];
  if (!d) return 0;
  return Math.max(1, Math.min(WILD_RINGS, Math.ceil((d / mask.maxDepth) * WILD_RINGS)));
}

const _masks = new WeakMap();
export const WILD_KEEPOUT_TOWNS = Object.freeze(['Wrothgaria']);
export const WILD_KEEPOUT_PX = 2;
export function wildMaskOf(maps, width = 1000, height = 500) {
  if (!maps || typeof maps.getRegionIndexAt !== 'function') return null;
  const had = _masks.get(maps);
  if (had) return had;
  const keep = [];
  for (const name of WILD_KEEPOUT_TOWNS) {
    try {
      const loc = maps.getLocationByName?.(WILD_NAME, name);
      const t = loc?.mapTableData;
      if (t && Number.isFinite(t.longitude) && Number.isFinite(t.latitude)) keep.push({ x: Math.trunc(t.longitude / 128), y: 499 - Math.trunc(t.latitude / 128) });
    } catch { }
  }
  const m = buildWildMask({ width, height, regionAt: (x, y) => maps.getRegionIndexAt(x, y), keepOut: keep });
  _masks.set(maps, m);
  return m;
}
const at = (mask, field, x, y) => {
  if (!mask) return false;
  const px = Math.floor(x), py = Math.floor(y);
  if (!(px >= 0 && py >= 0 && px < mask.width && py < mask.height)) return false;
  return mask[field][py * mask.width + px] === 1;
};
export const wildInside = (mask, x, y) => at(mask, 'inside', x, y);
export const wildNear = (mask, x, y) => at(mask, 'near', x, y);

export function wildEdgeChains(mask, within = null) {
  if (!mask?.box) return [];
  const { width, inside } = mask;
  const isIn = within
    ? (x, y) => x >= 0 && y >= 0 && x < mask.width && y < mask.height && inside[y * width + x] === 1 && within(x, y)
    : (x, y) => x >= 0 && y >= 0 && x < mask.width && y < mask.height && inside[y * width + x] === 1;
  /** @type {Map<string, Array<[number, number]>>} */
  const from = new Map();
  const add = (ax, ay, bx, by) => {
    const k = `${ax},${ay}`;
    const list = from.get(k);
    if (list) list.push([bx, by]); else from.set(k, [[bx, by]]);
  };
  const { x0, y0, x1, y1 } = mask.box;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!isIn(x, y)) continue;
      if (!isIn(x, y - 1)) add(x, y, x + 1, y);
      if (!isIn(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!isIn(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!isIn(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  const chains = [];
  const take = (k) => {
    const list = from.get(k);
    if (!list?.length) return null;
    const next = list.pop();
    if (!list.length) from.delete(k);
    return next;
  };
  while (from.size) {
    const startKey = from.keys().next().value;
    const [sx, sy] = startKey.split(',').map(Number);
    const chain = [{ x: sx, y: sy }];
    let k = startKey;
    for (;;) {
      const n = take(k);
      if (!n) break;
      const last = chain[chain.length - 1], prev = chain[chain.length - 2];
      if (prev && (prev.x === last.x && last.x === n[0] || prev.y === last.y && last.y === n[1])) chain[chain.length - 1] = { x: n[0], y: n[1] };
      else chain.push({ x: n[0], y: n[1] });
      k = `${n[0]},${n[1]}`;
      if (k === startKey) break;
    }
    if (chain.length > 1) chains.push(chain);
  }
  return chains;
}

export const wildRingChains = (mask, ring) => wildEdgeChains(mask, (x, y) => wildRingAt(x, y, mask) >= ring);

export function wildRingAnchors(mask) {
  if (!mask?.box || !mask.maxDepth) return [];
  const { x0, y0, x1, y1 } = mask.box;
  const sum = Array.from({ length: WILD_RINGS + 1 }, () => ({ x: 0, y: 0, n: 0 }));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const r = wildRingAt(x, y, mask); if (r) { sum[r].x += x + 0.5; sum[r].y += y + 0.5; sum[r].n++; } }
  const heart = sum[WILD_RINGS].n ? { x: sum[WILD_RINGS].x / sum[WILD_RINGS].n, y: sum[WILD_RINGS].y / sum[WILD_RINGS].n } : null;
  const out = [];
  if (heart) out.push({ ring: WILD_RINGS, x: heart.x, y: heart.y });
  for (let r = WILD_RINGS - 1; r >= 1; r--) {
    let at = null;
    if (heart) {
      const cx = Math.floor(heart.x);
      let a = -1, b = -1;
      for (let y = Math.floor(heart.y); y >= y0; y--) { if (wildRingAt(cx, y, mask) === r) { if (b < 0) b = y; a = y; } else if (b >= 0) break; }
      if (b >= 0) at = { x: cx + 0.5, y: (a + b + 1) / 2 };
    }
    if (!at && sum[r].n) at = { x: sum[r].x / sum[r].n, y: sum[r].y / sum[r].n };
    if (at) out.push({ ring: r, ...at });
  }
  return out;
}

export function wildJourney({ from, to, mask, now = Date.now(), lastAt = null, gold = 0 }) {
  if (!mask || !from || !to) return { ok: true, fee: 0 };
  const a = wildInside(mask, from.x, from.y), b = wildInside(mask, to.x, to.y);
  if (!a && !b) return { ok: true, fee: 0 };
  if (a !== b) return { ok: false, text: a ? WILD_TEXT.travelOut : WILD_TEXT.travelIn };
  const wait = Number.isFinite(lastAt) ? WILD_TRAVEL_COOLDOWN_MS - (now - lastAt) : 0;
  if (wait > 0) return { ok: false, text: WILD_TEXT.travelWait(Math.ceil(wait / 60_000)) };
  const fee = wildTravelFee(wildRingAt(to.x, to.y, mask));
  if (!(gold >= fee)) return { ok: false, text: WILD_TEXT.travelPoor(fee) };
  return { ok: true, fee };
}

export const WILD_PARTY_TRUCE_MS = 10 * 60_000;
export function createPartyTruce(ms = WILD_PARTY_TRUCE_MS) {
  let was = new Set();
  const until = new Map();
  return {
    frame(peers, now) {
      const gone = [];
      for (const id of was) if (!peers.has(id)) { until.set(id, now + ms); gone.push(id); }
      for (const id of peers) until.delete(id);
      for (const [id, t] of until) if (t <= now) until.delete(id);
      was = new Set(peers);
      return gone;
    },
    holds: (id, now) => (until.get(id) ?? 0) > now,
  };
}

export const WILD_TEXT = Object.freeze({
  get enter() { if (cromwarkPeace(WILD_KIND)) return t('wild.cromwark.enter', 'You enter the reach of Cromwark. Rodney\'s monsters roam these mountains, four times as strong. Die here and you wake outside.'); return t('wild.zone.enter', 'You enter the {zone}, an open PvP zone. Foes here are four times as strong. If another player kills you, you drop what you carry.', { zone: WILD_NAME }); },
  leave: `You leave the ${WILD_NAME}.`,
  get chip() { return cromwarkPeace(WILD_KIND) ? t('wild.cromwark.chip', 'Cromwark') : 'Open PvP'; },
  get chipTip() { if (cromwarkPeace(WILD_KIND)) return t('wild.cromwark.chipTip', 'The reach of Cromwark: foes are four times as strong, stronger toward the heart. From the Passes inward a purple haze makes them hit harder every minute you stay. Kills may drop Dusk Tokens. Die here and you wake outside.'); return t('wild.zone.chipTip', '{zone}: other players may attack you. Foes are four times as strong and drop up to twice the loot (25% more at the edge, twice in the heart). If another player kills you, you drop what you carry.', { zone: WILD_NAME }); },
  get mapKey() { return cromwarkPeace(WILD_KIND) ? t('wild.cromwark.mapKey', 'Reach of Cromwark') : 'Open PvP zone'; },
  deathPvp: (name) => `${name || 'Another player'} may claim one piece of your worn gear.`,
  deathDrop: (n) => (n > 0 ? `${n} ${n === 1 ? 'thing you carried lies' : 'things you carried lie'} where you fell, for ten minutes.` : ''),
  deathKept: () => t('wild.death.kept', 'Nothing dropped. Only another player\'s kill drops what you carry.'),
  deathBurnt: (n) => (n > 0 ? t('wild.death.burnt', '{n, plural, one {# thing you carried was} other {# things you carried were}} lost where you fell. This character\'s trading is frozen, so nothing is left for anyone to take.', { n }) : ''),
  deathLettersTenth: (gold) => (gold > 0 ? t('wild.death.lettersTenth', 'A tenth of your letters of credit, {gold} gold, lies where you fell.', { gold: Number(gold).toLocaleString('en-US') }) : ''),
  deathLetters: (n, gold) => (n > 0 ? t('wild.death.letters', '{n, plural, one {A letter} other {# letters}} of credit worth {gold} gold left your wallet.', { n, gold: Number(gold).toLocaleString('en-US') }) : ''),
  deathClaim: (name, item) => `${name || 'Another player'} took your ${item || 'gear'}.`,
  deathHeld: (name, item) => (name
    ? t('wild.escrow.deathHeld', '{name} claimed your {item}. It is held until they collect it, and comes back to you if they do not.', { name, item: item || t('wild.escrow.gear', 'gear') })
    : t('wild.escrow.deathHeldAnon', 'Another player claimed your {item}. It is held until they collect it, and comes back to you if they do not.', { item: item || t('wild.escrow.gear', 'gear') })),
  heldNote: (name, item, min) => (name
    ? t('wild.escrow.heldNote', 'Your {item} is held for {name}. If they do not collect it within {min, plural, one {# minute} other {# minutes}}, it comes back to you.', { name, item: item || t('wild.escrow.gear', 'gear'), min })
    : t('wild.escrow.heldNoteAnon', 'Your {item} is held for your killer. If they do not collect it within {min, plural, one {# minute} other {# minutes}}, it comes back to you.', { item: item || t('wild.escrow.gear', 'gear'), min })),
  heldBack: (item) => t('wild.escrow.heldBack', 'Your {item} has come back to you. It was never collected.', { item: item || t('wild.escrow.gear', 'gear') }),
  heldTaken: (name, item) => (name
    ? t('wild.escrow.heldTaken', '{name} collected your {item}.', { name, item: item || t('wild.escrow.gear', 'gear') })
    : t('wild.escrow.heldTakenAnon', 'Your killer collected your {item}.', { item: item || t('wild.escrow.gear', 'gear') })),
  collected: (item) => t('wild.escrow.collected', 'You take {item}.', { item }),
  collectLate: () => t('wild.escrow.collectLate', 'That piece was no longer held for you.'),
  get deathHold() { return cromwarkPeace(WILD_KIND) ? t('wild.cromwark.deathHold', 'You wake outside the reach of Cromwark.') : 'In the mountains the dead wait two minutes.'; },
  remainsName: (name) => (name ? `${name}'s remains` : 'Remains'),
  mine: 'Your remains',
  taken: 'Someone took that first.',
  gone: 'The body gives nothing up.',
  picked: (name, item) => `You take ${item} from ${name || 'the body'}.`,
  chosen: (name, item) => `You choose ${item} from ${name || 'the body'}. It comes to you from their remains.`,
  lostPiece: (name, item) => `${name || 'Your killer'} took your ${item}.`,
  dropLate: 'What you dropped when you died in the mountains has left your pack. It lies where you fell.',
  burntLate: () => t('wild.death.burntLate', 'What you dropped when you died in the mountains has left your pack. This character\'s trading is frozen, so it was lost.'),
  noFight: 'You cannot attack a member of your party.',
  truce: `No longer in your party. In the ${WILD_NAME} you and they cannot fight for ten minutes. Then you are strangers.`,
  get walkInto() { return cromwarkPeace(WILD_KIND) ? t('wild.cromwark.walkInto', 'It leads into the reach of Cromwark. The monsters there are deadly.') : `It leads into the ${WILD_NAME}, an open PvP zone. Other players may kill you there and take what you carry.`; },
  get unstuckOut() { return t('wild.zone.unstuckOut', '/unstuck does not work outdoors in the mountains.'); },
  get revenantOne() { return t('wild.zone.revenantOne', 'Only one revenant may walk at your side in the Wrothgarian Mountains.'); },
  stranger: 'Stranger',
  strangerNear: (m) => `A stranger is near: ${Math.max(10, Math.round(m / 10) * 10)} m.`,
  travelIn: `No fast travel into the ${WILD_NAME}. Cross its edge on foot or on horseback (the Overworld map).`,
  travelOut: `No fast travel out of the ${WILD_NAME}. Walk or ride out (the Overworld map).`,
  travelWait: (min) => `The mountain carriages run every ten minutes. The next leaves in ${min} minute${min === 1 ? '' : 's'}.`,
  travelPoor: (fee) => `A journey inside the ${WILD_NAME} costs ${fee.toLocaleString('en-US')} gold here.`,
  travelPaid: (fee) => `You pay ${fee.toLocaleString('en-US')} gold for the mountain road.`,
  companionStays: (name) => t('wild.companion.stays', '{name} stays at your side until you leave the {zone}.', { zone: zoneName(), name: name || t('wild.companion.yours', 'your companion') }),
  companionAway: (name) => t('wild.companion.away', '{name} is waiting outside the {zone}. Come out to hand over gear.', { zone: zoneName(), name: name || t('wild.companion.yoursFirst', 'Your companion') }),
  companionLeft: (name, n) => t('wild.companion.left', '{name} hands you {n, plural, one {# item} other {# items}} before leaving.', { zone: zoneName(), name: name || t('wild.companion.yoursFirst', 'Your companion'), n }),
  ring: (r) => (cromwarkPeace(WILD_KIND) ? (r >= 2 ? t('wild.cromwark.ringHaze', '{ring}: the purple haze. The longer you stay, the harder they hit.', { ring: wildRingName(r) }) : t('wild.cromwark.ring', '{ring}.', { ring: wildRingName(r) })) : `${wildRingName(r)}: ${wildRingBonus(r)}.`),
  ringCross: (r, deeper) => (cromwarkPeace(WILD_KIND) ? `${deeper ? t('wild.cromwark.deeper', 'Deeper') : t('wild.cromwark.backOut', 'Back out')}: ${WILD_TEXT.ring(r)}` : `${deeper ? 'Deeper' : 'Back out'} - ${wildRingName(r)}: ${wildRingBonus(r)}.`),
});

export function wildLootOpts(opts = {}, ring = WILD_RINGS) {
  const m = wildRingLoot(ring);
  return { ...opts, lootDropMult: (opts.lootDropMult ?? 1) * m, lootQualityMult: (opts.lootQualityMult ?? 1) * m };
}
export const wildFoeLoot = (entity) => (entity?.wildFoe ? wildRingLoot(entity.wildRing) : 1);
export function wildPileMore(items, roll, ring = WILD_RINGS, rand = Math.random) {
  const extra = wildRingLoot(ring) - 1;
  if (Array.isArray(items) && typeof roll === 'function' && (extra >= 1 || rand() < extra)) {
    const more = roll();
    if (Array.isArray(more)) items.push(...more);
  }
  return items;
}

export function applyWildFoe(entity, { own = true, ring = WILD_RINGS } = {}) {
  if (!entity || entity.wildFoe) return false;
  entity.wildFoe = true;
  entity.wildRing = Math.max(1, Math.min(WILD_RINGS, ring | 0 || WILD_RINGS));
  if (cromwarkPeace(_kind)) { entity.wildTierMult = 1; return true; }
  const tier = wildRingTier(entity.wildRing);
  entity.wildTierMult = tier;
  if (own) {
    entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * WILD_FOE_HEALTH_MULT * tier));
    entity.health = entity.maxHealth;
    entity.healthMult = (entity.healthMult ?? 1) * WILD_FOE_HEALTH_MULT * tier;
  }
  const prior = Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1;
  entity.damageScale = prior * WILD_FOE_DAMAGE_MULT * tier;
  return true;
}

let _death = null;
let _killed = false;
let _fell = null;
export function setWildDeath(d) {
  const served = d ? Math.min(WILD_DEATH_HOLD_S, Math.max(0, Number(d.served ?? _death?.served) || 0)) : 0;
  if (!d) { _killed = false; _fell = null; }
  else if (d.kill === true || (typeof d.killer === 'string' && d.killer)) _killed = true;
  _death = d ? { killer: typeof d.killer === 'string' && d.killer ? d.killer : null, kill: _killed, dropped: Math.max(0, d.dropped | 0), claimed: typeof d.claimed === 'string' && d.claimed ? d.claimed : null, held: d.held === true,
    burnt: Math.max(0, d.burnt | 0), letters: wildLettersOf(d.letters), kind: d.kind ?? _death?.kind ?? _kind ?? WILD_KIND } : null;
  if (_death) _death.served = served;
}
export function wildLettersOf(/** @type {any} */ items) {
  const l = (Array.isArray(items) ? items : []).filter(isLetterOfCredit);
  const tenth = Math.max(0, Math.floor(Number(items?.letters?.gold) || 0));
  return { n: l.length, gold: l.reduce((g, it) => g + (Number.isSafeInteger(it.value) && it.value > 0 ? it.value : 0), 0), ...(tenth > 0 ? { tenth } : {}) };
}
export const wildDeath = () => _death;
export function wildDeathAtHand(/** @type {any} */ fell, /** @type {string | null | undefined} */ name) {
  _fell = fell ?? _fell;
  _killed = true;
  if (_death) _death = { ..._death, kill: true, killer: _death.killer ?? (typeof name === 'string' && name ? name : null) };
}
export const wildDeathKill = () => _killed;
export const wildFallHeard = () => _fell;
export function wildDeathLines(d = _death) {
  if (!d) return [];
  if (cromwarkPeace(d.kind ?? WILD_KIND)) return [zoneWord('deathHold', WILD_KIND)];
  return [d.killer || d.kill ? (d.claimed ? (d.held ? WILD_TEXT.deathHeld : WILD_TEXT.deathClaim)(d.killer, d.claimed) : WILD_TEXT.deathPvp(d.killer)) : WILD_TEXT.deathKept(), WILD_TEXT.deathDrop(d.dropped),
    WILD_TEXT.deathBurnt(d.burnt ?? 0), WILD_TEXT.deathLetters(d.letters?.n ?? 0, d.letters?.gold ?? 0), WILD_TEXT.deathLettersTenth(d.letters?.tenth ?? 0), zoneWord('deathHold', d.kind ?? WILD_KIND)].filter(Boolean);
}
