// @ts-check
import { PeerBodies, BODY_BUILD_GATE } from '../net/peerBodies.js';
import { getPref } from '../ui/uiPrefs.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { morrowindDataCount, morrowindDataGeneration } from '../scenes/dataSource.js';

export const NPC_BODY_TIERS = Object.freeze({
  off: null,
  near: Object.freeze({ max: 12, range: 30, skinBudget: 4, spareMax: 4 }),
  all: Object.freeze({ max: 24, range: 60, skinBudget: 8, spareMax: 8 }),
});
export const WATCH_BODY_TIERS = Object.freeze({
  off: null,
  near: Object.freeze({ max: 4, range: 30, skinBudget: 2, spareMax: 2 }),
  all: Object.freeze({ max: 8, range: 60, skinBudget: 4, spareMax: 4 }),
});
export const NPC_BODIES_DEFAULT = 'near';

export const NPC_FRAME_TIERS = Object.freeze({
  off: null,
  near: Object.freeze({ bodies: 24, skins: 8 }),
  all: Object.freeze({ bodies: 48, skins: 16 }),
});
export const NPC_BUDGET_HYSTERESIS = 1.15;
export const NPC_BUDGET_ROUNDS = 1;

export function createFrameBudget() {
  /** @type {Map<any, { d2: Float64Array, n: number, round: number, i: number, inCut: number }>} */
  const lanes = new Map();
  /** @type {any[]} */
  const live = [];
  let cutD2 = Infinity;
  let round = 0;
  const fresh = () => {
    live.length = 0;
    for (const r of lanes.values()) if (r.round >= round - NPC_BUDGET_ROUNDS && r.n > 0) live.push(r);
  };
  return {
    report(lane, d2, n) {
      let r = lanes.get(lane);
      if (!r) lanes.set(lane, (r = { d2, n: 0, round: -1, i: 0, inCut: 0 }));
      if (r.round === round) round++;
      r.d2 = d2; r.n = n; r.round = round;
      r.inCut = 0;
    },
    drop(lane) { lanes.delete(lane); },
    cut(k) {
      fresh();
      for (const r of live) r.i = 0;
      cutD2 = Infinity;
      for (let c = 0; c < k; c++) {
        let best = null;
        for (const r of live) if (r.i < r.n && (!best || r.d2[r.i] < best.d2[best.i])) best = r;
        if (!best) { cutD2 = Infinity; break; }
        cutD2 = best.d2[best.i++];
      }
      return cutD2;
    },
    skins(lane, skins) {
      let lanesIn = 0, total = 0;
      for (const r of live) {
        let c = 0;
        while (c < r.n && r.d2[c] <= cutD2) c++;
        r.inCut = c;
        if (c) { lanesIn++; total += c; }
      }
      const mine = lanes.get(lane)?.inCut ?? 0;
      if (!mine) return 0;
      return 1 + Math.floor((Math.max(0, skins - lanesIn) * mine) / total);
    },
    get lanes() { fresh(); return live.length; },
  };
}
export const NPC_FRAME_BUDGET = createFrameBudget();

export const npcPeerId = (lane, id) => `npc:${lane}:${id}`;

const finite = (v) => (Number.isFinite(v) ? v : 0);
const count = (v) => (Number.isFinite(v) ? v | 0 : 0);

/**
 * @param {any} a
 */
export function npcShown(a) {
  return {
    x: finite(a.feet[0]), y: finite(a.feet[1]), z: finite(a.feet[2]),
    yaw: finite(a.yaw), pitch: 0,
    mv: a.moving ? (a.running ? 2 : 1) : 0,
    wd: a.drawn ? 1 : 0,
    an: count(a.swings), as: count(a.strike),
    cn: count(a.casts), cr: count(a.castRange),
    ht: count(a.hits),
    dd: count(a.dead),
    wb: a.look?.wolf ? 1 : 0,
  };
}

const sceneOf = (/** @type {any} */ s) => [s.x, s.y, s.z];

/**
 * @param {{ renderer: any, enabled?: () => boolean, generation?: () => number, tier?: () => string, createRig?: Function,
 *   now?: () => number, warn?: (m: string) => void, collider?: () => any, tiers?: Record<string, any>,
 *   budget?: ReturnType<typeof createFrameBudget> | null, frameTiers?: Record<string, any> }} p
 */
