// @ts-check
import { buildGateModel, gateArchProfile, insideGateStone, GATE_ARCHIVE, GATE_HEIGHT, GATE_HALF_W, PORTAL_CENTRE_Y, ARCH_Y0, ARCH_Y1, EG_ARCH_RECORD_OF } from '../../world/gateModel.js';
import { archArt } from '../../world/gateArt.js';
import { gateSpinRate, BEACON_BELOW_M, BEACON_START_M } from '../../render/gatePass.js';
import { GATE_RISE_MS, GATE_COLLAPSE_MS, PIXEL_M } from '../../net/gateLaw.js';
import { portalPlace, PORTAL_GROUND_PROBE } from '../../travel/portalStone.js';
import { egTimes, egCountText, EG_TEXT } from '../../net/eliteGates/egLaw.js';
import { verifyEgCall } from '../../net/eliteGates/egCallSig.js';
import { egSite, EG_CALL_SG_RE, sanitizeName } from '../../net/wire.js';
import { gateLandingFor, GATE_LANDING_M } from '../../world/gateArena.js';
import { openingHalfWidth, gateLocal, SEALED_AT, RISE_SLACK_M, GATE_OPEN_EASE, GATE_REACH, GATE_SAY_MS, GATE_STEP_M, GATE_LIGHT_RANGE } from '../../worldEvents/gatePool.js';
import { sightLineOf } from '../../world/spawnedDungeons.js';
import { directionHintString } from '../../talk/talk.js';
import { trs } from '../../world/mat4.js';
import { RAY_DISTANCE } from '../../player/activate.js';
import { setEventGround } from '../../worldEvents/eventGround.js';

export const EG_ARCH_SCALE = 0.62;
export const EG_ARCH_HEIGHT = GATE_HEIGHT * EG_ARCH_SCALE;
export const EG_ARCH_HALF_W = GATE_HALF_W * EG_ARCH_SCALE;
export const EG_ARCH_CLEAR_M = 8;
export const EG_ARCH_GATE_NEAR_M = 300;
export const EG_ARCH_NEAR_M = 150;
export const EG_ARCH_PER_CELL = 2;
export const EG_ARCH_BEACON_UP_M = 400;
export const EG_ARCH_GOLD = Object.freeze([1.0, 0.78, 0.32]);
export const EG_ARCH_TINT = Object.freeze([1.0, 1.5, 0.75]);
export const EG_ARCH_BEACON = Object.freeze({ below: BEACON_BELOW_M, height: BEACON_BELOW_M + EG_ARCH_BEACON_UP_M, start: BEACON_START_M * EG_ARCH_SCALE, color: EG_ARCH_GOLD });
export const EG_ARCH_LANDING_M = GATE_LANDING_M * EG_ARCH_SCALE;
// `EG_ARCH_PEER_M` is larger than `EG_ARCH_SAY_M` so a stranger still accepts the word while the opener's relayed
// position lags.
export const EG_ARCH_SAY_M = 32;
export const EG_ARCH_PEER_M = 40;
export const EG_ARCH_SIGHT_M = 800;
export const EG_ARCH_MAP_R = 0.75;
export const egArchBucket = (b) => `egarch:${b}`;
export const egArchKey = (b) => `egarch:${b}`;

/** @param {{ online?: boolean, guest?: boolean, exterior?: boolean, hold?: string|null, water?: boolean, aboard?: boolean, within?: string|null, nearGate?: boolean, nearArch?: boolean, held?: boolean, opening?: boolean, shut?: boolean, room?: boolean }} f */
export function egKeyRefusal(f) {
  if (!f?.online) return EG_TEXT.cold;
  if (f.guest) return EG_TEXT.guest;
  if (f.exterior === false) return EG_TEXT.sky;
  if (f.hold) return EG_TEXT.holds[f.hold] ?? EG_TEXT.holds.busy;
  if (f.water) return EG_TEXT.water;
  if (f.aboard) return EG_TEXT.aboard;
  if (f.within) return EG_TEXT.within(f.within);
  if (f.nearGate || f.nearArch) return EG_TEXT.near;
  if (f.held) return EG_TEXT.held;
  if (f.opening) return EG_TEXT.opening;
  if (f.shut) return EG_TEXT.shut;
  if (f.room === false) return EG_TEXT.room;
  return null;
}

