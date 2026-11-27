// @ts-check
import { HOST, HOST_KINDS, HOST_BLOWS, COURT_CENTRE as GATE_COURT_CENTRE, ATTACKS, hostAt, hostBlowUnder, nearestCourt } from '../net/gateBrain.js';
import { hostVerdict, hostTelegraphAt } from '../net/gateStrike.js';
import { hostLookOf, hostAct, hostFallAct, hostStandIn, hostCue, bossFrame, bossPlace, HOST_BITE_COLOR, hostPulseColor, emberColor, WARD_COLOR, TITHE_GOLD, BOSS_CUES, gateHitFlash } from '../world/gateBoss.js';
import { setBatchHitFlash } from '../combat/hitFlash.js';
import { wordShare } from '../combat/healthShare.js';
import { TELEGRAPH_KIND, TELEGRAPH_STYLE, TELEGRAPH_FLASH_MS, TELEGRAPH_EDGE, TELEGRAPH_POOL } from '../render/gateTelegraph.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { mobileBillboardSize } from '../world/rmbFlats.js';
import { creatureLook } from '../characters/creatureBodies.js'; import { rosterActor } from '../characters/rosterBodies.js';
import { t } from '../ui/textManager.js';

const an = (name) => `${/^[AEIOU]/i.test(name) ? 'An' : 'A'} ${name}`;
export const COURT_HOST_TEXT = Object.freeze({
  harriers: (boss, plural) => `${plural} rise from the fire!`,
  sappers: (boss, plural) => `Stop the ${plural} before they reach him!`,
  bearers: () => 'Ward-Bearers hold his ward. Break them!',
  drunk: (boss, name) => `${an(name)} reaches ${boss} and heals him.`,
  // After the last Ward-Bearer falls his own ward still holds for `P.shieldMs`, so this line says the ward is
  // failing, not broken.
  felled: (who, left) => (left > 0 ? `${who || 'A challenger'} cuts down a Ward-Bearer. ${left} ${left === 1 ? 'stands' : 'stand'}.` : 'The last Ward-Bearer falls. His ward is failing!'),
  crumbled: 'The Ward-Bearers crumble. His ward is failing!',
  tithe: () => t('gate.host.titheRises', 'A Tithe-Imp bolts from the fire with its tithe. Catch it!'),
  titheCaught: (who) => t('gate.host.titheCaught', '{who} catches the Tithe-Imp! Its tithe goes to all who struck it.', { who: who || t('gate.host.someone', 'A challenger') }),
  titheEscaped: () => t('gate.host.titheEscaped', 'The Tithe-Imp escapes into the fire.'),
});
export const HOST_LATE_MS = 2000;
export const HOST_SHAPES_MAX = 8;
export const HOST_PATH_HALF_W = 0.35;
export const HOST_PATH_ALPHA = 0.22;
export const HOST_TETHER_ALPHA = 0.4;
export const HOST_LIGHT_RANGE = 6;
export const HOST_LIGHT_Y = 1.5;
export const HOST_HURT_GAP_MS = 500;
// The page clock in seconds loses float precision, so the lane clock wraps every 60 s. That is a whole number of
// 1.5 Hz throbs, so the wrap is invisible.
export const HOST_LANE_CLOCK_MS = 60_000;
const SHAPE_SLOTS = new WeakMap();

export function waveLine(s, k, boss, plural) {
  if (s?.vg && s.vg[0] < 2) return null;
  return k === HOST.harrier ? COURT_HOST_TEXT.harriers(boss, plural) : k === HOST.sapper ? COURT_HOST_TEXT.sappers(boss, plural) : k === HOST.bearer ? COURT_HOST_TEXT.bearers()
    : k === HOST.tithe ? COURT_HOST_TEXT.tithe() : null;
}

