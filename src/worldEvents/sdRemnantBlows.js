// @ts-check
import { setBossStruck } from '../items/sigilSetPowers.js';
import { SD_ARENA, realmToDungeon, dungeonToRealm } from '../net/sdBrain.js';
import { SD_BLOW_BY_ID, SD_BLOWS, SD_BODY, SD_REM, SD_ECHO, SD_PILLAR_OVER_Y, atkWindup, blowShape, stompRingAt, handAngleAt, arenaOf } from '../net/sdRemnant.js';
import { POOL_TICK_MS } from '../net/gateBrain.js';
import { strikeDamage, savedShare } from '../net/gateStrike.js';
import { sdBodyAt, sdEndAgain, SD_HEARTS_KEY } from '../net/sdFightLink.js';
import { sdBlowVerdict, sdVolleyPools, sdPoolUnder } from '../net/sdStrike.js';
import { GateTelegraphRenderer, TELEGRAPH_KIND, TELEGRAPH_EDGE, TELEGRAPH_EDGE_DAGON, TELEGRAPH_STYLE, TELEGRAPH_POOL, TELEGRAPH_FLASH_MS, TELEGRAPH_POINTS_MAX } from '../render/gateTelegraph.js';
import { damageChartModel, drawGateDamageChart, DAMAGE_CHART_DELAY_MS, DAMAGE_CHART_MS } from '../ui/gateDamageChart.js';
import { BODY_FALL, BURNING, THUNDER_ROLL, SWING_LOW, CRYSTAL_CLIPS, BOSS_CUES } from '../world/gateBoss.js';
import { SD_VOICE_AWAY_MS } from './sdRemnantVoice.js';

