// @ts-check
import { ATTACK_BY_ID, ATTACKS, COURT_CENTRE, COURTS, COURT_R, HIT_KINDS, POOL_TICK_MS, PHASE_NAMES, profileOf, nearestCourt, windupOf, CRYSTAL_R, CRYSTAL_H, inCourt, POSE_SLACK, RECKON_CLOSE_MS, WALKS, walkFormed, HOST_BLOWS, hostBlowUnder, planOf, HOST, HOST_GONE, hostAt, wardTakes } from '../net/gateBrain.js';
import { strikeVerdict, blowOf, strikeDamage, savedShare, landingPools, poolUnder, inAttack, chargeHead, segmentDistance, wheelStrikes } from '../net/gateStrike.js';
import { GATE_BOSSES, gateBossOf, gateTimes, GATE_COLLAPSE_MS } from '../net/gateLaw.js';
import { COURT_WATCH_ASK_MS } from '../net/gateBrain.js';
import { bossAct, bossFrame, bossGlow, bossPlace, bossHop, bossLookOf, bossStandIn, bossCue, BOSS_CUES, BOSS_STRIDE_M, GROWL_EVERY_MS, HURT_GAP_MS, HURT_SHARE, QUAKE_ON, THUD_AT_MS, WARD_COLOR, EMBER_COLOR, poolColor, emberColor, attackColor, crystalStandIn, crystalColor, groundStepCue, hostPulseColor, gateHitFlash, GATE_FLASH_SHARE, RELEASE_LEAD_MS, landShake, LANDING_LIGHT_Y, CORPSE_SCALE, WAKE_LEAD_MS, LOW_HEALTH } from '../world/gateBoss.js';
import { courtToDungeon, portalDoor, PORTAL_AFTER_MS, PORTAL_RISE_MS, PORTAL_DROP, COURT_TEXT, WAY_IN_Z, WAY_IN_HOLD_MS, WAY_IN_NEAR_M, ARRIVE_Z, arrivalOf, planOfDay, COURT_SILENT_MS, COURT_FRAME_GAP_MS, COURT_DOOR_WAIT_MS, wayInStep, portalFade } from '../world/gateArena.js';
import { GateTelegraphRenderer, telegraphPrograms, telegraphShape, markShape, poolShapes, telegraphEdge, TELEGRAPH_STYLE, TELEGRAPH_EDGE, TELEGRAPH_NOW_MS } from '../render/gateTelegraph.js';
import { CourtCrystalRenderer, CRYSTAL_PROGRAMS, crystalGrowth, CRYSTAL_GROW_MS, CRYSTAL_SHATTER_MS, CRYSTAL_FLASH_MS, CRYSTALS_DRAW_MAX } from '../render/courtCrystals.js';
import { GateFxRenderer, GATE_FX_PROGRAMS, fxBurstOf, meteorFall, FX_BURST_MS, FX_BURSTS_MAX, FX_KINDS, FX_LIGHT_MS } from '../render/gateFx.js';
import { relight } from '../render/lightId.js';
import { setBatchHitFlash } from '../combat/hitFlash.js';
import { tierColour } from '../render/spoilsGlow.js';
import { RARITIES } from '../items/lootRarity.js';
import { GatePassRenderer, GATE_PASS_PROGRAMS, gateSpinRate } from '../render/gatePass.js';
import { compiledPass, parallelCompile } from '../render/glProgram.js';
import { gateArchProfile } from '../world/gateModel.js';
import { ONLINE_MINUTES_PER_MS, GATE_HEAL_ROWS_MAX, GATE_HEAL_WIRE_MAX } from '../net/wire.js';
import { spoilsLevel } from './spoilsPool.js';
import { bossBarModel, drawGateBossBar, BOSS_BAR_TEXT } from '../ui/gateBossBar.js';
import { titleCardModel, drawGateTitleCard, TITLE_HOLD_MS } from '../ui/gateTitleCard.js';
import { marksCardModel, drawGateMarksCard } from '../ui/gateMarksView.js';
import { groundViewModel, drawGateGround } from '../ui/gateGroundView.js';
import { createGateArsenal } from './gateArsenal.js';
import { vanguardLine } from './gateVanguard.js';
import { createGateFlame, flameOf, FLAME_I } from './gateFlame.js';
import { createGateCaptive } from './gateCaptive.js';
import { hasPortent } from '../net/gateMods.js';
import { titheList } from './gateSpoils.js';
import { TITHE_GOLD } from '../world/gateBoss.js';
import { cueTargetPlaces } from '../world/gateBoss.js';
import { t } from '../ui/textManager.js';
import { damageChartModel, drawGateDamageChart } from '../ui/gateDamageChart.js';
import { readReceipt } from '../net/gateReceipt.js';
import { bodySayer } from '../net/bossBody.js';
import { wordShare } from '../combat/healthShare.js';
import { createGateHost } from './gateHost.js';
import { createSpriteWarm } from './gateSpriteWarm.js';
import { EG_MIX, egDbGain } from '../systems/eliteGates/egMix.js';
import { setPeerSoundScope, peerSoundScope } from '../net/peerFx.js';
import { createPopulationLane } from '../characters/npcBodies.js'; import { creatureLook } from '../characters/creatureBodies.js'; import { rosterActor } from '../characters/rosterBodies.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { mobileBillboardSize, billboardSize } from '../world/rmbFlats.js';

