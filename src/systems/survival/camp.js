import { addItem } from '../../items/inventory.js';
import { wrapAngle } from '../../world/mat4.js';
import { POSE_BOUND, POSE_Y_BOUND } from '../../net/wire.js';
import { TEMPLATE, foodOf, foodStage, isFood, dressFood } from './food.js';
import { createSurvivalItem, isCampingEquipment, isCampfireKit, isSkillet, SURVIVAL_USE_TEXT } from './items.js';
import { isEmberJar, EMBER_JAR_MINUTES, REST_ITEM_TEXT } from './restItems.js';

// The tent is model 41606 and the fire TEXTURE.210 record 1, as in the camping mod.
export const TENT_MODEL = 41606;
export const FIRE_FLAT = Object.freeze({ archive: 210, record: 1 });
export const FIRE_LIGHT_RANGE = 12;
// The default custom activation reach.
export const CAMP_REACH = 3.2;
export const BY_FIRE_REACH = 4;
export const PLACE_AHEAD = 2.5;
export const TENT_BEHIND = 2.2;
export const GROUND_PROBE = 6;
export const FIRE_MINUTES = 480;
export const COOK_MINUTES = 30;
export const SKILLET_COOK_MINUTES = 15;
// Also the wire's bound. A placing at the cap is never refused: it strikes the owner's oldest camp.
export const CAMPS_PER_OWNER = 4;
export const CAMP_KIND = Object.freeze({ Tent: 'tent', Fire: 'fire' });

export const CAMP_TEXT = Object.freeze({
  noTentBelow: 'There is no room to pitch a tent down here. A fire will do.',
  inWater: 'You cannot make camp in the water.',
  noGround: 'There is no level ground here.',
  struckCamp: 'Your oldest camp is packed away.',
  struckFire: 'Your oldest Campfire is packed away.',
  struckOut: 'Your oldest fire is put out.',
  packedWithBoat: 'Your camp aboard was struck and stowed in your pack.',
  noSpot: 'You cannot find anywhere to make camp.',
  pitched: 'You pitch your tent and light a fire.',
  lit: 'You light a campfire.',
  packed: 'You pack up your camp.',
  stamped: 'You stamp out the fire.',
  notYours: 'This is not your camp to pack.',
  stoked: 'You stoke the fire.',
  cold: 'The fire has burned down to embers.',
  cooked: (name) => `You cook the ${name}.`,
  wornOut: 'Your camping equipment is worn out.',
  nothingToCook: 'You have nothing to cook.',
  seeOwnCamp: 'You see your camp.',
  seeCamp: 'You see a camp.',
  seeOwnFire: 'You see your Campfire.',
  seeFire: 'You see a campfire.',
  seeOwnJar: 'You see your Ember Jar fire.',
  seeJar: 'You see an Ember Jar fire.',
  seeEmbers: 'You see the embers of a fire.',
  seeHearth: 'You see a fire burning.',
  menuRest: 'Rest here',
  restCloser: 'Move closer to the fire to rest here.',
  menuCook: 'Cook food',
  menuStoke: 'Stoke the fire',
  menuPack: 'Pack up the camp',
  menuStamp: 'Put out the fire',
  menuPickUp: 'Pick up the Campfire',
  menuRelight: 'Relight the fire',
  pickedUp: 'You pick up your Campfire.',
  relit: 'You relight the fire.',
  noFuel: 'Your Campfire has no fuel left.',
  outOfFuel: 'Your Campfire burns the last of its fuel.',
  embersOut: 'The embers die out.',
  carriedOut: 'You take your Campfire with you.',
  campWorn: 'Your camping equipment wears through.',
  fuelLeft: (n) => `${n} ${n === 1 ? 'night' : 'nights'} of fuel`,
});

export function campDecision(kind, place = {}) {
  if (place.insideBuilding) return { ok: false, text: SURVIVAL_USE_TEXT.campingIndoors };
  if (place.inTown) return { ok: false, text: SURVIVAL_USE_TEXT.campingTown };
  if (place.enemiesNearby) return { ok: false, text: SURVIVAL_USE_TEXT.campingFoes };
  if (kind === CAMP_KIND.Tent && place.insideDungeon) return { ok: false, text: CAMP_TEXT.noTentBelow };
  if (place.inWater) return { ok: false, text: CAMP_TEXT.inWater };
  if (!Number.isFinite(place.ground)) return { ok: false, text: CAMP_TEXT.noGround };
  return { ok: true, text: null };
}

export function campSpot(feet, yaw, probe) {
  const x = feet[0] + Math.sin(yaw) * PLACE_AHEAD, z = feet[2] + Math.cos(yaw) * PLACE_AHEAD;
  const top = feet[1] + 1;
  const d = probe ? probe([x, top, z], [0, -1, 0], GROUND_PROBE) : null;
  const ground = Number.isFinite(d) && d <= GROUND_PROBE ? top - d : null;
  return { pos: [x, ground ?? feet[1], z], ground };
}