/**
 * @param {number[]} feet
 * @param {number} yaw
 * @param {{ ground?: ((o: number[], d: number[], m: number) => number|null|undefined)|null, wall?: ((o: number[], d: number[], m: number) => number|null|undefined)|null }} [probes]
 */
export function egArchPlace(feet, yaw, probes = {}) {
  const p = portalPlace(feet, yaw, probes);
  if (!p.at) return { refused: 'room' };
  const at = p.at, archYaw = wrapYaw(yaw + Math.PI);
  const across = [Math.cos(archYaw), 0, -Math.sin(archYaw)], along = [Math.sin(archYaw), 0, Math.cos(archYaw)];
  const o = [at[0], at[1] + 1, at[2]];
  if (probes.wall) for (const d of [across, along]) for (const s of [1, -1]) {
    const hit = probes.wall(o, [d[0] * s, 0, d[2] * s], EG_ARCH_CLEAR_M);
    if (Number.isFinite(hit)) return { refused: 'room' };
  }
  if (probes.ground) for (const s of [1, -1]) {
    const fx = at[0] + across[0] * EG_ARCH_HALF_W * s, fz = at[2] + across[2] * EG_ARCH_HALF_W * s;
    const d = probes.ground([fx, at[1] + 1, fz], [0, -1, 0], PORTAL_GROUND_PROBE);
    if (!Number.isFinite(d) || /** @type {number} */ (d) > PORTAL_GROUND_PROBE) return { refused: 'room' };
  }
  return { at, yaw: archYaw };
}
const wrapYaw = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * The site is stored relative to the translation of its pixel, so every client rebuilds the same scene point with
 * `egArchSceneAt`.
 * @param {number[]} at
 * @param {number} yaw
 * @param {number} px
 * @param {number} py
 * @param {number[]} t
 */
export const egArchSite = (at, yaw, px, py, t) => ({ px, py, x: r2(at[0] - t[0]), y: r2(at[1] - t[1]), z: r2(at[2] - t[2]), yaw: Math.round(wrapYaw(yaw) * 1e4) / 1e4 });
export const egArchSceneAt = (site, t) => [t[0] + site.x, t[1] + site.y, t[2] + site.z];
export const egArchLandingRecord = (site) => ({ px: site.px, py: site.py, spot: [site.x, site.z], yaw: site.yaw });
export const egArchLandingFor = (site, at) => (site ? gateLandingFor(egArchLandingRecord(site), at, EG_ARCH_LANDING_M) : null);

/** @param {unknown} raw */
export function validEgArchWord(raw) {
  const r = /** @type {any} */ (raw);
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (typeof r.b !== 'string' || !/^[0-9a-f]{16}$/.test(r.b) || typeof r.os !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(r.os) || typeof r.o !== 'string') return null;
  if (!Number.isSafeInteger(r.op) || r.op <= 0 || !(r.ew === undefined || (Number.isSafeInteger(r.ew) && r.ew >= 0 && r.ew <= 999))) return null;
  const site = egSite(r.site);
  if (!site || typeof r.sg !== 'string' || !EG_CALL_SG_RE.test(r.sg)) return null;
  return { b: r.b, o: sanitizeName(r.o), os: r.os, op: r.op, ew: r.ew ?? 0, site, sg: r.sg };
}

/**
 * @param {{ op: number, wk?: number, end?: number }} a
 * @param {number} now
 */
export function egArchLife(a, now) {
  const T = egTimes({ openedAt: a.op });
  const sinkAt = Math.min(a.wk > 0 ? /** @type {number} */ (a.wk) : Infinity, a.end > 0 ? /** @type {number} */ (a.end) : Infinity, T.admitUntil);
  if (now < a.op || now >= sinkAt + GATE_COLLAPSE_MS) return null;
  const up = Math.min(1, (now - a.op) / GATE_RISE_MS), down = Math.max(0, (now - sinkAt) / GATE_COLLAPSE_MS);
  const rise = Math.max(0, Math.min(up, 1 - down));
  const phase = now >= sinkAt ? 'sinking' : up < 1 ? 'rising' : now < T.openAt ? 'sealed' : 'open';
  return { phase, rise, open: phase === 'open', sinkAt, openAt: T.openAt, admitUntil: T.admitUntil };
}

