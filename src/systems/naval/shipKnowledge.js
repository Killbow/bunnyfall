// @ts-check
import { mulberry32 } from '../../combat/bloodArt.js';
import { CROWNS, HULL, batteriesOf, GUNS, SHIP_CLASSES } from './navalShips.js';
import { nightSight } from './shipWatch.js';

export const KNOW = Object.freeze({ hull: 0, colours: 1, studied: 2 });
export const NAKED_EYE_M = 220;
export const NAKED_EYE_DARK_M = 100;
export const LOOKOUT_ID_M = 320;
// GLASS_FAR_M stays inside DESPAWN_BEYOND in navalDirector.js, so any sail the glass finds still exists.
export const GLASS_FAR_M = 1800;
export const GLASS_NEAR_M = 900;
export const GLASS_STUDY_S = 0.6;
export const GLASS_STUDY_NEAR_S = 1.4;
export const GLASS_ZOOM = 4;
export const GLASS_ZOOM_MIN = 2;
export const GLASS_ZOOM_MAX = 8;
export const RETICLE_DEG = 4;
export const DECEIT_SHARE = 0.35;
export const DECEIT_SALT = 0xfa15e;
export const KNOTS = 1.944;

// The small ship hull carries several classes, so from afar it reads only as a two-master.
export const HULL_WORDS = Object.freeze({ [HULL.Rowboat]: 'rowboat', [HULL.LargeBoat]: 'sloop', [HULL.SmallShip]: 'two-master', [HULL.LargeGalley]: 'galley', [HULL.Carrack]: 'carrack' });
export const hullWord = (hull) => HULL_WORDS[hull] ?? 'ship';
export const aHull = (hull) => `${/^[aeiou]/.test(hullWord(hull)) ? 'an' : 'a'} ${hullWord(hull)}`;
export const unknownName = (hull) => `Unknown ${hullWord(hull)}`;

export const merchantOfHull = (hull) => SHIP_CLASSES.find((c) => c.faction === 'merchant' && c.hull === hull) ?? null;
/**
 * @param {{ faction: string, flagship?: boolean, hull?: number }} cls
 * @param {number} seed
 * @param {string} temper
 * @param {{ plain?: boolean }} [o]
 */
export function falseFlagOf(cls, seed, temper, { plain = false } = {}) {
  if (!cls || cls.faction !== 'pirate' || cls.flagship || temper !== 'wary' || plain || !merchantOfHull(cls.hull)) return null;
  // Seeded by the ship, so every client sees the same false colors.
  const r = mulberry32(((seed >>> 0) ^ DECEIT_SALT) >>> 0);
  if (!(r() < DECEIT_SHARE)) return null;
  return CROWNS[Math.floor(r() * CROWNS.length) % CROWNS.length].name;
}

/** @param {{ night?: boolean, lit?: boolean, sight?: number, lookout?: boolean }} o */
export function glassReach({ night = false, lit = false, sight = 1, lookout = false } = {}) {
  const k = Math.max(1, Number(sight) || 1);
  const at = (m) => nightSight(m * k, { night, lit });
  return { far: at(GLASS_FAR_M), near: at(GLASS_NEAR_M), eye: night && !lit ? NAKED_EYE_DARK_M : NAKED_EYE_M, lookout: lookout ? at(LOOKOUT_ID_M) : 0 };
}

/**
 * @param {number} known
 * @param {{ dist: number, reach: ReturnType<typeof glassReach>, held?: number, revealed?: boolean, struck?: boolean }} o
 */
export function knowledgeOf(known, { dist, reach, held = 0, revealed = false, struck = false }) {
  let k = Math.max(KNOW.hull, Math.min(KNOW.studied, known | 0));
  if (struck) return KNOW.studied;
  if (revealed || dist <= reach.eye || dist <= reach.lookout) k = Math.max(k, KNOW.colours);
  if (held >= GLASS_STUDY_S && dist <= reach.far) k = Math.max(k, KNOW.colours);
  if (held >= GLASS_STUDY_NEAR_S && dist <= reach.near) k = KNOW.studied;
  return k;
}

/**
 * @param {number} angle
 * @param {number} dist
 * @param {number} half
 * @param {number} zoom
 * @param {number} [field]
 */
export const glassHolds = (angle, dist, half, zoom, field = Math.PI) => angle <= Math.min(field, Math.max(Math.atan2(Math.max(1, half), Math.max(1, dist)), (RETICLE_DEG * Math.PI / 180) / Math.max(1, zoom)));

