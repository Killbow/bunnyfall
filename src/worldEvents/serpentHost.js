// @ts-check
import { bodyAt, segmentBox, segExposed, headExposed, coilWeight, SEG_N, MODE, modeAt, headAt, legIndexAt } from '../net/serpentBody.js';
import { SERPENT_ATTACK_BY_ID, SERPENT_ATTACK_TABLE, ADMIT_R, FAN_R, ENGAGE_R, SERPENT_POOL_TICK_MS, ZONES, SERPENT_PHASE_NAMES, MAEL_R, SERPENT_SHIELD_MS, CRUISE_V, refOf, SERPENT_DRAWN_MS } from '../net/serpentBrain.js';
import { serpentBossById, serpentCountdown, serpentCountdownWords, serpentSwims, SERPENT_BRAIN_V, SERPENT_DIVE_MS } from '../net/serpentLaw.js';
import { cellRoomOfWire } from '../net/wire.js';
import { bodySayer } from '../net/bossBody.js';
import { wordShare } from '../combat/healthShare.js';
import { shapeMeets, shipHurt, crushHurt, gripHurt, grindHurt, venomBite, venomHurt, shoveOf, shoveLeft, maelPull, globAt, poolOf, poolBites, fleetShare, SHOVE_S } from './serpentStrike.js';

export const COUNT_WRECK_LINE = 'The ship is holed beyond saving and counts as wrecked.';
export const IN_RESEND_MS = 20_000;
export const IN_RETRY_MS = 3000;
// All serpent frames share one client send bucket in `sendSerpent`, so an `in` resent on every ship change would
// starve the hit frames.
export const IN_CHANGE_MS = 1000;
export const HIT_GATHER_MS = 500;
export const SERPENT_NEAR_M = ENGAGE_R;
export const SERPENT_GALE = Object.freeze({ wind: 1.15, turn: 1.5 });
export const GALE_LINE = 'A gale howls about the serpent. Your canvas fills on every heading!';
export const COIL_WORD_MS = 400;
export const COIL_LOST_MS = 4000;
export const COIL_WORD_WAIT_MS = 2500;
export const SERPENT_HEARD_MS = SERPENT_DRAWN_MS;
export const WAKE_MS = 150;
export const LAND_JUDGE_MS = 500;
export const LEAD_DT_MS = 100;
export const SERPENT_TARGET = 'serpent:';
export const segmentOfTarget = (id) => (typeof id === 'string' && id.startsWith(SERPENT_TARGET) ? Number(id.slice(SERPENT_TARGET.length)) : null);

