// @ts-check

import { createEgLink, egMemberOf, egRunOfMember, egCountAt } from '../../net/eliteGates/egLink.js';
import { egKeyRefusal } from './egArch.js';
import { egCallPromptModel, soundEgHorn, EG_CALL_KEYS } from './egCall.js';
import { importPublicKeyB64, ORDER_TTL_S } from '../../net/identityToken.js';
import { egHallOf, egCircleOfHall, egSlotOfHall, egSlotAt, egLocalX, egAtDoor, egPhase, egTimes, egCountText, egBandOfCircle, EG_TEXT, EG_CAST_BACK_LOSS, EG_CAST_BACK_FLOOR, EG_BAND_LORDS, EG_VALKYNAZ } from '../../net/eliteGates/egLaw.js';
import { egOnFight, egSpecGive, egSpecDigest, egSpecForget, EG_SPEC } from '../../net/eliteGates/egLaw.js';
import { EG_TOLL_STEP } from '../../net/eliteGates/egLaw.js';
import { readEgReceipt } from '../../net/eliteGates/egReceipt.js';
import { EG_VOID_MAX_S } from '../../net/eliteGates/egDurable.js';
import { egRcId } from '../../net/eliteGates/egDurable.js';
import { dungeonToRealm } from '../../net/sdBrain.js';
import { egToDungeon } from '../../world/eliteGates/egHall.js';
import { restackWeirKeys, setWeirKeyOpener, weirKeysHeld } from './weirKey.js';
import { egHudModel, drawEgHud, egPanelModel, drawEgPanel, egRecapModel, EG_POTIONS_PER_HALL } from '../../ui/eliteGates/egHud.js';
import { EG_CANTRIPS } from '../../net/eliteGates/egRun.js';
import { egVOf } from '../../net/eliteGates/egVestige.js';
import { egResonance, EG_WALL_X } from '../../net/eliteGates/egVestige.js';
import { EG_SPIREBRIDGE_ID } from '../../net/eliteGates/egVestige.js';
import { egBridgeAhead } from '../../net/eliteGates/egSpanLaw.js';
import { fillVitalSigns, maxFatigue } from '../../characters/statMods.js';
import { createPortalSet } from '../../travel/portalFx.js';
import { EG_ROLE } from '../../net/eliteGates/egBodies.js';
import { EG_OBJ } from '../../net/eliteGates/egLords.js';
import { EG_ANNALS } from '../../net/eliteGates/egAnnals.js';
import { EG_ENGINES, EG_ENGINE_REACH_M } from '../../net/eliteGates/egFragLaw.js';
import { EG_STONE_REACH_M } from './spireOrrery.js';
import { SD_HALL_TEXT } from '../../worldEvents/sdHall.js';
import { egClockNew, egClockDue, egClockHeard, egClockOffset, egClockHalfRtt } from '../../net/eliteGates/egClock.js';
import { bodySayer } from '../../net/bossBody.js';
import { egRideOf, egRideAt } from '../../net/eliteGates/egFair.js';
import { EG_SWAP_WAIT_MS } from './egSwap.js';
import { egSpireHudModel, drawEgSpireHud, egArrivalCard, egArrivalLive, egArrivalShown, drawEgArrivalCard, egFormFactor, egGainText, egPressInForce, egChipWarnings, egDoorMarker, egPadUp, egPadAct, egPadPrompts, EG_PAD_DIRS, EG_GAIN_MS, EG_CHIP_WARNINGS } from '../../ui/eliteGates/egSpireHud.js';
import { egBeatMemo, egBeatWatch, egBeatPlan, egFirstDue, egRehearsalDue, egFirstRead, egFirstWrite, egBuzz, egBeatUnder, egPerilsNew, egRuneChime, EG_PRES_TEXT, EG_BEAT_SOUNDS } from '../../ui/eliteGates/egBeats.js';
import { egAbsentStep, egPartyRows, egPartyDeco, egRoadOf, EG_NUMERALS } from '../../ui/eliteGates/egParty.js';
import { egAccessNow, egAllyLookSet } from '../../ui/eliteGates/egAccess.js';
import { egRecapKeep, egAskText } from '../../ui/eliteGates/egHud.js';
import { EG_LORDS, EG_LAST_WORD_MS } from '../../net/eliteGates/egLaw.js';
import { isEnhanced } from '../../ui/uiSkin.js';
import { isTouchDevice } from '../../ui/touchDevice.js';
import { getPref } from '../../ui/uiPrefs.js';
import { noteAct } from '../questlines/qlActs.js';
import { egValkRedoubt } from '../../net/eliteGates/egPay.js';
import { createEgLookDraw } from './egLookDraw.js';
import { egQuietCompany } from '../../world/eliteGates/egLook.js';
import { egRibbonPush, egTrailSegs, EG_TRAIL } from '../../world/eliteGates/egLook.js';
import { CONCEAL_MODE } from '../../combat/combatVisuals.js';
import { egStairStep, egSpireLights, egDoorCompass, egWitnessTwist, EG_LIGHTS_TEXT } from '../../world/eliteGates/egLights.js';
import { egReducedMotion } from '../../ui/eliteGates/egAccess.js';
import { egStartHall, egFirstHallOf } from '../../net/eliteGates/egLaw.js';
import { egFallModel, drawEgFall, EG_FALL_MS, EG_FALL_TEXT } from '../../ui/eliteGates/egSpireHud.js';
import { EG_DOWN_MS } from '../../net/eliteGates/egBrain.js';
import { egPingWait } from '../../ui/eliteGates/egSpireHud.js';
import { egSupportAt, EG_HOLD } from '../../net/eliteGates/egFair.js';
import { egFightFloorAt } from '../../net/eliteGates/egFair.js';
import { anchoredClock } from '../../render/deadlands.js';
import { createSpireMix } from './egMix.js';
import { damageChartModel, drawGateDamageChart, DAMAGE_CHART_DELAY_MS, DAMAGE_CHART_MS } from '../../ui/gateDamageChart.js';
import { egChartFell, egBoardLine, egRecapBoardKeep } from '../../ui/eliteGates/egHud.js';
import { egFirstOver } from '../../ui/eliteGates/egBeats.js';
import { GATE_HEAL_ROWS_MAX, GATE_HEAL_WIRE_MAX } from '../../net/wire.js';
import { createEgReverb } from './egReverb.js';
import { createEgAir } from './egAir.js';
import { egFragArena } from '../../world/eliteGates/egHall.js';
import { setSpireCamera } from '../../player/mwView.js';
import { setTouchSpire } from '../../ui/touch.js';
import { OnlineSession, TOKEN_WAIT_MS } from '../../net/online.js';
import { foldEg, EG_STATE_EMPTY } from '../../net/eliteGates/egLink.js';
import { egRoomKey } from '../../net/eliteGates/egLaw.js';
import { egShaftLedgeAt } from '../../world/eliteGates/egHall.js';
import { setSpireShaft } from '../../player/mwView.js';
import { EG_LIFELINE_UNDER, EG_LIFELINE_LOOK_MS } from '../../net/eliteGates/egBrain.js';
import { egLifelineMin } from '../../net/eliteGates/egBrain.js';
import { egCastBackCost } from '../../net/eliteGates/egBrain.js';
import { spireHolderStep } from './spireVestiges.js';
import { spireRallyingCry } from './spireVestiges.js';
import { spireBodyMax } from '../../characters/renownLayer.js';
import { healMine } from '../../player/playerHeal.js';
import { spireVestigeNews, spireWeaveReady } from './spireVestiges.js';
import { egHolderNow, egHolderWatch, egHolderMemo } from '../../ui/eliteGates/egBeats.js';
import { CAMERA_OBSTACLE_LIMIT, MW_UNITS_PER_METER } from '../../player/mwCamera.js';
import { EG_CRUMBLE_KINDS } from '../../net/eliteGates/egSpanLaw.js';
import { t } from '../../ui/textManager.js';
import { REFUSALS, accountRefusalText } from '../../net/accountClient.js';
import { EG_PING_MS } from '../../net/eliteGates/egBrain.js';
import { egFirstKey } from '../../ui/eliteGates/egBeats.js';
import { loadEgHeroFragMeshes, egHeroFragIdsOf } from '../../world/eliteGates/egHeroFragModel.js';
import { egCircleSpecs } from '../../net/eliteGates/egLaw.js';

export const EG_CLAIMS_KEY = 'eg.claims';
export const EG_CLAIMS_MAX = 16;
export const EG_CLAIM_RETRY_MS = 60_000;
// `EG_VOID_WAIT_MS` must outlast the hub's own open retries (`EG_OPEN_HUB_TRIES` at `ROOM_CALL_MS`). Stakes older
// than `EG_VOID_MAX_S` are dropped because the room refuses older voids.
export const EG_STAKES_KEY = 'eg.stakes';
export const EG_STAKES_MAX = 4;
export const EG_VOID_WAIT_MS = 60_000;
export const EG_VOID_ASK_MS = 60_000;
export const EG_STAKE_LOOK_MS = 5000;
// An open is saved here before it is sent, so a lost answer is retried with the same request id and never takes a
// second key. A `none` answer within `EG_OPEN_SURE_S` is not trusted.
export const EG_OPENS_KEY = 'eg.opens';
export const EG_OPENS_MAX = 4;
export const EG_OPEN_AGAIN_MS = 30_000;
export const EG_OPEN_SURE_S = 120;
export const EG_OPEN_LOST = Object.freeze(['offline', 'server']);
// A receipt the hub hands again after it was counted is never claimed again; only its `claimed` is resent so the
// hub drops its copy.
export const EG_COUNTED_KEY = 'eg.counted';
export const EG_COUNTED_MAX = 64;
export const EG_VOID_TEXT = 'The Spire did not open. Your key is returned.';
// An admit order expires `ORDER_TTL_S` after signing, so one older than half that is fetched again before it goes
// to the room.
export const EG_ADMIT_FRESH_MS = (ORDER_TTL_S / 2) * 1000;
export const EG_ADMIT_ASKS = 3;
export const EG_DOWN_EVERY_MS = 1000;
export const EG_END_WALK_MS = 4000;
export const EG_KEYS_EVERY_MS = 10 * 60_000;
export const EG_OPEN_RETRY_MS = 2500;
export const EG_OPEN_TRIES = 4;
export const EG_COUNT_FELL_TEXT = 'The Spire counts you fallen.';
export const EG_HOME_CONFIRM_MS = 6000;
export const EG_HEAL_SEND_MS = 1000;
const EG_RECAPS_BOARDS = 8;
export const EG_POTIONS_KEY = 'eg.potions';
export const EG_LOG_KEY = 'eg.log';
export const EG_LOG_MAX = 200;
export const EG_SPEC_ASK_MS = 3000;
export const EG_LAW_TEXT = 'The Spire sends you this breach\'s halls.';
export const EG_BACK_KEY = 'eg.back';
export const EG_BACK_WRITE_MS = 1000;
export const EG_BACK_TEXT = Object.freeze({
  offer: 'Your breach still stands. Return to the Spire from the prompt.',
  prompt: 'Your breach still stands - return to the Spire',
  button: 'Return',
  back: 'You return to the Spire.',
  silent: 'The Spire does not answer. Try the return again.',
  spire: 'The Spire',
});
// The wait covers the listener's token wait (`TOKEN_WAIT_MS`), after which its hello is refused, plus four seconds
// for the socket, the hello, and the answer.
export const EG_BACK_SEED_WAIT_MS = TOKEN_WAIT_MS + 4000;
// Matches the breach room's refusals from `EG_NO_WORDS` in net/wire.js; keep the two in sync.
const roomRefused = (w) => typeof w === 'string' && /breach|order|fallen|home|company/i.test(w);
const sentenceOf = (w) => `${w.charAt(0).toUpperCase()}${w.slice(1).replace(/\.$/, '')}.`;
/**
 * The listener closes as soon as it answers, before the main session says hello, because the relay keeps one socket
 * per account in a breach room.
 * @param {{ main: any, b: string, at: number, Session?: any, waitMs?: number }} o
 */
export function egSeedListen({ main, b, at, Session = OnlineSession, waitMs = EG_BACK_SEED_WAIT_MS }) {
  const room = egRoomKey(b);
  let st = null, done = false;
  const link = new Session({ url: main.url, id: main.id, secret: main.secret, name: main.name, look: main.look, mintToken: main.mintToken, presence: false });
  link.onEg = (w, r) => { if (r === room && w?.k === 'st' && w.b === b) st ??= foldEg(EG_STATE_EMPTY, w, at); };
  link.join(room, null);
  const close = () => { if (done) return; done = true; link.onEg = null; link.leave(); };
  return {
    frame(nowMs) {
      if (done) return null;
      link.tick();
      const a = st ? { st } : link.terminal ? { no: String(link.error ?? '') } : nowMs - at >= waitMs ? { silent: true } : null;
      if (a) close();
      return a;
    },
    close,
  };
}
// Re-anchoring only past this threshold keeps small jitter in the median offset from stepping the platforms.
export const EG_SPAN_REANCHOR_MS = 5;
export function egBackOf(v) {
  let r = v;
  if (typeof v === 'string') { try { r = JSON.parse(v); } catch { return null; } }
  if (!r || typeof r !== 'object' || typeof r.b !== 'string' || !/^[0-9a-f]{16}$/.test(r.b) || r.x === 1) return null;
  const n = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : 0);
  const li = Array.isArray(r.li) && r.li.length === 4 && Number.isSafeInteger(r.li[0]) && r.li[0] > 0 && r.li.slice(1).every(Number.isFinite) ? r.li.slice(0, 4) : null;
  return { b: r.b, seed: n(r.seed) >>> 0, op: Number.isFinite(r.op) ? r.op : 0, geo: n(r.geo), ew: n(r.ew), rh: r.rh === 1 ? 1 : 0, h: n(r.h), in: r.in === 1 ? 1 : 0, li, wf: n(r.wf) };
}
export function egRestVitals(entity, p) {
  if (!entity || !(p > 0)) return;
  if (entity.maxMagicka > 0) entity.magicka = Math.min(entity.maxMagicka, (entity.magicka ?? 0) + Math.round(p * entity.maxMagicka));
  const fm = maxFatigue(entity);
  if (fm > 0) entity.fatigue = Math.min(fm, (entity.fatigue ?? 0) + Math.round(p * fm));
}
export const EG_END_TEXT = Object.freeze({
  fall: EG_TEXT.fallen, home: 'You walk home. The Redoubts you took are kept.', tear: EG_TEXT.torn,
  wipe: 'The company has fallen. The breach closes.', last: EG_PRES_TEXT.lastWord,
  empty: 'Nobody answered the call. The breach closes.', gone: 'Nobody stayed. The breach closes.',
  rehearsal: EG_TEXT.rehearsalDone, void: 'The breach failed to hold. Your key is returned.', forsake: 'You forsake the breach.',
  seal: 'The way down is sealed. The halls are yours.',
});
// One shared empty list, so the host's memo of the clearing set sees no change.
const NO_CLEARS = Object.freeze([]);
export const EG_START_ASKING_TEXT = 'The start window is already open.';
export const egBreachUsage = () => t('eg.cmd.inside', 'In the breach: /breach pick N, vote yes|no|N, respite [no], cant N, tonic, buy cant|tonic|shard, surplus [reroll], use, bridge, annals [N], ping [danger|mine|cache], watch, bequest N, forsake, home, board.');
export const egBreachUsageOut = () => t('eg.cmd.outside', 'Outside the breach, /breach answers your company’s call or opens the start window. Also: /breach rehearse, /breach board, /breach annals [N].');
const NO_CHOICE_TEXT = 'No choice is open.';
const YES_NO_ASKS = Object.freeze(['ready', 'respite', 'bargain']);
export const EG_PAD_SHOULDERS = Object.freeze({ JoystickButton4: -1, JoystickButton5: 1 });
export const egRespiteHow = () => t('eg.vote.respiteHow', 'Answer a respite with R or /breach respite.');
export const egRespiteNone = () => t('eg.vote.respiteNone', 'Nobody has asked for a respite.');
const NO_CALL_TEXT = 'No breach is calling you. A Weir Key opens one, and /breach rehearse opens the day\'s Rehearsal.';
export const EG_TONIC_TEXT = Object.freeze({ none: 'You hold no Spire Tonic.', fallen: 'The fallen drink nothing.' });
const OBJ_NAME = Object.freeze(Object.fromEntries(Object.entries(EG_OBJ).map(([k, v]) => [v, k])));
export const EG_GOT_TEXT = Object.freeze({ shard: 'You take a Vestige shard.', tonic: 'You take a Spire Tonic.', cant: 'You take a Cantrip.', lumen: 'You take 10 lumen.', rel: 'A Reliquary is sealed for you.', longstep: 'Long Step: crumbling ground holds half a second longer this span.' });
export const EG_FAIR_TEXT = Object.freeze({
  blind: () => t('eg.fair.blind', 'The Spire lost sight of part of your crossing. Stay at the door, and it opens once the Spire sees you there.'),
  speed: () => t('eg.fair.speed', 'You crossed faster than the Spire allows. Go back to the last island you stood on and cross again.'),
  air: () => t('eg.fair.air', 'You stayed in the air longer than the Spire allows. Go back to the last island you stood on and cross again.'),
  void: () => t('eg.fair.void', 'You fell into the void. Go back to the last island you stood on and cross again.'),
});
const KIND_GLYPH = Object.freeze({ yard: 'Y', span: 'S', proving: 'P', rampart: 'R', court: 'C', athenaeum: 'A', deepway: 'D', brink: 'B', scriptorium: 's' });
export const EG_PUSH_MPS = 3;
export const EG_PUSH_DT_MAX = 0.1;
export const EG_PUSH_MAX_M = 8;
export const EG_RING_PAD = 0.3;
export const EG_BEACON_SPEW_UP = 2.2;
export const EG_BEACON_RIM_M = 1.5;
export const EG_LONG_STEP_LOOK = 10;
export const EG_WITNESS_BACK = 4;
export const EG_WITNESS_UP = 1.5;
export const EG_WITNESS_DAMP_S = 0.35;
export const EG_WITNESS_SNAP_M = 8;
/**
 * @param {number[]} p
 * @param {number} yaw
 */