/**
 * @param {{ op: number, wk?: number, end?: number, site: any }} a
 * @param {{ pixelTranslation: (px: number, py: number) => number[], heightAt: (x: number, z: number) => number, now: number }} at
 */
export function egArchPlacement(a, { pixelTranslation, heightAt, now }) {
  const life = a?.site ? egArchLife(a, now) : null;
  if (!life) return null;
  const t = pixelTranslation(a.site.px, a.site.py);
  const [x, y0, z] = egArchSceneAt(a.site, t);
  let ground = heightAt(x, z);
  const coarse = !Number.isFinite(ground);
  if (coarse) ground = y0;
  const eased = life.rise * life.rise * (3 - 2 * life.rise);
  const sunk = EG_ARCH_HEIGHT + RISE_SLACK_M;
  return { phase: life.phase, origin: [x, ground - (1 - eased) * sunk, z], ground, yaw: a.site.yaw, fade: life.rise, risen: life.rise >= 1, coarse, life };
}

export const egArchDraw = (place, open, spin) => ({
  origin: place.origin, yaw: place.yaw, open, fade: place.fade, spin, beaconOnly: !!place.coarse,
  scale: EG_ARCH_SCALE, tint: EG_ARCH_TINT, beacon: EG_ARCH_BEACON,
});

export function egArchModel(model = buildGateModel()) {
  return { ...model, subMeshes: model.subMeshes.map((sm) => (sm.textureArchive === GATE_ARCHIVE && EG_ARCH_RECORD_OF[sm.textureRecord] != null ? { ...sm, textureRecord: EG_ARCH_RECORD_OF[sm.textureRecord] } : sm)) };
}
export const egArchMatrix = (p) => trs(p.origin[0], p.origin[1], p.origin[2], 0, (p.yaw * 180) / Math.PI, 0, EG_ARCH_SCALE, EG_ARCH_SCALE, EG_ARCH_SCALE);
const archLocal = (place, p) => { const [lx, ly, lz] = gateLocal(place, p); return [lx / EG_ARCH_SCALE, ly / EG_ARCH_SCALE, lz / EG_ARCH_SCALE]; };
export const egInArchRoot = (place, p) => { const [lx, ly, lz] = archLocal(place, p); return SEALED_AT.some((h) => insideGateStone([lx, ly + h / EG_ARCH_SCALE, lz])); };