export const COURT_STRIKE_TEXT = Object.freeze({
  resisted: (name) => `${name} resisted.`,
  noSpoils: () => 'No spoils. Your part in the fight was too small.',
  spilled: () => 'Your spoils spill across the floor.',
  spilledRite: () => 'Your ember from the broken rite falls to the floor.',
  burning: 'burning ground',
});
export const PHASE_NUMERALS = Object.freeze(['I', 'II', 'III']);
export const courtPhaseOrder = (n) => (n === 2 ? t('gate.phase.follow2', 'Follow him over the walkway.') : n === 3 ? t('gate.phase.follow3', 'Follow him to the last court.') : null);
export const COURT_TITHE_TEXT = Object.freeze({
  mine: (gold, gem) => t('gate.tithe.mine', 'You take its tithe of {gold, number} gold and {gem, select, Amber {an Amber} Emerald {an Emerald} other {a {gem}}}.', { gold, gem }),
});
export const SUNDER_CARD = Object.freeze({
  main: () => t('gate.card.sunder', 'The Sundering'),
  sub: () => t('gate.card.sunderSub', 'Bring both halves down together.'),
  back: () => t('gate.card.rejoinSub', 'Back to the first court.'),
});
export const courtPhaseCard = (n, pt = null) => {
  if (hasPortent(pt, 'sunder') && (n === 2 || n === 3)) return { kicker: PHASE_NUMERALS[n - 1], main: n === 2 ? SUNDER_CARD.main() : PHASE_NAMES[2], sub: n === 2 ? SUNDER_CARD.sub() : SUNDER_CARD.back() };
  const sub = courtPhaseOrder(n);
  return sub ? { kicker: PHASE_NUMERALS[n - 1], main: PHASE_NAMES[n - 1], sub } : null;
};
export const COURT_WRATH_TEXT = Object.freeze({ minute: "Dagon's Wrath in 1:00. Bring him down!", windup: "Dagon's Wrath!" });
export const WRATH_WARN_AT_MS = 60_000;
export const COURT_READ_WPS = 3.5;
export const COURT_READ_S = Object.freeze([1.5, 6]);
export const courtSaySeconds = (text) => Math.max(COURT_READ_S[0], Math.min(COURT_READ_S[1], String(text ?? '').split(/\s+/).filter(Boolean).length / COURT_READ_WPS));
export const ROAR_AFTER_MS = 600;
export const FALL_FLASH_MS = 400;
export const FALL_SHAKE = 4;
export const COLUMN_BURSTS = 3;
export const COLUMN_STEP_MS = 250;
export const FALL_CARD_MS = 3000;
export const WAKE_LATE_MS = 1000;
export const FALL_BURST_UP = 0.5;
export const FALL_FLASH_Y = 3;
export const FALL_FLASH_K = 4;
export const FALL_FLASH_RANGE = 40;
export const FALL_NEWS_MS = 1000;
export const SPUTTER_EVERY_MS = 500;
export const WRATH_LIGHT_Y = 6;
export const WRATH_LIGHT_RANGE = 60;
export const WHITE = Object.freeze([1, 0.96, 0.9]);
const WRATH_RED = Object.freeze([1, 0.08, 0.04]);
export const COURT_RECKON_TEXT = Object.freeze({
  call: (n) => `Dagon's Reckoning! Shatter all ${n} crystals!`,
  shattered: (who, left) => (left > 0 ? `${who || 'A challenger'} shatters a crystal. ${left} ${left === 1 ? 'remains' : 'remain'}.` : `${who || 'A challenger'} shatters the last crystal!`),
  broken: () => 'The Reckoning breaks! Strike now!',
});
export const RECKON_LATE_MS = 2000;
export const CRYSTAL_STRIKE_GROWN = 0.5;
export const CRYSTAL_LIGHT_RANGE = 9;
export const CRYSTAL_LIGHT_Y = 1.6;
export const COURT_MARKS_TEXT = Object.freeze({
  fed: (boss, names) => {
    const ns = (Array.isArray(names) ? names : [names]).filter(Boolean);
    if (ns.length <= 1) return `${boss} feeds on ${ns.length ? `${ns[0]}'s` : 'a fallen challenger\'s'} soul.`;
    return `${boss} feeds on the souls of ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}.`;
  },
});
// One game minute on the shared world clock, so a soul trap on the boss lasts as many rounds as on any other enemy.
export const COURT_ROUND_MS = Math.round(1 / ONLINE_MINUTES_PER_MS);
export const markColorOf = (ember) => Object.freeze(ember.map((c) => Math.min(1, c * 1.1)));
export const MARK_COLOR = markColorOf(EMBER_COLOR);
export const SPEW_RIM_M = 2;
export const SPOILS_BURST_COLOR = Object.freeze([1, 0.78, 0.28]);
export function spoilsKeep(x, z) {
  const C = COURTS[nearestCourt(x, z)], centre = courtToDungeon(C[0], 0, C[1]);
  return { centre, r: COURT_R - SPEW_RIM_M, floorY: centre[1] };
}
export const SPEW_AT_MS = 1700;
export const RECEIPT_WAIT_MS = 4000;
export const FALL_CRY_LATE_MS = 1500;
export const FED_LATE_MS = 2000;

// An attack is identified by its index and its landing time, because a room restored from a checkpoint reuses
// attack numbers.
const noMark = () => ({ i: -1, at: NaN });
const marked = (m, atk) => m.i === atk.i && m.at === atk.at;
const setMark = (m, atk) => { m.i = atk.i; m.at = atk.at; };
const NONE = Object.freeze([]);

export const bossOf = (s) => GATE_BOSSES.find((b) => b.id === s?.boss) ?? gateBossOf(s?.day ?? 0);

export const PERIL_BEARINGS = 24;
export const PERIL_STEP_M = 0.25;
export const PERIL_REACH_M = 20;
export const PERIL_RIM_M = 0.4;
export function wayOut(inside, fx, fz, court) {
  const C = COURTS[court] ?? COURTS[0], R = COURT_R - PERIL_RIM_M;
  let best = null;
  for (let b = 0; b < PERIL_BEARINGS; b++) {
    const a = (b / PERIL_BEARINGS) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    for (let m = PERIL_STEP_M; m <= PERIL_REACH_M && (!best || m < best.m); m += PERIL_STEP_M) {
      const x = fx + dx * m, z = fz + dz * m;
      if (Math.hypot(x - C[0], z - C[1]) > R) break;
      if (!inside(x, z)) { best = { dx, dz, m }; break; }
    }
  }
  return best ? { dir: [best.dx, best.dz], m: best.m } : null;
}
// Degrees from straight ahead, positive to the right, for a camera `yaw` whose forward is [sin, cos] and right is
// [cos, -sin].
export const screenBearing = (dir, yaw) => (Math.atan2(dir[0] * Math.cos(yaw) - dir[1] * Math.sin(yaw), dir[0] * Math.sin(yaw) + dir[1] * Math.cos(yaw)) * 180) / Math.PI;
export const WHEEL_PERIL_MS = 1000;
export function perilAt(s, t, P, fx, fz, yaw = null) {
  if (!s || s.day === null || s.fell || s.wrath != null || !Number.isFinite(fx) || !Number.isFinite(fz)) return null;
  let best = null, inside = null;
  const atk = s.atk, A = atk ? ATTACK_BY_ID[atk.a] : null;
  if (A && A.shape !== 'all' && Number.isFinite(atk.at)) {
    const w = windupOf(A, s.phase), run = A === ATTACKS.charge || A === ATTACKS.wheel ? Math.max(A.active, 1) : 0, end = atk.tg?.[0];
    if (t >= atk.at - w && t < atk.at + run) {
      const head = A === ATTACKS.charge && t >= atk.at ? chargeHead(atk, t) : null;
      const from = Math.max(t, atk.at), soon = (x, z) => wheelStrikes(atk, x, z, from + WHEEL_PERIL_MS, from, P);
      const on = A === ATTACKS.wheel ? soon(fx, fz) : head && end ? segmentDistance(fx, fz, head[0], head[1], end[0], end[1]) <= Math.max(ATTACKS.charge.width / 2, P.bossR) : inAttack(atk, fx, fz, P);
      if (on) { best = { at: A === ATTACKS.wheel ? from : atk.at, name: P.atk[A.key].name, t: w > 0 ? Math.max(0, Math.min(1, (t - (atk.at - w)) / w)) : 1, color: telegraphEdge(A) }; inside = A === ATTACKS.wheel ? soon : (x, z) => inAttack(atk, x, z, P); }
    }
  }
  for (const a of s.lg?.ads ?? NONE) {
    const B = HOST_BLOWS[a.k], h = a.atk;
    if (!B || !h || !Number.isFinite(h.at) || !(t < h.at) || t < h.at - B.windup || (best && best.at <= h.at)) continue;
    if (Math.hypot(fx - h.x, fz - h.z) > B.r) continue;
    best = { at: h.at, name: hostBlowUnder(a.k, P).name, t: Math.max(0, Math.min(1, (t - (h.at - B.windup)) / B.windup)), color: TELEGRAPH_EDGE };
    inside = (x, z) => Math.hypot(x - h.x, z - h.z) <= B.r;
  }
  if (!best) return null;
  const out = Number.isFinite(yaw) ? wayOut(inside, fx, fz, nearestCourt(fx, fz)) : null;
  return { name: best.name, t: best.t, now: best.at - t <= TELEGRAPH_NOW_MS, color: best.color, arrow: out ? screenBearing(out.dir, /** @type {number} */ (yaw)) : null, way: out };
}

export function orderPeril(o, yaw = null) {
  if (!o) return null;
  const dir = o.dir && Math.hypot(o.dir[0], o.dir[1]) > 1e-6 ? o.dir : null;
  return { name: o.name, t: o.t, now: !!o.now, color: o.color ?? TELEGRAPH_EDGE, order: o.order, arrow: dir && Number.isFinite(yaw) ? screenBearing(dir, /** @type {number} */ (yaw)) : null };
}

export const HEAL_SEND_MS = 1000;

/** @param {{ renderer?: any, gl?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, audio?: any, link: { state: () => any, receipt?: (day: number) => string|null, watching?: () => boolean }, spoils?: any, now: () => number, door?: () => number|null, cam?: () => number[]|null, feet?: () => number[]|null, player?: () => any, save?: (entity: any, el?: string) => number, strike?: (dmg: number, how: { fire: boolean, el?: string|null, name: string }) => void, say?: (text: string) => void, hudHidden?: () => boolean, veiled?: () => boolean, send?: (hit: { q: number, d: number, r: number }) => boolean, sendCrystal?: (hit: { c: number, q: number, d: number, r: number }) => boolean, sendHost?: (hit: { i: number, q: number, d: number, r: number }) => boolean, sendHeal?: (heal: { h: Array<[string, number]> }) => boolean, sendBody?: (v: number) => boolean, rng?: () => number, takeSpoil?: (piece: any) => void, portalDoor?: (door: any) => void, soulTrap?: (trap: { chance: number, mobile: number, name: string }) => void, me?: () => (string|null), yaw?: () => (number|null), shake?: (amount: number) => void, myId?: () => (string|null), pull?: (vx: number, vz: number) => void, pullDecay?: number, wantBodies?: () => boolean, makeBodies?: (() => any) | null, }} deps */
export function createGateCourt({
  renderer = null, gl = null, getTexture = null, uploadRecordFrame = null, audio = null,
  link, spoils = null, now, door = () => null, cam = () => null, feet = () => null, player = () => null, save = () => 100,
  strike = () => {}, say = () => {}, hudHidden = () => false, veiled = () => false, send = () => false, sendCrystal = () => false, sendHost = () => false, sendHeal = () => false, sendBody = () => false, rng = Math.random,
  takeSpoil = (piece) => spoils?.take?.(piece),
  portalDoor: layPortalDoor = () => {}, soulTrap = () => {}, me = () => null, yaw = () => null, shake = () => {},
  myId = () => null, pull = () => {}, pullDecay = 0,
  wantBodies = undefined, makeBodies = null,
}) {
  const watching = () => !!link.watching?.();
  let watchAskedAt = -Infinity;
  const bodiesLane = createPopulationLane({ laneName: 'gate', renderer, ...(wantBodies ? { want: wantBodies } : {}), make: makeBodies });
  const bossRec = {};
  const telegraphPass = compiledPass(gl, telegraphPrograms(false), () => new GateTelegraphRenderer(gl), (e) => console.warn('[gate] the telegraph would not build', e?.message ?? e));
  telegraphPass();
  const sprites = createSpriteWarm({ getTexture, uploadRecordFrame, has: (archive, rkey) => !!renderer?.textures?.has?.(`${archive}_${rkey}`) });
  const host = createGateHost({
    renderer, getTexture, uploadRecordFrame, audio, cam, feet, player, say, send: (x) => !watching() && sendHost(x), blowQ: (who) => blowQ(who),
    land: (B) => { const P = profileOf(link.state()); land(null, P, { pct: B.pct, base: B.base, el: B.el, name: B.name, saved: B.el != null }, B.el ? hostPulseColor(P) : null); },
  });
  let body = null, loading = null, batch = null;
  let batchShown = false;
  let day = null, judged = noMark(), cued = noMark(), landed = noMark(), phaseHeard = 0, fellCued = false, wrathLanded = false;
  let prevT = -Infinity, hurtAt = -Infinity, shape = null;
  let standIn = null, blowSeq = 0;
  // Hits on different bodies in one frame share one `q`, because the relay charges a blow once whatever it met. A
  // repeat hit on the same body starts a new `q`.
  const blowMet = new Set();
  let healSentAt = -Infinity;
  const healOwed = new Map();
  const sayBody = bodySayer((v) => !watching() && sendBody(v));
  const _places = new Map(), _names = new Map(), _others = [];
  const arsenal = createGateArsenal({
    me: () => myId(), placeOf: (id) => _places.get(id) ?? null, nameOf: (id) => _names.get(id) ?? null, others: () => _others,
    land: (atk, P, so) => land(atk, P, so), pull: (vx, vz) => !watching() && pull(vx, vz), pullDecay,
    sting: (atk) => { const s = link.state(); if (s) sound(BOSS_CUES.sting, s, now(), atk, feet()); },
    watching: () => watching(),
  });
  const flame = createGateFlame({
    renderer, getTexture, uploadRecordFrame, cam, feet, player, say,
    sound: (c, st, t, atk, point) => sound(c, st, t, atk, point), land: (atk, P) => land(atk, P), burst: (atk, A, P) => burstsOf(atk, A, P),
    felt: (st, t, A, atk) => feltLanding(st, t, A, atk), lay: (ps) => { for (const p of ps) pools.push(p); },
    send: (x) => !watching() && send(x), blowQ: (who) => blowQ(who), watching,
    arsenal: createGateArsenal({
      me: () => myId(), placeOf: (id) => _places.get(id) ?? null, nameOf: (id) => _names.get(id) ?? null, others: () => _others,
      land: (atk, P, so) => land(atk, P, so), pull: (vx, vz) => !watching() && pull(vx, vz), pullDecay,
      sting: (atk) => { const F = flameOf(link.state()); if (F) sound(BOSS_CUES.sting, F, now(), atk, feet()); },
      watching: () => watching(),
    }),
    bossName: (st) => bossOf(st).name,
  });
  const captive = createGateCaptive({ renderer, getTexture, uploadRecordFrame, cam, say, burst: (p, at0) => addBurst(p, at0, FX_KINDS.spoils, WARD_COLOR) });
  // `mineXZ` returns one shared array refilled on each call, so callers copy it rather than keep it.
  const _mine = [0, 0];
  const mineXZ = () => { const f = feet(); if (!f) return null; _mine[0] = f[0] - COURT_CENTRE[0]; _mine[1] = f[2] - COURT_CENTRE[2]; return _mine; };
  const arsenalPeril = (s, t, P, y) => orderPeril(arsenal.order(s, t, P, mineXZ(), y), y);
  const healLive = (s) => !!s && s.day !== null && !s.fell && s.wrath == null;
  function sendOwed(t) {
    healSentAt = t;
    const h = [];
    for (const [by, n] of healOwed) if (n >= 1 && h.length < GATE_HEAL_ROWS_MAX) h.push([by, Math.min(Math.floor(n), GATE_HEAL_WIRE_MAX)]);
    if (!h.length || watching() || !sendHeal({ h })) return;
    for (const [by, n] of h) { const left = healOwed.get(by) - n; if (left > 0) healOwed.set(by, left); else healOwed.delete(by); }
  }
  function blowQ(who) {
    if (!blowMet.size || blowMet.has(who)) { blowSeq++; blowMet.clear(); }
    blowMet.add(who);
    return blowSeq;
  }
  let spewed = false, spoilsSaid = false;
  let stepFrom = null, strideRun = 0, growlAt = null, hpHeard = null, gruntAt = -Infinity, quaked = noMark(), thunderPhase = 0, thudCued = false;
  let released = noMark(), courtFlashAt = -Infinity, hpFlashSeen = null;
  let beat = null, wakeHeard = false, roarAt = null, wrathSaid = 0, sputterAt = -Infinity, stung = noMark(), rjCarded = false;
  let fellSeen = false, fallFlashAt = -Infinity, columnN = 0, fallCardSet = false, corpse = null, corpseTex = null, corpseTried = false;
  let pools = [], pooled = noMark(), burnAt = -Infinity, inFire = false, outAt = -Infinity, mark = null;
  /** @type {ReadonlyArray<any>} */
  let poolDraw = NONE;
  let _mark = markShape([0, 0], 0, MARK_COLOR), _markOf = null, markEmber = MARK_COLOR;
  let marksSaid = false, fedHeard = null, marksAt = null, vgwHeard = null, titheTaken = null;
  let chartAt = null;
  let portal = null, profile = null, spin = 0, portalLaid = false, portalSaid = false;
  const portalPass = compiledPass(gl, GATE_PASS_PROGRAMS, () => new GatePassRenderer(gl, (profile ??= gateArchProfile())), (e) => console.warn('[gate] the portal would not build', e?.message ?? e));
  let wayIn = 0, wayInHeld = -Infinity, wayInMine = false;
  let arrivedAt = null, heardSeen = null, wordAt = null, frameAt = null, peersPrimed = false;
  let doorSeen = null;
  let _peersWere = new Set(), _peersNow = new Set();
  const ARRIVAL = courtToDungeon(0, 0, ARRIVE_Z);
  const _fires = [], _portalFire = { origin: [0, 0, 0], yaw: 0, open: 1, fade: 0, spin: 0 };
  const _wayIn = { origin: courtToDungeon(0, -PORTAL_DROP, WAY_IN_Z), yaw: 0, open: 1, fade: 0, spin: 0, fireOnly: true };
  function arriveAt(d) {
    const a = arrivalOf(planOfDay(d));
    const p = courtToDungeon(a.at[0], 0, a.at[1]), w = courtToDungeon(a.wayIn[0], -PORTAL_DROP, a.wayIn[1]);
    ARRIVAL[0] = p[0]; ARRIVAL[1] = p[1]; ARRIVAL[2] = p[2];
    _wayIn.origin = w;
  }
  let trapMark = null, trapJudged = null;
  const _batches = [], _lights = [];
  let rk = null, rkDone = null, stunHeard = 0;
  const crystalPassOf = compiledPass(gl, CRYSTAL_PROGRAMS, () => new CourtCrystalRenderer(gl), (e) => console.warn('[gate] the crystals would not build', e?.message ?? e));
  const crystalIns = [];
  const crystalShare = (c) => () => rk?.hp[c] ?? null;
  const _targets = [], _crystalDraw = [], _crystalSlots = [], _crystalLights = [], _chest = [0, 0, 0];
  const _walked = WALKS.map(() => 0);
  const _floors = { courts: COURTS, r: COURT_R, ks: planOf(null).floors };
  let groundName = '', groundColor = null, biteAt = -Infinity, biteColor = null;
  const _bursts = [], _fxLive = [], _meteor = { at: [0, 0, 0], color: null };
  const _glow = { x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0] };
  // `carried` marks these flashes so the shadow pass gives them no caster slot.
  const _fallLight = { x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0], carried: true }, _wrathLight = { x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0], carried: true };
  const flash = (L, at, c, k, range) => { L.x = at[0]; L.y = at[1]; L.z = at[2]; L.range = range; L.color[0] = c[0] * k; L.color[1] = c[1] * k; L.color[2] = c[2] * k; return L; };
  let meteorNow = null;
  const fxPassOf = compiledPass(gl, GATE_FX_PROGRAMS, () => new GateFxRenderer(gl), (e) => console.warn('[gate] his effects would not build', e?.message ?? e));

  function reset(d) {
    day = d; judged = noMark(); cued = noMark(); landed = noMark(); phaseHeard = 0; fellCued = false; wrathLanded = false;
    arriveAt(d);
    arsenal.reset();
    flame.reset();
    prevT = -Infinity; hurtAt = -Infinity; shape = null; standIn = null; spewed = false; spoilsSaid = false;
    stepFrom = null; strideRun = 0; growlAt = null; hpHeard = null; gruntAt = -Infinity; quaked = noMark(); thunderPhase = 0; thudCued = false;
    released = noMark(); courtFlashAt = -Infinity; hpFlashSeen = null;
    beat = null; wakeHeard = false; roarAt = null; wrathSaid = 0; sputterAt = -Infinity; stung = noMark(); rjCarded = false;
    fellSeen = false; fallFlashAt = -Infinity; columnN = 0; fallCardSet = false;
    if (corpse) { renderer?.destroyBillboardBatch?.(corpse); corpse = null; }
    pools = []; pooled = noMark(); burnAt = -Infinity; inFire = false; outAt = -Infinity; mark = null; poolDraw = [];
    marksSaid = false; fedHeard = null; marksAt = null; chartAt = null; vgwHeard = null; titheTaken = null;
    healOwed.clear();
    portal = null; spin = 0; portalLaid = false; portalSaid = false;
    wayIn = 0; wayInHeld = -Infinity; wayInMine = false;
    rk = null; rkDone = null; stunHeard = 0; crystalIns.length = 0; _targets.length = 0; _crystalDraw.length = 0;
    _bursts.length = 0; _fxLive.length = 0; meteorNow = null;
    groundName = ''; groundColor = null; biteAt = -Infinity; biteColor = null;
    if (d !== null && trapMark?.day !== d) trapMark = null;
  }

  // The trap counts when it was still running at the relay's `fell.at`, not when this client heard of the fall.
  function judgeTrap(s) {
    if (!s.fell || trapJudged === s.day) return;
    trapJudged = s.day;
    if (trapMark && s.fell.at < trapMark.until) soulTrap({ chance: trapMark.chance, mobile: bossLookOf(s.boss).mobile, name: bossOf(s).name });
  }

  // The portal is never walked through: it rises where the boss fell and the spoils land, so touching it would pull
  // players out before they loot.
  function portalFrame(s, t, dt) {
    wayInFrame(t, dt);
    if (wayIn > 0 || (s.fell && t >= s.fell.at + PORTAL_AFTER_MS)) firePass(dt);
    if (!s.fell || t < s.fell.at + PORTAL_AFTER_MS) { portal = null; return; }
    const at = bossPlace(s, s.fell.at);
    portal = { at, rise: Math.min(1, (t - s.fell.at - PORTAL_AFTER_MS) / PORTAL_RISE_MS), origin: courtToDungeon(at[0], -PORTAL_DROP, at[1]),
      fade: portalFade(t, s.fell.at, gateTimes(s.day).wrathAt + GATE_COLLAPSE_MS) };
    if (!portalLaid) { portalLaid = true; layPortalDoor(portalDoor(at)); }
    if (!portalSaid) { portalSaid = true; if (t < s.fell.at + PORTAL_AFTER_MS + PORTAL_RISE_MS + 1000) say(COURT_TEXT.portal); }
  }

  function firePass(dt) {
    profile ??= gateArchProfile();
    portalPass();
    spin = (spin + gateSpinRate(1) * Math.max(0, dt)) % 1;
  }
  const peersDown = (run) => (typeof audio?.scaled === 'function' ? audio.scaled(egDbGain(EG_MIX.peerDb), run) : run());
  function peersHeard(inCourt) {
    const held = peerSoundScope();
    if (inCourt && held === null) setPeerSoundScope(peersDown);
    else if (!inCourt && held === peersDown) setPeerSoundScope(null);
  }
  const warmDoors = [fxPassOf, crystalPassOf, portalPass];
  let warmed = 0;
  function warmPasses() {
    if (!gl || !feet()) return;
    while (warmed < warmDoors.length && warmDoors[warmed].settled) warmed++;
    if (warmed >= warmDoors.length) return;
    if (!parallelCompile(gl)) { warmDoors[warmed++](); return; }
    let all = true;
    for (const door of warmDoors) all = !!door() && all;
    if (all) warmed = warmDoors.length;
  }

  function wayInFrame(t, dt) {
    if (!wayInMine && arrivedAt !== null) { wayInMine = true; wayInHeld = Math.max(wayInHeld, arrivedAt + WAY_IN_HOLD_MS); if (t < wayInHeld) wayIn = 1; }
    wayIn = wayInStep(wayIn, dt * 1000, t < wayInHeld);
  }

  // A frame more than `COURT_FRAME_GAP_MS` after the last restarts the silence count, so a sleeping tab is not
  // treated as a silent court.
  function courtWatch(s, t) {
    if (!feet()) { arrivedAt = null; heardSeen = null; wordAt = null; frameAt = null; peersPrimed = false; _peersWere.clear(); return; }
    if (arrivedAt === null) { if (veiled()) return; arrivedAt = t; wordAt = t; }
    if (frameAt !== null && t - frameAt > COURT_FRAME_GAP_MS) wordAt = t;
    frameAt = t;
    if (s && s.day !== null && s.heardAt !== heardSeen) { heardSeen = s.heardAt; wordAt = t; }
    const d = door();
    if (d != null && d !== doorSeen) { doorSeen = d; if (t - arrivedAt <= COURT_DOOR_WAIT_MS) wordAt = t; }
  }

  function sound(cue, s, t, atk, point = null) {
    if (!cue || !audio) return;
    const where = cue.at === 'point' && point ? [point]
      : cue.at === 'targets' && atk?.tg?.length ? cueTargetPlaces(atk.tg.map((p) => courtToDungeon(p[0], 0.5, p[1])), audio.listenerPosition?.())
      : [(() => { const [x, z] = bossPlace(s, t); return courtToDungeon(x, 2.5, z); })()];
    const opts = { maxDistance: cue.reach, distanceModel: 'linear', pitch: cue.pitch };
    for (const p of where) {
      try { if (cue.id != null) audio.play3dId?.(cue.id, p, cue.volume, opts); else audio.play3d?.(cue.clip, p, cue.volume, opts); } catch { }
    }
  }

  function land(atk, P, so = blowOf(atk, P), color = null) {
    if (watching()) return;
    const e = player();
    if (!e || !so || !(e.health > 0)) return;
    let dmg = strikeDamage(so.pct, e.maxHealth, so.base);
    if (so.saved) dmg = savedShare(dmg, save(e, so.el));
    if (dmg <= 0) { say(COURT_STRIKE_TEXT.resisted(so.name)); return; }
    strike(dmg, { fire: so.el === 'fire', el: so.el, name: so.name });
    if (so.el) { biteAt = now(); biteColor = color ?? attackColor(ATTACK_BY_ID[atk.a], P); }
  }

  function burn(s, t, P) {
    const atk = s.atk, A = atk ? ATTACK_BY_ID[atk.a] : null;
    if (A && P.atk[A.key].pool && !marked(pooled, atk) && t >= atk.at) {
      setMark(pooled, atk);
      if (t < atk.at + Math.max(A.active, 1) + 400) for (const p of landingPools(atk, P)) pools.push(p);
    }
    if (pools.length) pools = pools.filter((p) => t < p.until);
    const f = feet(), e = player();
    if (!pools.length || !f || !e || !(e.health > 0) || s.fell || s.wrath != null || watching()) { inFire = false; return; }
    const p = poolUnder(pools, f[0] - COURT_CENTRE[0], f[2] - COURT_CENTRE[2], t);
    if (!p) { if (inFire) { inFire = false; outAt = t; } return; }
    groundName = P.aspect.ground; groundColor = poolColor(P);
    if (!inFire && t - outAt >= POOL_TICK_MS) sound(groundStepCue(P), s, t, null, f);
    // Stepping back in restarts the bite timer only after at least one tick outside, so stepping out briefly each
    // second does not avoid the bite.
    if (!inFire) { inFire = true; if (t - outAt >= POOL_TICK_MS) { burnAt = t; return; } }
    if (t - burnAt < POOL_TICK_MS) return;
    burnAt = t;
    const el = p.el ?? 'fire';
    const dmg = savedShare(strikeDamage(p.pct, e.maxHealth, p.base), save(e, el));
    if (dmg > 0) {
      strike(dmg, { fire: el === 'fire', el, name: el === 'fire' ? COURT_STRIKE_TEXT.burning : P.aspect.ground.toLowerCase() });
      biteAt = t; biteColor = groundColor;
    }
  }

  function judge(s, t, P) {
    const atk = s.atk;
    const f = feet(), e = player();
    const standing = !!f && !!e && e.health > 0;
    if (atk && !marked(judged, atk) && standing) {
      const v = strikeVerdict(atk, f[0] - COURT_CENTRE[0], f[2] - COURT_CENTRE[2], t, Number.isFinite(prevT) ? prevT : t, P);
      if (v !== 'wait') {
        setMark(judged, atk);
        if (v === 'hit' && !wardTakes(s.cp, atk)) { if (ATTACK_BY_ID[atk.a] === ATTACKS.wrath) wrathLanded = true; land(atk, P); }
      }
    }
    // When the relay's Wrath word arrives before this client judged the Wrath attack, the Wrath still lands once.
    if (s.wrath != null && !wrathLanded) { wrathLanded = true; if (standing) land({ a: ATTACKS.wrath.id }, P); }
    arsenal.judge(s, t, P, f ? mineXZ() : null, yaw(), standing);
  }

  function cue(s, t, P) {
    const atk = s.atk, A = atk ? ATTACK_BY_ID[atk.a] : null;
    if (A && !marked(cued, atk)) { setMark(cued, atk); if (t < atk.at) sound(bossCue('windup', A, P), s, t, atk); }
    if (A && !marked(released, atk) && t >= atk.at - RELEASE_LEAD_MS) { setMark(released, atk); if (t < atk.at) sound(bossCue('release', A, P), s, t, atk); }
    if (A && !marked(landed, atk) && t >= atk.at) { setMark(landed, atk); if (t < atk.at + Math.max(A.active, 1) + 400) { sound(bossCue('land', A, P), s, t, atk); burstsOf(atk, A, P); feltLanding(s, t, A, atk); } }
    if (A && !marked(quaked, atk) && t >= atk.at && QUAKE_ON.includes(A.key)) { setMark(quaked, atk); if (t < atk.at + Math.max(A.active, 1) + 400) sound(BOSS_CUES.quake, s, t, atk); }
    if (s.phase > thunderPhase) { if (thunderPhase > 0) sound(BOSS_CUES.thunder, s, t, null); thunderPhase = s.phase; }
    if (!wakeHeard && (s.openUntil ?? 0) > 0 && t >= s.openUntil - WAKE_LEAD_MS) {
      wakeHeard = true;
      if (t < s.openUntil + WAKE_LATE_MS && !s.fell && s.wrath == null) {
        const b = bossOf(s), ep = P.md ? P.aspect.epithet : '';
        sound(BOSS_CUES.roar, s, t, null);
        beat = { kind: 'wake', at: t, until: t + TITLE_HOLD_MS, kicker: b.title, main: b.name, sub: ep ? `${ep.charAt(0).toUpperCase()}${ep.slice(1)}` : '' };
      }
    }
    if (s.phase > phaseHeard) { if (phaseHeard > 0) { roarAt = t + ROAR_AFTER_MS; const c = courtPhaseCard(s.phase, s.pt); if (c && !(s.phase === 3 && rjCarded)) beat = { kind: 'phase', at: t, until: t + TITLE_HOLD_MS, ...c }; } phaseHeard = s.phase; }
    if (s.sd?.rj && !rjCarded) { rjCarded = true; if (t - s.sd.rj <= FED_LATE_MS) { const c = courtPhaseCard(3, s.pt); if (c) beat = { kind: 'phase', at: t, until: t + TITLE_HOLD_MS, ...c }; } }
    if (roarAt !== null && t >= roarAt) { roarAt = null; sound(BOSS_CUES.roar, s, t, null); }
    if (beat?.kind === 'phase' && A === ATTACKS.cross) beat.until = Math.max(beat.until, atk.at + Math.max(A.active, 1) + 400);
    if (!(wrathSaid & 1) && Number.isFinite(s.wrathAt) && !s.fell && s.wrath == null && t >= s.wrathAt - WRATH_WARN_AT_MS) { wrathSaid |= 1; if (t < s.wrathAt - WRATH_WARN_AT_MS + 5000) say(COURT_WRATH_TEXT.minute); }
    if (!(wrathSaid & 2) && A === ATTACKS.wrath && t < atk.at) { wrathSaid |= 2; say(COURT_WRATH_TEXT.windup); }
    if ((A === ATTACKS.meteor || A === ATTACKS.leap) && !marked(stung, atk) && t < atk.at) {
      setMark(stung, atk);
      const f = feet(), e = player();
      if (f && e && e.health > 0 && inAttack(atk, f[0] - COURT_CENTRE[0], f[2] - COURT_CENTRE[2], P)) sound(BOSS_CUES.sting, s, t, atk, f);
    }
    if (!marksSaid) { marksSaid = true; if (P.md && !s.fell && s.wrath == null) marksAt = t; }
    if (s.fed && s.fed.at !== fedHeard) { fedHeard = s.fed.at; if (t - s.fed.at <= FED_LATE_MS) { say(COURT_MARKS_TEXT.fed(bossOf(s).name, s.fed.ns)); sound(BOSS_CUES.growl, s, t, null); } }
    if (s.vgw && `${s.vgw.e}@${s.vgw.at}` !== vgwHeard) { vgwHeard = `${s.vgw.e}@${s.vgw.at}`; const line = t - s.vgw.at <= FED_LATE_MS ? vanguardLine(s.vgw, bossOf(s).name) : null; if (line) say(line); }
    if (s.fell && !fellCued) { fellCued = true; if (t < s.fell.at + FALL_CRY_LATE_MS) sound(BOSS_CUES.fall, s, t, null); }
    bodySounds(s, t, A);
  }

  function bodySounds(s, t, A) {
    if (s.fell) {
      if (!thudCued && t >= s.fell.at + THUD_AT_MS) { thudCued = true; if (t < s.fell.at + THUD_AT_MS + FALL_NEWS_MS) sound(BOSS_CUES.thud, s, t, null); }
      return;
    }
    const [x, z] = bossPlace(s, t);
    if (bossHop(s, t) > 0) { stepFrom = null; strideRun = 0; }
    else {
      if (stepFrom) {
        strideRun += Math.hypot(x - stepFrom[0], z - stepFrom[1]);
        if (strideRun >= BOSS_STRIDE_M) { strideRun %= BOSS_STRIDE_M; sound(BOSS_CUES.step, s, t, null); }
      }
      stepFrom = [x, z];
    }
    const striking = !!A && t < s.atk.at + Math.max(A.active, 1) + 1500;
    const nextGrowl = () => t + GROWL_EVERY_MS[0] + rng() * (GROWL_EVERY_MS[1] - GROWL_EVERY_MS[0]);
    if (growlAt === null) growlAt = nextGrowl();
    else if (striking) growlAt = Math.max(growlAt, t + 3000);
    else if (t >= growlAt) { sound(BOSS_CUES.growl, s, t, null); growlAt = nextGrowl(); }
    // Health loss is counted from the last grunt, not the last update, because the relay reports health in small
    // steps that never reach a share alone.
    if (hpHeard === null || s.hp > hpHeard) hpHeard = s.hp;
    else if (s.max > 0 && hpHeard - s.hp >= s.max * HURT_SHARE && t - gruntAt >= HURT_GAP_MS) { gruntAt = t; hpHeard = s.hp; sound(BOSS_CUES.hurt, s, t, null); }
  }

  function burst(s, t) {
    if (!spoils || !s.fell || spewed || t < s.fell.at + SPEW_AT_MS) return;
    const r = link.receipt?.(s.day) ?? null, claims = r ? readReceipt(r) : null;
    if (!claims) {
      if (!spoilsSaid && t >= s.fell.at + RECEIPT_WAIT_MS) { spoilsSaid = true; say(COURT_STRIKE_TEXT.noSpoils()); }
      return;
    }
    spewed = true;
    const [x, z] = bossPlace(s, s.fell.at);
    const at = courtToDungeon(x, profileOf(s).bossH * 0.55, z), f = feet();
    const bearing = f ? Math.atan2(f[0] - at[0], f[2] - at[2]) : s.yaw;
    const keep = spoilsKeep(x, z);
    if (spoils.spew({ day: s.day, seed: claims.c, level: spoilsLevel(player()?.level ?? 1, claims.l), at, bearing, acct: claims.s, keep, claims })) {
      say(claims.x === 'rite' ? COURT_STRIKE_TEXT.spilledRite() : COURT_STRIKE_TEXT.spilled());
      addBurst(at, t, FX_KINDS.spoils, SPOILS_BURST_COLOR, keep.floorY);
    }
  }

  function titheFrame(s, t) {
    const T = s.tithe;
    if (!T || T.c === titheTaken || watching()) return;
    titheTaken = T.c;
    const list = titheList(T.c, player()?.level ?? 1);
    for (const piece of list) takeSpoil(piece);
    const g = s.lg?.gone?.find((x) => x.k === HOST.tithe && x.w === HOST_GONE.slain), f = feet();
    const at = g ? courtToDungeon(g.x, 1, g.z) : f;
    if (at && t - T.at <= FED_LATE_MS) addBurst(at, t, FX_KINDS.spoils, TITHE_GOLD);
    say(COURT_TITHE_TEXT.mine(list[0].gold, list[1].item?.name ?? ''));
  }
  function addBurst(p, at0, kind, color, floor = NaN) {
    let b = _bursts.length < FX_BURSTS_MAX ? null : _bursts.reduce((o, q) => (q.at0 < o.at0 ? q : o));
    if (!b) { b = { at: [0, 0, 0], at0: 0, t: 0, kind, color, floor: NaN, light: null }; _bursts.push(b); }
    // `relight` gives the reused slot a new light identity, so the renderer does not treat it as the old light
    // moving.
    else if (b.light) relight(b.light);
    b.at[0] = p[0]; b.at[1] = p[1]; b.at[2] = p[2]; b.at0 = at0; b.kind = kind; b.color = color; b.floor = floor;
  }
  const onSpoilRest = (pos, tier) => {
    const rare = (RARITIES[tier]?.rank ?? 0) >= RARITIES.rare.rank;
    addBurst(pos, now(), rare ? FX_KINDS.spoilRestRare : FX_KINDS.spoilRest, tierColour(tier));
  };
  function fallEvent(s, t, P) {
    if (!s.fell) return;
    const since = t - s.fell.at, [x, z] = bossPlace(s, s.fell.at);
    if (!fellSeen) {
      fellSeen = true;
      if (since < FALL_CRY_LATE_MS) { addBurst(courtToDungeon(x, P.bossH * FALL_BURST_UP, z), s.fell.at, FX_KINDS.dagon, emberColor(P)); fallFlashAt = s.fell.at; shake(FALL_SHAKE); }
    }
    for (; columnN < COLUMN_BURSTS && since >= THUD_AT_MS + columnN * COLUMN_STEP_MS; columnN++) {
      if (since < THUD_AT_MS + columnN * COLUMN_STEP_MS + FALL_NEWS_MS) addBurst(courtToDungeon(x, 0.1, z), s.fell.at + THUD_AT_MS + columnN * COLUMN_STEP_MS, FX_KINDS.embers, emberColor(P));
    }
    if (!fallCardSet && since >= SPEW_AT_MS) {
      fallCardSet = true;
      const at = s.fell.at + SPEW_AT_MS;
      if (t < at + FALL_CARD_MS) beat = { kind: 'fall', at, until: at + FALL_CARD_MS, kicker: bossOf(s).name, main: BOSS_BAR_TEXT.fallen, sub: '' };
    }
  }
  function sputterSparks(s, t, P) {
    if (s.fell || s.wrath != null || !(s.max > 0) || s.hp / s.max >= LOW_HEALTH || t - sputterAt < SPUTTER_EVERY_MS) return;
    sputterAt = t;
    const [x, z] = bossPlace(s, t);
    addBurst(courtToDungeon(x, P.bossH * 0.55, z), t, FX_KINDS.sputter, emberColor(P));
  }
  function drawCorpse(s) {
    const ct = ENEMY_BASICS[bossLookOf(s.boss).mobile]?.corpseTexture;
    if (!ct || !renderer?.createBillboardBatch || !getTexture) return;
    if (!corpseTried) { corpseTried = true; Promise.resolve(getTexture(ct.archive)).then((tx) => { corpseTex = tx ?? null; }).catch(() => {}); }
    if (!corpseTex || corpse) return;
    const sz = billboardSize(corpseTex, ct.record), w = (sz?.w ?? 1.6) * CORPSE_SCALE, h = (sz?.h ?? 0.6) * CORPSE_SCALE;
    const rkey = `${ct.record}#0`;
    if (!renderer.textures?.has?.(`${ct.archive}_${rkey}`)) uploadRecordFrame?.(ct.archive, ct.record, 0);
    corpse = renderer.createBillboardBatch(ct.archive, rkey, { w, h }, [[0, 0, 0]]);
    const [x, z] = bossPlace(s, s.fell.at);
    corpse.origin = courtToDungeon(x, 0, z);
    corpse.record = rkey;
    corpse.size = { w, h };
  }
  function feltLanding(s, t, A, atk) {
    const f = feet();
    if (!f) return;
    const fx = f[0] - COURT_CENTRE[0], fz = f[2] - COURT_CENTRE[2];
    const away = A.aim === 'players' ? atk.tg ?? NONE : A === ATTACKS.meteor ? (atk.tg?.length ? [atk.tg[0]] : NONE) : null;
    let k = 0;
    if (away) for (const p of away) k = Math.max(k, landShake(A, Math.hypot(fx - p[0], fz - p[1])));
    else { const [x, z] = bossPlace(s, t); k = landShake(A, Math.hypot(fx - x, fz - z)); }
    if (k >= 0.05) shake(k);
  }
  function burstsOf(atk, A, P) {
    const kind = fxBurstOf(A);
    if (!kind) return;
    const color = attackColor(A, P);
    const add = (x, z) => addBurst(courtToDungeon(x, 0.1, z), atk.at, kind, color);
    if (A.aim === 'self') add(atk.x, atk.z);
    else if (A.aim === 'point') { const p = atk.tg?.[0]; if (p) add(p[0], p[1]); }
    else if (A.aim === 'players') for (const p of atk.tg ?? NONE) add(p[0], p[1]);
  }
  function fxFrame(s, t, P) {
    _fxLive.length = 0;
    for (const b of _bursts) { b.t = (t - b.at0) / 1000; if (b.t >= 0 && b.t < FX_BURST_MS / 1000) _fxLive.push(b); }
    const mf = s.fell ? null : meteorFall(s.atk, t);
    if (mf) {
      const p = courtToDungeon(mf.at[0], mf.at[1], mf.at[2]);
      _meteor.at[0] = p[0]; _meteor.at[1] = p[1]; _meteor.at[2] = p[2]; _meteor.color = attackColor(ATTACKS.meteor, P);
      meteorNow = _meteor;
    } else meteorNow = null;
  }

  // The relay accepts a blow on the boss or a crystal only from inside his court plus `POSE_SLACK`.
  const fromHisCourt = (s, t) => {
    const f = feet();
    if (!f) return false;
    const [bx, bz] = bossPlace(s, t);
    return inCourt(f[0] - COURT_CENTRE[0], f[2] - COURT_CENTRE[2], nearestCourt(bx, bz), POSE_SLACK);
  };

  // The relay accepts a blow on a host body only from the floor that body stands on (`applyHostHit` in
  // `gateBrain.js`).
  const myFloor = () => {
    const f = feet();
    if (!f) return -1;
    const x = f[0] - COURT_CENTRE[0], z = f[2] - COURT_CENTRE[2], k = nearestCourt(x, z);
    return inCourt(x, z, k, POSE_SLACK) ? k : -1;
  };
  const fromItsFloor = (s, i, t) => {
    const a = s.lg?.ads.find((o) => o.i === i);
    if (!a) return false;
    const [x, z] = hostAt(a, t), k = myFloor();
    return k >= 0 && k === nearestCourt(x, z);
  };
  const _hostMine = [];

  const flameCourtMine = (F, t, fp) => {
    const fx = fp[0] - COURT_CENTRE[0], fz = fp[2] - COURT_CENTRE[2], [x, z] = bossPlace(F, t), k = nearestCourt(x, z);
    return inCourt(fx, fz, k, POSE_SLACK) && !fromHisCourt(link.state(), t);
  };
  // A Reckoning is identified by its number and first crystal spot, because a room restored from a checkpoint
  // reuses numbers.
  const sameCx = (r, X) => !!r && !!X && r.i === X.i && r.x0 === X.c[0][0] && r.z0 === X.c[0][1];

  function crystalsOf(X, s, t) {
    const atk = s.atk, A = atk ? ATTACK_BY_ID[atk.a] : null, mine = A === ATTACKS.reckon && atk.i === X.i;
    const n = Math.min(X.c.length, CRYSTALS_DRAW_MAX);
    const r = { i: X.i, x0: X.c[0][0], z0: X.c[0][1], n, grewAt: mine ? atk.at - windupOf(A, s.phase) : -Infinity, landAt: mine ? atk.at : null, ended: false, endAt: 0,
      feet: [], hp: [], brokeAt: [], flashAt: [], yaw: [], seed: [], targets: [] };
    for (let k = 0; k < n; k++) {
      const q = X.c[k], feet = courtToDungeon(q[0], 0, q[1]);
      const seed = (((X.i * 7919 + k * 104729) % 997) + 997) % 997 / 997;
      r.feet.push(feet);
      r.hp.push(X.m > 0 ? Math.max(0, q[2] / X.m) : 1);
      r.brokeAt.push(q[2] > 0 ? null : -Infinity);
      r.flashAt.push(-Infinity);
      r.seed.push(seed);
      r.yaw.push(seed * Math.PI * 2);
      r.targets.push({ c: k, feet, height: CRYSTAL_H, radius: CRYSTAL_R, entity: null });
    }
    return r;
  }

  function breakCrystal(s, k, at, t, who, spent = false) {
    rk.brokeAt[k] = at;
    rk.hp[k] = 0;
    if (!(t - at <= RECKON_LATE_MS)) return;
    sound(BOSS_CUES.crystalBreak, s, t, null, rk.feet[k]);
    if (spent) return;
    sound(BOSS_CUES.crystalRing, s, t, null, rk.feet[k]);
    let left = 0;
    for (let j = 0; j < rk.n; j++) if (rk.brokeAt[j] === null) left++;
    say(COURT_RECKON_TEXT.shattered(who, left));
  }

  function crystals(s, t, P) {
    const X = s.cx;
    if (X && X.c.length && !sameCx(rk, X) && !(rkDone && rkDone.i === X.i && rkDone.x0 === X.c[0][0] && rkDone.z0 === X.c[0][1])) {
      rk = crystalsOf(X, s, t);
      for (const q of rk.targets) q.entity = (crystalIns[q.c] ??= crystalStandIn(bossLookOf(s.boss), q.c, crystalShare(q.c)));
      let left = 0;
      for (let k = 0; k < rk.n; k++) if (X.c[k][2] > 0) left++;
      if (rk.landAt !== null && t < rk.landAt && left > 0 && !s.fell && s.wrath == null) say(COURT_RECKON_TEXT.call(left));
      if (t - rk.grewAt <= RECKON_LATE_MS && !s.fell && s.wrath == null) for (let k = 0; k < rk.n; k++) sound(BOSS_CUES.crystalRise, s, t, null, rk.feet[k]);
    }
    _targets.length = 0;
    _crystalDraw.length = 0;
    if (rk && !rk.ended) {
      const live = sameCx(rk, X);
      if (live) {
        for (let k = 0; k < rk.n; k++) {
          const h = X.c[k][2];
          rk.hp[k] = X.m > 0 ? Math.max(0, h / X.m) : 0;
          if (rk.brokeAt[k] === null && !(h > 0)) {
            let b = null;
            for (const e of X.broke) if (e.c === k) b = e;
            breakCrystal(s, k, b ? b.at : t, t, b ? b.n : null);
          }
        }
      }
      if (!live || (rk.landAt !== null && t >= rk.landAt) || s.fell || s.wrath != null) {
        rk.ended = true; rk.endAt = t;
        rkDone = { i: rk.i, x0: rk.x0, z0: rk.z0 };
        for (let k = 0; k < rk.n; k++) if (rk.brokeAt[k] === null) breakCrystal(s, k, t, t, null, true);
      }
    }
    // The stun line is said after the crystal lines of the same update, because the center label shows only the
    // last line said.
    if (s.stunAt && s.stunAt !== stunHeard && t < s.stunUntil && !s.sd) {
      stunHeard = s.stunAt;
      if (t - s.stunAt <= RECKON_LATE_MS) { say(COURT_RECKON_TEXT.broken()); sound(BOSS_CUES.stunned, s, t, null); }
    }
    if (!rk) return;
    if (rk.ended && t - rk.endAt > CRYSTAL_SHATTER_MS + 250) { rk = null; return; }
    const grow = crystalGrowth(t - rk.grewAt);
    // No crystal is a target from outside his court or within `RECKON_CLOSE_MS` of the landing, because the relay
    // accepts no crystal blow then.
    if (!rk.ended && grow >= CRYSTAL_STRIKE_GROWN && !(rk.landAt !== null && t >= rk.landAt - RECKON_CLOSE_MS) && fromHisCourt(s, t)) for (let k = 0; k < rk.n; k++) if (rk.brokeAt[k] === null) _targets.push(rk.targets[k]);
    const atk = s.atk, winding = !!atk && ATTACK_BY_ID[atk.a] === ATTACKS.reckon && t < atk.at;
    if (winding) { const [bx, bz] = bossPlace(s, t); _chest[0] = COURT_CENTRE[0] + bx; _chest[1] = COURT_CENTRE[1] + P.bossH * 0.62; _chest[2] = COURT_CENTRE[2] + bz; }
    const color = crystalColor(P);
    for (let k = 0; k < rk.n; k++) {
      const d = (_crystalSlots[k] ??= { at: null, yaw: 0, seed: 0, grow: 0, broke: -1, hp: 1, flash: 0, color: null, beam: null });
      const b = rk.brokeAt[k];
      d.at = rk.feet[k]; d.yaw = rk.yaw[k]; d.seed = rk.seed[k]; d.grow = grow;
      d.broke = b === null ? -1 : Number.isFinite(b) ? Math.max(0, (t - b) / 1000) : Infinity;
      d.hp = rk.hp[k];
      d.flash = Math.max(0, 1 - (t - rk.flashAt[k]) / CRYSTAL_FLASH_MS);
      d.color = color;
      d.beam = winding && b === null ? _chest : null;
      _crystalDraw.push(d);
    }
  }

  function loadBody(s) {
    if (body || loading || !getTexture || !uploadRecordFrame || !renderer?.createBillboardBatch) return;
    const look = bossLookOf(s.boss), basics = ENEMY_BASICS[look.mobile];
    const archive = basics?.maleTexture;
    if (!archive) return;
    loading = Promise.resolve().then(() => getTexture(archive)).then((tex) => {
      body = tex ? { tex, archive, scale: look.scale } : { failed: true };
      if (!tex) console.warn(`[gate] the boss's sprite (archive ${archive}) would not load`);
    }, (e) => { body = { failed: true }; console.warn('[gate] the boss\'s sprite', e?.message ?? e); });
  }

  function drawBody(s, t, P) {
    loadBody(s);
    const act = bossAct(s, t, hurtAt);
    if (s.fell && act.act === 'gone') drawCorpse(s);
    if (!body?.tex || act.act === 'gone') { batchShown = false; return; }
    const [x, z] = bossPlace(s, t);
    const at = courtToDungeon(x, bossHop(s, t) - (act.sink ?? 0), z);
    const eye = cam() ?? at;
    const fr = bossFrame(act, s.yaw, at, eye, (rec) => body.tex.getFrameCount?.(rec) ?? 1);
    const rkey = `${fr.record}#${fr.frame}`;
    if (!renderer.textures?.has?.(`${body.archive}_${rkey}`)) uploadRecordFrame(body.archive, fr.record, fr.frame);
    // `mobileBillboardSize` returns a shared cached object, so it is read here and never written.
    const sz = mobileBillboardSize(body.tex, fr.record);
    const w = sz.w * body.scale * P.size, h = sz.h * body.scale * P.size;
    const size = { w: fr.flip ? -w : w, h };
    if (!batch) {
      batch = renderer.createBillboardBatch(body.archive, rkey, { w, h }, [[0, 0, 0]]);
      batch.origin = [0, 0, 0];
    }
    batchShown = true;
    if (hpFlashSeen === null || s.hp > hpFlashSeen) hpFlashSeen = s.hp;
    else if (s.max > 0 && hpFlashSeen - s.hp >= s.max * GATE_FLASH_SHARE) { courtFlashAt = t; hpFlashSeen = s.hp; }
    setBatchHitFlash(batch, s.fell ? 0 : gateHitFlash(hurtAt, courtFlashAt, t));
    batch.record = rkey;
    batch.size = size;
    if (batch.bounds) batch.bounds[3] = Math.hypot(w, h) * 0.5;
    batch.origin[0] = at[0]; batch.origin[1] = at[1]; batch.origin[2] = at[2];
  }

  return {
    frame() {
      blowMet.clear();
      const s = link.state(), t = now();
      courtWatch(s, t);
      warmPasses();
      peersHeard(!!feet());
      if (!s || s.day === null) { if (day !== null) this.leave(); return; }
      if (s.day !== day) reset(s.day);
      // `portalFrame` runs before the fight steps, because the host swallows an exception from any later step and
      // the portal door would never be laid.
      portalFrame(s, t, Number.isFinite(prevT) ? Math.max(0, t - prevT) / 1000 : 0);
      const P = profileOf(s);
      if (feet()) { sprites.want(s, P); sprites.step(); }
      judge(s, t, P);
      judgeTrap(s);
      burn(s, t, P);
      cue(s, t, P);
      crystals(s, t, P);
      host.frame(s, t, P, bossOf(s).name);
      flame.frame(s, t);
      captive.frame(s, t);
      fallEvent(s, t, P);
      sputterSparks(s, t, P);
      fxFrame(s, t, P);
      drawBody(s, t, P);
      burst(s, t);
      titheFrame(s, t);
      spoils?.frame(onSpoilRest);
      { const mine = mineXZ(); shape = s.fell ? null : captive.dress(telegraphShape(s.atk, s.phase, t, P, (k) => arsenal.at(s.atk, k, mine)), s); }
      if (_markOf !== P) { _markOf = P; const ember = emberColor(P); markEmber = ember === EMBER_COLOR ? MARK_COLOR : markColorOf(ember); _mark = markShape([0, 0], 0, markEmber, P.bossR); }
      if (s.fell || s.wrath != null || bossAct(s, t, hurtAt).act === 'gone') mark = null;
      else { const [mx, mz] = bossPlace(s, t); _mark.origin[0] = mx; _mark.origin[1] = mz; _mark.yaw = s.yaw; _mark.color = t < s.shieldUntil ? WARD_COLOR : markEmber; _mark.court = nearestCourt(mx, mz); mark = _mark; }
      poolDraw = pools.length ? poolShapes(pools, t, poolColor(P), TELEGRAPH_STYLE[P.el] ?? TELEGRAPH_STYLE.fire) : NONE;
      for (const w of WALKS) _walked[w.k] = walkFormed(s.xa, w.k, t);
      _floors.ks = planOf(s).floors;
      const fp = feet(), alive = !!fp && (player()?.health ?? 0) > 0;
      const peril = alive ? perilAt(s, t, P, fp[0] - COURT_CENTRE[0], fp[2] - COURT_CENTRE[2], yaw()) : null;
      const F = flameOf(s), pF = alive && F ? perilAt(F, t, profileOf(F), fp[0] - COURT_CENTRE[0], fp[2] - COURT_CENTRE[2], yaw()) : null;
      const onMe = peril && pF ? (pF.now && !peril.now ? pF : peril) : peril ?? pF;
      drawGateBossBar(bossBarModel(s, t, bossOf(s), onMe?.name ?? null, { flame: F, flameMine: !!F && !!fp && flameCourtMine(F, t, fp) }), { hidden: hudHidden() || veiled() });
      if (marksAt !== null && s.fell) marksAt = null;
      drawGateMarksCard(marksAt !== null ? marksCardModel(s.md, bossOf(s), { mode: 'arrive', since: marksAt, now: t, pt: s.pt }) : null, { hidden: hudHidden() || veiled() });
      drawGateTitleCard(titleCardModel(beat, t), { hidden: hudHidden() || veiled() });
      if (s.fell && chartAt === null) chartAt = t;
      drawGateDamageChart(chartAt !== null ? damageChartModel(s.fell, { boss: bossOf(s).name, me: me(), since: chartAt, now: t }) : null, { hidden: hudHidden() || veiled() });
      const order = alive ? arsenalPeril(s, t, P, yaw()) ?? orderPeril(flame.order(s, t, mineXZ(), yaw()), yaw()) : null;
      drawGateGround(groundViewModel({ inside: inFire, ground: groundName, color: groundColor, biteAt, biteColor, now: t, peril: order ?? onMe, blindAt: arsenal.blindAt() }), { hidden: hudHidden() });
      if (healOwed.size && t - healSentAt >= HEAL_SEND_MS) sendOwed(t);
      { const e = player(); if (alive && healLive(s) && e?.maxHealth > 0) sayBody(e.health / e.maxHealth, t); }
      prevT = t;
    },
    healedBy(id, n) {
      if (!healLive(link.state()) || !(n > 0) || typeof id !== 'string' || !id || watching()) return false;
      healOwed.set(id, (healOwed.get(id) ?? 0) + n);
      return true;
    },
    target() {
      const s = link.state(), t = now();
      // No target once the Wrath has landed, because the relay judges no blow after it.
      if (!s || s.day === null || s.fell || s.wrath != null || bossAct(s, t).act === 'gone') return null;
      standIn ??= bossStandIn(bossLookOf(s.boss), bossOf(s).name, () => { const q = link.state(); return wordShare(q?.hp, q?.max); });
      const [x, z] = bossPlace(s, t), P = profileOf(s);
      return { feet: courtToDungeon(x, 0, z), yaw: s.yaw, height: P.bossH, radius: P.bossR, warded: t < s.shieldUntil || (!!s.sd && t < s.stunUntil), entity: standIn, mobile: bossLookOf(s.boss).mobile };
    },
    hit({ d, r }) {
      const s = link.state(), t = now();
      if (!s || s.day === null || s.fell || s.wrath != null || !Object.values(HIT_KINDS).includes(r)) return false;
      if (t < s.shieldUntil || (s.sd && t < s.stunUntil)) return false;
      if (!fromHisCourt(s, t)) return false;
      const dmg = Math.round(d);
      if (!(dmg >= 1)) return false;
      if (watching()) return false;
      hurtAt = t;
      return !!send({ q: blowQ('b'), d: dmg, r });
    },
    struck() { hurtAt = now(); },
    crystalTargets() {
      const s = link.state();
      return !s || s.day === null || s.fell || s.wrath != null ? NONE : _targets;
    },
    crystalHit({ c, d, r } = /** @type {any} */ ({})) {
      const s = link.state(), t = now();
      if (!s || s.day === null || s.fell || s.wrath != null || !rk || rk.ended || !Object.values(HIT_KINDS).includes(r)) return false;
      if (!Number.isInteger(c) || c < 0 || c >= rk.n || rk.brokeAt[c] !== null) return false;
      if ((rk.landAt !== null && t >= rk.landAt - RECKON_CLOSE_MS) || !fromHisCourt(s, t)) return false;
      const dmg = Math.round(d);
      if (!(dmg >= 1)) return false;
      if (watching()) return false;
      rk.flashAt[c] = t;
      sound(BOSS_CUES.crystalHit, s, t, null, rk.feet[c]);
      return !!sendCrystal({ c, q: blowQ(`x${c}`), d: dmg, r });
    },
    /**
     * A recast while the trap runs extends its rounds and keeps the first chance, as classic Soul Trap does, rather
     * than stacking.
     * @param {{ chance?: number, rounds?: number }} [trap]
     */
    trapped({ chance, rounds } = {}) {
      const s = link.state(), t = now();
      if (!s || s.day === null || s.fell || s.wrath != null || !Number.isFinite(chance) || !(rounds > 0)) return false;
      if (trapMark && t < trapMark.until) trapMark.until = Math.max(trapMark.until, t + rounds * COURT_ROUND_MS);
      else trapMark = { chance, until: t + rounds * COURT_ROUND_MS, day: s.day };
      return true;
    },
    hostTargets() {
      const s = link.state(), t = now();
      if (!s || s.day === null || s.fell || s.wrath != null) return NONE;
      if (!s.lg && !s.sd) return NONE;
      const k = myFloor();
      _hostMine.length = 0;
      if (s.sd) for (const T of flame.targets()) _hostMine.push(T);
      if (k >= 0 && s.lg) for (const T of host.targets()) if (nearestCourt(T.feet[0] - COURT_CENTRE[0], T.feet[2] - COURT_CENTRE[2]) === k) _hostMine.push(T);
      return _hostMine;
    },
    hostHit({ i, d, r } = /** @type {any} */ ({})) {
      const s = link.state(), t = now();
      if (i === FLAME_I) return !!s && s.day !== null && flame.hit(s, { d, r }, t);
      if (!s || s.day === null || s.fell || s.wrath != null || !s.lg || !Object.values(HIT_KINDS).includes(r) || !fromItsFloor(s, i, t)) return false;
      return host.hit({ i, d, r }, t);
    },
    trapNow() { const t = now(); return trapMark && t < trapMark.until ? { chance: trapMark.chance } : null; },
    batches() {
      _batches.length = 0;
      if (batch && batchShown) _batches.push(batch);
      if (corpse) _batches.push(corpse);
      for (const b of host.batches()) _batches.push(b);
      for (const b of flame.batches()) _batches.push(b);
      for (const b of captive.batches()) _batches.push(b);
      for (const b of spoils?.batches() ?? NONE) _batches.push(b);
      return _batches;
    },
    lights() {
      const s = link.state(), t = now(); const g = s && s.day !== null ? bossGlow(s, t, _glow) : null;
      _lights.length = 0;
      if (g) _lights.push(g);
      if (s && s.day !== null) {
        const [hx, hz] = bossPlace(s, t);
        if (t >= fallFlashAt && t - fallFlashAt < FALL_FLASH_MS) _lights.push(flash(_fallLight, courtToDungeon(hx, FALL_FLASH_Y, hz), WHITE, FALL_FLASH_K * (1 - (t - fallFlashAt) / FALL_FLASH_MS), FALL_FLASH_RANGE));
        const atk = s.atk;
        if (atk && atk.a === ATTACKS.wrath.id) {
          const C = COURTS[nearestCourt(hx, hz)], w = windupOf(ATTACKS.wrath, s.phase), k = (t - (atk.at - w)) / w, at = courtToDungeon(C[0], WRATH_LIGHT_Y, C[1]);
          if (k >= 0 && k < 1) _lights.push(flash(_wrathLight, at, WRATH_RED, 3 * k * k, WRATH_LIGHT_RANGE));
          else if (k >= 1 && t - atk.at < FALL_FLASH_MS) _lights.push(flash(_wrathLight, at, WHITE, 5 * (1 - (t - atk.at) / FALL_FLASH_MS), WRATH_LIGHT_RANGE));
        }
      }
      for (let k = 0; k < _crystalDraw.length; k++) {
        const d = _crystalDraw[k];
        if (!(d.broke < 0) || !(d.grow > 0.05)) continue;
        const L = (_crystalLights[k] ??= { x: 0, y: 0, z: 0, range: CRYSTAL_LIGHT_RANGE, color: [0, 0, 0] });
        const kk = d.grow * (0.55 + 0.45 * d.hp) * (1.1 + 0.25 * Math.sin(t / 240 + d.seed * 6) + 0.8 * d.flash);
        L.x = d.at[0]; L.y = d.at[1] + CRYSTAL_LIGHT_Y; L.z = d.at[2];
        L.color[0] = d.color[0] * kk; L.color[1] = d.color[1] * kk; L.color[2] = d.color[2] * kk;
        _lights.push(L);
      }
      for (let k = 0; k < _bursts.length; k++) {
        const b = _bursts[k], L0 = b.kind?.light, age = t - b.at0;
        if (!L0 || !(age >= 0) || age >= FX_LIGHT_MS) continue;
        // `carried` keeps this flash out of the shadow pass caster slots.
        const L = (b.light ??= { x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0], carried: true }), kk = L0[0] * (1 - age / FX_LIGHT_MS);
        L.x = b.at[0]; L.y = b.at[1] + LANDING_LIGHT_Y; L.z = b.at[2]; L.range = L0[1];
        L.color[0] = b.color[0] * kk; L.color[1] = b.color[1] * kk; L.color[2] = b.color[2] * kk;
        _lights.push(L);
      }
      for (const l of host.lights()) _lights.push(l);
      if (s && s.day !== null) for (const l of flame.lights(s, t)) _lights.push(l);
      for (const l of captive.lights()) _lights.push(l);
      for (const l of spoils?.lights() ?? NONE) _lights.push(l);
      return _lights;
    },
    drawPass(proj, view, eye, seconds, fog = null) {
      let drew = false;
      // Crystals draw first because they are opaque and write depth, so the ground glow sorts behind them.
      if (_crystalDraw.length) {
        const crystalPass = crystalPassOf(true);
        if (crystalPass) { crystalPass.draw(_crystalDraw, proj, view, eye, seconds, fog); drew = drew || crystalPass.drawn > 0; }
      }
      const pass = telegraphPass(!!(mark || shape || poolDraw.length));
      if (pass) {
        for (const ps of poolDraw) { pass.draw(ps, proj, view, eye, seconds, fog, COURT_CENTRE, _walked, _floors); drew = true; }
        if (mark) { pass.draw(mark, proj, view, eye, seconds, fog); drew = true; }
        if (shape) { pass.draw(shape, proj, view, eye, seconds, fog, COURT_CENTRE, _walked, _floors); drew = true; }
        for (const hs of host.shapes()) { pass.draw(hs, proj, view, eye, seconds, fog, COURT_CENTRE, _walked, _floors); drew = true; }
        for (const fs of flame.shapes()) { pass.draw(fs, proj, view, eye, seconds, fog, COURT_CENTRE, _walked, _floors); drew = true; }
        for (const cs of captive.shapes()) { pass.draw(cs, proj, view, eye, seconds, fog, COURT_CENTRE, _walked, _floors); drew = true; }
      }
      if (_fxLive.length || meteorNow) {
        const fxPass = fxPassOf(true);
        if (fxPass) { fxPass.draw(_fxLive, meteorNow, proj, view, eye, seconds, fog); drew = drew || fxPass.bursts > 0 || fxPass.meteors > 0; }
      }
      _fires.length = 0;
      if (portal) {
        _portalFire.origin = portal.origin; _portalFire.fade = portal.fade; _portalFire.spin = spin;
        _fires.push(_portalFire);
      }
      if (wayIn > 0) { _wayIn.fade = wayIn; _wayIn.spin = spin; _fires.push(_wayIn); }
      const fire = _fires.length ? portalPass(true) : null;
      if (fire) {
        fire.draw(_fires, proj, view, eye, seconds, fog);
        drew = drew || fire.drawn > 0;
      }
      const lit = !!spoils?.drawPass(proj, view, eye, seconds, fog);
      return drew || lit;
    },
    state: () => ({
      day, judgedI: judged.i, cuedI: cued.i, landedI: landed.i, phaseHeard, fellCued, wrathLanded, body: !!body?.tex, batch: !!batch && batchShown, shape, mark, pools: pools.map((p) => ({ ...p })), portal: portal ? { at: [...portal.at], rise: portal.rise, fade: portal.fade, laid: portalLaid } : null,
      wayIn,
      crystals: rk ? { i: rk.i, n: rk.n, ended: rk.ended, brokeAt: [...rk.brokeAt], hp: [...rk.hp], grewAt: rk.grewAt } : null, drawn: _crystalDraw.map((d) => ({ ...d })), inFire, biteAt,
      bursts: _fxLive.map((b) => ({ at: [...b.at], t: b.t, kind: b.kind, color: b.color })), meteor: meteorNow ? { at: [...meteorNow.at] } : null,
      host: host.state(),
      flame: flame.state(),
      marksAt,
      beat: beat ? { ...beat } : null, corpse: !!corpse,
    }),
    portal: () => (portal ? { at: [...portal.at], rise: portal.rise } : null),
    drawBodies(canvas, proj, view, eye, dt) {
      bodiesLane.frame();
      const s = link.state();
      if (s && s.day !== null && body?.tex) {
        const look = creatureLook({ mobileType: bossLookOf(s.boss).mobile });
        const shown = batch && batchShown ? batch : (s.fell && corpse ? corpse : null);
        if (shown && look) {
          const t = now(), act = bossAct(s, t, hurtAt);
          bodiesLane.offer(rosterActor(bossRec, { id: 'boss', look, feet: shown.origin, yaw: s.yaw, moving: act.act === 'walk' || act.act === 'run', running: act.act === 'run',
            swingKey: s.fell ? null : (s.atk?.at ?? null), hitKey: s.fell ? null : Math.max(hurtAt, courtFlashAt), dead: s.fell ? 2 : 0,
            scale: (body.scale ?? 1) * (profileOf(s).size ?? 1) }), shown, null, shown.hitFlash || 0);
        }
        host.offerBodies(bodiesLane);
        flame.offerBodies(bodiesLane, s, now());
      }
      bodiesLane.draw(canvas, proj, view, eye, dt);
    },
    wayIn: () => wayIn,
    /**
     * @param {Iterable<{id: string, name?: string}>} list
     * @param {(d: any) => (number[]|null)} at
     */
    stepsIn(list, at) {
      _places.clear(); _names.clear(); _others.length = 0;
      if (arrivedAt === null) return;
      const t = now();
      _peersNow.clear();
      for (const d of list) {
        if (!d) continue;
        _peersNow.add(d.id);
        { const q = at(d); if (q && typeof d.id === 'string') { const c = [q[0] - COURT_CENTRE[0], q[2] - COURT_CENTRE[2]]; _places.set(d.id, c); _others.push(c); if (d.name) _names.set(d.id, d.name); } }
        if (!peersPrimed || _peersWere.has(d.id)) continue;
        const p = at(d);
        if (p && Math.hypot(p[0] - ARRIVAL[0], p[2] - ARRIVAL[2]) <= WAY_IN_NEAR_M) wayInHeld = Math.max(wayInHeld, t + WAY_IN_HOLD_MS);
      }
      [_peersWere, _peersNow] = [_peersNow, _peersWere];
      peersPrimed = true;
    },
    // No seat is asked for after the fall or the Wrath, because the relay casts the watcher out instead of seating
    // them.
    askAgain() {
      const t = now();
      if (!watching()) { watchAskedAt = -Infinity; return false; }
      const st = link.state();
      if (st.fell || st.wrath != null) return false;
      if (watchAskedAt === -Infinity) { watchAskedAt = t; return false; }
      if (t - watchAskedAt < COURT_WATCH_ASK_MS) return false;
      watchAskedAt = t;
      return true;
    },
    silent() {
      if (arrivedAt === null || wordAt === null || frameAt === null) return false;
      const s = link.state();
      if (s && s.day !== null && (s.fell || s.wrath != null)) return false;
      return frameAt - wordAt > COURT_SILENT_MS;
    },
    leave() {
      bodiesLane.destroy();
      if (healOwed.size) sendOwed(now());
      spoils?.gather();
      if (batch) { renderer?.destroyBillboardBatch?.(batch); batch = null; batchShown = false; }
      drawGateBossBar(null);
      drawGateMarksCard(null);
      drawGateDamageChart(null);
      drawGateGround(null);
      drawGateTitleCard(null);
      host.leave();
      flame.leave();
      captive.leave();
      sprites.clear();
      peersHeard(false);
      reset(null);
    },
  };
}