// A camp on a boat stores her number and its point in her deck's frame, and is posed off her each frame;
// the boat object itself never outlives a load.
export const DECK_LOCAL_BOUND = 120;
export const DECK_LOCAL_Y_BOUND = 60;
const ID_OK = /^[A-Za-z0-9_:.-]{1,48}$/;
export function validDeck(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const mine = d.mine === true;
  if (!mine && !(typeof d.peer === 'string' && ID_OK.test(d.peer))) return null;
  if (!Number.isSafeInteger(d.uid) || d.uid < 1) return null;
  const l = d.local;
  if (!Array.isArray(l) || l.length !== 3 || !l.every(Number.isFinite)) return null;
  if (Math.abs(l[0]) > DECK_LOCAL_BOUND || Math.abs(l[2]) > DECK_LOCAL_BOUND || Math.abs(l[1]) > DECK_LOCAL_Y_BOUND) return null;
  if (!Number.isFinite(d.yaw)) return null;
  return { ...(mine ? { mine: true } : { peer: d.peer }), uid: d.uid, local: [l[0], l[1], l[2]], yaw: wrapAngle(d.yaw) };
}
// From the column-major node matrix, with forward as [sin yaw, 0, cos yaw].
export const deckYaw = (m) => Math.atan2(m[8], m[10]);

export const tentPos = (camp) => [camp.pos[0] - Math.sin(camp.yaw) * TENT_BEHIND, camp.pos[1], camp.pos[2] - Math.cos(camp.yaw) * TENT_BEHIND];

export function newCamp({ id, owner = null, kind = CAMP_KIND.Fire, pos, yaw = 0, now = 0, wear = 0 }) {
  return { id: String(id), owner, kind, pos: [pos[0], pos[1], pos[2]], yaw: wrapAngle(yaw), litUntil: now + FIRE_MINUTES, wear: wear | 0, placedAt: now };
}
export const fireLit = (camp, now) => Number.isFinite(camp?.litUntil) && now < camp.litUntil;
export function stokeFire(camp, from) {
  if (!camp) return false;
  if ((camp.wear | 0) <= 0) return false;
  camp.litUntil = Math.max(camp.litUntil ?? 0, from) + FIRE_MINUTES;
  return true;
}
// Only a fire with no fuel of its own (an Ember Jar's, or an old save's kit fire) goes when it burns down.
export const campExpired = (camp, now) => camp?.kind === CAMP_KIND.Fire && !camp.fuel && !fireLit(camp, now);

export const fieldCookKeeps = (camp) => camp?.kind === CAMP_KIND.Fire && !!camp.fuel && !camp.jar;

export function spendCampNight(camp, now, fieldCook = false) {
  if (!camp || (camp.wear | 0) <= 0) return { spent: false, empty: true };
  if (fieldCook && fieldCookKeeps(camp)) return { spent: false, empty: false, kept: true };
  camp.wear = (camp.wear | 0) - 1;
  const empty = camp.wear <= 0;
  if (empty) camp.litUntil = now;
  return { spent: true, empty };
}

export function placeCampItem(item, list, { now = 0, owner = null, feet = [0, 0, 0], yaw = 0, probe = null, place = {}, standing = 0, id = null } = {}) {
  const jar = isEmberJar(item);
  const kind = isCampingEquipment(item) ? CAMP_KIND.Tent : isCampfireKit(item) || jar ? CAMP_KIND.Fire : null;
  if (!kind) return { ok: false, text: null, camp: null, spent: false };
  const strike = Math.max(0, (standing | 0) - CAMPS_PER_OWNER + 1);
  const spot = campSpot(feet, yaw, probe);
  const d = campDecision(kind, { ...place, ground: spot.ground });
  if (!d.ok) return { ok: false, text: d.text, camp: null, spent: false };
  const uses = Math.max(0, item.currentCondition ?? 1);
  if (uses <= 0) return { ok: false, text: kind === CAMP_KIND.Fire ? CAMP_TEXT.noFuel : CAMP_TEXT.wornOut, camp: null, spent: false };
  const camp = newCamp({ id: id ?? `${owner ?? 'me'}:${now}`, owner, kind, pos: spot.pos, yaw, now, wear: jar ? 1 : uses });
  if (jar) {
    camp.jar = true; camp.litUntil = now + EMBER_JAR_MINUTES;
    if ((item.stackCount ?? 1) > 1) item.stackCount -= 1; else { const j = Array.isArray(list) ? list.indexOf(item) : -1; if (j >= 0) list.splice(j, 1); }
    return { ok: true, text: REST_ITEM_TEXT.emberLit, camp, spent: true, strike };
  }
  if (kind === CAMP_KIND.Fire) camp.fuel = true;
  const i = Array.isArray(list) ? list.indexOf(item) : -1;
  if (i >= 0) list.splice(i, 1);
  const text = kind === CAMP_KIND.Tent ? CAMP_TEXT.pitched : CAMP_TEXT.lit;
  return { ok: true, text, camp, spent: false, strike };
}