export const SD_BLOW_COLOR = Object.freeze({
  stomp: Object.freeze([1.0, 0.7, 0.26]), hand: Object.freeze([1.0, 0.86, 0.5]), volley: Object.freeze([1.0, 0.52, 0.26]),
  pulse: Object.freeze([0.45, 1.0, 0.6]), reset: Object.freeze([0.6, 1.0, 0.82]), end: Object.freeze([1.0, 0.32, 0.26]),
});
export const SD_BLOW_STYLE = Object.freeze({
  stomp: TELEGRAPH_STYLE.weight, hand: TELEGRAPH_STYLE.shock, volley: TELEGRAPH_STYLE.weight,
  pulse: TELEGRAPH_STYLE.shock, reset: TELEGRAPH_STYLE.dagon, end: TELEGRAPH_STYLE.dagon,
});
export const SD_POOL_COLOR = Object.freeze([1.0, 0.45, 0.16]);
export const SD_ELEMENT_COLOR = Object.freeze({
  fire: SD_POOL_COLOR, frost: Object.freeze([0.5, 0.82, 1.0]), shock: Object.freeze([0.7, 0.76, 1.0]), poison: Object.freeze([0.5, 0.95, 0.25]), magic: Object.freeze([0.78, 0.5, 1.0]),
});
export const SD_ELEMENT_STYLE = Object.freeze({ fire: TELEGRAPH_STYLE.fire, frost: TELEGRAPH_STYLE.frost, shock: TELEGRAPH_STYLE.shock, poison: TELEGRAPH_STYLE.poison, magic: TELEGRAPH_STYLE.shock });
export const SD_ELEMENT_GROUND = Object.freeze({ fire: 'Burning brass', frost: 'Rimed brass', shock: 'Charged brass', poison: 'Venomed brass', magic: 'Soul-lit brass' });
export const SD_TINT_LEAN = 0.35;
const _tints = new Map();
export function sdTint(key, el) {
  const base = SD_BLOW_COLOR[key] ?? SD_BLOW_COLOR.stomp, E = el ? SD_ELEMENT_COLOR[el] : null;
  if (!E) return base;
  const k = `${key}:${el}`;
  let c = _tints.get(k);
  if (!c) { c = Object.freeze(base.map((v, i) => v + (E[i] - v) * SD_TINT_LEAN)); _tints.set(k, c); }
  return c;
}
export const SD_TELEGRAPH_FLOOR = Object.freeze({ r: SD_ARENA.r, courts: Object.freeze([Object.freeze([0, 0])]) });
export const SD_ARENA_CENTRE = Object.freeze(realmToDungeon(SD_ARENA.x, 0, SD_ARENA.z));
export const SD_BLOWS_TEXT = Object.freeze({
  reset: (n) => (n > 0 ? `The Reset! Break all ${n} Hearts!` : 'The Reset! Break its Hearts!'),
  end: 'The Hour Ends.',
  fell: 'The Brass Remnant is undone.',
  boss: 'The Brass Remnant',
  hearts: 'Hearts',
  burning: 'burning brass',
});
const cue = (clip, pitch, volume, reach, at = 'body') => Object.freeze({ clip, pitch, volume, reach, at });
export const SD_HEART_LATE_MS = 2000;
export const SD_BLOW_CUES = Object.freeze({
  windup: Object.freeze({
    stomp: cue(BODY_FALL, 0.5, 1.3, 60), hand: cue(CRYSTAL_CLIPS.hit, 0.42, 1.4, 80), volley: cue(CRYSTAL_CLIPS.hit, 0.7, 1.3, 60),
    pulse: cue(THUNDER_ROLL, 0.4, 1.4, 120, 'heart'), reset: cue(THUNDER_ROLL, 0.3, 2.0, 160, 'heart'), end: cue(THUNDER_ROLL, 0.236, 2.2, 200, 'heart'),
  }),
  land: Object.freeze({
    stomp: cue(BODY_FALL, 0.28, 2.0, 80), hand: cue(SWING_LOW, 0.4, 1.6, 80), volley: cue(BODY_FALL, 0.8, 1.4, 50, 'marks'),
    pulse: cue(CRYSTAL_CLIPS.shatter, 0.5, 1.6, 120, 'heart'), reset: cue(BURNING, 0.4, 2.2, 160, 'heart'), end: cue(BURNING, 0.3, 2.2, 200, 'heart'),
  }),
  fall: cue(BODY_FALL, 0.22, 2.4, 160),
  pool: cue(BURNING, 1.3, 0.9, 14, 'feet'),
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const NONE = Object.freeze([]);
export const bodysBlow = (A) => !!A && A.shape !== 'all';
const shapeOf = (kind, o) => ({
  kind, origin: [0, 0], yaw: 0, r: 0, halfArc: 0, body: SD_REM.r, end: [0, 0], halfW: 0, r0: 0, r1: 0, points: [], n: 0,
  t: 1, flash: 0, alpha: 1, color: SD_BLOW_COLOR.stomp, edge: TELEGRAPH_EDGE, court: 0, style: TELEGRAPH_STYLE.weight,
  since: 0, span: 1, after: -1, runS: 0, pool: TELEGRAPH_POOL.blow, ...o,
});

/**
 * @param {any} atk
 * @param {number} b
 * @param {number} phase
 * @param {number} now
 * @param {any[]} [out]
 */
export function sdTelegraphShapes(atk, b, phase, now, out = []) {
  const A = atk ? SD_BLOW_BY_ID[atk.a] : null;
  if (!A) return out;
  const S = blowShape(atk);
  const w = atkWindup(atk, A, phase, b), since = now - (atk.at - w), after = now - atk.at, span = Math.max(S.active, 1);
  if (since < 0 || after >= span + TELEGRAPH_FLASH_MS) return out;
  const common = {
    t: w > 0 ? clamp01(since / w) : 1, flash: after >= 0 ? 1 : 0, alpha: after > span ? clamp01(1 - (after - span) / TELEGRAPH_FLASH_MS) : 1,
    color: sdTint(A.key, S.el), style: SD_BLOW_STYLE[A.key], edge: A === SD_BLOWS.reset || A === SD_BLOWS.end ? TELEGRAPH_EDGE_DAGON : TELEGRAPH_EDGE,
    since: Math.max(0, since) / 1000, span: Math.max(0.001, w / 1000), after: after >= 0 ? after / 1000 : -1,
    body: b === SD_BODY.remnant ? SD_REM.r : SD_ECHO.r,
  };
  const origin = [atk.x, atk.z];
  switch (A.shape) {
    case 'stomp': {
      if (after < TELEGRAPH_FLASH_MS) out.push(shapeOf(TELEGRAPH_KIND.disc, { ...common, origin, r: S.r, alpha: after > 0 ? clamp01(1 - after / TELEGRAPH_FLASH_MS) : 1 }));
      const front = stompRingAt(atk, now);
      if (front != null) out.push(shapeOf(TELEGRAPH_KIND.ring, { ...common, origin, r0: Math.max(0, front - A.width / 2), r1: front + A.width / 2, t: 1 }));
      break;
    }
    case 'sweep': {
      if (after < 0) {
        out.push(shapeOf(TELEGRAPH_KIND.cone, { ...common, origin, yaw: atk.yw, r: A.len, halfArc: S.arc / 2 }));
        const a0 = handAngleAt(atk, atk.at);
        out.push(shapeOf(TELEGRAPH_KIND.lane, { ...common, origin, end: [atk.x + Math.sin(a0) * A.len, atk.z + Math.cos(a0) * A.len], halfW: A.width / 2 }));
        break;
      }
      const a = handAngleAt(atk, now);
      if (a != null) out.push(shapeOf(TELEGRAPH_KIND.lane, { ...common, origin, end: [atk.x + Math.sin(a) * A.len, atk.z + Math.cos(a) * A.len], halfW: A.width / 2 }));
      break;
    }
    case 'disc': out.push(shapeOf(TELEGRAPH_KIND.discs, { ...common, r: S.r, points: (atk.tg ?? []).slice(0, TELEGRAPH_POINTS_MAX).map((q) => [q[0], q[1]]) })); break;
    case 'all': out.push(shapeOf(TELEGRAPH_KIND.all, { ...common })); break;
    default: break;
  }
  return out;
}
export function sdPoolShapes(pools, now) {
  const live = pools.filter((p) => now >= p.from && now < p.until);
  const out = [];
  for (let k = 0; k < live.length; k += TELEGRAPH_POINTS_MAX) {
    const g = live.slice(k, k + TELEGRAPH_POINTS_MAX);
    const alpha = Math.max(...g.map((p) => clamp01(Math.min((now - p.from) / 150, (p.until - now) / 1000))));
    out.push(shapeOf(TELEGRAPH_KIND.discs, { r: g[0].r, points: g.map((p) => [p.x, p.z]), alpha, color: SD_ELEMENT_COLOR[g[0].el] ?? SD_POOL_COLOR, style: SD_ELEMENT_STYLE[g[0].el] ?? TELEGRAPH_STYLE.fire, pool: TELEGRAPH_POOL.ground, since: Math.max(0, now - Math.min(...g.map((p) => p.from))) / 1000 }));
  }
  return out;
}
export function sdAnyInFlight(s) {
  if (!s || !(s.fi > 0) || s.lost || s.fell) return false;
  if (s.rem?.atk || s.clk) return true;
  const ec = s.ec;
  if (ec) for (let k = 0; k < ec.length; k++) if (ec[k].h > 0 && ec[k].atk) return true;
  return false;
}
export function sdBlowsInFlight(s) {
  const out = [];
  if (!s || !(s.fi > 0) || s.lost || s.fell) return out;
  if (s.rem?.atk) out.push({ b: SD_BODY.remnant, atk: s.rem.atk });
  (s.ec ?? []).forEach((E, k) => { if (E.h > 0 && E.atk) out.push({ b: SD_BODY.gold + k, atk: E.atk }); });
  if (s.clk) out.push({ b: SD_BODY.hour, atk: s.clk });
  return out;
}

/** @param {{ gl?: any, audio?: any, link: any, feet?: () => (number[]|null), grounded?: () => boolean, player?: () => any, strike?: (dmg: number, how: any) => void, say?: (t: string, everyone?: boolean, key?: string) => void, me?: () => (string|null), hudHidden?: () => boolean, save?: (e: any, el: string) => number, bodyMarks?: () => readonly any[] }} deps */
export function createSdRemnantBlows({ gl = null, audio = null, link, feet = () => null, grounded = () => true, player = () => null, strike = () => {}, say = () => {}, me = () => null, hudHidden = () => false, save = () => 100, bodyMarks = () => NONE }) {
  let pass = null, passTried = false;
  let feetOver = false;
  const marks = new Map();
  let prevT = null, pools = [], inFire = false, burnAt = -Infinity, outAt = -Infinity, fireEl = null;
  let fellFi = 0, chartAt = null, chartFell = null, endSaid = 0;
  // Blow numbers restart in every fight, so `marks` is cleared whenever the fight id changes.
  let marksFi = 0;
  /** @type {readonly any[]} */
  let shapes = NONE;

  const play = (c, at) => { if (!c || !audio || !at) return; try { audio.play3d?.(c.clip, at, c.volume, { maxDistance: c.reach, distanceModel: 'linear', pitch: c.pitch }); } catch { } };
  const bodyAt = (s, b, t) => {
    const B = b === SD_BODY.remnant ? s.rem : s.ec?.[b - SD_BODY.gold];
    const [x, z] = B ? sdBodyAt(B, t) : [0, 0];
    return realmToDungeon(SD_ARENA.x + x, 3, SD_ARENA.z + z);
  };
  const sound = (c, s, b, atk, t) => {
    if (!c) return;
    if (c.at === 'marks') for (const q of atk.tg ?? []) play(c, realmToDungeon(SD_ARENA.x + q[0], 1, SD_ARENA.z + q[1]));
    else if (c.at === 'heart' || b === SD_BODY.hour) play(c, realmToDungeon(SD_ARENA.x, 4, SD_ARENA.z));
    else play(c, bodyAt(s, b, t));
  };
  function land(name, pct, base, blow = false, el = null) {
    const e = player();
    if (!e) return;
    if (blow) setBossStruck();
    const dmg = strikeDamage(pct, e.maxHealth, base);
    strike(el ? savedShare(dmg, save(e, el)) : dmg, el ? { name, el } : { name });
  }
  function blow(s, b, atk, t, t0, at, over = false) {
    const A = SD_BLOW_BY_ID[atk.a];
    if (!A) return;
    let m = marks.get(atk.i);
    if (!m) {
      m = { seen: {}, done: false, cued: false, landed: false };
      marks.set(atk.i, m);
      if (marks.size > 32) marks.delete(marks.keys().next().value);
    }
    const again = sdEndAgain(atk, s);
    if (!m.cued) { m.cued = true; if (t < atk.at && !again) { sound(SD_BLOW_CUES.windup[A.key], s, b, atk, t); if (A === SD_BLOWS.reset) say(SD_BLOWS_TEXT.reset(s.cx?.c?.length ?? 0), false, SD_HEARTS_KEY); } }
    if (A === SD_BLOWS.end && endSaid !== s.fi && t < atk.at) { endSaid = s.fi; say(SD_BLOWS_TEXT.end); }
    if (!m.landed && t >= atk.at) {
      m.landed = true;
      if (t - atk.at < 400 + Math.max(blowShape(atk).active, 0)) {
        if (!again) sound(SD_BLOW_CUES.land[A.key], s, b, atk, t);
        if (A === SD_BLOWS.volley) pools.push(...sdVolleyPools(atk));
      }
    }
    if (m.done || !at) return;
    const v = sdBlowVerdict(atk, at[0], at[1], t0, t, grounded(), m.seen, over);
    m.seen = v.seen;
    m.done = v.done;
    for (const h of v.hits) land(A.name, h.pct, h.base, bodysBlow(A), h.el ?? null);
  }
  // Judges each owed blow once after it lands, even when the fight state dropped it before any frame saw it (a
  // hidden tab draws no frames), then marks it paid.
  function owedBlows(s, t, t0) {
    const list = link.owed?.() ?? NONE;
    if (!list.length) return;
    const f = feet(), e = player();
    if (!f || !e) return;
    let at = null;
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      if (!(e.health > 0)) return;
      if (t < o.atk.at) continue;
      if (!at) { const r = dungeonToRealm(f[0], f[1], f[2]); at = arenaOf(r[0], r[2]); }
      blow(s, o.b, o.atk, t, t0, at);
      if (marks.get(o.atk.i)?.done) link.paid(o.atk.i);
    }
  }
  // The first bite lands one `POOL_TICK_MS` after stepping in. Stepping out for less than a tick keeps the running
  // timer, so stepping in and out does not skip bites.
  function burn(t, at, alive) {
    if (pools.length) pools = pools.filter((p) => t < p.until);
    if (!pools.length || !at || !alive) { inFire = false; return; }
    const p = sdPoolUnder(pools, at[0], at[1], t);
    if (!p) { if (inFire) { inFire = false; outAt = t; } return; }
    fireEl = p.el ?? null;
    if (!inFire) {
      inFire = true;
      if (t - outAt >= POOL_TICK_MS) { const f = feet(); if (f) play(SD_BLOW_CUES.pool, f); burnAt = t; return; }
    }
    if (t - burnAt < POOL_TICK_MS) return;
    burnAt = t;
    land(p.el ? SD_ELEMENT_GROUND[p.el] : SD_BLOWS_TEXT.burning, p.pct, p.base, false, p.el ?? null);
  }
  let heartsOf = null;
  const broke = (p) => { play(BOSS_CUES.crystalBreak, p); play(BOSS_CUES.crystalRing, p); };
  function hearts(s, t, away) {
    const X = s.cx;
    if (!X || s.fell || s.lost) {
      // The server sends the last Heart break together with the stun, so Hearts last seen standing before a stun
      // play as broken. A Reset that lands plays only the ring.
      if (heartsOf && !X && s.fi === heartsOf.fi && !away) {
        const stunned = s.stunAt >= heartsOf.called, broken = stunned && s.su > t;
        const taken = !stunned && t - (heartsOf.called + SD_BLOWS.reset.windup) < SD_HEART_LATE_MS;
        for (let k = 0; k < heartsOf.h.length; k++) if (heartsOf.h[k] > 0) { if (broken) broke(heartsOf.p[k]); else if (taken) play(BOSS_CUES.crystalRing, heartsOf.p[k]); }
      }
      heartsOf = null;
      return;
    }
    if (away || !heartsOf || heartsOf.fi !== s.fi || heartsOf.i !== X.i) {
      const called = s.rem?.atk?.a === SD_BLOWS.reset.id ? s.rem.atk.at - SD_BLOWS.reset.windup : -Infinity;
      heartsOf = { fi: s.fi, i: X.i, h: X.c.map((q) => q[2]), p: X.c.map((q) => realmToDungeon(SD_ARENA.x + q[0], 1.2, SD_ARENA.z + q[1])), called };
      if (!away && t - called <= SD_HEART_LATE_MS) for (const p of heartsOf.p) play(BOSS_CUES.crystalRise, p);
      return;
    }
    for (let k = 0; k < X.c.length; k++) {
      const q = X.c[k], was = heartsOf.h[k] ?? 0;
      heartsOf.h[k] = q[2];
      if (!(q[2] < was)) continue;
      if (q[2] > 0) play(BOSS_CUES.crystalHit, heartsOf.p[k]);
      else broke(heartsOf.p[k]);
    }
  }
  function fall(s, t) {
    if (s.fell && fellFi !== s.fi) {
      fellFi = s.fi;
      chartAt = t; chartFell = s.fell;
      if (t - s.fell.at < 5000) { play(SD_BLOW_CUES.fall, bodyAt(s, SD_BODY.remnant, s.fell.at)); say(SD_BLOWS_TEXT.fell, true); }
    }
    if (chartAt !== null) {
      if (s.fell && s.fell !== chartFell) chartFell = s.fell;
      const model = damageChartModel(chartFell, { boss: SD_BLOWS_TEXT.boss, me: me(), since: chartAt, now: t, crystals: SD_BLOWS_TEXT.hearts, theme: 'brass' });
      drawGateDamageChart(model, { hidden: hudHidden() });
      if (!model && t - chartAt >= DAMAGE_CHART_DELAY_MS + DAMAGE_CHART_MS) chartAt = null;
    }
  }

  return {
    frame() {
      const s = link.state(), t = link.now();
      if (s.fi !== marksFi) { marksFi = s.fi; marks.clear(); pools = []; inFire = false; }
      const t0 = prevT ?? t;
      prevT = t;
      // `hearts` and `owedBlows` must run before the idle return below. The stun that breaks the last Heart ends
      // every blow in flight, and owed blows land after the state drops them.
      hearts(s, t, !(t - t0 <= SD_VOICE_AWAY_MS));
      owedBlows(s, t, t0);
      if (!sdAnyInFlight(s) && !pools.length) { inFire = false; shapes = NONE; fall(s, t); return; }
      const f = feet(), e = player(), alive = !!f && !!e && e.health > 0;
      let at = null;
      // Only a player the server counted into this fight takes damage. A player whose join was refused still sees
      // every blow but is never judged.
      if (alive && link.counted()) { const [rx, ry, rz] = dungeonToRealm(f[0], f[1], f[2]); at = arenaOf(rx, rz); feetOver = ry >= SD_PILLAR_OVER_Y; } else feetOver = false;
      const out = [];
      for (const { b, atk } of sdBlowsInFlight(s)) {
        blow(s, b, atk, t, t0, alive ? at : null, feetOver);
        sdTelegraphShapes(atk, b, s.ph, t, out);
      }
      burn(t, at, alive && !s.fell);
      for (const p of sdPoolShapes(pools, t)) out.push(p);
      shapes = out;
      fall(s, t);
    },
    shapes: () => shapes,
    warm() {
      if (!passTried && gl) { passTried = true; try { pass = new GateTelegraphRenderer(gl); } catch (e) { console.warn('[sd] the telegraph would not build', e?.message ?? e); pass = null; } }
    },
    drawPass(proj, view, eye, seconds, fog = null) {
      const under = bodyMarks();
      if (!shapes.length && !under.length) return false;
      if (!passTried && gl) { passTried = true; try { pass = new GateTelegraphRenderer(gl); } catch (e) { console.warn('[sd] the telegraph would not build', e?.message ?? e); pass = null; } }
      if (!pass) return false;
      let drew = false;
      for (let i = 0; i < under.length; i++) { pass.draw(under[i], proj, view, eye, seconds, fog, SD_ARENA_CENTRE, null, SD_TELEGRAPH_FLOOR); drew = drew || pass.drawn > 0; }
      for (const sh of shapes) { pass.draw(sh, proj, view, eye, seconds, fog, SD_ARENA_CENTRE, null, SD_TELEGRAPH_FLOOR); drew = drew || pass.drawn > 0; }
      return drew;
    },
    state: () => ({ pools: pools.map((p) => ({ ...p })), inFire, marks: [...marks.entries()].map(([i, m]) => ({ i, ...m, seen: { ...m.seen } })), chartAt }),
    burning: () => inFire,
    over: () => feetOver,
    burningEl: () => (inFire ? fireEl : null),
    leave() {
      marks.clear(); pools = []; inFire = false; prevT = null; shapes = []; feetOver = false;
      marksFi = 0; fellFi = 0; endSaid = 0;
      heartsOf = null;
      if (chartAt !== null) { chartAt = null; drawGateDamageChart(null); }
    },
  };
}
