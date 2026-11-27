// @ts-check
import { validCsaRecord, CSA_WIRE_BOATS_MAX } from './comeSailAwayWire.js';
import { liveryCode } from './shipLivery.js';
import { Boat, boatAnimators, animatorOf, setLights } from './comeSailAwayBoat.js';
import { stowSail } from './comeSailAway.js';
import { easeToward } from '../../travel/horseCartWire.js';
import { quatSlerp, quatMultiply, quatAngleAxis } from '../../world/quat.js';
import { FOES_FULL_MS } from '../../net/online.js';
import { farLife, farTreeStep } from './farLife.js';

export const CSA_PEER_TURN_RATE = 12;
export const CSA_PEER_SNAP_M = 20;
export const CSA_PEER_SNAP_S = 2.5;
export const peerSnapM = (v) => Math.max(CSA_PEER_SNAP_M, Math.hypot(v?.[0] ?? 0, v?.[2] ?? 0) * CSA_PEER_SNAP_S);
// Two full-frame intervals, because the full frame is the one word a crowded relay always delivers.
export const CSA_PEER_LEAD_MAX = (2 * FOES_FULL_MS) / 1000;
export const CSA_PEER_CATCH = 1;
export const CSA_PEER_CATCH_MPS = 0.3;
export const CSA_PEER_CATCH_SHARE = 0.25;
export const CSA_PEER_LED_SETTLE_M = 1;
/** @param {number[]} shown @param {number[]} target @param {number} dt @param {number} way */
export function glideToward(shown, target, dt, way) {
  const d = Math.max(0, dt);
  const ex = target[0] - shown[0], ez = target[2] - shown[2], off = Math.hypot(ex, ez);
  const take = off > 1e-9 ? Math.min(off * (1 - Math.exp(-CSA_PEER_CATCH * d)), (CSA_PEER_CATCH_MPS + CSA_PEER_CATCH_SHARE * way) * d) / off : 0;
  return [shown[0] + ex * take, shown[1] + (target[1] - shown[1]) * (1 - Math.exp(-12 * d)), shown[2] + ez * take];
}
/** @param {number[]} v @param {number} turn @param {number} t @returns {[number, number]} */
export function wayOver(v, turn, t) {
  const om = (turn * Math.PI) / 180;
  if (Math.abs(om * t) < 1e-9) return [v[0] * t, v[2] * t];
  const sn = Math.sin(om * t), cs = 1 - Math.cos(om * t);
  return [(v[0] * sn + v[2] * cs) / om, (-v[0] * cs + v[2] * sn) / om];
}
const V_UP = [0, 1, 0];
// Socket handlers only store a word. Each frame builds at most one peer boat, rationed per owner by these tokens.
export const CSA_PEER_BUILD_BURST = CSA_WIRE_BOATS_MAX;
export const CSA_PEER_BUILD_REFILL_MS = FOES_FULL_MS;
const SAID_MAX = 16;

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const sceneWay = (w, toScene) => {
  const v = w.velocity;
  if (!v) return [0, 0, 0];
  const a = toScene(w.position), b = toScene([w.position[0] + v[0], w.position[1], w.position[2] + v[2]]);
  return [b[0] - a[0], 0, b[2] - a[2]];
};