export function packCamp(camp) {
  const tent = camp?.kind === CAMP_KIND.Tent;
  // A fire with no fuel of its own is stamped out, never turned into a Campfire.
  if (!tent && (camp?.kind !== CAMP_KIND.Fire || !camp.fuel)) return { item: null, text: CAMP_TEXT.stamped };
  const item = createSurvivalItem(tent ? TEMPLATE.CampingEquipment : TEMPLATE.Campfire);
  if (item) item.currentCondition = Math.max(0, Math.min(item.maxCondition ?? camp.wear, camp.wear | 0));
  return { item, text: tent ? CAMP_TEXT.packed : CAMP_TEXT.pickedUp };
}

export function strikeCamp(camp) {
  const { item } = packCamp(camp);
  return { item, text: !item ? CAMP_TEXT.struckOut : camp.kind === CAMP_KIND.Tent ? CAMP_TEXT.struckCamp : CAMP_TEXT.struckFire };
}

export const packSavedFires = (records) => (Array.isArray(records) ? records : [])
  .filter((r) => r?.kind === CAMP_KIND.Fire)
  .map((r) => packCamp(r).item).filter(Boolean);

export const cookables = (items) => (items ?? []).filter((it) => isFood(it) && foodOf(it)?.cooks != null);
export const hasSkillet = (items) => (items ?? []).some(isSkillet);
// The cooked food joins `into` (the pack), never the Materials Bag, which holds materials alone.
export function cookFood(item, list, { skillet = false, into = list } = {}) {
  const f = foodOf(item);
  if (!f?.cooks) return null;
  const rawName = item.name;
  let cooked = createSurvivalItem(f.cooks, { foodStage: Math.max(0, foodStage(item) - 1) });
  if (!cooked) return null;
  dressFood(cooked);
  if (Array.isArray(list)) {
    if ((item.stackCount ?? 1) > 1) item.stackCount -= 1;
    else { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }
    cooked = addItem(Array.isArray(into) ? into : list, cooked);
  }
  return { item: cooked, minutes: skillet ? SKILLET_COOK_MINUTES : COOK_MINUTES, text: CAMP_TEXT.cooked(rawName) };
}

export function nearestFire(camps, pos, now, reach = BY_FIRE_REACH) {
  let best = null, bestD = reach;
  for (const c of camps ?? []) {
    if (!fireLit(c, now)) continue;
    const d = Math.hypot(c.pos[0] - pos[0], c.pos[1] - pos[1], c.pos[2] - pos[2]);
    if (d <= bestD) { best = c; bestD = d; }
  }
  return best;
}
export const byFire = (camps, pos, now) => !!nearestFire(camps, pos, now);
export const tentNear = (camps, pos, reach = BY_FIRE_REACH) => !!pos && (camps ?? []).some((c) => c?.kind === CAMP_KIND.Tent
  && Math.hypot(c.pos[0] - pos[0], c.pos[1] - pos[1], c.pos[2] - pos[2]) <= reach);

export function campInfoText(camp, now, mine) {
  if (camp.kind === CAMP_KIND.Tent) return mine ? CAMP_TEXT.seeOwnCamp : CAMP_TEXT.seeCamp;
  if (!fireLit(camp, now)) return CAMP_TEXT.seeEmbers;
  if (camp.jar) return mine ? CAMP_TEXT.seeOwnJar : CAMP_TEXT.seeJar;
  return mine ? CAMP_TEXT.seeOwnFire : CAMP_TEXT.seeFire;
}
export const canStoke = (camp, now, mine) => !!camp && !!mine && !camp.jar && !fireLit(camp, now) && (camp.wear | 0) > 0
  && (camp.kind === CAMP_KIND.Tent || camp.kind === CAMP_KIND.Fire);
