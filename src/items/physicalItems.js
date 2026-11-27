// @ts-check
// Rules of the vendored Physical Items mod, read from its compiled assembly: categories, sizes, scatter, and physics.
// The scene half is physicalItemsLayer.js.
import { RARITIES, rarityOf, lootRarityOn } from './lootRarity.js';
import { tierColour } from '../render/spoilsGlow.js';
import { modSetting } from '../mods/modSettings.js';
import { TEMPLATES, isPotion } from './useItem.js';
import { CANNOT_REMOVE_ITEM_TEXT } from './createItem.js';
import { insideUnitCircle } from '../world/passiveFish.js';
import { rangeFloat } from './unleveledLoot.js';
import { planStore, applyTransfer, isKeptSpellbook, SPELLBOOK_KEPT_TEXT } from './itemTransfer.js';
import { lockRefuses, lockedText } from './itemLock.js';
import { boundRefusesPut, boundText, isPackOnly, packOnlyText } from './itemBound.js';
import { bagMayLeave } from '../professions/materialsBag.js';
import { itemLongName } from './itemInfo.js';

export const PHYSICAL_ITEMS_VENDOR = 'physical-items';

export const PI_CATEGORIES = Object.freeze(['Weapons', 'Arrows', 'Armor', 'Clothing', 'Ingredients', 'Gold', 'Potions', 'Books',
  'Gems', 'Jewellery', 'Maps', 'Magic Items', 'Religious Items', 'Quest Items', 'Transportation', 'Other Items']);

export const PI_GROUP_CATEGORY = Object.freeze({
  Armor: 'Armor', Weapons: 'Weapons', MagicItems: 'Magic Items', Artifacts: 'Magic Items',
  MensClothing: 'Clothing', WomensClothing: 'Clothing', Books: 'Books', ReligiousItems: 'Religious Items', Maps: 'Maps',
  Gems: 'Gems', PlantIngredients1: 'Ingredients', PlantIngredients2: 'Ingredients', CreatureIngredients1: 'Ingredients',
  CreatureIngredients2: 'Ingredients', CreatureIngredients3: 'Ingredients', MiscellaneousIngredients1: 'Ingredients',
  MetalIngredients: 'Ingredients', MiscellaneousIngredients2: 'Ingredients', Transportation: 'Transportation',
  Jewellery: 'Jewellery', QuestItems: 'Quest Items', Currency: 'Gold',
});

export function itemCategory(item) {
  if (!item) return 'Other Items';
  if (isPotion(item)) return 'Potions';
  if (item.group === 'Weapons') return item.templateIndex === TEMPLATES.Arrow ? 'Arrows' : 'Weapons';
  if (item.group === 'MiscItems') return item.templateIndex === TEMPLATES.Map ? 'Maps' : 'Other Items';
  return PI_GROUP_CATEGORY[item.group] ?? 'Other Items';
}

export const PI_DEFAULT_HEIGHT = Object.freeze({ weapon: 0.8, arrow: 0.32, armor: 0.65, clothing: 0.52, other: 0.4 });
export function defaultWorldHeight(item) {
  switch (itemCategory(item)) {
    case 'Weapons': return PI_DEFAULT_HEIGHT.weapon;
    case 'Arrows': return PI_DEFAULT_HEIGHT.arrow;
    case 'Armor': return PI_DEFAULT_HEIGHT.armor;
    case 'Clothing': return PI_DEFAULT_HEIGHT.clothing;
    default: return PI_DEFAULT_HEIGHT.other;
  }
}

export const PI_WEAPON_SIZE_KEYS = Object.freeze({ 113: 'Dagger', 114: 'Tanto', 115: 'Staff', 116: 'Shortsword', 117: 'Wakazashi',
  118: 'Broadsword', 119: 'Saber', 120: 'Longsword', 121: 'Katana', 122: 'Claymore', 123: 'Dai Katana', 124: 'Mace',
  125: 'Flail', 126: 'Warhammer', 127: 'Battle Axe', 128: 'War Axe', 129: 'Short Bow', 130: 'Long Bow', 131: 'Arrow' });
