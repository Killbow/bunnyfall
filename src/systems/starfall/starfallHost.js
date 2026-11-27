// @ts-check
import {
  starfallRuns, starInWindow, starNightAt, starTimes, starStreakBearing, starCircleSize, STAR_WORD_MS, STAR_ORPHAN_MS,
  STAR_CIRCLE_AT, STAR_LOW_LIGHT, STAR_LIGHT, starLostAt, P_WAVE, P_BREATH, P_MASTER, P_HELD, P_LOST, STAR_LOST_DARK,
  STAR_LIFE_MS, STAR_AFTER_MS, STAR_WAVE_MAX, STAR_ACCOUNTS_MAX, STAR_BLOWS_WIRE_MAX, STAR_FOE_HEALTH,
} from '../../net/starfall/starfallLaw.js';
import { worldRoom } from '../../net/wire.js';
import { storedSession } from '../../net/accountClient.js';
import { appStorage } from '../../platform/appStorage.js';
import { characterIdOf } from '../../characters/characterId.js';
import { findStarSites } from './starfallSites.js';
import { heartStar } from './starfallNight.js';
import { covenWitches } from './starfallCovens.js';
import { starWaveFoes, starMasterOf, starCircleFoes, covenFemale, STAR_MEMBERS } from './starCoven.js';
import {
  starClockPhase, starStandPlaces, starCirclePlaces, starWordOf, starWordKey, starTrackerModel, starHeldKey, starMapMarks,
  starTimerRows, starHeldLine, STAR_SAY_M, STAR_HUD_M, STAR_SHAKE_M, STAR_RESAY_MS, STAR_WARN_MS,
} from './starfallClient.js';
import { STAR_REGION_TEXT, STAR_AT_TEXT } from './starWords.js';
import { playStarSound, starHeardAfterMs } from './starSounds.js';
import { starSiteId, isStarSite } from '../../world/wodShared.js';
import { buildStarModel, rimAt, STAR_BARE_R, STAR_STONE_H, STAR_RIM_H } from '../../world/starfall/starModel.js';
import { lateSolidsOf } from '../../player/lateSolid.js';
import { starArt, STAR_ARCHIVE, STAR_GLASS_RECORD, STAR_GOLD_RECORD, STAR_DARK_RECORD } from '../../world/starfall/starArt.js';
import {
  StarfallPassRenderer, STARFALL_PROGRAMS, streakAt, omenAt, skyClamp, shockRingAt, STAR_TRAIL_M, STAR_HEAD_W, STAR_FLASH_W, STAR_FLASH_MS, STAR_FALL_COLOR,
  STAR_RING_SEGS, STAR_RING_WIDTH_M,
} from '../../render/starfall/starfallPass.js';
import { warmPrograms } from '../../render/warmPrograms.js';
import { startPrograms } from '../../render/glProgram.js';
import { findGateSite } from '../../worldEvents/gateSite.js';
import { thunderOf, thunderSourceAt, THUNDER_SOURCE_M } from '../../weather/distantStorms.js';
import { renownStruckAt } from '../../net/renownTracker.js';
import { setMidScreenText } from '../../ui/midScreenText.js';
import { eventNotice } from '../../worldEvents/eventNotices.js';
import { drawGateBossBar } from '../../ui/gateBossBar.js';
import { drawStarTracker, destroyStarTracker } from '../../ui/starfall/starTracker.js';
import { createStarRewards } from './starRewards.js';
import { starBarModel } from '../../ui/starfall/starBar.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { audio as defaultAudio } from '../../audio/audio.js';
import { betterAmbience } from '../../audio/betterAmbience.js';
import { trs } from '../../world/mat4.js';
import { setEventGround } from '../../worldEvents/eventGround.js';

export const STAR_BUILD_M = 1500;
export const STAR_FLASH_LIGHT_M = 400;
export const STAR_GLOW_RANGE = 14;
export const STAR_GLOW_REACH_M = 90;
export const STAR_HELD_FADE_MS = 60_000;
export const STAR_BEACON_DIM = 0.3;
export const STAR_RESTAND_MS = 4000;
export const STAR_HUM_MS = 7000;
export const STAR_GROUND_EVERY = 20;
export const STAR_GROUND_TOL = 0.01;
// Read rarely, because the world rebuilds its one-pixel ground kernel whenever a different pixel asks.
export const STAR_COARSE_EVERY = 600;
// The crater floor is drawn pulled toward the camera, because its lift alone is lost in 24-bit depth at range.
export const STAR_FLOOR_OFFSET = Object.freeze([-1, -4]);
export const starBucket = (key) => `star:${key}`;
// Keyed by account, character, and star, so a reloaded owner counts on from its own blows.
export const STAR_BLOWS_STORE = 'dagger:starBlows';
// Must equal WOD_STAR_PUPPETS_MAX, the allowance a reader gives the star enemies of one owner.
export const STAR_LIVE_MAX = STAR_WAVE_MAX + 1 + STAR_CIRCLE_AT.length * starCircleSize(STAR_ACCOUNTS_MAX, true);

// While the festival is open, or a star that landed in it can still stand. Client only: the relay never asks it.
export const starfallStands = (/** @type {number} */ nowMs) => starfallRuns(nowMs) || starfallRuns(nowMs - STAR_LIFE_MS - STAR_AFTER_MS);

const NONE = Object.freeze([]);
const DOWN = [0, -1, 0];
const hitDistance = (hit) => (hit && Number.isFinite(hit.dist) ? hit.dist : null);
const dist2 = (a, x, z) => Math.hypot(a[0] - x, a[2] - z);
const sameAt = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const sameMatrix = (a, b) => { if (!a || !b) return false; for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) >= 5e-4) return false; return true; };