// Blows sort nearest to the player first, so a blow that can land on the player is drawn within `HOST_SHAPES_MAX`.
const _blowOrder = [];
const blowGap = (a, mine) => (mine ? Math.hypot(a.atk.x - mine[0], a.atk.z - mine[1]) - HOST_BLOWS[a.k].r : 0);
export function hostShapes(s, now, P, out = [], mine = null) {
  out.length = 0;
  const ads = s?.lg?.ads;
  if (!ads?.length || s.fell || s.wrath != null) return out;
  let slots = SHAPE_SLOTS.get(out);
  if (!slots) SHAPE_SLOTS.set(out, (slots = []));
  const next = () => {
    const sh = (slots[out.length] ??= { kind: 0, origin: [0, 0], yaw: 0, r: 0, halfArc: 0, body: 0, end: [0, 0], halfW: 0, r0: 0, r1: 0, points: [], n: 0,
      t: 0, flash: 0, alpha: 0, color: HOST_BITE_COLOR, edge: TELEGRAPH_EDGE, court: 0, style: 0, since: 0, span: 1, after: -1, runS: 0, pool: TELEGRAPH_POOL.blow });
    out.push(sh);
    return sh;
  };
  const [bx, bz] = bossPlace(s, now);
  _blowOrder.length = 0;
  for (const a of ads) if (a.atk && HOST_BLOWS[a.k]) _blowOrder.push(a);
  if (mine && _blowOrder.length > HOST_SHAPES_MAX) _blowOrder.sort((p, q) => blowGap(p, mine) - blowGap(q, mine));
  for (const a of _blowOrder) {
    if (out.length >= HOST_SHAPES_MAX) break;
    const B = HOST_BLOWS[a.k], tel = hostTelegraphAt(a.atk, a.k, now);
    if (!tel || tel.since >= Math.max(B.active, 1) + TELEGRAPH_FLASH_MS) continue;
    const start = a.atk.at - B.windup, span = Math.max(B.active, 1);
    const fadeOut = tel.since > span ? 1 - (tel.since - span) / TELEGRAPH_FLASH_MS : 1;
    const el = hostBlowUnder(a.k, P).el, pulse = el != null, sh = next();
    sh.kind = TELEGRAPH_KIND.disc; sh.origin[0] = sh.end[0] = a.atk.x; sh.origin[1] = sh.end[1] = a.atk.z; sh.r = B.r; sh.halfW = 0;
    sh.t = tel.t; sh.flash = tel.since >= 0 ? 1 : 0; sh.alpha = Math.max(0, fadeOut); sh.color = pulse ? hostPulseColor(P) : HOST_BITE_COLOR; sh.edge = TELEGRAPH_EDGE;
    sh.court = nearestCourt(a.atk.x, a.atk.z); sh.style = pulse ? TELEGRAPH_STYLE[el] ?? TELEGRAPH_STYLE.weight : TELEGRAPH_STYLE.weight;
    sh.since = Math.max(0, (now - start) / 1000); sh.span = B.windup / 1000; sh.after = tel.since >= 0 ? tel.since / 1000 : -1; sh.runS = 0; sh.pool = TELEGRAPH_POOL.blow;
  }
  const seethe = (now % HOST_LANE_CLOCK_MS) / 1000;
  const lane = (a, color, alpha) => {
    const [x, z] = hostAt(a, now), sh = next();
    sh.kind = TELEGRAPH_KIND.lane; sh.origin[0] = x; sh.origin[1] = z; sh.end[0] = bx; sh.end[1] = bz; sh.r = 0; sh.halfW = HOST_PATH_HALF_W;
    sh.t = 1; sh.flash = 0; sh.alpha = alpha; sh.color = color; sh.court = nearestCourt(x, z); sh.style = TELEGRAPH_STYLE.weight;
    sh.since = seethe; sh.span = 1; sh.after = -1; sh.runS = 0; sh.pool = TELEGRAPH_POOL.path;
  };
  if (now < s.shieldUntil) for (const a of ads) { if (out.length >= HOST_SHAPES_MAX) break; if (a.k === HOST.bearer) lane(a, WARD_COLOR, HOST_TETHER_ALPHA); }
  for (const a of ads) { if (out.length >= HOST_SHAPES_MAX) break; if (a.k === HOST.sapper && a.mv) lane(a, emberColor(P), HOST_PATH_ALPHA); }
  return out;
}