export function createNpcBodies({ renderer, enabled = () => true, generation = () => 0, tier = () => NPC_BODIES_DEFAULT, createRig, now, warn, collider, tiers = NPC_BODY_TIERS,
  budget = null, frameTiers = NPC_FRAME_TIERS }) {
  /** @type {PeerBodies|null} */
  let bodies = null;
  let standing = null;
  /** @type {any[]} */
  const peers = [];
  /** @type {Map<string, { conceal: any, flash: number, fx: any, dead: boolean, scale: number, frame: number, anchored: boolean }>} */
  const info = new Map();
  let frame = 0;
  const seen = (id) => info.get(id);
  const syncOpts = { priority: (id) => !seen(id)?.dead, conceal: (id) => seen(id)?.conceal ?? null };
  const flashOf = (id) => seen(id)?.flash ?? 0;
  const fxOf = (id) => seen(id)?.fx ?? null;
  const scaleOf = (id) => seen(id)?.scale ?? 1;
  const anchoredOf = (id) => !!seen(id)?.anchored;
  const drawOpts = { proj: null, view: null, eye: null, flashOf, fxOf, scaleOf, anchoredOf };
  const lane = () => {
    const t = tier();
    const want = Object.prototype.hasOwnProperty.call(tiers, t) ? t : NPC_BODIES_DEFAULT;
    if (want !== standing) {
      bodies?.destroy();
      const limits = tiers[want] ?? null;
      bodies = limits ? new PeerBodies({ renderer, enabled, generation, limits: budget ? { ...limits, buildInRange: true, hysteresis: NPC_BUDGET_HYSTERESIS } : limits, gate: BODY_BUILD_GATE, casts: true, ...(createRig ? { createRig } : {}), ...(now ? { now } : {}), ...(warn ? { warn } : {}), ...(collider ? { collider } : {}) }) : null;
      standing = want;
    }
    return bodies;
  };
  let d2s = new Float64Array(0);
  const share = (b, eye) => {
    const lim = tiers[standing], ft = frameTiers[standing];
    if (!lim || !ft) return;
    const r2 = lim.range * lim.range, cap = lim.max, h2 = NPC_BUDGET_HYSTERESIS * NPC_BUDGET_HYSTERESIS;
    if (d2s.length < cap) d2s = new Float64Array(cap);
    let n = 0;
    for (const p of peers) {
      const dx = p.shown.x - eye[0], dz = p.shown.z - eye[2];
      const d2 = (dx * dx + dz * dz) / (b.holds(p.id) ? h2 : 1);
      if (!(d2 <= r2) || (n === cap && d2 >= d2s[n - 1])) continue;
      let j = n < cap ? n++ : n - 1;
      while (j > 0 && d2s[j - 1] > d2) { d2s[j] = d2s[j - 1]; j--; }
      d2s[j] = d2;
    }
    budget.report(self, d2s, n);
    const cut = budget.cut(ft.bodies);
    b.setLimits({ range: Math.min(lim.range, Math.sqrt(cut) * (1 + 1e-9)), skinBudget: Math.min(lim.skinBudget, budget.skins(self, ft.skins)) });
  };
  const self = {
    begin() {
      peers.length = 0;
      frame++;
      if (info.size > 256) for (const [id, r] of info) if (r.frame < frame - 1) info.delete(id);
    },
    /**
     * @param {string} laneName
     * @param {any} actor
     * @param {any} [conceal]
     * @param {number} [flash]
     * @param {any} [fx]
     * @param {boolean} [anchored]
     */
    stand(laneName, actor, conceal = null, flash = 0, fx = null, anchored = false) {
      if (!actor?.look || !actor.feet || npcBodiesHeld()) return;
      conceal ??= actor.look.veil ?? null;
      const id = npcPeerId(laneName, actor.id);
      peers.push({ id, name: '', told: true, look: actor.look, shown: npcShown(actor) });
      let r = info.get(id);
      if (!r) info.set(id, (r = { conceal: null, flash: 0, fx: null, dead: false, scale: 1, frame: 0, anchored: false }));
      r.conceal = conceal; r.flash = flash > 0 ? flash : 0; r.fx = fx; r.dead = !!actor.dead; r.frame = frame; r.anchored = !!anchored;
      r.scale = actor.scale > 0 ? actor.scale : 1;
    },
    /**
     * @param {number} dt
     * @param {number[]|null} eye
     */
    end(dt, eye) {
      const b = lane();
      if (!b) return;
      if (budget && eye) share(b, eye);
      b.sync(peers, sceneOf, dt, eye, syncOpts);
    },
    /**
     * @param {string} laneName
     * @param {any} id
     */
    has(laneName, id) { return !!bodies?.has(npcPeerId(laneName, id)); },
    /**
     * @param {string} laneName
     * @param {any} id
     */
    heightOf(laneName, id) { return bodies?.heightOf(npcPeerId(laneName, id)) ?? 0; },
    /**
     * @param {any} canvas
     * @param {any} o
     */
    draw(canvas, o) {
      if (!bodies) return;
      drawOpts.proj = o.proj; drawOpts.view = o.view; drawOpts.eye = o.eye;
      bodies.draw(canvas, drawOpts);
    },
    drawVeiled() { bodies?.drawVeiled(); },
    /** @param {number[]} o */
    offsetAll(o) { bodies?.offsetAll(o); },
    destroy() { peers.length = 0; info.clear(); bodies?.destroy(); bodies = null; standing = null; budget?.drop(self); },
    get offered() { return peers.length; },
    get tier() { return standing; },
  };
  return self;
}