function blowStore(storage) {
  let map = {};
  try { const v = JSON.parse(storage?.getItem?.(STAR_BLOWS_STORE) ?? '{}'); if (v && typeof v === 'object') map = v; } catch { map = {}; }
  const nightOf = (k) => Number(String(k).split('|').pop().split('.')[0]);
  return {
    get: (who, key) => { const v = map[`${who}|${key}`]; return Number.isSafeInteger(v) ? v : 0; },
    set(who, key, n, night) {
      map[`${who}|${key}`] = n;
      for (const k of Object.keys(map)) if (!(nightOf(k) >= night - 1)) delete map[k];
      try { storage?.setItem?.(STAR_BLOWS_STORE, JSON.stringify(map)); } catch { }
    },
  };
}

/** @param {any} host */
export function createStarfallHost(host) {
  const renderer = host.renderer ?? null;
  const collider = () => host.collider ?? null;
  const now = () => Date.now() + (host._sharedOffsetMs ?? 0);
  const scan = () => host.gateScanOf?.(() => false) ?? null;
  const warmScan = () => host.warmGateScan?.();
  const pixelTranslation = (px, py, out) => host.state.pixelTranslation(px, py, out);
  const groundAt = (x, z) => host.surfaceAt?.(x, z) ?? NaN;
  const coarseGround = host.gateGroundAt ? (px, py, x, z) => host.gateGroundAt(px, py, x, z) : null;
  const feet = () => (host.walkMode && host.playerSpawned ? host.player?.feetAt?.() ?? null : null);
  const session = () => host.online ?? null;
  const foes = host.exteriorFoes ?? null;
  const camp = {
    peerSprang: (site) => !!host._wodPeerSprung?.has(site), peerHeldAgo: (site) => host.wodPeerHeldAgo?.(site) ?? 0,
    forgetPeer: (site) => host.wodForgetPeer?.(site), sprang: (site) => host.wodSprang?.(site), unsprang: (site) => host.wodUnsprang?.(site),
  };
  const say = (text, id = null) => (host.eventNotice ?? eventNotice)('star', text, id);
  const onBare = (x0, z0, x1, z1) => host.labGrassField?.invalidate?.(x0, z0, x1, z1);
  const shake = (k) => betterAmbience.weaponKick?.(k);
  const regionAt = () => host._questRegionIndex?.() ?? -1;
  const hudHidden = () => !!host.gamePaused?.() || !!host.townTalk?.hudHidden;
  const two = (v) => String(v).padStart(2, '0');
  const localTime = (ms) => { const d = new Date(ms); return Number.isFinite(ms) ? `${two(d.getHours())}:${two(d.getMinutes())}` : ''; };
  const rewards = createStarRewards(host);
  const storage = host.storage !== undefined ? host.storage : appStorage();
  const audio = host.audio ?? defaultAudio;
  const fogOf = () => (renderer ? { mode: renderer._fogMode, density: renderer._fogDensity, range: renderer._fogRange, color: renderer._fogColor, camPos: renderer._camPos, focus: renderer._focus, haze: renderer._haze } : null);
  const nights = new Map();
  const stars = new Map();
  setEventGround('star', () => { const out = []; for (const S of stars.values()) if (S.phase === 'streak' || S.phase === 'fallen') out.push(S.heart); return out; });
  const ledgers = new Map();
  const held = new Map();
  const blows = blowStore(storage);
  const whoNow = { at: -Infinity, id: '' };
  const who = () => {
    const t = Date.now();
    if (t - whoNow.at < 1000 && whoNow.id) return whoNow.id;
    let acct = null;
    try { acct = host.starAccount ? host.starAccount.me?.() ?? null : storedSession(storage)?.id ?? null; } catch { acct = null; }
    whoNow.at = t; whoNow.id = `${acct ?? '-'}|${characterIdOf(playerEntity) ?? '-'}`;
    return whoNow.id;
  };
  let pass = null, passTried = false, passWarming = false, artUp = false, frameN = 0, barUp = false, trackerUp = false;
  const thunders = [];
  const glow = { x: 0, y: 0, z: 0, range: STAR_GLOW_RANGE }, glowList = Object.freeze([glow]);
  const flashLight = { x: 0, y: 0, z: 0, range: STAR_FLASH_LIGHT_M, color: STAR_FALL_COLOR };
  const sky = { beacons: [], glows: [], trails: [], rings: [] };
  const clears = { at: -Infinity, key: '', list: NONE };
  const T3 = [0, 0, 0];

  function ensurePass() {
    if (pass || passTried || !renderer?.gl) return;
    passTried = true;
    try { pass = new StarfallPassRenderer(renderer.gl); } catch (e) { console.warn('[star] the sky pass would not build', e?.message ?? e); }
  }
  // Builds the sky pass programs at idle, never inside the frame of the first omen.
  function warmPass() {
    if (pass || passTried || passWarming || !renderer?.gl) return;
    if (!globalThis.requestIdleCallback) { ensurePass(); return; }
    passWarming = true;
    void warmPrograms([{ start: () => startPrograms(renderer.gl, STARFALL_PROGRAMS), run: ensurePass, need: () => !pass && !passTried }]);
  }
  if (starfallStands(now())) warmPass();

  function sitesOf(n) {
    if (nights.has(n)) return nights.get(n);
    let sc = null;
    try { sc = scan(); } catch { sc = null; }
    if (!sc) { warmScan(); return NONE; }
    let list = NONE;
    try { list = Object.freeze(findStarSites(n, sc, { gateSiteOf: (day) => { try { return findGateSite(day, sc); } catch { return null; } } }).filter((s) => starInWindow(s.n, s.k))); } catch (e) { console.warn('[star] no sites', e?.message ?? e); }
    nights.set(n, list);
    for (const k of [...nights.keys()]) if (k < n - 2) nights.delete(k);
    return list;
  }
  function nightSites(t) {
    const n = starNightAt(t);
    return [...sitesOf(n - 1), ...sitesOf(n)];
  }

  function placeOf(S) {
    const t = pixelTranslation(S.site.px, S.site.py, T3);
    const x = t[0] + S.site.spot[0], z = t[2] + S.site.spot[1];
    let y = groundAt(x, z);
    S.known = Number.isFinite(y);
    if (!S.known) {
      if (frameN - S.coarseAt >= STAR_COARSE_EVERY) {
        S.coarseAt = frameN;
        const c = coarseGround ? coarseGround(S.site.px, S.site.py, x, z) : NaN;
        S.coarseDy = Number.isFinite(c) ? c - t[1] : NaN;
      }
      y = t[1] + S.coarseDy;
    }
    S.heart[0] = x; S.heart[1] = Number.isFinite(y) ? y : t[1]; S.heart[2] = z;
  }
  const heightAt = (S) => (lx, lz) => { const y = groundAt(S.heart[0] + lx, S.heart[2] + lz); return Number.isFinite(y) ? y - S.heart[1] : 0; };
  function ground(S) {
    if (!S.known) return;
    let changed = false;
    if (!sameAt(S.sampledHeart, S.heart) || frameN - S.sampledAt >= STAR_GROUND_EVERY) {
      S.sampledAt = frameN; S.sampledHeart = [...S.heart];
      const h = heightAt(S);
      for (let i = 0; i < S.sig.length; i++) {
        const a = (i / S.sig.length) * 2 * Math.PI, r = i % 2 ? 3 : 8;
        const v = h(Math.sin(a) * r, Math.cos(a) * r);
        if (!(Math.abs(v - S.sig[i]) <= STAR_GROUND_TOL)) { changed = true; S.sig[i] = v; }
      }
    }
    if (changed) S.groundGen++;
  }
  // The crater is a late solid, withheld while a body stands in it. A recenter moves the same solid (replace);
  // a crater rebuilt over finer ground is a new one (add).
  function place(S) {
    if (!sameAt(S.madeAt, S.heart)) { S.madeAt = [...S.heart]; S.mat = trs(S.heart[0], S.heart[1], S.heart[2], 0, 0, 0); }
    const col = collider?.(), late = lateSolidsOf(col);
    if (!col?.addMesh || !late || !S.stone || !S.mat) return;
    if (S.colliderGen === S.stoneGen && sameMatrix(S.colliderAt, S.mat)) return;
    const key = starBucket(S.key);
    if (S.colliderAt && S.colliderGen === S.stoneGen) late.replace(key, S.stone.positions, S.stone.indices, S.mat);
    else { if (S.colliderAt) late.remove(key); late.add(key, S.stone.positions, S.stone.indices, S.mat); }
    S.colliderAt = S.mat; S.colliderGen = S.stoneGen;
  }
  // Past its deadline a star stays undecided through the relay's grace, while a word sent at the deadline arrives.
  const undecided = (S, t) => S.phase === 'fallen' || (S.phase === 'after' && t < starLostAt(S.site.n, S.site.k));
  const looks = (S) => {
    const L = ledgers.get(S.key), h = held.has(S.key) || L?.p === P_HELD, lost = !h && (L?.p === P_LOST || !undecided(S, now()));
    return { glass: h ? STAR_GOLD_RECORD : lost ? STAR_DARK_RECORD : STAR_GLASS_RECORD, thread: !h, held: h, lost };
  };
  function ensureMesh(S) {
    if (!renderer?.createMesh || !S.known) return;
    const L = looks(S), want = `${S.groundGen}:${L.glass}:${L.thread ? 1 : 0}`;
    if (S.meshKey === want) return;
    try {
      if (!artUp) {
        for (const [rec, art] of starArt()) { renderer.uploadTexture?.(STAR_ARCHIVE, rec, art.albedo); renderer.uploadEmissionTexture?.(STAR_ARCHIVE, rec, art.emission, { white: true }); }
        artUp = true;
      }
      const h = heightAt(S);
      const next = renderer.createMesh(buildStarModel(S.site.n, S.site.k, h, { ground: false, glass: L.glass, thread: L.thread }));
      if (S.mesh) renderer.destroyMesh?.(S.mesh);
      S.mesh = next; S.meshKey = want;
      if (S.stoneGen !== S.groundGen || !S.floor) {
        const floor = renderer.createMesh(buildStarModel(S.site.n, S.site.k, h, { stone: false, thread: false }));
        if (S.floor) renderer.destroyMesh?.(S.floor);
        S.floor = floor;
        S.stone = buildStarModel(S.site.n, S.site.k, h, { thread: false });
        S.stoneGen = S.groundGen;
      }
    } catch (e) { console.warn('[star] the crater would not build', e?.message ?? e); S.meshKey = want; }
  }
  function dropMesh(S) {
    if (S.mesh) { renderer?.destroyMesh?.(S.mesh); S.mesh = null; S.meshKey = ''; }
    if (S.floor) { renderer?.destroyMesh?.(S.floor); S.floor = null; }
    S.stone = null; S.stoneGen = -1;
    if (S.colliderAt) { lateSolidsOf(collider?.())?.remove(starBucket(S.key)); S.colliderAt = null; S.colliderGen = -1; }
    if (S.bared) { S.bared = false; bareSaid(S); }
  }
  const bareSaid = (S) => onBare(S.heart[0] - STAR_BARE_R, S.heart[2] - STAR_BARE_R, S.heart[0] + STAR_BARE_R, S.heart[2] + STAR_BARE_R);

  function enter(site) {
    const key = starHeldKey(site.n, site.k, site.px, site.py);
    const S = {
      key, site, heart: [0, 0, 0], known: false, phase: 'none', heartStar: heartStar(site.n, site.k),
      sites: { base: starSiteId(site.px, site.py, site.n, site.k), m: starSiteId(site.px, site.py, site.n, site.k, 'm'), c: starSiteId(site.px, site.py, site.n, site.k, 'c') },
      cell: worldRoom(site.px, site.py), madeAt: null, mat: null, sampledAt: -Infinity, sampledHeart: null, sig: new Float64Array(12).fill(NaN), groundGen: 0,
      coarseAt: -Infinity, coarseDy: NaN, mesh: null, meshKey: '', floor: null, stone: null, stoneGen: -1, colliderAt: null, colliderGen: -1, bared: false,
      said: new Set(), impactAt: NaN, humAt: -Infinity, ringGround: null,
      own: false, camp: null, stoodWave: 0, pending: 0, standAt: -Infinity, waveFoes: new Set(), counted: new Set(), kn: 0, wc: 0,
      mine: new WeakSet(), handed: new Set(), awayAt: NaN,
      master: null, masterStood: false, calls: 0, mf: false, struck: false, hb: 0, hbWho: '', wordAt: -Infinity, saidKey: '', resayAt: Infinity,
      ward: null, fellAt: NaN, circle: 0, circleSeen: 0, broken: 0, masterFoe: null,
    };
    blowsOf(S);
    S.ward = makeWard(S);
    stars.set(key, S);
    return S;
  }
  function leave(S) {
    dropDefense(S);
    dropMesh(S);
    stars.delete(S.key);
  }
  function dropDefense(S) {
    if (S.own || S.pending || S.waveFoes.size || S.master) for (const s of Object.values(S.sites)) { foes?.dropSiteFoes?.(s); camp.unsprang?.(s); }
    S.own = false; S.stoodWave = 0; S.waveFoes.clear(); S.handed.clear(); S.master = null; S.masterStood = false; S.calls = 0; S.awayAt = NaN;
  }

  function blowsOf(S) {
    const id = who();
    if (S.hbWho !== id) { S.hbWho = id; S.hb = blows.get(id, S.key); }
    return S.hb;
  }
  // The count is never below what the cell says this account was credited, and is never lowered by it.
  function creditedSaid(key, n, hm) {
    if (!Number.isSafeInteger(hm) || hm < 0 || hm > STAR_BLOWS_WIRE_MAX) return;
    const S = stars.get(key), id = who();
    const had = S ? blowsOf(S) : blows.get(id, key);
    if (hm <= had) return;
    if (S) S.hb = hm;
    blows.set(id, key, hm, n);
  }

  function makeWard(S) {
    const ward = {
      starWard: true, site: S.sites.base, living: true,
      ai: { feet: [0, 0, 0], height: STAR_STONE_H, centreOffset: STAR_STONE_H / 2, target: null, isHostile: false, wouldBeSpawned: true, yaw: 0 },
      entity: { team: 'Civilian', mobileTeam: 'Civilian', health: 1000, maxHealth: 1000 },
      hurtFromFoe() {
        S.hb = blowsOf(S) + 1;
        blows.set(S.hbWho, S.key, S.hb, S.site.n);
        playStarSound(audio, 'blow', S.heart);
        return 1;
      },
    };
    return ward;
  }

  const ownSite = (f, S) => !!f && (f.site === S.sites.base || f.site === S.sites.m || f.site === S.sites.c);
  const liveOf = (S) => S.pending + (foes?.foes ?? NONE).filter((f) => !f.puppet && !f.dead && ownSite(f, S)).length;
  function mark(S, f) {
    S.mine.add(f);
    const c = S.camp ?? (S.camp = foes?.newCampId?.() ?? null);
    f.starSite = S.sites.base;
    f.campId = c;
    if (f.entity) f.entity.campId = c;
  }
  function masterOf(S, f, M) {
    S.master = f; S.masterStood = true;
    if (f.entity) { f.entity.name = M.name(); f.entity.properName = M.name(); f.entity.worldBoss = true; }
    f.circleWard = () => (S.circle | 0) > 0;
  }
  // The ray starts over the rim's crest, because a ray from just over the land starts inside the solid rim.
  function standOn(x, z) {
    const y = groundAt(x, z);
    if (!Number.isFinite(y)) return null;
    const top = y + STAR_RIM_H + 1;
    const d = hitDistance(collider?.()?.surfaceHit?.([x, top, z], DOWN, top - y + 3));
    if (d != null) return { y: top - d, hitDist: 0.2 };
    return { y, hitDist: hitDistance(collider?.()?.surfaceHit?.([x, y + 0.2, z], DOWN, 3)) };
  }
  // Applied once as an enemy lands; an enemy handed over keeps what its owner gave it.
  function toughen(f) {
    const e = f.entity;
    if (!e) return;
    e.maxHealth = Math.max(1, Math.round((e.maxHealth ?? 1) * STAR_FOE_HEALTH)); e.health = e.maxHealth;
    e.healthMult = (e.healthMult ?? 1) * STAR_FOE_HEALTH;
  }
  function stand(S, careers, places, site, made, { elite = false, about = null } = {}) {
    if (!foes?.spawnFoe) return;
    S.standAt = now();
    careers.slice(0, Math.max(0, STAR_LIVE_MAX - liveOf(S))).forEach((career, i) => {
      const [dx, dz, yaw] = places[i % places.length];
      const x = (about ?? S.heart)[0] + dx, z = (about ?? S.heart)[2] + dz;
      const at = standOn(x, z);
      if (!at) return;
      S.pending++;
      const landed = (f) => {
        S.pending--;
        if (!f) return;
        if (stars.get(S.key) !== S || !S.own) { foes.removeFoe?.(f); return; }
        if (site !== S.sites.m) toughen(f);
        mark(S, f);
        made(f);
      };
      Promise.resolve(foes.spawnFoe(career, [x, at.y, z], { yaw: yaw ?? 0, gender: covenFemale(career) ? 'female' : null, placed: true, groundAlign: { hitDist: at.hitDist }, site, transient: true, eliteFoe: elite, grantKind: session()?.starGrantOk ? 'star' : undefined }))
        .then(landed, () => landed(null));
    });
  }
  // Enemies handed over by a leaving owner are made the star's again, so this screen spawns only what is missing.
  function claim(S, L) {
    const M = starMasterOf(L?.b ?? 1, S.site.k);
    for (const f of foes?.foes ?? NONE) {
      if (f.puppet || f.dead || S.mine.has(f) || !ownSite(f, S)) continue;
      mark(S, f);
      if (f.site === S.sites.m) {
        if (S.master && !S.master.dead && S.master !== f) { f.circleWard = S.master.circleWard; if (f.entity) f.entity.worldBoss = true; continue; }
        masterOf(S, f, M);
        const e = f.entity, share = e && e.maxHealth > 0 ? e.health / e.maxHealth : 1;
        S.calls = Math.max(S.calls, STAR_CIRCLE_AT.filter((at) => share <= at).length);
      } else if (f.site === S.sites.base) {
        if (L?.p === P_WAVE && S.stoodWave === L.w) S.waveFoes.add(f); else S.handed.add(f);
      }
    }
  }
  function tend(S) {
    let master = null, circle = 0;
    const member = S.site.coven.member(), M = starMasterOf(ledgers.get(S.key)?.b ?? 1, S.site.k);
    for (const f of foes?.foes ?? NONE) {
      if (!ownSite(f, S)) continue;
      const e = f.entity, career = f.mobileType;
      if (e) {
        const name = f.site === S.sites.m ? M.name() : STAR_MEMBERS.includes(career) ? member : null;
        if (name && e.name !== name) { e.name = name; e.properName = name; }
        if (f.site === S.sites.m && e.worldBoss !== true) e.worldBoss = true;
      }
      if (!S.struck && renownStruckAt(f) != null) S.struck = true;
      if (f.site === S.sites.m) master = f;
      if (f.dead) {
        if (!f.corpse) continue;
        const k = f.puppet ? `${f.puppet}:${f.seq}` : f;
        if (S.counted.has(k)) continue;
        S.counted.add(k);
        if (!f.puppet && S.waveFoes.has(f)) S.kn++;
        if (f.site === S.sites.m && !f.puppet) S.mf = true;
        continue;
      }
      if (f.site === S.sites.c) circle++;
      if (!f.puppet && f.starSite && !f.starTurned && e && e.health < e.maxHealth) f.starTurned = true;
    }
    const me = master?.entity;
    if (me && !master.dead && me.maxHealth > 0) STAR_CIRCLE_AT.forEach((at, i) => { if (me.health / me.maxHealth <= at) sayAt(S, `circle${i}`, M.circle()); });
    if (circle > 0) S.circleSeen = circle;
    else if (S.circleSeen > 0) { S.circleSeen = 0; S.broken++; sayAt(S, `broken${S.broken}`, STAR_AT_TEXT.circleBroken(M.female)); playStarSound(audio, 'circle', S.heart); }
    S.circle = circle;
    S.masterFoe = master;
    if (master?.dead && !Number.isFinite(S.fellAt)) S.fellAt = now();
  }
  function holds(S) {
    if (camp.peerSprang?.(S.sites.base)) {
      if (!(camp.peerHeldAgo?.(S.sites.base) >= STAR_ORPHAN_MS)) return false;
      camp.forgetPeer?.(S.sites.base);
    }
    return true;
  }
  function owner(S, L) {
    if (!S.own) {
      S.own = true;
      for (const s of Object.values(S.sites)) { foes?.reclaimSite?.(s); camp.sprang?.(s); }
    }
    if (!S.pending) claim(S, L);
    if (!L || S.pending) return;
    if (L.p === P_WAVE && S.stoodWave === L.w && !S.waveFoes.size && now() - S.standAt >= STAR_RESTAND_MS) S.stoodWave = 0;
    if (L.p === P_WAVE && S.stoodWave !== L.w) {
      S.stoodWave = L.w; S.kn = L.kn; S.wc = 0; S.waveFoes.clear();
      for (const f of S.handed) if (!f.dead) S.waveFoes.add(f);
      S.handed.clear();
      const careers = starWaveFoes(S.site.n, S.site.k, L.w, Math.max(0, L.wz - L.kn - S.waveFoes.size), L.b);
      stand(S, careers, starStandPlaces(S.site.n, S.site.k, L.w, careers.length), S.sites.base, (f) => S.waveFoes.add(f));
      return;
    }
    if (L.p === P_WAVE && S.stoodWave === L.w && !S.pending && S.waveFoes.size && [...S.waveFoes].every((f) => f.dead)) S.wc = L.w;
    if (L.p === P_MASTER && S.masterStood && !S.master && now() - S.standAt >= STAR_RESTAND_MS) S.masterStood = false;
    if (L.p === P_MASTER && !S.masterStood) {
      S.masterStood = true;
      const M = starMasterOf(L.b, S.site.k);
      stand(S, [M.career], starStandPlaces(S.site.n, S.site.k, 9, 1), S.sites.m, (f) => masterOf(S, f, M), { elite: true });
      return;
    }
    const m = S.master, e = m?.entity;
    if (m && !m.dead && e && S.calls < STAR_CIRCLE_AT.length && e.health / e.maxHealth <= STAR_CIRCLE_AT[S.calls]) {
      const call = S.calls++;
      const size = starCircleSize(L.nd, S.heartStar);
      stand(S, starCircleFoes(S.site.n, S.site.k, call, size, L.b), starCirclePlaces(size).map(([dx, dz]) => [dx, dz, 0]), S.sites.c, () => {}, { about: m.ai?.feet ?? S.heart });
    }
  }
  function word(S, t) {
    const s = session();
    if (!s?.starReady?.(S.cell)) return;
    const w = starWordOf(S.site, { struck: S.struck, own: S.own, kw: S.stoodWave, kn: S.kn, wc: S.wc, hb: S.hb, mf: S.mf }, playerEntity.level ?? 1);
    const key = starWordKey(w), changed = key !== S.saidKey;
    if (!changed && t - S.wordAt < STAR_WORD_MS && t < S.resayAt) return;
    if (!s.sendStar(w, S.cell)) return;
    S.resayAt = changed ? t + STAR_RESAY_MS : Infinity;
    S.wordAt = t; S.saidKey = key;
  }
  // The coven is sprung, spawned, and held only within STAR_SAY_M, where the relay hears the word.
  function leashSlipped(S, t, inside) {
    if (inside) { S.awayAt = NaN; return false; }
    if (!Number.isFinite(S.awayAt)) S.awayAt = t;
    return t - S.awayAt >= STAR_ORPHAN_MS;
  }
  function defend(S, t, d) {
    const L = ledgers.get(S.key) ?? null;
    if (foes && d <= STAR_HUD_M) tend(S);
    const over = held.has(S.key) || L?.p === P_HELD || L?.p === P_LOST || S.phase !== 'fallen';
    if (over) { if (S.own) dropDefense(S); return; }
    const s = session();
    const online = !!s?.starReady?.(S.cell), inside = d <= STAR_SAY_M;
    if (online && foes && S.known && inside && holds(S)) { S.awayAt = NaN; owner(S, L); }
    else if (S.own && (camp.peerSprang?.(S.sites.base) || leashSlipped(S, t, inside))) dropDefense(S);
    if (online && inside) { blowsOf(S); word(S, t); }
  }

  function sayOnce(S, id, text, how = 'chat') {
    if (!text || S.said.has(id)) return;
    S.said.add(id);
    if (how === 'mid') setMidScreenText(text, 4); else say(text, `star:${S.site.n}.${S.site.k}`);
  }
  function sayAt(S, id, text) {
    const f = feet();
    if (f && dist2(S.heart, f[0], f[2]) <= STAR_HUD_M) sayOnce(S, id, text, 'mid');
  }
  const inRegion = (S) => regionAt() === S.site.region;
  function ledgerSaid(S, L, was) {
    // A first ledger is taken in silently, so a page that arrives mid-fight never announces past moves.
    if (!L || !was) return;
    const M = starMasterOf(L.b, S.site.k);
    if (L.p === P_WAVE && (!was || was.w !== L.w)) sayAt(S, `wave${L.w}`, STAR_AT_TEXT.wave(L.w));
    if (L.p === P_BREATH && was?.p === P_WAVE) sayAt(S, `breath${L.w}`, STAR_AT_TEXT.breath());
    if (L.lt <= STAR_LOW_LIGHT && !(was?.lt <= STAR_LOW_LIGHT) && L.p !== P_LOST) sayAt(S, 'low', STAR_AT_TEXT.low());
    if (L.p === P_MASTER && was?.p !== P_MASTER) { sayAt(S, 'master', M.call()); playStarSound(audio, 'master', S.heart); }
    if (L.p === P_HELD && was?.p !== P_HELD) { sayAt(S, 'held', S.heartStar ? STAR_AT_TEXT.heldHeart() : STAR_AT_TEXT.held()); playStarSound(audio, 'held', S.heart); }
    if (L.p === P_LOST && was?.p !== P_LOST) { sayAt(S, 'lost', L.why === STAR_LOST_DARK ? STAR_AT_TEXT.lost() : STAR_AT_TEXT.dawn()); playStarSound(audio, 'dark', S.heart); }
    if (was && L.lt < was.lt && !S.own) playStarSound(audio, 'blow', S.heart, 0.6);
  }

  function moments(S, t, f) {
    const T = starTimes(S.site.n, S.site.k);
    const d = f ? dist2(S.heart, f[0], f[2]) : Infinity;
    if (S.phase === 'omen' && inRegion(S)) {
      sayOnce(S, 'omen', S.heartStar ? STAR_REGION_TEXT.omenHeart(S.site.near, covenWitches(S.site.coven)) : STAR_REGION_TEXT.omen(S.site.near, covenWitches(S.site.coven)));
      if (!S.said.has('omenSound')) { S.said.add('omenSound'); playStarSound(audio, 'omen'); }
    }
    if (S.phase === 'streak' && inRegion(S) && !S.said.has('fallSound')) { S.said.add('fallSound'); playStarSound(audio, 'fall', null, 0.5 + 0.5 * Math.max(0, 1 - d / 8000)); }
    if ((S.phase === 'fallen' || S.phase === 'after') && !Number.isFinite(S.impactAt)) {
      S.impactAt = T.fallAt;
      if (t - T.fallAt < 4000) {
        if (inRegion(S)) sayOnce(S, 'fell', STAR_REGION_TEXT.fell(S.site.near));
        if (d <= 2000) thunders.push({ due: T.fallAt + starHeardAfterMs(d), key: S.key, clip: null, volume: 1 });
        const th = thunderOf(d);
        if (th) thunders.push({ due: T.fallAt + th.delay * 1000, key: S.key, clip: th.clip, volume: th.volume });
        if (d <= STAR_SHAKE_M) shake(4 * (1 - d / STAR_SHAKE_M));
      }
    }
    if (S.phase === 'fallen' && d <= 40 && t - S.humAt >= STAR_HUM_MS) { S.humAt = t; playStarSound(audio, 'hum', S.heart); }
  }

  // Sky things are scaled about the camera, so the far plane never cuts a star's column seen from far away.
  function skyOf(S, t, eye) {
    const T = starTimes(S.site.n, S.site.k), L = looks(S);
    if (S.phase === 'omen') {
      const o = omenAt(S.heart, (t - T.omenAt) / (T.streakAt - T.omenAt)), c = skyClamp(eye, o.at);
      sky.glows.push({ at: c.at, w: o.w * c.s, color: STAR_FALL_COLOR, light: 0.9 });
    } else if (S.phase === 'streak') {
      const k = (t - T.streakAt) / (T.fallAt - T.streakAt), st = streakAt(S.heart, starStreakBearing(S.site.n, S.site.k), k), c = skyClamp(eye, st.head);
      sky.trails.push({ head: c.at, dir: st.dir, len: STAR_TRAIL_M * c.s, w: STAR_HEAD_W * 0.5 * c.s, color: STAR_FALL_COLOR, light: 1 });
      sky.glows.push({ at: c.at, w: STAR_HEAD_W * c.s, color: STAR_FALL_COLOR, light: 1.2 });
    }
    if (S.phase === 'fallen' || S.phase === 'after') {
      const since = t - T.fallAt;
      if (since < STAR_FLASH_MS) {
        const c = skyClamp(eye, [S.heart[0], S.heart[1] + 6, S.heart[2]]);
        sky.glows.push({ at: c.at, w: STAR_FLASH_W * c.s * (1 - since / STAR_FLASH_MS * 0.5), color: STAR_FALL_COLOR, light: 2 * (1 - since / STAR_FLASH_MS) });
      }
      const ring = shockRingAt(since);
      if (ring.fade > 0 && S.known) sky.rings.push({ at: S.heart, r: ring.r, fade: ring.fade, color: STAR_FALL_COLOR, ground: ringGround(S, ring.r) });
      const lt = ledgers.get(S.key)?.lt, dim = Number.isFinite(lt) ? STAR_BEACON_DIM + (1 - STAR_BEACON_DIM) * Math.max(0, Math.min(1, lt / STAR_LIGHT)) : 1;
      const fade = L.held ? Math.max(0, 1 - (t - (held.get(S.key)?.at ?? ledgers.get(S.key)?.hd ?? t)) / STAR_HELD_FADE_MS) : L.lost ? 0 : Math.min(1, since / 3000) * dim;
      if (fade > 0) { const c = skyClamp(eye, [S.heart[0], S.heart[1] + STAR_STONE_H, S.heart[2]]); sky.beacons.push({ origin: c.at, scale: c.s, fade, held: L.held }); }
    }
  }
  function ringGround(S, r) {
    const g = S.ringGround ?? (S.ringGround = new Float32Array(STAR_RING_SEGS * 2));
    for (let i = 0; i < STAR_RING_SEGS; i++) {
      const a = (i / STAR_RING_SEGS) * 2 * Math.PI, sa = Math.sin(a), ca = Math.cos(a);
      for (let j = 0; j < 2; j++) {
        const rr = j ? r + STAR_RING_WIDTH_M : Math.max(0, r - STAR_RING_WIDTH_M);
        const y = groundAt(S.heart[0] + sa * rr, S.heart[2] + ca * rr);
        g[i * 2 + j] = (Number.isFinite(y) ? y - S.heart[1] : 0) + rimAt(rr);
      }
    }
    return g;
  }

  return {
    frame() {
      try { rewards.tick(); } catch (e) { console.warn('[star] claims', e?.message ?? e); }
      try { return this.step(); } catch (e) { console.warn('[star] host', e?.message ?? e); return null; }
    },
    step() {
      frameN++;
      const t = now();
      if (!starfallStands(t)) { this.destroyAll(); return null; }
      const f = feet();
      const seen = new Set();
      for (const site of nightSites(t)) {
        const phase = starClockPhase(site.n, site.k, t);
        const key = starHeldKey(site.n, site.k, site.px, site.py);
        if (phase === 'none' || phase === 'gone') continue;
        seen.add(key);
        const S = stars.get(key) ?? enter(site);
        S.phase = phase;
        placeOf(S);
        S.ward.ai.feet[0] = S.heart[0]; S.ward.ai.feet[1] = S.heart[1]; S.ward.ai.feet[2] = S.heart[2];
        moments(S, t, f);
        const d = f ? dist2(S.heart, f[0], f[2]) : Infinity;
        if ((phase === 'fallen' || phase === 'after') && d <= STAR_BUILD_M && S.known) {
          ground(S);
          if (!S.bared) { S.bared = true; bareSaid(S); }
          ensureMesh(S);
        } else if (S.mesh && d > STAR_BUILD_M * 1.2) dropMesh(S);
        if (S.mesh) place(S);
        if (phase === 'fallen' || S.own) defend(S, t, d);
      }
      for (const S of [...stars.values()]) if (!seen.has(S.key)) leave(S);
      for (let i = 0; i < thunders.length;) {
        const th = thunders[i];
        if (th.due > t) { i++; continue; }
        thunders.splice(i, 1);
        // Plays from where the heart is now, since a recenter can move it between the landing and the thunder.
        const at = stars.get(th.key)?.heart;
        if (t - th.due >= 1000 || !f || !at) continue;
        if (!th.clip) { playStarSound(audio, 'impact', at); continue; }
        try { audio.play3d?.(th.clip, thunderSourceAt(f, at[0], at[2]), th.volume, { refDistance: THUNDER_SOURCE_M, maxDistance: THUNDER_SOURCE_M * 8, far: true }); } catch { }
      }
      if (stars.size) warmPass();
      const near = this.nearest();
      const hidden = hudHidden();
      if (near) {
        const L = ledgers.get(near.key) ?? null, M = starMasterOf(L?.b ?? 1, near.site.k);
        drawStarTracker(starTrackerModel(near.site, L, t, M.name(), held.has(near.key)), { hidden }); trackerUp = true;
        const m = near.masterFoe;
        const bar = m && (!m.dead || t - near.fellAt < 4000) ? starBarModel({ name: M.name(), heart: near.heartStar, hp: m.entity?.health ?? 0, max: m.entity?.maxHealth ?? 1, circle: near.circle, her: M.female, defenders: L?.nd ?? 0, fellAt: m.dead ? near.fellAt : null }, t) : null;
        if (bar || barUp) { drawGateBossBar(bar, { hidden }); barUp = !!bar; }
      } else {
        if (trackerUp) { drawStarTracker(null); trackerUp = false; }
        if (barUp) { drawGateBossBar(null); barUp = false; }
      }
      return near;
    },
    nearest() {
      const f = feet();
      if (!f) return null;
      let best = null, bd = STAR_HUD_M;
      for (const S of stars.values()) {
        if (!S.known || (S.phase !== 'fallen' && S.phase !== 'after')) continue;
        const d = dist2(S.heart, f[0], f[2]);
        if (d <= bd) { bd = d; best = S; }
      }
      return best;
    },
    onStar(w) {
      if (!w) return;
      if (w.k === 'rc') { rewards.receipt(w.r); return; }
      if (w.k === 'hds') { for (const [n, s, px, py, at] of w.l) if (!held.has(starHeldKey(n, s, px, py))) held.set(starHeldKey(n, s, px, py), { top: [], c: 0, at }); return; }
      const key = starHeldKey(w.n, w.s, w.px, w.py);
      if (w.k === 'hd') {
        const first = !held.get(key)?.c;
        held.set(key, { top: w.top, c: w.c, at: w.at });
        if (first) {
          const site = nightSites(now()).find((s) => starHeldKey(s.n, s.k, s.px, s.py) === key) ?? null;
          const S = stars.get(key);
          const line = starHeldLine(site, w.top, w.c);
          if (line && !(S?.said.has('heldRegion'))) { S?.said.add('heldRegion'); say(line, `star:${w.n}.${w.s}`); }
        }
        return;
      }
      const was = ledgers.get(key) ?? null;
      ledgers.set(key, w);
      creditedSaid(key, w.n, w.hm);
      const S = stars.get(key);
      if (S) ledgerSaid(S, w, was);
    },
    wards() {
      const out = [];
      for (const S of stars.values()) if (S.own && S.phase === 'fallen' && S.known) out.push(S.ward);
      return out;
    },
    draw(r = renderer, texRemap = null) {
      if (!r?.drawMesh) return 0;
      let n = 0;
      for (const S of stars.values()) if (S.mesh && S.mat) { r.drawMesh(S.mesh, S.mat, texRemap); n++; }
      const gl = r.gl ?? null;
      let offset = false;
      try {
        for (const S of stars.values()) {
          if (!S.floor || !S.mat) continue;
          if (!offset && gl) { offset = true; gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(STAR_FLOOR_OFFSET[0], STAR_FLOOR_OFFSET[1]); }
          r.drawMesh(S.floor, S.mat, texRemap); n++;
        }
      } finally { if (offset) { gl.disable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(0, 0); } }
      return n;
    },
    lights() {
      const near = this.nearest();
      const f = feet();
      if (!near || !f || dist2(near.heart, f[0], f[2]) > STAR_GLOW_REACH_M || looks(near).lost) return NONE;
      glow.x = near.heart[0]; glow.y = near.heart[1] + STAR_STONE_H * 0.6; glow.z = near.heart[2];
      return glowList;
    },
    flash() {
      const t = now(), f = feet();
      for (const S of stars.values()) {
        const since = t - starTimes(S.site.n, S.site.k).fallAt;
        if (since >= 0 && since < STAR_FLASH_MS && f && dist2(S.heart, f[0], f[2]) <= STAR_FLASH_LIGHT_M * 4) {
          flashLight.x = S.heart[0]; flashLight.y = S.heart[1] + 20; flashLight.z = S.heart[2];
          flashLight.range = STAR_FLASH_LIGHT_M * (1 - since / STAR_FLASH_MS);
          return flashLight;
        }
      }
      return null;
    },
    showing: () => !!pass && stars.size > 0,
    drawSky(proj, view, eye, seconds, fog = fogOf()) {
      if (!pass || !eye) return 0;
      return pass.draw(this.skyLists(eye), proj, view, eye, seconds, fog);
    },
    skyLists(eye) {
      const t = now();
      sky.beacons.length = 0; sky.glows.length = 0; sky.trails.length = 0; sky.rings.length = 0;
      for (const S of stars.values()) skyOf(S, t, eye);
      return sky;
    },
    mapMarks() { return starfallStands(now()) ? starMapMarks(nightSites(now()), now(), { held, led: ledgers, localTime }) : NONE; },
    compassMark() {
      const f = feet();
      if (!f) return null;
      let best = null, bd = Infinity;
      for (const S of stars.values()) {
        if (!inRegion(S) || S.phase === 'none' || S.phase === 'gone') continue;
        const d = dist2(S.heart, f[0], f[2]);
        if (d < bd) { bd = d; best = S; }
      }
      return best ? [best.heart[0], best.heart[2]] : null;
    },
    timerRows() {
      const t = now();
      if (!starfallStands(t)) return NONE;
      const decided = (key) => held.has(key) || ledgers.get(key)?.p === P_HELD || ledgers.get(key)?.p === P_LOST;
      return starTimerRows([...nightSites(t), ...sitesOf(starNightAt(t) + 1)], t, decided);
    },
    clearing() {
      const S = this.nearest();
      return S ? { x: S.heart[0], z: S.heart[2], r: STAR_BARE_R, key: S.key } : null;
    },
    // The same frozen list while the same stars remain, so the world host rebuilds its clear set only on a change.
    starClears() {
      const t = now();
      if (Math.abs(t - clears.at) < 1000) return clears.list;
      clears.at = t;
      const list = starfallStands(t) ? [...nightSites(t), ...sitesOf(starNightAt(t) + 1)].filter((s) => t >= s.times.fallAt - STAR_WARN_MS && t < s.times.goneAt) : NONE;
      const key = list.map((s) => `${s.n}.${s.k}`).join();
      if (key !== clears.key) clears.list = key ? Object.freeze(list.map((s) => Object.freeze({ s: `${s.n}.${s.k}`, px: s.px, py: s.py, x: s.spot[0], z: s.spot[1] }))) : NONE;
      clears.key = key;
      return clears.list;
    },
    isStarSite,
    state: () => [...stars.values()].map((S) => ({ key: S.key, phase: S.phase, known: S.known, own: S.own, stoodWave: S.stoodWave, master: !!S.master, calls: S.calls, kn: S.kn, wc: S.wc, hb: S.hb, mf: S.mf, struck: S.struck, mesh: !!S.mesh, floor: !!S.floor, heart: [...S.heart], said: [...S.said] })),
    destroyAll() {
      for (const S of [...stars.values()]) leave(S);
      if (trackerUp) { destroyStarTracker(); trackerUp = false; }
      if (barUp) { drawGateBossBar(null); barUp = false; }
      thunders.length = 0;
    },
    recoverSpoils: (who, inSave = null) => rewards.recover(who, inSave),
    spoilsHeld: (who) => rewards.held(who),
    spoilsSaved: (who, ids) => rewards.saved(who, ids),
    rewards,
    active: () => stars.size > 0,
  };
}
