// @ts-check
// Runs the sea fight in the streaming exterior: sea ships, the player's guns and shots, boarding, the law, the save
// record, and the word to other players. Every seam it reaches is in `deps`, so it runs in Node.

import { createShotField, insideGrown } from './navalShots.js';
import { createNavalEffects } from './navalEffects.js';
import { createNavalFeel, MY_SMOKE_FROM } from './navalFeel.js';
import { createNavalDirector, directorShips, DENSITY, seedBaseOf, SEED_SALT, DESPAWN_BEYOND, DEEP_BOLD, DEEP_TIER } from './navalDirector.js';
import { createSeaShip, stepCaptain, quatOfYaw, forwardOfYaw, velocityOf, provoke, hostile, lookoutOf, fightingPower, TEMPERS, HEAR_S, RUN_OUT_S, RUN_OUT_DEG, BOW_RUN_OUT, SPARE_S, GUNS_SEEN_S, PROVOKED_S, NAVY_HUNTS, temperOf } from './navalAI.js';
import { wrapAngle, multiply } from '../../world/mat4.js';
import { createShipDamage, shotDamage, shotMen, ballMen, playerMen, SHIP_STATES, SINK_SECONDS, SINK_CLEAR, sinkAngles, sinkDepth, BRACE_TAKEN, FIRE_CHANCE, WRECKED_OARS, repairCost, STRUCK_AT } from './navalDamage.js';
import { createGunDeck, aimSolution, volleyLaunches, bearingOf, sideForBearing, toWorld, RIPPLE_S, READY_FLASH_S } from './navalGunnery.js';
import { flatHull, hullOverlap, hullBuild, firstBuildOf, batteryOf, batteriesOf, GUNS, classById, classFor, shipNames, crownOf, classLine, SIDES, SIDE_DIR, BARREL, NAVAL_FACTIONS, HULL, PLAYER_CREW_TOUGHNESS, SHIP_TOUGHNESS, shipBatteryWeight, MOD_BUILDS, flagOf, CROWNS } from './navalShips.js';
import { createWaterGrid, errandFor, errandRng, dwellOf, offsetErrand, alongside, BERTH_SNAP_M, BERTH_WAY } from './shipLife.js';
import { createHarbourBook, HARBOUR_RETRY_S } from './harbourBook.js';
import { hash32 } from '../../world/spawnedDungeons.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { orientedBox, arcPoints, fallArc, flatUnit, NAVAL_DEG, rangeAt, segmentBoxEntry, shotPosition, landing } from './navalBallistics.js';
import { lawOf, createNotoriety, crownRegion, notorietyLevel, WITNESS_RANGE, KNIGHTLY_FACTION, TEMPLE_FACTION } from './navalLaw.js';
import { standingFor } from './captainLedger.js';
import { SITE_REACH_PX } from './harbourBoard.js';
import { CHART_SITE } from './treasureCharts.js';
import { etherShipNames, etherFlagOf, ISLES_FLAG, legendOfClass, LEGEND_MEND_PER_S, LEGEND_MEND_QUIET_S, LEGEND_VEIL_K } from './etherShips.js';
import { BANDS } from '../../world/ethericSea.js';
import { STRAND_SITE } from './etherHost.js';
import { KNOW, falseFlagOf, merchantOfHull, glassReach, knowledgeOf, glassHolds, glassCard, coloursWords, unknownName, hullWord, GLASS_ZOOM, GLASS_ZOOM_MIN, GLASS_ZOOM_MAX, GLASS_STUDY_S, GLASS_STUDY_NEAR_S } from './shipKnowledge.js';
import { drawHold, flotsamKeys, choiceEffect, choiceOffer, holdTier, CHOICES, prizeDeedValue, SALVAGE_LOT, isSalvage, salvageOf, STRONGBOX_KEY, STRONGBOX_RARITY_TIER } from './navalPlunder.js';
import { mintStores } from './navalStores.js';
import { mintDeed } from './comeSailAwayItems.js';
import { createPassageBerths } from './passageBerths.js';
import { createFishingFleet } from './fishingFleet.js';
import { createPassageQuay } from './passageQuay.js';
import { yardOffer, yardAll, fieldMend, FIELD_QUIET_S, FIELD_REFLOAT, YARD_PRICE, provisionOffer, seaRepair, wantsRepair, paidDamage, STORE_POINTS, STORES_STOCK, storesToWhole, SEA_REPAIR_UNDER_FIRE, FIELD_MEND_CAP } from './navalYard.js';
import { createCompanions, companionRows, heldAtSide, packStaysAshore } from './crewCompanions.js';
import { createShipCrew, reloadScaleOf, mendScaleOf, handsBonusOf, crewCard, CREW_ORDERS, ORDER_TEXT, spiritsOf, LOOKOUT_ROLE, FIRST_MATE, crewWorth, NO_WORTH, SEASONED_HIRE } from './shipCrew.js';
import { crewRoster, playerCrewCount } from './crewLife.js';
import { enlistPlan, releasePlan, CREW_HALL_TEXT } from './crewHall.js';
import { createBoarding, boardableState, musterOf, crewTeamOf, handsOf, repelPartyOf, raidQuestOf, raidQuestWon, raidQuestRetreated, boardingWon, BOARD_RANGE, ABANDON_RANGE, HAND, SURRENDER_SHARE, CREW_PER_HAND } from './navalBoarding.js';
import { navalWireRecord, validNavalRecord, navalHitData, validNavalHit, NAVAL_SHARE_RADIUS, NAVAL_VOLLEY_KEEP_MS, NAVAL_GEN_MAX, NAVAL_WIRE_VOLLEYS, NAVAL_WIRE_SPENT, TRAFFIC_DEFAULT } from './navalWire.js';
import { Boat, boatAnimators, boatParticleSystems, animatorOf, setLights, meshLocalBounds, HULL_NAMES } from './comeSailAwayBoat.js';
import { runsDark, nightSight, lampSize, lampAlpha, lampPoints, createLampStreaks, LAMP_NEAR_M, LAMP_COLOR, STREAK_NEAR_M } from './shipWatch.js';
import { stowSail, vSignedAngle } from './comeSailAway.js';
import { quatEuler } from '../../world/unityAnimator.js';
import { quatRotate, quatLookRotation, quatAngleAxis, mat4FromQuatPos } from '../../world/quat.js';
import { constantCurve } from '../../world/unityParticles.js';
import { amGroupRollOwner } from '../../characters/campEncounters.js';
import { NAVAL_SFX, NAVAL_CLASSIC, NAVAL_FIRE_LOOP, NAVAL_SINK_LOOP, navalSoundRange } from './navalSounds.js';
import { raiderPlan, raiderClassOf, RAIDER_DROP_M } from './navalRaiders.js';
import { pursue } from './seaLanes.js';
import { FADE_FLATS } from './comeSailAwayPool.js';
import { NEAR_LIFE_M, FAR_LIFE_EVERY, farLifeStep } from './farLife.js';
import { segmentOfTarget } from '../../worldEvents/serpentHost.js';
import { intoDeck, outOfDeck, mainLevel, DECK_STEP } from './navalDeck.js';
import { createSeaDecks } from './seaDecks.js';
import { crewDealOf } from './crewDeal.js';
import { CAPSULE_RADIUS } from '../../player/motor.js';
import { createGalleonGunDeck } from './galleonGunDeck.js';
import { timeScale } from '../../world/timeScale.js';
import { sharedSea, seaSeconds } from './seaClock.js';
import { markStolen } from '../../justice/stolenGoods.js';
import { dockFor, madeFast, warpStep, quaySide, landwardOf, quayFrame, quayToScene, sceneToQuay, gangwayFoot, DOCK_WAY, DOCK_REACH_M, DOCK_REFUSED, GANGWAY_REACH, GANGWAY_ASHORE, GANGWAY_FACING, gangwaySide, QUAY_GAP, QUAY_WIDTH, QUAY_DECK_UP } from './quays.js';
import { shotGun, shotFireChance, shotRigFire, naturalShot } from './shotKinds.js';
import { captainWorth, struckGun, statScale } from './captainTree.js';
import { createNavalLoads } from './navalLoads.js';
import { createAimCamera } from './aimCamera.js';
import { createNavalHaul } from './navalHaul.js';
import { createNavalRams } from './navalRams.js';
import { createSeaHulls } from './seaClearance.js';
import { createVolleyTally } from './navalTally.js';
import { seaLiveryOf, seaFlagsOf } from './seaColours.js';
import { liveryCode } from './shipLivery.js';
import { noteAct } from '../questlines/qlActs.js';
import { captainsDue } from '../../items/sigilSetPowers.js';
import { dueOnHull, legendTidemail } from './navalSeaSet.js';
import { createTreasureFleet } from './treasureFleet.js';
import { createNavalPvp } from './navalPvp.js';
import { strikeShip } from './sea/seaEvents.js';
import { createBerthWatch } from './navalBerth.js';
import { t } from '../../ui/textManager.js';