let _heldUntil = -Infinity;
export const NPC_HOLD_MS = 250;
/**
 * @param {boolean} on
 * @param {number} [now]
 */
export function holdNpcBodies(on, now = performance.now()) { _heldUntil = on ? now + NPC_HOLD_MS : -Infinity; }
/** @param {number} [now] */
export const npcBodiesHeld = (now = performance.now()) => now < _heldUntil;

export function npcBodiesOn() {
  return isEnhanced() && morrowindDataCount() > 0 && getPref('mwNpcBodies') !== 'off';
}

export function createHostNpcBodies({ renderer, collider = () => null, tiers = NPC_BODY_TIERS }) {
  return createNpcBodies({ renderer, enabled: npcBodiesOn, generation: morrowindDataGeneration, tier: () => getPref('mwNpcBodies') ?? NPC_BODIES_DEFAULT, collider, tiers, budget: NPC_FRAME_BUDGET });
}

/**
 * @param {{ laneName: string, renderer: any, collider?: () => any, tiers?: any, want?: () => boolean, make?: (() => any) | null }} p
 */
export function createPopulationLane({ laneName, renderer, collider = () => null, tiers = NPC_BODY_TIERS, want = npcBodiesOn, make = null }) {
  let lane = null;
  let offered = false;
  /** @type {any[]} */
  const ids = [];
  /** @type {any[]} */
  const batches = [];
  return {
    frame() {
      ids.length = 0; batches.length = 0;
      if (!want()) { if (lane) { lane.destroy(); lane = null; } offered = false; return false; }
      lane ??= make ? make() : createHostNpcBodies({ renderer, collider, tiers });
      lane.begin();
      offered = true;
      return true;
    },
    /**
     * @param {any} actor
     * @param {any} batch
     * @param {any} [conceal]
     * @param {number} [flash]
     * @param {any} [fx]
     */
    offer(actor, batch, conceal = null, flash = 0, fx = null) {
      if (batch) batch.castOnly = false;
      if (!lane || !offered) return;
      lane.stand(laneName, actor, conceal, flash, fx, !!batch && batch.origin == null && batch._dyn !== true);
      ids.push(actor.id); batches.push(batch);
    },
    /**
     * @param {any} canvas
     * @param {Float32Array} proj
     * @param {Float32Array} view
     * @param {number[]} eye
     * @param {number} dt
     */
    draw(canvas, proj, view, eye, dt) {
      if (!lane || !offered) return;
      offered = false;
      lane.end(dt, eye);
      for (let i = 0; i < ids.length; i++) if (batches[i]) batches[i].castOnly = lane.has(laneName, ids[i]);
      renderer.beginCharacterSpriteBatch?.();
      try { lane.draw(canvas, { proj, view, eye }); } finally { renderer.flushCharacterSpriteBatch?.(); }
    },
    drawVeiled() { lane?.drawVeiled(); },
    /** @param {number[]} o */
    offsetAll(o) { lane?.offsetAll(o); },
    destroy() { lane?.destroy(); lane = null; offered = false; ids.length = 0; batches.length = 0; },
    /** @param {any} id */
    has(id) { return !!lane?.has(laneName, id); },
    /** @param {any} id */
    heightOf(id) { return lane?.heightOf(laneName, id) ?? 0; },
  };
}
