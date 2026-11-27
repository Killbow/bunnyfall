// @ts-check

import { MW_WEAPON_TYPE, MW_UNITS_PER_METER } from '../../formats/mwFirstPerson.js';
import { getPref } from '../../ui/uiPrefs.js';
import { algebra, ease, clamp01, RAD, bodyOf, bodyKindOf, reflect, bodyTurn, mul, transpose } from './bodyKit.js';
import { rotAxisAngle, rotFraction } from '../../combat/climbRig.js';
import { createGaitState, stepGait, gaitPose, TURN } from './gait.js';
import { carryClassOf, carryHands, CARRY, TWO_HAND_GRIP, TWO_HAND_HAFT, armByAngles, mirrorRequest, hafHand, trunkPush, blendHand, gaitShares, turnAbout, strideRide } from './carry.js';
import { meleeFamilyOf, blowName, blowU, blowPose, windFor } from './melee.js';
import { solveBody, gripRequest } from './bodySolve.js';

const { add, scale, sub, cross, norm, len, lerp } = algebra;

export const MOTION_EASE = Object.freeze({ in: 0.14, out: 0.1, outFast: 0.05, armIn: 0.12, armOut: 0.07, cls: 0.14, carry: 14 });

export const BLOW_TRUNK = Object.freeze({ steer: 0.6, twist: 50 });

const SHEET_BLADE = Object.freeze({ one: 58, two: 88, wide: 112, spear: 120, dual: 54 });

export function sceneInput({
  forward = 0, strafe = 0, speed = 0, running = false, sneaking = false, yaw = 0, grounded = true, travel = null, carriedYaw = 0,
  weapon = MW_WEAPON_TYPE.None, hands = 'single', shown = undefined, blow = null, kind = 'male',
  height = 1, weight = 1, torch = false, shield = false, spell = false, spellHand = false, equip = false, rifle = false, on = true, busy = null, guard = null,
} = {}) {
  return {
    on, kind, busy, speed, forward, strafe, running, sneaking, grounded, swimming: false, levitating: false, yaw, travel, carriedYaw,
    height, weight, mwType: weapon, shown: shown ?? weapon !== MW_WEAPON_TYPE.None, hands, torch, shield, spell, spellHand, equip, rifle, blow, guard,
  };
}

const SECTION_OF = Object.freeze({ AttackWindUp: 'windup', AttackRelease: 'release', AttackEnd: 'follow' });

export function motionWord({
  cam = null, third = false, rig = null, built = null, dead = false, hit = false, climb = 0, upper = 'None',
  attackType = null, reversed = false, hand = null, progress = 0, strength = 1, shown = false, hands = 'single',
  torch = false, spell = false, spellHand = false, rifle = 0, guard = null,
} = {}) {
  const mv = (cam && cam.move) || {};
  const kind = bodyKindOf(rig?.settingsSkeleton);
  const on = !!third && !!kind && !!rig?.ok && !built?.creature && !built?.werewolf && getPref('mwBodyMotion') !== false;
  const busy = dead ? 'dead' : hit ? 'hit' : climb > 0.02 || cam?.climb ? 'climb' : cam?.seat || cam?.saddle ? 'seat' : null;
  const section = SECTION_OF[upper] ?? null;
  return {
    on, kind, busy,
    speed: Number(mv.speed) || 0, forward: Number(mv.forward) || 0, strafe: Number(mv.strafe) || 0, running: !!mv.running,
    sneaking: !!cam?.sneaking, grounded: mv.grounded !== false, swimming: !!mv.swimming, levitating: !!mv.levitating,
    travel: Array.isArray(mv.travel) ? mv.travel : null, carriedYaw: Number(mv.carriedYaw) || 0,
    yaw: Number.isFinite(mv.bodyYaw) ? mv.bodyYaw : (Number(cam?.yaw) || 0) + (Number(mv.bodyYawOff) || 0),
    height: built?.raceScale?.height ?? 1, weight: built?.raceScale?.weight ?? 1,
    mwType: rig?.mwType ?? MW_WEAPON_TYPE.None, shown: !!shown, hands, torch: !!torch, spell: !!spell,
    spellHand: !!spellHand,
    shield: !!rig?.arm?.pieces?.some((p) => /^shield\b/.test(p.slot ?? '')),
    equip: upper === 'Equipping' || upper === 'Unequipping', rifle: rifle > 0.01,
    blow: section && attackType ? { type: attackType, reversed: !!reversed, hand, section, progress, strength } : null,
    guard: guard && (guard.L > 0 || guard.R > 0) ? { L: Number(guard.L) || 0, R: Number(guard.R) || 0 } : null,
  };
}