export const PI_ARMOR_SIZE_KEYS = Object.freeze({ 102: 'Cuirass', 103: 'Gauntlets', 104: 'Greaves', 105: 'Pauldrons',
  106: 'Pauldrons', 107: 'Helm', 108: 'Boots', 109: 'Buckler', 110: 'Round Shield', 111: 'Kite Shield', 112: 'Tower Shield' });

export const PI_SIZE_MIN = 0.1, PI_SIZE_MAX = 1.5, PI_IMPULSE_MAX_PCT = 400, PI_IMPULSE_DEFAULT = 2;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {(key: string) => any} [read] */
export function readPhysicalItemsSettings(read = (key) => modSetting(PHYSICAL_ITEMS_VENDOR, key)) {
  const pct = read('Enemy Loot.Impulse Strength');
  // Clamps first, so an infinite value clamps to an end; only NaN falls back to the default.
  const impulse = typeof pct === 'number' && !Number.isNaN(pct) ? clamp(pct, 0, PI_IMPULSE_MAX_PCT) / 100 : PI_IMPULSE_DEFAULT;
  const disabled = new Set();
  const heights = new Map();
  for (const c of PI_CATEGORIES) {
    if (read(`Enemy Categories.${c}`) === false) disabled.add(c);
    const h = read(`Item Sizes.${c}`);
    if (finite(h)) heights.set(c, clamp(h, PI_SIZE_MIN, PI_SIZE_MAX));
  }
  const overrides = new Map();
  for (const [section, group, table] of [['Weapon Sizes', 'Weapons', PI_WEAPON_SIZE_KEYS], ['Armor Sizes', 'Armor', PI_ARMOR_SIZE_KEYS]]) {
    for (const name of new Set(Object.values(table))) {
      const v = read(`${section}.${name}`);
      if (finite(v) && v > 0) overrides.set(`${group}:${name}`, clamp(v, PI_SIZE_MIN, PI_SIZE_MAX));
    }
  }
  return { enemyDrops: read('Enemy Loot.Physical Enemy Drops') !== false, impulse, disabled, heights, overrides };
}

export function worldHeight(item, settings = null) {
  if (item && (item.group === 'Weapons' || item.group === 'Armor')) {
    const name = (item.group === 'Weapons' ? PI_WEAPON_SIZE_KEYS : PI_ARMOR_SIZE_KEYS)[item.templateIndex];
    const o = name ? settings?.overrides?.get(`${item.group}:${name}`) : undefined;
    if (finite(o)) return o;
  }
  const h = settings?.heights?.get(itemCategory(item));
  return finite(h) ? h : defaultWorldHeight(item);
}

export const showsOnCorpse = (item, settings) => !!item && settings?.enemyDrops !== false && !settings?.disabled?.has(itemCategory(item));

export const PI_ALPHA_VISIBLE = 128;
/**
 * @param {ArrayLike<number>} colors
 * @param {number} width
 * @param {number} height
 */
export function visibleBox(colors, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (colors[(y * width + x) * 4 + 3] < PI_ALPHA_VISIBLE) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < x0 || y1 < y0) return { x: 0, y: 0, w: width, h: height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export function hasVisible(colors) {
  for (let i = 3; i < colors.length; i += 4) if (colors[i] >= PI_ALPHA_VISIBLE) return true;
  return false;
}
export function cropTo(colors, width, box) {
  const out = new Uint8ClampedArray(box.w * box.h * 4);
  const view = typeof (/** @type {any} */ (colors)).subarray === 'function';
  for (let y = 0; y < box.h; y++) {
    const s = ((box.y + y) * width + box.x) * 4;
    out.set(view ? /** @type {any} */ (colors).subarray(s, s + box.w * 4) : Array.prototype.slice.call(colors, s, s + box.w * 4), y * box.w * 4);
  }
  return out;
}
// Both image sources give transparent texels as black, and mipmaps blend that black into a dark outline.
// Each unowned texel takes the color of its owned neighbors and keeps its alpha.
/**
 * @param {Uint8ClampedArray} c
 * @param {number} w
 * @param {number} h
 */
export function bleedEdges(c, w, h, passes = 2) {
  const owned = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) owned[i] = c[i * 4 + 3] >= PI_ALPHA_VISIBLE ? 1 : 0;
  for (let p = 0; p < passes; p++) {
    const fill = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (owned[y * w + x]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx, Y = y + dy;
            if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && owned[Y * w + X]) { const j = (Y * w + X) * 4; r += c[j]; g += c[j + 1]; b += c[j + 2]; n++; }
          }
        }
        if (n) fill.push(y * w + x, r / n, g / n, b / n);
      }
    }
    if (!fill.length) break;
    for (let k = 0; k < fill.length; k += 4) { const i = fill[k]; c[i * 4] = fill[k + 1]; c[i * 4 + 1] = fill[k + 2]; c[i * 4 + 2] = fill[k + 3]; owned[i] = 1; }
  }
  return c;
}
export function artworkSize(visW, visH, worldH) {
  const k = worldH / Math.max(visW, visH);
  return { w: visW * k, h: visH * k };
}
export const colliderDepth = (w, h) => Math.max(w, h * 0.4);