/** @param {{ renderer?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, audio?: any, cam?: () => number[]|null, feet?: () => number[]|null, player?: () => any, land?: (blow: { pct: number, base: number, el: string|null, name: string }) => void, say?: (text: string) => void, send?: (hit: { i: number, q: number, d: number, r: number }) => boolean, blowQ?: (who: string) => number, centre?: number[], }} deps */
export function createGateHost({ renderer = null, getTexture = null, uploadRecordFrame = null, audio = null, cam = () => null, feet = () => null, player = () => null, land = () => {}, say = () => {}, send = () => false, blowQ = null, centre = null } = {}) {
  const COURT_CENTRE = centre ?? GATE_COURT_CENTRE;
  const courtToDungeon = (x, y, z) => [COURT_CENTRE[0] + x, COURT_CENTRE[1] + y, COURT_CENTRE[2] + z];
  let day = null;
  const bodies = new Map(), falling = new Map(), goneSeen = new Set(), wavesSaid = new Set(), crumbleSaid = new Set();
  const textures = new Map();
  const _targets = [], _batches = [], _lights = [], _shapes = [], _live = new Set(), _mine = [0, 0];
  let blowSeq = 0;
  const seqOf = blowQ ?? (() => ++blowSeq);

  function play(cue, p) {
    if (!cue || !audio || !p) return;
    const opts = { maxDistance: cue.reach, distanceModel: 'linear', pitch: cue.pitch };
    try { if (cue.id != null) audio.play3dId?.(cue.id, p, cue.volume, opts); else audio.play3d?.(cue.clip, p, cue.volume, opts); } catch { }
  }
  const placeOf = (a, t, y = 1) => { const [x, z] = hostAt(a, t); return courtToDungeon(x, y, z); };

  function texture(mobile) {
    const archive = ENEMY_BASICS[mobile]?.maleTexture;
    if (!archive || !getTexture) return null;
    const had = textures.get(archive);
    if (had && !(had instanceof Promise)) return had.failed ? null : had;
    if (!had) {
      const p = Promise.resolve().then(() => getTexture(archive)).then(
        (tex) => { textures.set(archive, tex ? { tex, archive } : { failed: true }); if (!tex) console.warn(`[gate] a host sprite (archive ${archive}) would not load`); },
        (e) => { textures.set(archive, { failed: true }); console.warn('[gate] a host sprite', e?.message ?? e); });
      textures.set(archive, p);
    }
    return null;
  }
  function destroyBatch(b) { if (b?.batch) { renderer?.destroyBillboardBatch?.(b.batch); b.batch = null; } }

  function draw(b, act, x, z, yaw, t) {
    b.act = act.act;
    const T = texture(b.look.mobile);
    if (!T || !renderer?.createBillboardBatch || act.act === 'gone') { b.shown = false; return; }
    const y = (act.sink > 0 ? -act.sink : 0) + (b.look.hover > 0 ? b.look.hover + 0.15 * Math.sin(t / 260 + b.seed) : 0);
    const at = (b.at ??= [0, 0, 0]);
    at[0] = COURT_CENTRE[0] + x; at[1] = COURT_CENTRE[1] + y; at[2] = COURT_CENTRE[2] + z;
    const eye = cam() ?? at;
    const fr = bossFrame(act, yaw, at, eye, (rec) => T.tex.getFrameCount?.(rec) ?? 1);
    const rkey = `${fr.record}#${fr.frame}`;
    if (!renderer.textures?.has?.(`${T.archive}_${rkey}`)) uploadRecordFrame?.(T.archive, fr.record, fr.frame);
    const sz = mobileBillboardSize(T.tex, fr.record), k = b.look.scale ?? 1;
    const size = { w: (fr.flip ? -sz.w : sz.w) * k, h: sz.h * k };
    if (!b.batch) { b.batch = renderer.createBillboardBatch(T.archive, rkey, { w: sz.w * k, h: sz.h * k }, [[0, 0, 0]]); b.batch.origin = [0, 0, 0]; }
    b.shown = true;
    setBatchHitFlash(b.batch, gateHitFlash(b.hurtAt, b.courtAt ?? -Infinity, t));
    b.batch.record = rkey;
    b.batch.size = size;
    if (b.batch.bounds) b.batch.bounds[3] = Math.hypot(sz.w, sz.h) * 0.5 * k;
    b.batch.origin[0] = at[0]; b.batch.origin[1] = at[1]; b.batch.origin[2] = at[2];
  }

  function clear() {
    for (const b of bodies.values()) destroyBatch(b);
    for (const b of falling.values()) destroyBatch(b);
    bodies.clear(); falling.clear(); goneSeen.clear(); wavesSaid.clear(); crumbleSaid.clear();
    _targets.length = 0; _batches.length = 0; _lights.length = 0; _shapes.length = 0;
  }

  return {
    /**
     * @param {any} s
     * @param {number} t
     * @param {any} P
     * @param {string} boss
     */
    frame(s, t, P, boss) {
      if (!s || s.day === null || !s.lg) { if (day !== null || bodies.size || falling.size) { clear(); day = null; } return; }
      if (s.day !== day) { clear(); day = s.day; }
      _targets.length = 0; _batches.length = 0; _lights.length = 0;
      const f = feet(), me = player(), standing = !!f && !!me && me.health > 0 && !s.fell && s.wrath == null;
      const live = _live;
      live.clear();
      for (const a of s.lg.ads) {
        live.add(a.i);
        let b = bodies.get(a.i);
        if (!b) {
          b = { i: a.i, look: hostLookOf(a.k, P.aspect.id), batch: null, shown: false, hurtAt: -Infinity, courtAt: -Infinity, heardHurt: -Infinity, hp: a.h, wound: NaN, landed: NaN, judged: NaN, seed: (a.i * 0.6180339) % 1 * 6.283 };
          bodies.set(a.i, b);
          if (Number.isFinite(a.rose) && t - a.rose <= HOST_LATE_MS && !s.fell && s.wrath == null) {
            play(hostCue('rise', b.look.mobile), placeOf(a, t));
            const wave = `${a.k}@${a.rose}`;
            if (!wavesSaid.has(wave)) {
              wavesSaid.add(wave);
              const line = waveLine(s, a.k, boss, b.look.plural);
              if (line) say(line);
            }
          }
        }
        if (a.h < b.hp && t - b.heardHurt >= HOST_HURT_GAP_MS) { b.heardHurt = t; play(hostCue('hurt', b.look.mobile), placeOf(a, t, 1.2)); }
        if (a.h < b.hp) b.courtAt = t;
        b.hp = a.h;
        if (a.atk) {
          const at = a.atk.at, p = () => courtToDungeon(a.atk.x, 1, a.atk.z);
          if (b.wound !== at) { b.wound = at; if (t < at && at - t <= HOST_BLOWS[a.k].windup + HOST_LATE_MS) play(hostCue('windup', b.look.mobile), p()); }
          if (b.landed !== at && t >= at) { b.landed = at; if (t - at <= HOST_LATE_MS) play(hostCue('land', b.look.mobile), p()); }
          if (b.judged !== at && standing) {
            const v = hostVerdict(a.atk, a.k, f[0] - COURT_CENTRE[0], f[2] - COURT_CENTRE[2], t);
            if (v !== 'wait') { b.judged = at; if (v === 'hit') land(hostBlowUnder(a.k, P)); }
          }
        }
        const [x, z] = hostAt(a, t);
        const yaw = a.k === HOST.bearer && t < s.shieldUntil ? (() => { const [bx, bz] = bossPlace(s, t); return Math.atan2(bx - x, bz - z); })() : a.yaw;
        const act = hostAct(a, t, b.look, b.hurtAt);
        b.yaw = yaw;
        draw(b, act, x, z, yaw, t);
        if (b.shown && b.batch) _batches.push(b.batch);
        const T = (b.target ??= { i: a.i, feet: [0, 0, 0], height: HOST_KINDS[a.k].h, radius: HOST_KINDS[a.k].r, entity: hostStandIn(b.look, a.i, () => wordShare(b.hp, b.target?.m)), mobile: b.look.mobile, name: b.look.name, m: a.m });
        T.feet[0] = COURT_CENTRE[0] + x; T.feet[1] = COURT_CENTRE[1] + b.look.hover - act.sink; T.feet[2] = COURT_CENTRE[2] + z;
        _targets.push(T);
        if ((a.k === HOST.bearer && t < s.shieldUntil) || a.k === HOST.tithe) {
          // The Tithe-Imp's light is `carried`, so it takes no shadow caster slot; a moving caster redraws its cube
          // map every frame.
          const L = (b.light ??= { x: 0, y: 0, z: 0, range: HOST_LIGHT_RANGE, color: [0, 0, 0], carried: a.k === HOST.tithe }), C = a.k === HOST.tithe ? TITHE_GOLD : WARD_COLOR;
          const k = 0.8 + 0.25 * Math.sin(t / 180 + b.seed);
          L.x = COURT_CENTRE[0] + x; L.y = COURT_CENTRE[1] + HOST_LIGHT_Y; L.z = COURT_CENTRE[2] + z;
          L.color[0] = C[0] * k; L.color[1] = C[1] * k; L.color[2] = C[2] * k;
          _lights.push(L);
        }
      }
      // The Ward-Bearer count includes this frame's unseen falls and drops by one per fall, so two falls between
      // frames announce 2 and then 1.
      let bearersLeft = 0;
      for (const a of s.lg.ads) if (a.k === HOST.bearer) bearersLeft++;
      for (const g of s.lg.gone) if (g.k === HOST.bearer && g.w === 0 && !goneSeen.has(`${g.i}@${g.at}`)) bearersLeft++;
      const wrathGathers = s.atk?.a === ATTACKS.wrath.id;
      for (const g of s.lg.gone) {
        const key = `${g.i}@${g.at}`;
        if (goneSeen.has(key)) continue;
        goneSeen.add(key);
        if (g.k === HOST.bearer && g.w === 0) bearersLeft--;
        const b = bodies.get(g.i) ?? { i: g.i, look: hostLookOf(g.k, P.aspect.id), batch: null, shown: false, seed: 0 };
        bodies.delete(g.i);
        if (g.w === 1) destroyBatch(b);
        else falling.set(key, { ...b, g });
        const fresh = t - g.at <= HOST_LATE_MS, p = courtToDungeon(g.x, 1, g.z);
        if (!fresh) continue;
        if (g.w === 1) {
          play(hostCue('drunk', b.look.mobile), p);
          const [bx, bz] = bossPlace(s, t);
          play(BOSS_CUES.growl, courtToDungeon(bx, 2.5, bz));
          say(COURT_HOST_TEXT.drunk(boss, b.look.name));
        } else {
          play(hostCue('fall', b.look.mobile), p);
          if (g.k === HOST.bearer && g.w === 0) say(COURT_HOST_TEXT.felled(g.n, bearersLeft));
          else if (g.k === HOST.tithe && !s.fell && s.wrath == null) say(g.w === 0 ? COURT_HOST_TEXT.titheCaught(g.n) : COURT_HOST_TEXT.titheEscaped());
          else if (g.k === HOST.bearer && g.w === 2 && !s.fell && s.wrath == null && !wrathGathers && !crumbleSaid.has(g.at)) { crumbleSaid.add(g.at); say(COURT_HOST_TEXT.crumbled); }
        }
      }
      for (const [i, b] of bodies) if (!live.has(i)) { destroyBatch(b); bodies.delete(i); }
      for (const [key, b] of falling) {
        const act = hostFallAct(b.g, t, b.look);
        if (act.act === 'gone') { destroyBatch(b); falling.delete(key); continue; }
        draw(b, act, b.g.x, b.g.z, b.yaw ?? 0, t);
        if (b.shown && b.batch) _batches.push(b.batch);
      }
      const fp = feet();
      if (fp) { _mine[0] = fp[0] - COURT_CENTRE[0]; _mine[1] = fp[2] - COURT_CENTRE[2]; }
      hostShapes(s, t, P, _shapes, fp ? _mine : null);
    },
    targets: () => _targets,
    batches: () => _batches,
    offerBodies(lane) {
      const one = (b, dead) => {
        const look = b.shown && b.batch ? creatureLook({ mobileType: b.look.mobile }) : null;
        if (!look) return;
        lane.offer(rosterActor(b, { id: `host:${b.i}`, look, feet: b.batch.origin, yaw: b.yaw ?? 0, moving: b.act === 'walk', scale: b.look.scale ?? 1,
          swingKey: dead ? null : b.wound, hitKey: dead ? null : Math.max(b.hurtAt ?? -Infinity, b.courtAt ?? -Infinity), dead: dead ? 1 + ((b.i | 0) % 3) : 0 }), b.batch,
        null, b.batch.hitFlash || 0);
      };
      for (const b of bodies.values()) one(b, false);
      for (const b of falling.values()) one(b, true);
    },
    lights: () => _lights,
    shapes: () => _shapes,
    hit({ i, d, r } = /** @type {any} */ ({}), t = 0) {
      const b = bodies.get(i);
      const dmg = Math.round(d);
      if (!b || !(dmg >= 1)) return false;
      b.hurtAt = t;
      return !!send({ i, q: seqOf(`a${i}`), d: dmg, r });
    },
    state: () => ({ day, bodies: [...bodies.keys()], falling: [...falling.keys()], shown: _batches.length, targets: _targets.length, shapes: _shapes.length, lights: _lights.length }),
    leave() { clear(); day = null; },
  };
}