export const TRUNK_CLEAR = 0.29;


export function createBodyMotion({ trunkClear = TRUNK_CLEAR } = {}) {
  const gait = createGaitState();
  let input = sceneInput({ on: false });
  let w = 0;
  const armW = { L: 0, R: 0 };
  let cls = 'free', clsFrom = null, clsMix = 1;
  const shares = { x: null, v: { idle: 0, walk: 0, run: 0, sneak: 0 } };
  let body = null;
  let last = null;
  let wasOn = false;
  let stance = null, stepTime = null, bpNow = null;
  let lastBlow = null;
  let cut = null;
  let drawn = null;
  const gaitInput = () => ({
    speed: input.speed, forward: input.forward, strafe: input.strafe, running: input.running, sneaking: input.sneaking,
    yaw: input.yaw, grounded: input.grounded, kind: input.kind, travel: input.travel, carriedYaw: input.carriedYaw,
    legM: body ? (body.leg * (input.height || 1)) / MW_UNITS_PER_METER : 1,
    unitsPerM: MW_UNITS_PER_METER / (input.weight || 1), unitsPerMz: MW_UNITS_PER_METER / (input.height || 1),
    stance, stepTime,
  });
  function stanceNow(bp) {
    const a = CARRY[clsFrom]?.stand ?? null, b = CARRY[cls]?.stand ?? null, t = clsFrom ? clsMix : 1;
    const mixV = (p, q) => [lerp(p?.[0] ?? 0, q?.[0] ?? 0, t), lerp(p?.[1] ?? 0, q?.[1] ?? 0, t)];
    const st = {
      feet: { L: mixV(a?.feet?.L, b?.feet?.L), R: mixV(a?.feet?.R, b?.feet?.R) },
      toe: { L: lerp(a?.toe?.L ?? 0, b?.toe?.L ?? 0, t), R: lerp(a?.toe?.R ?? 0, b?.toe?.R ?? 0, t) },
      hipYaw: lerp(a?.hipYaw ?? 0, b?.hipYaw ?? 0, t), lean: lerp(a?.lean ?? 0, b?.lean ?? 0, t),
      hipShift: a?.hipShift || b?.hipShift ? mixV(a?.hipShift, b?.hipShift) : null,
    };
    if (bp && bp.step > 0) {
      const lead = bp.family === 'fists' ? 'L' : bp.side === 'L' ? 'R' : 'L';
      st.feet[lead] = [st.feet[lead][0], st.feet[lead][1] + bp.step * bp.wind * bp.w];
    }
    return st;
  }
  const blowNow = (from = null) => {
    const b = input.blow;
    if (!b || !b.section) return null;
    const family = meleeFamilyOf(cls);
    if (!family || (b.type !== 'chop' && b.type !== 'slash' && b.type !== 'thrust')) return null;
    const side = family !== 'fists' && input.hands !== 'dual' ? 'R' : b.hand === 'L' ? 'L' : 'R';
    const name = blowName(b.type, b.reversed);
    const bp = blowPose(family, name, blowU(b.section, b.progress), side, from);
    if (!bp) return null;
    return { ...bp, family, name, wind: windFor(b.strength) };
  };

  function handsFor(ctx, gp, bp, steady = null) {
    let hands = carryHands(cls, gp, ctx, { armW, shares: shares.x, steady });
    if (clsFrom && clsMix < 1) {
      const from = carryHands(clsFrom, gp, ctx, { armW, shares: shares.x, steady });
      hands = { L: blendHand(from.L, hands.L, clsMix), R: blendHand(from.R, hands.R, clsMix) };
    }
    if (input.guard && (cls === 'dual' || cls === 'fists')) {
      for (const side of ['L', 'R']) if (input.guard[side] > 0 && hands[side]) hands[side] = lowered(hands[side], ctx.frames.shoulder[side], ctx.frames.up, input.guard[side]);
    }
    if (!bp || !(bp.w > 0)) return hands;
    const from = carryFrom(hands[bp.side], bp.side, ctx, bp.family === 'fists');
    const keyed = from || cut ? blowPose(bp.family, bp.name, bp.u, bp.side, { start: cut ?? from, end: from }) : null;
    const strike = blowHands(keyed ? { ...bp, ...keyed } : bp, cls, ctx, armW, trunkClear);
    const out = { L: blendHand(hands.L, strike.L, bp.w * (strike.L ? 1 : 0)), R: blendHand(hands.R, strike.R, bp.w * (strike.R ? 1 : 0)) };
    drawn = carryFrom(out[bp.side], bp.side, ctx, bp.family === 'fists');
    return out;
  }

  const motion = {
    step(dt, frame) {
      input = frame ?? sceneInput({ on: false });
      if (input.on && !wasOn) Object.assign(gait, createGaitState());
      wasOn = !!input.on;
      const free = !!input.on && !input.busy && input.grounded !== false && !input.swimming && !input.levitating;
      w = ease(w, free ? 1 : 0, free ? MOTION_EASE.in : (input.busy === 'dead' || input.busy === 'hit' ? MOTION_EASE.outFast : MOTION_EASE.out), dt);
      if (!free && w < 1e-3) { w = 0; last = null; }
      const next = carryClassOf(input);
      if (next !== cls) {
        if (clsFrom && next === clsFrom) { clsFrom = cls; cls = next; clsMix = 1 - clsMix; } else { clsFrom = cls; cls = next; clsMix = 0; }
      }
      clsMix = ease(clsMix, 1, MOTION_EASE.cls, dt);
      if (clsMix > 0.999) { clsMix = 1; clsFrom = null; }
      const hands = !input.equip && !input.rifle && cls !== 'clip';
      const shieldArm = !!input.shield && (cls === 'one' || cls === 'free');
      for (const side of ['L', 'R']) {
        const want = hands && !(side === 'L' && (input.torch || shieldArm || input.spellHand)) ? 1 : 0;
        armW[side] = ease(armW[side], want, want ? MOTION_EASE.armIn : MOTION_EASE.armOut, dt);
        if (!want && armW[side] < 1e-3) armW[side] = 0;
      }
      {
        const sn = clamp01(gait.sneak), target = gaitShares({ move: gait.move, run: clamp01(gait.run) * (1 - sn), sneak: sn });
        if (!shares.x || !(dt > 0)) shares.x = { ...target };
        else {
          let sum = 0;
          for (const g of ['idle', 'walk', 'run', 'sneak']) {
            const d0 = shares.x[g] - target[g], v0 = shares.v[g], e = Math.exp(-MOTION_EASE.carry * dt), j = v0 + MOTION_EASE.carry * d0;
            shares.x[g] = Math.max(0, target[g] + (d0 + j * dt) * e);
            shares.v[g] = (v0 - MOTION_EASE.carry * j * dt) * e;
            sum += shares.x[g];
          }
          if (sum > 0) for (const g of ['idle', 'walk', 'run', 'sneak']) shares.x[g] /= sum;
        }
      }
      let seen = blowNow(cut ? { start: cut } : null);
      if (seen && lastBlow && lastBlow.w > 0.05 && (seen.name !== lastBlow.name || seen.u + 0.05 < lastBlow.u)) {
        const m = lastBlow.side === 'L' ? -1 : 1;
        cut = {
          ...(drawn ?? {}), w: lastBlow.w,
          chest: [lastBlow.chest[0] * m, lastBlow.chest[1] * m, lastBlow.chest[2]], hip: lastBlow.hip * m,
          shift: lastBlow.shift, drop: lastBlow.drop, step: lastBlow.step, off: lastBlow.off,
        };
        seen = blowNow({ start: cut });
      }
      if (!seen) cut = null;
      if (seen) seen.wind = lastBlow && !cut ? ease(lastBlow.wind, seen.wind, MOTION_EASE.cls, dt) : seen.wind;
      if (seen) lastBlow = seen;
      else if (lastBlow && lastBlow.w > 1e-3) lastBlow = { ...lastBlow, w: ease(lastBlow.w, 0, MOTION_EASE.out, dt) };
      else lastBlow = null;
      bpNow = seen ?? lastBlow;
      stance = stanceNow(bpNow);
      stepTime = bpNow && bpNow.step > 0 && bpNow.w > 0.05 ? TURN.quick : null;
      if (input.on && body) stepGait(gait, gaitInput(), body, dt);
      return w;
    },
    apply(skeleton, pose, rootRef, skelMats) {
      if (!(w > 1e-3)) { last = null; return null; }
      const measured = bodyOf(skeleton, rootRef, skelMats);
      if (!measured) { last = null; return null; }
      if (body !== measured) { body = measured; Object.assign(gait, createGaitState()); stepGait(gait, gaitInput(), body, 0); }
      const gi = gaitInput();
      const bp = bpNow;
      const k = bp ? bp.w : 0;
      const wind = bp ? bp.wind * k : 0;
      const gp = gaitPose(gait, gi, body);
      const L = body.leg;
      const runLean = lerp(CARRY[clsFrom]?.runLean ?? 0, CARRY[cls]?.runLean ?? 0, clsFrom ? clsMix : 1) * gp.run * gp.move * RAD;
      const runTurn = lerp(CARRY[clsFrom]?.runTurn ?? 0, CARRY[cls]?.runTurn ?? 0, clsFrom ? clsMix : 1) * gp.run * gp.move * RAD;
      const hipYaw = gp.hip.yaw - gait.psi * gp.move * BLOW_TRUNK.steer * k + (bp ? bp.hip * RAD * wind : 0);
      const chestAt = (wave) => ({
        yaw: Math.max(hipYaw - BLOW_TRUNK.twist * RAD, Math.min(hipYaw + BLOW_TRUNK.twist * RAD, (gp.chest.yaw - gp.chest.wave.yaw * (1 - wave) + runTurn) * (1 - k) + (bp ? bp.chest[0] * RAD * wind : 0))),
        roll: gp.chest.roll - gp.chest.wave.roll * (1 - wave) + (bp ? bp.chest[1] * RAD * wind : 0),
        pitch: gp.chest.pitch + runLean + (bp ? bp.chest[2] * RAD * wind : 0),
      });
      const sh = shares.x ?? gaitShares(gp);
      const ride = lerp(clsFrom ? strideRide(clsFrom, sh, armW.L) : 1, strideRide(cls, sh, armW.L), clsFrom ? clsMix : 1);
      const chest = chestAt(ride), calm = chestAt(0);
      const steady = { ride, turn: rotFraction(mul(bodyTurn(calm.yaw, calm.roll, calm.pitch), transpose(bodyTurn(chest.yaw, chest.roll, chest.pitch))), w * Math.max(armW.L, armW.R)) };
      const plan = {
        w,
        hip: {
          at: add(gp.hip.at, [0, bp ? bp.shift * L * wind : 0, bp ? -bp.drop * L * wind : 0]),
          yaw: hipYaw, roll: gp.hip.roll, pitch: gp.hip.pitch,
        },
        chest,
        head: { yaw: 0, roll: 0, pitch: 0 },
        feet: gp.feet,
        armW: { L: armW.L, R: armW.R },
        arms: (ctx) => handsFor(ctx, gp, bp, steady),
      };
      const report = solveBody(skeleton, pose, rootRef, skelMats, plan);
      last = { gp, bp, report };
      return report;
    },
    hands: handsFor,
    slot: (skeleton, pose, rootRef, skelMats) => motion.apply(skeleton, pose, rootRef, skelMats),
    weight: () => w,
    stride: () => ({ phase: gait.shown, move: gait.move * w, hipYaw: last?.gp ? last.gp.hip.yaw * w : 0 }),
    status() {
      const gp = last?.gp;
      const mode = !gp ? 'off' : gp.sneak > 0.5 ? 'sneak' : gp.move < 0.5 ? 'stand' : gp.run > 0.5 ? 'run' : 'walk';
      return {
        w, cls, mode, phase: gait.phase, speed: gait.speed, psi: gait.psi, back: gait.back, bank: gait.bank, stepping: gait.feet.L?.swing?.kind === 'step' ? 'L' : gait.feet.R?.swing?.kind === 'step' ? 'R' : null,
        blow: last?.bp ? `${last.bp.family} u=${last.bp.u.toFixed(2)}` : null,
        label: `${cls} ${mode}${last?.bp ? ` u${last.bp.u.toFixed(2)}` : ` psi${(gait.psi / RAD).toFixed(0)}`}`,
        blade: SHEET_BLADE[cls] ? { R: SHEET_BLADE[cls], L: cls === 'dual' ? SHEET_BLADE[cls] : null } : {},
        arms: { L: armW.L, R: armW.R },
      };
    },
    reset() { Object.assign(gait, createGaitState()); w = 0; armW.L = 0; armW.R = 0; cls = 'free'; clsFrom = null; clsMix = 1; last = null; shares.x = null; lastBlow = null; cut = null; drawn = null; },
  };
  return motion;
}