export const PI_SCATTER = Object.freeze({ min: 0.45, max: 0.85, up: 0.65 });
export function scatterOffset(rolls = Math.random) {
  let [x, y] = insideUnitCircle(rolls);
  if (x * x + y * y < 1e-4) { x = 1; y = 0; }
  const l = Math.hypot(x, y), r = rangeFloat(PI_SCATTER.min, PI_SCATTER.max, rolls);
  return [(x / l) * r, PI_SCATTER.up, (y / l) * r];
}
export const PI_LAUNCH = Object.freeze({ reach: 0.85, nudge: 0.08, nearShare: 0.75, wobble: 0.1, up: Object.freeze({ min: 0.7, max: 1.1 }) });
export function proxyLaunch(rel, fresh, impulse, rolls = Math.random) {
  const r = fresh ? PI_LAUNCH.reach : PI_LAUNCH.nudge;
  let dx = rel[0], dz = rel[2];
  if (dx * dx + dz * dz < 1e-4) [dx, dz] = insideUnitCircle(rolls);
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  let hx = dx * r, hz = dz * r;
  if (fresh) {
    const s = rangeFloat(r * PI_LAUNCH.nearShare, r, rolls);
    const [wx, wz] = insideUnitCircle(rolls);
    hx = dx * s + wx * PI_LAUNCH.wobble; hz = dz * s + wz * PI_LAUNCH.wobble;
  }
  const up = fresh ? rangeFloat(PI_LAUNCH.up.min, PI_LAUNCH.up.max, rolls) : PI_LAUNCH.nudge;
  const k = fresh ? impulse : 1;
  return [hx * k, up * k, hz * k];
}
export const PI_SPIRAL = Object.freeze({ ahead: 1.1, ring: 0.78, golden: 2.399963140487671, tries: 256, lift: 0.025, overlap: 0.1 });
export const PI_FOOTPRINT = Object.freeze({ min: 0.2, share: 0.6 });
export const dropRadius = (worldH) => Math.max(PI_FOOTPRINT.min, worldH * PI_FOOTPRINT.share);
export const PI_FLOOR_PROBE = Object.freeze({ up: 2, len: 5, floorNormalY: 0.5 });
export const PI_PATH = Object.freeze({ lift: 0.2, skin: 0.05 });
export function nearestFloor(hits, refY) {
  let best = null;
  for (const h of hits) {
    if (!(h.ny >= PI_FLOOR_PROBE.floorNormalY)) continue;
    if (best == null || Math.abs(h.y - refY) < Math.abs(best - refY)) best = h.y;
  }
  return best;
}
export const spiralPoint = (centre, i) => {
  const r = i ? PI_SPIRAL.ring * Math.sqrt(i) : 0, a = i * PI_SPIRAL.golden;
  return [centre[0] + Math.cos(a) * r, centre[1], centre[2] + Math.sin(a) * r];
};
/**
 * @param {number[]} anchor
 * @param {number[]} centre
 * @param {number} radius
 * @param {{ i: number }} next
 * @param {Array<{ pos: number[], r: number }>} placed
 * @param {(p: number[]) => (number|null)} floorAt
 * @param {(a: number[], b: number[]) => boolean} [clear]
 */
