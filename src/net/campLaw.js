// @ts-check
// BUNNYFALL CAMPS (2026-11-13, Killbunny: an interactivity system players "can actually put their hands on"; camps "should
// also allow the same decorations as caravans just 100 of them instead"; kept "until removed", "anywhere outdoors"):
// THE CAMPS' LAW - pure, read by the client (scenes/homeYards.js stands them, the decorator furnishes them) and the account
// service (server-account/src/camps.js keeps them).
//
// A CAMP is a player's own patch of the open world, pitched with the CAMPING KIT (Killbunny: "This should probably be
// deployed using the camping kit"): a tent pitched outdoors online (systems/survival/camp.js - its fire, its rest, its
// cooking, its Pack) is a camp kept on the service too, its ground furnished from the same catalogue as a home's yard -
// up to CAMP_CAP pieces within CAMP_RADIUS of the fire, free (nobody pays gold for a tent in the woods). Every player
// walking past sees it, its tent and fire too while its owner is away; it stands until the tent is packed. An account
// keeps CAMPS_MAX at once, and no two camps' fires stand closer than CAMP_GAP.
//
// WHERE: a camp is kept by its MAP PIXEL (`px`, `py` - the world map's own square, a terrain pixel) and its fire's place in
// that pixel (`at`, pixel-local metres, as streamingWorld.js pixelTranslation's frame has it), so the same numbers stand
// the same fire for every client. Its pieces' places are from the fire (net/decorLaw.js - a yard's piece, its height
// bound DECOR_YARD_HIGH), within CAMP_RADIUS of it.
import { decorYardPieceOf, decorYardHighOk, decorPlaceOf } from './decorLaw.js';

/** The most pieces one camp holds, the Campfire laid at its pitching among them. */
export const CAMP_CAP = 100;
/** How far from the fire, in metres, a camp's pieces may stand. */
export const CAMP_RADIUS = 12;
/** The most camps one account keeps at once. */
export const CAMPS_MAX = 3;
/** How close, in metres, two camps' fires may stand - neither's ground in the other's. */
export const CAMP_GAP = 2 * CAMP_RADIUS;
/** A camp's name's longest. */
export const CAMP_NAME_MAX = 40;
/** How many map pixels each way round the player's own the camps are read for (a 3 x 3 square). */
export const CAMP_NEAR = 1;
/** The most camps one read answers. */
export const CAMPS_READ_MAX = 60;
/** A camp's id: sixteen hex digits, the service's. */
export const CAMP_ID_RE = /^[0-9a-f]{16}$/;
/** The kit's fire and tent as a passer-by sees them while the owner is away (systems/survival/camp.js FIRE_FLAT,
 *  TENT_MODEL, TENT_BEHIND) - stood beside the camp's pieces, never among them (they count to no cap). */
export const CAMP_FIRE_FLAT = Object.freeze([210, 1]);
export const CAMP_TENT_MODEL = 41606;
export const CAMP_TENT_BEHIND = 2.2;
/** A kit record's id (scenes/camps.js placeItem: `<owner>:<n>:<minute>`), the camp's link to its tent. */
export const CAMP_REC_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
/** A map pixel's side in metres (world/terrain/terrainSampler.js TERRAIN_SIZE, 32768 x the meshes' 0.025) - kept here so
 *  the account service reads no terrain code. */
export const CAMP_PIXEL_M = 819.2;
const TERRAIN_SIZE = CAMP_PIXEL_M;
/** The world map's bounds, in pixels. */
const MAP_W = 1000, MAP_H = 500;

/** A camp's name, cleaned (one line, its spaces folded, at most CAMP_NAME_MAX), or null for none. */
export function campNameOf(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CAMP_NAME_MAX).trim();
  return s || null;
}

/** Whether `px`, `py` name a pixel of the world map. */
export const campPixelOk = (px, py) => Number.isSafeInteger(px) && Number.isSafeInteger(py) && px >= 0 && px < MAP_W && py >= 0 && py < MAP_H;