export function campMenu(camp, now, mine, { online = false } = {}) {
  const rows = [{ key: 'rest', text: CAMP_TEXT.menuRest }];
  if (fireLit(camp, now)) rows.push({ key: 'cook', text: CAMP_TEXT.menuCook });
  if (canStoke(camp, now, mine)) rows.push({ key: 'stoke', text: camp.kind === CAMP_KIND.Tent ? CAMP_TEXT.menuStoke : CAMP_TEXT.menuRelight });
  if (mine && !camp.jar && (camp.kind === CAMP_KIND.Tent || !!camp.fuel)) rows.push({ key: 'pack', text: camp.kind === CAMP_KIND.Tent ? CAMP_TEXT.menuPack : CAMP_TEXT.menuPickUp });
  // Online a cold camp is no rest point, so Rest goes, except on your own tent with wear left (its rest stokes it).
  if (online && !fireLit(camp, now)) {
    const stoke = rows.filter((r) => r.key === 'stoke');
    const restable = mine && camp.kind === CAMP_KIND.Tent && (camp.wear | 0) > 0;
    return [...stoke, ...rows.filter((r) => (r.key !== 'rest' || restable) && r.key !== 'stoke')];
  }
  return rows;
}

const ID_RE = /^[A-Za-z0-9_:.-]{1,48}$/;
const q2 = (v) => Math.round(v * 100) / 100;
const q3 = (v) => Math.round(v * 1000) / 1000;
// `j: 1` marks an Ember Jar's fire; the relay ignores it, and a reader without the field sees a plain campfire.
export const campWire = (camp, toWire = (p) => p) => {
  const p = toWire(camp.pos);
  const out = { i: camp.id, k: camp.kind === CAMP_KIND.Tent ? 0 : 1, p: [q2(p[0]), q2(p[1]), q2(p[2])], y: q3(camp.yaw), u: Number.isFinite(camp.litUntil) ? Math.round(camp.litUntil) : -1, w: camp.wear | 0 };
  const d = validDeck(camp.deck);
  if (d) out.d = [d.mine ? '' : d.peer, d.uid, q3(d.local[0]), q3(d.local[1]), q3(d.local[2]), q3(d.yaw)];
  if (camp.jar === true) out.j = 1;
  return out;
};
export function validCampRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (typeof r.i !== 'string' || !ID_RE.test(r.i)) return null;
  if (r.k !== 0 && r.k !== 1) return null;
  if (!Array.isArray(r.p) || r.p.length !== 3 || !r.p.every(Number.isFinite)) return null;
  if (Math.abs(r.p[0]) > POSE_BOUND || Math.abs(r.p[2]) > POSE_BOUND || Math.abs(r.p[1]) > POSE_Y_BOUND) return null;
  if (!Number.isFinite(r.y)) return null;
  if (!Number.isFinite(r.u) || r.u < -1 || r.u > 2 ** 31) return null;
  if (!Number.isInteger(r.w) || r.w < 0 || r.w > 255) return null;
  if (r.j !== undefined && r.j !== 1) return null;
  let d = null;
  if (r.d !== undefined) {
    const a = r.d;
    if (!Array.isArray(a) || a.length !== 6 || typeof a[0] !== 'string' || (a[0] !== '' && !ID_OK.test(a[0]))) return null;
    if (!validDeck({ ...(a[0] === '' ? { mine: true } : { peer: a[0] }), uid: a[1], local: [a[2], a[3], a[4]], yaw: a[5] })) return null;
    d = [a[0], a[1], a[2], a[3], a[4], wrapAngle(a[5])];
  }
  return { i: r.i, k: r.k, p: [r.p[0], r.p[1], r.p[2]], y: wrapAngle(r.y), u: r.u, w: r.w, ...(d ? { d } : {}), ...(r.j === 1 ? { j: 1 } : {}) };
}
export function campFromWire(r, owner, toScene = (p) => p, selfId = null) {
  const p = toScene(r.p);
  const camp = { id: r.i, owner, kind: r.k === 0 ? CAMP_KIND.Tent : CAMP_KIND.Fire, pos: [p[0], p[1], p[2]], yaw: r.y, litUntil: r.u < 0 ? null : r.u, wear: r.w, placedAt: null };
  if (r.j === 1 && camp.kind === CAMP_KIND.Fire) camp.jar = true;
  if (r.d) {
    const [who, uid, x, y, z, yaw] = r.d;
    // An empty owner is the sender's own boat; one named by selfId is this player's own.
    const ref = who === '' ? { peer: owner } : selfId != null && who === selfId ? { mine: true } : { peer: who };
    const d = validDeck({ ...ref, uid, local: [x, y, z], yaw });
    if (d) camp.deck = d;
  }
  return camp;
}
export function mergeOwnerCamps(camps, owner, records, toScene = (p) => p, selfId = null) {
  const kept = (camps ?? []).filter((c) => c.owner !== owner);
  const fresh = [];
  for (const raw of Array.isArray(records) ? records : []) {
    const r = validCampRecord(raw);
    if (!r || fresh.some((c) => c.id === r.i)) continue;
    fresh.push(campFromWire(r, owner, toScene, selfId));
    if (fresh.length >= CAMPS_PER_OWNER) break;
  }
  return [...kept, ...fresh];
}