function lowered(h, S, up, angle) {
  const v = sub(h.at, S), ax = cross(v, up), l = len(ax);
  if (!(l > 1e-6)) return h;
  return turnAbout(h, S, rotAxisAngle(scale(ax, 1 / l), -angle));
}

function carryFrom(h, side, ctx, fists) {
  if (!h) return null;
  const { body, frames } = ctx;
  const C = scale(add(frames.shoulder.L, frames.shoulder.R), 0.5), A = body.arm;
  const mx = (v) => (side === 'L' ? [-v[0], v[1], v[2]] : v);
  if (fists) return h.at && h.fingers && h.palm ? { grip: mx(scale(sub(h.at, C), 1 / A)), fingers: mx(h.fingers), palm: mx(h.palm) } : null;
  if (!h.grip || !h.frame) return null;
  let grip = h.grip, blade = h.frame.blade, edge = h.frame.edge;
  if (side === 'L') { grip = add(C, reflect(sub(grip, C), frames.right)); blade = reflect(blade, frames.right); edge = reflect(edge, frames.right); }
  return { grip: mx(scale(sub(grip, C), 1 / A)), blade: mx(blade), edge: mx(edge) };
}

function blowHands(bp, cls, ctx, armW, trunkClear = TRUNK_CLEAR) {
  const { body, mats, frames } = ctx;
  const C = scale(add(frames.shoulder.L, frames.shoulder.R), 0.5);
  const A = body.arm;
  const X = [1, 0, 0];
  const right = (v) => (v ? [v[0] * (bp.side === 'L' ? -1 : 1), v[1], v[2]] : null);
  const gripR = add(C, scale(right(bp.grip), A));
  const out = { L: null, R: null };
  const poleR = norm([0.55, -0.25, -0.65]);
  let req = null;
  if (bp.family === 'fists') {
    req = { at: gripR, fingers: right(bp.fingers), palm: right(bp.palm), pole: poleR, w: 1 };
  } else {
    req = gripRequest(mats, body, 'R', body.wb, { grip: gripR, blade: right(bp.blade), edge: right(bp.edge), pole: poleR, w: 1 });
  }
  if (!req) return out;
  const strike = bp.side === 'L' ? mirrorRequest(req, C, X) : req;
  out[bp.side] = { ...strike, w: armW[bp.side] };
  const other = bp.side === 'L' ? 'R' : 'L';
  if (bp.family === 'two' && TWO_HAND_GRIP[cls] != null && req.frame) {
    const slide = { shoulder: frames.shoulder.L, reach: body.arms.L, range: TWO_HAND_HAFT[cls] };
    let haf = hafHand(req, req.grip, req.frame, TWO_HAND_GRIP[cls], A, slide);
    const pelvis = mats.get(body.bones.pelvis ?? body.hipBone)?.t, neck = mats.get(body.bones.neck)?.t;
    const push = haf && pelvis && neck && bp.side === 'R' ? trunkPush(haf.at, pelvis, neck, frames.fwd, trunkClear * A) : 0;
    if (push > 0) {
      const d = scale(frames.fwd, push);
      req = { ...req, at: add(req.at, d), grip: add(req.grip, d) };
      out.R = { ...req, w: armW.R };
      haf = hafHand(req, req.grip, req.frame, TWO_HAND_GRIP[cls], A, slide);
    }
    if (haf) out.L = { ...haf, w: armW.L, pole: norm(add(scale(frames.right, -0.55), add(scale(frames.up, -0.75), scale(frames.fwd, 0.45)))) };
  } else if (bp.family === 'one' && cls === 'one' && bp.off) {
    const F = { right: frames.right, fwd: frames.fwd, up: frames.up };
    const limb = body.bones[other];
    const a = len(sub(mats.get(limb.fore).t, mats.get(limb.upper).t)), b = len(sub(mats.get(limb.hand).t, mats.get(limb.fore).t));
    const arm = armByAngles(other, frames.shoulder[other], F, a, b, { flex: bp.off[0], abduct: bp.off[1], elbow: bp.off[2], twist: 6 });
    const inward = scale(F.right, other === 'R' ? -1 : 1);
    out[other] = { at: arm.wrist, fingers: norm(arm.fore), palm: norm(inward), pole: arm.pole, w: armW[other] };
  }
  return out;
}