export const egWitnessOrbit = (p, yaw) => [p[0] - Math.sin(yaw) * EG_WITNESS_BACK, p[1] + EG_WITNESS_UP + 1.6, p[2] - Math.cos(yaw) * EG_WITNESS_BACK];
/**
 * `cast` returns the distance traveled by the sphere center, so no radius is subtracted from the hit.
 * @param {number[]} p
 * @param {number[]} e
 * @param {((o: number[], r: number, d: number[], m: number) => (number|null)) | null} [cast]
 */
export function egWitnessClear(p, e, cast = null) {
  const dx = e[0] - p[0], dy = e[1] - p[1], dz = e[2] - p[2], len = Math.hypot(dx, dy, dz);
  if (typeof cast !== 'function' || !(len > 1e-6)) return [e[0], e[1], e[2]];
  const hit = cast([p[0], p[1], p[2]], CAMERA_OBSTACLE_LIMIT / MW_UNITS_PER_METER, [dx / len, dy / len, dz / len], len);
  const k = Number.isFinite(hit) && hit < len ? Math.max(0, hit) / len : 1;
  return [p[0] + dx * k, p[1] + dy * k, p[2] + dz * k];
}
/**
 * Uses the Pade approximation from Unity's `SmoothDamp` for the critically damped spring.
 * @param {{ p: number[], v: number[], who: string } | null} cur
 * @param {number[]} want
 * @param {number} dt
 * @param {string} who
 */
export function egWitnessDamp(cur, want, dt, who) {
  const e = cur ?? { p: [want[0], want[1], want[2]], v: [0, 0, 0], who };
  e.who = who;
  if (!cur || !(dt > 0) || Math.hypot(want[0] - e.p[0], want[1] - e.p[1], want[2] - e.p[2]) > EG_WITNESS_SNAP_M) {
    for (let a = 0; a < 3; a++) { e.p[a] = want[a]; e.v[a] = 0; }
    return e;
  }
  const w = 2 / EG_WITNESS_DAMP_S, x = w * dt, f = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  for (let a = 0; a < 3; a++) {
    const ch = e.p[a] - want[a], tmp = (e.v[a] + w * ch) * dt;
    e.v[a] = (e.v[a] - w * tmp) * f;
    e.p[a] = want[a] + (ch + tmp) * f;
  }
  return e;
}
const REFUSED = Object.freeze({
  short: EG_TEXT.noKeys, guest: EG_TEXT.guest, 'no-session': EG_TEXT.guest, live: EG_TEXT.held, offline: EG_TEXT.shut, server: EG_TEXT.shut,
  'no-signing-key': EG_TEXT.shut,
});
export const egRefusalText = (error) => REFUSED[error] ?? (typeof error === 'string' && Object.hasOwn(REFUSALS, error) ? accountRefusalText(error) : EG_TEXT.shut);

/** @param {{ ok: boolean, data?: any, error?: string }} a */
export function egClaimDone(a) {
  if (a?.ok) return true;
  return a?.error === 'receipt' || a?.error === 'not-yours';
}

/**
 * @param {any} a
 * @param {any} c
 */
function redoubtActs(a, c) {
  if (!a?.ok || !a.data?.recorded || a.data.q !== 'w' || c?.rh === 1) return;
  noteAct('redoubt-taken');
  if (egValkRedoubt(c.w)) noteAct('valkynaz-felled');
}