export function spiralDrop(anchor, centre, radius, next, placed, floorAt, clear = () => true) {
  for (let t = 0; t < PI_SPIRAL.tries; t++) {
    const p = spiralPoint(centre, next.i++);
    const y = floorAt(p);
    if (!finite(y)) continue;
    const at = [p[0], /** @type {number} */ (y), p[2]];
    if (!clear(anchor, at)) continue;
    if (placed.some((d) => Math.hypot(at[0] - d.pos[0], at[2] - d.pos[2]) < radius + d.r + PI_SPIRAL.overlap)) continue;
    return at;
  }
  return [anchor[0], anchor[1], anchor[2]];
}

export const PI_BODY = Object.freeze({
  gravity: 9.81, dt: 0.02, drag: 0.9, bounce: 0.35, bounceThreshold: 2,
  // Grips average the item material with the default engine material (0.6), as the mod combines them.
  dynamicGrip: (0.45 + 0.6) / 2, staticGrip: (0.55 + 0.6) / 2,
  settleSq: 0.0025, settleS: 0.5, reach: 0.1, flightMaxS: 8,
});
export const PI_SEPARATION = Object.freeze({ maxAcross: 0.65, maxUpDown: 0.5, pad: 0.04, query: 0.08, ground: 0.15, speed: 0.45, ease: 1.5 });
// The ground probe starts just above the foot, so a surface above the item is never its floor.
export const PI_PROBE_LIFT = 0.05;

export function makeBody(pos, vel = [0, 0, 0], half = [0.2, 0.2], h = 0.4) {
  return { pos: [...pos], vel: [...vel], half: [...half], h, settled: false, quietFor: 0, t: 0, acc: 0, grounded: false, nearGround: false };
}
export function settleBody(b) { b.vel[0] = 0; b.vel[1] = 0; b.vel[2] = 0; b.settled = true; b.quietFor = 0; }

/**
 * @param {ReturnType<typeof makeBody>} b
 * @param {(x: number, y: number, z: number) => (number|null)} ground
 * @param {((from: number[], dir: number[], len: number) => (number|null))|null} [wall]
 */
export function stepBody(b, ground, wall = null) {
  if (b.settled) return 'rest';
  const B = PI_BODY, dt = B.dt;
  b.t += dt;
  b.vel[1] -= B.gravity * dt;
  const damp = 1 / (1 + B.drag * dt);
  b.vel[0] *= damp; b.vel[1] *= damp; b.vel[2] *= damp;
  let what = 'fly';
  const sx = b.vel[0] * dt, sz = b.vel[2] * dt, run = Math.hypot(sx, sz);
  if (run > 1e-9) {
    const dir = [sx / run, 0, sz / run];
    const hit = wall ? wall([b.pos[0], b.pos[1] + 0.1, b.pos[2]], dir, run + Math.max(b.half[0], b.half[1])) : null;
    if (finite(hit)) {
      const vn = b.vel[0] * dir[0] + b.vel[2] * dir[2];
      const back = vn >= B.bounceThreshold ? B.bounce * vn : 0;
      b.vel[0] -= dir[0] * (vn + back); b.vel[2] -= dir[2] * (vn + back);
      what = 'bounce';
    } else { b.pos[0] += sx; b.pos[2] += sz; }
  }
  if (b.vel[1] > 0 && wall) {
    const up = wall([b.pos[0], b.pos[1] + b.h, b.pos[2]], [0, 1, 0], b.vel[1] * dt);
    if (finite(up)) { const vn = b.vel[1]; b.vel[1] = vn >= B.bounceThreshold ? -B.bounce * vn : 0; what = 'bounce'; }
  }
  const floor = ground(b.pos[0], b.pos[1] + PI_PROBE_LIFT, b.pos[2]);
  const ny = b.pos[1] + b.vel[1] * dt;
  b.grounded = false;
  if (finite(floor) && ny <= /** @type {number} */ (floor)) {
    const vn = -b.vel[1];
    b.pos[1] = /** @type {number} */ (floor);
    const back = vn >= B.bounceThreshold ? B.bounce * vn : 0;
    b.vel[1] = back;
    const across = Math.hypot(b.vel[0], b.vel[2]);
    if (across > 0) {
      const cut = Math.min(across, B.dynamicGrip * (vn + back));
      b.vel[0] *= (across - cut) / across; b.vel[2] *= (across - cut) / across;
    }
    if (back > 0) what = 'bounce';
    b.grounded = back === 0;
  } else b.pos[1] = ny;
  if (b.grounded && Math.hypot(b.vel[0], b.vel[2]) <= B.staticGrip * B.gravity * dt) { b.vel[0] = 0; b.vel[2] = 0; }
  const near = finite(floor) && b.pos[1] - /** @type {number} */ (floor) <= B.reach;
  b.nearGround = finite(floor) && b.pos[1] - /** @type {number} */ (floor) <= PI_SEPARATION.ground;
  const sq = b.vel[0] * b.vel[0] + b.vel[1] * b.vel[1] + b.vel[2] * b.vel[2];
  if (near && sq <= B.settleSq) {
    b.quietFor += dt;
    if (b.quietFor >= B.settleS) { settleBody(b); return 'rest'; }
  } else b.quietFor = 0;
  if (b.t >= B.flightMaxS) { settleBody(b); return 'rest'; }
  return what;
}
export function flyBody(b, dt, ground, wall = null) {
  let what = 'fly';
  b.acc += Math.max(0, Math.min(0.25, dt));
  while (b.acc >= PI_BODY.dt && !b.settled) {
    b.acc -= PI_BODY.dt;
    const r = stepBody(b, ground, wall);
    if (r === 'rest') what = 'rest';
    else if (r === 'bounce' && what !== 'rest') what = 'bounce';
  }
  return what;
}
// Settled bodies still push others but never move. This writes velocity only; the settle timer belongs to stepBody.
/**
 * @param {Array<ReturnType<typeof makeBody>>} bodies
 * @param {number} dt
 */