// The save record's key in the per-mod slot: renaming it orphans every saved naval record.
export const NAVAL_SAVE_VENDOR = 'NavalCombat';
export const NAVAL_SAVE_VERSION = 1;
// A record without `maxHull` and `maxSail` predates tougher hulls and reads on the first build's scale. `exact`
// restores the hurts to the bit when her whole is unchanged.
/** @param {any} rec @param {number} hull @param {{ maxHull: number, maxSail: number }} whole */
export function savedHurts(rec, hull, whole) {
  const first = firstBuildOf(hull);
  const was = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback);
  const share = (v, then, now) => (Number.isFinite(v) && then > 0 ? (v / then) * now : v);
  const thenHull = was(rec.maxHull, first.hullHp);
  const out = { ...rec, hull: share(rec.hull, thenHull, whole.maxHull), sail: share(rec.sail, was(rec.maxSail, first.sailHp), whole.maxSail) };
  if (Number.isFinite(rec.credit)) out.credit = share(rec.credit, thenHull, whole.maxHull);
  const x = rec.exact;
  delete out.exact;
  if (x && typeof x === 'object' && x.maxHull === whole.maxHull && x.maxSail === whole.maxSail && Number.isFinite(x.hull) && Number.isFinite(x.sail)) {
    out.hull = x.hull; out.sail = x.sail;
    if (Number.isFinite(x.credit)) out.credit = x.credit;
  }
  return out;
}
function gunsRecord(st) {
  const loads = st.guns.snapshot().loads;
  return { barrels: st.guns.barrels, mates: st.crew.snapshot(), ...(Object.values(loads).some(Boolean) ? { loads } : {}) };
}
// Saved on the first build's scale, so an older build reads her hurts as the points they always were.
export function savedRecord(damage, hull, credit) {
  const first = firstBuildOf(hull);
  const on = (v, now, then) => (now > 0 ? Math.round((v / now) * then * 100) / 100 : 0);
  return { ...damage.saveData(), hull: on(damage.hull, damage.maxHull, first.hullHp), sail: on(damage.sail, damage.maxSail, first.sailHp),
    maxHull: first.hullHp, maxSail: first.sailHp, credit: on(credit, damage.maxHull, first.hullHp),
    exact: { maxHull: damage.maxHull, maxSail: damage.maxSail, hull: damage.hull, sail: damage.sail, credit } };
}
// Harbor ships are drawn off a stream seeded by the port and the day, so every player in a port sees the same ships.
export const HARBOUR_STAND = 1200;
export const HARBOUR_LEAVE = 2600;
export const HARBOUR_ROLL = Object.freeze([2, 4]);
export const HARBOUR_NAVY = 0.25;
export const HARBOUR_SALT = 0x4a7b;
export const SHIP_FADE_S = 4;
export const LINER_STAND_M = 1200;
export const LINER_DROP_M = 1700;
export const LINERS_MAX = Object.freeze({ 0: 0, 1: 1, 2: 2, 4: 3 });
export const LINER_LOOKAHEAD_M = 300;
export const LINER_PORT_M = 500;
// Harbor ships are drawn at the port's level, never a player's, so two players never draw two fleets into one port.
export const HARBOUR_LEVEL = 10;
export { HARBOUR_RETRY_S };
const keyHash = (k) => { let h = 0x811c9dc5; for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 0x01000193); return h >>> 0; };
export const NEAR_BOOM_M = 260;
// The audio bus has no limiter, so my own ripple's reports play at one over the root of its guns.
export const FAR_FADE_M = 60;
export const FAR_MATCH = 0.46;
export const GUN_PITCH_JITTER = 0.06;
export const GUN_GAIN_JITTER_DB = 2;
export const HIT_CONFIRM_REF_M = 60;
export const HIT_BURST_M = 50;
export const HIT_BURST_MAX = 3;
export const GUN_KICK = Object.freeze({ long: 1.1, heavy: 1.6, swivel: 0.45, chain: 0.9 });
export const BLAST_SHAKE = 3.2;
export { NEAR_LIFE_M, FAR_LIFE_EVERY };
export const FAR_WATCH_M = 5500;
const NO_WATCH = Object.freeze({ volleys: Object.freeze([]), barrels: Object.freeze([]), grapple: null, runOuts: Object.freeze([]) });
/** @param {any} e @param {number[]|null} eye @param {() => Set<string>} fought */
export function watchesFar(e, eye, fought) {
  const s = e.ship;
  return !!eye && s.damage.state === SHIP_STATES.afloat && s.mode !== 'engage' && s.mode !== 'board' && !s.lashed
    && Math.hypot(s.pos[0] - eye[0], s.pos[2] - eye[2]) > FAR_WATCH_M && !fought().has(e.id);
}
// Both lie past the farthest lane fog and past a peer's shared sea; the gap stops a hull at the edge from being
// built and torn down frame by frame.
export const PEER_HULL_NEAR_M = 5000;
export const PEER_HULL_FAR_M = 5500;
// A shot lands only on a hull and a galley rams only one, so a fight between hull-less ships would never end.
/** @param {any} e @param {{ fought: Set<string>, boardingId?: string|null }} at */
export function hullKept(e, { fought, boardingId = null }) {
  const s = e.ship;
  return !!e.deck?.length || (boardingId != null && boardingId === e.id) || (!!e.prize && !e.prize.fate)
    || (s.damage.state === SHIP_STATES.afloat && (s.mode === 'engage' || s.mode === 'board')) || fought.has(e.id);
}
export const NAVAL_TAG_RANGE = 700;
export const NAVAL_TAG_NEAR = 25;
export const NAVAL_TAG_MAX = 8;
export const TAG_LIFT = 2.5;
export const GLASS_AIM_LIFT = 3;
export const OWN_SPARS_S = 0.5;
export const SITE_CHECK_S = 1;
export const SITE_CASK_LIFE = 1200;
export const SITE_CASK_SPREAD = 40;
export const SITE_AHEAD_M = 700;
const CROWNS_BY_NAME = new Map(CROWNS.map((c) => [c.name, c]));
export const STRAND_ALONGSIDE_M = 40;
export const SITE_LOT = 'site:';
export const isSiteLot = (lot) => typeof lot === 'string' && lot.startsWith(SITE_LOT);
export const CACHE_LOTS = 2;
export const SAIL_HO_RANGE = 900;
export const SAIL_HO_GAP_S = 8;
export const SAIL_HO_CHECK_S = 0.5;
export const SMOKE_FROM = 0.6;
export const SMOKE_SPAN = 0.6;
export const DAMAGE_LIST_FROM = 0.4;
export const DAMAGE_LIST_MAX = 8;
export const DAMAGE_LIST_EASE_S = 2.5;
export const TIMBER_PER_HIT = 2;
export function lineOver(a, b, floor) {
  const ua = a[1] >= floor, ub = b[1] >= floor;
  if (ua && ub) return [a, b];
  if (!ua && !ub) return null;
  const k = (floor - a[1]) / (b[1] - a[1]);
  const cut = [a[0] + (b[0] - a[0]) * k, floor, a[2] + (b[2] - a[2]) * k];
  return ua ? [a, cut] : [cut, b];
}
export const sailsShown = (n, share) => Math.max(0, Math.min(n, Math.ceil(n * Math.max(0, share) - 1e-9)));
export function bearingWords(b) {
  const a = Math.abs(b), side = b > 0 ? 'starboard' : 'port';
  if (a < 22.5) return 'dead ahead';
  if (a < 67.5) return `off the ${side} bow`;
  if (a < 112.5) return `on the ${side} beam`;
  if (a < 157.5) return `off the ${side} quarter`;
  return 'dead astern';
}
export const withArticle = (w) => `${/^[aeiou]/i.test(w) ? 'An' : 'A'} ${w}`;
export const MUZZLE_FLASH_RANGE = 26;
export const MUZZLE_FLASH_S = 0.12;
export const MUZZLE_FLASH_COLOR = Object.freeze([1.35, 1.0, 0.6]);
export const BURN_COLOR = Object.freeze([1.25, 0.72, 0.36]);
export const BURN_RANGE = 16;
export const BURN_LIGHTS = 3;
export const COLLIDE_RANGE = 180;
export const HANDS_AROUND = 2.2;
export const FOOT_BOARD_M = 14;
export const HOSTILE_NEAR_M = 700;
export const DECK_REACH_M = 1;
export const SWIM_REACH = Object.freeze([0.6, 1.2, 0.6]);
export const SWIMMER = 'me:swim';
export const PRIZE_TAKE_S = 18;
export const PRIZE_COST = 0.5;
export const NEWS_RANGE = 1200;
export const GUNFIRE_KEEP = 24;
export const RELIEF_NEAR_M = 900;
export const RELIEF_REACHED_M = 250;
export const ALLY_STRAY_SHARE = 0.15;
export const DECK_SPOTS = 16;
export const BODY_GAP = 0.9;
export const SHARE_HYSTERESIS = 1.25;
export const COMPASS_SHIP_RANGE = 900;
export const PLAYER_SKILL = 0.6;
export const PLAYER_SKILL_THIN = 0.3;
export const YARD_SPEED = 2.5;
export const PUPPET_EASE = 6;
export const PUPPET_SNAP_M = 25;
export const PUPPET_CATCH = 1;
export const PUPPET_CATCH_MPS = 0.3;
export const PUPPET_CATCH_SHARE = 0.1;
export const OWNER_SWEEP_S = 2;
export const OWNER_STALE_S = 6;
export const ORPHAN_S = 8;
export const PREDICT_MAX_S = 2.5;
export const GRAPPLE_CLAIM_S = 2;
export const PEER_VOLLEYS_MAX = 2 * NAVAL_WIRE_VOLLEYS;
// An answer is cached for GRANT_KEEP_S, so a claim resent after a lost answer is answered again, never twice.
export const CLAIM_AGAIN_S = 2;
export const CLAIM_WAIT_S = 10;
export const GRANT_KEEP_S = 30;
// Of two claims on one seed the greater handover count `gen` holds her, and a tie goes to the lower id.
export const claimBeats = (gen, id, otherGen, otherId) => gen > otherGen || (gen === otherGen && String(id) < String(otherId));
// Traffic seeds are salted with the player's id, so two players launching traffic never launch twins.
export function idSalt(id) {
  if (typeof id !== 'string' || !id || id === 'local') return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
export const SINK_CREDIT_S = 20;
export const FLAME_AWASH = 0.3;
export const RAIDER_SHEER_M = 3000;
export const FRAME_STEP_S = 0.1;
export const FRAME_STEPS_MAX = 12;
export const STRUCK_GRACE_S = 2;
export const TALLY_S = 3.5;
export const INCOMING_SLACK = 10;
export const LOOK_REACH_PAD = 60;
export const HOT_STEP_S = 0.1;
export { AIM_CAM_OUT, AIM_CAM_UP, AIM_CAM_AFT, AIM_CAM_TAU, AIM_CAM_CLEAR, AIM_CAM_AHEAD } from './aimCamera.js';
// Longer than FOES_FULL_MS (2 s), the longest gap between full words, and counted in real seconds.
export const PEER_LAY_S = 3;

export { flatHull, hullOverlap };
export function hullBoxOf(boat, models) {
  const local = boat?.MeshCollider ? meshLocalBounds({ models }, boat.MeshCollider.m_Mesh) : null;
  if (!local) return null;
  return orientedBox(boat.MeshObject.worldMatrix(), local.center, local.extent);
}
export function rigBoxesOf(boat) {
  const rig = hullBuild(boat?.hull).rig;
  const mo = boat?.MeshObject;
  if (!rig?.length || !mo) return [];
  const m = mo.worldMatrix();
  const lp = mo.localPosition ?? [0, 0, 0];
  const at = (p) => [p[0] - lp[0], p[1] - lp[1], p[2] - lp[2]];
  const hangs = (k) => { const s = boat.Sails?.[k]; return !s || (s.activeSelf && !animatorOf(s)?.GetBool('Stowed')); };
  const plan = (box) => /** @type {any} */ (box).variant == null || /** @type {any} */ (box).variant === (boat.variant ?? 0);
  return rig.filter((box) => plan(box) && (/** @type {any} */ (box).sail == null || hangs(/** @type {any} */ (box).sail))).map((box) => {
    const [mn, mx] = box, b = /** @type {any} */ (box);
    if (b.obb) return orientedBox(multiply(m, mat4FromQuatPos(quatAngleAxis(b.obb.pitch, [1, 0, 0]), at(b.obb.c)), new Float32Array(16)), [0, 0, 0], b.obb.h);
    const c = at([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]), h = [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2];
    const q = b.boom != null ? boat.Booms?.[b.boom]?.localRotation : null;
    if (!q || !b.pivot) return orientedBox(m, c, h);
    const P = at(b.pivot);
    const turn = multiply(mat4FromQuatPos(q, P), mat4FromQuatPos([0, 0, 0, 1], [-P[0], -P[1], -P[2]]), new Float32Array(16));
    return orientedBox(multiply(m, turn, new Float32Array(16)), c, h);
  });
}

function canvasHeight(sail) {
  const grid = sail.children.find((c) => /SailBones$/.test(c.name))?.children ?? [];
  if (grid.length < 2) return sail.worldMatrix()[13];
  return grid.reduce((y, bone) => y + bone.worldMatrix()[13], 0) / grid.length;
}
function sailSide(boat, sail, w) {
  if (boat.SailsSquare?.includes(sail)) return 1;
  const f = quatRotate(sail.rotation, [0, 0, 1]);
  const a = vSignedAngle([f[0], 0, f[2]], [w[0], 0, w[2]], [0, 1, 0]);
  if (boat.SailsLateen?.includes(sail)) return a > 0 ? -1 : 1;
  if (boat.SailsGaff?.includes(sail)) return a >= 0 ? 1 : -1;
  return a > 0 ? 1 : -1;
}

export function sparsOf(boat, models) {
  const mo = boat?.MeshObject;
  if (!mo) return null;
  const points = [];
  for (const node of mo.walk()) {
    const local = node.activeInHierarchy ? meshLocalBounds({ models }, node.getComponent('MeshFilter')?.m_Mesh) : null;
    if (!local) continue;
    for (let i = 0; i < 8; i++) {
      const corner = [0, 1, 2].map((d) => local.center[d] + ((i >> d) & 1 ? local.extent[d] : -local.extent[d]));
      points.push(mo.inverseTransformPoint(node.transformPoint(corner)));
    }
  }
  if (!points.length) return null;
  return { points, lift: mo.worldMatrix()[13] - boat.GameObject.worldMatrix()[13] };
}

const MY_BOAT = 'me';
const SERPENT_AIM = Object.freeze({ id: 'serpent' });
const myBoatId = (boat) => `${MY_BOAT}:${boat?.uid || 0}`;
const isMine = (id) => typeof id === 'string' && id.startsWith(`${MY_BOAT}:`);
const shipShot = (shooter) => !(typeof shooter === 'string' && (shooter.startsWith('peer:') || isMine(shooter)));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist2d = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const arcTo = (l, t) => Array.from({ length: 18 }, (_, j) => shotPosition(l.p0, l.v0, t * j / 17));

/** @param {any} deps */
export function createNavalHost(deps) {
  const random = deps.random ?? Math.random;
  const u32 = () => (Math.floor(random() * 0xffffffff) >>> 0) || 1;
  const setting = (k, d) => { const v = deps.setting?.(k); return v === undefined || v === null ? d : v; };
  const autoRepair = () => setting('AutoRepair', true) !== false;
  let whereNow = null;
  const where = () => (whereNow ??= deps.where?.() ?? {});
  const now = () => clock;
  let clock = 0;
  const galleonGuns = createGalleonGunDeck();
  let realClock = 0;
  let enabled = true;

  /** @type {Map<string, any>} */
  const sea = new Map();
  const shipDecks = createSeaDecks({ standsOn: (boat, feet) => standsOn(boat, feet), feet: () => deps.feet(), swimming: () => !!deps.swimming?.() });
  let seq = 0;
  const ownBook = !deps.harbourBook;
  const harbours = deps.harbourBook ?? createHarbourBook({ harbourNear: () => deps.harbourNear?.() ?? null, isWater: (x, z, h) => deps.isWater(x, z, h) });
  let rolled = new WeakSet();
  let grids = new Map();
  // Survives the sea's clear, so a ship that sailed from her port today is never placed at her berth again.
  const departedByPort = new Map();
  const departedOf = (key, day) => {
    let d = departedByPort.get(key);
    if (!d || d.day !== day) departedByPort.set(key, (d = { day, seeds: new Set() }));
    return d.seeds;
  };
  const spars = new Map();
  const myId = () => deps.online?.id?.() ?? 'local';
  const director = createNavalDirector({ random });
  const notoriety = createNotoriety();
  let lastDecayDay = null;
  let standing = true;
  let lastSweep = 0;
  let lastHail = -Infinity, lastHailCheck = -Infinity, lastCardId = null;
  const hailCalls = new Map();

  const boatState = new Map();
  const boatStateByObj = new WeakMap();
  const pendingBoats = new Map();
  const NO_HANDS_AWAY = new Set();
  let companions = createCompanions(null, deps.packedItems ?? null);
  function refitBuild(boat) {
    const b = hullBuild(boat.hull);
    const k = Number(boat?.uid ? deps.refit?.(boat)?.hull : 1);
    return Number.isFinite(k) && k > 0 && k !== 1 ? { ...b, hullHp: Math.round(b.hullHp * k), sailHp: Math.round(b.sailHp * k) } : b;
  }
  function myBoatState(boat) {
    if (!boat) return null;
    const keyed = boat.uid ? boatState.get(boat.uid) : boatStateByObj.get(boat);
    if (keyed) return keyed;
    const b = refitBuild(boat);
    const st = {
      damage: createShipDamage({ hullHp: b.hullHp, sailHp: b.sailHp, crew: b.crew, player: true }),
      guns: null,
    };
    st.worth = NO_WORTH;
    st.guns = createGunDeck(boat.hull, { crewed: !!boat.crewed, crewShare: () => st.damage.crewShare(), barrels: BARREL.stock, reloadScale: () => (boat.crewed && st.crew ? reloadScaleOf(st.crew.morale, st.crew.order) * st.worth.reload : 1) });
    const saved = boat.uid ? pendingBoats.get(boat.uid) : null;
    const rec = saved ? savedHurts(saved, boat.hull, st.damage) : null;
    if (saved) { st.damage.restore(rec); if (Number.isFinite(saved.barrels)) st.guns.barrels = saved.barrels; st.guns.restoreLoads(saved.loads ?? null); pendingBoats.delete(boat.uid); }
    st.crew = createShipCrew({ seed: (deps.crewSeed?.(boat) ?? boat.uid ?? 1) >>> 0, regionIndex: where().region ?? 17, record: saved?.mates ?? null });
    st.credit = Number.isFinite(rec?.credit) ? Math.max(0, Math.min(STORE_POINTS, rec.credit)) : 0;
    st.lastCrew = st.damage.crew; st.wasWrecked = st.damage.state === SHIP_STATES.wrecked; st.inFight = false; st.mustered = !!saved?.mates; st.repairing = false;
    st.hull = boat.hull;
    if (boat.uid) boatState.set(boat.uid, st); else boatStateByObj.set(boat, st);
    return st;
  }
  const csa = () => deps.csa?.() ?? null;
  const sailing = () => !!csa()?.isSailing?.();
  const myBoat = () => (sailing() ? csa().state.CurrentBoat : null);
  const ashoreNames = (boat) => (boat?.uid && companions.party.length && !sailing() ? companions.awayOf(boat.uid) : NO_HANDS_AWAY);
  const myBoats = () => (csa()?.state?.AllBoats ?? []).filter((b) => b.GameObject?.activeSelf);
  // Includes boats the mod hides (far off, or while indoors): they still lie in their berths.
  const berthBoats = () => (csa()?.state?.AllBoats ?? []).filter((b) => b.GameObject && !b.inside);
  function boatPose(boat) {
    const r = csa();
    const rot = boat.GameObject.rotation;
    const local = boat === r?.state?.CurrentBoat && sailing() && !r.IsBeached?.(boat) ? (r.state.velocityCurrent ?? [0, 0, 0]) : [0, 0, 0];
    return { position: boat.GameObject.position, rotation: rot, velocity: quatRotate(rot, local), hull: boat.hull };
  }
  const yawOfRot = (rot) => { const f = quatRotate(rot, [0, 0, 1]); return Math.atan2(f[0], f[2]); };

  const hullBox = (boat) => hullBoxOf(boat, deps.pool.models);

  const wind = () => csa()?.state?.windVectorCurrent ?? [0.6, 0, 0.8];
  const effects = createNavalEffects({ random, wind });
  const feel = createNavalFeel({
    effects, sound: (k, p, v, o) => sound(k, p, v, o), shake: (k) => deps.shake?.(k), feet: () => deps.feet(), mine: (s) => isMine(s) || String(s ?? '').startsWith('peer:'),
    myHulls: () => myBoats().map((b) => ({ id: myBoatId(b), box: hullBox(b) })).filter((h) => h.box),
    myBoats: () => myBoats().filter((b) => myBoatState(b).damage.hullShare() < MY_SMOKE_FROM).map((b) => { const st = myBoatState(b); return { pose: boatPose(b), build: hullBuild(b.hull), hull: st.damage.hullShare(), fighting: hostileNearBoat(b, st) }; }),
  });
  const flashes = [];
  function targets() {
    const out = [];
    for (const e of sea.values()) {
      if (!e.boat || e.ship.damage.state === SHIP_STATES.sunk) continue;
      const box = hullBox(e.boat);
      if (box) out.push({ id: e.id, box, rig: rigBoxesOf(e.boat) });
    }
    // A ship's ball bursts on another player's boat here, but only her own client judges it; players' balls never meet
    // her outside the open sea.
    for (const p of deps.peerBoats?.() ?? []) {
      const box = p.boat ? hullBox(p.boat) : null;
      if (box) out.push({ id: `peer:${p.id}`, box, rig: rigBoxesOf(p.boat), hitBy: (s) => shipShot(s) || pvp.open(p.id, s, isMine(s)) });
    }
    for (const b of myBoats()) {
      const box = hullBox(b);
      if (box) out.push({ id: myBoatId(b), box, rig: rigBoxesOf(b), boat: b, ear: true });
    }
    for (const t of deps.serpent?.targets?.() ?? []) out.push(t);
    return out;
  }
  const shots = createShotField({
    seaY: () => deps.seaY(),
    wind,
    targets,
    ground: (p) => !deps.isWater(p[0], p[2], -1) && p[1] < (deps.groundY?.(p[0], p[2]) ?? -Infinity),
    collectors: () => {
      const out = myBoats().map((b) => ({ id: myBoatId(b), box: hullBox(b), boat: b })).filter((c) => c.box);
      if (deps.swimming?.()) { const f = deps.feet(); out.push({ id: SWIMMER, box: { c: [f[0], deps.seaY(), f[2]], ax: [1, 0, 0], ay: [0, 1, 0], az: [0, 0, 1], h: [...SWIM_REACH] } }); }
      return out;
    },
    onEvent: (e) => onShot(e),
    random,
  });

  let wireVolleys = [];
  let wireBarrels = [];
  const seenVolleys = new Map();
  const flownAt = new Map();
  const claims = new Map();
  const granted = new Map();
  const myCasks = new Set();
  const stolenCasks = new Set();
  const peerSelf = new Map();

  function sound(key, pos, vol = 1, opts = {}) {
    const o = { ...navalSoundRange(key), ...opts };
    const f = deps.feet();
    if (pos && f && Math.hypot(pos[0] - f[0], pos[1] - f[1], pos[2] - f[2]) > (o.maxDistance ?? 500)) return;
    try { deps.audio?.play3d?.(key, pos, vol, o); } catch {}
  }
  const burstScale = (p) => {
    const eye = deps.look?.()?.origin ?? deps.feet();
    return clamp(Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) / HIT_BURST_M, 1, HIT_BURST_MAX);
  };
  const farShare = (d) => clamp((d - (NEAR_BOOM_M - FAR_FADE_M)) / (2 * FAR_FADE_M), 0, 1);

  function boatOfShooter(id) {
    if (typeof id !== 'string') return null;
    if (isMine(id)) return myBoats().find((b) => myBoatId(b) === id) ?? null;
    if (id.startsWith('peer:')) { const owner = id.slice(5); return (deps.peerBoats?.() ?? []).find((p) => p.id === owner)?.boat ?? null; }
    return sea.get(id)?.boat ?? null;
  }

  // Her heel is taken on `pose`, the root as she fires: a sea ship's hull is posed after her captain's step, a frame
  // behind.
  function heeled(solution, pose, boat) {
    const mo = boat?.MeshObject, root = boat?.GameObject, up = mo?.parent;
    if (!mo || !root || !up || !solution?.muzzles?.length) return solution;
    const q = mo.localRotation, lp = mo.localPosition;
    const inv = [-pose.rotation[0], -pose.rotation[1], -pose.rotation[2], pose.rotation[3]];
    const muzzles = solution.muzzles.map((w) => {
      const r = quatRotate(inv, [w[0] - pose.position[0], w[1] - pose.position[1], w[2] - pose.position[2]]);
      const p = up.inverseTransformPoint(root.transformPoint(r));
      const h = quatRotate(q, [p[0] - lp[0], p[1] - lp[1], p[2] - lp[2]]);
      const o = quatRotate(pose.rotation, root.inverseTransformPoint(up.transformPoint([h[0] + lp[0], h[1] + lp[1], h[2] + lp[2]])));
      return [pose.position[0] + o[0], pose.position[1] + o[1], pose.position[2] + o[2]];
    });
    return { ...solution, muzzles };
  }

  /**
   * @param {{ shooter: string, wireShooter: number, hull: number, pose: any, solution: any, skill: number, resolve?: boolean }} v
   */
  function fire({ shooter, wireShooter, hull, pose, solution, skill, resolve = true }) {
    if (!solution) return 0;
    if (solution.barrel) {
      for (const drop of solution.landings) {
        const id = u32();
        shots.dropBarrel({ id: String(id), shooter, pos: drop.point, resolve });
        wireBarrels.push({ id, pos: [...drop.point], at: clock, shooter: wireShooter });
        sound(NAVAL_CLASSIC.splashSmall, drop.point, 0.5);
      }
      return solution.landings.length;
    }
    const seed = u32();
    const weight = shipBatteryWeight(hull, solution.side, isMine(shooter));
    const launches = volleyLaunches(heeled(solution, pose, boatOfShooter(shooter)), seed, { skill, carry: pose.velocity, weight });
    const id = u32();
    shots.fireVolley({ id: String(id), shooter, launches, resolve, side: solution.side });
    if (isMine(shooter)) tallies.fired(id, launches.length);
    wireVolleys.push({ id, shooter: wireShooter, hull, side: solution.side, pos: [...pose.position], yaw: yawOfRot(pose.rotation), vel: pose.velocity ?? [0, 0, 0], elevation: solution.elevation, seed, skill, at: clock,
      shot: solution.shot && solution.shot !== naturalShot(solution.gun) ? solution.shot : null });
    return launches.length;
  }

  function fireFromWord(owner, v, toScene) {
    const shooter = v.shooter >= 0 ? `${owner}:${v.shooter}` : `peer:${owner}`;
    const boat = boatOfShooter(shooter);
    // Peer volleys leave from the drawn ports, set back by her way over the volley age, since the drawn copy glides
    // between words.
    const drawn = boat?.GameObject, back = Math.max(0, (v.age ?? 0) / 1000);
    const pos = drawn ? drawn.position.map((x, k) => x - v.vel[k] * back) : toScene(v.pos);
    const pose = { position: pos, rotation: drawn ? drawn.rotation : quatOfYaw(v.yaw), velocity: v.vel, hull: v.hull };
    const solution = aimSolution(pose, v.side, null, deps.seaY(), { range: 1, shot: v.shot ?? null });
    if (!solution) return;
    if (solution.barrel) return;
    // Use the shooter's lay, never a range this client would pick.
    const g = GUNS[solution.gun];
    solution.elevation = clamp(v.elevation, g.minEl * NAVAL_DEG, g.maxEl * NAVAL_DEG);
    const weight = shipBatteryWeight(v.hull, v.side, v.shooter < 0);
    const launches = volleyLaunches(heeled(solution, pose, boat), v.seed, { skill: v.skill, carry: v.vel, weight });
    shots.fireVolley({ id: `${owner}:${v.id}`, shooter, launches, resolve: false, side: v.side, owner, since: (v.age ?? 0) / 1000 });
  }

  function onShot(e) {
    const seaY = deps.seaY();
    tallies.count(e);
    if (e.type === 'muzzle') {
      if ((e.index ?? 0) === 0) heardGun(e.pos, gunfireBy(e.shooter));
      if (e.side === 'starboard' || e.side === 'port') { const gb = boatOfShooter(e.shooter); if (gb) galleonGuns.fired(gb, e.side, e.index ?? 0, clock); }
      const scale = e.gun === 'heavy' ? 1.35 : e.gun === 'swivel' ? 0.55 : 1;
      effects.shotMuzzle(e.pos, e.dir, scale, e.shot);
      flashes.push({ pos: [...e.pos], t: clock });
      const mine = isMine(e.shooter);
      const n = Math.max(1, e.count ?? 1);
      const x = farShare(dist2d(e.pos, deps.feet()));
      const weight = e.gun === 'swivel' ? 0.7 : 1;
      if (x < 1) {
        const level = 10 ** (((random() - 0.5) * 2 * GUN_GAIN_JITTER_DB) / 20);
        const pitch = 1 + (random() - 0.5) * 2 * GUN_PITCH_JITTER;
        sound(e.gun === 'swivel' ? NAVAL_SFX.swivel : NAVAL_SFX.cannon, e.pos, weight * level * Math.cos(x * Math.PI / 2) / (mine ? Math.sqrt(n) : 1), { pitch });
      }
      if (x > 0 && (e.index ?? 0) === 0) sound(NAVAL_SFX.cannonFar, e.pos, weight * FAR_MATCH * Math.sin(x * Math.PI / 2) * (mine ? 1 : Math.sqrt(n)), { far: true });
      if (mine) deps.shake?.(GUN_KICK[e.gun] ?? GUN_KICK.long);
      return;
    }
    if (e.type === 'pass') { feel.passed(e); return; }
    if (e.type === 'splash') {
      effects.shotSplash([e.point[0], seaY, e.point[2]], e.gun === 'heavy', e.shot, burstScale(e.point));
      feel.splashed([e.point[0], seaY, e.point[2]]);
      if (dist2d(e.point, deps.feet()) < 220) sound(e.gun === 'heavy' ? NAVAL_CLASSIC.splashLarge : NAVAL_CLASSIC.splashSmall, e.point, 0.8);
      return;
    }
    if (e.type === 'land') { effects.hit(e.point, [0, 1, 0], false); return; }
    if ((e.type === 'hit' || e.type === 'blast') && segmentOfTarget(e.target) != null) {
      effects.splash(e.point, e.gun === 'heavy' || e.type === 'blast');
      if (e.type === 'blast') { effects.blast(e.point); sound(NAVAL_SFX.blast, e.point, 1); }
      else sound(NAVAL_CLASSIC.splashSmall, e.point, 0.8, isMine(e.shooter) ? { refDistance: HIT_CONFIRM_REF_M } : {});
      landHit(e);
      return;
    }
    if (e.type === 'hit' || e.type === 'blast') {
      if (e.type === 'blast') { effects.blast(e.point); sound(NAVAL_SFX.blast, e.point, 1); }
      else {
        const confirm = isMine(e.shooter) ? { refDistance: HIT_CONFIRM_REF_M } : {};
        if (e.zone === 'rig') { effects.shotTear(e.point, e.dir ?? [0, 0, 1], e.shot); sound(NAVAL_SFX.hit, e.point, 0.3, confirm); }
        else {
          effects.shotHit(e.point, e.dir ?? [0, 0, 1], e.gun === 'heavy', burstScale(e.point), e.shot); sound(NAVAL_SFX.hit, e.point, 0.9, confirm);
          effects.timber([e.point[0], seaY, e.point[2]], TIMBER_PER_HIT + (e.gun === 'heavy' ? 1 : 0));
        }
      }
      landHit(e);
      return;
    }
    if (e.type === 'pickup') { if (e.owner) claimCask(e); else pickFlotsam(e); }
  }

  function landHit(e) {
    const gun = e.type === 'blast' ? GUNS.barrel : struckGun(e.gun, GUNS[e.gun], e.shot, e.t, isMine(e.shooter) ? deps.captain?.stats?.() : null);
    if (!gun) return;
    const zone = e.type === 'blast' ? 'hull' : e.zone;
    const fire = e.type === 'blast' ? 'barrel' : (zone === 'hull' || (zone === 'rig' && shotRigFire(e.shot))) && random() < shotFireChance(e.shot, FIRE_CHANCE, gun.fireK);
    if (isMine(e.target)) {
      // Only the victim client takes a hit on its own boat, and never from a ball a player fired.
      if (e.shooter?.startsWith?.('peer:') || isMine(e.shooter)) return;
      const boat = myBoats().find((b) => myBoatId(b) === e.target);
      const st = myBoatState(boat);
      if (!st) return;
      const hurt = dueOnHull(shotDamage(gun, zone, { braced: st.guns.braced, roll: random(), tough: PLAYER_CREW_TOUGHNESS, weight: e.weight }));
      if (fire) hurt.fire = fire;
      const change = st.damage.apply(hurt, clock);
      if (boat === boatInPlay()) deps.shake?.(e.type === 'blast' ? BLAST_SHAKE : zone === 'holed' ? 2.5 : 1.6);
      if (boat === myBoat()) feel.struck(quatRotate(boatPose(boat).rotation, [0, 0, 1]), e.dir);
      if (change === SHIP_STATES.wrecked) deps.mid?.('Your ship is crippled! The sails hang in rags.', 3);
      return;
    }
    if (!e.resolve) return;
    const seg = segmentOfTarget(e.target);
    if (seg != null) {
      if (!isMine(e.shooter)) return;
      const hurt = { hull: gun.hull * (e.weight ?? 1) * (0.85 + 0.3 * random()), sail: 0, crew: 0 };
      if (e.type !== 'blast') gunsRefit(hurt, e.shooter);
      deps.serpent?.struck?.(seg, hurt.hull);
      return;
    }
    if (typeof e.target === 'string' && e.target.startsWith('peer:')) {
      if (!isMine(e.shooter)) return;
      const hurt = shotDamage(gun, zone, { roll: random(), weight: e.weight });
      if (e.type !== 'blast') gunsRefit(hurt, e.shooter);
      if (fire) hurt.fire = fire;
      pvp.shot(e.target.slice(5), hurt);
      return;
    }
    const target = sea.get(e.target);
    if (!target) return;
    const hurt = shotDamage(gun, zone, { roll: random(), weight: e.weight });
    if (fire) hurt.fire = fire;
    const byMe = isMine(e.shooter);
    if (byMe && e.type !== 'blast') gunsRefit(hurt, e.shooter);
    const stray = byMe && !target.owner && strayOnAlly(target, hurt, myId());
    if (byMe && !stray) chargePlayer('fire', target);
    if (byMe) target.myBlowAt = clock;
    if (target.owner) {
      // The ship owner lands the blow; men are rounded on this ball's roll, so the owner reckons them as I would.
      deps.sendHit?.(navalHitData(target.owner, { n: target.n, hull: hurt.hull, sail: hurt.sail, crew: Math.floor(shotMen(gun, zone) + random()), fire: hurt.fire ?? false, zone }));
      if (byMe) tallies.men(e, shotMen(gun, zone) / SHIP_TOUGHNESS);
      return;
    }
    const men = target.ship.damage.crew;
    strike(target, hurt, byMe ? myId() : e.shooter, undefined, stray);
    if (byMe) tallies.men(e, men - target.ship.damage.crew);
  }
  function gunsRefit(hurt, shooter) {
    const uid = Number(String(shooter).slice(MY_BOAT.length + 1));
    const refit = Number(uid > 0 ? deps.refit?.({ uid })?.guns : 1);
    const k = (Number.isFinite(refit) && refit > 0 ? refit : 1) * captainsDue().guns;
    if (k === 1) return;
    if (Number.isFinite(hurt.hull)) hurt.hull *= k;
    if (Number.isFinite(hurt.sail)) hurt.sail *= k;
  }
  function strayOnAlly(entry, hurt, by) {
    const s = entry.ship;
    if (s.cls.faction !== 'navy' || s.damage.state !== SHIP_STATES.afloat || s.mode !== 'engage' || sea.get(s.target)?.ship.cls.faction !== 'pirate') return false;
    if ((s.provoked.get(by) ?? -Infinity) > clock - PROVOKED_S) return false;
    entry.strays ??= new Map();
    const struck = (entry.strays.get(by) ?? 0) + Math.max(0, hurt.hull ?? 0);
    entry.strays.set(by, struck);
    if (struck > ALLY_STRAY_SHARE * s.damage.maxHull) return false;
    if (by === myId() && !entry.straySaid) { entry.straySaid = true; deps.say?.(`Check your fire! ${calledName(entry)} fights on your side.`, 4); }
    return true;
  }

  function strike(entry, hurt, by, byPlayer = by === myId(), stray = false) {
    const s = entry.ship;
    if (s.lashed) unlashPrize(entry);
    const striker = typeof by === 'string' ? sea.get(by)?.ship ?? null : null;
    if (!stray && (!striker || !kindred(striker, s))) provoke(s, by, clock);
    const floor = Math.max(hurt.floor ?? 0, entry.struck && entry.struck.by === by && clock - entry.struck.at <= STRUCK_GRACE_S ? 1 : 0);
    const before = s.damage.state;
    const change = s.damage.apply(hurt, clock, { floor });
    if (hurt.fire && s.damage.fire > 0) { igniteShip(entry); entry.fireBy = by; }
    if (byPlayer && !stray && s.cls.faction !== 'pirate') {
      const held = by === myId() ? deps.captain?.marque?.() ?? null : null;
      const signed = held && s.flag && s.flag !== held.crown ? held.crown : null;
      for (const w of sea.values()) if (w.ship.cls.faction === 'navy' && w.ship.flag !== signed && dist2d(w.ship.pos, s.pos) < WITNESS_RANGE) provoke(w.ship, by, clock);
    }
    if (change) stateChanged(entry, before, change, by);
  }
  function stateChanged(entry, before, change, by) {
    const s = entry.ship;
    const news = by === myId() || newsworthy(entry);
    if (change === SHIP_STATES.struck) {
      entry.struck = { by, at: clock };
      if (by === myId()) struckToMe();
      if (news) deps.say?.(`${s.names?.name ?? 'It'} surrenders!`, 4);
      sound(NAVAL_CLASSIC.bell, s.pos, 0.8);
    } else if (change === SHIP_STATES.sinking) {
      if (news) deps.say?.(`${s.names?.name ?? 'It'} is going down!`, 4);
      sound(NAVAL_CLASSIC.bubbles, s.pos, 1);
      if (before !== SHIP_STATES.sinking) onSinking(entry, by);
      feel.sinking(entry, s.seed, s.damage.fire > 0 || (entry.fires ?? []).some((f) => !f.out));
      if (boarding?.kind === 'board' && boarding.shipId === entry.id) founderUnderFight(entry);
    }
  }

  const kindred = (a, b) => a.cls.faction === b.cls.faction || (!!NAVAL_FACTIONS[a.cls.faction]?.lawful && !!NAVAL_FACTIONS[b.cls.faction]?.lawful);

  function distressAt(crown) {
    const at = new Map();
    const boat = boatInPlay();
    if (boat) at.set(myId(), { pos: boatPose(boat).position, law: notoriety.get(crown) });
    for (const p of deps.peerBoats?.() ?? []) if (Array.isArray(p.pos)) at.set(p.id, { pos: p.pos, law: peerSelf.get(p.id)?.law?.[crown] ?? 0 });
    for (const e of sea.values()) {
      const s = e.ship;
      if (e.owner || s.cls.faction !== 'pirate' || s.damage.state !== SHIP_STATES.afloat || (s.mode !== 'engage' && s.mode !== 'board')) continue;
      const p = at.get(s.target);
      if (!p || !(p.law < NAVY_HUNTS)) continue;
      const me = { kind: 'player', id: s.target, notoriety: () => p.law };
      const stood = [...sea.values()].some((w) => w.ship.cls.faction === 'navy' && w.ship.damage.state === SHIP_STATES.afloat
        && dist2d(w.ship.pos, p.pos) <= RELIEF_NEAR_M && !hostile(w.ship, me, { now: clock }));
      if (!stood) return [p.pos[0], p.pos[1], p.pos[2]];
    }
    return null;
  }

  function newsworthy(...entries) {
    const feet = deps.feet();
    return entries.some((x) => x && (x.ship.target === myId() || dist2d(x.ship.pos, feet) <= NEWS_RANGE));
  }
  const nameOf = (e) => e.ship.names?.name ?? withArticle(classLine(e.ship.cls, e.ship.names?.crown));

  // What I know of each ship stays on her entry and never goes on the wire: each player has their own view.
  let glassUp = false, glassZoom = GLASS_ZOOM, glassOn = null, glassHeld = 0;
  function disguiseOf(e) {
    const plain = !!e.plain;
    if (e.disguise && e.disguise.plain === plain) return e.disguise.as;
    const crown = falseFlagOf(e.ship.cls, e.ship.seed, e.ship.temper, { plain });
    const cls = crown ? merchantOfHull(e.ship.cls.hull) : null;
    const region = CROWNS_BY_NAME.get(crown)?.region ?? 17;
    const as = cls ? { flag: e.ether ? ISLES_FLAG : crown, name: (e.ether ? etherShipNames(cls, e.ship.seed) : shipNames(cls, e.ship.seed, { regionIndex: region })).name, line: classLine(cls) } : null;
    e.disguise = { plain, as };
    return as;
  }
  const falseFlagFor = (e) => disguiseOf(e)?.flag ?? null;
  const seaWho = (e) => ({ cls: e.ship.cls, seed: e.ship.seed, crown: e.ship.flag ?? null, legend: e.legend ?? null, disguise: falseFlagFor(e) });
  const knownOf = (e) => e?.known ?? KNOW.hull;
  const disguisedOf = (e) => !e.blackFlag && knownOf(e) < KNOW.studied && !!falseFlagFor(e);
  function shownName(e) {
    if (knownOf(e) < KNOW.colours) return unknownName(e.ship.hull);
    if (disguisedOf(e)) return disguiseOf(e).name;
    return e.ship.names?.name ?? classLine(e.ship.cls, e.ship.names?.crown);
  }
  function shownLine(e) {
    if (knownOf(e) < KNOW.colours) return hullWord(e.ship.hull).replace(/^./, (c) => c.toUpperCase());
    if (disguisedOf(e)) return disguiseOf(e).line;
    return classLine(e.ship.cls, e.ship.names?.crown);
  }
  const calledName = (e) => (knownOf(e) < KNOW.colours ? withArticle(hullWord(e.ship.hull)) : disguisedOf(e) ? shownName(e) : nameOf(e));
  function deckEye() {
    const deck = boatInPlay();
    const st = deck ? myBoatState(deck) : null;
    return { deck, sight: st?.worth?.sight ?? 1, lookout: !!deck?.crewed && !!st?.worth?.posts?.Lookout };
  }
  const engagedOf = (s) => s.damage.state === SHIP_STATES.afloat && (s.mode === 'engage' || s.mode === 'board');
  const veilOf = (e) => (e.legend && legendOfClass(e.ship.cls.id)?.trait === 'veiled' ? LEGEND_VEIL_K : 1);
  const reachOf = (e, reach) => (e.legend && legendOfClass(e.ship.cls.id)?.trait === 'veiled'
    ? { far: reach.far * LEGEND_VEIL_K, near: reach.near * LEGEND_VEIL_K, eye: reach.eye * LEGEND_VEIL_K, lookout: reach.lookout * LEGEND_VEIL_K } : reach);
  function knowStep() {
    const eye = deps.look?.()?.origin ?? deps.feet();
    const { deck, sight, lookout } = deckEye();
    const night = !!where().night;
    const me = meContact(), law = { notoriety: (c) => notoriety.get(c), now: clock };
    for (const e of sea.values()) {
      if (!e.boat) continue;
      const s = e.ship;
      const dist = dist2d(s.pos, eye);
      const reach = reachOf(e, glassReach({ night, lit: showsLight(e), sight, lookout }));
      const engaged = engagedOf(s);
      const onMe = s.target === myId() || boarding?.shipId === e.id;
      const gunsOut = s.runOut.size > 0 || gunfire.some((g) => g.by === e.id && clock - g.at <= GUNS_SEEN_S);
      const revealed = (engaged && onMe && gunsOut && hostile(s, me, law)) || !!e.relief;
      const was = knownOf(e);
      const held = glassUp && glassOn === e.id ? glassHeld : 0;
      const struck = s.damage.state !== SHIP_STATES.afloat || !!s.boarded || !!e.prize;
      e.known = knowledgeOf(was, { dist, reach, held, revealed, struck });
      if (was < KNOW.studied && e.known >= KNOW.studied && held > 0 && !struck) deps.captain?.event?.({ type: 'study', crown: watersCrown(), seed: e.ship.seed });
      const ff = engaged && !e.blackFlag ? falseFlagFor(e) : null;
      if (ff) {
        e.blackFlag = true;
        if (held > 0 || dist <= Math.max(reach.eye, reach.lookout)) deps.say?.(was === KNOW.colours ? `False colors! ${disguiseOf(e)?.name ?? 'The merchantman'} runs up the black flag!` : was >= KNOW.studied ? `${s.names?.name ?? 'It'} runs up the black flag!` : `${withArticle(hullWord(s.hull))} runs up the black flag!`, 4);
      }
      if (was >= e.known) continue;
      if (was < KNOW.colours && !held && lookout && dist > reach.eye && dist <= reach.lookout) {
        const colours = disguisedOf(e) ? coloursWords('merchant', falseFlagFor(e)) : coloursWords(s.cls.faction, s.flag);
        deps.say?.(`Lookout: ${withArticle(hullWord(s.hull))} flying ${colours}!`, 3);
        hailCalls.set(deck, `Flying ${colours}!`);
      }
      if (e.known >= KNOW.studied && !e.blackFlag && !e.seenThrough && falseFlagFor(e)) {
        e.seenThrough = true;
        if (held > 0 || dist <= Math.max(reach.eye, reach.lookout)) deps.mid?.(`False colors! ${s.names?.name ?? 'It'} is a pirate.`, 4);
      }
    }
  }
  let ownSpars = null;
  function ownExtent() {
    const boat = boatInPlay() ?? seaDeckUnderMe()?.boat ?? deps.aboardPeer?.() ?? null;
    const mo = boat?.MeshObject;
    if (!mo) return null;
    if (ownSpars?.boat !== boat || clock - ownSpars.at >= OWN_SPARS_S) {
      const spars = sparsOf(boat, deps.pool.models);
      if (!spars) return null;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const p of spars.points) for (let d = 0; d < 3; d++) { if (p[d] < lo[d]) lo[d] = p[d]; if (p[d] > hi[d]) hi[d] = p[d]; }
      ownSpars = { boat, at: clock, lo, hi };
    }
    const lo = [...ownSpars.lo], hi = [...ownSpars.hi];
    const take = (p) => { for (let d = 0; d < 3; d++) { if (p[d] < lo[d]) lo[d] = p[d]; if (p[d] > hi[d]) hi[d] = p[d]; } };
    for (const b of rigBoxesOf(boat)) {
      for (let i = 0; i < 8; i++) take(mo.inverseTransformPoint([0, 1, 2].map((d) => b.c[d] + (i & 1 ? 1 : -1) * b.ax[d] * b.h[0] + (i & 2 ? 1 : -1) * b.ay[d] * b.h[1] + (i & 4 ? 1 : -1) * b.az[d] * b.h[2])));
    }
    return orientedBox(mo.worldMatrix(), [0, 1, 2].map((d) => (lo[d] + hi[d]) / 2), [0, 1, 2].map((d) => (hi[d] - lo[d]) / 2));
  }
  function glass(dt, { up = false, zoom = GLASS_ZOOM, field = Math.PI, near = 0 } = {}) {
    glassUp = !!up && enabled;
    glassZoom = clamp(Number(zoom) || GLASS_ZOOM, GLASS_ZOOM_MIN, GLASS_ZOOM_MAX);
    if (!glassUp) { glassOn = null; glassHeld = 0; return null; }
    const look = deps.look?.();
    if (!look) return null;
    const len = Math.hypot(look.dir[0], look.dir[1], look.dir[2]) || 1;
    const d = [look.dir[0] / len, look.dir[1] / len, look.dir[2] / len];
    const night = !!where().night;
    let best = null, bestA = Infinity;
    for (const e of sea.values()) {
      if (!e.boat || e.ship.damage.state === SHIP_STATES.sunk || (e.retiring && (e.fade ?? 1) < FADE_FLATS)) continue;
      const p = e.ship.pos;
      const to = [p[0] - look.origin[0], p[1] + GLASS_AIM_LIFT - look.origin[1], p[2] - look.origin[2]];
      const dist = Math.hypot(to[0], to[1], to[2]);
      if (dist < Math.max(1, near)) continue;
      if (night && dist > reachOf(e, glassReach({ night, lit: showsLight(e), sight: Infinity })).far) continue;
      const a = Math.acos(clamp((to[0] * d[0] + to[1] * d[1] + to[2] * d[2]) / dist, -1, 1));
      const b = hullBuild(e.ship.hull), off = Math.atan2(to[0], to[2]) - e.ship.yaw;
      const half = ((b.bowZ - b.aftZ) / 2) * Math.abs(Math.sin(off)) + b.halfWidth * Math.abs(Math.cos(off));
      if (!glassHolds(a, dist, half, glassZoom, field)) continue;
      if (a < bestA && !deps.sightBlocked?.(e.id, [p[0], p[1] + GLASS_AIM_LIFT, p[2]])) { bestA = a; best = e; }
    }
    if ((best?.id ?? null) !== glassOn) { glassOn = best?.id ?? null; glassHeld = 0; }
    if (!best) return null;
    glassHeld += Math.max(0, dt);
    return glassCardOf(best);
  }
  const siteStood = new Map();
  let lastSiteCheck = -Infinity;
  const watersCrown = () => { const w = where(); return w.ether ? null : crownOf(w.px ?? 0, w.py ?? 0, w.capitals ?? null, w.region ?? -1).name; };
  function sitePos(site, minM) {
    const f = deps.feet();
    const p = deps.sitePoint?.(site.px, site.py, site.seed) ?? null;
    const cand = p ? [p] : [];
    const a0 = p ? Math.atan2(p[0] - f[0], p[2] - f[2]) : ((site.seed >>> 0) % 360) * (Math.PI / 180);
    for (let k = 0; k < 12; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
      cand.push([f[0] + Math.sin(a) * SITE_AHEAD_M, deps.seaY(), f[2] + Math.cos(a) * SITE_AHEAD_M]);
    }
    return cand.find((q) => dist2d(q, f) >= minM && deps.isWater(q[0], q[2], 0)) ?? null;
  }
  function quarryGone(e) {
    if (e.owner || !e.bounty || e.charged?.has('sink') || e.charged?.has('board')) return;
    siteStood.set(e.bounty, 'ended');
    deps.captain?.event?.({ type: 'lost', bounty: e.bounty });
  }
  function standQuarry(site) {
    const cls = classById(site.classId);
    const pos = cls ? sitePos(site, SITE_AHEAD_M * 0.6) : null;
    if (!pos) return null;
    const f = deps.feet();
    const e = launch({ seed: site.seed >>> 0, classId: cls.id, variant: 0, pos, yaw: Math.atan2(f[0] - pos[0], f[2] - pos[2]), region: site.region });
    if (!e) return null;
    e.bounty = site.id; e.plain = true; e.ship.temper = TEMPERS.bold;
    return e;
  }
  function alongsidePos(site) {
    const f = deps.feet();
    const a0 = ((site.seed >>> 0) % 360) * (Math.PI / 180);
    for (let k = 0; k < 12; k++) {
      const a = a0 + k * (Math.PI / 6);
      const q = [f[0] + Math.sin(a) * STRAND_ALONGSIDE_M, deps.seaY(), f[2] + Math.cos(a) * STRAND_ALONGSIDE_M];
      if (deps.isWater(q[0], q[2], 0)) return q;
    }
    return null;
  }
  function dropSiteCasks(site) {
    const c = site.kind === 'strand' ? alongsidePos(site) : sitePos(site, 0);
    if (!c) return false;
    const r = mulberry32(((site.seed >>> 0) ^ 0x5a1e5) >>> 0);
    for (let i = 0; i < site.n; i++) {
      const a = r() * Math.PI * 2, d = 6 + r() * SITE_CASK_SPREAD;
      const x = c[0] + Math.sin(a) * d, z = c[2] + Math.cos(a) * d, wet = deps.isWater(x, z, 0);
      shots.dropFlotsam({ id: String(u32()), pos: wet ? [x, deps.seaY(), z] : [c[0], deps.seaY(), c[2]], lot: SITE_LOT + site.id, from: 'merchantGalleon', life: SITE_CASK_LIFE });
    }
    return true;
  }
  const SITE_WORDS = Object.freeze({
    cache: 'Your lookout spots a chest bobbing where the chart said. The cache!',
    salvage: 'Wreckage and floating casks. This is the wreck the harbormaster wants raised.',
    strand: 'Your boat goes ashore and comes back with its haul. The casks float alongside.',
  });
  function siteStep(boat) {
    if (clock - lastSiteCheck < SITE_CHECK_S) return;
    lastSiteCheck = clock;
    const w = where();
    berths.step(boat, w.port);
    const sites = deps.captain?.sites?.() ?? [];
    const live = new Set(sites.map((x) => x.id));
    for (const id of [...siteStood.keys()]) if (!live.has(id)) siteStood.delete(id);
    if (!aboardShip() || !Number.isFinite(w.px) || !Number.isFinite(w.py)) return;
    for (const site of sites) {
      if (Math.max(Math.abs(site.px - w.px), Math.abs(site.py - w.py)) > SITE_REACH_PX) continue;
      const was = siteStood.get(site.id);
      if (site.kind === 'bounty') {
        if (was === 'ended' || (was && sea.has(was))) continue;
        const e = standQuarry(site);
        if (e) { siteStood.set(site.id, e.id); deps.say?.('Sails, right where the board said!', 4); }
      } else if ((site.kind === 'salvage' || site.kind === 'cache' || site.kind === 'strand') && site.n > 0) {
        if (shots.floaters().some((x) => x.lot === SITE_LOT + site.id)) continue;
        if (dropSiteCasks(site)) { siteStood.set(site.id, 'casks'); deps.say?.(site.word ?? SITE_WORDS[site.kind], 4); }
      }
    }
  }
  function glassCardOf(e) {
    const s = e.ship;
    const dist = dist2d(s.pos, deps.look?.()?.origin ?? deps.feet());
    const stance = stanceOf(s);
    const engaged = stance.hostile && engagedOf(s);
    const v = velocityOf(s);
    const known = knownOf(e);
    const { sight, lookout } = deckEye();
    const reach = reachOf(e, glassReach({ night: !!where().night, lit: showsLight(e), sight, lookout }));
    const [needS, needM] = known < KNOW.colours ? [GLASS_STUDY_S, reach.far] : [GLASS_STUDY_NEAR_S, reach.near];
    const short = known < KNOW.studied && dist > needM;
    return glassCard({
      hull: s.hull, name: s.names?.name ?? classLine(s.cls, s.names?.crown), classLine: classLine(s.cls, s.names?.crown), faction: s.cls.faction,
      flag: s.flag, falseFlag: e.blackFlag ? null : falseFlagFor(e), falseName: e.blackFlag ? null : disguiseOf(e)?.name ?? null, falseLine: e.blackFlag ? null : disguiseOf(e)?.line ?? null, temper: s.temper, mode: s.mode, hostile: engaged, friendly: stance.friendly, bound: boundOf(e),
      distance: dist, speed: Math.hypot(v[0], v[2]), crew: s.damage.crew, hullShare: s.damage.hullShare(), sailShare: s.damage.maxSail > 0 ? s.damage.sailShare() : null,
      fire: s.damage.fire > 0, cargo: holdShownOf(e), bounty: deps.bountyOf?.(e) ?? null, lore: (e.legend ? legendOfClass(s.cls.id)?.lore : null) ?? deps.loreOf?.(e) ?? null,
    }, known, { study: short ? 0 : Math.min(1, glassHeld / needS), within: short ? needM : null });
  }
  const holdShownOf = (e) => (e.prize?.hold && !e.prize.hold.length ? 0 : e.ship.cls.cargo + (e.deep ? DEEP_TIER : 0) + etherTier(e));
  let gunfire = [];
  const gunfireBy = (shooter) => (isMine(shooter) ? myId() : typeof shooter === 'string' && shooter.startsWith('peer:') ? shooter.slice(5) : shooter);
  const showsLight = (e) => shipLit(e) || gunfire.some((g) => g.by === e.id && clock - g.at <= GUNS_SEEN_S);
  function heardGun(pos, by) {
    gunfire = gunfire.filter((g) => clock - g.at <= HEAR_S);
    if (gunfire.length >= GUNFIRE_KEEP) gunfire.shift();
    gunfire.push({ pos: [pos[0], pos[1], pos[2]], at: clock, by: by ?? null });
  }
  function lashPrize(victor, prize) {
    if (prize.owner || prize.takenBy || prize.ship.damage.state !== SHIP_STATES.struck || boarding?.shipId === prize.id) return;
    victor.ship.lashed = { id: prize.id, until: clock + PRIZE_TAKE_S };
    prize.takenBy = victor.id;
    if (newsworthy(victor, prize)) deps.say?.(`${calledName(victor)} grapples ${calledName(prize)}!`, 3);
  }
  function unlashPrize(victor) {
    const p = victor.ship.lashed ? sea.get(victor.ship.lashed.id) : null;
    if (p?.takenBy === victor.id) p.takenBy = null;
    victor.ship.lashed = null;
  }
  function stepPrizes() {
    for (const v of sea.values()) {
      const l = v.ship.lashed;
      if (!l) continue;
      const p = sea.get(l.id);
      if (!p || p.takenBy !== v.id || p.ship.damage.state !== SHIP_STATES.struck || boarding?.shipId === p.id || v.ship.damage.state !== SHIP_STATES.afloat) { unlashPrize(v); continue; }
      if (clock < l.until) continue;
      v.ship.lashed = null;
      v.ship.spare.set(p.id, v.ship.clock + SPARE_S);
      const lost = Math.min(Math.max(0, v.ship.damage.crew - 1), Math.round(p.ship.damage.crew * PRIZE_COST));
      if (lost > 0) v.ship.damage.apply({ hull: 0, sail: 0, crew: lost }, clock);
      p.ship.damage.scuttle();
      p.ship.damage.apply({ hull: 0, sail: 0, crew: 0, fire: true }, clock);
      igniteShip(p);
      sound(NAVAL_CLASSIC.bubbles, p.ship.pos, 1);
      if (newsworthy(v, p)) deps.say?.(`${calledName(v)} takes ${calledName(p)} and sets it on fire!`, 4);
    }
  }

  const tallies = createVolleyTally({ clock: () => clock, onSea: (id) => sea.has(id) });

  function runOutTell(entry, side) {
    const bat = batteryOf(entry.ship.hull, side);
    if (!bat) return;
    const pose = { position: entry.ship.pos, rotation: quatOfYaw(entry.ship.yaw) };
    const mid = toWorld(pose, bat.muzzles[bat.muzzles.length >> 1]);
    sound(NAVAL_SFX.runout, mid, 1);
  }
  function glintRunOut(entry, d, seaY) {
    const s = entry.ship;
    if (!s.runOut?.size || !entry.boat) return;
    const pose = { position: [s.pos[0], seaY, s.pos[2]], rotation: quatOfYaw(s.yaw) };
    for (const [side, since] of s.runOut) {
      const bat = batteryOf(s.hull, side);
      if (!bat) continue;
      const k = clamp((clock - since) / RUN_OUT_S, 0, 1);
      for (const m of bat.muzzles) effects.glint(toWorld(pose, m), k, d);
    }
  }
  function bearsOn(s, side, p) {
    const bat = batteryOf(s.hull, side);
    if (!bat || bat.gun === 'barrel') return false;
    const dx = p[0] - s.pos[0], dz = p[2] - s.pos[2];
    const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - s.yaw - (side === 'starboard' ? Math.PI / 2 : side === 'port' ? -Math.PI / 2 : 0))) / NAVAL_DEG;
    if (off > (side === 'bow' ? BOW_RUN_OUT : RUN_OUT_DEG) + INCOMING_SLACK) return false;
    const g = GUNS[bat.gun];
    return Math.hypot(dx, dz) <= rangeAt(g.maxEl * NAVAL_DEG, g.speed, bat.muzzles[0][1]) * 1.05;
  }
  let inbound = [];
  function noteInbound(e, side) {
    const boat = myBoat();
    if (!boat) return;
    const p = boatPose(boat).position;
    if (!bearsOn(e.ship, side, p)) return;
    const g = GUNS[batteryOf(e.ship.hull, side).gun];
    inbound.push({ name: e.ship.names?.name ?? 'A ship', side, until: clock + dist2d(e.ship.pos, p) / Math.max(1, g.speed * 0.9) + (batteryOf(e.ship.hull, side).muzzles.length - 1) * RIPPLE_S + 0.3 });
  }
  function incoming(boat) {
    if (!boat) return null;
    const p = boatPose(boat).position;
    inbound = inbound.filter((v) => v.until > clock);
    let best = inbound.length ? { name: inbound[0].name, side: inbound[0].side, t: 0 } : null;
    for (const e of sea.values()) {
      const s = e.ship;
      if (!s.runOut?.size || s.damage.state !== SHIP_STATES.afloat) continue;
      for (const [side, since] of s.runOut) {
        if (!bearsOn(s, side, p)) continue;
        const t = Math.max(0, RUN_OUT_S - (clock - since));
        if (!best || t < best.t) best = { name: s.names?.name ?? 'A ship', side, t: +t.toFixed(1) };
      }
    }
    return best;
  }

  const lawfulGoods = (entry) => !entry.ether && !!NAVAL_FACTIONS[entry.ship.cls.faction]?.lawful;

  function onSinking(entry, by) {
    const s = entry.ship;
    const drop = (lot, near, far) => {
      const a = random() * Math.PI * 2, r = near + random() * (far - near);
      const id = String(u32());
      shots.dropFlotsam({ id, pos: [s.pos[0] + Math.sin(a) * r, deps.seaY(), s.pos[2] + Math.cos(a) * r], lot, from: s.cls.id, deep: !!entry.deep || !!entry.ether });
      if (by === myId()) myCasks.add(id);
      if (by === myId() && lawfulGoods(entry)) stolenCasks.add(id);
    };
    for (const key of flotsamKeys(s.cls, s.seed)) drop(key, 6, 16);
    drop(SALVAGE_LOT, 3, 8);
    if (by === myId()) chargePlayer('sink', entry);
  }

  function chargePlayer(act, entry, { questPays = false } = {}) {
    const s = entry.ship;
    entry.charged ??= new Set();
    if (entry.charged.has(act)) return;
    entry.charged.add(act);
    if (entry.ether) { chargeEther(act, entry); return; }
    const lawful = !!NAVAL_FACTIONS[s.cls.faction]?.lawful;
    const held = lawful ? deps.captain?.marque?.() ?? null : null;
    const under = held && s.flag && s.flag !== held.crown ? held.crown : null;
    if (held && s.flag === held.crown) {
      deps.captain?.tearMarque?.();
      deps.mid?.(`You attacked a ship of ${held.crown}. Your letter of marque is revoked.`, 4);
    }
    const crown = under ? s.flag : crownOfShip(s);
    const law = lawOf(act, s.cls, { crown, firstStrike: act === 'fire' });
    const paid = (act === 'sink' || act === 'board') && entry.charged.has('repel');
    for (const c of law.crimes) { deps.law?.crime?.(c.region, c.crime); deps.say?.(`Piracy! The crown of ${crown} will hear of this.`, 4); }
    for (const n of law.notoriety) notoriety.add(n.crown, n.add);
    for (const r of questPays || paid ? [] : law.rewards) {
      if (r.legal) deps.law?.legal?.(r.region, r.legal);
      if (r.knightly) deps.law?.faction?.(KNIGHTLY_FACTION, r.knightly);
      if (r.temple) deps.law?.faction?.(TEMPLE_FACTION, r.temple);
    }
    const cap = deps.captain;
    if (!cap) return;
    cap.deed?.(act, s.cls, paid ? { crown: null } : { crown, marque: under });
    if (under) cap.regard?.(s.flag, standingFor(act, s.cls));
    if (act === 'sink' || act === 'board') cap.event?.({ type: 'end', act, faction: s.cls.faction, crown, bounty: entry.bounty ?? null });
    const chart = act === 'sink' || act === 'board' ? cap.chartFor?.(s.cls, s.seed, !!entry.deep) ?? null : null;
    if (chart) {
      deps.board?.giveItems?.([chart], boatInPlay() ?? null, { force: true });
      deps.say?.(act === 'sink' ? 'A sealed chart case floats up from the wreck and your crew fishes it out. A treasure chart!' : 'Among the captain\'s papers: a treasure chart!', 5);
    }
  }

  function chargeEther(act, entry) {
    const s = entry.ship, cap = deps.captain;
    if (!cap) return;
    const legend = entry.legend ? legendOfClass(s.cls.id) : null;
    cap.deed?.(act, s.cls, { trade: legend ? 'legend' : 'ether', legend: legend?.name ?? null });
    if (act !== 'sink' && act !== 'board') return;
    cap.event?.({ type: 'end', act, faction: s.cls.faction, crown: null, bounty: entry.bounty ?? null });
    if (legend) legendTidemail(legend, s.seed, deps.ether?.legendEnded?.(legend.id, act), { give: (items) => deps.board?.giveItems?.(items, boatInPlay() ?? null, { force: true }), say: (text, n) => deps.say?.(text, n) });
    else if (s.cls.faction === 'pirate') { const w = where(); deps.ether?.papers?.(s.cls, s.seed, w.px, w.py); }
    treasureFleet.ended(entry, act);
  }
  function crownOfShip(s) {
    const w = where();
    return s.names?.crown ?? crownOf(w.px ?? 0, w.py ?? 0, w.capitals ?? null, w.region ?? -1).name;
  }
  function igniteShip(entry) {
    if (entry.fires?.length || !deps.flame) return;
    entry.fires = [];
    const spots = entry.ship.hull === 1 ? 1 : 3;
    for (let i = 0; i < spots; i++) {
      const at = (i - (spots - 1) / 2) * 0.5;
      entry.fires.push({ at, handle: deps.flame(entry.ship.pos) });
    }
  }
  function douse(entry) {
    for (const f of entry.fires ?? []) f.handle?.retire?.();
    entry.fires = null;
    entry.fireLoop?.stop?.();
    entry.fireLoop = null;
  }

  function pickFlotsam(e) {
    const swim = e.collector === SWIMMER;
    const boat = swim ? null : myBoats().find((b) => myBoatId(b) === e.collector) ?? myBoat();
    if (isSalvage(e.lot)) { pickSalvage(e, boat, swim); return; }
    if (isSiteLot(e.lot) && e.lot.startsWith(SITE_LOT + CHART_SITE)) { pickCache(e, boat, swim); return; }
    if (isSiteLot(e.lot) && e.lot.startsWith(SITE_LOT + STRAND_SITE)) { pickStrand(e, boat, swim); return; }
    if (isSiteLot(e.lot)) {
      deps.say?.(swim ? 'You pull a cask of the wreck\'s cargo out of the sea.' : 'You haul a cask of the wreck\'s cargo aboard.', 3);
      deps.captain?.event?.({ type: 'haul', site: e.lot.slice(SITE_LOT.length) });
      sound(NAVAL_CLASSIC.splashSmall, e.point, 0.6);
      return;
    }
    const items = deps.hold?.(e.lot, holdTier(classById(e.from)) + (e.deep ? DEEP_TIER : 0)) ?? [];
    if (e.id != null && stolenCasks.delete(e.id)) markStolen(items);
    if (items.length) { deps.board?.giveItems?.(items, boat ?? null); crewEvent(boat, 'plunder'); notePlunder(items); }
    const things = `${items.length} ${items.length === 1 ? 'thing' : 'things'}`;
    deps.say?.(swim ? (items.length ? `You break open a floating cask (${things} in it).` : 'You break open a floating cask. It is empty.')
      : items.length ? `You haul a floating cask aboard (${things} in it).` : 'You haul a floating cask aboard. It is empty.', 3);
    sound(NAVAL_CLASSIC.splashSmall, e.point, 0.6);
  }

  function pickStrand(e, boat, swim) {
    const r = deps.ether?.gather?.(e.lot.slice(SITE_LOT.length)) ?? { items: [], text: '' };
    if (r.items.length) { deps.board?.giveItems?.(r.items, boat ?? null); crewEvent(boat, 'plunder'); }
    const how = swim ? 'You break open a cask in the water' : 'You haul a cask aboard';
    deps.say?.(r.text ? `${how}: ${r.text}` : `${how}. It is empty.`, 4);
    if (e.point) sound(NAVAL_CLASSIC.splashSmall, e.point, 0.6);
  }
  function pickCache(e, boat, swim) {
    const items = [];
    for (let i = 0; i < CACHE_LOTS; i++) for (const it of deps.hold?.(STRONGBOX_KEY, STRONGBOX_RARITY_TIER) ?? []) items.push(it);
    const r = items.length ? deps.board?.giveItems?.(items, boat ?? null, { force: true }) ?? null : null;
    if (items.length) notePlunder(items);
    const gold = deps.captain?.raiseCache?.(e.lot.slice(SITE_LOT.length)) ?? 0;
    deps.say?.(`You ${swim ? 'drag' : 'haul'} up the cache: ${gold ? `${gold} gold and ` : ''}${items.length} ${items.length === 1 ? 'thing' : 'things'}${r?.over ? ' (more than you can carry)' : ''}.`, 5);
    if (e.point) sound(NAVAL_CLASSIC.splashSmall, e.point, 0.6);
  }
  function pickSalvage(e, boat, swim) {
    const into = swim ? boatInPlay() : boat ?? boatInPlay();
    const r = stowSalvage(salvageOf(classById(e.from)), into);
    const got = [r.stores ? `${r.stores} carpenter's ${r.stores === 1 ? 'store' : 'stores'}` : null, r.barrels ? `${r.barrels} fire ${r.barrels === 1 ? 'barrel' : 'barrels'}` : null].filter(Boolean);
    const head = !swim ? 'You haul the wreckage aboard' : into ? 'You pick through the wreckage and pass it up aboard' : 'You pick through the wreckage';
    const heavy = (n) => `${n} carpenter's ${n === 1 ? 'store is' : 'stores are'} too heavy to carry and ${n === 1 ? 'goes' : 'go'} down with the wreck`;
    if (got.length) deps.say?.(`${head}: ${got.join(' and ')}.`, 3);
    if (r.lost) deps.say?.(got.length ? `${heavy(r.lost)}.` : `${head}, but ${heavy(r.lost)}.`, 3);
    if (!got.length && !r.lost) deps.say?.(`${head}. Nothing in it is worth keeping.`, 3);
    if (r.stores || r.barrels) crewEvent(into, 'plunder');
    if (e.point) sound(NAVAL_CLASSIC.splashSmall, e.point, 0.6);
  }
  function stowSalvage(got, boat) {
    let stores = 0, barrels = 0, lost = 0;
    if (got.stores > 0) {
      const items = Array.from({ length: got.stores }, () => mintStores(1));
      const r = deps.board?.giveItems?.(items, boat ?? null) ?? { left: items };
      lost = Math.min(got.stores, Array.isArray(r.left) ? r.left.length : 0);
      stores = got.stores - lost;
    }
    if (boat && got.barrels > 0 && batteriesOf(boat.hull).some((x) => x.gun === 'barrel')) {
      const st = myBoatState(boat);
      barrels = Math.max(0, Math.min(got.barrels, BARREL.stock - st.guns.barrels));
      st.guns.barrels += barrels;
    }
    return { stores, barrels, lost };
  }

  function claimCask(e) {
    const raw = Number(e.id.slice(e.owner.length + 1));
    claims.set(e.id, { owner: e.owner, raw, lot: e.lot, from: e.from, deep: !!e.deep, collector: e.collector, point: [...e.point], at: clock, said: clock });
    deps.sendHit?.(navalHitData(e.owner, { n: 0, cask: raw }));
  }
  function tendClaims() {
    for (const [id, c] of claims) {
      if (clock - c.at > CLAIM_WAIT_S) claims.delete(id);
      else if (clock - c.said >= CLAIM_AGAIN_S) { c.said = clock; deps.sendHit?.(navalHitData(c.owner, { n: 0, cask: c.raw })); }
    }
    for (const [raw, g] of granted) if (clock - g.at > GRANT_KEEP_S) granted.delete(raw);
  }
  // The first claimer gets the cask; the same claimer asking again is answered again.
  function caskClaimed(from, raw) {
    const given = granted.get(raw);
    if (given) {
      if (given.to === from) deps.sendHit?.(navalHitData(from, { n: 0, cask: raw, answer: true }));
      return given.to === from;
    }
    const f = shots.floater(String(raw));
    if (!f || f.kind !== 'flotsam' || f.owner) return false;
    shots.removeFloater(f.id);
    granted.set(raw, { to: from, at: clock });
    deps.sendHit?.(navalHitData(from, { n: 0, cask: raw, answer: true }));
    return true;
  }
  // The lot is drawn once, whatever answer comes again.
  function caskAnswered(from, raw) {
    const id = `${from}:${raw}`;
    const c = claims.get(id);
    if (!c) return false;
    claims.delete(id);
    pickFlotsam({ lot: c.lot, from: c.from, deep: c.deep, collector: c.collector, point: c.point });
    return true;
  }
  function applyCasks(owner, casks, toScene) {
    const said = new Set();
    for (const c of casks) {
      const id = `${owner}:${c.id}`;
      said.add(id);
      if (claims.has(id)) continue;
      const pos = toScene(c.pos);
      let f = shots.floater(id);
      if (!f) {
        const was = shots.floaters().find((o) => o.kind === 'flotsam' && o.owner && o.owner !== owner && o.id === `${o.owner}:${c.id}`);
        f = was ? shots.floater(was.id) : null;
        if (f) { f.id = id; f.owner = owner; f.orphanAt = null; }
      }
      if (f) { f.pos[0] = pos[0]; f.pos[2] = pos[2]; f.deep = !!c.deep; }
      else shots.dropFlotsam({ id, pos, lot: c.lot, from: c.from, owner, deep: !!c.deep });
    }
    for (const f of shots.floaters()) if (f.kind === 'flotsam' && f.owner === owner && !said.has(f.id)) shots.removeFloater(f.id);
  }
  function releaseCasks(owner, heir) {
    for (const o of shots.floaters()) {
      if (o.kind !== 'flotsam' || o.owner !== owner) continue;
      const f = shots.floater(o.id);
      if (heir) { f.id = o.id.slice(owner.length + 1); f.owner = null; f.orphanAt = null; }
      else f.orphanAt ??= clock;
    }
  }

  function launch(spec, owner = null, n = null) {
    const w = where();
    const cls = classById(spec.classId);
    if (!cls) return null;
    // Her names come from the region her owner drew them in, so every client names her the same.
    const region = Number.isInteger(spec.region) && spec.region >= 0 ? spec.region
      : cls.faction === 'navy' ? crownOf(w.px ?? 0, w.py ?? 0, w.capitals ?? null, w.region ?? -1).region : (w.region ?? 17);
    const crown = cls.faction === 'navy' ? crownOf(0, 0, null, region) : null;
    const legend = legendOfClass(cls.id);
    const ether = spec.ether ?? (legend || w.ether ? w.ether?.band ?? 'shallows' : null);
    const names = ether ? etherShipNames(cls, spec.seed) : shipNames(cls, spec.seed, { regionIndex: region, crown });
    const num = n ?? nextNumber();
    const id = owner ? `${owner}:${num}` : `${myId()}:${num}`;
    const ship = createSeaShip({ id, seed: spec.seed, classId: spec.classId, variant: spec.variant ?? 0, pos: spec.pos, yaw: spec.yaw ?? 0, names, owner, errand: spec.errand ?? null });
    ship.flag = ether ? etherFlagOf(cls) : flagOf(cls, spec.seed, region);
    if (spec.deep) ship.temper = temperOf(cls, spec.seed, { bold: DEEP_BOLD });
    else if (ether && cls.faction === 'pirate') ship.temper = temperOf(cls, spec.seed, { bold: etherBold(ether) });
    if (legend) ship.temper = TEMPERS.bold;
    const entry = { id, n: num, owner, gen: Math.max(0, Math.min(NAVAL_GEN_MAX, spec.gen | 0)), region, deep: !!spec.deep, ether, legend: legend?.id ?? null, orphan: null, ship, boat: null, fires: null, fireLoop: null, sinkLoop: null, target: null, seen: clock, charged: null, myBlowAt: -Infinity, grappleAt: -Infinity, hunter: !!spec.hunter, phase: spec.phase ?? random() * 6.28, lifeDt: 0, lifeN: num % FAR_LIFE_EVERY, list: null, wake: false, deck: null, prize: null, lost: false, sinkUnder: null, colours: null, fade: 0, retiring: false };
    const heard = legend && [...sea.values()].some((x) => x.legend === legend.id && x.ship.damage.state !== SHIP_STATES.sunk);
    sea.set(id, entry);
    if (legend && !heard) deps.mid?.(`The sea goes still. A sail on the horizon: ${legend.name}. ${legend.lore}`, 6);
    return entry;
  }
  function etherCtx(w) {
    if (!w.ether) return null;
    const band = BANDS.find((b) => b.id === w.ether.band) ?? BANDS[0];
    const l = deps.ether?.legendHere?.(w.px, w.py, { night: !!w.night }) ?? null;
    return { band, legend: l ? { id: l.id, classId: l.classId } : null };
  }
  function legendMend(e, d) {
    const s = e.ship;
    if (legendOfClass(s.cls.id)?.trait !== 'mends' || s.damage.state !== SHIP_STATES.afloat || s.damage.fire > 0) return;
    if (clock - s.damage.lastHitAt < LEGEND_MEND_QUIET_S || s.damage.hull >= s.damage.maxHull) return;
    s.damage.repair({ hull: s.damage.maxHull * LEGEND_MEND_PER_S * d, sail: 0, crew: 0 });
  }
  const etherTier = (entry) => (entry.ether ? BANDS.find((b) => b.id === entry.ether)?.tier ?? 0 : 0);
  const etherBold = (band) => [0.3, 0.45, 0.6, 0.8][Math.max(0, BANDS.findIndex((b) => b.id === band))];
  function drop(entry) {
    douse(entry);
    entry.sinkLoop?.stop?.();
    entry.sinkLoop = null;
    for (const h of entry.deck ?? []) deps.board?.removeFoe?.(h);
    entry.deck = null;
    if (entry.boat) deps.pool.remove(entry.boat);
    sea.delete(entry.id);
  }
  function retire(entry) {
    entry.retiring = true;
  }
  function fadeStep(entry, dt) {
    const s = entry.ship;
    if (entry.retiring && !entry.owner && ((s.damage.state === SHIP_STATES.afloat && (s.mode === 'engage' || s.mode === 'board')) || boarding?.shipId === entry.id)) entry.retiring = false;
    const k = dt / SHIP_FADE_S;
    entry.fade = entry.retiring ? Math.max(0, (entry.fade ?? 1) - k) : Math.min(1, (entry.fade ?? 1) + k);
    if (entry.boat) entry.boat.fade = entry.fade;
    if (entry.retiring && entry.fade <= 0) drop(entry);
  }
  // Sixteen bits, as the wire carries it.
  function nextNumber() {
    for (let i = 0; i < 0x10000; i++) {
      seq = (seq + 1) & 0xffff;
      if (!ownByN(seq)) return seq;
    }
    return seq;
  }
  function ownByN(n) {
    for (const e of sea.values()) if (!e.owner && e.n === n) return e;
    return null;
  }
  function bySeed(seed, classId, except) {
    for (const e of sea.values()) if (e.id !== except && e.ship.seed === seed && e.ship.cls.id === classId && e.ship.damage.state !== SHIP_STATES.sunk) return e;
    return null;
  }
  function rekey(e, owner, n, gen) {
    sea.delete(e.id);
    e.owner = owner; e.n = n; e.gen = Math.max(0, Math.min(NAVAL_GEN_MAX, gen | 0));
    e.id = owner ? `${owner}:${n}` : `${myId()}:${n}`;
    e.ship.id = e.id; e.ship.owner = owner;
    e.lost = false; e.orphan = null; e.seen = clock;
    sea.set(e.id, e);
    return e;
  }
  function adopt(e) {
    if (!e.owner) return e;
    rekey(e, null, nextNumber(), e.gen + 1);
    e.target = null;
    e.ship.boarded = false;
    // Her errand is not on the wire, so it is drawn again here as her owner drew it.
    e.ship.errand = e.liner ? laneErrand(errandHere(e.ship)) : errandHere(e.ship);
    if (e.ship.errand?.kind === 'moored') e.fromHarbour = e.ship.errand.harbour;
    if (e.ship.cls.fisher) e.fisher = e.ship.errand?.harbour ?? null;
    return e;
  }
  function yieldTo(e, owner, n, gen) {
    if (!e.owner && boarding?.shipId === e.id) {
      const b = boarding;
      for (const f of b.foes) deps.board?.removeFoe?.(f.handle);
      b.foes = [];
      if (b.quest) { raidUids.delete(b.quest.uid); deps.board?.endRaid?.(b.quest, { withdraw: true }); }
      b.abandon?.();
      endBoarding();
      deps.say?.(`${e.ship.names?.name ?? 'It'} is taken by another crew.`, 3);
    }
    if (!e.owner) e.raider = null;
    rekey(e, owner, n, gen);
    e.ship.boarded = false;
    return e;
  }
  function heirOf(gone) {
    const on = deps.online;
    const id = on?.id?.();
    if (!on || !id) return true;
    return amGroupRollOwner(id, deps.feet(), (on.peers?.() ?? []).filter((p) => p.id !== gone), NAVAL_SHARE_RADIUS);
  }
  function releaseOwner(owner) {
    peerSelf.delete(owner);
    flownAt.delete(owner);
    const heir = heirOf(owner);
    const byN = new Map(), adopted = [];
    for (const e of [...sea.values()]) {
      if (e.owner !== owner || boarding?.shipId === e.id) continue;
      byN.set(e.n, e);
      const st = e.ship.damage.state;
      if (st === SHIP_STATES.sinking || st === SHIP_STATES.sunk) { letGo(e); continue; }
      if (heir) { adopt(e); adopted.push(e); } else e.orphan ??= clock;
    }
    for (const e of adopted) {
      const victor = e.struckTo >= 0 ? byN.get(e.struckTo) : null;
      if (!e.struck && victor && !victor.owner && sea.has(victor.id) && e.ship.damage.state === SHIP_STATES.struck) e.struck = { by: victor.id, at: clock };
    }
    releaseCasks(owner, heir);
    seenVolleys.delete(owner);
  }

  const foughtIds = () => { const t = new Set(); for (const x of sea.values()) if (engagedOf(x.ship) && x.ship.target != null) t.add(x.ship.target); return t; };
  const peerHullNear = (e, eye, fought) => !eye || dist2d(e.ship.pos, eye) <= PEER_HULL_NEAR_M
    || (!e.owner && hullKept(e, { fought, boardingId: boarding?.shipId ?? null }));
  function shedFarHulls(eye) {
    if (!eye) return;
    let fought = null;
    for (const e of sea.values()) {
      if (!e.boat || e.deck?.length || boarding?.shipId === e.id) continue;
      if (dist2d(e.ship.pos, eye) <= PEER_HULL_FAR_M) continue;
      if (!e.owner && hullKept(e, { fought: (fought ??= foughtIds()), boardingId: boarding?.shipId ?? null })) continue;
      deps.pool.remove(e.boat);
      e.boat = null;
      e.sailsByHeight = null; e.colours = null; e.wake = false;
      for (const f of e.fires ?? []) f.handle?.show?.(false);
      e.fireLoop?.stop?.(); e.fireLoop = null;
      e.sinkLoop?.stop?.(); e.sinkLoop = null;
      e.shed = true;
    }
  }
  // One build a frame: SpawnBoat is the frame's heaviest single call.
  function buildOne() {
    if (!deps.pool?.ready?.()) return;
    const eye = deps.look?.()?.origin ?? deps.feet();
    let fought = null;
    for (const e of sea.values()) {
      if (e.boat || !peerHullNear(e, eye, (fought ??= foughtIds()))) continue;
      try {
        e.boat = deps.pool.spawnSeaNow(new Boat(e.ship.hull, e.ship.variant));
        if (e.boat) {
          for (const sail of e.boat.Sails ?? []) { const a = animatorOf(sail); if (a) stowSail(a, false); }
          e.boat.IdleObject?.setActive?.(false);
          e.boat.ActiveObject?.setActive?.(true);
          e.boat.flagColor = NAVAL_FACTIONS[e.ship.cls?.faction]?.flag ?? null;
          e.boat.livery = liveryCode(seaLiveryOf(seaWho(e)));
          if (e.shed) { e.shed = false; e.fade = 0; }
        }
      } catch (err) {
        console.warn('[naval] a ship would not build', err);
        drop(e);
      }
      return;
    }
  }

  function sparsFor(e) {
    const key = `${e.ship.hull}:${e.ship.variant | 0}`;
    let sp = spars.get(key);
    if (!sp) { sp = sparsOf(e.boat, deps.pool.models); if (sp) spars.set(key, sp); }
    return sp ?? null;
  }
  function sinkUnder(e) {
    if (e.sinkUnder != null) return e.sinkUnder;
    const sp = sparsFor(e);
    const { roll, pitch } = sinkAngles(e.ship.seed, 1);
    const q = quatEuler(pitch, 0, roll);
    let top = -Infinity;
    for (const p of sp?.points ?? []) { const y = quatRotate(q, p)[1]; if (y > top) top = y; }
    const build = hullBuild(e.ship.hull);
    const reach = Math.max(build.top, ...build.rig.map(([, mx]) => mx[1])) + Math.max(-build.aftZ, build.bowZ) * Math.sin(Math.abs(pitch) * NAVAL_DEG);
    e.sinkUnder = (Number.isFinite(top) ? sp.lift + top : reach) + SINK_CLEAR;
    return e.sinkUnder;
  }
  function poseShip(e, dt, seaY, eye = null) {
    const b = e.boat;
    if (!b) return;
    const s = e.ship;
    const w = wind();
    const wl = Math.hypot(w[0], w[2]);
    const state = s.damage.state;
    const sinkK = state === SHIP_STATES.sinking ? clamp(s.damage.sinkT / SINK_SECONDS, 0, 1) : state === SHIP_STATES.sunk ? 1 : 0;
    const sink = sinkAngles(s.seed, sinkK);
    const depth = sinkK > 0 ? sinkDepth(sinkUnder(e), sinkK) : 0;
    const pos = s.pos;
    const yaw = s.yaw;
    const seen = (e.fade ?? 1) >= FADE_FLATS;
    b.GameObject.position = [pos[0], seaY - depth, pos[2]];
    b.GameObject.rotation = quatOfYaw(yaw);
    const t = clock + e.phase;
    const hull = s.damage.hullShare();
    const want = DAMAGE_LIST_MAX * clamp((DAMAGE_LIST_FROM - hull) / DAMAGE_LIST_FROM, 0, 1);
    e.list = e.list == null ? want : e.list + (want - e.list) * (1 - Math.exp(-dt / DAMAGE_LIST_EASE_S));
    const listed = Math.sign(sinkAngles(s.seed, 1).roll) * Math.max(Math.abs(sink.roll), e.list);
    const roll = s.heel + Math.sin(t * 0.5 * wl) * wl * 0.9 + listed;
    const pitch = Math.sin(t * wl) * wl * 0.5 + sink.pitch;
    if (b.MeshObject) b.MeshObject.localRotation = quatEuler(pitch, 0, roll);
    const set = state === SHIP_STATES.afloat && s.sails > 0.5;
    const sails = e.sailsByHeight ??= (b.Sails ?? []).map((n) => [n, canvasHeight(n)]).sort((p, q) => q[1] - p[1]).map(([n]) => n);
    const shown = s.damage.maxSail > 0 ? sailsShown(sails.length, s.damage.sailShare()) : sails.length;
    sails.forEach((sail, i) => { const on = i >= sails.length - shown; if (sail.activeSelf !== on) sail.setActive(on); });
    for (const sail of b.Sails ?? []) {
      const a = animatorOf(sail);
      if (!a) continue;
      if (a.GetBool('Stowed') === set) stowSail(a, !set);
      a.SetFloat('Wind', set ? sailSide(b, sail, w) * Math.min(1, wl) : 0);
    }
    const colours = state === SHIP_STATES.afloat ? (falseFlagFor(e) && !e.blackFlag ? 'false' : 'hers') : state === SHIP_STATES.prize ? 'taken' : 'struck';
    if (b.FlagEmitter && e.colours !== colours) {
      e.colours = colours;
      if (colours === 'struck') b.FlagEmitter.stop?.();
      else {
        b.flagColor = colours === 'hers' ? NAVAL_FACTIONS[s.cls?.faction]?.flag ?? null : colours === 'false' ? NAVAL_FACTIONS.merchant.flag : null;
        if (!b.FlagEmitter.isEmitting) b.FlagEmitter.play?.();
      }
    }
    if (b.FlagObject) {
      const v = velocityOf(s);
      const f = [w[0] - v[0] * 0.1, 0, w[2] - v[2] * 0.1];
      const fl = Math.hypot(f[0], f[2]);
      if (fl > 1e-4) {
        b.FlagObject.rotation = quatLookRotation([f[0] / fl, 0, f[2] / fl]);
        if (b.FlagEmitterMain) b.FlagEmitterMain.startSpeed = constantCurve(fl * 0.5);
      }
    }
    if (b.WakeEmitter) {
      const moving = s.speed > 0.5 && state === SHIP_STATES.afloat;
      if (moving && !e.wake) { b.WakeEmitter.play(); e.wake = true; } else if (!moving && e.wake) { b.WakeEmitter.stop(); e.wake = false; }
      if (b.WakeEmitterMain) { b.WakeEmitterMain.startLifetimeMultiplier = clamp(s.speed * 0.2 * 2, 1, 10); b.WakeEmitterMain.startSize = constantCurve(s.speed * 0.1); }
    }
    const lit = shipLit(e);
    if (b.LightOn !== lit && (b.Lights?.length ?? 0) > 0) setLights(b, lit);
    const lived = farLifeStep(e, dt, s.pos, eye);
    if (lived !== null) {
      for (const a of (b.animators ??= boatAnimators(b))) a.update(lived);
      for (const ps of (b.particleSystems ??= boatParticleSystems(b))) ps.step(lived);
    }
    if (e.fires) {
      const build = hullBuild(s.hull);
      const len = (build.beam || 4) * 1.6;
      const mo = b.MeshObject;
      const lp = mo.localPosition;
      let burning = 0;
      for (const fire of e.fires) {
        if (fire.out) continue;
        const p = mo.transformPoint([-lp[0], build.deck + 1 - lp[1], fire.at * len - lp[2]]);
        if (p[1] < seaY + FLAME_AWASH) { fire.handle?.retire?.(); fire.handle = null; fire.out = true; continue; }
        fire.handle?.move?.(p);
        fire.handle?.show?.(seen);
        if (seen) effects.burn(p, dt);
        burning++;
      }
      if (burning) {
        e.fireLoop ??= deps.audio?.loop3d?.(NAVAL_CLASSIC.burning, pos, 0.7, NAVAL_FIRE_LOOP) ?? null;
        e.fireLoop?.move?.(pos);
      } else if (e.fireLoop) { e.fireLoop.stop?.(); e.fireLoop = null; }
      if (s.damage.fire <= 0 || state === SHIP_STATES.sunk) douse(e);
    }
    if (state === SHIP_STATES.sinking && seen) effects.founder([pos[0], seaY, pos[2]], dt, hullBuild(s.hull).beam);
    if (state === SHIP_STATES.sinking) { e.sinkLoop ??= deps.audio?.loop3d?.(NAVAL_SFX.sinking, pos, 0.85, NAVAL_SINK_LOOP) ?? null; e.sinkLoop?.move?.(pos); }
    else if (e.sinkLoop) { e.sinkLoop.stop?.(); e.sinkLoop = null; }
    const smokeK = clamp((SMOKE_FROM - hull) / SMOKE_FROM, 0, 1);
    if (smokeK > 0 && seen) {
      const build = hullBuild(s.hull), mo = b.MeshObject, lp = mo.localPosition, y = build.deck + 0.5 - lp[1];
      const deck = lineOver(mo.transformPoint([-lp[0], y, build.aftZ * SMOKE_SPAN - lp[2]]), mo.transformPoint([-lp[0], y, build.bowZ * SMOKE_SPAN - lp[2]]), seaY + FLAME_AWASH);
      if (deck) effects.smolder(deck[0], deck[1], dt, smokeK);
    }
  }

  function trafficDensity(feet) {
    const of = (key) => DENSITY[key] ?? DENSITY[TRAFFIC_DEFAULT];
    let d = of(setting('ShipsAtSea', TRAFFIC_DEFAULT));
    for (const p of deps.online?.peers?.() ?? []) {
      if (p.feet && dist2d(p.feet, feet) <= NAVAL_SHARE_RADIUS) d = Math.min(d, of(peerSelf.get(p.id)?.traffic ?? TRAFFIC_DEFAULT));
    }
    return d;
  }
  let launching = true;
  function launchesTraffic() {
    const on = deps.online;
    const id = on?.id?.();
    if (!on || !id) return true;
    const afloat = (on.peers?.() ?? []).filter((p) => Array.isArray(p.feet) && deps.isWater(p.feet[0], p.feet[2], 0));
    launching = amGroupRollOwner(id, deps.feet(), afloat, launching ? NAVAL_SHARE_RADIUS : NAVAL_SHARE_RADIUS * SHARE_HYSTERESIS);
    return launching;
  }
  function rollsHarbour(mouth) {
    const on = deps.online;
    const id = on?.id?.();
    if (!on || !id) return (standing = true);
    const near = (on.peers?.() ?? []).filter((p) => Array.isArray(p.feet) && Math.hypot(p.feet[0] - mouth[0], p.feet[2] - mouth[1]) <= HARBOUR_STAND);
    standing = amGroupRollOwner(id, deps.feet(), near, HARBOUR_STAND * 2);
    return standing;
  }

  const linerKept = (e) => e.ship.mode === 'engage' || e.ship.mode === 'board' || e.ship.mode === 'flee';
  const linerFree = (e) => e.ship.damage.state === SHIP_STATES.afloat && e.ship.mode === 'cruise';
  const spentLiners = new Set();
  let spentSaid = [];
  const noteSpent = (sd) => { if (!spentLiners.has(sd)) { spentLiners.add(sd); spentSaid = [...spentSaid, sd].slice(-NAVAL_WIRE_SPENT); } };
  function spendLiner(e) {
    noteSpent(e.liner.seed >>> 0);
    e.liner = null;
  }
  function releaseLiner(e) {
    e.liner = null;
    if (e.owner || !linerFree(e)) return;
    const s = e.ship;
    s.course = null;
    if (s.errand?.kind === 'moored') s.errand.until = s.clock + dwellOf(errandRng(s.seed));
    else if (!s.errand || s.errand.kind === 'lurk') s.errand = errandHere(s);
  }
  const peerNear = (pos, range) => (deps.online?.peers?.() ?? []).some((p) => Array.isArray(p.feet) && dist2d(p.feet, pos) <= range);
  const peerFeet = (id) => { const p = (deps.online?.peers?.() ?? []).find((q) => q.id === id); return Array.isArray(p?.feet) ? p.feet : null; };
  const clockDest = (l) => (l.phase === 'dwell' ? l.port : l.to) ?? null;
  const linerTag = (l, was = null) => ({ id: l.id, seed: l.seed >>> 0, phase: l.phase, to: l.to ?? null, from: l.from ?? null, port: l.port ?? null,
    leg: l.leg ?? null, way: was?.way ?? l.leg ?? null, dest: was?.dest ?? clockDest(l) });
  function firstWay(l, s) {
    const leg = l.leg, clock = { way: leg ?? null, dest: clockDest(l) };
    if (!leg?.length || s.mode !== 'cruise' || berthOf(s)) return clock;
    const p = pursue(leg, s.pos[0], s.pos[2], 0), q = pursue(leg, s.pos[0], s.pos[2], LINER_LOOKAHEAD_M);
    if (p.left <= LINER_PORT_M || (q.x - p.x) * Math.sin(s.yaw) + (q.z - p.z) * Math.cos(s.yaw) >= 0) return clock;
    return { way: [...leg].reverse(), dest: l.from ?? null };
  }
  function madePort(e) {
    const s = e.ship, l = e.liner, k = l.dest?.key, r = e.owner ? null : s.errand;
    if (k && (e.owner ? berthOf(s)?.key === k : (r?.kind === 'arrive' || r?.kind === 'moored') && r.harbour === k)) return true;
    return r?.kind === 'lurk' || (pursue(l.way, s.pos[0], s.pos[2], 0)?.left ?? 0) <= LINER_PORT_M;
  }
  function moveOn(e) {
    const l = e.liner, target = clockDest(l);
    if (linerFree(e) && l.leg?.length && target && target.key !== l.dest?.key && madePort(e)) { l.way = l.leg; l.dest = target; }
  }
  const laneErrand = (r) => (r?.kind === 'moored' || r?.kind === 'depart' ? r : null);
  // A packet takes the last free berth of a harbor; the harbor's own ships sit at the first.
  function openBerth(h) {
    for (let i = h.harbour.berths.length - 1; i >= 0; i--) if (berthFree(h.key, i)) return i;
    return -1;
  }
  function liners(list) {
    if (!enabled) return;
    const me = deps.feet();
    const density = trafficDensity(me);
    const bySeed = new Map();
    for (const l of list) for (const sd of l.seeds ?? [l.seed]) bySeed.set(sd >>> 0, l);
    for (const e of [...sea.values()]) {
      const s = e.ship;
      if (e.liner && s.damage.state !== SHIP_STATES.afloat) { spendLiner(e); continue; }
      const l = bySeed.get(s.seed >>> 0) ?? null;
      if (l && !spentLiners.has(l.seed >>> 0) && s.damage.state === SHIP_STATES.afloat) {
        if (!e.liner && !e.owner) s.errand = laneErrand(s.errand);
        e.liner = linerTag(l, e.liner ?? firstWay(l, s));
        moveOn(e);
      } else if (e.liner) releaseLiner(e);
    }
    if (density > 0) for (const e of [...sea.values()]) {
      if (!e.owner || !e.liner || !linerFree(e) || dist2d(e.ship.pos, me) > LINER_DROP_M) continue;
      const feet = peerFeet(e.owner);
      if (!e.retiring && !(feet && dist2d(feet, e.ship.pos) > LINER_DROP_M)) continue;
      adopt(e);
      e.retiring = false;
    }
    for (const e of sea.values()) {
      if (e.owner || !e.liner) continue;
      if (dist2d(e.ship.pos, me) <= LINER_DROP_M) { e.handOn = null; e.retiring = false; continue; }
      if (linerKept(e) || e.retiring) continue;
      if (peerNear(e.ship.pos, LINER_DROP_M) && clock - (e.handOn ??= clock) < ORPHAN_S) continue;
      retire(e);
    }
    const max = LINERS_MAX[density] ?? Math.min(3, density);
    let under = [...sea.values()].filter((e) => !e.owner && e.liner && !e.retiring && e.ship.errand?.kind !== 'moored').length;
    for (const l of [...list].sort((a, b) => dist2d(a.pos, me) - dist2d(b.pos, me))) {
      const seed = l.seed >>> 0;
      if (!(density > 0) || dist2d(l.pos, me) > LINER_STAND_M || spentLiners.has(seed)) continue;
      const seeds = new Set((l.seeds ?? [l.seed]).map((x) => x >>> 0));
      if ([...sea.values()].some((x) => x.ship.damage.state !== SHIP_STATES.sunk && (x.ship.seed === seed || (seeds.has(x.ship.seed) && x.ship.damage.state === SHIP_STATES.afloat)))) continue;
      const cls = classById(l.classId);
      if (!cls) continue;
      const h = l.phase === 'dwell' && l.port ? harbours.get(l.port.key) : null;
      const berth = h?.harbour && cls.hull !== HULL.LargeGalley ? openBerth(h) : -1;
      let e = null;
      if (berth >= 0) {
        const b = h.harbour.berths[berth], at = alongside(b, cls.hull, h.harbour.hull);
        e = launch({ seed, classId: cls.id, region: l.region, pos: [at[0], deps.seaY(), at[1]], yaw: b.yaw, errand: { kind: 'moored', harbour: h.key, berth, until: Infinity, path: null, i: 0 } });
        if (e) { e.ship.sails = 0; e.ship.sailsWant = 0; }
      } else {
        if (l.phase !== 'sail' || under >= max) continue;
        if (!deps.isWater(l.pos[0], l.pos[2], cls.hull)) continue;
        e = launch({ seed, classId: cls.id, region: l.region, pos: [l.pos[0], deps.seaY(), l.pos[2]], yaw: l.yaw });
        if (e) under++;
      }
      if (e) e.liner = linerTag(l);
    }
    for (const e of sea.values()) if (!e.owner && e.liner) steerLiner(e);
  }
  function steerLiner(e) {
    const s = e.ship, l = e.liner;
    if (!linerFree(e) || !l.leg?.length) return;
    const r = s.errand;
    const h = l.dest ? harbours.get(l.dest.key) ?? null : null;
    if (r && (r.kind === 'arrive' || r.kind === 'moored')) {
      s.course = null;
      if (h && r.harbour === h.key) { if (r.kind === 'moored') r.until = Infinity; return; }
      s.errand = { kind: 'depart', harbour: r.harbour, berth: r.kind === 'moored' ? r.berth : -1, path: null, i: 0 };
      return;
    }
    if (r?.kind === 'depart') { s.course = null; return; }
    const p = pursue(l.way, s.pos[0], s.pos[2], LINER_LOOKAHEAD_M);
    const end = l.way[l.way.length - 1];
    if (p.left > LINER_PORT_M) { s.errand = null; s.course = [p.x, p.z]; return; }
    s.course = null;
    const berth = h?.harbour && s.hull !== HULL.LargeGalley ? openBerth(h) : -1;
    if (berth >= 0) { s.errand = { kind: 'arrive', harbour: h.key, berth, path: null, i: 0 }; return; }
    if (r?.kind !== 'lurk') s.errand = { kind: 'lurk', harbour: null, at: [end[0], end[1]], path: null, i: 0, spin: (s.seed % 1000) / 1000 };
  }

  const treasureFleet = createTreasureFleet({
    sea, launch: (spec) => (enabled ? launch(spec) : null), retire: (e) => retire(e), busy: (e) => raiderBusy(e), feet: () => deps.feet(),
    isWater: (x, z, hull) => deps.isWater(x, z, hull), seaY: () => deps.seaY(), launches: () => launchesTraffic(),
    give: (items) => deps.board?.giveItems?.(items, boatInPlay() ?? null, { force: true }), say: (text, n) => deps.say?.(text, n),
    fleetEnded: (n, act) => deps.ether?.fleetEnded?.(n, act),
  });
  const pvp = createNavalPvp({
    enabled: () => enabled, boat: () => boatInPlay(), stateOf: (b) => myBoatState(b), build: (b) => refitBuild(b), pose: (b) => boatPose(b),
    boats: () => csa()?.state?.AllBoats ?? [], peers: () => deps.peerBoats?.() ?? [], clock: () => clock, shake: (k) => deps.shake?.(k),
  });

  const raiderBusy = (e) => e.ship.mode === 'engage' || e.ship.mode === 'board' || e.ship.mode === 'flee' || e.ship.boarded || boarding?.shipId === e.id
    || e.ship.damage.state === SHIP_STATES.sinking;
  function raiders(list, { sight = null, spent = new Set(), held = new Map() } = {}) {
    if (!enabled) return;
    const me = deps.feet();
    for (const e of [...sea.values()]) {
      if (!e.owner || e.ship.cls.faction !== 'pirate' || e.ship.damage.state !== SHIP_STATES.afloat || raiderBusy(e) || dist2d(e.ship.pos, me) > RAIDER_DROP_M) continue;
      const r = list.find((x) => (x.seed >>> 0) === e.ship.seed);
      if (!r || spent.has(r.id) || held.has(r.id)) continue;
      const feet = peerFeet(e.owner);
      if (!e.retiring && !(feet && dist2d(feet, e.ship.pos) > RAIDER_DROP_M)) continue;
      adopt(e);
      e.retiring = false;
    }
    const stood = new Map(), peers = new Map();
    for (const e of sea.values()) {
      if (!e.owner && !e.raider && e.ship.cls.faction === 'pirate') { const r = list.find((x) => (x.seed >>> 0) === e.ship.seed); if (r) { e.raider = { id: r.id, chased: false, spent: spent.has(r.id) }; e.ship.temper = TEMPERS.bold; } }
      if (!e.owner && e.raider) stood.set(e.raider.id, { pos: e.ship.pos, engaged: raiderBusy(e), boarding: boarding?.shipId === e.id });
      else if (e.owner && e.ship.cls.faction === 'pirate') peers.set(e.ship.seed, e.owner);
    }
    const plan = raiderPlan({ raiders: list, me, myId: myId(), stood, peers, spent, held });
    for (const id of plan.drop) {
      const e = raiderEntry(id);
      if (!e) continue;
      if (held.has(id)) { drop(e); continue; }
      if (!e.retiring && peerNear(e.ship.pos, RAIDER_DROP_M) && clock - (e.handOn ??= clock) < ORPHAN_S) continue;
      retire(e);
    }
    for (const e of sea.values()) if (!e.owner && e.raider && !plan.drop.includes(e.raider.id)) { e.handOn = null; e.retiring = false; }
    const w = where();
    const level = (deps.level?.() ?? 1) + (w.ether ? BANDS.find((b) => b.id === w.ether.band)?.level ?? 0 : 0);
    for (const id of plan.stand) {
      const r = list.find((x) => x.id === id);
      const cls = raiderClassOf(r.seed, level);
      if (!deps.isWater(r.pos[0], r.pos[2], cls.hull)) continue;
      const e = launch({ seed: r.seed, classId: cls.id, pos: [r.pos[0], deps.seaY(), r.pos[2]], yaw: r.yaw });
      if (e) { e.raider = { id, chased: false, spent: false }; e.ship.temper = TEMPERS.bold; }
    }
    for (const e of sea.values()) {
      if (e.owner || !e.raider || e.raider.spent) continue;
      const r = list.find((x) => x.id === e.raider.id);
      e.ship.sight = sight;
      e.ship.course = r?.ahead ? [r.ahead[0], r.ahead[2]] : null;
    }
  }
  const raiderEntry = (raiderId) => [...sea.values()].find((e) => !e.owner && e.raider?.id === raiderId) ?? null;
  function spendRaider(e, sheer) {
    e.raider.spent = true;
    deps.raiderSpent?.(e.raider.id);
    if (sheer) sheerOff(e);
  }
  function sheerOff(e) {
    const me = deps.feet();
    const dx = e.ship.pos[0] - me[0], dz = e.ship.pos[2] - me[2], d = Math.hypot(dx, dz) || 1;
    const p = [e.ship.pos[0] + (dx / d) * RAIDER_SHEER_M, e.ship.pos[2] + (dz / d) * RAIDER_SHEER_M];
    if (e.raider) { e.ship.sight = 0; e.ship.course = p; } else e.ship.waypoint = p;
  }
  function raiderShipOf(seed) {
    for (const e of sea.values()) {
      if (e.ship.seed !== (seed >>> 0) || e.ship.cls.faction !== 'pirate' || (!e.owner && !e.raider)) continue;
      return { pos: e.ship.pos, chase: chasesMe(e) };
    }
    return null;
  }
  function raiderHeld() {
    const out = [];
    for (const e of sea.values()) if (!e.owner && e.raider && !e.raider.spent) out.push({ id: e.raider.id, pos: e.ship.pos });
    return out;
  }

  const workOf = (damage) => Math.min(1, Math.max(0, (1 - damage.hullShare()) + (1 - damage.sailShare()) * 0.5));
  function shipLit(e) {
    return !!where().cityLights && carriesLanterns(e.boat, e.ship.hull) && !runsDark({ faction: e.ship.cls.faction, mode: e.ship.mode, afloat: e.ship.damage.state === SHIP_STATES.afloat });
  }
  const carriesLanterns = (boat, hull) => (boat ? (boat.Lights?.length ?? 0) > 0 : !(hull === HULL.Carrack && hullBuild(hull) === MOD_BUILDS[HULL.Carrack]));
  function contacts() {
    const out = [];
    for (const e of sea.values()) {
      const st = e.ship.damage.state;
      if (st === SHIP_STATES.afloat) out.push({ id: e.id, kind: 'ship', faction: e.ship.cls.faction, pos: e.ship.pos, vel: velocityOf(e.ship), speed: e.ship.speed, yaw: e.ship.yaw, hull: e.ship.hull, ship: e.ship, lit: shipLit(e) });
      else if (st === SHIP_STATES.struck && !e.owner && e.struck && sea.has(e.struck.by) && !e.takenBy && boarding?.shipId !== e.id) {
        out.push({ id: e.id, kind: 'ship', faction: e.ship.cls.faction, pos: e.ship.pos, vel: velocityOf(e.ship), speed: e.ship.speed, yaw: e.ship.yaw, hull: e.ship.hull, ship: e.ship, struck: true, struckTo: e.struck.by, lit: shipLit(e) });
      }
    }
    const boat = boatInPlay();
    if (boat) {
      const st = myBoatState(boat);
      const pose = boatPose(boat);
      out.push({
        id: myId(), kind: 'player', pos: pose.position, vel: pose.velocity, speed: Math.hypot(pose.velocity[0], pose.velocity[2]),
        yaw: yawOfRot(pose.rotation), hull: boat.hull,
        hullShare: st.damage.hullShare(), crippled: st.damage.state === SHIP_STATES.wrecked, power: myPowerOf(boat, st),
        lit: !!boat.LightOn && carriesLanterns(boat, boat.hull),
      });
    }
    for (const p of deps.peerBoats?.() ?? []) {
      const self = peerSelf.get(p.id);
      const share = self?.me?.hull ?? 1;
      out.push({
        id: p.id, kind: 'player', pos: p.pos, vel: p.vel ?? [0, 0, 0], speed: p.speed ?? 0, yaw: p.yaw, hull: p.hull ?? null, peer: true,
        notoriety: (c) => self?.law?.[c] ?? 0, hullShare: share, crippled: !!self?.me?.crippled, boarders: self?.me ? self.me.boarders : false,
        // Sized by her word's hands, as myPowerOf sizes my boat, so every client sizes her the same.
        power: peerPowerOf(p, self),
        lit: !!p.boat?.LightOn && carriesLanterns(p.boat, p.hull),
      });
    }
    return out;
  }

  function boatInPlay() {
    const at = myBoat();
    if (at) return at;
    if (boarding?.boat && myBoats().includes(boarding.boat)) return boarding.boat;
    const feet = deps.feet();
    for (const b of myBoats()) { const box = hullBox(b); if (box && insideGrown(box, feet, DECK_REACH_M)) return b; }
    return null;
  }
  function seaDeckUnderMe() {
    const feet = deps.feet();
    for (const e of sea.values()) {
      const box = e.boat ? hullBox(e.boat) : null;
      if (box && insideGrown(box, feet, DECK_REACH_M)) return e;
    }
    return null;
  }
  const _aboardLocal = [0, 0, 0];
  const standsOn = (boat, feet) => {
    const r = boat.GameObject?.worldMatrix?.(), b = hullBuild(boat.hull);
    if (!r || Math.hypot(r[12] - feet[0], r[14] - feet[2]) > Math.hypot(Math.max(b.bowZ, -b.aftZ), b.halfWidth) + DECK_REACH_M) return false;
    const deck = boat.MeshObject && deps.pool.deckOf?.(boat.hull, boat.variant ?? 0);
    if (!deck?.count || !deck.under) { const box = hullBox(boat); return !!box && insideGrown(box, feet, DECK_REACH_M); }
    const l = intoDeck(boat.MeshObject.worldMatrix(), feet, _aboardLocal);
    return deck.under(l[0], l[2], l[1], l[1] >= mainLevel(deck) - DECK_STEP ? DECK_REACH_M : CAPSULE_RADIUS);
  };
  function aboardShip() {
    if (myBoat() || (boarding?.boat && myBoats().includes(boarding.boat)) || deps.aboardPeer?.()) return true;
    const feet = deps.feet();
    for (const b of myBoats()) if (standsOn(b, feet)) return true;
    for (const e of sea.values()) if (e.boat && standsOn(e.boat, feet)) return true;
    return false;
  }
  function peerPowerOf(p, self = peerSelf.get(p.id)) {
    if (p.hull == null) return null;
    const b = hullBuild(p.hull), said = self?.boat;
    const crew = said && said.hull === p.hull ? Math.max(0, Math.min(b.crew, said.crew)) : b.crew;
    return fightingPower({ hull: p.hull, hullHp: b.hullHp, hullShare: self?.me?.hull ?? 1, crewShare: b.crew > 0 ? crew / b.crew : 1, crew, crewed: !(p.boat && !p.boat.crewed), player: true });
  }
  function myPowerOf(boat, st = myBoatState(boat)) {
    return fightingPower({ hull: boat.hull, hullHp: st.damage.maxHull, hullShare: st.damage.hullShare(), crewShare: st.damage.crewShare(), crew: st.damage.crew, crewed: !!boat.crewed, player: true });
  }
  function meContact() {
    const boat = boatInPlay();
    if (!boat) {
      const ridden = deps.aboardPeer?.() ?? null;
      const p = ridden ? (deps.peerBoats?.() ?? []).find((x) => x.boat === ridden) : null;
      if (p && p.hull != null) {
        const self = peerSelf.get(p.id);
        return { kind: 'player', id: myId(), hullShare: self?.me?.hull ?? 1, crippled: !!self?.me?.crippled, power: peerPowerOf(p, self) };
      }
      return { kind: 'player', id: myId() };
    }
    const st = myBoatState(boat);
    return { kind: 'player', id: myId(), hullShare: st.damage.hullShare(), crippled: st.damage.state === SHIP_STATES.wrecked, power: myPowerOf(boat, st) };
  }
  const hostileToMe = (e, me = meContact()) => e.ship.damage.state === SHIP_STATES.afloat
    && hostile(e.ship, me, { notoriety: (c) => notoriety.get(c), now: clock });
  // The sea is never saved, so a save waits while a boarding runs or the player stands on a sea ship's deck.
  function saveRefused() {
    if (!enabled) return false;
    if (boarding) return true;
    return !!seaDeckUnderMe();
  }
  function hostileNearMe() {
    if (!aboardShip()) return false;
    if (deps.serpent?.near?.()) return true;
    const feet = deps.feet(), me = meContact();
    for (const e of sea.values()) if (dist2d(e.ship.pos, feet) <= HOSTILE_NEAR_M && hostileToMe(e, me)) return true;
    return false;
  }
  function crewAlarm() {
    if (!aboardShip()) return false;
    if (deps.serpent?.near?.()) return true;
    const feet = deps.feet(), me = meContact(), night = !!where().night;
    for (const e of sea.values()) {
      const d = dist2d(e.ship.pos, feet);
      if (d > HOSTILE_NEAR_M || !hostileToMe(e, me)) continue;
      if (!night || e.ship.target === myId() || d <= nightSight(HOSTILE_NEAR_M, { night, lit: showsLight(e) })) return true;
    }
    return false;
  }
  function hostileNearBoat(b, st) {
    const p = b.GameObject.position;
    const me = { kind: 'player', id: myId(), hullShare: st.damage.hullShare(), crippled: st.damage.state === SHIP_STATES.wrecked, power: myPowerOf(b, st) };
    for (const e of sea.values()) if (dist2d(e.ship.pos, p) <= HOSTILE_NEAR_M && hostileToMe(e, me)) return true;
    return false;
  }
  function threats() {
    const out = [];
    if (!enabled || !aboardShip()) return out;
    const me = meContact();
    for (const e of sea.values()) {
      if (!hostileToMe(e, me)) continue;
      const chasing = chasesMe(e);
      out.push({ pos: e.ship.pos, reach: chasing ? HOSTILE_NEAR_M : Math.max(HOSTILE_NEAR_M, lookoutOf(e.ship)), chasing, mps: e.ship.cls.speed, holds: HOSTILE_NEAR_M });
    }
    return out;
  }

  let mending = false;
  // The berth, the shipwright, and the crew's port ask this; the traffic and its waters read `nearPort` alone.
  const inPortWaters = () => { const w = where(); return !!(w.nearPort || w.port); };
  const berths = createBerthWatch({ lies: (b) => yardHere(b), clear: () => !hostileNearMe(), event: (ev) => deps.captain?.event?.(ev),
    ownWay: (b) => { const r = csa(); return b === r?.state?.CurrentBoat && !r.IsBeached?.(b) ? Math.hypot(...(r.state.MoveVectorCurrent ?? r.state.velocityCurrent ?? [0, 0, 0])) : 0; } });
  function yardHere(boat) {
    if (!enabled || !boat || !inPortWaters()) return false;
    const v = boatPose(boat).velocity;
    return Math.hypot(v[0], v[2]) <= YARD_SPEED && !hostileNearMe();
  }
  function crewStep(b, s, d, hostile) {
    const c = s.crew;
    const lost = s.lastCrew - s.damage.crew;
    if (lost > 1e-9 && b.crewed) c.event('handLost', lost / CREW_PER_HAND);
    s.lastCrew = s.damage.crew;
    const wrecked = s.damage.state === SHIP_STATES.wrecked;
    if (wrecked && !s.wasWrecked) { c.event('wrecked'); deps.captain?.event?.({ type: 'wrecked', boat: b.uid ?? null }); }
    s.wasWrecked = wrecked;
    if (hostile) s.inFight = true;
    else if (s.inFight) { s.inFight = false; c.fightOver(); }
    if (b.crewed && playerCrewCount(b.hull, s.damage.crew) !== c.hands.length) {
      const { fell, joined } = muster(b, s);
      if (s.mustered) {
        for (const h of fell) deps.say?.(`${h.name}, ${h.role}, has fallen.`, 4);
        for (const h of joined) deps.say?.(`${h.name} signs on as ${h.role}.`, 3);
      }
      s.mustered = true;
    }
    s.worth = captainWorth(b.crewed ? crewWorth(c.hands, ashoreNames(b)) : NO_WORTH, deps.captain?.stats?.());
    if (b === boatInPlay()) {
      const v = boatPose(b).velocity;
      c.tick(d, { inPort: inPortWaters() && Math.hypot(v[0], v[2]) <= YARD_SPEED && !hostile, atSea: !inPortWaters(), wear: s.worth.wear });
    }
  }
  // The only roster sync: crewStep and crewHands both go through it.
  function muster(b, s) {
    const service = deps.captain?.seasonedHires?.() ? SEASONED_HIRE : 0;
    return s.crew.sync(crewRoster({ hull: b.hull, seed: (deps.crewSeed?.(b) ?? b.uid ?? 1) >>> 0, crew: s.damage.crew }), { service });
  }
  const mateOf = (boat, st) => {
    const away = ashoreNames(boat);
    const aboard = st.crew.hands.filter((h) => !away?.has(h.name));
    return (aboard.find((h) => h.role === FIRST_MATE) ?? aboard[0])?.name ?? null;
  };
  function repairStep(b, s, d, { auto = false, underFire = false, inPlay = null } = {}) {
    if (inPortWaters()) return;
    if (auto && !wantsRepair(s.damage)) return;
    const stores = deps.stores?.count?.(b) ?? 0;
    if (auto && s.credit <= 1e-9 && stores <= 0) return;
    const scale = (b.crewed ? mendScaleOf(s.crew.morale) * (s.worth?.mend ?? 1) : 1) * (underFire ? SEA_REPAIR_UNDER_FIRE : 1);
    const crewShare = s.damage.crewShare();
    const owed = auto ? paidDamage(s.damage, { free: !b.crewed || crewShare > 0 }) : s.damage;
    const r = seaRepair(owed, d, { crewed: !!b.crewed, crewShare, scale, budget: s.credit + stores * STORE_POINTS });
    if (r.hull > 0 || r.sail > 0) {
      s.damage.repair({ hull: r.hull, sail: r.sail, crew: 0 }, { refloat: underFire ? Infinity : FIELD_REFLOAT, douse: !underFire });
      s.repairing = true;
      s.credit -= r.work;
      while (s.credit < -1e-9 && deps.stores?.spend?.(b)) s.credit += STORE_POINTS;
      s.credit = Math.max(0, s.credit);
    }
    const mate = mateOf(b, s);
    const spent = s.credit <= 1e-9 && (deps.stores?.count?.(b) ?? 0) <= 0;
    if (auto) {
      if (b !== inPlay) return;
      if (!wantsRepair(s.damage)) deps.say?.(`${mate ? `${mate}: ` : ''}Repairs done, Captain.`, 4);
      else if (spent) deps.say?.(`${mate ? `${mate}: ` : ''}The carpenter's stores are spent, Captain.`, 4);
      return;
    }
    if (!wantsRepair(s.damage)) { s.crew.give(CREW_ORDERS.stand); deps.say?.(`${mate ? `${mate}: ` : ''}Repairs done, Captain.`, 4); }
    else if (spent) { s.crew.give(CREW_ORDERS.stand); deps.say?.(`${mate ? `${mate}: ` : ''}The carpenter's stores are spent, Captain.`, 4); }
  }
  /** @param {any} boat @param {string} order */
  function giveOrder(boat, order) {
    const st = myBoatState(boat);
    if (!st || !ORDER_TEXT[order]) return { ok: false, said: null };
    const mate = mateOf(boat, st), who = mate ? `${mate}: ` : '';
    let said = null;
    if (order === CREW_ORDERS.repair) {
      if (!wantsRepair(st.damage)) said = `${who}No repairs needed, Captain.`;
      else if (inPortWaters()) said = `${who}We're in port, Captain. The shipwright can do the repairs.`;
      else if (st.credit <= 1e-9 && (deps.stores?.count?.(boat) ?? 0) <= 0) said = `${who}We've no carpenter's stores aboard, Captain.`;
      if (said) { deps.say?.(said, 4); return { ok: false, said }; }
    }
    st.crew.give(order);
    said = `${who}${ORDER_TEXT[order].said}`;
    deps.say?.(said, 3);
    return { ok: true, said };
  }
  function yardModel(boat) {
    const st = myBoatState(boat);
    const d = st.damage;
    const discount = () => deps.captain?.yardDiscount?.() ?? 0;
    const offer = () => yardOffer(d, st.guns.barrels, deps.gold?.() ?? 0, { discount: discount() });
    const give = (id, n) => {
      if (id === 'barrels') st.guns.barrels += n;
      else d.repair({ hull: id === 'hull' ? n : 0, sail: id === 'sail' ? n : 0, crew: id === 'crew' ? n : 0 });
    };
    const buy = (id) => {
      const r = offer().rows.find((x) => x.id === id);
      if (!r || r.missing <= 0) return { ok: false, id, n: 0, cost: 0 };
      if (r.afford <= 0) return { ok: false, id, n: 0, cost: 0, short: r.price };
      deps.pay?.(r.cost);
      give(id, r.afford);
      return { ok: true, id, n: r.afford, cost: r.cost, whole: r.afford === r.missing };
    };
    const buyAll = () => {
      const plan = yardAll(d, st.guns.barrels, deps.gold?.() ?? 0, { discount: discount() });
      const cost = plan.reduce((sum, p) => sum + p.cost, 0);
      if (cost > 0) deps.pay?.(cost);
      for (const p of plan) give(p.id, p.n);
      return { ok: cost > 0, cost, bought: plan, whole: offer().whole === 0 };
    };
    const provisions = () => provisionOffer({ stores: deps.stores?.count?.(boat) ?? 0, stock: Math.max(STORES_STOCK, storesToWhole({ hull: 0, maxHull: d.maxHull, sail: 0, maxSail: d.maxSail })), morale: boat.crewed ? st.crew.morale : null, crew: d.crew, crewed: !!boat.crewed, gold: deps.gold?.() ?? 0, grogToday: st.crew.grogOn(where().day ?? null) });
    const buyProvision = (id) => {
      const r = provisions().rows.find((x) => x.id === id);
      if (!r || r.missing <= 0) return { ok: false, id, n: 0, cost: 0 };
      if (r.afford <= 0) return { ok: false, id, n: 0, cost: 0, short: r.price };
      if (id === 'stores' && !deps.stores?.add?.(boat, r.afford)) return { ok: false, id, n: 0, cost: 0 };
      deps.pay?.(r.cost);
      if (id === 'grog') { st.crew.event('grog'); st.crew.drankGrog(where().day ?? null); }
      return { ok: true, id, n: r.afford, cost: r.cost, whole: r.afford === r.missing };
    };
    return {
      name: HULL_NAMES[boat.hull], uid: boat.uid ?? null, cargo: () => boat.Cargo?.Items ?? null, room: () => csa()?.cargoRoom?.(boat) ?? null,
      ship: () => ({ hull: d.hull, maxHull: d.maxHull, sail: d.sail, maxSail: d.maxSail, crew: d.crew, maxCrew: d.maxCrew, barrels: st.guns.barrels, wrecked: d.state === SHIP_STATES.wrecked, stores: deps.stores?.count?.(boat) ?? 0, morale: boat.crewed ? st.crew.morale : null }),
      offer, buy, buyAll, prices: YARD_PRICE, hasBarrels: batteryOf(boat.hull, 'stern')?.gun === 'barrel',
      provisions, buyProvision,
      crewDeal: crewDealOf(boat, st, crewHands, companions),
    };
  }
  function openYard(boat, { quay = false } = {}) { const m = yardModel(boat); m.atQuay = !!quay; return !!deps.openYard?.(m); }

  function fleetStatus(boat) {
    const st = myBoatState(boat);
    if (!st) return null;
    const d = st.damage;
    return { hull: d.hull, maxHull: d.maxHull, sail: d.sail, maxSail: d.maxSail, crew: d.crew, maxCrew: d.maxCrew, wrecked: d.state === SHIP_STATES.wrecked,
      fire: d.fire > 0, stores: deps.stores?.count?.(boat) ?? 0, inFight: !!st.inFight, morale: boat.crewed ? st.crew.morale : null, barrels: st.guns.barrels, wants: wantsRepair(d) };
  }
  function repairAway(boat) {
    const st = myBoatState(boat);
    if (!st) return { ok: false, text: 'No such ship of yours.', spent: 0 };
    const d = st.damage;
    if (!boat.crewed) return { ok: false, text: 'This ship has no crew to make repairs.', spent: 0 };
    if (d.crew <= 0) return { ok: false, text: 'This ship has no crew aboard to make repairs. Hire crew at a shipwright.', spent: 0 };
    if (st.inFight) return { ok: false, text: 'The crew is busy fighting.', spent: 0 };
    if (!wantsRepair(d) && !(d.fire > 0)) return { ok: false, text: 'This ship doesn\'t need repairs.', spent: 0 };
    const free = { hull: Math.max(0, d.maxHull * FIELD_MEND_CAP - d.hull), sail: d.maxSail > 0 ? Math.max(0, d.maxSail * FIELD_MEND_CAP - d.sail) : 0 };
    d.repair({ hull: free.hull, sail: free.sail, crew: 0 }, { refloat: FIELD_REFLOAT });
    const stores = deps.stores?.count?.(boat) ?? 0;
    const r = seaRepair(d, 1e9, { crewed: true, crewShare: 1, budget: st.credit + stores * STORE_POINTS });
    let spent = 0;
    if (r.hull > 0 || r.sail > 0) {
      d.repair({ hull: r.hull, sail: r.sail, crew: 0 }, { refloat: FIELD_REFLOAT });
      st.credit -= r.work;
      while (st.credit < -1e-9 && deps.stores?.spend?.(boat)) { st.credit += STORE_POINTS; spent++; }
      st.credit = Math.max(0, st.credit);
    }
    const mate = mateOf(boat, st), who = mate ? `${mate}: ` : '';
    const paid = spent ? ` ${spent === 1 ? 'One store' : `${spent} stores`} spent.` : '';
    if (!wantsRepair(d)) return { ok: true, text: `${who}All repaired, Captain.${paid}`, spent };
    return { ok: true, text: `${who}We've repaired what we can, Captain. We need carpenter's stores for the rest.${paid}`, spent };
  }
  function crewHands(boat) {
    const st = myBoatState(boat);
    if (!st || !boat.crewed) return [];
    if (playerCrewCount(boat.hull, st.damage.crew) !== st.crew.hands.length) {
      muster(boat, st);
      st.mustered = true;
    }
    return st.crew.hands.map((h) => ({ ...h }));
  }
  function assignRole(boat, name, role) {
    const st = myBoatState(boat);
    if (!st || !boat.crewed) return { ok: false, text: 'This ship has no crew.' };
    return st.crew.assign(name, role);
  }
  /**
   * @param {any} boat
   * @param {{ name: string, trade: string, mobile: number, sex: string, fights?: number, boardings?: number, lift?: number }} recruit
   */
  function enlistHand(boat, recruit) {
    const st = myBoatState(boat);
    if (!st || !boat?.crewed) return { ok: false, text: CREW_HALL_TEXT.noCrew };
    crewHands(boat);
    const d = st.damage;
    const plan = enlistPlan({ hull: boat.hull, crew: d.crew, maxCrew: d.maxCrew, hands: st.crew.hands.length });
    if (!plan.ok) return { ok: false, full: !!plan.full, text: plan.why };
    if (st.crew.hands.some((h) => h.name === recruit.name)) return { ok: false, text: CREW_HALL_TEXT.sameName(recruit.name) };
    const hand = st.crew.enlist(recruitHand(recruit), recruit.lift ?? 0);
    if (!hand) return { ok: false, text: CREW_HALL_TEXT.gone };
    const was = d.crew;
    d.muster(plan.crew);
    st.lastCrew = d.crew;
    st.mustered = true;
    return { ok: true, text: '', hand: { ...hand }, raise: d.crew - was };
  }
  const recruitHand = (recruit) => ({ name: recruit.name, role: recruit.trade, mobile: recruit.mobile, gender: recruit.sex, fights: recruit.fights, boardings: recruit.boardings, hall: recruit.id });
  function swapHand(boat, outName, recruit) {
    const st = myBoatState(boat);
    if (!st || !boat?.crewed) return { ok: false, text: CREW_HALL_TEXT.noCrew };
    crewHands(boat);
    if (!st.crew.hands.some((h) => h.name === outName)) return { ok: false, text: 'There\'s no crew member by that name aboard.' };
    if (boat.uid && companions.awayOf(boat.uid)?.has?.(outName)) return { ok: false, text: CREW_HALL_TEXT.ashore(outName) };
    if (st.crew.hands.some((h) => h.name === recruit.name)) return { ok: false, text: CREW_HALL_TEXT.sameName(recruit.name) };
    const out = st.crew.release(outName);
    const hand = st.crew.enlist(recruitHand(recruit), recruit.lift ?? 0);
    if (!hand) return { ok: false, text: CREW_HALL_TEXT.gone };
    st.mustered = true;
    return { ok: true, text: '', hand: { ...hand }, out };
  }
  /** @param {any} boat @param {string} name */
  function releaseHand(boat, name) {
    const st = myBoatState(boat);
    if (!st || !boat?.crewed) return { ok: false, text: 'This ship has no crew.' };
    crewHands(boat);
    if (boat.uid && companions.awayOf(boat.uid)?.has?.(name)) return { ok: false, text: CREW_HALL_TEXT.ashore(name) };
    if (!st.crew.hands.some((h) => h.name === name)) return { ok: false, text: 'There\'s no crew member by that name aboard.' };
    const plan = releasePlan({ crew: st.damage.crew });
    if (!plan.ok) return { ok: false, text: plan.why };
    const hand = st.crew.release(name);
    st.damage.discharge(plan.crew);
    st.lastCrew = st.damage.crew;
    const before = new Set(st.crew.hands.map((h) => h.name));
    const next = crewHands(boat).find((h) => !before.has(h.name)) ?? null;
    return { ok: true, text: '', hand, next };
  }
  const handsAshore = (uid) => (uid ? companions.awayOf(uid)?.size ?? 0 : 0);
  function forgetBoat(uid) {
    if (!uid) return;
    quay.forget(uid);
    boatState.delete(uid);
    pendingBoats.delete(uid);
  }
  function refitBoat(boat) {
    const st = boat?.uid ? boatState.get(boat.uid) : null;
    if (st) st.damage.rewhole(refitBuild(boat));
  }

  const crewSkill = (boat, st) => Math.min(1, (boat.crewed ? PLAYER_SKILL_THIN + (PLAYER_SKILL - PLAYER_SKILL_THIN) * st.damage.crewShare() : PLAYER_SKILL) * statScale(deps.captain?.stats?.(), 'aim'));

  const myFires = new Map();
  function douseMine(boat, f) {
    for (const fire of f.fires) fire.handle?.retire?.();
    f.loop?.stop?.();
    myFires.delete(boat);
  }
  function poseMyFires(dt) {
    const standing = myBoats();
    for (const [b, f] of myFires) if (!standing.includes(b)) douseMine(b, f);
    for (const b of standing) {
      const st = myBoatState(b);
      let f = myFires.get(b);
      if (st.damage.fire <= 0) { if (f) douseMine(b, f); continue; }
      if (!f) {
        f = { fires: [], loop: null };
        const spots = b.hull <= 1 ? 1 : 3;
        for (let i = 0; i < spots; i++) f.fires.push({ at: (i - (spots - 1) / 2) * 0.5, handle: deps.flame?.(b.GameObject.position) ?? null });
        myFires.set(b, f);
      }
      const pose = boatPose(b);
      const fw = flatUnit(quatRotate(pose.rotation, [0, 0, 1])) ?? [0, 0, 1];
      const build = hullBuild(b.hull);
      const deckY = pose.position[1] + build.deck + 1, len = (build.beam || 4) * 1.6;
      for (const fire of f.fires) {
        const p = [pose.position[0] + fw[0] * fire.at * len, deckY, pose.position[2] + fw[2] * fire.at * len];
        fire.handle?.move?.(p);
        effects.burn(p, dt);
      }
      f.loop ??= deps.audio?.loop3d?.(NAVAL_CLASSIC.burning, pose.position, 0.7, NAVAL_FIRE_LOOP) ?? null;
      f.loop?.move?.(pose.position);
    }
  }

  let aiming = false;
  let aim = null;
  let aimHit = null;
  let braceHeld = false;
  const loads = createNavalLoads({ boat: () => (enabled && armed(myBoat()) ? myBoat() : null), deck: (b) => myBoatState(b).guns, side: (b) => (aiming && aim?.side) || lookSide(b), aiming: () => aiming, say: (x, sec) => deps.say?.(x, sec), now: () => realClock });

  function lookOnShip(boat, side, look) {
    const bat = batteryOf(boat.hull, side);
    if (!bat || bat.gun === 'barrel' || !look) return null;
    const load = myBoatState(boat).guns.load(side);
    const g = shotGun(bat.gun, GUNS[bat.gun], load);
    const reach = rangeAt(g.maxEl * NAVAL_DEG, g.speed, bat.muzzles[0][1]) + LOOK_REACH_PAD;
    const l = Math.hypot(look.dir[0], look.dir[1], look.dir[2]) || 1;
    const far = [look.origin[0] + look.dir[0] / l * reach, look.origin[1] + look.dir[1] / l * reach, look.origin[2] + look.dir[2] / l * reach];
    let best = null;
    for (const e of sea.values()) {
      if (!e.boat || e.ship.damage.state === SHIP_STATES.sunk) continue;
      const hull = hullBox(e.boat);
      const boxes = [hull, ...rigBoxesOf(e.boat)];
      for (let i = 0; i < boxes.length; i++) {
        if (!boxes[i]) continue;
        const hit = segmentBoxEntry(look.origin, far, boxes[i], 0);
        if (hit && (!best || hit.t < best.t)) best = { t: hit.t, point: hit.point, e, hull, rig: i > 0 };
      }
    }
    for (const t of deps.serpent?.targets?.() ?? []) {
      const hit = segmentBoxEntry(look.origin, far, t.box, 0);
      if (hit && (!best || hit.t < best.t)) best = { t: hit.t, point: hit.point, e: null, hull: null, rig: false, v: t.v ?? null };
    }
    if (!best) return null;
    if (!best.e && !best.v) return best.point;
    const pose = boatPose(boat);
    const fire = flatUnit(quatRotate(pose.rotation, SIDE_DIR[side])) ?? [0, 0, 1];
    const v = best.e ? velocityOf(best.e.ship) : best.v;
    const p = best.rig && load !== 'chain' && best.hull ? best.hull.c : best.point;
    const along = (v[0] * fire[0] + v[2] * fire[2]) * dist2d(p, pose.position) / Math.max(1, g.speed * 0.97);
    return [p[0] + fire[0] * along, p[1], p[2] + fire[2] * along];
  }
  function lookAim(boat, side) {
    const look = deps.look?.();
    return aimSolution(boatPose(boat), side, look ? { ...look, at: lookOnShip(boat, side, look) } : null, deps.seaY(), { shot: myBoatState(boat).guns.load(side) });
  }
  function aimStrikes(solution) {
    if (!solution || solution.barrel) return null;
    const seaY = deps.seaY();
    const ships = [];
    for (const e of sea.values()) {
      const st = e.ship.damage.state;
      if (!e.boat || st === SHIP_STATES.sunk || st === SHIP_STATES.sinking) continue;
      const boxes = [hullBox(e.boat), ...(solution.shot === 'chain' ? rigBoxesOf(e.boat) : [])].filter(Boolean);
      if (boxes.length) ships.push({ e, v: velocityOf(e.ship), boxes: boxes.map((b) => ({ b, r: Math.hypot(b.h[0], b.h[1], b.h[2]) })) });
    }
    for (const t of deps.serpent?.targets?.() ?? []) ships.push({ e: SERPENT_AIM, v: t.v ?? [0, 0, 0], boxes: [{ b: t.box, r: Math.hypot(t.box.h[0], t.box.h[1], t.box.h[2]) }] });
    if (!ships.length) return null;
    let ship = null;
    const hits = solution.launches.map((l) => {
      const end = landing(l.p0, l.v0, seaY)?.t ?? 4;
      const n = Math.max(8, Math.ceil(end / HOT_STEP_S));
      let a = l.p0, ta = 0;
      for (let i = 1; i <= n; i++) {
        const tb = end * i / n, b = shotPosition(l.p0, l.v0, tb), tm = (ta + tb) / 2;
        const half = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2;
        let best = null;
        for (const s of ships) {
          const sx = s.v[0] * tm, sz = s.v[2] * tm;
          const a2 = [a[0] - sx, a[1], a[2] - sz], b2 = [b[0] - sx, b[1], b[2] - sz];
          const m = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2, (a2[2] + b2[2]) / 2];
          for (const { b: box, r } of s.boxes) {
            if (Math.hypot(m[0] - box.c[0], m[1] - box.c[1], m[2] - box.c[2]) > r + half) continue;
            const hit = segmentBoxEntry(a2, b2, box, 0);
            if (hit && (!best || hit.t < best.k)) best = { k: hit.t, e: s.e };
          }
        }
        if (best) {
          const t = ta + (tb - ta) * best.k;
          ship ??= best.e;
          return { t, point: shotPosition(l.p0, l.v0, t) };
        }
        a = b; ta = tb;
      }
      return null;
    });
    return ship ? { ship, hits } : null;
  }
  function aimState(st, side, boat) {
    if (st.damage.state === SHIP_STATES.wrecked) return 'crippled';
    if (st.guns.braced) return 'braced';
    if (!st.guns.ready(side)) return batteryOf(boat.hull, side)?.gun === 'barrel' && st.guns.barrels <= 0 ? 'empty' : 'reloading';
    return 'ready';
  }

  function wayScale(underSail) {
    const boat = myBoat();
    if (!enabled || !boat) return 1;
    if (haul.hauling(boarding)) return 0;
    const d = myBoatState(boat).damage;
    if (underSail) return d.state === SHIP_STATES.wrecked ? 0 : d.wayShare();
    return d.state === SHIP_STATES.wrecked ? WRECKED_OARS : 1;
  }
  function postsWay(boat) {
    if (!enabled || !boat?.crewed) return 1;
    const st = boat.uid ? boatState.get(boat.uid) : boatStateByObj.get(boat);
    return st?.worth?.way ?? 1;
  }
  function sailRefused() {
    const boat = myBoat();
    if (!enabled || !boat) return null;
    const d = myBoatState(boat).damage;
    if (d.state === SHIP_STATES.wrecked) return 'The ship is crippled. No sail will set.';
    if (d.maxSail > 0 && d.sailShare() <= 0) return 'The rigging is shot away. No sail will set.';
    return null;
  }

  const aimCam = createAimCamera({
    setting, aiming: () => aiming, aim: () => aim, boat: myBoat, wrecked: (b) => myBoatState(b).damage.state === SHIP_STATES.wrecked, pose: boatPose, hull: hullBox, rig: rigBoxesOf,
    alongside: () => seaHulls.boxes(),
  });
  const seaHulls = createSeaHulls({ sea, hullBox, velocity: velocityOf, peerBoats: () => deps.peerBoats?.() ?? [], myBoats, myBoat, enabled: () => enabled });

  function lookSide(boat) {
    const look = deps.look?.();
    if (!look) return null;
    const side = sideForBearing(bearingOf(look.dir, boat.GameObject.rotation));
    return batteryOf(boat.hull, side) ? side : null;
  }
  const armed = (boat) => !!boat && batteriesOf(boat.hull).length > 0;

  function attackInput(held) {
    if (!enabled) return false;
    const boat = myBoat();
    if (!armed(boat)) { aiming = false; return false; }
    const st = myBoatState(boat);
    if (held) { aiming = true; return true; }
    if (!aiming) return true;
    aiming = false;
    const side = lookSide(boat);
    if (!side) { deps.say?.('No guns bear there.', 1.5); return true; }
    if (st.damage.state === SHIP_STATES.wrecked) { deps.say?.('Your guns are silent. The ship is crippled.', 2); return true; }
    if (st.guns.braced) { deps.say?.('You are braced. Let go of the brace to fire.', 1.5); return true; }
    if (!st.guns.ready(side)) {
      const bat = batteryOf(boat.hull, side);
      deps.say?.(bat?.gun === 'barrel' && st.guns.barrels <= 0 ? 'No fire barrels left.' : `The ${side} guns are reloading (${st.guns.left(side).toFixed(1)} s).`, 1.5);
      return true;
    }
    const pose = boatPose(boat);
    const solution = lookAim(boat, side);
    fire({ shooter: myBoatId(boat), wireShooter: -1, hull: boat.hull, pose, solution, skill: crewSkill(boat, st) });
    st.guns.fired(side);
    return true;
  }

  function cancelAim() { aiming = false; aim = null; }
  function holdFire() {
    if (!aiming) return false;
    cancelAim();
    deps.say?.('Hold fire.', 1.2);
    return true;
  }

  let boarding = null;
  const haul = createNavalHaul({ csa, myBoat, boatPose, yawOfRot });
  function boardable(boat) {
    if (!boat) return null;
    const pose = boatPose(boat);
    const look = deps.look?.();
    let best = null, bestScore = Infinity;
    for (const e of sea.values()) {
      const d = boardingGap(boat, e, pose);
      if (d == null) continue;
      let score = d;
      if (look) {
        const to = [e.ship.pos[0] - look.origin[0], 0, e.ship.pos[2] - look.origin[2]];
        const l = Math.hypot(to[0], to[2]) || 1;
        const lf = flatUnit(look.dir) ?? [0, 0, 1];
        score -= 40 * (to[0] / l * lf[0] + to[2] / l * lf[2]);
      }
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }
  // One reach check: crews muster only for a boarding this would allow.
  function boardingGap(boat, e, pose = boatPose(boat)) {
    if (!boardableState(e.ship) || !e.boat) return null;
    const d = dist2d(e.ship.pos, pose.position) - (hullBuild(e.ship.hull).beam + hullBuild(boat.hull).beam);
    return d > BOARD_RANGE * statScale(deps.captain?.stats?.(), 'reach') ? null : d;
  }
  function footReach(e, feet) {
    return boardableState(e.ship) && !!e.boat && dist2d(e.ship.pos, feet) - hullBuild(e.ship.hull).beam <= FOOT_BOARD_M;
  }

  const brake = () => (enabled ? haul.brake(boarding) : 0);

  function activate({ boatTrigger = false } = {}) {
    if (!enabled || boarding || aiming) return false;
    const boat = myBoat();
    const prize = prizeInReach(boat);
    if (prize) { openPrize(prize); return true; }
    if (boat) {
      const e = boardable(boat);
      if (e) { startBoarding('board', e, boat); return true; }
      return yardHere(boat) && openYard(boat, { quay: true });
    }
    const e = boardableOnFoot();
    const p = e || boatTrigger || gangwayInReach() ? null : passageShip();
    if (p) { deps.passage({ id: p.id, name: p.ship.names?.name ?? null, captain: p.ship.names?.captain ?? null, hull: p.ship.hull, faction: p.ship.cls.faction }); return true; }
    if (!e) { const g = boatTrigger ? null : gangwayInReach(); return g ? takeGangway(g) : false; }
    startBoarding('board', e, null);
    return true;
  }
  function takesActivate({ boatTrigger = false } = {}) {
    if (aiming || boarding || !enabled) return false;
    const boat = myBoat();
    if (prizeInReach(boat)) return true;
    if (boat) return !!(boardable(boat) || yardHere(boat));
    if (!boatTrigger && passageShip()) return true;
    return !!(boardableOnFoot() || (!boatTrigger && gangwayInReach()));
  }
  function prizeInReach(boat) {
    const from = boat ? boatPose(boat).position : deps.feet();
    const look = deps.look?.();
    const lf = look ? flatUnit(look.dir) : null;
    for (const e of sea.values()) {
      if (!e.prize || e.prize.fate || !e.boat || e.ship.damage.state !== SHIP_STATES.prize) continue;
      const reach = boat ? BOARD_RANGE + hullBuild(boat.hull).beam : FOOT_BOARD_M;
      if (dist2d(e.ship.pos, from) - hullBuild(e.ship.hull).beam > reach) continue;
      if (lf) {
        const to = [e.ship.pos[0] - look.origin[0], 0, e.ship.pos[2] - look.origin[2]];
        if ((to[0] * lf[0] + to[2] * lf[2]) / (Math.hypot(to[0], to[2]) || 1) < 0.5) continue;
      }
      return e;
    }
    return null;
  }
  function boardableOnFoot() {
    const feet = deps.feet();
    const look = deps.look?.();
    for (const e of sea.values()) {
      if (!footReach(e, feet)) continue;
      if (look) {
        const box = hullBox(e.boat);
        const to = box ? [box.c[0] - look.origin[0], 0, box.c[2] - look.origin[2]] : null;
        const lf = flatUnit(look.dir);
        if (to && lf && (to[0] * lf[0] + to[2] * lf[2]) / (Math.hypot(to[0], to[2]) || 1) < 0.5) continue;
      }
      return e;
    }
    return null;
  }

  function startBoarding(kind, entry, boat) {
    const from = { pos: [...entry.ship.pos], yaw: entry.ship.yaw };
    const to = boat ? haul.berth(boat, from, entry.ship.hull) : from;
    // A ship another player owns is taken over at the grapple, so the haul, fight, and prize run in one world.
    adopt(entry);
    boarding = createBoarding({ kind, shipId: entry.id, from, to: { pos: [...to.pos], yaw: to.yaw }, hull: entry.ship.hull });
    boarding.boat = boat;
    boarding.peerOrigin = deps.aboardPeer?.() ?? null;
    if (!boat) boarding.t = Infinity;
    haul.start(boarding, to);
    entry.ship.boarded = true;
    entry.ship.speed = 0;
    entry.ship.damage.douse();
    douse(entry);
    sound(NAVAL_SFX.grapple, entry.ship.pos, 0.9);
    deps.say?.(kind === 'board' ? `Grapples away! Hauling ${entry.ship.names?.name ?? 'it'} alongside...` : `Grappling hooks! ${entry.ship.names?.name ? `${entry.ship.names.name} is` : 'The pirates are'} coming alongside. Repel boarders!`, 3);
  }

  function stepBoarding(dt) {
    const b = boarding;
    if (!b) return;
    const entry = sea.get(b.shipId);
    if (!entry) {
      const quest = b.quest;
      endBoarding();
      if (quest) { raidUids.delete(quest.uid); deps.board?.endRaid?.(quest, { withdraw: false, crew: true }); }
      return;
    }
    const was = b.phase;
    if (was === 'grapple') {
      const pose = haul.step(b, entry.ship.hull, dt);
      entry.ship.pos = [pose.pos[0], entry.ship.pos[1], pose.pos[2]]; entry.ship.yaw = pose.yaw;
    }
    b.step(dt);
    if (was === 'grapple' && b.phase === 'fight') beginFight(b, entry);
    if (b.phase !== 'fight') return;
    if (dist2d(deps.feet(), entry.ship.pos) > ABANDON_RANGE) {
      if (b.kind === 'repel') { castOff(b, entry, 'abandon'); return; }
      deps.say?.('You leave the boarding. The enemy crew stands down.', 3);
      for (const f of b.foes) deps.board?.removeFoe?.(f.handle);
      b.foes = [];
      entry.ship.boarded = false;
      b.abandon();
      endBoarding();
      return;
    }
    if (b.quest) {
      if (raidQuestWon(b.quest)) winBoarding(b, entry);
      else if (raidQuestRetreated(b.quest)) castOff(b, entry, 'retreat');
      return;
    }
    const down = b.foes.filter((f) => deps.board?.foeDown?.(f.handle)).length;
    const captainDown = b.foes.some((f) => f.captain && deps.board?.foeDown?.(f.handle));
    if (boardingWon({ captainDown, down, total: b.foes.length })) winBoarding(b, entry);
  }

  function beginFight(b, entry) {
    const boat = b.boat;
    deps.board?.leaveHelm?.();
    const taken = [];
    const free = (p) => !!p && taken.every((q) => dist2d(q, p) >= BODY_GAP);
    const claim = (spot) => { taken.push(spot[0]); return spot; };
    const pick = (...deals) => {
      for (const d of deals) for (let i = 0; i < d.size; i++) { const spot = d(); if (spot && free(spot[0])) return claim(spot); }
      return null;
    };
    if (b.kind === 'board') {
      const spots = deps.board?.deckSpots?.(entry.boat, DECK_SPOTS) ?? [];
      const first = spots[0] ?? [entry.ship.pos, entry.ship.yaw];
      const landing = deps.board?.landing?.(entry.boat, deps.feet()) ?? null;
      deps.board?.placePlayer?.((landing ?? first)[0], (landing ?? first)[1]);
      claim(landing ?? first);
      const deal = dealer(spots);
      const muster = musterOf(entry.ship.cls, entry.ship.damage.crewShare());
      const all = [muster.captain, ...muster.men];
      const crew = deps.board?.crewOf?.(entry.boat, Infinity) ?? [];
      b.foes = [];
      for (let i = 0; i < all.length; i++) {
        const c = crew[i];
        const spot = c && free(c.feet) ? claim([c.feet, c.yaw]) : pick(deal);
        if (!spot) continue;
        const named = { ...(i === 0 && entry.ship.names?.captain ? { name: `Captain ${entry.ship.names.captain}` } : {}), team: crewTeamOf(entry.ship.cls), boat: entry.boat, ...(c ? { gender: c.gender } : {}) };
        const handle = deps.board?.spawnFoe?.(c ? c.mobile : all[i], spot[0], spot[1], 'enemy', named);
        if (handle) b.foes.push({ handle, captain: i === 0 });
      }
      entry.deck = b.foes.map((f) => f.handle);
      const st = myBoatState(boat);
      const hands = myHands(boat, st);
      const mine = deps.board?.crewOf?.(boat, hands) ?? [];
      const rail = dealer(deps.board?.railSpots?.(entry.boat, boat ? boatPose(boat).position : deps.feet(), hands) ?? []);
      for (let i = 0; i < hands; i++) {
        const spot = pick(rail, deal);
        if (!spot) break;
        const handle = deps.board?.spawnFoe?.(mine[i]?.mobile ?? HAND, spot[0], spot[1], 'ally', { boat: entry.boat, ...(mine[i] ? { gender: mine[i].gender } : {}) });
        if (handle) b.hands.push({ handle });
      }
      deps.mid?.(`You board ${entry.ship.names?.name ?? 'it'}!`, 3);
      deps.say?.(entry.ship.cls.faction === 'pirate' ? `Captain ${entry.ship.names?.captain ?? ''} rallies the pirates. Cut them down!` : `The crew of ${entry.ship.names?.name ?? 'it'} stand to defend their ship.`, 5);
      return;
    }
    const crewed = !!boat?.crewed;
    const wa = deps.warmAshesOn?.() !== false;
    const deal = dealer(deps.board?.deckSpots?.(boat, DECK_SPOTS) ?? []);
    taken.push(deps.feet());
    const hands = myHands(boat, myBoatState(boat));
    const mine = deps.board?.crewOf?.(boat, hands) ?? [];
    if (crewed && wa) {
      const quest = deps.board?.startRaid?.(raidQuestOf(entry.ship.cls));
      if (quest) { b.quest = quest; raids.set(quest, b); if (Number.isFinite(quest.uid)) raidUids.add(quest.uid); return; }
    }
    const n = repelPartyOf(entry.ship.cls);
    const party = deps.board?.crewOf?.(entry.boat, n, { from: 1 }) ?? [];
    const rail = dealer(deps.board?.railSpots?.(boat, entry.ship.pos, n) ?? []);
    b.foes = [];
    for (let i = 0; i < n; i++) {
      const spot = pick(rail, deal);
      if (!spot) break;
      const handle = deps.board?.spawnFoe?.(party[i]?.mobile ?? musterOf(entry.ship.cls).men[i % 4], spot[0], spot[1], 'enemy', { team: crewTeamOf(entry.ship.cls), boat, ...(party[i] ? { gender: party[i].gender } : {}) });
      if (handle) b.foes.push({ handle, captain: false });
    }
    for (let i = 0; i < hands; i++) {
      const spot = mine[i] && free(mine[i].feet) ? claim([mine[i].feet, mine[i].yaw]) : pick(deal);
      if (!spot) break;
      const handle = deps.board?.spawnFoe?.(mine[i]?.mobile ?? HAND, spot[0], spot[1], 'ally', { boat, ...(mine[i] ? { gender: mine[i].gender } : {}) });
      if (handle) b.hands.push({ handle });
    }
  }

  function wonRaid(quest) {
    if (quest) deps.board?.endRaid?.(quest, { won: true });
  }
  function winBoarding(b, entry) {
    crewEvent(b.boat ?? boatInPlay(), 'boarding');
    crewEvent(b.boat ?? boatInPlay(), b.kind === 'repel' ? 'win' : 'prize');
    if (b.kind === 'repel') {
      const again = b.boat && myBoats().includes(b.boat) ? b.boat : null;
      if (again && legendOfClass(entry.ship.cls.id)?.trait === 'boarders' && !entry.boardedAgain && entry.ship.damage.state === SHIP_STATES.afloat) {
        entry.boardedAgain = true;
        entry.ship.damage.apply({ hull: 0, sail: 0, crew: entry.ship.damage.crew / 2 }, clock);
        endBoarding();
        wonRaid(b.quest);
        deps.mid?.(`The boarders are thrown back, but ${entry.ship.names?.name ?? 'it'} sends more over the rail!`, 3);
        startBoarding('repel', entry, again);
        return;
      }
      deps.mid?.('The boarders are thrown back!', 3);
      chargePlayer('repel', entry, { questPays: !!b.quest && entry.ship.cls.flagship });
      if (entry.ship.damage.state === SHIP_STATES.afloat) entry.ship.damage.apply({ hull: Math.max(0, entry.ship.damage.hull - entry.ship.damage.maxHull * 0.24), sail: 0, crew: 0 }, clock);
      entry.ship.damage.apply({ hull: 0, sail: 0, crew: entry.ship.damage.crew }, clock);
      entry.ship.boarded = false;
      endBoarding();
      wonRaid(b.quest);
      return;
    }
    b.win();
    let yielded = 0;
    for (const f of b.foes) if (!deps.board?.foeDown?.(f.handle)) { deps.board?.standDown?.(f.handle); yielded++; }
    entry.ship.damage.takePrize();
    entry.ship.boarded = false;
    chargePlayer('board', entry);
    sound(NAVAL_CLASSIC.bell, entry.ship.pos, 1);
    deps.mid?.(`${entry.ship.names?.name ?? 'It'} is yours!`, 3);
    if (yielded) deps.say?.('The rest of the enemy crew surrenders.', 3);
    entry.prize = { hold: holdOf(entry.ship.cls, entry.ship.seed, (key, tier) => deps.hold?.(key, tier + (entry.deep ? DEEP_TIER : 0) + etherTier(entry)) ?? []), boat: b.boat ?? nearestBoat(entry.ship.pos), peerOrigin: b.peerOrigin ?? null, chosen: null, fate: null };
    entry.prize.drawn = drawnPlunder(entry.prize.hold);
    // A lawful ship's hold is marked stolen as it is drawn, so every way out carries the mark;
    // pirate and Eltheric holds are not, matching the charge.
    if (lawfulGoods(entry)) markStolen(entry.prize.hold);
    deps.captain?.prize?.(entry.ship.names?.name ?? classLine(entry.ship.cls, entry.ship.names?.crown), deps.worth?.(entry.prize.hold) ?? 0);
    endBoarding();
    openPrize(entry);
  }
  const _plundered = new WeakSet();
  function takeInto(hold, boat) {
    if (!hold.length) return { taken: 0, left: 0, where: boat ? 'hold' : 'pack' };
    const all = hold.splice(0);
    const r = deps.board?.giveItems?.(all, boat) ?? { left: all };
    const left = Array.isArray(r.left) ? r.left : [];
    for (const it of left) hold.push(it);
    tallyPlunder(all.filter((it) => !left.includes(it)));
    if (all.length > left.length && !_plundered.has(hold)) { _plundered.add(hold); crewEvent(boat ?? boatInPlay(), 'plunder'); }
    return { taken: all.length - left.length, left: left.length, where: boat ? 'hold' : 'pack' };
  }
  // The sea is never saved, so the crew stows unemptied prizes and my casks before a clear; the host skips this on a
  // load.
  function stowPlunder() {
    if (!enabled) return { items: 0, prizes: 0, casks: 0, lost: 0 };
    let items = 0, prizes = 0, casks = 0, lost = 0;
    const standing = myBoats();
    const feet = deps.feet();
    const nearMe = () => standing.reduce((best, b) => (!best || dist2d(b.GameObject.position, feet) < dist2d(best.GameObject.position, feet) ? b : best), null);
    const into = myBoat() ?? nearMe();
    for (const e of sea.values()) {
      const pz = e.prize;
      if (pz && !pz.fate) settlePlunder(pz);
      if (!pz?.hold?.length || pz.fate === 'scuttle') continue;
      const r = takeInto(pz.hold, standing.includes(pz.boat) ? pz.boat : into);
      if (r.taken) { items += r.taken; prizes++; }
      lost += r.left;
    }
    for (const f of shots.floaters().filter((o) => o.kind === 'flotsam' && !o.owner && myCasks.has(o.id))) {
      if (isSalvage(f.lot)) {
        const r = stowSalvage(salvageOf(classById(f.from)), into);
        shots.removeFloater(f.id);
        casks++;
        items += r.stores;
        lost += r.lost;
        continue;
      }
      const got = deps.hold?.(f.lot, holdTier(classById(f.from)) + (f.deep ? DEEP_TIER : 0)) ?? [];
      if (stolenCasks.delete(f.id)) markStolen(got);
      const r = got.length ? deps.board?.giveItems?.(got, into) ?? { left: got } : { left: [] };
      shots.removeFloater(f.id);
      casks++;
      const left = Array.isArray(r.left) ? r.left.length : 0;
      items += got.length - left;
      lost += left;
    }
    if (items) deps.say?.(`Your crew stows the plunder left at sea (${items} ${items === 1 ? 'thing' : 'things'}).`, 3);
    if (lost) deps.say?.(`${lost} ${lost === 1 ? 'thing' : 'things'} would not fit and ${lost === 1 ? 'was' : 'were'} left behind.`, 3);
    return { items, prizes, casks, lost };
  }
  function myHands(boat, st) {
    const base = handsOf(st?.damage.crew ?? 0, !!boat?.crewed);
    if (!base || !boat?.crewed || !st?.crew) return base;
    const mate = st.worth?.hands ?? 0;
    const men = Math.floor((st.damage.crew ?? 0) / CREW_PER_HAND);
    return Math.max(1, Math.min(base + 1 + mate, base + handsBonusOf(st.crew.morale, st.crew.order) + mate, Math.max(base + 1, men)));
  }
  function notePlunder(items) {
    if (items?.length) deps.captain?.note?.('plunder', deps.worth?.(items) ?? 0);
  }
  const _drawn = new WeakSet();
  function drawnPlunder(items) { for (const it of items) if (it && typeof it === 'object') _drawn.add(it); return [...items]; }
  function tallyPlunder(items) { notePlunder((items ?? []).filter((it) => it && typeof it === 'object' && _drawn.delete(it))); }
  const settlePlunder = (pz) => tallyPlunder((pz?.drawn ?? []).filter((it) => !pz.hold.includes(it)));
  function crewEvent(boat, kind) {
    if (!boat) return;
    const st = myBoatState(boat);
    if (st?.crew && boat.crewed) st.crew.event(kind);
  }
  const struckToMe = () => { crewEvent(boatInPlay() ?? myBoat(), 'win'); noteAct('ship-struck'); };
  function nearestBoat(pos) {
    let best = null, bestD = COLLIDE_RANGE;
    for (const b of myBoats()) { const d = dist2d(b.GameObject.position, pos); if (d < bestD) { bestD = d; best = b; } }
    return best;
  }

  function openPrize(entry) {
    const s = entry.ship;
    const pz = entry.prize;
    if (!pz) return false;
    const boat = pz.boat && myBoats().includes(pz.boat) ? pz.boat : null;
    const st = boat ? myBoatState(boat) : null;
    const numbers = () => ({ maxHull: st.damage.maxHull, hull: st.damage.hull, maxSail: st.damage.maxSail, sail: st.damage.sail, maxCrew: st.damage.maxCrew, crew: st.damage.crew });
    const armament = () => ({
      barrelStock: BARREL.stock, barrels: st.guns.barrels, barrelGuns: batteriesOf(boat.hull).some((x) => x.gun === 'barrel'),
      loaded: SIDES.every((side) => !batteryOf(boat.hull, side) || st.guns.left(side) === 0),
      guns: batteriesOf(boat.hull).length > 0,
    });
    const crownName = entry.ether ? null : crownOfShip(s);
    const lawful = !!NAVAL_FACTIONS[s.cls.faction]?.lawful;
    const law = () => ({ notoriety: notoriety.get(crownName), lawful, crown: crownName });
    return deps.board?.openPlunder?.({
      name: s.names?.name ?? 'The prize', captain: s.names?.captain ?? null, classLine: classLine(s.cls, s.names?.crown),
      faction: s.cls.faction, items: pz.hold, raid: false,
      mine: () => (st ? { name: HULL_NAMES[boat.hull], hull: st.damage.hullShare(), sail: st.damage.maxSail > 0 ? st.damage.sailShare() : null, crew: st.damage.maxCrew > 0 ? st.damage.crewShare() : null } : null),
      offers: () => (st ? CHOICES.map((c) => choiceOffer(c, numbers(), armament(), law())) : []),
      takeAll: () => takeInto(pz.hold, boat),
      chosen: () => pz.chosen,
      fated: () => pz.fate,
      choose(choice) {
        if (pz.chosen || pz.fate || !st) return false;
        if (!CHOICES.includes(choice)) return false;
        const fx = choiceEffect(choice, numbers(), { barrelStock: BARREL.stock, notoriety: notoriety.get(crownName) });
        pz.chosen = choice;
        if (fx.notoriety) notoriety.add(crownName, fx.notoriety);
        if (fx.repair) {
          const was = [st.damage.hull, st.damage.sail];
          st.damage.repair({ hull: fx.repair.hull, sail: fx.repair.sail, crew: 0 });
          pz.took = { hull: st.damage.hull - was[0], sail: st.damage.sail - was[1] };
        }
        if (fx.barrels != null) st.guns.barrels = Math.max(st.guns.barrels, fx.barrels);
        if (fx.reload) st.guns.restore({ clocks: {}, barrels: st.guns.barrels });
        if (fx.crew) st.damage.repair({ hull: 0, sail: 0, crew: fx.crew });
        deps.say?.(choice === 'repair' ? `Salvaged timber and rope repair your ${HULL_NAMES[boat.hull]}.` : choice === 'powder' ? 'The captured powder is stowed aboard. Every gun is loaded.'
          : choice === 'press' ? 'The captured crew are put to work on your guns.'
            : !crownName ? (lawful ? 'You burn the ship\'s papers. No crown\'s law reaches past the Veil.' : 'The crew are put ashore in irons. No crown past the Veil will hang them.')
              : lawful ? `You burn the ship's papers. No one is left to report you in ${crownName}'s waters.` : `The crew are handed in irons to the crown of ${crownName}, and the crown will remember it.`, 3);
        return true;
      },
      claimOffer: () => (claimable(entry) ? { detail: claimDetail(entry) } : null),
      fate(which) {
        if (pz.fate) return false;
        if (which === 'claim') return claimPrize(entry, boat);
        // Move to a surviving deck before releasing this one; a passenger is never put at the owner's helm.
        if (!returnFromPrize(pz, boat)) { deps.say?.('No safe return deck is available. Stay here or claim the ship first.', 4); return false; }
        settlePlunder(pz);
        pz.fate = which === 'scuttle' ? 'scuttle' : 'adrift';
        if (pz.fate === 'scuttle') { s.damage.scuttle(); s.damage.apply({ hull: 0, sail: 0, crew: 0, fire: true }, clock); igniteShip(entry); deps.say?.(`You set ${s.names?.name ?? 'it'} on fire. It burns to the waterline.`, 4); sound(NAVAL_CLASSIC.bubbles, s.pos, 1); }
        else { s.adrift = true; deps.say?.(`You cut ${s.names?.name ?? 'it'} loose to drift.`, 3); }
        return true;
      },
      leave() { returnFromPrize(pz, boat); },
    }) !== false;
  }

  function claimPrize(entry, captor) {
    const r = claimable(entry) ? csa() : null;
    if (!r) return false;
    const s = entry.ship, pz = entry.prize, d = s.damage, hers = entry.boat;
    const at = [s.pos[0], deps.seaY(), s.pos[2]];
    const deed = mintDeed(s.hull, s.variant, deps.board.mintUid(), prizeDeedValue(s.hull));
    const pack = deps.board.packDeed(deed);
    // All or nothing: a placing that fails takes the deed back out of the pack, so she stays a prize and never has two
    // deeds.
    let boat = null;
    try { boat = r.LaunchFromDeed(deed, pack, at, forwardOfYaw(s.yaw), deps.board.terrainAt?.(at)); } catch (err) { console.warn('[naval] a claimed prize would not be placed', err); }
    if (!boat) { const list = pack(), i = list.indexOf(deed); if (i >= 0) list.splice(i, 1); deps.board?.forgetDeed?.(deed); return false; }
    pz.fate = 'claim';
    tallyPlunder(pz.drawn ?? []);
    if (pz.hold.length) deps.board?.giveItems?.(pz.hold.splice(0), boat);
    const st = myBoatState(boat);
    const took = pz.took ?? { hull: 0, sail: 0 };
    st.damage.restore({ hull: Math.max(1, ((d.hull - took.hull) / d.maxHull) * st.damage.maxHull), sail: ((d.sail - took.sail) / d.maxSail) * st.damage.maxSail, crew: 0 });
    st.lastCrew = st.damage.crew;
    st.guns.barrels = pz.chosen === 'powder' ? 0 : s.guns.barrels;
    if (entry.fromHarbour) departedOf(entry.fromHarbour, where().day ?? 0).add(s.seed);
    drop(entry);
    deps.board?.redeck?.(hers, boat);
    const name = s.names?.name ?? 'It';
    deps.say?.(boat.crewed ? `${name} is yours. The title is in your Fleet ledger (Holdings). It has no crew: hire crew at a shipwright.` : `${name} is yours. It stays where you captured it.`, 5);
    deps.captain?.note?.('claimed');
    if (!returnFromPrize(pz, captor)) returnAboard(boat);
    return true;
  }
  const claimable = (entry) => !entry.owner && typeof csa()?.LaunchFromDeed === 'function' && typeof deps.board?.mintUid === 'function' && typeof deps.board?.packDeed === 'function';
  const claimDetail = (entry) => (entry.boat?.crewed ? t('naval.claim.keepShip', 'Keep it as your own {hull} where it lies, with its cargo and no crew. To move it, sail it to port or use Bring here at a shipyard on this side of the Veil.', { hull: HULL_NAMES[entry.ship.hull] })
    : `Keep it as your own ${HULL_NAMES[entry.ship.hull]} where it is, with the cargo in its hold.`);

  function returnFromPrize(prize, ownBoat) {
    if (ownBoat && myBoats().includes(ownBoat)) return returnAboard(ownBoat);
    const peer = prize.peerOrigin;
    if (!peer?.GameObject?.activeSelf || !deps.pool.peerBoats.includes(peer)) return false;
    const spot = deps.board?.deckSpots?.(peer, 4)?.[0];
    if (!spot || !deps.board?.placePlayer) return false;
    deps.board.placePlayer(spot[0], spot[1]);
    return true;
  }
  function returnAboard(boat) {
    const spots = deps.board?.deckSpots?.(boat, 4) ?? [];
    if (!spots[0] || !deps.board?.placePlayer) return false;
    deps.board.placePlayer(spots[0][0], spots[0][1]);
    deps.board?.takeHelm?.(boat);
    return true;
  }

  function endBoarding() {
    if (!boarding) return;
    if (boarding.quest) raids.delete(boarding.quest);
    const fell = boarding.hands.filter((h) => deps.board?.foeDown?.(h.handle)).length;
    if (fell && boarding.boat) myBoatState(boarding.boat)?.damage.apply({ hull: 0, sail: 0, crew: fell * CREW_PER_HAND }, clock);
    for (const h of boarding.hands) deps.board?.removeFoe?.(h.handle);
    boarding = null;
  }
  function founderUnderFight(entry) {
    const b = boarding;
    for (const f of b.foes) if (!deps.board?.foeDown?.(f.handle)) deps.board?.removeFoe?.(f.handle);
    b.foes = [];
    entry.ship.boarded = false;
    b.abandon?.();
    const boat = b.boat && myBoats().includes(b.boat) ? b.boat : null;
    endBoarding();
    deps.mid?.(`${entry.ship.names?.name ?? 'It'} is going down! Back to your own ship!`, 3);
    if (boat) returnAboard(boat);
  }
  function castOff(b, entry, why) {
    const quest = b.quest;
    for (const f of b.foes) deps.board?.removeFoe?.(f.handle);
    b.foes = [];
    b.abandon?.();
    // End the boarding first: the raid's end below comes back through raidEnded and must find no boarding.
    endBoarding();
    if (quest) { raidUids.delete(quest.uid); deps.board?.endRaid?.(quest, { withdraw: true }); }
    entry.ship.boarded = false;
    entry.ship.spare?.set?.(myId(), entry.ship.clock + SPARE_S);
    sheerOff(entry);
    const name = entry.ship.names?.name ?? 'the pirates\' ship';
    deps.say?.(why === 'abandon' ? `You leave your deck to them. The pirates fall back to ${name} and cast off.` : `The pirates fall back to ${name} and cast off.`, 4);
  }

  const raids = new Map();
  // Raid quest uids are saved: a restored raid has no boarding, and its Leave Ship must still be the naval arc's.
  const raidUids = new Set();
  let prizeRaid = null;
  function leaveShipGate(quest) {
    const b = raids.get(quest);
    if (b) {
      const entry = sea.get(b.shipId);
      if (entry) winBoarding(b, entry); else { endBoarding(); wonRaid(quest); }
      return 'naval';
    }
    if (quest && raidUids.has(quest.uid)) { wonRaid(quest); return 'naval'; }
    if (!enabled || setting('RaidPrize', true) !== true) return 'proceed';
    if (prizeRaid?.quest === quest) return prizeRaid.state === 'done' ? 'proceed' : 'wait';
    prizeRaid = { quest, state: 'open' };
    const cls = classById(deps.level?.() >= 4 ? 'pirateBrig' : 'pirateSloop');
    const seed = u32();
    const names = shipNames(cls, seed, { regionIndex: where().region ?? 17 });
    const items = holdOf(cls, seed, (key, tier) => deps.hold?.(key, tier) ?? []);
    const drawn = drawnPlunder(items);
    const opened = deps.board?.openPlunder?.({
      name: names.name, captain: names.captain, classLine: classLine(cls), faction: 'pirate', items, raid: true,
      mine: () => null, offers: () => [], takeAll: () => takeInto(items, null),
      chosen: () => null, fated: () => (prizeRaid?.state === 'done' ? 'sailed' : null),
      choose: () => false,
      fate: () => { if (prizeRaid) prizeRaid.state = 'done'; tallyPlunder(drawn.filter((it) => !items.includes(it))); },
    });
    if (opened === false) { prizeRaid.state = 'done'; return 'proceed'; }
    return 'wait';
  }
  function raidEnded(quest) {
    if (quest) raidUids.delete(quest.uid);
    const b = raids.get(quest);
    if (!b) return;
    const entry = sea.get(b.shipId);
    if (entry && raidQuestWon(quest)) { winBoarding(b, entry); return; }
    if (entry) { castOff(b, entry, 'ended'); return; }
    endBoarding();
  }
  function placeQuestFoe(quest, isFree = null) {
    const b = raids.get(quest);
    if (!b) return quest && raidUids.has(quest.uid) ? false : null;
    if (!b.boat) return null;
    b.deal ??= [dealer(deps.board?.railSpots?.(b.boat, sea.get(b.shipId)?.ship.pos ?? deps.feet(), DECK_SPOTS / 2) ?? []), dealer(deps.board?.deckSpots?.(b.boat, DECK_SPOTS) ?? [])];
    for (const deal of b.deal) {
      for (let i = 0; i < deal.size; i++) {
        const spot = deal();
        if (spot && (!isFree || isFree(spot))) return [spot[0], spot[1], b.boat];
      }
    }
    return false;
  }
  function dealer(spots) {
    const deck = [...spots];
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    let k = 0;
    const deal = () => (deck.length ? deck[k++ % deck.length] : null);
    deal.size = deck.length;
    return deal;
  }

  const rams = createNavalRams({
    ships: () => sea.values(), get: (id) => sea.get(id), myBoats, myId, now: () => clock, seaY: () => deps.seaY(), random,
    boatPose, hullBox, state: myBoatState, boarding: () => boarding, called: (e) => calledName(e),
    fair: (e) => hostileToMe(e) || !NAVAL_FACTIONS[e.ship.cls.faction]?.lawful,
    strike: (e, hurt, by) => strike(e, hurt, by), sendHit: (d) => deps.sendHit?.(d),
    charge: (e) => { chargePlayer('fire', e); e.myBlowAt = clock; },
    hit: (at, dir) => effects.hit(at, dir, true), sound: (k, at, v) => sound(k, at, v), shake: (k) => deps.shake?.(k), mid: (x, sec) => deps.mid?.(x, sec),
  });

  function frame(dt, { paused = false, outdoors = true, brace = false } = {}) {
    if (!enabled) return;
    if (!outdoors) { if (sea.size || shots.inFlight) clear(); return; }
    const total = paused ? 0 : Math.min(seaSeconds(dt, timeScale(), sharedSea(deps.online?.peers?.(), deps.feet(), NAVAL_SHARE_RADIUS)), FRAME_STEP_S * FRAME_STEPS_MAX);
    if (!paused) realClock += Math.max(0, dt) / timeScale();
    const seaY = deps.seaY();
    const boat = myBoat();
    const st = boat ? myBoatState(boat) : null;
    whereNow = null;
    const day = where().day ?? null;
    if (day != null) { if (lastDecayDay != null && day > lastDecayDay) notoriety.decay(day - lastDecayDay); lastDecayDay = day; }
    if (!total) return;
    braceHeld = !!brace;
    if (boat) { const v = boatPose(boat).velocity; deps.captain?.sailed?.(Math.hypot(v[0], v[2]) * Math.min(Math.max(0, dt), FRAME_STEP_S * FRAME_STEPS_MAX)); }
    for (let left = total; left > 1e-9;) {
      const h = Math.min(left, FRAME_STEP_S);
      stepSea(h, seaY, boat);
      left -= h;
    }
    const refused = sailRefused();
    if (refused && csa()?.state?.sailPosition > 0) { csa().LowerSails?.(); deps.say?.(refused, 2.5); }
    if (deps.online && clock - lastSweep >= OWNER_SWEEP_S) { lastSweep = clock; sweepOwners(new Set((deps.online.peers?.() ?? []).map((p) => p.id))); }
    tendClaims();
    shedFarHulls(deps.look?.()?.origin ?? deps.feet());
    buildOne();
    const eye = deps.look?.()?.origin ?? deps.feet();
    for (const e of [...sea.values()]) fadeStep(e, total);
    shipDecks.hold(sea.values());
    for (const e of sea.values()) poseShip(e, total, seaY, eye);
    shipDecks.frame(sea.values(), deps.deck, dt > 0 ? total / dt : 1);
    knowStep();
    siteStep(boat);
    if (clock - lastHailCheck >= SAIL_HO_CHECK_S) { lastHailCheck = clock; hailSails(boat); }
    rams.helm(boat);
    poseMyFires(total);
    feel.frame(total, (en) => (sea.get(en.id) === en && en.ship.damage.state === SHIP_STATES.sinking ? [en.ship.pos[0], seaY + 1.5, en.ship.pos[2]] : null));
    // The aim reads the hulls as this frame poses them, so it runs after poseShip.
    aim = null; aimHit = null;
    if (aiming && boat) {
      const side = lookSide(boat);
      if (side) { aim = lookAim(boat, side); aimHit = aimStrikes(aim); }
      if ((side === 'starboard' || side === 'port') && myBoatState(boat).guns.ready(side)) galleonGuns.lay(boat, side, clock);
    } else if (!boat) aiming = false;
    const decks = [...myBoats()];
    for (const e of sea.values()) {
      if (!e.boat) continue;
      decks.push(e.boat);
      for (const side of e.ship.runOut?.keys?.() ?? []) if (side === 'starboard' || side === 'port') galleonGuns.lay(e.boat, side, clock);
    }
    for (const p of deps.peerBoats?.() ?? []) {
      if (!p.boat) continue;
      decks.push(p.boat);
      const self = peerSelf.get(p.id);
      if (self?.laid?.length && realClock - self.real <= PEER_LAY_S) for (const side of self.laid) if (side === 'starboard' || side === 'port') galleonGuns.lay(p.boat, side, clock);
    }
    galleonGuns.step(decks, clock);
    wireVolleys = wireVolleys.filter((v) => clock - v.at <= NAVAL_VOLLEY_KEEP_MS / 1000);
    wireBarrels = wireBarrels.filter((v) => clock - v.at <= NAVAL_VOLLEY_KEEP_MS / 1000);
    for (let i = flashes.length - 1; i >= 0; i--) if (clock - flashes[i].t > MUZZLE_FLASH_S) flashes.splice(i, 1);
  }

  let readyBoat = null;
  const loadedWas = new Map();
  const readyAt = new Map();
  const loadedNow = (st, bat) => st.guns.left(bat.side) <= 0 && (bat.gun !== 'barrel' || st.guns.barrels > 0);
  function heardReady(boat) {
    if (boat !== readyBoat) { readyBoat = boat; loadedWas.clear(); readyAt.clear(); }
    if (!boat) return;
    const st = myBoatState(boat);
    const pose = boatPose(boat);
    for (const bat of batteriesOf(boat.hull)) {
      const now = loadedNow(st, bat);
      if (loadedWas.get(bat.side) === false && now) {
        readyAt.set(bat.side, clock);
        const m = bat.muzzles;
        const mid = m.reduce((a, p) => [a[0] + p[0] / m.length, a[1] + p[1] / m.length, a[2] + p[2] / m.length], [0, 0, 0]);
        sound(NAVAL_SFX.ready, toWorld(pose, mid), 0.8);
      }
      loadedWas.set(bat.side, now);
    }
  }

  function knownHarbours() {
    const out = [];
    for (const h of harbours.values()) if (h.harbour) out.push({ key: h.key, harbour: h.harbour, free: (i) => berthFree(h.key, i) });
    return out;
  }
  function berthFree(key, i, except = null) {
    for (const e of sea.values()) { const r = e.ship.errand; if (e.ship !== except && r && r.harbour === key && r.berth === i && (r.kind === 'moored' || r.kind === 'arrive')) return false; }
    const b = harbours.get(key)?.harbour?.berths[i];
    if (b) for (const e of sea.values()) if (e.ship !== except && e.ship.damage.state !== SHIP_STATES.sunk && (e.ship.speed ?? 0) < BERTH_WAY && Math.hypot(b.pos[0] - e.ship.pos[0], b.pos[1] - e.ship.pos[2]) <= BERTH_SNAP_M) return false;
    if (warping?.k === `${key}#${i}`) return false;
    return !(b && boatAtBerth(b, null));
  }
  function boatAtBerth(b, except) {
    for (const m of berthBoats()) {
      if (m === except || Math.hypot(m.GameObject.position[0] - b.pos[0], m.GameObject.position[2] - b.pos[1]) > BERTH_SNAP_M) continue;
      const v = boatPose(m).velocity;
      if (Math.hypot(v[0], v[2]) < BERTH_WAY) return true;
    }
    for (const m of deps.pool?.peerBoats ?? []) if (m !== except && m.GameObject && Math.hypot(m.GameObject.position[0] - b.pos[0], m.GameObject.position[2] - b.pos[1]) <= BERTH_SNAP_M) return true;
    return false;
  }
  function berthOf(ship) {
    if ((ship.speed ?? 0) >= BERTH_WAY) return null;
    for (const h of harbours.values()) if (h.harbour?.berths.some((b) => Math.hypot(b.pos[0] - ship.pos[0], b.pos[1] - ship.pos[2]) <= BERTH_SNAP_M)) return h;
    return null;
  }
  const atBerth = (ship) => !!berthOf(ship);
  function freeBerth(hull = HULL.Carrack) {
    const f = deps.feet?.();
    if (!f || DOCK_REFUSED.includes(hull)) return null;
    let best = null, bestD = Infinity;
    for (const h of harbours.values()) {
      const berths = h.harbour?.berths ?? [];
      for (let i = 0; i < berths.length; i++) {
        const b = berths[i];
        if (!berthFree(h.key, i) || myBoats().some((m) => Math.hypot(m.GameObject.position[0] - b.pos[0], m.GameObject.position[2] - b.pos[1]) <= BERTH_SNAP_M)) continue;
        const d = Math.hypot(b.pos[0] - f[0], b.pos[1] - f[2]);
        if (d < bestD) { const at = alongside(b, hull, h.harbour.hull); bestD = d; best = { position: [at[0], deps.seaY(), at[1]], direction: forwardOfYaw(b.yaw), harbour: h.name ?? null }; }
      }
    }
    return best;
  }
  function harbourList() { return harbours.list(); }
  function dockFree(key, i, boat) {
    const b = harbours.get(key)?.harbour?.berths[i];
    if (!b) return false;
    for (const e of sea.values()) {
      const r = e.ship.errand;
      if (r && r.harbour === key && r.berth === i && r.kind === 'moored') return false;
      if (e.ship.damage.state !== SHIP_STATES.sunk && (e.ship.speed ?? 0) < BERTH_WAY && Math.hypot(b.pos[0] - e.ship.pos[0], b.pos[1] - e.ship.pos[2]) <= BERTH_SNAP_M) return false;
    }
    return !boatAtBerth(b, boat);
  }
  function dockBerths(boat, taken = true) {
    const out = [];
    for (const h of harbours.values()) {
      const bs = h.harbour?.berths;
      if (!bs) continue;
      for (let i = 0; i < bs.length; i++) out.push({ key: h.key, index: i, berth: bs[i], hull: h.harbour.hull, name: h.name ?? null, free: !taken || dockFree(h.key, i, boat) });
    }
    return out;
  }
  const portWords = (name) => (name ? `${name}'s quay` : 'the quay');
  function dockOf(boat) {
    if (!boat?.GameObject) return null;
    const p = boat.GameObject.position, yaw = yawOfRot(boat.GameObject.rotation);
    const d = dockFor({ pos: p, yaw, hull: boat.hull }, dockBerths(boat, false));
    if (!d || !madeFast({ pos: p, yaw }, d)) return null;
    return { ...d, berth: harbours.get(d.key)?.harbour?.berths[d.index] ?? null, harbourHull: harbours.get(d.key)?.harbour?.hull };
  }
  const dockedAt = (boat) => { const d = dockOf(boat); return d ? d.name ?? '' : null; };
  function putOff(key, i) {
    const bs = harbours.get(key)?.harbour?.berths ?? [];
    for (const e of sea.values()) {
      const r = e.ship.errand;
      if (r?.kind !== 'arrive' || r.harbour !== key || r.berth !== i) continue;
      const other = bs.findIndex((_, j) => j !== i && berthFree(key, j));
      e.ship.errand = other >= 0 ? { kind: 'arrive', harbour: key, berth: other, path: null, i: 0 } : null;
    }
  }
  let warping = null;
  function warp(boat, { struck = false, oars = false, dt = 0 } = {}) {
    const held = enabled && boat ? deps.serpent?.hold?.(boat) ?? null : null;
    if (held) { warping = null; return { pos: held.pos, rotation: quatOfYaw(held.yaw) }; }
    const towed = enabled && boat ? quay.step(boat, dt) : null;
    if (towed) { warping = null; return { pos: towed.pos, rotation: quatOfYaw(towed.yaw) }; }
    const pose = boat ? boatPose(boat) : null;
    if (!enabled || !pose || !struck || oars || boarding || Math.hypot(pose.velocity[0], pose.velocity[2]) > DOCK_WAY || hostileNearMe()) { warping = null; return null; }
    const yaw = yawOfRot(pose.rotation);
    const dock = dockFor({ pos: pose.position, yaw, hull: boat.hull }, dockBerths(boat));
    if (!dock) { warping = null; return null; }
    const k = `${dock.key}#${dock.index}`;
    if (warping?.k !== k) {
      warping = { k, fast: madeFast({ pos: pose.position, yaw }, dock) };
      putOff(dock.key, dock.index);
      if (!warping.fast) deps.say?.(`Your crew brings the ship in alongside ${portWords(dock.name)}.`, 3);
    } else if (!warping.fast && madeFast({ pos: pose.position, yaw }, dock)) {
      warping.fast = true;
      deps.say?.(`Moored at ${portWords(dock.name)}.`, 3);
    }
    const step = warpStep([pose.position[0], pose.position[2]], yaw, dock, dt);
    return { pos: step.pos, rotation: quatOfYaw(step.yaw) };
  }
  function gangwayOf(boat) {
    const d = dockOf(boat);
    if (!d?.berth || !boat.MeshObject) return null;
    if (deps.quayLaid && !deps.quayLaid(d.key, d.index)) return null;
    const deck = deps.pool?.deckOf?.(boat.hull, boat.variant ?? 0);
    const side = quaySide(yawOfRot(boat.GameObject.rotation), landwardOf(d.berth));
    const m = boat.MeshObject.worldMatrix();
    const [sx, sy] = gangwaySide(boat.hull);
    const head = outOfDeck(m, [side * sx, sy, 0]);
    const rail = deck?.count ? deck.rail(side, 0, [0, 0, 0], mainLevel(deck)) : null;
    const deckAt = rail ? outOfDeck(m, rail) : head;
    const frame = quayFrame(d.berth, d.harbourHull), seaY = deps.seaY();
    const x0 = frame.halfWidth + QUAY_GAP, x1 = x0 + QUAY_WIDTH;
    const [hx, hz] = sceneToQuay(frame, head[0], head[2]);
    const f = gangwayFoot(hx, head[1] - seaY, x0, x1);
    const [fx, fz] = quayToScene(frame, f.x, hz);
    const [ax, az] = quayToScene(frame, f.x > x0 ? Math.min(f.x + 0.6, x1 - 0.4) : x0 + 1.6, hz);
    return { boat, name: deps.shipName?.(boat) || null, port: d.name ?? null, foot: [fx, seaY + f.y, fz], head, deckAt, ashore: [ax, seaY + QUAY_DECK_UP, az], landward: landwardOf(d.berth) };
  }
  function gangways() {
    const out = [];
    for (const b of myBoats()) { const g = gangwayOf(b); if (g) out.push(g); }
    return out;
  }
  function gangwayInReach(looking = true) {
    if (myBoat() || boarding) return null;
    const feet = deps.feet?.();
    if (!feet) return null;
    const look = looking ? deps.look?.() : null;
    const lf = look ? flatUnit(look.dir) : null;
    const facing = (dir) => !lf || lf[0] * dir[0] + lf[2] * dir[1] >= GANGWAY_FACING;
    for (const g of gangways()) {
      if (standsOn(g.boat, feet)) {
        if (Math.hypot(g.deckAt[0] - feet[0], g.deckAt[2] - feet[2]) <= GANGWAY_ASHORE && facing(g.landward)) return { ...g, way: 'ashore' };
      } else if (Math.hypot(g.foot[0] - feet[0], g.foot[2] - feet[2]) <= GANGWAY_REACH && Math.abs(feet[1] - g.foot[1]) <= 2 && facing([-g.landward[0], -g.landward[1]])) return { ...g, way: 'aboard' };
    }
    return null;
  }
  function takeGangway(g) {
    if (g.way === 'aboard') {
      const at = deps.board?.landing?.(g.boat, g.foot) ?? null;
      const spot = at ?? [g.deckAt, Math.atan2(-g.landward[0], -g.landward[1])];
      deps.board?.placePlayer?.(spot[0], spot[1]);
      deps.say?.(`You go aboard${g.name ? ` the ${g.name}` : ''}.`, 2);
    } else {
      deps.board?.placePlayer?.([...g.ashore], Math.atan2(g.landward[0], g.landward[1]));
      deps.say?.(`You step ashore at ${portWords(g.port)}.`, 2);
    }
    return true;
  }
  let gangwaySaid = null;
  function gangwayHint() {
    const g = gangwayInReach(false);
    const k = g ? `${g.way}:${g.boat.uid ?? ''}` : null;
    if (k && k !== gangwaySaid) deps.say?.(g.way === 'aboard' ? `The gangway${g.name ? ` to the ${g.name}` : ''}. Activate to go aboard.` : 'The gangway. Activate to step ashore.', 3);
    gangwaySaid = k;
  }
  const { passageShip, passageHint, charter, charterSailed, goneSeed, goneSaid, hearGone } = createPassageBerths({ sea, harbours, enabled: () => enabled, boarding: () => boarding, myBoat, csa, stanceOf, drop, adopt, retire, departedOf, day: () => where().day ?? 0, hullBox }, deps);
  const fishers = createFishingFleet({ sea, harbours, launch, retire, adopt, grid: gridOf, isWater: (x, z, hull) => deps.isWater(x, z, hull), where, rolls: rollsHarbour,
    feet: () => deps.feet(), seaStates: SHIP_STATES, reach: { stand: HARBOUR_STAND, leave: HARBOUR_LEAVE } });
  const holdOf = (cls, seed, generate) => (cls.fisher ? fishers.catchOf(cls, seed) : drawHold(cls, seed, generate));
  const quay = createPassageQuay({ harbours, isWater: (x, z, hull) => deps.isWater(x, z, hull), dockFree, putOff, boatPose, enabled: () => enabled, yawOf: yawOfRot,
    ahead: (p, dx, dz, far) => seaHulls.ahead(p, dx, dz, far), now: () => clock });
  let dockPortsAt = -Infinity;
  function dockPorts() {
    if (!deps.dockedPort || clock - dockPortsAt < 1) return;
    dockPortsAt = clock;
    for (const b of myBoats()) {
      const at = dockedAt(b);
      if (at != null) { deps.dockedPort(b, at); continue; }
      const p = b.GameObject.position, v = boatPose(b).velocity;
      const known = [...harbours.values()].some((h) => h.harbour && Math.hypot(h.harbour.mouth[0] - p[0], h.harbour.mouth[1] - p[2]) <= HARBOUR_STAND);
      if (known || Math.hypot(v[0], v[2]) > DOCK_WAY) deps.dockedPort(b, null);
    }
  }
  function gridOf(hull) {
    let g = grids.get(hull);
    if (!g) { g = createWaterGrid({ isWater: (x, z, h) => deps.isWater(x, z, h), hull }); grids.set(hull, g); }
    return g;
  }
  const life = { harbour: (k) => harbours.get(k)?.harbour ?? null, grid: gridOf, free: berthFree, harbours: knownHarbours };
  function errandHere(ship) {
    if (ship.cls.fisher) return fishers.errandOf(ship);
    const hs = knownHarbours();
    return hs.length ? errandFor({ seed: ship.seed, faction: ship.cls.faction, hull: ship.hull, pos: ship.pos, speed: ship.speed, clock: ship.clock, harbours: hs, clear: gridOf(ship.hull).clear }) : null;
  }
  function harbourFrame(seaY) {
    if (ownBook) harbours.step(clock);
    const feet = deps.feet();
    const day = where().day ?? 0;
    for (const h of harbours.values()) {
      if (!h.harbour) continue;
      const departed = departedOf(h.key, day);
      const d = Math.hypot(h.harbour.mouth[0] - feet[0], h.harbour.mouth[1] - feet[2]);
      if (d > HARBOUR_LEAVE) {
        if (rolled.has(h.harbour)) for (const e of [...sea.values()]) if (!e.owner && e.fromHarbour === h.key && e.ship.errand?.kind === 'moored') retire(e);
        rolled.delete(h.harbour);
        continue;
      }
      if (d > HARBOUR_STAND || !rollsHarbour(h.harbour.mouth)) continue;
      const r = mulberry32(hash32(keyHash(h.key), day >>> 0, HARBOUR_SALT));
      const n = Math.min(h.harbour.berths.length, HARBOUR_ROLL[0] + Math.floor(r() * (HARBOUR_ROLL[1] - HARBOUR_ROLL[0] + 1)));
      const seedOf = (i) => hash32(keyHash(h.key), day >>> 0, i, HARBOUR_SALT);
      if (rolled.has(h.harbour)) {
        const own = new Set(Array.from({ length: n }, (_, i) => seedOf(i)));
        for (const e of [...sea.values()]) if (e.owner && e.retiring && own.has(e.ship.seed) && !goneSeed(e.ship.seed) && e.ship.damage.state === SHIP_STATES.afloat) { adopt(e); e.retiring = false; }
        continue;
      }
      rolled.add(h.harbour);
      for (let i = 0; i < n; i++) {
        const seed = seedOf(i);
        const navy = r() < HARBOUR_NAVY;
        const faction = navy && !where().ether ? 'navy' : 'merchant';
        let cls = classFor(faction, HARBOUR_LEVEL, r());
        if (cls?.hull === HULL.LargeGalley) cls = classFor(faction, 1, r());
        const back = [...sea.values()].find((x) => !x.owner && x.retiring && x.ship.seed === seed && x.fromHarbour === h.key);
        if (back) { back.retiring = false; continue; }
        if (!cls || departed.has(seed) || goneSeed(seed) || [...sea.values()].some((x) => x.ship.seed === seed && x.ship.damage.state !== SHIP_STATES.sunk) || !berthFree(h.key, i)) continue;
        const b = h.harbour.berths[i], at = alongside(b, cls.hull, h.harbour.hull);
        const e = launch({ seed, classId: cls.id, variant: 0, pos: [at[0], seaY, at[1]], yaw: b.yaw, errand: { kind: 'moored', harbour: h.key, berth: i, until: dwellOf(errandRng(seed)), path: null, i: 0 } });
        if (e) { e.fromHarbour = h.key; e.ship.sails = 0; e.ship.sailsWant = 0; }
      }
    }
  }

  function keepWatch(e, d, world, eye, fought) {
    const s = e.ship;
    const owed = e.watchDt ?? 0;
    if (owed > 0 && owed + d > FRAME_STEP_S) { e.watchDt = d; return stepCaptain(s, { ...world, dt: owed }); }
    if (!watchesFar(e, eye, fought)) { e.watchDt = 0; return stepCaptain(s, owed > 0 ? { ...world, dt: owed + d } : world); }
    e.watchDt = owed + d;
    e.watchN = ((e.watchN ?? e.n) + 1) % FAR_LIFE_EVERY;
    if (e.watchN !== 0) return NO_WATCH;
    e.watchDt = 0;
    return stepCaptain(s, { ...world, dt: owed + d });
  }

  function stepSea(d, seaY, boat) {
    clock += d;
    mending = false;
    const inPlay = boatInPlay();
    for (const b of myBoats()) {
      const s = myBoatState(b);
      s.guns.step(d);
      s.guns.braced = b === boat && braceHeld;
      s.damage.step(d, clock);
      const hostile = hostileNearBoat(b, s);
      crewStep(b, s, d, hostile);
      s.repairing = false;
      const quiet = clock - s.damage.lastHitAt >= FIELD_QUIET_S && !hostile;
      if (quiet) {
        const m = fieldMend(s.damage, d, { crewed: !!b.crewed, crewShare: s.damage.crewShare(), scale: b.crewed ? mendScaleOf(s.crew.morale) * (s.worth?.mend ?? 1) : 1 });
        if (m.hull > 0 || m.sail > 0) {
          s.damage.repair({ hull: m.hull, sail: m.sail, crew: 0 }, { refloat: FIELD_REFLOAT });
          if (b === boat) mending = true;
        }
      }
      if (s.crew.order === CREW_ORDERS.repair) { if (quiet || hostile) repairStep(b, s, d, { underFire: hostile, inPlay }); }
      else if (quiet && autoRepair() && ((b.crewed && s.damage.crew > 0) || b === inPlay)) repairStep(b, s, d, { auto: true, inPlay });
    }
    heardReady(boat);
    harbourFrame(seaY);
    fishers.frame(seaY);
    dockPorts(); gangwayHint(); passageHint();

    const onWater = !!boat || deps.isWater(deps.feet()[0], deps.feet()[2], 0);
    if (onWater) {
      const w = where();
      const crown = crownOf(w.px ?? 0, w.py ?? 0, w.capitals ?? null, w.region ?? -1);
      const feet = deps.feet();
      const players = [feet, ...(deps.online?.peers?.() ?? []).map((p) => p.feet)];
      const ships = [];
      for (const e of sea.values()) {
        const afloat = e.ship.damage.state === SHIP_STATES.afloat;
        // A ship fights only afloat: two ships struck to each other would otherwise hold each other forever.
        if (!e.owner) ships.push({ id: e.id, pos: e.ship.pos, classId: e.ship.cls.id, engaged: (afloat && (e.ship.mode === 'engage' || e.ship.mode === 'board')) || boarding?.shipId === e.id || !!e.raider || !!e.liner || !!e.takenBy || !!e.ship.lashed || (!!e.fromHarbour && e.ship.errand?.kind === 'moored'), afloat, berthed: e.ship.errand?.kind === 'moored' });
        else if (e.orphan == null && dist2d(e.ship.pos, feet) <= DESPAWN_BEYOND) ships.push({ id: e.id, pos: e.ship.pos, classId: e.ship.cls.id, theirs: true, afloat, berthed: atBerth(e.ship) });
      }
      directorShips(ships, (id) => sea.get(id));
      const relieving = [...sea.values()].some((e) => e.relief && !e.owner && e.ship.damage.state === SHIP_STATES.afloat);
      const distress = relieving || w.ether ? null : distressAt(crown.name);
      const out = director.step(d, {
        density: launchesTraffic() ? trafficDensity(feet) : 0, player: feet, players, level: deps.level?.() ?? 1, seaY, ships,
        isOpenWater: (x, z, hull) => deps.isWater(x, z, hull), nearPort: !!w.nearPort, deep: w.waters === 'deep', notoriety: Math.max(notoriety.get(crown.name), ...[...peerSelf.values()].map((p) => p.law?.[crown.name] ?? 0)),
        seedBase: seedBaseOf(w.px ?? 0, w.py ?? 0, w.day ?? 0, SEED_SALT ^ idSalt(myId())), real: realClock,
        distress, relieving,
        reliefSure: !!distress && !!deps.captain?.reliefSure?.(crown.name),
        ether: etherCtx(w),
        legends: [...sea.values()].filter((e) => e.legend && e.ship.damage.state !== SHIP_STATES.sunk).map((e) => e.legend),
      });
      for (const id of out.despawn) { const e = sea.get(id); if (e) retire(e); }
      if (out.spawn) {
        const e = launch(out.spawn);
        if (e && !out.spawn.hunter && !out.spawn.encounter && !out.spawn.relief) e.ship.errand = errandHere(e.ship);
        if (e && out.spawn.relief && distress) { e.relief = true; e.ship.course = [distress[0], distress[2]]; }
        if (out.spawn.company) launch(out.spawn.company);
      }
    } else director.reset();

    const night = !!where().night;
    const world = {
      now: clock, dt: d, seaY, wind: wind(), isWater: (x, z, hull = HULL.SmallShip) => deps.isWater(x, z, hull), contacts: contacts(),
      notoriety: (c) => notoriety.get(c), random, boarders: setting('Boarders', true) !== false, gunfire,
      life,
      night,
    };
    life.night = night;
    life.lights = !!where().cityLights;
    const watchEye = deps.look?.()?.origin ?? deps.feet();
    let fought = null;
    for (const e of [...sea.values()]) {
      if (e.owner) continue;
      const s = e.ship;
      if (s.damage.state === SHIP_STATES.sunk) { quarryGone(e); drop(e); continue; }
      const was = s.damage.state;
      if (boarding?.shipId === e.id) { const change = s.damage.step(d, clock); if (change) stateChanged(e, was, change, e.fireBy ?? null); continue; }
      const out = keepWatch(e, d, world, watchEye, () => (fought ??= foughtIds()));
      if (e.fromHarbour && s.errand?.kind !== 'moored') { departedOf(e.fromHarbour, where().day ?? 0).add(s.seed); e.fromHarbour = null; }
      if (e.legend && !night && !e.retiring && s.damage.state === SHIP_STATES.afloat && s.mode !== 'engage' && s.mode !== 'board' && legendOfClass(s.cls.id)?.trait === 'night') retire(e);
      if (e.relief && s.course && ((s.mode !== 'cruise' && s.mode !== 'answer') || dist2d(s.pos, [s.course[0], 0, s.course[1]]) <= RELIEF_REACHED_M)) s.course = null;
      if (!e.aidSaid && s.cls.faction === 'navy' && s.mode === 'engage' && sea.get(s.target)?.ship.target === myId()) { e.aidSaid = true; deps.say?.(`${calledName(e)} comes to your aid!`, 4); }
      const change = s.damage.step(d, clock);
      if (change) stateChanged(e, was, change, e.fireBy ?? null);
      if (e.legend) legendMend(e, d);
      for (const side of out.runOuts) runOutTell(e, side);
      const pose = { position: s.pos, rotation: quatOfYaw(s.yaw), velocity: velocityOf(s), hull: s.hull };
      for (const v of out.volleys) { fire({ shooter: e.id, wireShooter: e.n, hull: s.hull, pose, solution: v.solution, skill: s.cls.skill }); noteInbound(e, v.side); }
      for (const bsol of out.barrels) fire({ shooter: e.id, wireShooter: e.n, hull: s.hull, pose, solution: bsol, skill: s.cls.skill });
      if (out.grapple && !boarding && boat && out.grapple === myId() && setting('Boarders', true) !== false) startBoarding('repel', e, boat);
      else if (out.grapple && out.grapple !== myId() && peerSelf.has(out.grapple) && clock - e.grappleAt >= GRAPPLE_CLAIM_S) {
        e.grappleAt = clock;
        deps.sendHit?.(navalHitData(out.grapple, { n: e.n, grapple: true }));
      } else if (out.grapple && out.grapple !== myId() && sea.has(out.grapple) && !s.lashed) lashPrize(e, sea.get(out.grapple));
    }
    stepPrizes();
    rams.galleys();
    separateHulls();
    for (const e of sea.values()) {
      if (e.owner || !e.raider || e.raider.spent) continue;
      if (chasesMe(e)) e.raider.chased = true;
      const slipped = e.raider.chased && e.ship.mode === 'cruise';
      if (slipped || e.ship.boarded || boarding?.shipId === e.id || e.ship.damage.state !== SHIP_STATES.afloat) spendRaider(e, slipped);
    }
    for (const e of sea.values()) if (e.liner && e.ship.damage.state !== SHIP_STATES.afloat) spendLiner(e);
    for (const e of [...sea.values()]) {
      if (!e.owner || e.ship.damage.state !== SHIP_STATES.sinking) continue;
      if (e.ship.damage.sinkOn(d) && e.lost) drop(e);
    }
    for (const e of sea.values()) {
      if (!e.owner || !e.target || boarding?.shipId === e.id) continue;
      const tgt = e.target;
      const ahead = e.orphan == null && e.ship.damage.state === SHIP_STATES.afloat ? (tgt.speed ?? 0) * Math.min(PREDICT_MAX_S, clock - (tgt.at ?? clock)) : 0;
      const at = [tgt.pos[0] + Math.sin(tgt.yaw) * ahead, tgt.pos[1], tgt.pos[2] + Math.cos(tgt.yaw) * ahead];
      if (dist2d(e.ship.pos, at) > PUPPET_SNAP_M) { e.ship.pos = at; e.ship.yaw = tgt.yaw; continue; }
      const k = 1 - Math.exp(-PUPPET_EASE * d);
      e.ship.yaw = wrapAngle(e.ship.yaw + wrapAngle(tgt.yaw - e.ship.yaw) * k);
      if (e.orphan != null || e.ship.damage.state !== SHIP_STATES.afloat || !((tgt.speed ?? 0) > 0)) {
        e.ship.pos = [e.ship.pos[0] + (at[0] - e.ship.pos[0]) * k, at[1], e.ship.pos[2] + (at[2] - e.ship.pos[2]) * k];
        continue;
      }
      const v = clock - (tgt.at ?? clock) < PREDICT_MAX_S ? tgt.speed : 0;
      let x = e.ship.pos[0] + Math.sin(e.ship.yaw) * v * d, z = e.ship.pos[2] + Math.cos(e.ship.yaw) * v * d;
      const ex = at[0] - x, ez = at[2] - z, off = Math.hypot(ex, ez);
      if (off > 1e-9) {
        const take = Math.min(off * (1 - Math.exp(-PUPPET_CATCH * d)), (PUPPET_CATCH_MPS + PUPPET_CATCH_SHARE * v) * d) / off;
        x += ex * take; z += ez * take;
      }
      e.ship.pos = [x, at[1], z];
    }
    stepBoarding(d);
    for (const e of sea.values()) glintRunOut(e, d, seaY);
    shots.step(d);
    effects.step(d);
  }

  const chasesMe = (e) => (e.ship.mode === 'engage' || e.ship.mode === 'board') && e.ship.target === myId();

  function separateHulls() {
    const list = [];
    for (const e of sea.values()) {
      if (boarding?.shipId === e.id || e.ship.damage.state === SHIP_STATES.sunk) continue;
      list.push({ ship: e.ship, movable: !e.owner, pos: e.ship.pos, yaw: e.ship.yaw, hull: e.ship.hull });
    }
    for (const b of myBoats()) list.push({ ship: null, movable: false, pos: b.GameObject.position, yaw: yawOfRot(b.GameObject.rotation), hull: b.hull });
    if (list.length < 2) return;
    // Pairs farther apart than twice their reaches are skipped: some axis always separates them.
    const flatOf = (x) => (x.flat ??= flatHull(x.pos, x.yaw, x.hull));
    const shove = (x, v) => {
      x.flat = null;
      x.ship.pos[0] += v[0]; x.ship.pos[2] += v[1];
      const l = Math.hypot(v[0], v[1]) || 1, f = forwardOfYaw(x.ship.yaw);
      const into = -(f[0] * v[0] + f[2] * v[1]) / l;
      if (into > 0) x.ship.speed *= clamp(1 - into, 0, 1);
    };
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (!A.movable && !B.movable) continue;
        const a = flatOf(A), b = flatOf(B), reach = 2 * (a.hl + a.hw + b.hl + b.hw), dx = b.c[0] - a.c[0], dz = b.c[1] - a.c[1];
        if (dx * dx + dz * dz > reach * reach) continue;
        const push = hullOverlap(a, b);
        if (!push) continue;
        if (A.movable && B.movable) { shove(A, [push[0] / 2, push[1] / 2]); shove(B, [-push[0] / 2, -push[1] / 2]); }
        else if (A.movable) shove(A, push);
        else shove(B, [-push[0], -push[1]]);
      }
    }
  }
  function word(toWire) {
    const ships = [...sea.values()].filter((e) => !e.owner).map((e) => ({
      n: e.n, classId: e.ship.cls.id, variant: e.ship.variant, pos: e.ship.pos, yaw: e.ship.yaw, speed: e.ship.speed, sails: e.ship.sails,
      hull: e.ship.damage.hullShare(), sail: e.ship.damage.sailShare(), crew: e.ship.damage.crewShare(),
      // Only a struck ship is said 'boarded'; a sound ship being boarded stays afloat and her captain's mode says it.
      state: e.ship.boarded && e.ship.damage.state === SHIP_STATES.struck ? 'boarded' : e.ship.damage.state, heel: e.ship.heel, seed: e.ship.seed, fire: e.ship.damage.fire > 0,
      runOut: [...e.ship.runOut.keys()].reduce((m, side) => m | (1 << SIDES.indexOf(side)), 0),
      gen: e.gen, region: e.region,
      temper: e.ship.temper, mode: e.ship.boarded ? 'boarded' : e.ship.mode, struckTo: e.struck && !sea.get(e.struck.by)?.owner ? sea.get(e.struck.by)?.n ?? -1 : -1,
      deep: e.deep,
    }));
    const b = boatInPlay(), st = b ? myBoatState(b) : null;
    const me = st ? { hull: st.damage.hullShare(), crippled: st.damage.state === SHIP_STATES.wrecked, boarders: setting('Boarders', true) !== false,
      crew: st.damage.crew, battle: aiming || crewAlarm(), boatHull: b.hull } : null;
    const volleys = wireVolleys.map((v) => ({ ...v, age: (clock - v.at) * 1000 }));
    const casks = shots.floaters().filter((f) => f.kind === 'flotsam' && !f.owner).map((f) => ({ id: Number(f.id), pos: f.pos, from: f.from, lot: f.lot, deep: !!f.deep }));
    const laid = b ? Object.entries(galleonGuns.read(b, clock) ?? {}).filter(([, side]) => side.laid).map(([side]) => side) : [];
    return navalWireRecord({ ships, volleys, barrels: wireBarrels, me, law: notoriety.snapshot(), traffic: setting('ShipsAtSea', TRAFFIC_DEFAULT), casks, spent: spentSaid, gone: goneSaid(), laid }, toWire);
  }
  function applyWord(owner, raw, toScene = (p) => p) {
    if (!enabled || typeof owner !== 'string' || owner === myId()) return false;
    const rec = raw == null ? null : validNavalRecord(raw);
    if (!rec) {
      if (raw != null) return false;
      applyCasks(owner, [], toScene);
      dropOwner(owner);
      return true;
    }
    hearGone(rec.gone);
    const keep = new Set();
    for (const w of rec.ships) {
      if (goneSeed(w.seed)) continue;
      const id = `${owner}:${w.n}`;
      let e = sea.get(id);
      if (e && (e.ship.seed !== w.seed || e.ship.cls.id !== w.classId)) { drop(e); e = null; }
      if (!e) {
        const twin = bySeed(w.seed, w.classId, id);
        if (twin) {
          if (!claimBeats(w.gen, owner, twin.gen, twin.owner ?? myId())) continue;
          e = yieldTo(twin, owner, w.n, w.gen);
        }
      }
      if (!e) {
        const lg = legendOfClass(w.classId);
        const rival = lg ? [...sea.values()].find((x) => !x.owner && x.legend === lg.id && !x.retiring && x.ship.damage.state !== SHIP_STATES.sunk) : null;
        if (rival) { if (!claimBeats(w.gen, owner, rival.gen, myId())) continue; retire(rival); }
      }
      keep.add(id);
      const pos = toScene(w.pos);
      const fresh = !e; if (!e) e = launch({ seed: w.seed, classId: w.classId, variant: w.variant, pos: [pos[0], deps.seaY(), pos[2]], yaw: w.yaw, gen: w.gen, region: w.region, deep: w.deep }, owner, w.n);
      if (!e) continue;
      e.retiring = false;
      e.gen = w.gen;
      e.deep = !!w.deep;
      e.seen = clock;
      e.lost = false;
      e.orphan = null;
      e.target = { pos: [pos[0], deps.seaY(), pos[2]], yaw: w.yaw, speed: w.speed, at: clock };
      e.ship.speed = w.speed; e.ship.sails = w.sails; e.ship.heel = w.heel;
      const dmg = e.ship.damage;
      const was = dmg.state;
      dmg.restore({ hull: dmg.maxHull * w.hull100 / 100, sail: dmg.maxSail * w.sail100 / 100, crew: dmg.maxCrew * w.crew100 / 100, fire: w.fire ? 5 : 0, state: w.state === 'boarded' ? SHIP_STATES.struck : w.state });
      const down = (st) => st === SHIP_STATES.sinking || st === SHIP_STATES.sunk;
      if (!down(was) && down(dmg.state) && clock - (e.myBlowAt ?? -Infinity) <= SINK_CREDIT_S) chargePlayer('sink', e);
      if (was === SHIP_STATES.afloat && dmg.state === SHIP_STATES.struck && clock - (e.myBlowAt ?? -Infinity) <= SINK_CREDIT_S) struckToMe();
      // A copy first seen already sinking never sounds her going down or blows her magazine again.
      if (!fresh && was !== SHIP_STATES.sinking && dmg.state === SHIP_STATES.sinking) { sound(NAVAL_CLASSIC.bubbles, e.ship.pos, 1); feel.sinking(e, w.seed, w.fire); }
      // A word from an older build carries no captain; she keeps the temper of her seed and cruises as a puppet.
      const cap = rec.captains.get(w.n);
      e.ship.boarded = (w.state === 'boarded' || cap?.mode === 'boarded') && boarding?.shipId !== id;
      if (w.fire) igniteShip(e);
      if (cap) { e.ship.temper = cap.temper; e.ship.mode = cap.mode; e.struckTo = cap.struckTo; }
      SIDES.forEach((side, i) => {
        const on = (w.runOut & (1 << i)) !== 0;
        if (on && !e.ship.runOut.has(side)) { e.ship.runOut.set(side, clock); runOutTell(e, side); }
        else if (!on) e.ship.runOut.delete(side);
      });
    }
    for (const e of [...sea.values()]) if (e.owner === owner && !keep.has(e.id) && boarding?.shipId !== e.id) letGo(e);
    let seen = seenVolleys.get(owner);
    if (!seen) { seen = new Set(); seenVolleys.set(owner, seen); }
    const flown = (flownAt.get(owner) ?? []).filter((t) => clock - t <= NAVAL_VOLLEY_KEEP_MS / 1000);
    flownAt.set(owner, flown);
    for (const v of rec.volleys) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      if (flown.length >= PEER_VOLLEYS_MAX) continue;
      flown.push(clock);
      fireFromWord(owner, v, toScene);
      const from = v.shooter >= 0 ? sea.get(`${owner}:${v.shooter}`) : null;
      if (from) noteInbound(from, v.side);
    }
    for (const b of rec.barrels) {
      const key = `b${b.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      shots.dropBarrel({ id: `${owner}:${b.id}`, shooter: b.shooter >= 0 ? `${owner}:${b.shooter}` : `peer:${owner}`, pos: toScene(b.pos), resolve: false, owner });
    }
    peerSelf.set(owner, { law: rec.law, me: rec.me, traffic: rec.traffic, at: clock, real: realClock, boat: rec.boat, laid: rec.laid });
    applyCasks(owner, rec.casks, toScene);
    for (const sd of rec.spent ?? []) noteSpent(sd);
    if (seen.size > 512) { const keepIds = [...seen].slice(-256); seen.clear(); for (const k of keepIds) seen.add(k); }
    return true;
  }
  function dropOwner(owner) {
    releaseOwner(owner);
  }
  // A sinking ship finishes going down on my clock first: her owner drops her the moment she is under.
  function letGo(e) {
    if (e.ship.damage.state === SHIP_STATES.sinking) e.lost = true;
    else if (e.ship.damage.state === SHIP_STATES.afloat) retire(e);
    else drop(e);
  }
  function clearPeers() {
    for (const e of [...sea.values()]) if (e.owner) drop(e);
    for (const f of shots.floaters()) if (f.owner) shots.removeFloater(f.id);
    seenVolleys.clear();
    peerSelf.clear();
    flownAt.clear();
    claims.clear();
  }
  function sweepOwners(alive, staleS = OWNER_STALE_S) {
    const casks = shots.floaters().filter((f) => f.kind === 'flotsam' && f.owner);
    const owners = new Set([...[...sea.values()].map((e) => e.owner), ...casks.map((f) => f.owner)].filter(Boolean));
    for (const o of owners) {
      const ships = [...sea.values()].filter((e) => e.owner === o && e.orphan == null);
      const afloat = casks.some((f) => f.owner === o && shots.floater(f.id)?.orphanAt == null);
      if (!ships.length && !afloat) continue;
      const last = Math.max(peerSelf.get(o)?.at ?? -Infinity, ...ships.map((e) => e.seen));
      if (!alive?.has?.(o) || clock - last > staleS) releaseOwner(o);
    }
    for (const e of [...sea.values()]) if (e.owner && e.orphan != null && clock - e.orphan >= ORPHAN_S) letGo(e);
    for (const f of casks) { const at = shots.floater(f.id)?.orphanAt; if (at != null && clock - at >= ORPHAN_S) shots.removeFloater(f.id); }
  }
  function applyPeerHit(from, data) {
    const hit = validNavalHit(data);
    if (!hit) return false;
    if (hit.cask != null) return hit.answer ? caskAnswered(from, hit.cask) : caskClaimed(from, hit.cask);
    if (hit.grapple) {
      const e = sea.get(`${from}:${hit.n}`);
      const boat = myBoat();
      if (!e || boarding || !boat || setting('Boarders', true) === false || e.ship.cls.faction !== 'pirate' || e.ship.damage.state !== SHIP_STATES.afloat) return false;
      startBoarding('repel', e, boat);
      return true;
    }
    const entry = ownByN(hit.n);
    if (!entry) return false;
    const hurt = { hull: hit.hull, sail: hit.sail, crew: ballMen(hit.crew, random()), fire: hit.fire };
    if (hit.ram && !rams.peer(entry, hurt)) return true;
    strike(entry, hurt, from, true, strayOnAlly(entry, hurt, from));
    return true;
  }

  function mastTop(e) {
    if (e.mastTop != null) return e.mastTop;
    const build = hullBuild(e.ship.hull);
    const reach = Math.max(build.top, ...build.rig.map(([, mx]) => mx[1]));
    if (!e.boat) return reach;
    const sp = sparsFor(e);
    let top = -Infinity;
    for (const p of sp?.points ?? []) if (p[1] > top) top = p[1];
    e.mastTop = Number.isFinite(top) ? sp.lift + top : reach;
    return e.mastTop;
  }
  function stanceOf(s, me = meContact(), law = { notoriety: (c) => notoriety.get(c), now: clock }) {
    const afloat = s.damage.state === SHIP_STATES.afloat;
    const isHostile = afloat && hostile(s, me, law);
    return { hostile: isHostile, friendly: afloat && !isHostile && !!NAVAL_FACTIONS[s.cls.faction]?.lawful };
  }
  function boundOf(e) {
    const s = e.ship;
    if (s.damage.state !== SHIP_STATES.afloat) return '';
    if (s.mode === 'answer') return e.relief ? 'coming to your aid' : '';
    if (s.mode !== 'cruise') return '';
    const r = s.errand;
    const port = (k) => (k != null ? harbours.get(k)?.name ?? null : null);
    const lying = e.owner ? berthOf(s) : null;
    if (lying) return lying.name ? `moored at ${lying.name}` : 'moored';
    if (r?.kind === 'moored') return port(r.harbour) ? `moored at ${port(r.harbour)}` : 'moored';
    if (r?.kind === 'depart' && port(r.harbour)) return `leaving ${port(r.harbour)}`;
    if (r?.kind === 'patrol') return port(r.harbour) ? `patrolling off ${port(r.harbour)}` : 'on patrol';
    if (r && (r.kind === 'arrive' || r.kind === 'voyage') && port(r.harbour)) return `bound for ${port(r.harbour)}`;
    if (e.liner) {
      const at = e.liner.dest;
      if (!at?.name) return '';
      const leg = e.liner.way;
      const end = leg?.[leg.length - 1];
      return r?.kind === 'lurk' || (end && Math.hypot(s.pos[0] - end[0], s.pos[2] - end[1]) <= LINER_PORT_M) ? `lying off ${at.name}` : `bound for ${at.name}`;
    }
    if (e.relief) return 'coming to your aid';
    if (r?.kind === 'voyage') return 'bound out to sea';
    return '';
  }
  function tagsModel() {
    if (!enabled) return [];
    const eye = deps.look?.()?.origin ?? deps.feet();
    const near = [];
    for (const e of sea.values()) {
      if (!e.boat || e.ship.damage.state === SHIP_STATES.sunk || knownOf(e) < KNOW.colours) continue;
      const d = dist2d(e.ship.pos, eye);
      if (d <= NAVAL_TAG_RANGE && d >= NAVAL_TAG_NEAR) near.push({ e, d });
    }
    near.sort((a, b) => a.d - b.d);
    const me = meContact(), law = { notoriety: (c) => notoriety.get(c), now: clock };
    return near.slice(0, NAVAL_TAG_MAX).map(({ e, d }) => {
      const s = e.ship;
      const root = e.boat.GameObject.position;
      const stance = stanceOf(s, me, law);
      const hid = disguisedOf(e);
      return {
        id: e.id, name: shownName(e), faction: hid ? 'merchant' : s.cls.faction,
        hostile: !hid && stance.hostile, friendly: hid || stance.friendly, line: shownLine(e), bound: hid ? '' : boundOf(e), hull: s.damage.hullShare(), state: s.damage.state,
        boarded: !!s.boarded, target: e.id === lastCardId, distance: Math.round(d), point: [root[0], root[1] + mastTop(e) + TAG_LIFT, root[2]],
        fade: e.fade ?? 1,
      };
    });
  }
  function hailSails(boat) {
    if (!aboardShip()) return;
    const from = boat ? boatPose(boat).position : deps.feet();
    const me = meContact(), law = { notoriety: (c) => notoriety.get(c), now: clock };
    const night = !!where().night;
    const deckSt = boatInPlay() ? myBoatState(boatInPlay()) : null;
    const sight = deckSt?.worth?.sight ?? 1;
    let best = null, bestD = Infinity;
    for (const e of sea.values()) {
      const s = e.ship;
      if (s.damage.state !== SHIP_STATES.afloat || s.boarded || !hostile(s, me, law)) { e.hailed = false; continue; }
      if (disguisedOf(e)) continue;
      const d = dist2d(s.pos, from);
      if (e.hailed || d > nightSight(SAIL_HO_RANGE * sight, { night, lit: showsLight(e) }) * veilOf(e)) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best || clock - lastHail < SAIL_HO_GAP_S) return;
    best.hailed = true;
    lastHail = clock;
    const s = best.ship;
    const bears = boat ? ` ${bearingWords(bearingOf([s.pos[0] - from[0], 0, s.pos[2] - from[2]], boat.GameObject.rotation))}` : '';
    const cry = `Sail ho! ${knownOf(best) >= KNOW.colours ? withArticle(classLine(s.cls, s.names?.crown)) : withArticle(hullWord(s.hull))}${bears}!`;
    deps.say?.(cry, 3);
    const deck = boatInPlay();
    if (deck?.crewed) hailCalls.set(deck, `Sail ho!${bears ? ` ${bears.charAt(1).toUpperCase()}${bears.slice(2)}!` : ''}`);
  }

  function hudModel() {
    if (!enabled) return null;
    const boat = myBoat();
    const w = where();
    const crown = crownOf(w.px ?? 0, w.py ?? 0, w.capitals ?? null, w.region ?? -1);
    const notorietyWord = { crown: crown.name, value: notoriety.get(crown.name), level: notorietyLevel(notoriety.get(crown.name)) };
    if (!boat) {
      if (boarding) return { ship: null, armed: false, batteries: [], aim: null, aiming: false, target: null, board: null, boarding: fightOf(boarding), notoriety: notorietyWord };
      const e = prizeInReach(null) ?? boardableOnFoot();
      if (!e) return null;
      const card = targetCardOf(e, deps.feet());
      return {
        ship: null, armed: false, batteries: [], aim: null, aiming: false,
        target: card,
        board: { name: card.name, kind: e.prize ? 'hold' : 'board' },
        boarding: null, notoriety: notorietyWord,
      };
    }
    const st = myBoatState(boat);
    const look = lookSide(boat);
    const batteries = SIDES.map((side) => {
      const b = batteryOf(boat.hull, side);
      if (!b) return null;
      const fresh = readyAt.has(side) && clock - readyAt.get(side) <= READY_FLASH_S;
      return { side, gun: b.gun, guns: b.muzzles.length, progress: st.guns.progress(side), ready: st.guns.ready(side), loaded: loadedNow(st, b), fresh, active: side === look, barrels: b.gun === 'barrel' ? st.guns.barrels : null, shot: st.guns.load(side), left: +st.guns.left(side).toFixed(1) };
    }).filter(Boolean);
    const target = targetCard(boat);
    lastCardId = target?.id ?? null;
    const state = aim ? aimState(st, aim.side, boat) : null;
    const hot = !!aimHit && state === 'ready';
    const nb = boarding ? null : boardable(boat);
    const pr = nb || boarding ? null : prizeInReach(boat);
    const yard = !nb && !pr && !boarding && yardHere(boat);
    return {
      waters: w.waters ?? null,
      ether: w.ether ? { bandName: w.ether.bandName, depth: w.ether.depth, veil: !!w.ether.veil } : null,
      ship: { id: boat.uid ?? null, name: HULL_NAMES[boat.hull], blow: feel.blow(), hull: st.damage.hullShare(), sail: st.damage.maxSail > 0 ? st.damage.sailShare() : null, crew: st.damage.maxCrew > 0 ? st.damage.crewShare() : null, fire: st.damage.fire > 0, wrecked: st.damage.state === SHIP_STATES.wrecked, braced: st.guns.braced, repair: repairCost(st.damage), mending,
        spirits: boat.crewed ? spiritsOf(st.crew.morale).label : null, order: boat.crewed && st.crew.order !== CREW_ORDERS.stand ? ORDER_TEXT[st.crew.order].label : null, repairing: !!st.repairing, repairOrdered: st.crew.order === CREW_ORDERS.repair, stores: deps.stores?.count?.(boat) ?? 0 },
      armed: batteries.length > 0,
      batteries,
      aim: aim ? { side: aim.side, gun: aim.gun, shot: aim.shot ?? null, range: Math.round(aim.range), max: Math.round(aim.maxRange), hot, barrel: aim.barrel, state, left: state === 'reloading' ? +st.guns.left(aim.side).toFixed(1) : 0 } : null,
      aiming,
      target,
      board: nb ? { name: nb.ship.names?.name ?? 'the ship', kind: 'board' } : pr ? { name: pr.ship.names?.name ?? 'the ship', kind: 'hold' }
        : yard ? { name: 'the shipwright', kind: 'yard' } : null,
      boarding: boarding ? fightOf(boarding) : null,
      notoriety: notorietyWord,
      incoming: st.damage.state === SHIP_STATES.wrecked ? null : incoming(boat),
      tally: tallies.shown(clock, TALLY_S),
    };
  }
  function fightOf(b) {
    const s = sea.get(b.shipId)?.ship;
    const down = (f) => !!deps.board?.foeDown?.(f.handle);
    return {
      kind: b.kind, phase: b.phase, name: s?.names?.name ?? 'the ship', captain: b.kind === 'board' ? (s?.names?.captain ?? null) : null,
      captainDown: b.foes.some((f) => f.captain && down(f)), down: b.foes.filter(down).length, total: b.foes.length,
      yieldAt: Math.ceil(b.foes.length * SURRENDER_SHARE), raid: !!b.quest,
    };
  }
  function targetCard(boat) {
    if (aimHit?.ship?.boat && sea.has(aimHit.ship.id)) return knownOf(aimHit.ship) >= KNOW.colours ? targetCardOf(aimHit.ship, boatPose(boat).position) : null;
    const look = deps.look?.();
    if (!look) return null;
    const lf = flatUnit(look.dir) ?? [0, 0, 1];
    let best = null, bestA = Infinity;
    for (const e of sea.values()) {
      if (!e.boat || e.ship.damage.state === SHIP_STATES.sunk || knownOf(e) < KNOW.colours) continue;
      const p = e.ship.pos;
      const to = [p[0] - look.origin[0], 0, p[2] - look.origin[2]];
      const dist = Math.hypot(to[0], to[2]);
      if (dist > 900) continue;
      const cos = (to[0] * lf[0] + to[2] * lf[2]) / (dist || 1);
      const halfWidth = Math.atan2(hullBuild(e.ship.hull).beam * 3 + 8, dist);
      const a = Math.acos(clamp(cos, -1, 1));
      if (a > Math.max(6 * NAVAL_DEG, halfWidth)) continue;
      if (a < bestA) { bestA = a; best = e; }
    }
    return best ? targetCardOf(best, boatPose(boat).position) : null;
  }
  function targetCardOf(e, from) {
    const s = e.ship;
    const known = knownOf(e), hid = disguisedOf(e), made = known >= KNOW.colours;
    const stance = !made ? { hostile: false, friendly: false } : hid ? { hostile: false, friendly: true } : stanceOf(s);
    return {
      id: e.id, name: shownName(e), captain: known >= KNOW.studied ? s.names?.captain ?? null : null, classLine: shownLine(e), faction: !made ? 'unknown' : hid ? 'merchant' : s.cls.faction,
      hull: made ? s.damage.hullShare() : null, sail: made && s.damage.maxSail > 0 ? s.damage.sailShare() : null, state: s.damage.state, boarded: !!s.boarded,
      crew: made && s.damage.maxCrew > 0 ? s.damage.crewShare() : null,
      distance: Math.round(dist2d(s.pos, from)),
      ...stance, bound: known < KNOW.colours || hid ? '' : boundOf(e),
    };
  }

  function drawFrame() {
    let aimDraw = null;
    if (aim && !aim.barrel) {
      const hits = aimHit?.hits ?? [];
      const arcs = aim.launches.map((l, i) => (hits[i] ? arcTo(l, hits[i].t) : arcPoints(l.p0, l.v0, deps.seaY(), 18)));
      const zone = aim.landings.map((l, i) => (l && !hits[i] ? l.point : null)).filter(Boolean);
      const strikes = hits.filter(Boolean).map((h) => h.point);
      const boat = myBoat();
      const ready = !!boat && aimState(myBoatState(boat), aim.side, boat) === 'ready';
      aimDraw = { arcs, zone, strikes, hot: ready && strikes.length > 0, radius: Math.max(1.6, aim.width / 2), ready, posts: true };
    } else if (aim?.barrel) {
      const boat = myBoat();
      aimDraw = { arcs: aim.muzzles.map((m, i) => fallArc(m, aim.landings[i].point, 8)), zone: aim.landings.map((l) => l.point), hot: false, radius: 2, ready: !!boat && aimState(myBoatState(boat), aim.side, boat) === 'ready', posts: true };
    }
    const particles = effects.drawList();
    lampsInto(particles);
    return { particles, balls: shots.balls(), floaters: shots.floaters().map((f) => (isSalvage(f.lot) ? { ...f, wreck: true } : f)), aim: aimDraw, time: clock };
  }
  const lampStreaks = createLampStreaks();
  /** @param {any[]} out */
  function lampsInto(out) {
    if (!where().cityLights) return;
    const eye = deps.look?.()?.origin ?? deps.feet();
    lampStreaks.begin(eye, deps.seaY(), clock);
    const boats = [];
    for (const e of sea.values()) if (e.boat?.LightOn && (e.fade ?? 1) >= FADE_FLATS) boats.push(e.boat);
    for (const b of myBoats()) if (b.LightOn) boats.push(b);
    for (const p of deps.peerBoats?.() ?? []) if (p.boat?.LightOn) boats.push(p.boat);
    for (const b of boats) {
      const lit = (b.Lights ?? []).filter((l) => l.node?.activeInHierarchy !== false);
      for (const l of lampPoints(lit)) {
        const p = l.node.position, d = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
        if (d <= STREAK_NEAR_M) continue;
        if (d > LAMP_NEAR_M) out.push({ pos: p, size: lampSize(d), color: [LAMP_COLOR[0], LAMP_COLOR[1], LAMP_COLOR[2], lampAlpha(d)], rot: 0, blend: 'add', flat: false, solid: false, kind: 'lamp', aspect: 1 });
        lampStreaks.into(out, p, d);
      }
    }
  }
  function lights() {
    const out = flashes.map((f) => ({ x: f.pos[0], y: f.pos[1], z: f.pos[2], range: MUZZLE_FLASH_RANGE * (1 - (clock - f.t) / MUZZLE_FLASH_S), color: MUZZLE_FLASH_COLOR, carried: true }));
    const feet = deps.feet();
    for (const b of myFires.keys()) {
      const p = b.GameObject.position;
      if (out.length - flashes.length >= BURN_LIGHTS) break;
      out.push({ x: p[0], y: p[1] + hullBuild(b.hull).deck + 2, z: p[2], range: BURN_RANGE * (0.85 + 0.15 * Math.sin(clock * 9)), color: BURN_COLOR, carried: true });
    }
    const burning = [...sea.values()].filter((e) => e.fires?.length && e.boat && (e.fade ?? 1) >= FADE_FLATS).sort((a, b) => dist2d(a.ship.pos, feet) - dist2d(b.ship.pos, feet)).slice(0, Math.max(0, BURN_LIGHTS - myFires.size));
    for (const e of burning) {
      const p = e.ship.pos;
      out.push({ x: p[0], y: deps.seaY() + hullBuild(e.ship.hull).deck + 2, z: p[2], range: BURN_RANGE * (0.85 + 0.15 * Math.sin(clock * 9 + e.phase)), color: BURN_COLOR, carried: true });
    }
    return out;
  }

  function offsetAll(o) {
    const shift = (system) => { if (system?.particleCount > 0) system.setParticles(system.getParticles().map((q) => ({ ...q, position: [q.position[0] + o[0], q.position[1] + o[1], q.position[2] + o[2]] }))); };
    for (const e of sea.values()) {
      e.ship.pos[0] += o[0]; e.ship.pos[1] += o[1]; e.ship.pos[2] += o[2];
      if (e.target) { e.target.pos[0] += o[0]; e.target.pos[2] += o[2]; }
      if (e.ship.waypoint) { e.ship.waypoint[0] += o[0]; e.ship.waypoint[1] += o[2]; }
      if (e.ship.course) e.ship.course = [e.ship.course[0] + o[0], e.ship.course[1] + o[2]];
      if (e.liner?.leg) e.liner.leg = e.liner.leg.map((q) => [q[0] + o[0], q[1] + o[2]]);
      if (e.liner?.way) e.liner.way = e.liner.way.map((q) => [q[0] + o[0], q[1] + o[2]]);
      offsetErrand(e.ship.errand, o);
      const b = e.boat;
      if (b) { const p = b.GameObject.position; b.GameObject.position = [p[0] + o[0], p[1] + o[1], p[2] + o[2]]; shift(b.WakeEmitter); }
    }
    for (const f of flashes) { f.pos[0] += o[0]; f.pos[1] += o[1]; f.pos[2] += o[2]; }
    for (const w of [...wireVolleys, ...wireBarrels]) { w.pos[0] += o[0]; w.pos[1] += o[1]; w.pos[2] += o[2]; }
    for (const c of claims.values()) { c.point[0] += o[0]; c.point[1] += o[1]; c.point[2] += o[2]; }
    for (const g of gunfire) { g.pos[0] += o[0]; g.pos[1] += o[1]; g.pos[2] += o[2]; }
    if (boarding) boarding.offset(o);
    shots.offsetAll(o);
    effects.offsetAll(o);
    if (ownBook) harbours.offsetAll(o);
    quay.offset(o);
    grids = new Map();
  }
  function clear() {
    for (const e of [...sea.values()]) drop(e);
    shots.clear();
    effects.clear(); feel.clear();
    wireVolleys = []; wireBarrels = [];
    gunfire = [];
    if (ownBook) harbours.clear();
    rolled = new WeakSet(); grids = new Map();
    fishers.clear(); quay.forget();
    warping = null; gangwaySaid = null;
    claims.clear(); granted.clear();
    myCasks.clear();
    stolenCasks.clear();
    seenVolleys.clear();
    hailCalls.clear();
    flashes.length = 0;
    aiming = false; aim = null; aimHit = null;
    rams.clear();
    for (const [b, f] of [...myFires]) douseMine(b, f);
    galleonGuns.clear();
    if (boarding) {
      const quest = boarding.quest;
      for (const f of boarding.foes) deps.board?.removeFoe?.(f.handle);
      endBoarding();
      if (quest) { raidUids.delete(quest.uid); deps.board?.endRaid?.(quest, { withdraw: true }); }
    }
    director.reset();
  }

  function handsByUid(uid) {
    const st = boatState.get(uid);
    if (st) return st.crew.hands;
    const rec = pendingBoats.get(uid);
    return rec ? (Array.isArray(rec.mates?.hands) ? rec.mates.hands : []) : null;
  }
  const handLives = (uid, name) => !!handsByUid(uid)?.some((h) => h?.name === name);
  function stowPack(uid, items, name) {
    if (!items?.length) return;
    const boat = packStaysAshore() ? null : (csa()?.state?.AllBoats ?? []).find((b) => b?.uid === uid) ?? null;
    const rest = boat ? deps.board?.giveItems?.(items, boat)?.left ?? [] : items;
    const mine = rest.length ? deps.board?.giveItems?.(rest, null, { force: true }) ?? null : null;
    const where = !rest.length ? 'in the hold' : rest.length === items.length ? 'in your pack' : 'in the hold and your pack';
    deps.say?.(`${name ?? 'Your companion'}'s pack is stowed ${where}${mine?.over ? ' (more than you can carry)' : ''}.`, 3);
  }
  function companionPress(boat, name, now) {
    const st = myBoatState(boat);
    if (!st || !boat?.uid) return null;
    const hand = st.crew.hands.find((h) => h.name === name);
    if (!hand) return null;
    if (companions.isAshore(boat.uid, name)) {
      if (heldAtSide(name, deps.say)) return null;
      const pack = companions.takePack(boat.uid, name);
      companions.sendBack(boat.uid, name);
      deps.say?.(`${name} goes back aboard.`, 3);
      stowPack(boat.uid, pack, name);
      return 'back';
    }
    const why = companions.why(boat.uid, hand, now, !!boat.crewed);
    if (why) { deps.say?.(`${name} cannot come ashore: ${why}.`, 3); return null; }
    if (!companions.take(boat.uid, hand, now)) return null;
    deps.say?.(`${name}, ${hand.role}, comes ashore with you.`, 3);
    return 'take';
  }

  const newSaveData = () => ({ v: NAVAL_SAVE_VERSION, boats: {}, notoriety: {}, day: null, raids: [], party: { party: [], resting: [] } });
  function getSaveData() {
    const boats = {};
    for (const [uid, rec] of pendingBoats) boats[uid] = rec;
    for (const [uid, st] of boatState) boats[uid] = { ...savedRecord(st.damage, st.hull, st.credit), ...gunsRecord(st) };
    return { v: NAVAL_SAVE_VERSION, boats, notoriety: notoriety.snapshot(), day: lastDecayDay, raids: [...raidUids], party: companions.snapshot() };
  }
  function restoreSaveData(r) {
    boatState.clear();
    pendingBoats.clear();
    notoriety.restore(r?.notoriety ?? null);
    lastDecayDay = Number.isFinite(r?.day) ? r.day : null;
    raidUids.clear();
    for (const uid of Array.isArray(r?.raids) ? r.raids : []) if (Number.isSafeInteger(uid)) raidUids.add(uid);
    for (const [uid, rec] of Object.entries(r?.boats ?? {})) {
      const key = Number(uid);
      if (!Number.isSafeInteger(key) || key <= 0 || !rec || typeof rec !== 'object') continue;
      pendingBoats.set(key, rec);
    }
    companions = createCompanions(r?.party ?? null, deps.packedItems ?? null);
    clear();
  }

  return {
    frame, attackInput, cancelAim, holdFire, activate, hudModel, drawFrame, lights, offsetAll, clear, stowPlunder, aimEye: aimCam.eye, hullAlong: seaHulls.along, wayScale, sailRefused, brake, postsWay,
    cycleShot: (dir = 1) => loads.cycle(dir), shotWheel: (dy) => loads.wheel(dy), shotLabel: () => (enabled ? loads.label(myBoat()) : null),
    notorietyOf: (crown) => notoriety.get(crown),
    glass,
    ownExtent,
    get glassUp() { return glassUp; },
    gunDeckOf: (boat) => galleonGuns.read(boat, clock),
    fleet: (list, o) => { if (enabled) treasureFleet.step(list, o); },
    stormStrike: (strike) => strikeShip(enabled && aboardShip() ? myBoatState(boatInPlay())?.damage : null, strike, clock),
    pvp,
    fleetStatus, repairAway, refitBoat, openYard, freeBerth, crewHands, assignRole,
    passageShip, charter, charterSailed,
    bringIn: quay.begin, berthing: quay.state,
    enlistHand, swapHand, releaseHand, forgetBoat, handsAshore,
    yardModelOf: (boat) => yardModel(boat),
    harbourList, warp, dockedAt, gangways,
    boatInPlay: () => boatInPlay(),
    word, applyWord, sweepOwners, applyPeerHit, dropOwner, clearPeers,
    peerBoat(owner) {
      const self = peerSelf.get(owner), said = self?.boat;
      return said ? { crewShare: Math.max(0, Math.min(1, said.crew / Math.max(1, hullBuild(said.hull).crew))), battle: said.battle, work: Math.min(1, Math.max(0, 1 - (self.me?.hull ?? 1))) } : null;
    },
    leaveShipGate, raidEnded, placeQuestFoe,
    newSaveData, getSaveData, restoreSaveData,
    get companions() { return companions; },
    companionRows(boat, now) {
      const st = myBoatState(boat);
      if (!st || !boat?.uid) return null;
      return companionRows({ boat: boat.uid, crewed: !!boat.crewed, hands: st.crew.hands, now, companions });
    },
    companionPress,
    companionKnocked(c) {
      const live = boatState.get(c.boat);
      if (live) live.crew.event('knocked');
      else {
        const rec = pendingBoats.get(c.boat);
        if (rec?.mates) { const crew = createShipCrew({ seed: c.boat >>> 0, record: rec.mates }); crew.event('knocked'); rec.mates = crew.snapshot(); }
      }
      deps.say?.(`${c.name} is knocked out. Your crew carries ${c.gender === 'female' ? 'her' : 'him'} back aboard to rest.`, 4);
      if (c.items?.length) stowPack(c.boat, c.items.splice(0), c.name);
    },
    pruneCompanions: () => {
      const gone = companions.prune(handLives);
      for (const c of gone) if (c.items?.length) stowPack(c.boat, c.items.splice(0), c.name);
      return gone;
    },
    companionPack(key) {
      const c = companions.party.find((p) => `${p.boat}:${p.name}` === key);
      return c ? { name: c.name, role: c.role, items: c.items } : null;
    },
    awayOf(boat) {
      // None away is an empty set, never null: the crew host reads null as no change and leaves the last hand ashore.
      const names = ashoreNames(boat);
      if (!names.size) return NO_HANDS_AWAY;
      const hands = myBoatState(boat)?.crew.hands ?? [];
      const out = new Set();
      hands.forEach((h, i) => { if (names.has(h.name)) out.add(i); });
      return out;
    },
    raiders, raiderShipOf, raiderHeld,
    liners,
    hostileNear: () => hostileNearMe(),
    battle: () => aiming || crewAlarm() || !!boarding,
    drift: (boat) => (enabled ? deps.serpent?.drift?.(boat) ?? null : null),
    gale: (boat) => (enabled ? deps.serpent?.gale?.(boat) ?? null : null),
    serpentBoat() {
      if (!enabled) return null;
      const boat = boatInPlay();
      const st = boat ? myBoatState(boat) : null;
      if (!st) return null;
      const pose = boatPose(boat), b = hullBuild(boat.hull), yaw = yawOfRot(pose.rotation), mid = (b.bowZ + b.aftZ) / 2;
      return {
        boat, hull: boat.hull, root: [pose.position[0], pose.position[2]], yaw,
        pos: [pose.position[0] + Math.sin(yaw) * mid, pose.position[1], pose.position[2] + Math.cos(yaw) * mid],
        hl: (b.bowZ - b.aftZ) / 2, hw: b.halfWidth, maxHull: st.damage.maxHull, maxSail: st.damage.maxSail, hullNow: st.damage.hull,
        atHelm: boat === myBoat(), wrecked: st.damage.state === SHIP_STATES.wrecked,
      };
    },
    serpentStrike(boat, hurt, { shake = 0, line = null } = {}) {
      const st = boat ? myBoatState(boat) : null;
      if (!enabled || !st || !hurt) return null;
      const k = st.guns.braced ? BRACE_TAKEN : 1;
      const men = playerMen(hurt.crew ?? 0, random());
      const change = st.damage.apply({ ...hurt, crew: men, ...(k < 1 ? { hull: Math.round((hurt.hull ?? 0) * k), sail: Math.round((hurt.sail ?? 0) * k) } : {}) }, clock);
      if (shake) deps.shake?.(shake);
      if (line) deps.say?.(line, 2.5);
      if (change === SHIP_STATES.wrecked) deps.mid?.('Your ship is crippled! The sails hang in rags.', 3);
      return change;
    },
    serpentFx(kind, pos, scale = 1) {
      if (!enabled || !pos) return;
      const jit = (r) => [pos[0] + (random() - 0.5) * r * scale, pos[1], pos[2] + (random() - 0.5) * r * scale];
      if (kind === 'breach') { for (let i = 0; i < 5; i++) effects.splash(jit(14), true); }
      else if (kind === 'lash') { for (let i = 0; i < 4; i++) effects.splash(jit(24), true); }
      else if (kind === 'wake' || kind === 'venom' || kind === 'roar') effects.splash(jit(4), kind === 'roar');
    },
    aboard: () => aboardShip(),
    takesActivate,
    saveRefused,
    threats,
    tags: tagsModel,
    compassShips() {
      if (!enabled) return null;
      const feet = deps.feet();
      const out = [];
      const me = meContact();
      for (const e of sea.values()) {
        const st = e.ship.damage.state;
        if (st === SHIP_STATES.sinking || st === SHIP_STATES.sunk || dist2d(e.ship.pos, feet) > COMPASS_SHIP_RANGE) continue;
        const kind = st !== SHIP_STATES.afloat ? 'struck'
          : knownOf(e) >= KNOW.colours && !disguisedOf(e) && hostile(e.ship, me, { notoriety: (c) => notoriety.get(c), now: clock }) ? 'hostile' : 'ship';
        out.push({ x: e.ship.pos[0], z: e.ship.pos[2], kind });
      }
      return out;
    },
    crewShips() {
      if (!enabled) return [];
      const out = [];
      const helm = myBoat();
      let feet = null;
      const abeam = (e, pos, yaw) => {
        const lie = (e.ship.pos[0] - pos[0]) * Math.cos(yaw) - (e.ship.pos[2] - pos[2]) * Math.sin(yaw) >= 0 ? 1 : -1;
        const s = (Math.cos(e.ship.yaw - yaw) >= 0 ? -lie : lie) * dist2d(e.ship.pos, pos);
        return [e.ship.pos[0] + Math.cos(e.ship.yaw) * s, e.ship.pos[1], e.ship.pos[2] - Math.sin(e.ship.yaw) * s];
      };
      for (const e of sea.values()) {
        const st = e.ship.damage.state;
        if (!e.boat || (st !== SHIP_STATES.afloat && st !== SHIP_STATES.struck && st !== SHIP_STATES.prize && st !== SHIP_STATES.sinking)) continue;
        const mine = boarding?.shipId === e.id;
        const hold = st === SHIP_STATES.prize || (mine ? boarding.phase === 'fight' && boarding.kind === 'board' : !!e.ship.boarded);
        const battle = st === SHIP_STATES.afloat && e.ship.mode !== 'cruise';
        let toward = null, way = null;
        if (st === SHIP_STATES.afloat && e.ship.mode === 'board' && !e.ship.boarded) {
          const t = e.ship.target, me = t === myId() ? boatInPlay() : null, other = me ? null : sea.get(t);
          const peer = me || other ? null : (deps.peerBoats?.() ?? []).find((p) => p.id === t);
          const [pos, yaw] = me ? [me.GameObject.position, yawOfRot(me.GameObject.rotation)] : other ? [other.ship.pos, other.ship.yaw] : [peer?.pos ?? null, peer?.yaw];
          if (pos) { toward = Number.isFinite(yaw) ? abeam(e, pos, yaw) : pos; way = 'board'; }
        } else if (boardableState(e.ship) && !boarding) {
          const from = helm ? helm.GameObject.position : (feet ??= deps.feet());
          if (helm ? boardingGap(helm, e) != null : footReach(e, from)) { toward = helm ? abeam(e, from, yawOfRot(helm.GameObject.rotation)) : from; way = 'repel'; }
        }
        out.push({ key: e.id, boat: e.boat, pos: e.ship.pos, shipClass: e.ship.cls, crewShare: e.ship.damage.crewShare(), seed: e.ship.seed, faction: e.ship.cls.faction, way, battle, struck: st !== SHIP_STATES.afloat, hold, toward, work: st === SHIP_STATES.afloat ? workOf(e.ship.damage) : 0 });
      }
      return out;
    },
    boatOf: (id) => sea.get(id)?.boat ?? null,
    deckWord: (feet) => shipDecks.word(feet),
    deckAhead: (key, dt) => shipDecks.ahead(sea.values(), key, dt),
    deckBoat: () => shipDecks.boat,
    myCrew(boat) {
      const st = myBoatState(boat);
      if (!st) return null;
      let toward = null, way = null;
      for (const e of sea.values()) {
        if (e.ship.damage.state === SHIP_STATES.afloat && e.ship.mode === 'board' && !e.ship.boarded && e.ship.target === myId()) {
          if (boat === boatInPlay()) { toward = e.ship.pos; break; }
        }
      }
      if (toward) way = 'repel';
      else if (!boarding && boat === myBoat()) { const e = boardable(boat); if (e) { toward = e.ship.pos; way = 'board'; } }
      const call = hailCalls.get(boat) ?? null;
      if (call) hailCalls.delete(boat);
      const work = boat.crewed && st.crew.order === CREW_ORDERS.repair ? 1 : workOf(st.damage);
      const lookout = st.crew.hands.findIndex((h) => h.role === LOOKOUT_ROLE);
      const roles = boat.crewed ? st.crew.hands.map((h) => h.role) : null;
      return { crew: st.damage.crew, way, battle: aiming || crewAlarm(), toward, order: boat.crewed ? st.crew.order : CREW_ORDERS.stand, sings: !boat.crewed || st.crew.sings(), line: () => (boat.crewed ? st.crew.line() : null), repairing: !!st.repairing, work, call, lookout, roles };
    },
    crewName: (boat, i) => (boat?.crewed ? myBoatState(boat)?.crew.nameOf(i) ?? null : null),
    giveOrder: (boat, order) => giveOrder(boat, order),
    crewOf(boat) {
      const st = myBoatState(boat);
      if (!st) return null;
      const c = st.crew;
      return {
        crewed: !!boat.crewed, morale: c.morale, spirits: spiritsOf(c.morale), order: c.order, hands: c.hands.map((h) => ({ ...h })),
        card: crewCard(c, { ship: `The ${HULL_NAMES[boat.hull]}`, order: c.order, ashore: ashoreNames(boat) }), nameOf: (i) => c.nameOf(i), stores: deps.stores?.count?.(boat) ?? 0,
      };
    },
    collidable() { const f = deps.feet(); return [...sea.values()].filter((e) => e.boat && dist2d(e.ship.pos, f) < COLLIDE_RANGE).map((e) => e.boat); },
    boats: () => [...sea.values()].map((e) => e.boat).filter(Boolean),
    seaFlags: () => seaFlagsOf(sea.values(), deps.feet(), seaWho),
    setEnabled(v) { if (enabled && !v) stowPlunder(); enabled = !!v; if (!enabled) clear(); },
    get enabled() { return enabled; },
    get aiming() { return aiming; },
    get atGuns() { return enabled && armed(myBoat()); },
    get boarding() { return boarding; },
    get notoriety() { return notoriety; },
    stat: () => ({ ships: [...sea.values()].map((e) => ({ id: e.id, cls: e.ship.cls.id, owner: e.owner, pos: e.ship.pos.map((v) => +v.toFixed(1)), mode: e.ship.mode, state: e.ship.damage.state, hull: +e.ship.damage.hullShare().toFixed(2), built: !!e.boat })), inFlight: shots.inFlight, particles: effects.count, standing }),
    spawnShip(classId, { range = 300, bearing = 0, yaw = null, temper = null } = {}) {
      const f = deps.feet();
      const pos = [f[0] + Math.sin(bearing) * range, deps.seaY(), f[2] + Math.cos(bearing) * range];
      const e = launch({ seed: u32(), classId, variant: 0, pos, yaw: yaw ?? bearing + Math.PI });
      if (e) e.ship.temper = Object.values(TEMPERS).includes(temper) ? temper : e.ship.cls.faction === 'pirate' ? TEMPERS.bold : e.ship.temper;
      if (e) e.plain = true;
      return e?.id ?? null;
    },
    _sea: sea, _shots: shots, _effects: effects, _contacts: contacts, _feel: feel,
    _myState: (boat) => myBoatState(boat),
    _charge: (act, id, o) => chargePlayer(act, sea.get(id), o),
    _glass: () => ({ up: glassUp, on: glassOn, held: glassHeld, zoom: glassZoom }),
    _sites: siteStood,
    get volleyWire() { return wireVolleys; },
    directorState: director,
    SIDE_DIR,
  };
}