/** A fire's place in its pixel - pixel-local metres [x, y, z], within the pixel's square - rounded, or null. */
export function campAtOf(at) {
  if (!Array.isArray(at) || at.length !== 3 || !at.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const [x, y, z] = at;
  if (x < -1 || x > TERRAIN_SIZE + 1 || z < -1 || z > TERRAIN_SIZE + 1 || Math.abs(y) > 20_000) return null;
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100];
}

/** Whether a piece's place stands on its camp's ground - the square CAMP_RADIUS each way of the fire, its edge the one
 *  the decorator marks - and DECOR_YARD_HIGH above it at most. */
export const campPlaceOk = (pl) => !!pl && Array.isArray(pl.pos) && Math.abs(pl.pos[0]) <= CAMP_RADIUS && Math.abs(pl.pos[2]) <= CAMP_RADIUS && decorYardHighOk(pl);

/** A camp's piece - a yard's (net/decorLaw.js decorYardPieceOf: no light, store or station of its own), free, on its
 *  camp's ground - projected, or null. */
export function campPieceOf(raw) {
  const p = decorYardPieceOf(raw && typeof raw === 'object' ? { ...raw, paid: 0 } : raw);
  return p && campPlaceOk(p) ? p : null;
}

/** A moved piece's new place, projected (free, on the camp's ground), or null. */
export function campMoveOf(place) {
  const pl = decorPlaceOf(place && typeof place === 'object' ? { ...place, paid: 0, light: null, storage: false, station: null } : null);
  return pl && campPlaceOk(pl) ? pl : null;
}

/** The kit's fire and tent at a camp's heart, `yaw` the tent's heading (radians, as the kit's record keeps it), as pieces
 *  a passer-by sees while the owner is away. */
export function campKitPieces(yaw = 0) {
  const y = Number.isFinite(yaw) ? yaw : 0;
  const deg = ((y * 180 / Math.PI + 540) % 360) - 180;
  const fire = { id: 'kit-fire', model: null, flat: [...CAMP_FIRE_FLAT], pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, light: null, storage: false, paid: 0 };
  const tent = { id: 'kit-tent', model: CAMP_TENT_MODEL, flat: null, pos: [-Math.sin(y) * CAMP_TENT_BEHIND, 0, -Math.cos(y) * CAMP_TENT_BEHIND], rot: [deg, 0, 0], scale: 1, light: null, storage: false, paid: 0 };
  return [fire, tent].map(campPieceOf).filter(Boolean);
}

/** Two fires' distance, both in their own pixel's frame - Infinity for two pixels not side by side. */
export function campDistance(a, b) {
  if (!a || !b || Math.abs(a.px - b.px) > 1 || Math.abs(a.py - b.py) > 1) return Infinity;
  // pixelTranslation: x grows with px, z falls as py grows (streamingWorld.js)
  const dx = (a.px - b.px) * TERRAIN_SIZE + (a.at[0] - b.at[0]);
  const dz = -(a.py - b.py) * TERRAIN_SIZE + (a.at[2] - b.at[2]);
  return Math.hypot(dx, dz);
}

/** A camp as a read answers it, projected: `{ id, name, owner, mine, px, py, at, yaw, rec, char, pieces }`, or null (`rec`
 *  and `char` - the kit's record and the character who pitched it - are said to the owner alone). */
export function campOf(raw) {
  if (!raw || typeof raw.id !== 'string' || !CAMP_ID_RE.test(raw.id) || !campPixelOk(raw.px, raw.py)) return null;
  const at = campAtOf(raw.at);
  if (!at) return null;
  const pieces = (Array.isArray(raw.pieces) ? raw.pieces : []).map(campPieceOf).filter(Boolean).slice(0, CAMP_CAP);
  const mine = raw.mine === true;
  return {
    id: raw.id, name: campNameOf(raw.name) ?? 'Camp', owner: typeof raw.owner === 'string' ? raw.owner.slice(0, 40) : '', mine,
    px: raw.px, py: raw.py, at, yaw: Number.isFinite(raw.yaw) ? raw.yaw : 0,
    rec: typeof raw.rec === 'string' && CAMP_REC_RE.test(raw.rec) ? raw.rec : null,
    char: mine && typeof raw.char === 'string' ? raw.char.slice(0, 64) : null, pieces,
  };
}