export function shoulder(bodies, dt) {
  const S = PI_SEPARATION;
  const cell = (v) => Math.floor(v);
  const grid = new Map();
  bodies.forEach((o, i) => {
    const k = `${cell(o.pos[0])},${cell(o.pos[2])}`;
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(i);
  });
  bodies.forEach((b, bi) => {
    if (b.settled || !b.nearGround) return;
    if (Math.hypot(b.vel[0], b.vel[2]) > S.maxAcross || Math.abs(b.vel[1]) > S.maxUpDown) return;
    let px = 0, pz = 0;
    const cx = cell(b.pos[0]), cz = cell(b.pos[2]);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        for (const oi of grid.get(`${gx},${gz}`) ?? []) {
          if (oi === bi) continue;
          const o = bodies[oi];
          if (Math.abs((b.pos[1] + b.h / 2) - (o.pos[1] + o.h / 2)) >= (b.h + o.h) / 2 + S.query) continue;
          let dx = b.pos[0] - o.pos[0], dz = b.pos[2] - o.pos[2];
          if (Math.abs(dx) >= b.half[0] + o.half[0] + S.pad || Math.abs(dz) >= b.half[1] + o.half[1] + S.pad) continue;
          if (dx * dx + dz * dz < 1e-4) { dx = bi < oi ? -1 : 1; dz = 0; }
          const l = Math.hypot(dx, dz);
          px += dx / l; pz += dz / l;
        }
      }
    }
    if (px * px + pz * pz < 1e-4) return;
    const l = Math.hypot(px, pz), tx = (px / l) * S.speed, tz = (pz / l) * S.speed;
    const ex = tx - b.vel[0], ez = tz - b.vel[2], el = Math.hypot(ex, ez), step = S.ease * dt;
    if (el <= step) { b.vel[0] = tx; b.vel[2] = tz; } else { b.vel[0] += (ex / el) * step; b.vel[2] += (ez / el) * step; }
  });
}

