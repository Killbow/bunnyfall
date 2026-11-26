// @ts-check
import { ATTACK_BY_ID, ATTACKS, COURT_CENTRE, HALF, HIT_KINDS, POSE_SLACK, inCourt, nearestCourt, profileOf } from '../net/gateBrain.js';
import { strikeVerdict, landingPools } from '../net/gateStrike.js';
import { bossAct, bossFrame, bossGlow, bossPlace, bossHop, bossStandIn, bossCue, BOSS_CUES, QUAKE_ON, RELEASE_LEAD_MS, WARD_COLOR, emberColor, flameLookOf, gateHitFlash, halfName } from '../world/gateBoss.js';
import { courtToDungeon } from '../world/gateArena.js';
import { telegraphShape, markShape } from '../render/gateTelegraph.js';
import { setBatchHitFlash } from '../combat/hitFlash.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { creatureLook } from '../characters/creatureBodies.js';
import { rosterActor } from '../characters/rosterBodies.js';
import { mobileBillboardSize } from '../world/rmbFlats.js';
import { t } from '../ui/textManager.js';

export const FLAME_I = -1;
export const SUNDER_LATE_MS = 2000;
export const SUNDER_TEXT = Object.freeze({
  kneels: (name) => t('gate.sunder.kneels', '{name} kneels! Bring the other half down!', { name }),
  rises: (name) => t('gate.sunder.rises', '{name} rises.', { name }),
  rejoin: () => t('gate.sunder.rejoin', 'The halves rejoin in the first court. Run back!'),
});

const NONE = Object.freeze([]);
const noMark = () => ({ i: -1, at: NaN });
const marked = (m, atk) => m.i === atk.i && m.at === atk.at;
const setMark = (m, atk) => { m.i = atk.i; m.at = atk.at; };

const _views = new WeakMap();
/** @param {any} s */
export function flameOf(s) {
  const S = s?.sd;
  if (!S) return null;
  let v = _views.get(s);
  if (!v) {
    const F = S.fl;
    v = Object.freeze({ ...s, x: F.x, z: F.z, yaw: F.yaw, move: F.move, atk: F.atk, shieldUntil: F.sh, stunUntil: F.su, stunAt: F.sa, hp: S.h[HALF.flame], max: S.m, cx: null, lg: null, half: HALF.flame });
    _views.set(s, v);
  }
  return v;
}