export function coloursWords(faction, flag) {
  if (faction === 'pirate' && !flag) return 'the black flag';
  if (faction === 'navy') return `${own(flag ?? 'a crown')} royal ensign`;
  return `${own(flag ?? 'a trader')} merchant colors`;
}
const own = (name) => (/s$/.test(name) ? `${name}'` : `${name}'s`);
export function cargoWords(cargo) {
  if (!(cargo > 0)) return 'riding high - hold empty';
  const c = Math.max(1, Math.min(4, cargo | 0));
  return ['riding high, a light hold', 'riding easy - some cargo', 'riding low, a full hold', 'riding deep, a rich hold'][c - 1];
}
export function gunsWords(hull) {
  const bats = batteriesOf(hull);
  if (!bats.length) return 'no guns';
  const broad = bats.filter((b) => b.side === 'starboard' || b.side === 'port').reduce((n, b) => n + b.muzzles.length, 0);
  const parts = [];
  const g0 = bats.find((b) => b.side === 'starboard' || b.side === 'port');
  if (broad) parts.push(`${broad} ${GUN_WORDS[g0.gun]?.[broad === 1 ? 0 : 1] ?? 'guns'}`);
  const bow = bats.find((b) => b.side === 'bow');
  const kind = (g) => (g === 'chain' ? 'chain' : g === 'heavy' ? 'great' : g);
  if (bow) parts.push(bow.muzzles.length === 1 ? `${/^[aeiou]/.test(kind(bow.gun)) ? 'an' : 'a'} ${kind(bow.gun)} gun forward` : `${bow.muzzles.length} ${kind(bow.gun)} guns forward`);
  const stern = bats.find((b) => b.side === 'stern');
  if (stern) parts.push(stern.gun === 'barrel' ? 'fire barrels astern' : `${stern.muzzles.length} stern ${stern.muzzles.length === 1 ? 'gun' : 'guns'}`);
  return parts.join(', ');
}
const GUN_WORDS = Object.freeze({ long: ['long gun', 'long guns'], swivel: ['swivel', 'swivels'], heavy: ['great gun', 'great guns'], chain: ['chain gun', 'chain guns'] });
export const handsWords = (crew) => (crew <= 0 ? 'no hands' : crew < 1.5 ? 'a hand' : crew < 2.5 ? 'a hand or two' : `about ${Math.round(crew / 5) * 5} hands`);
export function mindWords({ hostile = false, faction = null, temper = null, mode = null, bound = '' } = {}) {
  if (hostile) return mode === 'board' ? 'Closing to board you!' : 'Heading straight for you!';
  if (faction === 'pirate') return temper === 'bold' ? 'Bold. Attacks any target' : 'Wary. Picks its targets carefully';
  if (bound) return `${bound[0].toUpperCase()}${bound.slice(1)}`;
  return faction === 'navy' ? 'On the crown\'s business' : 'Holding course';
}

/**
 * @param {any} f
 * @param {number} known
 * @param {{ study?: number, within?: number|null }} [o]
 */
export function glassCard(f, known, { study = 0, within = null } = {}) {
  const hint = within != null && known < KNOW.studied ? `Close within ${Math.round(within)} m to make out ${known < KNOW.colours ? 'its colours' : 'its guns and hold'}` : '';
  const rows = [];
  const way = f.speed > 0.4 ? `making ${Math.round(f.speed * KNOTS)} knots` : 'lying still';
  if (known <= KNOW.hull) {
    rows.push(['Range', `${Math.round(f.distance)} m`], ['Way', way]);
    return { title: unknownName(f.hull), sub: 'Colors not yet identified', rows, tone: 'unknown', study, hint };
  }
  const disguised = !!f.falseFlag && known < KNOW.studied && !f.hostile;
  const faction = disguised ? 'merchant' : f.faction;
  const colours = coloursWords(faction, disguised ? f.falseFlag : f.flag);
  rows.push(['Colors', colours], ['Range', `${Math.round(f.distance)} m - ${way}`], ['Bearing', mindWords({ hostile: f.hostile, faction, temper: f.temper, mode: f.mode, bound: disguised ? '' : f.bound })]);
  if (known >= KNOW.studied) {
    if (f.falseFlag) rows.unshift(['False colors', 'Too many gunports for a trader. This is a pirate']);
    rows.push(['Guns', gunsWords(f.hull)], ['Hands', handsWords(f.crew)], ['Hurts', `hull ${Math.round(f.hullShare * 100)}%${f.sailShare != null ? `, canvas ${Math.round(f.sailShare * 100)}%` : ''}${f.fire ? ' - burning' : ''}`], ['Hold', cargoWords(f.cargo)]);
    if (f.bounty) rows.push(['Wanted', f.bounty]);
    if (f.lore) rows.push(['Lore', f.lore]);
  }
  const name = disguised ? f.falseName ?? `A merchantman of ${f.falseFlag}` : f.name;
  return { title: name, sub: disguised ? f.falseLine ?? 'Merchantman' : f.classLine, rows, tone: f.hostile ? 'hostile' : faction === 'pirate' ? 'pirate' : f.friendly || disguised ? 'friendly' : 'neutral', study: known >= KNOW.studied ? 1 : study, hint };
}