export const PI_CONSTRAIN = Object.freeze({ share: 0.98, skin: 0.01, slides: 3 });
export function constrainMove(from, to, halfW, h, rayHit) {
  const at = [...from];
  if (!rayHit) return [...to];
  let rem = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const skin = halfW * PI_CONSTRAIN.share;
  for (let k = 0; k < PI_CONSTRAIN.slides; k++) {
    const len = Math.hypot(rem[0], rem[1], rem[2]);
    if (!(len * len > 1e-6)) break;
    const dir = [rem[0] / len, rem[1] / len, rem[2] / len];
    const hit = rayHit([at[0], at[1] + h / 2, at[2]], dir, len + skin);
    const n = hit?.normal ?? null;
    const facing = hit && Number.isFinite(hit.dist) && (!n || n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < -0.001);
    if (!facing) { at[0] += rem[0]; at[1] += rem[1]; at[2] += rem[2]; break; }
    const go = Math.max(0, hit.dist - skin - PI_CONSTRAIN.skin);
    at[0] += dir[0] * go; at[1] += dir[1] * go; at[2] += dir[2] * go;
    if (!n) break;
    const left = [to[0] - at[0], to[1] - at[1], to[2] - at[2]];
    const d = left[0] * n[0] + left[1] * n[1] + left[2] * n[2];
    rem = [left[0] - d * n[0], left[1] - d * n[1], left[2] - d * n[2]];
  }
  return at;
}

export const PI_RIM = Object.freeze({ magic: 0.3, rare: 0.45, legendary: 0.6, aetheric: 0.7, artifact: 0.7, gilded: 0.8 });
export function rarityRim(item) {
  if (!lootRarityOn()) return null;
  const tier = rarityOf(item);
  const k = PI_RIM[tier];
  if (!k) return null;
  const c = tierColour(tier);
  return [c[0], c[1], c[2], k];
}
// A list replaced with equal items hands each shown picture to its match instead of throwing the items again.
export const itemLook = (item) => (item && typeof item === 'object'
  ? [item.group, item.templateIndex, item.stackCount ?? 1, item.nativeMaterialValue ?? '', item.dyeColor ?? '', item.rarity ?? '', item.artifact ? 1 : 0, item.name ?? ''].join('|')
  : '');
export const PI_REACH = 3;
export const isRareOrBetter = (item) => lootRarityOn() && (RARITIES[rarityOf(item)]?.rank ?? 0) >= RARITIES.rare.rank;

const _presented = new WeakSet();
export const presentItem = (item, on) => { if (item && typeof item === 'object') { if (on) _presented.add(item); else _presented.delete(item); } };
export const isPresented = (item) => !!item && typeof item === 'object' && _presented.has(item);

// Items leave a body with a throw only at its death; a body met later shows them where they landed.
const _deaths = new WeakMap();
export const PI_FRESH_MS = 4000;
export const markDeath = (entity, at = Date.now()) => { if (entity && typeof entity === 'object') _deaths.set(entity, at); };
export const diedRecently = (entity, at = Date.now()) => { const t = entity && typeof entity === 'object' ? _deaths.get(entity) : undefined; return t !== undefined && at - t <= PI_FRESH_MS; };

export const shiftDropRefusal = (item) => (item?.group === 'Transportation' ? { text: CANNOT_REMOVE_ITEM_TEXT }
  : isKeptSpellbook(item) ? { text: SPELLBOOK_KEPT_TEXT } : null);

/**
 * @param {any} item
 * @param {{ items: any[], entity: any, getQuest?: any, dropRefusal?: (() => (string|null))|null, drop: (list: any[]) => any }} o
 */
export function shiftDrop(item, { items, entity, getQuest = null, dropRefusal = null, drop }) {
  const name = () => itemLongName(item, { getQuest });
  const no = shiftDropRefusal(item);
  if (no) return { refusal: no };
  if (lockRefuses(item, 'drop')) return { refusal: { text: lockedText(name()) } };
  if (isPackOnly(item)) return { refusal: { text: packOnlyText(name()) } };
  if (boundRefusesPut(item, 'elsewhere')) return { refusal: { text: boundText(name(), item) } };
  const dest = [];
  const plan = /** @type {any} */ (planStore(item, { remote: dest, getQuest, groundRefusal: dropRefusal?.() ?? null, bagLoaded: !bagMayLeave(entity) }));
  if (!plan.ok) return { refusal: plan.refusal };
  if (plan.map) return { map: true };
  applyTransfer(item, plan, items, dest, { entity, fromLocal: true });
  if (dest.length) drop(dest);
  return { moved: dest, sound: plan.sound };
}