// The id must match `EG_RQ_RE` in the account server's `eg.js`.
function requestId() {
  const b = new Uint8Array(12);
  try { globalThis.crypto.getRandomValues(b); } catch { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); }
  return [...b].map((v) => v.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

/**
 * Skips the caller's own Lifeline because the census never counts a heal a member gives themselves.
 * @param {any} E
 * @param {string|null} me
 * @param {Array<string|null>} subs
 */
export function egLifelineOf(E, me, subs) {
  let v = 0;
  for (const s of subs) if (s !== me) v = Math.max(v, egVOf(egRunOfMember(E, s).vs, 'lifeline'));
  return v;
}

/**
 * @param {any} E
 * @param {string|null} me
 * @param {string|null} sub
 */
export const egMenderOf = (E, me, sub) => (sub && sub !== me ? egVOf(egRunOfMember(E, sub).vs, 'mender') : 0);

/** @param {{ modes: () => any, online: () => any, hub: () => any, account: any, now: () => number, entity: any, player: any, cam: any, say: (text: string) => void, mid?: (text: string) => void, veil?: () => any, site: () => any, wire: () => any, landAt: (l: any) => boolean, hurt: (n: number) => void, store?: any, saved?: () => void, hudHidden?: () => boolean, fight?: (link: any) => any, renderer?: any, audio?: any, peers?: () => { sub: string, pos: number[] }[], heal?: ((p: number, why: string) => void) | null, paid?: ((c: any, data: any) => void) | null, win?: any, redoubt?: ((rd: number) => void) | null, board?: (() => any) | null, keyFacts?: (() => any) | null, startWindow?: ((o: any) => any) | null, party?: () => { sub: string, name: string, h?: number, hm?: number }[], questDue?: () => boolean, callPortal?: any, arches?: any, prompt?: any, windowUp?: () => boolean, feet?: () => (number[]|null), probes?: () => any, Session?: any, accountOf?: (peer: string) => (string|null) }} deps */
export function createEgClient({ modes, online, hub, account, now: hostNow, entity, player, cam, say, mid = () => {}, veil = () => null, site, wire, landAt, hurt,
  store = null, saved = () => {}, hudHidden = () => false, fight: makeFight = () => null, renderer = null, audio = null, peers = () => [], heal = null, paid = null, win = globalThis.window, redoubt = null, board = null,
  keyFacts = null, startWindow = null, party = () => [], questDue = () => false, callPortal = null, arches = null, prompt = null, windowUp = () => false,
  feet = () => null, probes = () => ({}), Session = OnlineSession, accountOf = () => null }) {
  const clock = egClockNew();
  const now = () => { const off = egClockOffset(clock); return off == null ? hostNow() : Date.now() + off; };
  const sayBody = bodySayer((v) => !!online()?.sendEg?.('vt', { v }));
  const link = createEgLink({ now, say, onReceipt: (r) => claimAdd(r), onRefused: (w) => refused(w) });
  let fight = null;
  let opening = null;
  let admit = null, inFor = -1, admitAsking = false;
  const admitAsks = { b: '', n: 0 };
  const admitAsked = (b) => (admitAsks.b === b ? admitAsks.n : 0);
  const admitFresh = (b) => admit?.b === b && !!admit.z && Date.now() - admit.at < EG_ADMIT_FRESH_MS;
  let answering = false, swapping = false, leaving = false;
  let swapWaitAt = 0;
  let downAt = -Infinity, downH = 0, placedH = 0, endSeen = null, endAt = 0, homeAskAt = -Infinity;
  let unfair = { h: 0, w: '' };
  let keysAt = -Infinity, claimAt = -Infinity, rdSeen = 0, callSaid = '';
  let door = null, doorH = 0, portal = null;
  let witness = null, potions = EG_POTIONS_PER_HALL, potionHall = '', recap = null, recapUntil = 0, forsakeAskAt = -Infinity, logH = 0;
  const annals = new Set();
  let annalsKept = 0;
  const log = [];
  let logB = '', logFalls = /** @type {Record<string, number>} */ ({});
  const voted = {};
  try { const v = JSON.parse(store?.getItem?.(EG_POTIONS_KEY) ?? 'null'); if (v && typeof v.k === 'string' && Number.isSafeInteger(v.n) && v.n >= 0 && v.n <= EG_POTIONS_PER_HALL) { potionHall = v.k; potions = v.n; } } catch { }
  const potionsKeep = () => { try { store?.setItem?.(EG_POTIONS_KEY, JSON.stringify({ k: potionHall, n: potions })); } catch { } };
  let pingAt = -Infinity;
  const me = () => account?.me?.() ?? null;
  let portalSet = null;
  const portals = () => (portalSet ??= renderer?.createBillboardBatch ? createPortalSet({ renderer, audio }) : null);
  const inSpire = () => modes()?.egHallBreach?.() != null;
  const enterHall = async (r) => {
    try { await loadEgHeroFragMeshes(egHeroFragIdsOf(egCircleSpecs(r.seed, r.c, r.geo ?? 0))); } catch (e) { console.warn('[eg] the hall meshes would not load', e?.message ?? e); return false; }
    return modes()?.enterEgHall?.(r);
  };
  egAllyLookSet(() => { if (!inSpire()) return null; const q = egQuietCompany(link.state()?.sg); return { alpha: q.allyAlpha, glow: q.allyGlow }; });
  let hornFor = '', answeredFor = '', startWin = null, rk = null, rkKey = null;
  let look = null;
  const lookOf = () => (look ??= renderer?.gl ? createEgLookDraw({ gl: renderer.gl }) : null);
  let wayBack = null, backLive = /** @type {string|null|undefined} */ (undefined), backSaid = '', backWroteAt = -Infinity, backDirty = false, returning = /** @type {string|null} */ (null), circleSeed = /** @type {number|null} */ (null), relHeld = 0;
  let backOver = '';
  try { const raw = JSON.parse(store?.getItem?.(EG_BACK_KEY) || 'null'); wayBack = egBackOf(raw); backOver = raw?.x === 1 && typeof raw.b === 'string' ? raw.b : ''; } catch { wayBack = null; }
  function backKeep(force = false) {
    if (!wayBack) return;
    if (!force && Date.now() - backWroteAt < EG_BACK_WRITE_MS) { backDirty = true; return; }
    backWroteAt = Date.now(); backDirty = false;
    try { store?.setItem?.(EG_BACK_KEY, JSON.stringify(wayBack)); } catch { }
  }
  function backDrop(b = wayBack?.b ?? returning ?? '') {
    wayBack = null; returning = null;
    if (b) backOver = b;
    try { store?.setItem?.(EG_BACK_KEY, backOver ? JSON.stringify({ b: backOver, x: 1 }) : ''); } catch { }
  }
  function backHeard(live) {
    backLive = live && typeof live.b === 'string' ? live.b : null;
    if (inSpire()) return;
    if (wayBack && wayBack.b !== backLive) backDrop();
    if (!wayBack && backLive && backLive !== backOver && /^[0-9a-f]{16}$/.test(backLive)) wayBack = { b: backLive, seed: 0, op: 0, geo: 0, ew: 0, rh: 0, h: 0, in: 0, li: null, wf: 0 };
  }
  let seedWait = null;
  function seedHeard(b) {
    const main = online();
    if (!main?.url) return Promise.resolve({ silent: true });
    return new Promise((resolve) => { seedWait = { L: egSeedListen({ main, b, at: Date.now(), Session }), resolve }; });
  }
  function seedFrame(end = null) {
    if (!seedWait) return;
    const a = end ?? seedWait.L.frame(Date.now());
    if (!a) return;
    const { L, resolve } = seedWait;
    seedWait = null;
    L.close();
    resolve(a);
  }
  function returnable() {
    if (!wayBack || backLive !== wayBack.b || inSpire() || returning || leaving) return false;
    const E = link.state(), c = E.call;
    return !!wayBack.in || !(c?.b === wayBack.b && egPhase({ openedAt: c.op, wokeAt: E.b === c.b ? E.wk : 0 }, now()) === 'open');
  }
  let spanClock = null, spanOff = 0;
  let ownMix = null;
  const bus = () => fight?.mix?.() ?? (ownMix ??= createSpireMix({ audio, now }));
  // Reads the circle the mode machine has built rather than the circle the company reports, which runs ahead during
  // the veil and while a swap waits.
  const lookCircle = (E) => { const L = lookOf(), c = modes()?.egHallCircle?.(); if (L && E.b && c > 0) L.setCircle(circleSeed ?? E.seed, c, E.geo ?? 0); return L; };
  const stillNow = () => egReducedMotion(win);
  const reverb = createEgReverb({ audio });
  let fragArena = null;
  const air = createEgAir(audio);

  let keysAsked = 0, keysSaid = 0;
  const keysAsk = () => ++keysAsked;
  function restack(n, seq = keysAsk(), spent = 0) {
    if (!Number.isSafeInteger(n) || n < 0 || !entity?.items || seq < keysSaid) return;
    keysSaid = seq;
    if (weirKeysHeld(entity.items) - spent - opensKept().filter((p) => p.s === me()).length > n) say(EG_TEXT.rust);
    if (restackWeirKeys(entity.items, n)) saved();
  }
  async function askKeys() {
    if (!me() || account?.guest?.()) return;
    keysAt = Date.now();
    const seq = keysAsk(), a = await account.keys();
    if (a?.ok) restack(a.data?.keys, seq);
    if (a?.ok && typeof a.data?.rk === 'string') rk = a.data.rk;
    if (a?.ok) backHeard(a.data?.live ?? null);
    if (a?.ok && Number.isSafeInteger(a.data?.first) && a.data.first >= 0) { pres.acct = a.data.first; if ((pres.shown | firstDevice()) & ~pres.acct) tellFirst(); }
    if (a?.ok && Number.isSafeInteger(a.data?.annals) && a.data.annals >= 0) annalsKept = a.data.annals;
  }
  async function relayKey() {
    if (!rk) return null;
    if (rkKey?.b64 !== rk) rkKey = { b64: rk, key: importPublicKeyB64(rk, { subtle: globalThis.crypto.subtle }).catch(() => null) };
    return rkKey.key;
  }
  function openRefusal() {
    const M = modes(), E = link.state(), f = keyFacts?.() ?? null;
    const callHeld = !!E.call && egPhase({ openedAt: E.call.op }, now()) !== 'ended' && E.call.co.some((r) => r[0] === me());
    return egKeyRefusal({ ...(f ?? {}), online: !!online(), guest: !me() || !!account?.guest?.(), exterior: (M?.mode ?? 'exterior') === 'exterior' && !inSpire(),
      held: inSpire() || callHeld, opening: !!opening, shut: !hub()?.egOk, nearArch: !!arches?.near?.(feet()), room: f ? !!f.site : true });
  }
  async function open(rh, { ew = 0, wg = [] } = {}) {
    const rq = requestId(), seq = keysAsk();
    opening = { rq, rh, z: null, site: null, tries: 0, sentAt: -Infinity };
    opensKeep([...opensKept().filter((p) => p.rq !== rq), { rq, s: me(), at: Math.floor(Date.now() / 1000) }]);
    const a = await account.open(rq, rh, { ew, wg });
    if (a?.ok || !EG_OPEN_LOST.includes(a?.error)) opensDrop(rq);
    else openAgainAt = Date.now();
    if (!a?.ok) { opening = null; if (a?.error === 'live') openAgainAt = -Infinity; say(a?.error === 'start' ? EG_TEXT.notStart(ew) : egRefusalText(a?.error)); return false; }
    restack(a.data?.keys, seq, rh ? 0 : 1);
    opening.z = a.data?.order ?? null; opening.b = a.data?.b ?? null;
    if (opening.z && opening.b) stakeKeep({ b: opening.b, z: opening.z, at: Math.floor(Date.now() / 1000) });
    opening.site = keyFacts?.()?.site ?? wire();
    if (!opening.z || !opening.site) { opening = null; say(EG_TEXT.shut); return false; }
    sendOpen();
    return true;
  }
  function sendOpen() {
    if (!opening?.z || opening.tries >= EG_OPEN_TRIES) return;
    if (Date.now() - opening.sentAt < EG_OPEN_RETRY_MS) return;
    if (hub()?.sendEg?.('open', { z: opening.z, site: opening.site })) { opening.tries++; opening.sentAt = Date.now(); }
  }
  function useKey() {
    const E = link.state();
    if (returnable()) { answer(); return EG_BACK_TEXT.back; }
    if (E.call && E.call.co.some((r) => r[0] === me()) && egPhase({ openedAt: E.call.op }, now()) === 'open' && !inSpire()) { answer(); return EG_TEXT.opens; }
    const no = openRefusal();
    if (no) return no;
    if (startWindow && startWin) return EG_START_ASKING_TEXT;
    if (startWindow) { askStart(); return ''; }
    open(false);
    return EG_TEXT.opening;
  }
  async function askStart() {
    if (startWin) return;
    const ask = { asking: true };
    startWin = ask;
    const members = [{ sub: me(), name: '' }, ...(party() ?? []).filter((m) => m && m.sub !== me())].slice(0, 8);
    let a = null;
    const seq = keysAsk();
    try { a = await account.starts?.(members.map((m) => m.sub)); } catch { a = null; }
    if (startWin !== ask) { if (a?.ok) restack(a.data?.keys, seq); return; }
    if (!a?.ok) { startWin = null; say(egRefusalText(a?.error)); return; }
    if (typeof a.data?.rk === 'string') rk = a.data.rk;
    restack(a.data?.keys, seq);
    const no = openRefusal();
    if (no) { startWin = null; say(no); return; }
    const mine = (party() ?? []).find((m) => m.sub === me());
    if (mine) members[0].name = mine.name;
    startWin = startWindow({ keys: a.data?.keys ?? 0, me: me(), members, starts: a.data?.starts ?? {}, rehearsal: !!a.data?.rehearsal, questDue: !!questDue(), say,
      onChoose: (c) => { startWin = null; const no2 = openRefusal(); if (no2) { say(no2); return; } open(!!c.rh, { ew: c.ew | 0, wg: c.wg ?? [] }); say(EG_TEXT.opening); },
      onCancel: () => { startWin = null; } }) ?? null;
  }
  const callMine = (E) => !!E.call && E.call.co.some((r) => r[0] === me());
  function startOpen() {
    const no = openRefusal();
    if (no) { say(no); return; }
    if (!startWindow) { say(NO_CALL_TEXT); return; }
    if (startWin) { say(EG_START_ASKING_TEXT); return; }
    askStart();
  }
  function annalsSay(b) {
    const n = (Number(b) | 0) - 1, have = annalsHeld();
    if (!have.length) say('No page of the Annals is yours yet. Look behind the halls\' false walls.');
    else if (n >= 0 && have[n] != null) say(`${EG_ANNALS[have[n]][0]}: ${EG_ANNALS[have[n]][1]}`);
    else say(`Your pages of the Annals: ${have.map((p, j) => `${j + 1}. ${EG_ANNALS[p][0]}`).join(', ')}. /breach annals N to read one.`);
  }
  const annalsHeld = () => EG_ANNALS.map((_, p) => p).filter((p) => annals.has(p) || (p < 31 && (annalsKept & (1 << p)) !== 0));
  function respiteVote(word = 'yes') {
    const q = (link.state().as ?? []).find((a) => a[0] === 'respite' && a[2] > now());
    if (!q) { say(egRespiteNone()); return false; }
    const y = word === 'no' || word === 'n' ? 0 : 1;
    voted.respite = y;
    return !!online()?.sendEg?.('vote', { q: 'respite', y });
  }
  function pingSay(w = 0) {
    const E = link.state(), at = pingPlace(E), left = pingLeft();
    if (left > 0) { say(egPingWait(Math.ceil(left / 1000))); return false; }
    if (!at || !online()?.sendEg?.(witness ? 'ping' : 'lping', { x: Math.round(at.x * 100) / 100, z: Math.round(at.z * 100) / 100, w })) return false;
    pingAt = now();
    return true;
  }
  const pingLeft = () => Math.max(0, EG_PING_MS - (now() - pingAt));

  async function answer(viaArch = false) {
    const E = link.state(), c = E.call, M = modes(), t = now();
    if (returnable() && (!c || c.b === wayBack.b)) return returnIn();
    if (!c) { say(NO_CALL_TEXT); return false; }
    if (!c.co.some((r) => r[0] === me())) { say(EG_TEXT.outside(c.o)); return false; }
    const no = answerNo(c, t, M);
    if (no !== null) { if (no) say(no); return false; }
    if (answering || M?.stepping) return false;
    answering = true;
    try {
      if (!admitFresh(c.b)) {
        const a = await account.admit(c.b);
        if (!a?.ok) { say(a?.error === 'start' ? EG_TEXT.notStart(c.ew ?? 0) : egRefusalText(a?.error)); return false; }
        admit = { b: c.b, z: a.data?.order ?? null, at: Date.now() };
        inFor = -1;
        const again = answerNo(c, now(), modes());
        if (again !== null) { if (again) say(again); return false; }
      }
      if (!admit.z) { say(EG_TEXT.shut); return false; }
      if (callPortal && !viaArch) {
        const f = feet();
        const p = f ? callPortal.open(f, cam?.yaw ?? 0, probes()) : { refused: 'ground' };
        if (!p.at) { say(EG_TEXT.room); return false; }
        answeredFor = c.b;
        return true;
      }
      return await stepIn(c, E);
    } finally { answering = false; }
  }
  function answerNo(c, t, M) {
    if (inSpire()) return '';
    const phase = egPhase({ openedAt: c.op }, t), T = egTimes({ openedAt: c.op });
    if (phase === 'rising' || phase === 'sealed') return EG_TEXT.sealed(egCountText(T.openAt - t));
    if (phase !== 'open') return EG_TEXT.late(c.o);
    if ((M?.mode ?? 'exterior') !== 'exterior') return EG_TEXT.indoors;
    return null;
  }
  async function stepIn(c, E = link.state()) {
    if (modes()?.stepping) return false;
    placedH = 0; downH = 0; endSeen = null; rdSeen = 0; leaving = false;
    answeredFor = c.b;
    const landing = c.os === me() ? arches?.landing?.(c.b) ?? null : null;
    const step = egStairStep(egStartHall(c.ew ?? 0), stillNow());
    const went = await modes()?.stepThroughFire?.(() => enterHall({ b: c.b, seed: c.seed, c: (c.ew ?? 0) + 1, geo: E.geo ?? 0, site: site(), ...(landing ? { landing } : {}) }), step.look, step.opts);
    if (!went) { answeredFor = ''; say(EG_TEXT.shut); }
    else {
      circleSeed = c.seed >>> 0;
      if (wayBack?.b !== c.b) wayBack = { b: c.b, seed: c.seed >>> 0, op: c.op, geo: E.geo ?? 0, ew: c.ew ?? 0, rh: c.rh ? 1 : 0, h: 0, in: 0, li: null, wf: 0 };
      backOver = ''; backKeep(true);
    }
    return !!went;
  }
  async function returnIn() {
    const M = modes(), R = wayBack;
    if (!R) return false;
    if ((M?.mode ?? 'exterior') !== 'exterior') { say(EG_TEXT.indoors); return false; }
    if (answering || M?.stepping || !(entity.health > 0)) return false;
    answering = true;
    try {
      placedH = 0; downH = 0; endSeen = null; rdSeen = 0; leaving = false;
      answeredFor = R.b; returning = R.b;
      const step = egStairStep(R.h > 0 ? R.h : egStartHall(R.ew ?? 0), stillNow(), !(R.op > 0));
      if (!(R.op > 0)) step.opts.label = EG_BACK_TEXT.spire;
      let heard = null;
      const went = await M?.stepThroughFire?.(async () => {
        if (!(R.op > 0)) {
          heard = await seedHeard(R.b);
          if (!heard.st) return false;
          backFrame(heard.st, egMemberOf(heard.st, me()));
        }
        return enterHall({ b: R.b, seed: R.seed, c: R.h > 0 ? egCircleOfHall(R.h) : R.ew + 1, geo: R.geo, site: site() });
      }, step.look, step.opts);
      if (!went) {
        returning = null; answeredFor = '';
        if (roomRefused(heard?.no)) { backDrop(R.b); say(sentenceOf(heard.no)); }
        else say(heard?.silent ? EG_BACK_TEXT.silent : EG_TEXT.shut);
        return false;
      }
      circleSeed = R.seed >>> 0;
      say(EG_BACK_TEXT.back);
      return true;
    } finally { answering = false; }
  }
  function portalEntered() {
    const c = link.state().call;
    if (answering || modes()?.stepping) return false;
    callPortal?.clear?.();
    if (!c || c.b !== admit?.b || inSpire()) return false;
    stepIn(c);
    return true;
  }
  // Returns true when the refusal is handled here or belongs to a background ask, and false when the link reports
  // it itself.
  function refused(w) {
    if (opening && w === 'the road is shut') { opening = null; return false; }
    if (w === 'the breach took the key' || w === 'the void is too old') { if (voidFor) stakeDrop((s) => s.z === voidFor); voidFor = ''; return true; }
    if (opening && !inSpire() && w === 'the breach is closed' && opening.tries < EG_OPEN_TRIES) { opening.sentAt = Date.now() - EG_OPEN_RETRY_MS + 1000; return true; }
    if (w === 'the breach is closed' && answeredFor && link.state().call?.b === answeredFor) { say(EG_TEXT.late(link.state().call.o)); answeredFor = ''; callPortal?.clear?.(); return true; }
    if (w === 'the order is spent' || w === 'the order is not yours') {
      const b = admit?.b ?? link.state().b;
      admit = null; inFor = -1;
      return inSpire() && !!b && admitAsked(b) < EG_ADMIT_ASKS;
    }
    return false;
  }
  function admitIn(b, o) {
    if (admitFresh(b)) { if (o?.welcomes !== inFor && o?.sendEg?.('in', { z: admit.z, lv: Math.max(1, entity.level | 0) })) inFor = o.welcomes; return; }
    if (admitAsking || admitAsked(b) >= EG_ADMIT_ASKS) return;
    admitAsking = true;
    admitAsks.n = admitAsked(b) + 1; admitAsks.b = b;
    (async () => {
      let a = null;
      try { a = await account.admit(b); } catch { a = null; }
      if (a?.ok && a.data?.order) { admit = { b, z: a.data.order, at: Date.now() }; inFor = -1; }
      else if (a && !a.ok && admitAsked(b) >= EG_ADMIT_ASKS) say(egRefusalText(a.error));
    })().finally(() => { admitAsking = false; });
  }

  const kept = () => { try { const v = JSON.parse(store?.getItem?.(EG_CLAIMS_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((r) => typeof r === 'string') : []; } catch { return []; } };
  const keep = (list) => { try { store?.setItem?.(EG_CLAIMS_KEY, JSON.stringify(list.slice(-EG_CLAIMS_MAX))); } catch { } };
  let memo = [];
  function claimAdd(r) {
    const rc = readEgReceipt(r);
    if (rc && countedOf(rc)) { hub()?.sendEg?.('claimed', { b: rc.b, q: rc.q, w: rc.q === 'w' ? rc.w : 0 }); return; }
    const list = store ? kept() : memo;
    if (!list.includes(r)) list.push(r);
    if (store) keep(list); else memo = list.slice(-EG_CLAIMS_MAX);
    const c = readEgReceipt(r);
    if (c?.s === me()) {
      if (stakeDrop((s) => s.b === c.b) && c.q === 'v') say(EG_VOID_TEXT);
      if (c.q === 'v' && opening?.b === c.b) opening = null;
    }
    flush();
  }
  // A flush requested while one is in flight sets `again`, and the running flush repeats when it ends, so a new
  // receipt never waits for the retry timer.
  let flushing = false, again = false;
  async function flush() {
    if (flushing) { again = true; return; }
    if (!me() || account?.guest?.()) return;
    flushing = true; again = false;
    claimAt = Date.now();
    try {
      const nowS = Math.floor(now() / 1000);
      for (const r of store ? kept() : [...memo]) {
        const c = readEgReceipt(r);
        const drop = () => { if (store) keep(kept().filter((x) => x !== r)); else memo = memo.filter((x) => x !== r); };
        if (!c || !(c.e > nowS)) { drop(); continue; }
        if (c.s !== me()) continue;
        const seq = keysAsk(), a = await account.claim(r);
        if (a?.ok && Number.isSafeInteger(a.data?.keys)) restack(a.data.keys, seq);
        if (a?.ok && a.data?.recorded && a.data.q === 'w') say(`Redoubt ${a.data.w} is yours.`);
        redoubtActs(a, c);
        if (a?.ok && c.q === 'w' && c.rh !== 1 && (a.data?.recorded || a.data?.again || a.data?.why === 'guest')) paid?.(c, a.data?.recorded ? a.data : { ...a.data, marks: null, deed: null });
        if (a?.ok && c.q === 'x' && a.data?.board) boardHeard(c.b, a.data.board);
        if (a?.ok && c.q === 'x' && Array.isArray(a.data?.rl)) { openedHeard(c.b, a.data.rl.length); if (a.data.rl.length) paid?.(c, a.data); }
        if (a?.ok && c.q === 'w' && a.data?.paid === false && (a.data.recorded || a.data.again) && link.state().b === c.b && !link.state().end) online()?.sendEg?.('wkpaid', { w: c.w });
        if (egClaimDone(a)) { drop(); countedAdd(c); hub()?.sendEg?.('claimed', { b: c.b, q: c.q, w: c.q === 'w' ? c.w : 0 }); }
      }
    } finally { flushing = false; }
    if (again) await flush();
  }

  let stakesMemo = [], voidAt = -Infinity, voidFor = '', stakeLookAt = -Infinity;
  const stakesKept = () => {
    let v = stakesMemo;
    if (store) { try { v = JSON.parse(store.getItem?.(EG_STAKES_KEY) ?? '[]'); } catch { v = []; } }
    const nowS = Math.floor(Date.now() / 1000);
    return Array.isArray(v) ? v.filter((s) => s && typeof s.b === 'string' && typeof s.z === 'string' && Number.isSafeInteger(s.at) && nowS - s.at <= EG_VOID_MAX_S) : [];
  };
  const stakesKeep = (list) => {
    stakesMemo = list.slice(-EG_STAKES_MAX);
    if (store) { try { store.setItem?.(EG_STAKES_KEY, JSON.stringify(stakesMemo)); } catch { } }
  };
  function stakeKeep(st) { stakesKeep([...stakesKept().filter((s) => s.b !== st.b), st]); }
  function stakeDrop(pred) {
    const list = stakesKept(), left = list.filter((s) => !pred(s));
    if (left.length !== list.length) stakesKeep(left);
    return left.length !== list.length;
  }
  // A stake whose open is still in flight, or whose call is current, is skipped so its void is never asked early.
  function stakeFrame() {
    if (!store && !stakesMemo.length) return;
    const t = Date.now();
    if (t - voidAt < EG_VOID_ASK_MS || t - stakeLookAt < EG_STAKE_LOOK_MS) return;
    stakeLookAt = t;
    const st = stakesKept().find((s) => t - s.at * 1000 >= EG_VOID_WAIT_MS && s.b !== opening?.b && s.b !== link.state().call?.b);
    if (!st) return;
    voidAt = t;
    if (hub()?.sendEg?.('void', { z: st.z })) voidFor = st.z;
  }

  let opensMemo = [], openAgainAt = -Infinity, openAgainBusy = false;
  function opensKept() {
    let v = opensMemo;
    if (store) { try { v = JSON.parse(store.getItem?.(EG_OPENS_KEY) ?? '[]'); } catch { v = []; } }
    const nowS = Math.floor(Date.now() / 1000);
    return Array.isArray(v) ? v.filter((p) => p && typeof p.rq === 'string' && typeof p.s === 'string' && Number.isSafeInteger(p.at) && nowS - p.at <= EG_VOID_MAX_S) : [];
  }
  function opensKeep(list) {
    opensMemo = list.slice(-EG_OPENS_MAX);
    if (store) { try { store.setItem?.(EG_OPENS_KEY, JSON.stringify(opensMemo)); } catch { } }
  }
  function opensDrop(rq) { const list = opensKept(); if (list.some((p) => p.rq === rq)) opensKeep(list.filter((p) => p.rq !== rq)); }
  async function openAgainFrame() {
    if (openAgainBusy || Date.now() - openAgainAt < EG_OPEN_AGAIN_MS || !me() || account?.guest?.()) return;
    if (!store && !opensMemo.length) return;
    const p = opensKept().find((q) => q.s === me() && q.rq !== opening?.rq);
    if (!p) return;
    openAgainAt = Date.now(); openAgainBusy = true;
    try {
      const seq = keysAsk(), a = await account.open(p.rq, false, { again: true });
      if (a?.ok && typeof a.data?.order === 'string' && typeof a.data?.b === 'string') {
        stakeKeep({ b: a.data.b, z: a.data.order, at: Number.isSafeInteger(a.data.at) ? a.data.at : p.at });
        restack(a.data.keys, seq);
        opensDrop(p.rq);
      } else if (a?.error === 'none' ? Math.floor(Date.now() / 1000) - p.at >= EG_OPEN_SURE_S : !EG_OPEN_LOST.includes(a?.error) && a?.error !== 'no-session') opensDrop(p.rq);
    } finally { openAgainBusy = false; }
  }

  let countedMemo = [];
  function countedKept() {
    let v = countedMemo;
    if (store) { try { v = JSON.parse(store.getItem?.(EG_COUNTED_KEY) ?? '[]'); } catch { v = []; } }
    const nowS = Math.floor(Date.now() / 1000);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.s === 'string' && Number.isSafeInteger(x.e) && x.e > nowS) : [];
  }
  function countedAdd(c) {
    const id = egRcId(c), list = countedKept().filter((x) => !(x.id === id && x.s === c.s));
    countedMemo = [...list, { id, s: c.s, e: c.e }].slice(-EG_COUNTED_MAX);
    if (store) { try { store.setItem?.(EG_COUNTED_KEY, JSON.stringify(countedMemo)); } catch { } }
  }
  const countedOf = (c) => { const id = egRcId(c); return countedKept().some((x) => x.id === id && x.s === c.s); };

  function standing() {
    const p = player?.pos;
    if (!p) return null;
    const [sx, y, z] = dungeonToRealm(p[0], p[1], p[2]);
    return { slot: egSlotAt(sx), sx, y, z };
  }
  function placeOn(h, E, flash = true) {
    const spec = egHallOf(E.seed, h, E.geo ?? 0);
    if (!spec.arrive) return false;
    const at = egToDungeon(spec, spec.arrive.x, spec.arrive.y + 0.1, spec.arrive.z);
    if (flash) { const step = egStairStep(h, stillNow()); veil()?.flash?.(step.look, step.opts); }
    return !!modes()?.egPlace?.(at, 0);
  }
  function placeAt(E, li) {
    const spec = egHallOf(E.seed, li[0], E.geo ?? 0), step = egStairStep(li[0], stillNow());
    veil()?.flash?.(step.look, step.opts);
    return !!modes()?.egPlace?.(egToDungeon(spec, li[1], li[2] + 0.1, li[3]), 0);
  }
  function standDoor(E) {
    if (door && doorH === E.h) return;
    const spec = egHallOf(E.seed, E.h, E.geo ?? 0), f = spec.fight ?? spec.end ?? spec.arrive;
    if (!f) return;
    const [x, y, z] = egToDungeon(spec, f.x, f.y ?? 0, f.z);
    door = { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1], centre: { x: 0, y: 1.6, z: 0 }, size: { x: 3.2, y: 3.2, z: 3.2 }, normal: { x: 0, y: 0, z: -1 } };
    doorH = E.h;
    modes()?.dungeonCtx?.exitDoors?.push?.(door);
    try { portal = portals()?.open?.([x, y, z], { fixed: true, holdMs: 120_000 }) ?? null; } catch { portal = null; }
  }
  function dropDoor() {
    if (door) { const list = modes()?.dungeonCtx?.exitDoors; const i = list?.indexOf?.(door) ?? -1; if (i >= 0) list.splice(i, 1); }
    if (portal) { try { portals()?.remove?.(portal); } catch { } }
    door = null; doorH = 0; portal = null;
  }
  function walkOut(text) {
    if (leaving) return;
    leaving = true; returning = null;
    // Every way out goes through here, so the witness state ends here and never survives into the open world.
    if (witness) { witness = null; entity.health = Math.max(1, entity.health); }
    dropDoor();
    reverb.release(); clampAway();
    swapWaitAt = 0; modes()?.egSwapDrop?.();
    lawForget();
    veil()?.flash?.('hourHome');
    if (text) say(text);
    if (!modes()?.egLeave?.()) leaving = false;
  }
  async function swapTo(E, c) {
    if (swapping || answering) return false;
    const r = { b: E.b, seed: E.seed, c, geo: E.geo ?? 0 };
    const built = prebuild(E, c);
    if (built === 'building') { if (!swapWaitAt) swapWaitAt = now(); if (now() - swapWaitAt < EG_SWAP_WAIT_MS) return false; }
    swapWaitAt = 0;
    swapping = true;
    const step = egStairStep(E.h, stillNow(), c === modes()?.egHallCircle?.());
    let went = false;
    try {
      const back = modes()?.egHallReturn?.() ?? null;
      placedH = 0; downH = 0; dropDoor();
      went = !!await modes()?.stepThroughFire?.(async () => {
        if (built === 'ready' && modes()?.egSwapCircle?.(r)) { if (!witness && placeOn(E.h, E, false)) placedH = E.h; return true; }
        modes()?.forceExitToExterior?.();
        if (back) landAt(back);
        return enterHall({ b: E.b, seed: E.seed, c, geo: E.geo ?? 0, site: site() });
      }, step.look, step.opts);
      if (modes()?.egHallCircle?.() === c) circleSeed = E.seed >>> 0;
    } finally { swapping = false; }
    if (went && lawForeign(E) && lawGiven(E, c)) lawBuilt = `${E.b}:${c}`;
    return went;
  }
  function spireFrame(E, t) {
    const M = modes(), o = online();
    if (o?.terminal) {
      if (!leaving && entity.health > 0 && !M?.deathUp?.()) {
        const said = roomRefused(o.error);
        if (said) backDrop(M?.egHallBreach?.() ?? undefined); else keysAt = -Infinity;
        walkOut(said ? sentenceOf(o.error) : EG_TEXT.shut);
      }
      return;
    }
    if (!E.b || E.b !== M?.egHallBreach?.()) return;
    const mine = egMemberOf(E, me());
    if (mine && !mine.in) admitIn(E.b, o);
    backFrame(E, mine);
    if (mine?.alive) relHeld = egRunOfMember(E, me()).rel;
    if (mine && mine.forsaken) { if (!leaving) { witness = null; backDrop(E.b); walkOut(EG_END_TEXT.forsake); } return; }
    if (mine && !mine.alive && !witness && !leaving) enterWitness(t, false);
    if (mine && mine.home) { witness = null; backDrop(E.b); if (!leaving && endSeen !== 'home') { endSeen = 'home'; recap = egRecapModel(E, me(), log, t, { whyText: EG_END_TEXT.home, why: 'home', board: boards.get(E.b) ?? '' }); recapUntil = Date.now() + 30_000; recapOpened(); } walkOut(null); return; }
    if (E.end) {
      if (endSeen !== E.end) { endSeen = E.end; endAt = t; backDrop(E.b); mid(EG_END_TEXT[E.end] ?? EG_TEXT.ended); recap = egRecapModel(E, me(), log, t, { whyText: EG_END_TEXT[E.end] ?? '', board: boards.get(E.b) ?? '' }); recapUntil = Date.now() + 30_000; recapOpened(); }
      if (t - endAt >= EG_END_WALK_MS) { if (witness) { witness = null; entity.health = Math.max(1, entity.health); } walkOut(null); }
      return;
    }
    if (!(E.h > 0)) return;
    lawFrame(E);
    logFrame(E);
    const pk = `${E.b}:${E.h}:${E.sg === 'rest' ? 'r' : 't'}`;
    if (!potionHall.startsWith(`${E.b}:`)) { potionHall = `${E.b}:0:t`; potions = EG_POTIONS_PER_HALL; potionsKeep(); }
    if ((E.sg === 'trial' || E.sg === 'rest') && potionHall !== pk) { potionHall = pk; potions = EG_POTIONS_PER_HALL; potionsKeep(); }
    const c = egCircleOfHall(E.h);
    if (E.sg === 'rest' && c === M.egHallCircle?.()) prebuild(E, c + 1);
    // A hidden tab still receives socket words but draws no frames, so the company's circle may already be past its
    // arrival; step into it at whatever stage is first drawn.
    if (c !== M.egHallCircle?.() || (circleSeed != null && circleSeed !== E.seed >>> 0)) { if (E.sg !== 'rest' || returning === E.b) swapTo(E, c); return; }
    if (returning === E.b) {
      returning = null;
      const li = wayBack?.li;
      if (!witness && mine?.alive && (E.sg === 'trial' && li && li[0] === E.h ? placeAt(E, li) : placeOn(E.h, E))) placedH = E.h;
    }
    if (witness) { witnessFrame(E); return; }
    const at = standing();
    if (!at) return;
    const spec = egHallOf(E.seed, E.h, E.geo ?? 0);
    if ((E.sg === 'arrive' || E.sg === 'trial') && placedH !== E.h && at.slot !== egSlotOfHall(E.h)) { if (placeOn(E.h, E)) { placedH = E.h; say(EG_TEXT.pulled); } }
    else if (at.slot === egSlotOfHall(E.h)) placedH = E.h;
    if (E.sg === 'trial') islandFrame(E, t);
    // `egAtDoor` uses `EG_DOOR_REACH_M` from the shared law, so the client and the relay agree on who is at the
    // door.
    if (E.sg === 'closing' && at.slot === egSlotOfHall(E.h) && downH !== E.h && egAtDoor(spec, egLocalX(spec, at.sx), at.z, at.y) && t - downAt >= EG_DOWN_EVERY_MS) {
      downAt = t;
      if (o?.sendEg?.('down', { h: E.h })) mid(unfair.h === E.h ? EG_FAIR_TEXT[unfair.w]() : 'You wait at the door for your company.');
    }
    if (E.sg !== 'closing') downAt = -Infinity;
    if (E.sg === 'rest') { if (rdSeen !== E.h) { rdSeen = E.h; redoubt?.(E.rd); say(`${EG_TEXT.redoubt(E.rd)} taken. Choose a Vestige. The way home stands at the Court's center, and the stair down opens when the rest ends.`); } standDoor(E); }
    else if (door) dropDoor();
  }

  function logEntry(E, h, falls = 0) {
    const sp = egHallOf(E.seed, h, E.geo ?? 0);
    return { h, glyph: KIND_GLYPH[sp.kind] ?? '?', lord: sp.lord, lordName: sp.kind === 'court' ? EG_LORDS[sp.lord]?.name ?? '' : '', fall: falls > 0, falls };
  }
  function logKeep() { try { store?.setItem?.(EG_LOG_KEY, JSON.stringify({ b: logB, l: log.map((x) => [x.h, x.falls]), f: logFalls })); } catch { } }
  function logFrame(E) {
    let moved = false;
    if (logB !== E.b) {
      logB = E.b; log.length = 0; logFalls = {}; logH = 0;
      let kept = null;
      try { kept = JSON.parse(store?.getItem?.(EG_LOG_KEY) ?? 'null'); } catch { kept = null; }
      if (kept?.b === E.b && Array.isArray(kept.l)) {
        for (const x of kept.l) if (Array.isArray(x) && Number.isSafeInteger(x[0]) && x[0] > 0 && x[0] <= E.h) log.push(logEntry(E, x[0], Number.isSafeInteger(x[1]) && x[1] > 0 ? x[1] : 0));
        for (const [sub, n] of Object.entries(kept.f ?? {})) if (Number.isSafeInteger(n) && n > 0) logFalls[sub] = n;
        logH = log.at(-1)?.h ?? 0;
      }
    }
    if (E.h !== logH) {
      const first = logH > 0 ? (logH < E.h ? logH + 1 : E.h) : E.call?.b === E.b ? egStartHall(E.call.ew ?? 0) : egFirstHallOf(egCircleOfHall(E.h));
      for (let h = Math.max(first, E.h - EG_LOG_MAX + 1); h <= E.h; h++) log.push(logEntry(E, h));
      if (log.length > EG_LOG_MAX) log.splice(0, log.length - EG_LOG_MAX);
      logH = E.h; moved = true;
    }
    for (const c of E.co ?? []) {
      const n = c[8] ?? 0, was = logFalls[c[0]] ?? 0;
      if (n > was && log.length) { const cur = log[log.length - 1]; cur.falls += n - was; cur.fall = true; logFalls[c[0]] = n; moved = true; }
    }
    if (moved) logKeep();
  }
  function backFrame(E, mine) {
    if (E.b === backOver) return;
    if (!mine?.in && wayBack?.b !== E.b) return;
    if (wayBack?.b !== E.b) wayBack = { b: E.b, seed: E.seed >>> 0, op: E.op, geo: E.geo ?? 0, ew: 0, rh: E.rh ? 1 : 0, h: 0, in: 0, li: null, wf: 0 };
    const was = `${wayBack.seed}:${wayBack.op}:${wayBack.geo}:${wayBack.in}:${wayBack.h}`;
    wayBack.seed = E.seed >>> 0; wayBack.op = E.op; wayBack.geo = E.geo ?? 0;
    if (mine?.in) wayBack.in = 1;
    if (E.h > 0) wayBack.h = E.h;
    if (`${wayBack.seed}:${wayBack.op}:${wayBack.geo}:${wayBack.in}:${wayBack.h}` !== was) backKeep(true);
    else if (backDirty) backKeep();
  }
  function islandFrame(E, t) {
    if (wayBack?.b !== E.b) return;
    const F = feetInHall(E);
    if (!F || egSupportAt(F.spec, F.x, F.y, F.z, t / 1000) !== EG_HOLD.island) return;
    const L = wayBack.li, r2 = (v) => Math.round(v * 100) / 100;
    if (L && L[0] === E.h && Math.hypot(L[1] - F.x, L[3] - F.z) < 0.5) return;
    wayBack.li = [E.h, r2(F.x), r2(F.y), r2(F.z)];
    backKeep(!L || L[0] !== E.h);
  }
  function feetHall(E) {
    const at = standing(), c = modes()?.egHallCircle?.() ?? egCircleOfHall(E.h);
    if (!at?.slot || !E.seed || !(c > 0)) return null;
    const h = (c - 1) * 5 + at.slot;
    return { h, spec: egHallOf(E.seed, h, E.geo ?? 0), at };
  }
  function reverbFrame(E) {
    reverb.hold();
    const H = feetHall(E);
    if (!H) return;
    reverb.hall(`${E.b}:${H.h}`, H.spec);
    reverb.at(egLocalX(H.spec, H.at.sx), H.at.z);
  }
  // The world host sets other arenas first each frame, so the fragment clamp applies only when `player.arena` is
  // empty or already `fragArena`.
  function clampFrame(E) {
    if (!player || (player.arena && player.arena !== fragArena)) { fragArena = null; return; }
    const H = witness ? null : feetHall(E);
    fragArena = H && player.pos ? egFragArena(H.spec, player.pos) : null;
    player.arena = fragArena;
  }
  function clampAway() {
    if (player && fragArena && player.arena === fragArena) player.arena = null;
    fragArena = null;
  }
  function shaftWay(E) {
    const H = feetHall(E);
    return H && player?.pos ? egShaftLedgeAt(H.spec, player.pos) : null;
  }

  function enterWitness(t, said, fin = null) {
    const E = link.state();
    if (witness || !inSpire()) return;
    const mine = egMemberOf(E, me());
    const counted = !!mine && !mine.alive, falls = mine?.falls ?? 0, n = counted ? falls : falls + 1;
    const final = fin != null ? !!fin : !mine?.recall || n >= 2;
    const seen = wayBack?.b === E.b && wayBack.wf >= n;
    witness = { at: t, idx: 0, watched: null, hold: null, fell: seen ? -Infinity : t, fall: seen ? null : { at: t, final, lost: relHeld, eye: Array.isArray(cam?.pos) ? [...cam.pos] : null } };
    if (wayBack?.b === E.b && n > wayBack.wf) { wayBack.wf = n; backKeep(true); }
    const lastPose = online()?._pose ?? null;
    witness.spot = lastPose && Number.isFinite(lastPose.x) ? [lastPose.x, lastPose.y ?? 0, lastPose.z] : null;
    if (!said && mine?.alive && witness.spot && E.co.some((c) => c[0] !== me() && c[3] === 1 && c[4] === 0 && c[5] === 1)) lieDown(t + EG_DOWN_MS);
    if (mine?.alive && !said) online()?.sendEg?.('fell');
    entity.health = Math.max(1, entity.maxHealth ?? 1);
    const spec = E.h > 0 ? egHallOf(E.seed, E.h, E.geo ?? 0) : null;
    if (spec?.arrive) { const p = egToDungeon(spec, spec.arrive.x, spec.arrive.y - 60, spec.arrive.z); witness.hold = p; }
    pres.live = `${EG_FALL_TEXT.main}. ${final ? EG_FALL_TEXT.final : EG_FALL_TEXT.first}`;
  }
  function lieDown(until) {
    if (!witness) return;
    witness.down = until;
    if (witness.fall) witness.fall.down = until;
    mid(t('eg.down', 'You are down. A party member can raise you within {s} seconds. Enter: give up.', { s: Math.max(1, Math.round((until - now()) / 1000)) }));
  }
  const downPose = () => (witness?.down && witness.spot ? witness.spot : null);
  function countFell() {
    if (!inSpire() || witness) return;
    mid(EG_COUNT_FELL_TEXT);
    enterWitness(now(), true);
  }
  function ridePl() {
    const E = link.state();
    if (!inSpire() || witness || !(E.h > 0) || !player?.pos) return null;
    const at = standing();
    if (!at || at.slot !== egSlotOfHall(E.h)) return null;
    const spec = egHallOf(E.seed, E.h, E.geo ?? 0), y = dungeonToRealm(player.pos[0], player.pos[1], player.pos[2])[1];
    return egRideOf(spec, egLocalX(spec, at.sx), y, at.z, now() / 1000);
  }
  // Peer riders are placed at this client's shared clock plus their offset, so they move with the platform instead
  // of floating beside it.
  function rideDraw(q) {
    const E = link.state();
    if (!inSpire() || !(E.h > 0) || !q) return;
    if (!Array.isArray(q.pl)) { modes()?.dungeonCtx?.egSpanPeer?.(q.x, q.y ?? 0, q.z); return; }
    const spec = egHallOf(E.seed, E.h, E.geo ?? 0);
    if (egSlotAt(dungeonToRealm(q.x, q.y ?? 0, q.z)[0]) !== egSlotOfHall(E.h)) return;
    const r = egRideAt(spec, q.pl, now() / 1000);
    if (!r) return;
    const [x, y, z] = egToDungeon(spec, r[0], r[1], r[2]);
    q.x = x; q.y = y; q.z = z;
  }
  function witnessFrame(E) {
    if (witness.hold && player?.pos) { player.pos[0] = witness.hold[0]; player.pos[1] = witness.hold[1]; player.pos[2] = witness.hold[2]; player.velY = 0; player._airVelX = 0; player._airVelZ = 0; player.falling = false; player.fallStart = player.pos[1]; }
    const living = E.co.filter((c) => c[0] !== me() && c[3] === 1 && c[4] === 0 && c[5] === 1);
    if (!living.length) { witness.watched = null; return; }
    if (!living.some((c) => c[0] === witness.watched)) witness.watched = living[witness.idx % living.length][0];
  }
  function riseAt(w) {
    const E = link.state();
    witness = null;
    const spec = egHallOf(E.seed, w.h, E.geo ?? 0);
    const at = egToDungeon(spec, w.x, 0.2, w.z);
    modes()?.egPlace?.(at, 0);
    entity.health = Math.max(1, Math.round((entity.maxHealth ?? 1) * w.p));
    mid(w.by ? t('eg.raised', '{name} raises you.', { name: w.by }) : w.p >= 1 ? 'The Redoubt calls you back.' : 'A Memento calls you back.');
  }
  function applyHeal(p, why) {
    if (witness || !(entity.health > 0) || !inSpire()) return;
    if (why === 'rest' && p >= 1) { fillVitalSigns(entity); return; }
    if (why === 'rest' && p > 0) egRestVitals(entity, p);
    if (why === 'tonic' && p > 0 && entity.maxMagicka > 0) entity.magicka = Math.min(entity.maxMagicka, (entity.magicka ?? 0) + Math.round(p * entity.maxMagicka));
    if (p > 0 && wall()) p *= 1 + EG_WALL_X;
    if (heal) { heal(p, why); return; }
    const max = entity.maxHealth ?? 0;
    // Shares use `spireBodyMax`, the body without the Stoneskin cushion, as the room computes them.
    if (p < 0) { const cut = Math.min(Math.round(-p * spireBodyMax(entity)), entity.health - 1); if (cut > 0) hurt(cut); return; }
    entity.health = Math.max(1, Math.min(max, Math.round(entity.health + p * max)));
  }

  function holderNow() {
    if (!inSpire() || witness) return null;
    const E = link.state();
    if (holderMade.E === E && holderMade.ls === lsSeq) return holderMade.h;
    holderMade.E = E; holderMade.ls = lsSeq; holderMade.h = null;
    const m = egMemberOf(E, me());
    if (!E.b || E.end || !m?.in || !m.alive || m.home) return null;
    const run = egRunOfMember(E, me());
    const cry = (E.co ?? []).some((c) => { const q = egMemberOf(E, c[0]); return !!q?.in && q.alive && !q.home && egResonance(egRunOfMember(E, c[0]).vs).includes('fellowship'); });
    return (holderMade.h = { vs: run.vs, mast: run.mast, b: E.b, h: E.h | 0, dn: E.dn ?? 0, cry, ls: longStepOn(E) });
  }
  const holderMade = { E: null, ls: -1, h: /** @type {any} */ (null) };
  let longStep = /** @type {{ b: string, h: number } | null} */ (null), lsSeq = 0;
  function longStepHeard(E) {
    if (!E.b || !(E.h > 0)) return;
    let h = E.h;
    for (let k = E.h; k < E.h + EG_LONG_STEP_LOOK; k++) if (egHallOf(E.seed, k, E.geo ?? 0).steps?.some((s) => EG_CRUMBLE_KINDS.includes(s.kind) || s.kind === 'sink')) { h = k; break; }
    longStep = { b: E.b, h }; lsSeq++;
  }
  const longStepOn = (E) => !!longStep && longStep.b === E.b && E.h <= longStep.h;
  const wall = () => (fight?.accordMates?.('livingwall', 'a')?.length ?? 0) > 0;

  let pushX = 0, pushZ = 0, pushLeft = 0, pushAt = 0;
  const footing = () => { const vs = egRunOfMember(link.state(), me()).vs; return fight?.immovable?.() || egResonance(vs).includes('stone') ? 1 : egVOf(vs, 'ironfooting'); };
  function pushBy(dx, dz, m) {
    if (witness || !inSpire() || !(m > 0) || !Number.isFinite(dx) || !Number.isFinite(dz)) return;
    const L = Math.hypot(dx, dz);
    if (!(L > 1e-6)) return;
    const take = Math.max(0, 1 - footing());
    pushX = dx / L; pushZ = dz / L; pushLeft = Math.min(EG_PUSH_MAX_M, m * take); pushAt = now();
  }
  function pushStep() {
    if (!(pushLeft > 0) || !player?.collider?.move || !player.pos) { pushLeft = 0; return; }
    const t = now(), dt = Math.min(EG_PUSH_DT_MAX, Math.max(0, (t - pushAt) / 1000));
    pushAt = t;
    const step = Math.min(pushLeft, EG_PUSH_MPS * dt);
    if (!(step > 0)) return;
    player.collider.move(player.pos, pushX * step, 0, pushZ * step, player.height, !!player.grounded && !player.jumping);
    pushLeft -= step;
  }
  function holdFor(ms) {
    if (witness || !inSpire() || !player) return;
    player.freezeMotor = Math.max(player.freezeMotor || 0, Math.min(1, ms / 1000));
  }
  function ringKeep(x, z, r, inside) {
    if (witness || !inSpire() || !player?.pos) return;
    const E = link.state(), at = standing();
    if (!at || !(E.h > 0) || !(r > 0)) return;
    const spec = egHallOf(E.seed, E.h, E.geo ?? 0), lx = egLocalX(spec, at.sx), d = Math.hypot(lx - x, at.z - z);
    const rim = inside ? r - EG_RING_PAD : r + EG_RING_PAD;
    if (inside ? d <= rim : d >= rim) return;
    const ux = d > 1e-6 ? (lx - x) / d : 1, uz = d > 1e-6 ? (at.z - z) / d : 0;
    const q = egToDungeon(spec, x + ux * rim, 0, z + uz * rim);
    player.pos[0] = q[0]; player.pos[2] = q[2]; player._airVelX = 0; player._airVelZ = 0;
  }

  const pres = { memo: egBeatMemo(), acct: /** @type {number|null} */ (null), shown: 0, said: new Set(), b: null, absent: new Map(), perils: new Set(), perilH: 0, beatCycle: -1,
    gain: null, first: '', firstAt: 0, live: '', card: null, cardH: 0, cardAt: 0, cardFirst: true, prevSp: -1, focus: 0, foldOpen: false, rel: 0, relAt: 0, touch: /** @type {boolean|null} */ (null),
    pingAt: 0, sightH: 0,
    restP: /** @type {{ b: string, h: number, p: number }|null} */ (null) };
  const FIRST_SHOW_MS = 9000;
  const holdMemo = egHolderMemo();
  const playSound = (S) => { if (!S?.rec && S?.rec !== 0) return; try { bus().beat(S); } catch { } };
  function beatNow(k, w = {}) {
    const plan = egBeatPlan(k, w);
    playSound(plan.sound);
    if (plan.screen) mid(plan.screen);
    if (plan.chat) say(plan.chat);
    const words = plan.screen ?? plan.chat;
    if (words) pres.live = words;
    return plan;
  }
  const firstDevice = () => egFirstRead(store, egFirstKey(me())) | egFirstRead(store);
  const firstBits = () => egFirstOver(firstDevice(), pres.acct, pres.shown);
  // The service ORs these bits, so a lost update is carried by the next one.
  function firstShown(fresh) {
    pres.shown |= fresh;
    egFirstWrite(store, firstDevice() | fresh, egFirstKey(me()));
    tellFirst();
  }
  async function tellFirst() {
    if (!me() || account?.guest?.() || typeof account?.first !== 'function') return;
    try { const a = await account.first(firstBits()); if (a?.ok && Number.isSafeInteger(a.data?.first) && a.data.first >= 0) pres.acct = a.data.first; } catch { }
  }
  function teach(keys) {
    if (!keys.length) return;
    const before = firstBits(), { due, bits } = egFirstDue(before, keys);
    if (!due.length) return;
    firstShown(bits & ~before);
    for (const line of due) say(line);
    pres.first = due.at(-1); pres.firstAt = now(); pres.live = pres.first;
  }
  function castBackBeat(cost, share = EG_CAST_BACK_LOSS) {
    if (cost) beatNow('castBack', { t: EG_PRES_TEXT.castBackCost(share) }); else playSound(EG_BEAT_SOUNDS.rewind);
    teach(['void']);
  }
  let tollH = 0;
  function payToll(q, h) {
    if (witness || !(entity.health > 0) || !inSpire() || h === tollH) return;
    tollH = h;
    const cut = Math.min(Math.round(q * EG_TOLL_STEP * spireBodyMax(entity)), entity.health - 1);
    if (!(cut > 0)) return;
    hurt(cut);
    playSound(EG_BEAT_SOUNDS.toll);
    const took = cut / (entity.maxHealth || 1);
    mid(EG_PRES_TEXT.toll(took));
    say(EG_PRES_TEXT.tollLine(took));
    pres.live = EG_PRES_TEXT.tollLine(took);
  }
  function recapOpened() { pres.rel = 0; pres.relAt = Date.now(); egRecapKeep(store, recap); }
  function feetInHall(E) {
    const at = standing();
    if (!at || !(E.h > 0) || at.slot !== egSlotOfHall(E.h)) return null;
    const spec = egHallOf(E.seed, E.h, E.geo ?? 0), y = dungeonToRealm(...player.pos)[1];
    return { spec, x: egLocalX(spec, at.sx), y, z: at.z };
  }
  function lightsNow() {
    const E = link.state();
    let ys = null;
    if (E.pings?.length) {
      ys = new Map();
      if (player?.pos && !witness) ys.set(me(), dungeonToRealm(player.pos[0], player.pos[1], player.pos[2])[1]);
      for (const q of peers()) if (q?.pos) ys.set(q.sub, dungeonToRealm(q.pos[0], q.pos[1], q.pos[2])[1]);
    }
    return egSpireLights(E, now(), { witness: !!witness, still: stillNow(), palette: egAccessNow(win).palette, ys });
  }
  function pingPlace(E) {
    if (!(E.h > 0)) return null;
    const spec = egHallOf(E.seed, E.h, E.geo ?? 0);
    const q = witness?.watched ? peers().find((p) => p.sub === witness.watched) : null;
    if (q?.pos) { const [sx, , z] = dungeonToRealm(q.pos[0], q.pos[1], q.pos[2]); return { x: egLocalX(spec, sx), z }; }
    const at = standing();
    return at ? { x: egLocalX(spec, at.sx), z: at.z } : null;
  }
  function choices(E) {
    const items = [];
    const cards = E.offer?.v?.length ? E.offer.v.length : 0;
    if (cards) { for (const v of E.offer.v) items.push({ k: 'card', v }); if ((E.sp ?? 0) > 0) items.push({ k: 'surplus', use: 0 }, { k: 'surplus', use: 1 }); }
    for (const a of (E.as ?? []).filter((q) => q[2] > now())) egAskText(a[0], a[1]).opts.forEach((_, y) => items.push({ k: 'opt', q: a[0], y }));
    return { n: items.length, cards, items };
  }
  const padCtx = () => { const E = link.state(); return { recap: !!recap, panel: inSpire() && !E.end && choices(E).n > 0, witness: inSpire() && !!witness, bridge: bridgeGap() >= 0 }; };
  const hudScaleNow = () => { try { return /** @type {any} */ (globalThis.document?.querySelector?.('.hud'))?.style?.getPropertyValue?.('--hud-scale') || ''; } catch { return ''; } };
  const rgbCss = (c) => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  function watchedOf(E) {
    const m = witness?.watched ? egMemberOf(E, witness.watched) : null;
    if (!m) return null;
    const p = (party() ?? []).find((q) => q?.sub === witness.watched);
    return { numeral: EG_NUMERALS[m.n] ?? '', name: m.name, pct: p && p.hm > 0 && Number.isFinite(p.h) ? Math.max(0, Math.min(100, (p.h / p.hm) * 100)) : null };
  }
  function presFrame(E, t) {
    if (pres.b !== E.b) { pres.b = E.b; pres.said = new Set(); pres.cardFirst = true; pres.cardH = 0; pres.prevSp = -1; pres.absent = new Map(); }
    const { beats, firsts, runes } = egBeatWatch(pres.memo, E, me());
    for (const pt of runes) { playSound(egRuneChime(pt)); pres.live = `Rune ${EG_NUMERALS[pt] ?? pt}`; }
    for (const b of beats) {
      beatNow(b.k, b);
      if (b.k === 'redoubt' && E.redoubt) { const text = egGainText(E.redoubt, { press: egPressInForce(E), leftAfter: E.redoubt.cl ?? 0, lastWordLeft: E.op + EG_LAST_WORD_MS - (E.redoubt.at ?? t) }); if (text) pres.gain = { text, at: t }; }
      if (b.k === 'goldRun') pres.gain = { text: EG_PRES_TEXT.gain('1:00', ''), at: t };
    }
    teach(firsts);
    let pinged = false;
    for (const q of E.pings ?? []) if (q.at > pres.pingAt) { pres.pingAt = q.at; pinged = true; }
    if (pinged) playSound(EG_BEAT_SOUNDS.chime);
    if (witness && E.h > 0 && pres.sightH !== E.h) { pres.sightH = E.h; const line = egWitnessTwist(E); if (line) { say(EG_LIGHTS_TEXT.sight(line)); pres.live = EG_LIGHTS_TEXT.sight(line); } }
    if (pres.prevSp >= 0 && (E.sp ?? 0) > pres.prevSp) pres.gain = { text: EG_PRES_TEXT.surplus, blue: true, at: t };
    pres.prevSp = E.sp ?? 0;
    if (E.rh && E.wk > 0 && E.sg === 'trial') {
      const before = firstBits(), r = egRehearsalDue(before);
      if (r.line) { firstShown(r.bits & ~before); say(r.line); pres.first = r.line; pres.firstAt = t; }
    }
    for (const k of egChipWarnings(pres.said, E, t)) {
      const W = EG_CHIP_WARNINGS[k];
      if (W.toll) playSound(EG_BEAT_SOUNDS.toll);
      if (W.words) { const line = W.words(); mid(line); say(line); pres.live = line; }
    }
    if (E.h > 0 && E.h !== pres.cardH && (E.sg === 'arrive' || E.sg === 'trial')) { pres.cardH = E.h; pres.cardAt = t; pres.card = egArrivalCard(E, { first: pres.cardFirst }); pres.cardFirst = false; if (pres.card) pres.live = egArrivalLive(pres.card); }
    const acc = egAccessNow(win);
    drawEgArrivalCard(egArrivalShown(pres.card, pres.cardAt, t), { hidden: hudHidden(), still: acc.still });
    if (witness?.fall && t - witness.fall.at >= EG_FALL_MS) witness.fall = null;
    drawEgFall(witness?.fall ? egFallModel(witness.fall, t, { still: acc.still }) : null, { hidden: hudHidden(), danger: rgbCss(acc.palette.danger) });
    pres.absent = egAbsentStep(pres.absent, E, me(), new Set(peers().map((q) => q.sub)), t);
    const F = feetInHall(E);
    const buzzOn = !!getPref('touchHaptics');
    if (pres.perilH !== E.h) { pres.perilH = E.h; pres.perils.clear(); }
    if (F && !witness) {
      const cyc = egBeatUnder(F.spec, F.x, F.y, F.z, t / 1000);
      if (cyc >= 0 && cyc !== pres.beatCycle) { pres.beatCycle = cyc; egBuzz('beat', { on: buzzOn }); }
      if (E.fight?.h === E.h && egPerilsNew(E.fight.blows, F.x, F.z, pres.perils, t).length) egBuzz('peril', { on: buzzOn });
    }
    const door = F && E.sg === 'closing' && F.spec.end && !witness ? egDoorMarker({ x: F.x, z: F.z }, F.spec.end, cam?.yaw ?? 0) : null;
    const ff = egFormFactor({ w: win?.innerWidth ?? 1280, h: win?.innerHeight ?? 720 });
    const P = choices(E);
    pres.focus = P.n > 0 ? Math.min(pres.focus, P.n - 1) : 0;
    for (const n of spireVestigeNews()) beatNow(n.k, n);
    const held = egHolderWatch(holdMemo, egHolderNow(witness ? null : fight, E, me(), spireWeaveReady()), t, E.h);
    for (const b of held.beats) beatNow(b.k, b);
    const model = egSpireHudModel(E, me(), t, { ff, witness: !!witness, potions, gain: pres.gain && t - pres.gain.at < EG_GAIN_MS ? pres.gain : null,
      first: pres.first && t - pres.firstAt < FIRST_SHOW_MS ? pres.first : '', door, live: pres.live, touch: pres.touch ??= isTouchDevice(win), foldOpen: pres.foldOpen, held: held.chips, bridge: bridgeGap() >= 0,
      watch: witness ? watchedOf(E) : null, ping: witness ? pingLeft() : 0, restP: pres.restP?.b === E.b && pres.restP.h === E.h ? pres.restP.p : 1 });
    drawEgSpireHud(model, { hidden: hudHidden(), skin: isEnhanced() ? 'enhanced' : 'classic', still: acc.still, danger: rgbCss(acc.palette.danger), scale: hudScaleNow(),
      onTouch: (id) => touchAct(id), onFold: () => { pres.foldOpen = !pres.foldOpen; } });
  }
  function presAway() { drawEgSpireHud(null); drawEgArrivalCard(null); drawEgFall(null); }
  function padGesture(dir, kind) {
    const ctx = padCtx(), act = egPadAct(dir, kind, ctx);
    if (!act) return false;
    const E = link.state(), o = online();
    if (act.k === 'close') { recap = null; drawEgPanel(null); return true; }
    if (act.k === 'watch') { watchStep(act.d); return true; }
    if (act.k === 'forsake') { api.command('forsake'); return true; }
    if (act.k === 'ping') { pingSay(0); return true; }
    if (act.k === 'bridge') return bridgeAsk();
    const P = choices(E), it = P.items[pres.focus];
    if (act.k === 'focus' && P.n > 0) { pres.focus = (pres.focus + act.d + P.n) % P.n; return true; }
    if (act.k === 'take' && it?.k === 'surplus') { o?.sendEg?.('surplus', { use: it.use }); return true; }
    if (act.k === 'take' && it?.k === 'card') { o?.sendEg?.('pick', { v: it.v }); return true; }
    if (act.k === 'take' && it?.k === 'opt') { voted[it.q] = it.y; o?.sendEg?.('vote', { q: it.q, y: it.y }); return true; }
    if (act.k === 'no' && it?.k === 'opt' && YES_NO_ASKS.includes(it.q)) { voted[it.q] = 0; o?.sendEg?.('vote', { q: it.q, y: 0 }); return true; }
    if (act.k === 'no') return api.vote('no');
    return false;
  }
  function watchStep(d) { if (witness) { witness.idx += d; if (witness.idx < 0) witness.idx += 8; witness.watched = null; } }
  function touchAct(id) {
    if (id === 'prev' || id === 'next') { watchStep(id === 'next' ? 1 : -1); return true; }
    if (id === 'ping') { pingSay(0); return true; }
    if (id === 'forsake') { api.command('forsake'); return true; }
    if (id === 'home') return api.wayHome();
    if (id === 'bridge') return bridgeAsk();
    return false;
  }
  let bridgeAskedAt = -Infinity;
  function bridgeWhy() {
    const E = link.state();
    if (!inSpire() || witness || E.end || !(E.h > 0) || egRunOfMember(E, me()).mast !== EG_SPIREBRIDGE_ID) return EG_PRES_TEXT.bridgeNot;
    if (E.sg !== 'trial' && E.sg !== 'closing') return EG_PRES_TEXT.bridgeNone;
    if ((E.fight?.bridges ?? []).some((q) => q.h === E.h && q.s === me())) return EG_PRES_TEXT.bridgeSpent;
    return '';
  }
  function bridgeGap() {
    if (bridgeWhy() || Date.now() - bridgeAskedAt < 1000) return -1;
    const F = feetInHall(link.state());
    return F ? egBridgeAhead(F.spec, F.x, F.z) : -1;
  }
  function bridgeAsk() {
    const why = bridgeWhy();
    if (why) { say(why); return true; }
    if (Date.now() - bridgeAskedAt < 1000) return true;
    if (bridgeGap() < 0) { say(EG_PRES_TEXT.bridgeNone); return true; }
    bridgeAskedAt = Date.now();
    return !!online()?.sendEg?.('mast');
  }

  let chart = null, chartFor = null;
  function chartFrame(E) {
    const C = E.chart;
    if (C && C !== chartFor) {
      chartFor = C;
      const spec = egHallOf(E.seed, C.h, E.geo ?? 0), L = EG_LORDS[spec.lord];
      chart = { at: Date.now(), fell: egChartFell(E), lord: L?.name ?? EG_TEXT.name, plural: spec.lord === 'twins', me: egMemberOf(E, me())?.name ?? null };
    }
    if (!chart) return;
    const model = damageChartModel(chart.fell, { boss: chart.lord, me: chart.me, since: chart.at, now: Date.now(), crystals: EG_PRES_TEXT.chartLord });
    if (model) model.sub = EG_PRES_TEXT.chartSub(chart.lord, chart.fell?.n ?? 0, chart.plural);
    drawGateDamageChart(model, { hidden: hudHidden() });
    if (!model && Date.now() - chart.at >= DAMAGE_CHART_DELAY_MS + DAMAGE_CHART_MS) { chart = null; drawGateDamageChart(null); }
  }
  function chartAway() { if (chart) { chart = null; drawGateDamageChart(null); } }
  // Only whole points are sent; the fraction owed to each caster carries over to the next send.
  const healOwed = new Map();
  let healSentAt = -Infinity;
  function healSend(t) {
    healSentAt = t;
    const h = [];
    for (const [by, n] of healOwed) if (n >= 1 && h.length < GATE_HEAL_ROWS_MAX) h.push([by, Math.min(Math.floor(n), GATE_HEAL_WIRE_MAX)]);
    if (!h.length || !online()?.sendEg?.('heal', { h })) return;
    for (const [by, n] of h) { const left = healOwed.get(by) - n; if (left > 0) healOwed.set(by, left); else healOwed.delete(by); }
    lifelineSaid(h);
  }
  let lowAt = -Infinity;
  // The Lifeline window opens when the heal word reaches the room, estimated as the shared clock plus half the
  // measured round trip, matching the census.
  function lifelineSaid(h) {
    const min = egLifelineMin(Math.max(1, entity.level | 0));
    const t = now(), v = egLifelineOf(link.state(), me(), h.filter(([, n]) => n >= min).map(([by]) => accountOf(by)));
    if (v > 0 && t - lowAt <= EG_LIFELINE_LOOK_MS) fight?.lifeline?.(v, t + egClockHalfRtt(clock));
  }
  function openedHeard(b, n) {
    if (recap?.b !== b || recap.opened === n) return;
    recap = { ...recap, opened: n, reliquaries: n };
    pres.rel = Math.min(pres.rel, n);
  }
  const boards = new Map();
  function boardHeard(b, board) {
    const line = egBoardLine(board);
    if (!line) return;
    boards.set(b, line);
    if (boards.size > EG_RECAPS_BOARDS) boards.delete(boards.keys().next().value);
    if (recap?.b === b && recap.board !== line) recap = { ...recap, board: line };
    egRecapBoardKeep(store, b, line);
  }

  const lawAsked = new Map(), lawGot = new Set();
  let lawSaid = '', lawBuilt = '';
  const givenMemo = { k: '', v: /** @type {any[] | null} */ (null) };
  function lawForget() { egSpecForget(); lawGot.clear(); lawAsked.clear(); lawBuilt = ''; givenMemo.k = ''; givenMemo.v = null; digestSeen.k = ''; trailForget(); }

  const trail = { b: '', h: 0, first: '', routes: new Map(), segs: new Float32Array(EG_TRAIL.max * 6), n: 0 };
  function trailForget() { trail.b = ''; trail.h = 0; trail.first = ''; trail.routes.clear(); trail.n = 0; }
  function trailFrame(E) {
    if (trail.b !== E.b || trail.h !== E.h) { trailForget(); trail.b = E.b; trail.h = E.h; }
    trail.n = 0;
    if (!(E.h > 0) || (E.sg !== 'trial' && E.sg !== 'closing')) return;
    const spec = egHallOf(E.seed, E.h, E.geo ?? 0);
    if (spec.kind !== 'span' && spec.kind !== 'brink') return;
    const tS = now() / 1000, slot = egSlotOfHall(E.h);
    if (player?.pos && !witness) trailKeep(spec, slot, me(), player.pos, tS);
    for (const q of peers()) if (q?.pos && livingOf(E, q.sub)) trailKeep(spec, slot, q.sub, q.pos, tS);
    if (E.sg === 'closing' && trail.first && trail.first !== me()) trail.n = egTrailSegs(trail.routes.get(trail.first), spec, tS, trail.segs);
  }
  const R0 = dungeonToRealm(0, 0, 0);
  function trailKeep(spec, slot, sub, p, tS) {
    const sx = p[0] + R0[0];
    if (egSlotAt(sx) !== slot) return;
    let route = trail.routes.get(sub);
    if (!route) trail.routes.set(sub, (route = []));
    egRibbonPush(route, spec, egLocalX(spec, sx), p[1] + R0[1], p[2] + R0[2], tS);
  }
  function livingOf(E, sub) { for (const c of E.co ?? []) if (c[0] === sub) return c[3] === 1 && c[5] === 1; return false; }
  const ALLY_VEIL = Object.freeze({ mode: CONCEAL_MODE.reveal, alpha: 0.6, t: 0, phase: 0, named: true });
  const lawOff = new Set();
  const digestSeen = { k: '', off: false };
  function lawForeign(E) { return (E.egv > 0 && E.egv !== EG_SPEC) || lawOff.has(E.b); }
  function digestOff(E) {
    if (!(E.dg > 0)) return false;
    const k = `${E.b}:${E.h}:${E.geo ?? 0}:${E.dg}`;
    if (digestSeen.k !== k) {
      digestSeen.k = k;
      const mine = egSpecDigest(egHallOf(E.seed, E.h, E.geo ?? 0));
      digestSeen.off = mine !== E.dg;
      if (digestSeen.off) console.warn(`[eg] hall ${E.h} drawn otherwise than the room's (${mine} against ${E.dg}) - its halls asked of the room`);
    }
    return digestSeen.off;
  }
  function lawFrame(E) {
    if (!E.b || !(E.h > 0) || E.end) return;
    if (!lawForeign(E) && digestOff(E)) lawOff.add(E.b);
    if (!lawForeign(E)) return;
    if (lawSaid !== E.b) { lawSaid = E.b; if (!lawOff.has(E.b)) say(EG_LAW_TEXT); }
    const c = egCircleOfHall(E.h), o = online(), geo = (E.geo ?? 0) | 0;
    for (let h = (c - 1) * 5 + 1, last = (E.sg === 'rest' ? c + 1 : c) * 5; h <= last; h++) {
      const k = `${E.b}:${h}:${geo}`;
      if (lawGot.has(k) || Date.now() - (lawAsked.get(k) ?? -Infinity) < EG_SPEC_ASK_MS) continue;
      if (o?.sendEg?.('spec', { h })) lawAsked.set(k, Date.now());
    }
    lawRebuild(E);
  }
  function lawTook(w) {
    const E = link.state();
    if (!E.b || w.egv !== E.egv || w.sp?.seed !== E.seed || !egSpecGive(w.sp)) return;
    lawGot.add(`${E.b}:${w.h}:${(w.sp.geo ?? 0) | 0}`);
    lawRebuild(E);
  }
  // `lawBuilt` is set only after the step runs, so a step held behind a swap or an answer is retried on the next
  // frame.
  async function lawRebuild(E) {
    const c = egCircleOfHall(E.h), key = `${E.b}:${c}`;
    if (lawBuilt === key || !inSpire() || modes()?.egHallCircle?.() !== c || swapping || answering) return;
    if (!lawGiven(E, c)) return;
    if (await swapTo(E, c)) lawBuilt = key;
  }
  function lawGiven(E, c) {
    const geo = (E.geo ?? 0) | 0;
    for (let h = (c - 1) * 5 + 1; h <= c * 5; h++) if (!lawGot.has(`${E.b}:${h}:${geo}`)) return null;
    const k = `${E.b}:${c}:${geo}`;
    if (givenMemo.k !== k) { givenMemo.k = k; givenMemo.v = []; for (let h = (c - 1) * 5 + 1; h <= c * 5; h++) givenMemo.v.push(egHallOf(E.seed, h, geo)); }
    return givenMemo.v;
  }
  // The worker shares no state with this thread, so the given halls go with the ask.
  function prebuild(E, c) {
    const given = lawForeign(E) ? lawGiven(E, c) : undefined;
    return given === null ? null : modes()?.egPrebuild?.({ b: E.b, seed: E.seed, c, geo: E.geo ?? 0, given }) ?? null;
  }

  const _batchList = [];
  const objsMemo = { E: null, here: false, v: /** @type {any} */ (null) };
  const api = {
    link,
    word(w, room) {
      if (!w) return;
      if (w.k === 'clk') { egClockHeard(clock, w.c, w.now, Date.now()); return; }
      if (w.k === 'bd') { countFell(); return; }
      link.word(w);
      if (w.k === 'spec') { lawTook(w); return; }
      if (w.k === 'esay' && w.w === 'door' && w.s?.[0]) { const E = link.state(); if (trail.b === E.b && trail.h === E.h) trail.first = w.s[0]; }
      if (w.k === 'call') {
        if (opening && w.os === me()) opening = null;
        if (w.os === me()) stakeDrop((s) => s.b === w.b);
        const key = `${w.b}`;
        if (callSaid !== key && w.co.some((r) => r[0] === me())) {
          callSaid = key;
          if (hornFor !== key) { hornFor = key; soundEgHorn(audio); }
          say(w.os === me() ? `Your ${w.rh ? 'Rehearsal' : 'Elite Breach'} rises and opens in ${egCountText(egTimes({ openedAt: w.op }).openAt - now())}. Step through the arch, or answer the call where you stand.` : EG_TEXT.call(w.o || 'Your company'));
        }
      }
      if (w.k === 'fall' && w.s !== me()) say(`${EG_TEXT.falls(w.n || 'A companion')}${w.fin ? ' The Spire will not take them back.' : ''}`);
      if (w.k === 'down' && w.s !== me()) say(t('eg.downOther', '{name} is down. Raise them before they fall!', { name: w.n || 'A companion' }));
      if (w.k === 'down' && w.s === me() && witness) lieDown(w.until);
      if (w.k === 'fall' && w.s === me() && witness?.down) { witness.down = 0; witness.fall = { at: now(), final: !!w.fin, lost: relHeld, eye: null }; }
      if (w.k === 'fall' && w.s === me() && witness?.fall) witness.fall.final = !!w.fin;
      if (w.k === 'fall' && w.s === me() && !witness) enterWitness(now(), true, w.fin);
      if (w.k === 'rise' && w.s === me()) riseAt(w);
      if (w.k === 'eheal') applyHeal(w.p, w.why);
      if (w.k === 'eheal' && w.why === 'rest') { const S = link.state(); pres.restP = { b: S.b ?? '', h: S.h | 0, p: Number(w.p) || 1 }; }
      if (w.k === 'eheal' && (w.why === 'rally' || (w.why === 'cry' && w.p > 0))) fight?.rally?.(now() - egClockHalfRtt(clock));
      if (w.k === 'eheal' && (w.why === 'rally' || w.why === 'cry') && w.p > 0 && !witness && entity.health > 0 && inSpire()) beatNow('rally', { t: w.p });
      if (w.k === 'eheal' && w.why === 'cry' && !witness && entity.health > 0 && inSpire()) spireRallyingCry();
      if (w.k === 'toll') payToll(w.q, w.h);
      if (w.k === 'eland') fight?.landed?.(w.i, w.d);
      if (w.k === 'efair' && EG_FAIR_TEXT[w.w]) { unfair = { h: link.state().h | 0, w: w.w }; mid(EG_FAIR_TEXT[w.w]()); say(EG_FAIR_TEXT[w.w]()); }
      if (w.k === 'ebridge') say(w.s === me() ? EG_PRES_TEXT.bridgeMine : EG_PRES_TEXT.bridgeRaised(w.n || 'A companion'));
      if (w.k === 'egot' && w.w === 'page' && EG_ANNALS[w.p]) { annals.add(w.p); say(`A page of the Annals of 3E 398: ${EG_ANNALS[w.p][0]}: ${EG_ANNALS[w.p][1]}`); }
      else if (w.k === 'egot' && EG_GOT_TEXT[w.w]) say(EG_GOT_TEXT[w.w]);
      if (w.k === 'egot' && w.w === 'longstep') longStepHeard(link.state());
      if (w.k === 'rd') say(w.cov ? `${EG_TEXT.redoubt(w.w)}: the Covenant has spoken. This Redoubt is the last.` : `${EG_TEXT.redoubt(w.w)}: the count gains ${egCountText(Math.max(0, w.g ?? 0))}.`);
      void room;
    },
    command(arg = '') {
      const parts = String(arg).trim().toLowerCase().split(/\s+/).filter(Boolean), a = parts[0] ?? '', b = parts[1] ?? '';
      if (a === 'rehearse' || a === 'rehearsal') { const no = openRefusal(); if (no) { say(no); return; } open(true); say(EG_TEXT.opening); return; }
      if (a === 'home') { this.wayHome(); return; }
      if (a === 'board' || a === 'boards') { if (!board?.()) say('The boards cannot be read just now.'); return; }
      if (a === 'annals') { annalsSay(b); return; }
      if (a === 'help' || a === '?') { say(inSpire() ? egBreachUsage() : egBreachUsageOut()); return; }
      const o = online(), E = link.state();
      if (inSpire()) {
        if (a === 'pick') { const n = Number(b) | 0, card = E.offer?.v?.[n - 1]; if (card == null) say('No Vestige waits for that number.'); else o?.sendEg?.('pick', { v: card }); return; }
        if (a === 'vote') { if (b === 'respite') respiteVote(parts[2] ?? 'yes'); else this.vote(b); return; }
        if (a === 'respite') { respiteVote(b || 'yes'); return; }
        if (a === 'cant' || a === 'cantrip') { const run = egRunOfMember(E, me()), n = (Number(b) | 0) - 1; if (n < 0 || n >= run.cant.length) say(run.cant.length ? `Your Cantrips: ${run.cant.map((c, j) => `${j + 1}. ${EG_CANTRIPS[c]?.name}`).join(', ')}.` : 'You hold no Cantrip.'); else o?.sendEg?.('cant', { i: n }); return; }
        if (a === 'tonic') { if (!(egRunOfMember(E, me()).tonics > 0)) say(EG_TONIC_TEXT.none); else if (witness) say(EG_TONIC_TEXT.fallen); else o?.sendEg?.('tonic'); return; }
        if (a === 'buy') { const i = { cant: 0, cantrip: 0, tonic: 1, shard: 2 }[b]; if (i == null) say('The Sutler sells a Cantrip (20 lumen), a Spire Tonic (15) or a Vestige shard (30): /breach buy cant|tonic|shard.'); else o?.sendEg?.('buy', { i }); return; }
        if (a === 'surplus') { o?.sendEg?.('surplus', { use: b === 'reroll' ? 1 : 0 }); return; }
        if (a === 'ping') { pingSay({ danger: 1, mine: 2, cache: 2 }[b] ?? 0); return; }
        if (a === 'watch') { if (witness) { witness.idx++; witness.watched = null; } return; }
        if (a === 'forsake') {
          if (!witness) { say('Only the fallen may forsake the breach.'); return; }
          if (Date.now() - forsakeAskAt > EG_HOME_CONFIRM_MS) { forsakeAskAt = Date.now(); mid('Forsake the breach? Your recall is lost. Forsake again to go.'); return; }
          forsakeAskAt = -Infinity; o?.sendEg?.('forsake'); return;
        }
        if (a === 'use' || a === 'engine') { this.useEngine(); return; }
        if (a === 'bridge' || a === 'spirebridge') { bridgeAsk(); return; }
        if (a === 'bequest') { const run = egRunOfMember(E, me()), n = (Number(b) | 0) - 1, v = run.vs[n]?.[0]; if (!witness || v == null) say('The fallen may pass on one Vestige: /breach bequest N.'); else o?.sendEg?.('bequest', { v }); return; }
        say(egBreachUsage());
        return;
      }
      if (a === '') { if (callMine(E) || returnable()) answer(); else startOpen(); return; }
      say(egBreachUsageOut());
    },
    vote(y) {
      const E = link.state(), o = online(), open = (E.as ?? []).filter((q) => q[2] > now());
      if (!open.length) { say(NO_CHOICE_TEXT); return false; }
      const yn = y === 'yes' || y === 'y' ? 1 : y === 'no' || y === 'n' ? 0 : null;
      const n = Number(y) | 0;
      const resp = (q) => q[0] === 'respite', dec = (q) => q[0].startsWith('dec:');
      const ask = yn != null
        ? open.find((q) => q[0] === 'ready') ?? [...open].reverse().find((q) => !dec(q) && !resp(q)) ?? (open.some(resp) ? null : open[open.length - 1])
        : open.find((q) => dec(q) && voted[q[0]] == null) ?? [...open].reverse().find((q) => !resp(q)) ?? open[open.length - 1];
      if (!ask) { say(egRespiteHow()); return false; }
      const val = yn != null ? yn : Math.max(0, n - 1);
      voted[ask[0]] = val;
      return !!o?.sendEg?.('vote', { q: ask[0], y: val });
    },
    respite: (word = 'yes') => respiteVote(word),
    key(e) {
      const code = e?.code ?? '';
      if (!inSpire() && EG_CALL_KEYS.includes(code) && this.promptModel()?.answerable) { answer(); return true; }
      if (!inSpire() && !recap) return false;
      if (recap && (code === 'Enter' || code === 'Escape' || EG_PAD_DIRS[code] === 'up')) { recap = null; drawEgPanel(null); return true; }
      if (!inSpire()) return false;
      const E = link.state(), o = online(), m = /^Digit([1-6])$/.exec(code);
      if (witness?.down && code === 'Enter') { o?.sendEg?.('yield'); return true; }
      if (witness && (code === 'KeyQ' || code === 'KeyE')) { watchStep(code === 'KeyE' ? 1 : -1); return true; }
      if (witness && EG_PAD_SHOULDERS[code]) { watchStep(EG_PAD_SHOULDERS[code]); return true; }
      const dir = EG_PAD_DIRS[code];
      if (dir && egPadUp(padCtx())) return padGesture(dir, dir === 'down' && witness ? 'hold' : 'tap');
      if (m && E.offer?.v?.length) { const card = E.offer.v[Number(m[1]) - 1]; if (card != null) { o?.sendEg?.('pick', { v: card }); return true; } }
      const open = (E.as ?? []).filter((q) => q[2] > now());
      if (code === 'KeyR' && open.some((q) => q[0] === 'respite')) return respiteVote('yes');
      if (open.length && (code === 'KeyY' || code === 'KeyN')) return this.vote(code === 'KeyY' ? 'yes' : 'no');
      if (open.length && m) return this.vote(m[1]);
      if (code === 'KeyB' && bridgeGap() >= 0) return bridgeAsk();
      return false;
    },
    fallSave() { if (!inSpire() || witness) return false; enterWitness(now(), false); return true; },
    witnessing: () => !!witness,
    // The collision pull-in applies after damping, so the camera never eases into the wall.
    witnessEye(c, yaw = 0, { dt = 0, cast = null } = {}) {
      const F = witness?.fall?.eye ? egFallModel(witness.fall, now(), { still: egReducedMotion(win) }) : null;
      if (F?.eye === 'fall') { const e = witness.fall.eye; c.pos = [e[0], e[1] - F.sink, e[2]]; return true; }
      if (!witness?.watched) return false;
      const p = peers().find((q) => q.sub === witness.watched);
      if (!p?.pos) return false;
      witness.eye = egWitnessDamp(witness.eye?.who === witness.watched ? witness.eye : null, egWitnessOrbit(p.pos, yaw), dt, witness.watched);
      c.pos = egWitnessClear(p.pos, witness.eye.p, cast);
      return true;
    },
    potionAllowed: () => !inSpire() || potions > 0,
    potionUsed() { if (inSpire()) { potions = Math.max(0, potions - 1); potionsKeep(); } },
    push: (dx, dz, m) => pushBy(dx, dz, m),
    footing: () => (inSpire() ? footing() : 0),
    hold: (ms) => holdFor(ms),
    ring: (x, z, r, inside) => ringKeep(x, z, r, inside),
    useKey,
    frame() {
      const t = now(), E = link.state();
      spireHolderStep(entity, holderNow());
      seedFrame();
      if (Date.now() - keysAt >= EG_KEYS_EVERY_MS) askKeys();
      if (Date.now() - claimAt >= EG_CLAIM_RETRY_MS) flush();
      stakeFrame();
      openAgainFrame();
      if (opening?.z) sendOpen();
      if (opening && opening.tries >= EG_OPEN_TRIES && Date.now() - opening.sentAt > EG_OPEN_RETRY_MS * 2) { opening = null; say(EG_TEXT.shut); }
      if (E.call && !inSpire() && egPhase({ openedAt: E.call.op }, t) === 'ended' && !E.wk) link.forget();
      portalSet?.tick(cam?.pos ?? null);
      const o = online();
      if (o) { o.poseRide = inSpire() ? ridePl : null; o.rideAt = inSpire() ? rideDraw : null; o.poseDown = inSpire() ? downPose : null; }
      if (inSpire()) {
        const c = egClockDue(clock, Date.now());
        if (c != null && !o?.sendEg?.('clk', { c, h: egClockHalfRtt(clock) })) clock.sent.delete(c);
        if (!witness && entity.health > 0 && entity.maxHealth > 0 && egMemberOf(E, me())?.in) sayBody(entity.health / entity.maxHealth, Date.now());
        if (entity.health < entity.maxHealth * EG_LIFELINE_UNDER) lowAt = t;
      }
      if (returnable() && backSaid !== wayBack.b) { backSaid = wayBack.b; say(EG_BACK_TEXT.offer); }
      this.callFrame(t);
      if (inSpire()) {
        spireFrame(E, t);
        trailFrame(E);
        pushStep();
        fight ??= makeFight(link);
        fight?.landsWord?.(!!online()?.egLandOk);
        fight?.frame();
        presFrame(link.state(), t);
        if (healOwed.size && Date.now() - healSentAt >= EG_HEAL_SEND_MS) healSend(Date.now());
        if (!leaving) { reverbFrame(link.state()); clampFrame(link.state()); }
        air.frame(api.scoreView()?.place ?? null, t / 1000, cam?.pos ?? null, E.seed);
      } else {
        presAway();
        if (fight) { fight.leave(); }
        if (look) { look.release(); look = null; }
        // Keep the reverb, air, band textures, and swap build through a swap or an answer step; free them only on a
        // real way out.
        if (!swapping && !answering) reverb.release();
        if (!swapping && !answering) air.stop();
        if (!swapping && !answering) modes()?.egBandsDown?.();
        if (!swapping && !answering) { swapWaitAt = 0; modes()?.egSwapDrop?.(); lawForget(); }
        clampAway();
        if (leaving || (E.end && E.b)) { leaving = false; link.forget(); }
        if (door || portal) dropDoor();
      }
      drawEgHud(inSpire() ? null : egHudModel(link.state(), me(), t, { inSpire: false, witness: !!witness, potions }), { hidden: hudHidden() });
      chartFrame(link.state());
      if (recap && Date.now() > recapUntil) recap = null;
      if (recap && pres.rel < (recap.opened ?? 0) && Date.now() - pres.relAt >= 400) { pres.rel++; pres.relAt = Date.now(); playSound(EG_BEAT_SOUNDS.rare); }
      const panelModel = inSpire() ? egPanelModel(link.state(), me(), t, voted) : null;
      drawEgPanel(panelModel, { hidden: hudHidden() && !recap, recap, focus: pres.focus, relShown: pres.rel, words: EG_PRES_TEXT, onPick: (card) => online()?.sendEg?.('pick', { v: card }), onVote: (q, y) => { voted[q] = y; online()?.sendEg?.('vote', { q, y }); }, onSurplus: (use) => online()?.sendEg?.('surplus', { use }),
        touch: pres.touch ??= isTouchDevice(win), onClose: () => { recap = null; drawEgPanel(null); } });
    },
    fight: () => (inSpire() ? fight : null),
    trail: () => ({ first: trail.first, n: trail.n, segs: trail.segs.subarray(0, trail.n * 6) }),
    /**
     * @param {string|null|undefined} sub
     * @param {any} shown
     * @param {(p: any) => number[]} toScene
     */
    allyVeil(sub, shown, toScene) {
      if (!sub || !shown || sub === me() || !inSpire()) return null;
      const E = link.state();
      if (!(E.h > 0) || !livingOf(E, sub)) return null;
      const pos = toScene(shown);
      const sx = pos[0] + R0[0];
      if (egSlotAt(sx) !== egSlotOfHall(E.h)) return null;
      const spec = egHallOf(E.seed, E.h, E.geo ?? 0);
      return egFightFloorAt(spec, egLocalX(spec, sx), pos[1] + R0[1], pos[2] + R0[2]) ? null : ALLY_VEIL;
    },
    lights: () => (inSpire() ? fight?.lights() ?? [] : []),
    // Returns one reused list, refilled each frame, so the host must read it at once.
    batches() {
      _batchList.length = 0;
      if (!inSpire()) return _batchList;
      for (const b of fight?.batches() ?? NO_CLEARS) _batchList.push(b);
      for (const b of portalSet?.batches() ?? NO_CLEARS) _batchList.push(b);
      return _batchList;
    },
    drawPass(proj, view, eye, seconds, fog) {
      if (!inSpire()) return false;
      const L = lookCircle(link.state()), ts = now() / 1000, vp = renderer?._worldViewportPx ?? null, lane = !!renderer?.lightingLane, still = stillNow(), shining = lightsNow();
      const painted = !!L?.paintSky(vp, lane, ts);
      const under = !!L?.drawUnder(proj, view, eye, ts, fog);
      const air = !!L?.drawAir(proj, view, eye, ts, fog, lane, still, shining, vp?.[3] ?? 0);
      const drew = !!fight?.drawPass(proj, view, eye, seconds, fog);
      const ghosts = !!modes()?.dungeonCtx?.egSpanDraw?.(proj, view, fog);
      const over = !!L?.drawOver(proj, view, eye, ts, fog, egAccessNow(win).palette, renderer?._worldViewportPx, trail.n ? trail.segs : null, trail.n);
      const lit = !!L?.drawLights(proj, view, eye, ts, fog, shining, still);
      return painted || under || air || drew || ghosts || over || lit;
    },
    drawSky(proj, view, eye, seconds, fog, gain = 1) { return inSpire() ? !!lookCircle(link.state())?.drawSky(proj, view, seconds, fog, gain) : false; },
    scoreView() {
      if (!inSpire()) return null;
      const E = link.state(), t = now();
      if (!E.b || !(E.h > 0)) return null;
      const spec = egHallOf(E.seed, E.h, E.geo ?? 0), band = egBandOfCircle(egCircleOfHall(E.h)), lord = spec.kind === 'court' ? EG_LORDS[spec.lord] ?? null : null;
      const F = E.fight?.h === E.h ? E.fight : null, phase = F ? Math.max(1, ...F.phases.map((p) => p.ph | 0)) : 1;
      const valkKey = EG_VALKYNAZ[band], bandLord = lord ?? EG_LORDS[EG_BAND_LORDS[band]?.[0]];
      const wakeSay = spec.kind === 'court' ? (F?.says ?? []).filter((s) => s.w === 'wake').at(-1) : null;
      const asleep = spec.kind === 'court' && !wakeSay && !(F?.bodies ?? []).some((b) => b.role === EG_ROLE.lord && b.ph > 0);
      const sinceWake = spec.kind === 'court' ? (wakeSay ? t - wakeSay.at : Infinity) : E.hw > 0 ? t - E.hw : Infinity;
      return {
        place: { band, sg: E.sg, kind: spec.kind, lord: spec.lord ?? null, valk: !!lord?.valk, phase, countLeft: E.ca > 0 ? egCountAt(E, t) : NaN, set: !!spec.tube || spec.kind === 'brink', sinceWake, asleep, end: !!E.end,
          sinceFall: witness ? t - witness.fell : Infinity },
        ctx: { band, motif: bandLord?.motif ?? 0, valk: EG_LORDS[valkKey]?.motif ?? 3, seed: E.seed >>> 0 },
      };
    },
    castBack() {
      if (witness || !inSpire()) return;
      const share = egCastBackCost(egRunOfMember(link.state(), me()).vs), max = spireBodyMax(entity), cut = Math.min(share * max, Math.max(0, entity.health - EG_CAST_BACK_FLOOR * max));
      if (cut > 0) hurt(Math.round(cut));
      castBackBeat(cut > 0, Math.round(cut) / (entity.maxHealth || 1));
    },
    wayHome() {
      const E = link.state(), o = online();
      if (!inSpire() || E.sg !== 'rest') { say('The way home opens at a Redoubt.'); return false; }
      if (Date.now() - homeAskAt > EG_HOME_CONFIRM_MS) { homeAskAt = Date.now(); mid(`${EG_TEXT.walkHome} Press again to go.`); return false; }
      homeAskAt = -Infinity;
      return !!o?.sendEg?.('home');
    },
    gateOpen(h) {
      const E = link.state();
      return E.h > h || (E.h === h && (E.sg === 'closing' || E.sg === 'rest' || E.sg === 'end'));
    },
    // Call before the respawn leaves the Spire, since it reads whether the player is still inside.
    diedHere: () => inSpire(),
    onTraverse() {
      const E = link.state(), at = standing();
      if (!inSpire() || witness || !at || !(E.h > 0)) return false;
      if (!at.slot) return true;
      const spec = egHallOf(E.seed, (egCircleOfHall(E.h) - 1) * 5 + at.slot, E.geo ?? 0);
      return !egOnFight(spec, egLocalX(spec, at.sx), at.z, 0, at.y);
    },
    state: () => link.state(),
    quiet: () => inSpire() && egQuietCompany(link.state()?.sg, true).auras === 0,
    beaconAt(h) {
      const E = link.state(), at = inSpire() ? standing() : null;
      if (!E?.seed || !at || at.slot !== egSlotOfHall(h)) return null;
      const spec = egHallOf(E.seed, h, E.geo ?? 0), r = spec.ring, f = spec.fight ?? spec.end;
      if (!r || !f) return null;
      const floor = egToDungeon(spec, r.x, f.y ?? 0, r.z);
      return { at: [floor[0], floor[1] + EG_BEACON_SPEW_UP, floor[2]], keep: { centre: floor, r: Math.max(2, r.r - EG_BEACON_RIM_M), floorY: floor[1] } };
    },
    objs() {
      const E = link.state(), F = E.fight, here = inSpire();
      if (objsMemo.E === E && objsMemo.here === here) return objsMemo.v;
      objsMemo.E = E; objsMemo.here = here;
      const br = here ? (F?.bridges ?? []).filter((q) => q.h === E.h).map((q) => ({ g: q.g, from: q.at, until: q.until })) : [];
      if (!here || !F || F.h !== E.h) return (objsMemo.v = { h: E.h | 0, objs: [], lit: [], br });
      return (objsMemo.v = { h: E.h | 0, objs: F.bodies.filter((b) => b.role === EG_ROLE.obj).map((b) => ({ t: OBJ_NAME[b.k] ?? '', i: b.i, x: b.x, z: b.z, st: b.st ?? 0, stAt: b.stAt ?? 0, pt: b.pt ?? 0 })),
        lit: (F.zones ?? []).filter((z) => z.kind === 'haven').map((z) => ({ s: z.s, from: z.from, until: z.until })), br,
        orr: F.pg?.obj === 'orrery' && Array.isArray(F.pg.st) ? F.pg.st : null });
    },
    act(key) {
      const E = link.state(), o = online();
      if (!inSpire()) return false;
      const st = /^egstone:(\d+):(\d):([fb])$/.exec(key ?? '');
      if (st) {
        if (Number(st[1]) !== E.h || E.sg !== 'trial') { say('The Orrery is still.'); return true; }
        // The room accepts a turn only within `EG_STONE_REACH_M` of the stone in plan, while the ray offers the
        // handle from farther, so the reach is checked here.
        const at = standing(), spec = at ? egHallOf(E.seed, E.h, E.geo ?? 0) : null, q = spec?.spots?.stone?.[Number(st[2])];
        if (q && Math.hypot(q.x - egLocalX(spec, at.sx), q.z - at.z) > EG_STONE_REACH_M) { say(SD_HALL_TEXT.closer); return true; }
        return !!o?.sendEg?.('pz', { i: Number(st[2]), a: st[3] === 'f' ? 1 : -1 });
      }
      const en = /^egengine:(\d+):(\d+)$/.exec(key ?? '');
      if (en) { if (Number(en[1]) !== E.h || E.sg !== 'trial') { say('The engine is cold.'); return true; } const ok = !!o?.sendEg?.('use', { i: Number(en[2]) }); if (ok) mid('You work the engine.'); return ok; }
      return false;
    },
    useEngine() {
      const E = link.state(), at = standing();
      if (!inSpire() || !at) return false;
      const spec = egHallOf(E.seed, E.h, E.geo ?? 0), x = egLocalX(spec, at.sx);
      const e = (spec.engines ?? []).find((q) => Math.hypot(q.x - x, q.z - at.z) <= EG_ENGINE_REACH_M + 0.5);
      if (!e) { say((spec.engines ?? []).length ? `Stand at ${EG_ENGINES[spec.engines[0].kind].name} to work it.` : 'No engine stands in this hall.'); return false; }
      return this.act(`egengine:${E.h}:${e.i}`);
    },
    annals: () => [...annals].sort((a, b) => a - b),
    away() { fight?.leave(); if (look) { look.release(); look = null; } lawForget(); chartAway(); air.stop(); healOwed.clear(); dropDoor(); drawEgHud(null); drawEgPanel(null); presAway(); witness = null; const o = online(); if (o) { o.poseRide = null; o.rideAt = null; } callPortal?.clear?.(); prompt?.draw?.(null); const sw = startWin; startWin = null; sw?.close?.(); seedFrame({ silent: true }); spireHolderStep(entity, null); },
    sharedNow: () => now(),
    clockOffset: () => egClockOffset(clock),
    breachNow() { const off = egClockOffset(clock); return inSpire() && off != null ? Date.now() + off : null; },
    spanSeconds() {
      const off = egClockOffset(clock);
      if (!inSpire() || off == null) return null;
      if (!spanClock || Math.abs(off - spanOff) > EG_SPAN_REANCHOR_MS) { spanOff = off; spanClock = anchoredClock({ perf: () => performance.now(), wall: () => Date.now() + spanOff }); }
      return spanClock();
    },
    backRecord: () => wayBack,
    returnable: () => returnable(),
    ridePl: () => ridePl(),
    claimKeys() { setWeirKeyOpener(() => useKey()); },
    promptModel() {
      const E = link.state();
      if (returnable()) { if (windowUp()) return null; return (modes()?.mode ?? 'exterior') === 'exterior' ? { text: EG_BACK_TEXT.prompt, answerable: true, button: EG_BACK_TEXT.button, left: 0 } : { text: EG_TEXT.indoors, answerable: false, left: 0 }; }
      return egCallPromptModel({ call: E.call, me: me(), now: now(), inSpire: inSpire(), answered: !!answeredFor && answeredFor === E.call?.b && (!!callPortal?.standing?.() || answering || inSpire()),
        exterior: (modes()?.mode ?? 'exterior') === 'exterior', windowUp: !!windowUp(), wk: E.b === E.call?.b ? E.wk : 0 });
    },
    callFrame(t = now()) {
      const E = link.state();
      if (answeredFor && E.call?.b !== answeredFor && !inSpire()) answeredFor = '';
      arches?.call?.(E.call, { wk: E.b === E.call?.b ? E.wk : 0, end: E.end && E.b === E.call?.b ? t : 0 });
      if (callPortal) {
        const f = !inSpire() && (modes()?.mode ?? 'exterior') === 'exterior' ? feet() : null;
        callPortal.tick(f);
      }
      for (const line of arches?.sights?.(feet()) ?? []) say(line);
      prompt?.draw?.(this.promptModel());
    },
    archStep(b) { const c = link.state().call; if (c && c.b === b && !inSpire()) answer(true); },
    portalEntered,
    relayKey,
    timers() {
      const E = link.state(), c = E.call;
      if (!c || !c.co.some((r) => r[0] === me())) return null;
      const deep = E.b === c.b && E.h > 0;
      return { op: c.op, rh: c.rh, h: deep ? E.h : 0, until: deep ? (E.ca > 0 ? E.ca + E.cl : now() + E.cl) : null, end: E.b === c.b ? E.end : null };
    },
    archClears: () => arches?.clears?.() ?? NO_CLEARS,
    archCompass: () => (inSpire() ? egDoorCompass(link.state(), !!witness) : arches?.compass?.() ?? null),
    archMapMark: () => arches?.mapMark?.() ?? null,
    archWord: (near) => arches?.word?.(near) ?? null,
    archHeard: (peer, raw, from) => arches?.heard?.(peer, raw, from) ?? Promise.resolve(false),
    // An unrequested balance gets a fresh sequence number, so it applies as current, and the balance is asked again
    // to correct it.
    restack: (n) => { restack(n); askKeys(); },
    partyRows() {
      if (!inSpire()) return null;
      const E = link.state(), t = now(), roads = new Map();
      const spec = E.h > 0 ? egHallOf(E.seed, E.h, E.geo ?? 0) : null;
      if (spec?.fork) {
        for (const q of peers()) { const [sx, y, z] = dungeonToRealm(q.pos[0], q.pos[1] - 1.6, q.pos[2]); roads.set(q.sub, egRoadOf(spec, egLocalX(spec, sx), y, z)); }
        const F = feetInHall(E);
        if (F) roads.set(me(), egRoadOf(spec, F.x, F.y, F.z));
      }
      const tap = witness ? new Set((E.co ?? []).filter((c) => c[0] !== me() && c[3] === 1 && c[4] === 0 && c[5] === 1).map((c) => c[0])) : null;
      return egPartyDeco(egPartyRows(E, t, { absent: pres.absent, roads }), { tap });
    },
    watchMember(sub) {
      if (!witness || !inSpire() || sub === me()) return false;
      const living = (link.state().co ?? []).filter((c) => c[0] !== me() && c[3] === 1 && c[4] === 0 && c[5] === 1);
      const i = living.findIndex((c) => c[0] === sub);
      if (i < 0) return false;
      witness.idx = i; witness.watched = sub;
      return true;
    },
    padUp: () => egPadUp(padCtx()),
    padGesture: (dir, kind) => padGesture(dir, kind),
    padPrompts: () => egPadPrompts(padCtx()),
    touchAct: (id) => touchAct(id),
    beat: (k) => beatNow(k),
    healedBy(id, n) {
      if (!inSpire() || witness || !(n > 0) || typeof id !== 'string' || !id) return false;
      healOwed.set(id, (healOwed.get(id) ?? 0) + n);
      // The heal has already landed, so subtract it to test the body before the heal.
      if (entity.health - n < entity.maxHealth * EG_LIFELINE_UNDER) lowAt = now();
      return true;
    },
    menderGrace(id, n) {
      if (!inSpire() || witness || !(n > 0) || !(entity.health > 0) || typeof id !== 'string') return 0;
      const who = accountOf(id), v = egMenderOf(link.state(), me(), who);
      const k = who && who !== me() && wall() ? (1 + v) * (1 + EG_WALL_X) - 1 : v;
      return k > 0 ? healMine(entity, n * k) : 0;
    },
    reverbState: () => reverb.state(),
    lookState: () => look?.state() ?? null,
  };
  setSpireCamera(() => inSpire() && !witness);
  setTouchSpire(() => (inSpire() && !witness ? { span: api.onTraverse() } : null));
  setSpireShaft(() => (inSpire() && !witness ? { way: shaftWay(link.state()), still: stillNow() } : null));
  return api;
}