/** @param {{ pool: any, selfId?: () => (string | null), log?: any }} opts */
export function createComeSailAwayPeers({ pool, selfId = () => null, log = console }) {
  let enabled = true;
  /** @type {(boat: any) => boolean} */
  let keepAboard = () => false;
  // An owner who leaves cannot remove the deck under a passenger: an occupied hull stays, stationary, until
  // they step off.
  const retained = new Map();
  function retire(owner, slot, s) {
    if (enabled && keepAboard(s.boat)) {
      retained.set(s.boat, { owner, slot, boat: s.boat, hull: s.hull, variant: s.variant,
        position: [...s.boat.GameObject.position], rotation: [...s.boat.GameObject.rotation], wire: [...s.wire] });
    } else pool.remove(s.boat);
  }
  /** @type {((owner: string) => any) | null} */
  let peerLook = null;
  // Words stay in the wire frame and are converted to the scene every frame.
  const live = new Map();
  const shown = new Map();
  // A bucket survives a dropped word or a sweep until it refills, so a reconnect never resets it.
  const buckets = new Map();
  let turn = 0;
  let lifeSeq = 0;
  const said = new Set();

  function drop(owner) {
    for (const [slot, s] of (shown.get(owner) ?? []).entries()) if (s) retire(owner, slot, s);
    shown.delete(owner);
  }
  // A throw while building or posing drops only that owner's word and boats, never the frame.
  function fail(owner, e) {
    live.delete(owner);
    drop(owner);
    const text = `${e?.name ?? 'Error'}: ${e?.message ?? e}`;
    if (said.has(text) || said.size >= SAID_MAX) return;
    said.add(text);
    try { log?.warn?.(`[come-sail-away] a peer's boats stand down - ${text}`); } catch { }
  }
  function realign(owner, l) {
    const held = [...retained.values()].filter((s) => s.owner === owner).map((s) => ({
      ...s, wire: [...s.wire], shown: [...s.position], turn: [...s.rotation], helm: false, light: !!s.boat.LightOn,
    }));
    const had = [...(shown.get(owner) ?? []).filter(Boolean), ...held];
    const next = new Array(l.boats.length).fill(null);
    const pairs = [];
    for (let i = 0; i < l.boats.length; i++) {
      for (let j = 0; j < had.length; j++) {
        if (had[j].hull !== l.boats[i].hull) continue;
        if (l.boats[i].uid && had[j].boat.uid && l.boats[i].uid !== had[j].boat.uid) continue;
        const d = dist2(had[j].wire, l.boats[i].position);
        if (keepAboard(had[j].boat) && dist2(had[j].boat.GameObject.position, l.toScene(l.boats[i].position)) > peerSnapM([Math.max(Math.hypot(...sceneWay(l.boats[i], l.toScene)), had[j].ledWay ?? 0), 0, 0]) ** 2) continue;
        pairs.push([d, had[j].slot === i ? 0 : 1, i, j]);
      }
    }
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
    const taken = new Set();
    for (const [, , i, j] of pairs) if (!next[i] && !taken.has(j)) { next[i] = had[j]; taken.add(j); }
    for (let j = 0; j < had.length; j++) {
      if (taken.has(j)) retained.delete(had[j].boat);
      else if (!retained.has(had[j].boat)) retire(owner, had[j].slot, had[j]);
    }
    shown.set(owner, next);
    for (let i = 0; i < next.length; i++) {
      const s = next[i], w = l.boats[i];
      if (!s) continue;
      s.boat.uid = w.uid ?? 0;
      s.slot = i; s.wire = w.position;
      s.boat.livery = liveryCode(w.livery);
      s.boat.fittings = w.fittings ?? [];
      s.boat.plaqueName = w.plaque ? w.name ?? '' : '';
      if (s.variant !== w.variant) { pool.setVariant(s.boat, w.variant); s.variant = w.variant; }
    }
  }
  function buildOne() {
    if (!pool.ready?.()) return;
    const owners = [...live.keys()];
    for (let k = 0; k < owners.length; k++) {
      const owner = owners[(turn + k) % owners.length];
      const l = live.get(owner), list = shown.get(owner), b = buckets.get(owner);
      const i = list ? list.indexOf(null) : -1;
      if (!l || i < 0 || !b || b.tokens < 1) continue;
      turn = (turn + k + 1) % owners.length;
      b.tokens -= 1;
      const w = l.boats[i];
      try {
        const boat = pool.spawnPeerNow(new Boat(w.hull, w.variant));
        if (boat) { boat.peerKey = `${owner}:${i}`; boat.uid = w.uid ?? 0; boat.livery = liveryCode(w.livery); boat.fittings = w.fittings ?? []; boat.plaqueName = w.plaque ? w.name ?? '' : ''; }
        if (boat) list[i] = { boat, hull: w.hull, variant: w.variant, wire: w.position, slot: i, shown: null, turn: null, helm: false, light: false };
      } catch (e) { fail(owner, e); }
      return;
    }
  }
  function nextPose(s, w, toScene, dt, age) {
    const step = Math.max(0, dt);
    const lead = Math.min(Math.max(0, age), CSA_PEER_LEAD_MAX);
    const grow = lead - Math.min(Math.max(0, age - step), CSA_PEER_LEAD_MAX);
    const v = w.velocity, turn = w.turn ?? 0;
    const led = v ? wayOver(v, turn, lead) : null;
    const at = led ? [w.position[0] + led[0], w.position[1], w.position[2] + led[1]] : w.position;
    const target = toScene(at);
    let shown = s.shown;
    if (shown && v && grow > 0) {
      const was = wayOver(v, turn, lead - grow);
      const a = toScene(w.position), b = toScene([w.position[0] + led[0] - was[0], w.position[1], w.position[2] + led[1] - was[1]]);
      shown = [shown[0] + b[0] - a[0], shown[1] + b[1] - a[1], shown[2] + b[2] - a[2]];
    }
    const way = sceneWay(w, toScene), speed = Math.hypot(way[0], way[2]);
    const ledWay = Math.max(speed, s.ledWay ?? 0);
    const snap = peerSnapM([ledWay, 0, 0]);
    const jumped = !shown || (target[0] - shown[0]) ** 2 + (target[1] - shown[1]) ** 2 + (target[2] - shown[2]) ** 2 > snap * snap;
    const position = !jumped && ledWay > 0 ? glideToward(/** @type {number[]} */ (shown), target, step, ledWay) : easeToward(shown, target, dt, undefined, snap);
    const settled = jumped || Math.hypot(target[0] - position[0], target[2] - position[2]) < CSA_PEER_LED_SETTLE_M;
    const turnTo = turn ? quatMultiply(w.rotation, quatAngleAxis(turn * lead, V_UP)) : w.rotation;
    let turned = s.turn;
    if (turned && turn && grow > 0) turned = quatMultiply(turned, quatAngleAxis(turn * grow, V_UP));
    const rotation = turned ? quatSlerp(turned, turnTo, 1 - Math.exp(-CSA_PEER_TURN_RATE * step)) : [...turnTo];
    return { position, rotation, jumped, way, ledWay: settled ? speed : ledWay };
  }
  function pose(s, w, toScene, dt, look, age, eye) {
    s.was = s.shown && s.turn ? { position: [...s.shown], rotation: [...s.turn] } : null;
    const next = nextPose(s, w, toScene, dt, age);
    s.jumped = next.jumped;
    s.shown = next.position;
    s.turn = next.rotation;
    s.ledWay = next.ledWay;
    s.vel = next.way;
    s.boat.GameObject.position = s.shown;
    s.boat.GameObject.rotation = s.turn;
    for (let k = 0; k < s.boat.Sails.length; k++) {
      const a = animatorOf(s.boat.Sails[k]);
      const stowed = !((w.sails >> k) & 1);
      if (a && a.GetBool('Stowed') !== stowed) stowSail(a, stowed);
    }
    if (s.helm !== w.helm) { s.helm = w.helm; s.boat.IdleObject?.setActive(!w.helm); s.boat.ActiveObject?.setActive(w.helm); }
    if (s.light !== w.light) { s.light = w.light; setLights(s.boat, w.light); }
    const hide = look === 'hidden' && w.helm;
    if (s.boat.GameObject.activeSelf === hide) s.boat.GameObject.setActive(!hide);
    s.boat.conceal = w.helm && look && look !== 'hidden' ? look : null;
    const lived = farTreeStep(s.life ??= farLife(lifeSeq++), dt, s.boat.GameObject, s.shown, eye);
    if (lived !== null) for (const a of boatAnimators(s.boat)) a.update(lived);
  }

  function frame(dt, eye = pool.lifeEye?.() ?? null) {
    for (const [boat, s] of retained) {
      if (!enabled || !keepAboard(boat)) { retained.delete(boat); pool.remove(boat); continue; }
      boat.GameObject.position = [...s.position]; boat.GameObject.rotation = [...s.rotation];
    }
    const ms = Math.max(0, dt) * 1000;
    for (const l of live.values()) l.age += Math.max(0, dt);
    for (const [owner, b] of buckets) {
      b.tokens = Math.min(CSA_PEER_BUILD_BURST, b.tokens + ms / CSA_PEER_BUILD_REFILL_MS);
      if (b.tokens >= CSA_PEER_BUILD_BURST && !live.has(owner)) buckets.delete(owner);
    }
    for (const [owner, l] of [...live]) {
      if (!l.dirty) continue;
      l.dirty = false;
      try { realign(owner, l); } catch (e) { fail(owner, e); }
    }
    buildOne();
    for (const [owner, l] of [...live]) {
      const list = shown.get(owner);
      if (!list) continue;
      const look = peerLook?.(owner) ?? null;
      try {
        for (let i = 0; i < list.length; i++) if (list[i]) pose(list[i], l.boats[i], l.toScene, dt, look, l.age, eye);
      } catch (e) { fail(owner, e); }
    }
  }

  function applyOwner(owner, raw, toScene = (p) => p, nowMs = 0) {
    if (!enabled) return false;
    if (typeof owner !== 'string' || !owner || owner === (selfId?.() ?? null)) return false;
    const r = raw == null ? null : validCsaRecord(raw);
    if (!r) { live.delete(owner); drop(owner); return raw == null; }
    if (!buckets.has(owner)) buckets.set(owner, { tokens: CSA_PEER_BUILD_BURST });
    live.set(owner, { boats: r.boats, cabin: !!r.cabin, toScene, at: nowMs, dirty: true, age: 0 });
    return true;
  }
  function sweepOwners(alive, nowMs, staleMs = 0) {
    for (const [owner, l] of [...live]) {
      if (alive?.has?.(owner) && !(staleMs > 0 && nowMs - l.at > staleMs)) continue;
      live.delete(owner);
      drop(owner);
    }
  }
  function clearPeers() {
    live.clear();
    buckets.clear();
    for (const owner of [...shown.keys()]) drop(owner);
    for (const [boat] of retained) if (!enabled || !keepAboard(boat)) { retained.delete(boat); pool.remove(boat); }
  }
  function rebase(offset) {
    for (const s of retained.values()) s.position = s.position.map((v, i) => v + offset[i]);
    for (const list of shown.values()) for (const s of list) if (s?.shown) s.shown = [s.shown[0] + offset[0], s.shown[1] + offset[1], s.shown[2] + offset[2]];
  }
  function setEnabled(v) { enabled = !!v; if (!enabled) clearPeers(); }

  return {
    applyOwner, sweepOwners, clearPeers, rebase, frame, setEnabled,
    setKeepAboard(fn) { keepAboard = typeof fn === 'function' ? fn : () => false; },
    // A new word can reorder slots before realignment, so the hull must match; never borrow a slot's old boat.
    boatByUid(owner, uid) {
      const l = live.get(owner), list = shown.get(owner);
      const wire = l?.boats.find((b) => b.uid === uid);
      return wire ? list?.find((s) => s?.boat.uid === uid && s.hull === wire.hull)?.boat ?? null : null;
    },
    isBelowDeck: (owner) => !!live.get(owner)?.cabin,
    hasBoat: (owner, uid) => !!live.get(owner)?.boats?.some((b) => b.uid === uid),
    helmBoats() {
      const out = [];
      for (const [owner, list] of shown) {
        for (const s of list) {
          if (!s?.helm || !s.shown || !s.boat.GameObject.activeSelf) continue;
          const vel = s.vel ?? [0, 0, 0];
          const q = s.turn, yaw = q ? Math.atan2(2 * (q[0] * q[2] + q[3] * q[1]), 1 - 2 * (q[0] * q[0] + q[1] * q[1])) : null;
          out.push({ id: owner, pos: s.shown, vel, speed: Math.hypot(vel[0], vel[2]), hull: s.hull, yaw, boat: s.boat });
        }
      }
      return out;
    },
    setPeerLook(fn) { peerLook = typeof fn === 'function' ? fn : null; },
    get enabled() { return enabled; },
    shown: () => [...[...shown].map(([owner, list]) => ({ owner, boats: list.map((s) => (s ? { hull: s.hull, variant: s.variant, position: s.shown ? [...s.shown] : null, boat: s.boat } : null)) })),
      ...[...retained.values()].map((s) => ({ owner: s.owner, boats: [{ hull: s.hull, variant: s.variant, position: [...s.position], boat: s.boat }] }))],
    boatAt: (owner, slot) => [...retained.values()].find((s) => s.owner === owner && s.slot === slot)?.boat ?? shown.get(owner)?.[slot]?.boat ?? null,
    nameAt: (owner, slot) => live.get(owner)?.boats?.[slot]?.name ?? '',
    flagged() {
      const out = [];
      for (const [owner, list] of shown) {
        const words = live.get(owner)?.boats ?? [];
        for (let i = 0; i < list.length; i++) if (list[i]?.boat && words[i]?.flag) out.push({ boat: list[i].boat, flag: words[i].flag });
      }
      return out;
    },
    placeOf(boat) {
      const held = retained.get(boat);
      if (held) return { owner: held.owner, slot: held.slot };
      for (const [owner, list] of shown) for (let i = 0; i < list.length; i++) if (list[i]?.boat === boat) return { owner, slot: i };
      return null;
    },
    poseAhead(boat, dt) {
      const held = retained.get(boat);
      if (held) return { position: [...held.position], rotation: [...held.rotation] };
      for (const [owner, list] of shown) {
        const l = live.get(owner);
        if (!l) continue;
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          if (s?.boat !== boat) continue;
          const w = l.boats[i];
          // A word not yet realigned may name another hull for this slot; that boat has no pose ahead.
          if (!w || w.hull !== s.hull) return null;
          const p = nextPose(s, w, l.toScene, dt, l.age + Math.max(0, dt));
          return { position: p.position, rotation: p.rotation };
        }
      }
      return null;
    },
    moveOf(boat) {
      const held = retained.get(boat);
      if (held) {
        const pose = { position: [...held.position], rotation: [...held.rotation] };
        return { before: pose, after: pose };
      }
      for (const list of shown.values()) {
        for (const s of list) {
          if (s?.boat !== boat) continue;
          // No move across a snap or a fresh build, so nobody aboard is carried across a teleport.
          return s.was && !s.jumped ? { before: s.was, after: { position: [...s.shown], rotation: [...s.turn] } } : null;
        }
      }
      return null;
    },
  };
}