/** @param {any} deps */
export function createSerpentHost(deps) {
  const now = () => deps.now();
  let lastIn = { day: null, at: -Infinity, hl: null };
  let pending = new Map();
  let pendingAt = -Infinity;
  let handPending = new Map();
  let handAt = -Infinity;
  const resolved = new Set();
  const seen = new Map();
  let held = null;
  let crushed = 0;
  let grip = { hull: 0, crew: 0 }, grind = 0, gripAt = 0, grindAt = 0;
  let shove = null;
  let pools = [];
  let poolBiteAt = -Infinity;
  let lastPhase = null, lastFell = null, lastGone = null, lastCoil = null;
  let pts = null, ptsAt = -Infinity;
  let ahead = null, aheadAt = -Infinity;
  let shown = null, shownAt = -Infinity;
  let live = null;
  let memDay = null;
  let wreckSaid = null;
  let blows = { hull: 0, sail: 0, crew: 0, venom: 0 };
  let lastWake = -Infinity;
  let meNow = null;
  let galeSaid = false;

  const mine = () => meNow;
  // Attack numbers restart from one each serpent day, so the judged and seen sets reset on a new day and persist
  // within the same day.
  function forget(day) {
    memDay = day;
    resolved.clear(); seen.clear(); crushed = 0; lastCoil = null; lastPhase = null; lastFell = null; lastGone = null;
    held = null; pools = []; shove = null; pending = new Map(); handPending = new Map(); wreckSaid = null;
    blows = { hull: 0, sail: 0, crew: 0, venom: 0 }; lastWake = -Infinity; galeSaid = false;
  }
  const siteOf = (sw) => { const s = deps.link.state(); return s.day === sw.day && s.sx ? { sx: s.sx, sz: s.sz } : { sx: sw.site.sx, sz: sw.site.sz }; };
  const scene = (x, z) => deps.toScene(live.sx, live.sz, x, z);
  const site = (x, z) => deps.toSite(live.sx, live.sz, x, z);
  // Only the ship owner judges blows on that ship, so this returns null for a player aboard a ship owned by someone
  // else.
  function myShip() {
    const b = deps.boat?.();
    return b ? { ...b, ...footprint(b) } : null;
  }
  function footprint(b) {
    const [x, z] = site(b.pos[0], b.pos[2]);
    return { x, z, yw: b.yaw, hl: b.hl, hw: b.hw };
  }
  function body(t) {
    if (pts && ptsAt === t) return pts;
    pts = bodyAt(deps.link.state(), t, pts ?? []);
    ptsAt = t;
    return pts;
  }

  function sayIn(sw, t, me) {
    if (sw.phase === 'slain' || sw.phase === 'sounding') return;
    const cell = cellRoomOfWire(sw.site.sx, sw.site.sz);
    if (!deps.online?.ready?.(cell)) return;
    const s = deps.link.state();
    const answered = s.day === sw.day;
    const b = deps.boat?.();
    const hl = b ? b.hull : -1;
    // The relay uses `hl` to decide whether this player adds a health share, so the `in` is resent soon after the
    // ship underfoot changes.
    const due = lastIn.day !== sw.day || (lastIn.hl !== hl && t - lastIn.at >= IN_CHANGE_MS) || t - lastIn.at >= (answered ? IN_RESEND_MS : IN_RETRY_MS);
    if (!due || Math.hypot(me[0], me[1]) > ADMIT_R) return;
    if (deps.online.send({ k: 'in', d: sw.day, bv: SERPENT_BRAIN_V, lv: Math.max(1, Math.floor(deps.level?.() ?? 1)), hl, sx: sw.site.sx, sz: sw.site.sz }, cell)) lastIn = { day: sw.day, at: t, hl };
  }
  function flushHits(t, sw) {
    if (pending.size && t - pendingAt >= HIT_GATHER_MS) { pending = sayHits(pending, sw, 0); pendingAt = t; }
    if (handPending.size && t - handAt >= HIT_GATHER_MS) { handPending = sayHits(handPending, sw, 1); handAt = t; }
  }
  function sayHits(gathered, sw, r) {
    const cell = cellRoomOfWire(sw.site.sx, sw.site.sz);
    const kept = new Map();
    // Hits are sent even after the cell refused this account, because the relay decides which accounts its fight
    // counts.
    for (const [z, d] of gathered) if (d > 0 && !deps.online?.send?.({ k: 'hit', d: Math.min(5000, Math.round(d * 100) / 100), z, ...(r ? { r } : {}) }, cell)) kept.set(z, Math.min(5000, d));
    return kept;
  }
  function zoneOf(seg) {
    const s = deps.link.state(), t = live.t, p = body(t);
    const coiled = s.coil && !(s.coil.off > 0) && coilWeight(s.coil, t) > 0.5 && seg >= 2;
    // The head is segments 0 and 1, the jaw and the crest behind it.
    return seg <= 1 && headExposed(s, p, t, t < s.su) ? ZONES.head : coiled ? ZONES.coil : ZONES.body;
  }
  const sayHull = bodySayer((v) => !!live && !!deps.online?.send?.({ k: 'vt', v }, cellRoomOfWire(live.sw.site.sx, live.sw.site.sz)));
  function hullWord(t) {
    const b = deps.boat?.();
    if (b && b.maxHull > 0 && Number.isFinite(b.hullNow)) sayHull(b.hullNow / b.maxHull, t);
  }
  function wreckWord(sw) {
    const b = deps.boat?.();
    if (!b) return;
    const w = b.wrecked ? 1 : 0;
    if (w === (wreckSaid ?? 0)) { wreckSaid = w; return; }
    if (deps.online?.send?.({ k: 'wr', w }, cellRoomOfWire(sw.site.sx, sw.site.sz))) wreckSaid = w;
  }

  const share = () => fleetShare(deps.link.state().n);
  function strikeMe(a, A, ship, t) {
    deps.strike?.(ship.boat, shipHurt(A, ship, share(), blows), { shake: A.hull >= 0.18 ? 2.6 : 1.8, line: `${A.name}!` });
    const v = shoveOf(a, ship);
    if (v[0] || v[1]) shove = { v, at: t };
  }
  function attacks(s, t) {
    const a = s.atk;
    if (!a) return;
    const A = SERPENT_ATTACK_BY_ID[a.a];
    if (!A) return;
    if (!seen.has(a.i)) {
      seen.set(a.i, t);
      if (seen.size > 32) seen.delete(seen.keys().next().value);
      cue(A, a);
    }
    if (resolved.has(a.i)) return;
    if (A === SERPENT_ATTACK_TABLE.ram) {
      if (t < a.at) return;
      const ship = myShip();
      if (ship && shapeMeets(a, ship, t)) { resolved.add(a.i); strikeMe(a, A, ship, t); return; }
      if (t > a.at + A.active) resolved.add(a.i);
      return;
    }
    if (t < a.at) return;
    resolved.add(a.i);
    if (resolved.size > 64) resolved.delete(resolved.values().next().value);
    const late = t - a.at > LAND_JUDGE_MS;
    if (!late) landed(A, a);
    if (A === SERPENT_ATTACK_TABLE.coil) { if (a.s && a.s === mine()) coilWord(a, t); return; }
    if (A === SERPENT_ATTACK_TABLE.spit) pools.push(poolOf(a));
    const ship = late ? null : myShip();
    if (ship && A.hull + A.base > 0 && shapeMeets(a, ship, a.at)) strikeMe(a, A, ship, t);
  }
  function coilWord(a, t) {
    const ship = myShip();
    const sw = deps.omen.swimming();
    if (!sw) return;
    const cell = cellRoomOfWire(sw.site.sx, sw.site.sz);
    if (ship && shapeMeets(a, ship, a.at) && t - a.at <= COIL_WORD_MS + 1000) {
      // The held position is stored in the site frame so a scene origin shift does not carry the ship away.
      const r = ship.root ?? [ship.pos[0], ship.pos[2]];
      const [x, z] = site(r[0], r[1]);
      held = { i: a.i, x, z, yaw: ship.yaw, at: t };
      grip = { hull: 0, crew: 0 }; gripAt = t;
      deps.online?.send?.({ k: 'held', i: a.i, x: Math.round(ship.x * 100) / 100, z: Math.round(ship.z * 100) / 100 }, cell);
      deps.mid?.(`${serpentBossById(deps.link.state().boss).name} coils about your ship! Break its grip!`, 4);
    } else {
      deps.online?.send?.({ k: 'esc', i: a.i }, cell);
      deps.say?.('You slip clear as its coils close on empty sea.', 4);
    }
  }
  function dashWake(s, t) {
    if (modeAt(s.modes, t) !== MODE.deep) return;
    if ((s.fell || s.gone) && !(t < (s.legs[s.legs.length - 1]?.at ?? -Infinity))) return;
    const L = s.legs[legIndexAt(s.legs, t)];
    if (!L || !(L.v > CRUISE_V)) return;
    const h = headAt(s.legs, t);
    const [x, z] = scene(h.x, h.z);
    wakeAt(x, z, t);
  }
  // Splashes are limited to one per `WAKE_MS` because each one is a dozen particles, and one per frame exhausts the
  // shared particle budget.
  function wakeAt(x, z, t) {
    if (t >= lastWake && t - lastWake < WAKE_MS) return;
    lastWake = t;
    deps.fx?.('wake', [x, deps.seaY(), z], 1);
  }
  function cue(A, a) {
    const at = a.tg?.[0] ? scene(a.tg[0][0], a.tg[0][1]) : scene(a.x, a.z);
    const head = scene(a.x, a.z);
    const pos = [at[0], deps.seaY(), at[1]];
    if (A === SERPENT_ATTACK_TABLE.roar || A === SERPENT_ATTACK_TABLE.cry) deps.sound?.('roar', [head[0], deps.seaY() + 18, head[1]], 1);
    else if (A === SERPENT_ATTACK_TABLE.spit || A === SERPENT_ATTACK_TABLE.coil) deps.sound?.('hiss', [head[0], deps.seaY() + 10, head[1]], 0.9);
    else if (A === SERPENT_ATTACK_TABLE.breach || A === SERPENT_ATTACK_TABLE.ram || A === SERPENT_ATTACK_TABLE.mael) deps.sound?.('bubbles', pos, 0.8);
  }
  function landed(A, a) {
    const c = a.tg?.[0] ?? [a.x, a.z];
    const [x, z] = scene(c[0], c[1]);
    const pos = [x, deps.seaY(), z];
    if (A === SERPENT_ATTACK_TABLE.breach) { deps.fx?.('breach', pos, 1.6); deps.sound?.('breach', pos, 1); }
    else if (A === SERPENT_ATTACK_TABLE.lash) { deps.fx?.('lash', pos, 1.3); deps.sound?.('lash', pos, 1); }
    else if (A === SERPENT_ATTACK_TABLE.spit) { deps.fx?.('venom', pos, 1); deps.sound?.('splash', pos, 0.7); }
    else if (A === SERPENT_ATTACK_TABLE.roar) deps.fx?.('roar', pos, 1);
    else if (A === SERPENT_ATTACK_TABLE.coil) deps.fx?.('breach', pos, 1.1);
  }

  function tellings(s, t) {
    const boss = serpentBossById(s.boss);
    if (s.ph !== lastPhase) {
      if (lastPhase !== null && s.ph > lastPhase) deps.mid?.(`${boss.name}: ${SERPENT_PHASE_NAMES[s.ph - 1]}`, 4);
      lastPhase = s.ph;
    }
    const c = s.coil;
    if (c && c.off > 0 && lastCoil !== `${c.i}:off`) {
      lastCoil = `${c.i}:off`;
      if (s.broke && s.broke.at === c.off) deps.say?.(`${s.broke.n} breaks the coil! ${boss.name} reels, stunned. Strike its head!`, 5);
      else if (s.crushed === c.off) deps.say?.(`The coil crushes ${held?.i === c.i ? 'your ship' : 'a ship'}!`, 4);
    }
    if (s.fell && lastFell !== s.fell.at) {
      lastFell = s.fell.at;
      const h = body(t)[0];
      const [x, z] = scene(h.x, h.z);
      deps.sound?.('death', [x, deps.seaY() + 6, z], 1);
    }
    if (s.gone && lastGone !== s.gone) {
      lastGone = s.gone;
      const h = body(t)[0];
      const [x, z] = scene(h.x, h.z);
      deps.sound?.('roar', [x, deps.seaY(), z], 0.7);
    }
  }

  function coilOnMe(s, t) {
    if (!held) return;
    const c = s.coil;
    const ship = myShip();
    if (!ship) { held = null; return; }
    if (!c || c.i !== held.i) { if (t - held.at > COIL_WORD_WAIT_MS) held = null; return; }
    if (t > c.until + COIL_LOST_MS) { held = null; return; }
    if (s.crushed && s.crushed === c.off && crushed !== c.i) {
      crushed = c.i;
      deps.strike?.(ship.boat, crushHurt(ship, share(), blows), { shake: 3, line: 'The coils crush your hull!' });
    }
    if (c.off > 0) { held = null; return; }
    const dtS = Math.max(0, (t - gripAt) / 1000);
    gripAt = t;
    const g = gripHurt(ship, Math.min(1, dtS), grip, share());
    grip = g.carry;
    if (g.hurt.hull > 0 || g.hurt.crew > 0) deps.strike?.(ship.boat, g.hurt, { shake: 0.4 });
  }
  function eyeOnMe(s, t) {
    const ship = myShip();
    if (!s.mael || !ship || s.fell || s.gone) { grindAt = t; return; }
    const p = maelPull(s.mael, ship.x, ship.z, t);
    const dtS = Math.max(0, Math.min(1, (t - grindAt) / 1000));
    grindAt = t;
    if (!p.eye) return;
    const g = grindHurt(ship, dtS, grind, share());
    grind = g.carry;
    if (g.hurt.hull > 0) deps.strike?.(ship.boat, g.hurt, { shake: 0.6, line: 'The maelstrom\'s eye grinds at your hull!' });
  }
  function nearMe() {
    const s = deps.link.state();
    if (!live || s.day !== live.day || s.fell || s.gone) return false;
    const f = deps.feet();
    const [x, z] = site(f[0], f[2]);
    return Math.hypot(x, z) <= SERPENT_NEAR_M;
  }
  function venomOnMe(t, me) {
    pools = pools.filter((p) => t < p.until);
    if (!pools.length || t - poolBiteAt < SERPENT_POOL_TICK_MS) return;
    const feet = deps.feet();
    if (feet[1] > deps.seaY() + 16) return;
    const p = pools.find((q) => poolBites(q, me[0], me[1], t));
    if (!p) return;
    poolBiteAt = t;
    const n = venomHurt(venomBite(p, deps.maxHealth?.() ?? 0), share(), blows);
    if (n > 0) deps.hurt?.(n, 'poison');
  }

  return {
    frame() {
      const t = now();
      const sw = deps.omen?.swimming?.() ?? null;
      if (!sw) { live = null; if (deps.link.state().day !== null) deps.link.leave(); held = null; pools = []; return false; }
      if (sw.day !== memDay) forget(sw.day);
      meNow = deps.online?.acct?.() ?? null;
      const fr = siteOf(sw);
      live = { day: sw.day, sx: fr.sx, sz: fr.sz, sw, t };
      const f = deps.feet();
      const me = site(f[0], f[2]);
      sayIn(sw, t, me);
      const s = deps.link.state();
      if (s.day !== sw.day) return false;
      if (Math.hypot(me[0], me[1]) > FAN_R + 600) { deps.link.leave(); held = null; return false; }
      if (!s.fell && !s.gone && t - s.heardAt > SERPENT_HEARD_MS) { deps.link.leave(); held = null; return false; }
      flushHits(t, sw);
      wreckWord(sw);
      hullWord(t);
      tellings(s, t);
      attacks(s, t);
      dashWake(s, t);
      coilOnMe(s, t);
      eyeOnMe(s, t);
      venomOnMe(t, me);
      return true;
    },
    wrecked(w) {
      const ship = myShip();
      if (!ship || !live || w?.sx !== live.sx || w?.sz !== live.sz) return false;
      deps.strike?.(ship.boat, { hull: Math.ceil(ship.maxHull * 2) + 1, sail: 0, crew: 0 }, { shake: 2.6, line: COUNT_WRECK_LINE });
      return true;
    },
    targets() {
      const s = deps.link.state();
      if (!live || s.day !== live.day || s.gone || s.fell) return [];
      const t = live.t;
      if (shown && shownAt === t) return shown;
      const p = body(t), seaY = deps.seaY(), out = [];
      if (aheadAt !== t) { ahead = bodyAt(s, t + LEAD_DT_MS, ahead ?? []); aheadAt = t; }
      for (let i = 0; i < SEG_N; i++) {
        if (!segExposed(p, i)) continue;
        const [x0, z0] = scene(p[i].x, p[i].z), [x1, z1] = scene(ahead[i].x, ahead[i].z);
        out.push({ id: `${SERPENT_TARGET}${i}`, box: segmentBox(p, i, seaY, scene), rig: [], v: [(x1 - x0) * 1000 / LEAD_DT_MS, 0, (z1 - z0) * 1000 / LEAD_DT_MS] });
      }
      shown = out; shownAt = t;
      return out;
    },
    struck(seg, d) {
      const s = deps.link.state();
      if (!live || s.day !== live.day || s.fell || s.gone || !(d > 0)) return;
      const z = zoneOf(seg);
      if (!pending.size) pendingAt = live.t;
      pending.set(z, (pending.get(z) ?? 0) + d);
    },
    // Returns no targets while the player has a ship of their own, because the relay ignores hand weapon hits from
    // a player on their own ship.
    handBoxes() {
      if (!live || deps.boat?.()) return [];
      return this.targets();
    },
    handStruck(target, d) {
      const s = deps.link.state(), seg = segmentOfTarget(target?.id);
      if (!live || s.day !== live.day || s.fell || s.gone || !(d > 0) || seg == null || deps.boat?.()) return;
      const z = zoneOf(seg);
      if (!handPending.size) handAt = live.t;
      handPending.set(z, (handPending.get(z) ?? 0) + d);
      const c = target.box?.c;
      if (c) deps.fx?.('wake', [c[0], c[1], c[2]], 0.5);
    },
    healthShare() {
      const s = deps.link.state();
      return live && s.day === live.day ? wordShare(s.hp, s.max) : null;
    },
    hold(boat) {
      if (!held || !live) return null;
      const b = deps.boat?.();
      if (!b || b.boat !== boat) return null;
      const [x, z] = scene(held.x, held.z);
      return { pos: [x, z], yaw: held.yaw };
    },
    // Site axes match the scene axes (x east, z north), so site velocities are returned as scene velocities.
    drift(boat) {
      if (!live || held) return null;
      const b = deps.boat?.();
      if (!b || b.boat !== boat) return null;
      const s = deps.link.state(), t = now();
      let vx = 0, vz = 0;
      if (s.mael && !s.fell && !s.gone) { const [x, z] = site(b.pos[0], b.pos[2]); const p = maelPull(s.mael, x, z, t); vx += p.v[0]; vz += p.v[1]; }
      if (shove) { const age = (t - shove.at) / 1000; if (age >= SHOVE_S) shove = null; else { const v = shoveLeft(shove.v, age); vx += v[0]; vz += v[1]; } }
      return vx || vz ? [vx, 0, vz] : null;
    },
    near: () => nearMe(),
    gale(boat) {
      const b = deps.boat?.();
      if (!b || b.boat !== boat || !b.atHelm || !nearMe()) return null;
      if (!galeSaid) { galeSaid = true; deps.mid?.(GALE_LINE, 3); }
      return SERPENT_GALE;
    },
    bar() {
      const s = deps.link.state();
      if (!live || s.day !== live.day) return null;
      const t = now();
      const boss = serpentBossById(s.boss);
      const sw = live.sw;
      const c = s.coil && !(s.coil.off > 0) ? s.coil : null;
      const cd = serpentCountdown(sw.t, t, sw.phase);
      const a = s.atk, A = a ? SERPENT_ATTACK_BY_ID[a.a] : null;
      let atk = null;
      if (A && A.shape !== 'none' && t <= a.at + Math.max(400, A.active)) {
        const from = seen.get(a.i) ?? a.at - A.windup, ship = myShip();
        const by = A === SERPENT_ATTACK_TABLE.ram ? a.at + A.active : Math.max(t, a.at);
        atk = { key: A.key, name: A.name, t: Math.max(0, Math.min(1, (t - from) / Math.max(1, a.at - from))), aimed: !!ship && (A === SERPENT_ATTACK_TABLE.coil ? a.s === mine() : shapeMeets(a, ship, by)) };
      } else if (A && (A === SERPENT_ATTACK_TABLE.cry || A === SERPENT_ATTACK_TABLE.mael) && t < a.at) atk = { key: A.key, name: A.name, t: 0, aimed: false };
      return {
        name: boss.name, title: boss.title, hp: s.hp, max: s.max, phase: s.ph, phaseName: SERPENT_PHASE_NAMES[s.ph - 1] ?? '', fighters: s.n,
        warded: t < s.sh, stunned: t < s.su, stunLeft: Math.max(0, s.su - t), coil: c ? { h: c.h, m: c.m, mine: c.s === mine() } : null,
        countdown: s.fell ? null : serpentCountdownWords(cd), soundIn: sw.phase === 'late' || sw.phase === 'hunt' ? Math.max(0, sw.t.soundAt - t) : null,
        fell: s.fell, gone: s.gone, opening: t < s.op, atk, now: t,
      };
    },
    drawFrame() {
      const s = deps.link.state();
      if (!live || s.day !== live.day) return null;
      const t = now();
      const seaY = deps.seaY();
      if (s.fell && t > s.fell.at + SERPENT_DIVE_MS) return null;
      if (s.gone && t > s.gone + SERPENT_DIVE_MS) return null;
      const p = body(t);
      const points = p.map((q) => { const [x, z] = scene(q.x, q.z); return { x, y: seaY + q.y, z, r: q.r, yw: q.yw }; });
      const tele = [];
      const a = s.atk, A = /** @type {any} */ (a ? SERPENT_ATTACK_BY_ID[a.a] : null);
      if (A && A.shape !== 'none' && t <= a.at + Math.max(400, A.active)) {
        const from = seen.get(a.i) ?? a.at - A.windup;
        const k = Math.max(0, Math.min(1, (t - from) / Math.max(1, a.at - from)));
        const c = a.tg?.[0] ? scene(a.tg[0][0], a.tg[0][1]) : scene(a.x, a.z);
        const e = a.tg?.[1] ? scene(a.tg[1][0], a.tg[1][1]) : null;
        tele.push({ shape: A.shape, key: A.key, c, e, r: A.r ?? 0, r0: A.r0 ?? 0, r1: A.r1 ?? 0, width: A.width ?? 0, arc: A.arc ?? 0, yw: a.yw, k, landed: t >= a.at, mine: !!a.s && a.s === mine() });
      } else if (A === SERPENT_ATTACK_TABLE.mael && t < a.at && !s.mael) {
        const from = seen.get(a.i) ?? a.at - A.windup;
        const k = Math.max(0, Math.min(1, (t - from) / Math.max(1, a.at - from)));
        const eye = a.tg?.[0] ? scene(a.tg[0][0], a.tg[0][1]) : scene(0, 0);
        tele.push({ shape: 'disc', key: A.key, c: eye, e: null, r: MAEL_R, r0: 0, r1: 0, width: 0, arc: 0, yw: 0, k, landed: false, mine: false });
      }
      const mael = s.mael && !s.gone ? { c: scene(s.mael.x, s.mael.z), r: MAEL_R, at: s.mael.at, fade: s.fell ? Math.max(0, 1 - (t - s.fell.at) / SERPENT_DIVE_MS) : 1 } : null;
      const g = a ? globAt(a, t) : null;
      const glob = g ? [scene(g[0], g[2])[0], seaY + g[1], scene(g[0], g[2])[1]] : null;
      const venom = pools.filter((q) => t < q.until).map((q) => ({ c: scene(q.x, q.z), r: q.r, k: Math.min(1, (q.until - t) / 2000) }));
      const coil = s.coil && coilWeight(s.coil, t) > 0 ? { c: scene(s.coil.x, s.coil.z), w: coilWeight(s.coil, t) } : null;
      return {
        t, seaY, points, tele, mael, glob, venom, coil,
        mode: modeAt(s.modes, t), stunned: t < s.su, warded: t < s.sh, dying: !!s.fell, deep: modeAt(s.modes, t) === MODE.deep,
        shield: t < s.sh ? Math.min(1, (s.sh - t) / SERPENT_SHIELD_MS) : 0,
      };
    },
    leave() {
      live = null; held = null; pools = []; shove = null; pending = new Map();
      if (deps.link.state().day !== null) deps.link.leave();
    },
    get day() { return live?.day ?? null; },
    get held() { return !!held; },
    shareOf: (hl) => refOf(hl),
    _pools: () => pools,
    swims: (phase) => serpentSwims(phase),
  };
}