const NO_CLEARS = Object.freeze([]), NO_LIST = Object.freeze([]);
/** @param {{ renderer?: any, collider?: () => any, pixelTranslation: (px: number, py: number) => number[], heightAt: (x: number, z: number) => number, now: () => number, feet?: () => (number[]|null), me?: () => (string|null), say?: (text: string) => void, onStep?: (b: string) => void, landAt?: (l: any) => boolean, verifyKey?: () => Promise<CryptoKey|null>, subtle?: SubtleCrypto }} deps */
export function createEgArchPool({ renderer = null, collider = () => null, pixelTranslation, heightAt, now, feet = () => null, me = () => null,
  say = () => {}, onStep = () => {}, landAt = () => false, verifyKey = async () => null, subtle = globalThis.crypto?.subtle }) {
  const base = buildGateModel(), model = egArchModel(base), profile = gateArchProfile(base);
  /** @type {Map<string, any>} */
  const arches = new Map();
  /** @type {Map<string, Promise<boolean>|boolean>} */
  const verdicts = new Map();
  const sunk = new Set();
  let mesh = null, meshTried = false;
  let clearsArr = NO_CLEARS, clearsKey = '';
  setEventGround('arch', () => (arches.size ? [...arches.values()].filter((a) => a.place).map((a) => a.place.origin) : NO_LIST));

  function ensureMesh() {
    if (mesh || meshTried || !renderer?.createMesh) return;
    meshTried = true;
    try {
      for (const [rec, art] of archArt()) {
        renderer.uploadTexture?.(GATE_ARCHIVE, rec, art.albedo);
        renderer.uploadEmissionTexture?.(GATE_ARCHIVE, rec, art.emission, { white: true });
      }
      mesh = renderer.createMesh(model);
    } catch (e) { console.warn('[eg] the arch would not build', e?.message ?? e); mesh = null; }
  }
  // Only the opening company gets a collider: the hub signs whatever site the opener reports, so an arch from
  // another company must never block movement.
  function standCollider(a) {
    const col = collider();
    if (!col?.addMesh) return;
    const want = a.mine && a.place?.risen && !a.place.coarse ? egArchMatrix(a.place) : null;
    const key = want ? Array.from(want, (v) => v.toFixed(3)).join(',') : null;
    if (key === a.col) return;
    col.removeBucket?.(egArchBucket(a.b));
    a.col = null;
    if (!want) return;
    col.addMesh(egArchBucket(a.b), model.positions, model.indices, want);
    a.col = key;
    const f = feet();
    if (f && egInArchRoot(a.place, f)) { const l = egArchLandingFor(a.site, { pixelTranslation, heightAt }); if (l) landAt(l); }
  }
  function drop(a) {
    collider()?.removeBucket?.(egArchBucket(a.b));
    arches.delete(a.b);
    sunk.add(a.b);
  }
  const ofCompany = (a) => !!a.mine;
  function refuse(a, text) {
    const t = now();
    if (t - (a.saidAt ?? -Infinity) < GATE_SAY_MS) return;
    a.saidAt = t;
    say(text);
  }
  function tryEnter(a) {
    if (!a.place || a.place.coarse) return false;
    if (!ofCompany(a)) { refuse(a, EG_TEXT.outside(a.o)); return false; }
    if (a.place.phase === 'open') { onStep(a.b); return true; }
    const left = a.place.life.openAt - now();
    refuse(a, left > 0 ? EG_TEXT.sealed(egCountText(left)) : EG_TEXT.late(a.o));
    return false;
  }
  const strangers = () => [...arches.values()].filter((a) => !a.mine);
  function clearsSame() {
    let n = 0;
    for (const a of arches.values()) { if (!a.place) continue; n++; if (!clearsArr.some((q) => q.b === a.b)) return false; }
    return n === clearsArr.length;
  }
  const countdownWords = (a) => {
    const L = a.place?.life;
    if (!L) return '';
    const t = now();
    return L.phase === 'rising' || L.phase === 'sealed' ? `Opens in ${egCountText(L.openAt - t)}` : L.phase === 'open' ? `Open: ${egCountText(L.admitUntil - t)} to answer` : 'Sinking';
  };

  return {
    /**
     * Only the first nonzero `wk` and `end` are taken, so a sink once begun runs its full course. A null call sets
     * `end` to now, so the arch sinks instead of vanishing.
     * @param {any} c
     * @param {{ wk?: number, end?: number }} [room]
     */
    call(c, { wk = 0, end = 0 } = {}) {
      const t = now();
      for (const a of arches.values()) {
        if (!a.mine || (c && a.b === c.b)) continue;
        if (c) drop(a); else if (!(a.end > 0)) a.end = t;
      }
      if (!c?.site || !c.co?.some?.((r) => r[0] === me())) return;
      let a = arches.get(c.b);
      if (!a) {
        if (sunk.has(c.b) || !egArchLife({ op: c.op, wk, end }, t)) return;
        a = { b: c.b, o: c.o, os: c.os, op: c.op, ew: c.ew ?? 0, site: c.site, sg: c.sg ?? '', mine: true, from: null, wk: 0, end: 0, place: null, open: 0, spin: 0, col: null, lastLz: null, said: false };
        arches.set(c.b, a);
      }
      a.mine = true; a.sg = c.sg ?? a.sg;
      if (wk > 0 && !(a.wk > 0)) a.wk = wk;
      if (end > 0 && !(a.end > 0)) a.end = end;
    },
    /**
     * @param {string} peer
     * @param {unknown} raw
     * @param {number[]|null} from
     */
    async heard(peer, raw, from) {
      const r = validEgArchWord(raw);
      if (!r || !from || r.os === me()) return false;
      const at = egArchSceneAt(r.site, pixelTranslation(r.site.px, r.site.py));
      if (Math.hypot(at[0] - from[0], at[2] - from[2]) > EG_ARCH_PEER_M) return false;
      const had = arches.get(r.b);
      if (had) return true;
      if (sunk.has(r.b)) return false;
      if (strangers().some((a) => a.from === peer)) return false;
      if (strangers().length >= EG_ARCH_PER_CELL) return false;
      if (!egArchLife({ op: r.op }, now())) return false;
      const vk = `${r.b}|${r.sg}`;
      let v = verdicts.get(vk);
      if (v === undefined) {
        v = (async () => { try { return await verifyEgCall(r, await verifyKey(), { subtle: /** @type {SubtleCrypto} */ (subtle) }); } catch { return false; } })();
        verdicts.set(vk, v);
      }
      const ok = await v;
      verdicts.set(vk, ok);
      if (!ok) return false;
      // Recheck the limits after the await, since another word may have added an arch meanwhile.
      if (arches.has(r.b) || strangers().length >= EG_ARCH_PER_CELL || strangers().some((a) => a.from === peer)) return arches.has(r.b);
      arches.set(r.b, { ...r, mine: false, from: peer, wk: 0, end: 0, place: null, open: 0, spin: 0, col: null, lastLz: null, said: false });
      return true;
    },
    frame(dt = 0) {
      if (!arches.size) { if (clearsKey) { clearsKey = ''; clearsArr = NO_CLEARS; } return; }
      const t = now(), f = feet();
      let any = false;
      for (const a of arches.values()) {
        a.place = egArchPlacement(a, { pixelTranslation, heightAt, now: t });
        if (!a.place) { if (t >= a.op) drop(a); continue; }
        any = true;
        const target = a.place.phase === 'open' ? 1 : 0;
        a.open += Math.sign(target - a.open) * Math.min(Math.abs(target - a.open), GATE_OPEN_EASE * Math.max(0, dt));
        a.spin = (a.spin + gateSpinRate(a.open) * Math.max(0, dt)) % 1;
        standCollider(a);
        if (f && !a.place.coarse && a.place.phase === 'open') {
          const [lx, ly, lz] = archLocal(a.place, f);
          const inside = Math.abs(lx) < openingHalfWidth(profile, Math.max(ARCH_Y0 + 0.05, ly + 0.9 / EG_ARCH_SCALE)) && Math.abs(lz) < GATE_STEP_M / EG_ARCH_SCALE;
          if (inside && a.lastLz !== null && Math.sign(lz) !== Math.sign(a.lastLz) && lz !== 0) tryEnter(a);
          a.lastLz = inside ? lz : null;
        } else a.lastLz = null;
      }
      if (any) ensureMesh();
      if (!clearsSame()) {
        const placed = [...arches.values()].filter((a) => a.place);
        clearsKey = placed.map((a) => a.b).sort().join(',');
        clearsArr = clearsKey ? Object.freeze(placed.map((a) => Object.freeze({ b: a.b, px: a.site.px, py: a.site.py, x: a.site.x, z: a.site.z }))) : NO_CLEARS;
      }
    },
    draw(r = renderer, texRemap = null) {
      if (!mesh || !r?.drawMesh) return 0;
      let n = 0;
      for (const a of arches.values()) if (a.place && !a.place.coarse) { r.drawMesh(mesh, egArchMatrix(a.place), texRemap); n++; }
      return n;
    },
    passDraws: () => (arches.size ? [...arches.values()].filter((a) => a.place).map((a) => egArchDraw(a.place, a.open, a.spin)) : NO_LIST),
    stands() { for (const a of arches.values()) if (a.place) return true; return false; },
    lights: () => (arches.size ? [...arches.values()].filter((a) => a.place && !a.place.coarse && a.place.fade > 0).map((a) => ({ x: a.place.origin[0], y: a.place.origin[1] + PORTAL_CENTRE_Y * EG_ARCH_SCALE, z: a.place.origin[2], range: GATE_LIGHT_RANGE * EG_ARCH_SCALE * a.place.fade * (0.5 + 0.5 * a.open) })) : NO_LIST),
    targets() {
      if (!arches.size) return NO_LIST;
      const out = [];
      for (const a of arches.values()) {
        const p = a.place;
        if (!p?.risen || p.coarse) continue;
        const w = Math.max(...profile) * EG_ARCH_SCALE, c = Math.cos(p.yaw), s = Math.sin(p.yaw), o = p.origin;
        const min = [Infinity, o[1] + ARCH_Y0 * EG_ARCH_SCALE, Infinity], max = [-Infinity, o[1] + ARCH_Y1 * EG_ARCH_SCALE, -Infinity];
        for (const lx of [-w, w]) for (const lz of [-0.5, 0.5]) {
          const x = o[0] + c * lx + s * lz, z = o[2] - s * lx + c * lz;
          min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x); min[2] = Math.min(min[2], z); max[2] = Math.max(max[2], z);
        }
        out.push({ key: egArchKey(a.b), aabb: { min, max }, distance: RAY_DISTANCE, reach: GATE_REACH, noSurface: true });
      }
      return out;
    },
    hoverName(key) {
      const a = typeof key === 'string' && key.startsWith('egarch:') ? arches.get(key.slice(7)) : null;
      if (!a?.place) return null;
      const words = countdownWords(a);
      return { title: EG_TEXT.name, subs: [EG_TEXT.plaqueSub, ...(ofCompany(a) ? [] : [EG_TEXT.company(a.o)]), ...(words ? [words] : [])] };
    },
    activate(key) {
      const a = typeof key === 'string' && key.startsWith('egarch:') ? arches.get(key.slice(7)) : null;
      return a ? tryEnter(a) : false;
    },
    word(near) {
      for (const a of arches.values()) {
        if (!a.mine || a.os !== me() || !a.sg || !a.place || a.place.phase === 'sinking' || !near) continue;
        if (Math.hypot(near[0] - a.place.origin[0], near[2] - a.place.origin[2]) > EG_ARCH_SAY_M) continue;
        return { b: a.b, o: a.o, os: a.os, op: a.op, ew: a.ew, site: a.site, sg: a.sg };
      }
      return null;
    },
    clears: () => clearsArr,
    near(f, m = EG_ARCH_NEAR_M) { if (!f) return false; for (const a of arches.values()) if (a.place && Math.hypot(a.place.origin[0] - f[0], a.place.origin[2] - f[2]) <= m) return true; return false; },
    compass() { for (const a of arches.values()) if (a.mine && a.place) return [a.place.origin[0], a.place.origin[2]]; return null; },
    mapMark() {
      for (const a of arches.values()) {
        if (!a.mine || !a.place) continue;
        const words = countdownWords(a);
        return { day: 0, cx: a.site.px + a.site.x / PIXEL_M, cy: a.site.py + 1 - a.site.z / PIXEL_M, r: EG_ARCH_MAP_R, label: EG_TEXT.name, phase: a.place.phase,
          tip: { title: EG_TEXT.name, lines: [EG_TEXT.company(a.o), ...(words ? [words] : [])] } };
      }
      return null;
    },
    sights(f) {
      const out = [];
      if (!f) return out;
      for (const a of arches.values()) {
        if (a.said || !a.place || a.os === me()) continue;
        const dx = a.place.origin[0] - f[0], dz = a.place.origin[2] - f[2], m = Math.hypot(dx, dz);
        if (m > EG_ARCH_SIGHT_M) continue;
        a.said = true;
        const way = directionHintString(dx, dz);
        out.push(sightLineOf(EG_TEXT.sight, m, way.charAt(0).toUpperCase() + way.slice(1)));
      }
      return out;
    },
    landing(b) { const a = arches.get(b); return a ? egArchLandingFor(a.site, { pixelTranslation, heightAt }) : null; },
    get arches() { return arches; },
    downColliders() { for (const a of arches.values()) { collider()?.removeBucket?.(egArchBucket(a.b)); a.col = null; a.lastLz = null; } },
    clear() {
      for (const a of [...arches.values()]) drop(a);
      if (mesh) { try { renderer?.destroyMesh?.(mesh); } catch { } }
      mesh = null; meshTried = false; verdicts.clear(); sunk.clear(); clearsArr = NO_CLEARS; clearsKey = '';
    },
  };
}