/** @param {{ renderer?: any, getTexture?: any, uploadRecordFrame?: any, cam?: () => any, feet?: () => any, player?: () => any, say?: (text: string) => void, sound?: (cue: any, s: any, t: number, atk: any, point?: any) => void, land?: (atk: any, P: any) => void, burst?: (atk: any, A: any, P: any) => void, felt?: (s: any, t: number, A: any, atk: any) => void, lay?: (pools: any[]) => void, send?: (hit: any) => boolean, blowQ?: (who: string) => number, watching?: () => boolean, arsenal?: any, bossName?: (s: any) => string }} deps */
export function createGateFlame({
  renderer = null, getTexture = null, uploadRecordFrame = null, cam = () => null, feet = () => null, player = () => null,
  say = () => {}, sound = () => {}, land = () => {}, burst = () => {}, felt = () => {}, lay = () => {}, send = () => false, blowQ = () => 0,
  watching = () => false, arsenal = null, bossName = () => '',
} = {}) {
  let judged = noMark(), cued = noMark(), released = noMark(), landed = noMark(), quaked = noMark(), pooled = noMark();
  let prevT = -Infinity, hurtAt = -Infinity, knHeard = [0, 0], rjHeard = 0;
  let look = null, body = null, loading = null, batch = null, shown = false, standIn = null, shape = null, mark = null;
  const rec = {}, _glow = { x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0] };
  const _target = { i: FLAME_I, m: 0, feet: [0, 0, 0], height: 1, radius: 1, entity: null, mobile: null };
  const _targets = [], _shapes = [], _lights = [], _batches = [];
  let _mark = null, _markOf = null;

  function reset() {
    judged = noMark(); cued = noMark(); released = noMark(); landed = noMark(); quaked = noMark(); pooled = noMark();
    prevT = -Infinity; hurtAt = -Infinity; knHeard = [0, 0]; rjHeard = 0; standIn = null; shape = null; mark = null;
    arsenal?.reset?.();
  }
  // `mine` returns one shared array that the next call overwrites, so each caller reads it at once.
  const _mine = [0, 0];
  const mine = () => { const f = feet(); if (!f) return null; _mine[0] = f[0] - COURT_CENTRE[0]; _mine[1] = f[2] - COURT_CENTRE[2]; return _mine; };
  // Mirrors the relay, which rejects a hit on the Flame from a player outside the Flame's court.
  const inItsCourt = (F, now) => { const m = mine(); if (!m) return false; const [x, z] = bossPlace(F, now); return inCourt(m[0], m[1], nearestCourt(x, z), POSE_SLACK); };

  function judge(F, now, P) {
    const atk = F.atk, f = feet(), e = player(), standing = !!f && !!e && e.health > 0;
    if (atk && !marked(judged, atk) && standing) {
      const v = strikeVerdict(atk, f[0] - COURT_CENTRE[0], f[2] - COURT_CENTRE[2], now, prevT, P);
      if (v !== 'wait') { setMark(judged, atk); if (v === 'hit') land(atk, P); }
    }
    arsenal?.judge?.(F, now, P, mine(), null, standing);
  }
  function cue(F, now, P) {
    const atk = F.atk, A = atk ? ATTACK_BY_ID[atk.a] : null;
    if (!A) return;
    if (!marked(cued, atk)) { setMark(cued, atk); if (now < atk.at) sound(bossCue('windup', A, P), F, now, atk); }
    if (!marked(released, atk) && now >= atk.at - RELEASE_LEAD_MS) { setMark(released, atk); if (now < atk.at) sound(bossCue('release', A, P), F, now, atk); }
    const fresh = now < atk.at + Math.max(A.active, 1) + 400;
    if (!marked(landed, atk) && now >= atk.at) { setMark(landed, atk); if (fresh) { sound(bossCue('land', A, P), F, now, atk); burst(atk, A, P); felt(F, now, A, atk); } }
    if (!marked(quaked, atk) && now >= atk.at && QUAKE_ON.includes(A.key)) { setMark(quaked, atk); if (fresh) sound(BOSS_CUES.quake, F, now, atk); }
    if (P.atk[A.key].pool && !marked(pooled, atk) && now >= atk.at) { setMark(pooled, atk); if (fresh) lay(landingPools(atk, P)); }
  }
  function words(s, now, P) {
    const S = s.sd;
    for (const b of [HALF.blade, HALF.flame]) {
      const kn = S.kn[b] | 0;
      if (kn !== knHeard[b]) {
        if (kn > 0 && now - kn <= SUNDER_LATE_MS) say(SUNDER_TEXT.kneels(halfName(b, P, bossName(s))));
        else if (kn === 0 && knHeard[b] > 0 && !S.rj) say(SUNDER_TEXT.rises(halfName(b, P, bossName(s))));
        knHeard[b] = kn;
      }
    }
    if (S.rj && S.rj !== rjHeard) { rjHeard = S.rj; if (now - S.rj <= SUNDER_LATE_MS) say(SUNDER_TEXT.rejoin()); }
  }
  function loadBody(P) {
    const want = flameLookOf(P.aspect?.id);
    if (look && look.mobile !== want.mobile) { body = null; loading = null; if (batch) { renderer?.destroyBillboardBatch?.(batch); batch = null; } }
    look = want;
    if (body || loading || !getTexture || !uploadRecordFrame || !renderer?.createBillboardBatch) return;
    const archive = ENEMY_BASICS[look.mobile]?.maleTexture;
    if (!archive) return;
    const mobile = look.mobile;
    loading = Promise.resolve().then(() => getTexture(archive)).then((tex) => {
      if (look?.mobile === mobile) body = tex ? { tex, archive, scale: look.scale } : { failed: true };
    }, () => { body = { failed: true }; });
  }
  function drawBody(F, now, P) {
    loadBody(P);
    if (!body?.tex) { shown = false; return; }
    const act = bossAct(F, now, hurtAt), [x, z] = bossPlace(F, now);
    const at = courtToDungeon(x, bossHop(F, now), z), eye = cam() ?? at;
    const fr = bossFrame(act, F.yaw, at, eye, (r) => body.tex.getFrameCount?.(r) ?? 1);
    const rkey = `${fr.record}#${fr.frame}`;
    if (!renderer.textures?.has?.(`${body.archive}_${rkey}`)) uploadRecordFrame(body.archive, fr.record, fr.frame);
    const sz = mobileBillboardSize(body.tex, fr.record);
    const w = sz.w * body.scale * P.size, h = sz.h * body.scale * P.size;
    if (!batch) { batch = renderer.createBillboardBatch(body.archive, rkey, { w, h }, [[0, 0, 0]]); batch.origin = [0, 0, 0]; }
    shown = true;
    setBatchHitFlash(batch, gateHitFlash(hurtAt, -Infinity, now));
    batch.record = rkey;
    batch.size = { w: fr.flip ? -w : w, h };
    if (batch.bounds) batch.bounds[3] = Math.hypot(w, h) * 0.5;
    batch.origin[0] = at[0]; batch.origin[1] = at[1]; batch.origin[2] = at[2];
  }

  return {
    frame(s, now) {
      const F = flameOf(s);
      if (!F || s.fell || s.wrath != null) { shown = false; shape = null; mark = null; _targets.length = 0; if (!F) { knHeard = [0, 0]; } prevT = now; return; }
      const P = profileOf(F);
      judge(F, now, P);
      cue(F, now, P);
      words(s, now, P);
      drawBody(F, now, P);
      shape = telegraphShape(F.atk, F.phase, now, P, (k) => arsenal?.at?.(F.atk, k, mine()) ?? null);
      if (_markOf !== P) { _markOf = P; _mark = markShape([0, 0], 0, emberColor(P), P.bossR); }
      const [mx, mz] = bossPlace(F, now);
      _mark.origin[0] = mx; _mark.origin[1] = mz; _mark.yaw = F.yaw; _mark.color = now < F.shieldUntil ? WARD_COLOR : emberColor(P); _mark.court = nearestCourt(mx, mz); mark = _mark;
      _targets.length = 0;
      if (inItsCourt(F, now)) {
        standIn ??= bossStandIn(look ?? flameLookOf(P.aspect?.id), halfName(HALF.flame, P, bossName(s)), () => { const S = s.sd; return S && S.m > 0 ? S.h[HALF.flame] / S.m : null; });
        standIn.warded = now < F.shieldUntil || now < F.stunUntil;
        _target.m = s.sd.m; _target.feet = courtToDungeon(mx, 0, mz); _target.height = P.bossH; _target.radius = P.bossR; _target.entity = standIn; _target.mobile = look?.mobile ?? null;
        _targets.push(_target);
      }
      prevT = now;
    },
    targets: () => _targets,
    hit(s, { d, r } = /** @type {any} */ ({}), now) {
      const F = flameOf(s);
      if (!F || s.fell || s.wrath != null || !Object.values(HIT_KINDS).includes(r) || now < F.shieldUntil || now < F.stunUntil || !inItsCourt(F, now)) return false;
      const dmg = Math.round(d);
      if (!(dmg >= 1) || watching()) return false;
      hurtAt = now;
      return !!send({ q: blowQ('f'), d: dmg, r, b: HALF.flame });
    },
    shapes() { _shapes.length = 0; if (mark) _shapes.push(mark); if (shape) _shapes.push(shape); return _shapes; },
    lights(s, now) { _lights.length = 0; const F = flameOf(s); const g = F && shown ? bossGlow(F, now, _glow) : null; if (g) _lights.push(g); return _lights; },
    batches() { _batches.length = 0; if (batch && shown) _batches.push(batch); return _batches; },
    offerBodies(lane, s, now) {
      const F = flameOf(s);
      if (!F || !batch || !shown || !look) return;
      const cl = creatureLook({ mobileType: look.mobile });
      if (!cl) return;
      const act = bossAct(F, now, hurtAt);
      lane.offer(rosterActor(rec, { id: 'flame', look: cl, feet: batch.origin, yaw: F.yaw, moving: act.act === 'walk' || act.act === 'run', running: act.act === 'run',
        swingKey: F.atk?.at ?? null, hitKey: hurtAt, dead: 0, scale: (body?.scale ?? 1) * (profileOf(F).size ?? 1) }), batch, null, batch.hitFlash || 0);
    },
    order: (s, now, mineXZ, yaw) => { const F = flameOf(s); return F && arsenal?.order ? arsenal.order(F, now, profileOf(F), mineXZ, yaw) : null; },
    reset,
    leave() { if (batch) { renderer?.destroyBillboardBatch?.(batch); batch = null; } shown = false; reset(); },
    state: () => ({ judgedI: judged.i, cuedI: cued.i, landedI: landed.i, shown, shape, mark, targets: _targets.length, knHeard: [...knHeard], rjHeard }),
  };
}
