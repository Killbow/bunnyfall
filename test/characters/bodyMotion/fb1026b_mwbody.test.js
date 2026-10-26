// FIELD BUGS 2026-10-26b (feature-feedback via Mac, "Morrowind models + weapon animations need a little tweaking";
// bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md) - THE BODY MOTION'S TWO FIXES, on the vendored retail biped with the
// pair's Weapon Bone Left made as the build makes it.
//
// THRUST-CHAMBER: "Two-handed sword (claymore) forward pierce attack animation causes character's hands to clip through
// his back" - the two-hander's thrust wound up with its grip drawn back beside the hip, so the left hand, closed on the
// hilt toward the pommel, stood 0.31 to 0.38 of an arm behind the shoulders and the left arm crossed behind the back.
// It is chambered before the right hip now, the point raised; both hands stay in front of the shoulders' plane.
//
// ONE-RUN: "Running and sprinting with one-handed weapon looks off, because hand is in twisted position pointing weapon
// to the side unnaturally" - the one-hander's run trailed its blade behind, down and out to the right, the forearm
// turned 64 to 74 degrees off its elbow's hinge to hold it there. It runs in the stand's own format now (Mac's "Running
// with it using the same format"): the arm low and out, the blade forward and a little down, the forearm untwisted, and
// the blade's way between a stand and a run no longer swung round the back (the old row's `via`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, injectSkeletonNodes, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { MW_WEAPON_TYPE } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { offWeaponBoneAddon } from '../../../src/combat/twoHands/mirrorRig.js';
import { handFrame } from '../../../src/combat/climbRig.js';
import { bodyOf, RAD } from '../../../src/characters/bodyMotion/bodyKit.js';
import { bodyFrames } from '../../../src/characters/bodyMotion/bodySolve.js';
import { createBodyMotion, sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { CARRY } from '../../../src/characters/bodyMotion/carry.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const sm = (s, pose, root) => skeletonSpaceMatrices(s, pose, root);
const file = parseNif(retailSkeleton());
const sk = buildSkeleton(file);
injectSkeletonNodes(sk, offWeaponBoneAddon(sk, GRAPH_ROOT, sm, file));
const body = bodyOf(sk, GRAPH_ROOT, sm);
const A = body.arm;
const W = MW_WEAPON_TYPE;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l]; };
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) / RAD;
const pt = (m, n) => m.get(sk.byName.get(n)).t;
const bladeOf = (m) => { const a = m.get(sk.byName.get('weapon bone')).a; return norm([a[1], a[4], a[7]]); };

/** The layer stepped and posed at 60 Hz; `each(mats, t)` sees every frame. */
function play(scene, seconds, each, motion = createBodyMotion()) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const t = i / 60;
    motion.step(1 / 60, sceneInput({ ...(typeof scene === 'function' ? scene(t) : scene), kind: 'male' }));
    const p = new Map();
    motion.apply(sk, p, GRAPH_ROOT, sm);
    each?.(sm(sk, p, GRAPH_ROOT), t);
  }
  return motion;
}
/** The machine's sections over one second, the blade landing at 0.4 (bodymotion_audit.test.js's `machine`). */
const sections = () => {
  const out = [];
  for (let t = 1 / 60; t < 1 - 1e-9; t += 1 / 60) out.push(t < 0.28 ? { section: 'windup', progress: t / 0.28 } : t < 0.4 ? { section: 'release', progress: (t - 0.28) / 0.12 } : { section: 'follow', progress: (t - 0.4) / 0.6 });
  return out;
};
/** The forearm's turn off its elbow's hinge (degrees), from the free arm's at rest (bodymotion_steady.test.js's). */
function forearmTurn(m, side, zero = 0) {
  const s = side.toLowerCase();
  const up = norm(sub(pt(m, `bip01 ${s} forearm`), pt(m, `bip01 ${s} upperarm`))), fo = norm(sub(pt(m, `bip01 ${s} hand`), pt(m, `bip01 ${s} forearm`)));
  const h = norm(cross(up, fo)), ref = side === 'R' ? [-h[0], -h[1], -h[2]] : h;
  const palm = handFrame(m, body.bones[side], side).palm, k = dot(palm, fo);
  const pp = norm([palm[0] - fo[0] * k, palm[1] - fo[1] * k, palm[2] - fo[2] * k]);
  let a = Math.atan2(dot(cross(ref, pp), fo), dot(ref, pp)) / RAD - zero;
  if (a > 180) a -= 360; else if (a < -180) a += 360;
  return a;
}

test('THRUST-CHAMBER A TWO-HANDER\'S THRUST KEEPS BOTH HANDS BEFORE THE BACK: standing and walking, through the wind-up, the release and the follow, each wrist stands in front of the shoulders\' plane in the chest\'s own frame (the left stood 0.38 of an arm behind it, the left arm crossed behind the back); the wind-up still draws the blade back on the trunk - the chest coiled 15 degrees and more to the right - and the thrust still drives it out ahead (mutants: THRUST-CHAMBER-drawn-behind, THRUST-CHAMBER-chest-square)', () => {
  for (const [name, gait] of [['standing', {}], ['walking', { forward: 1, speed: 4.43 }]]) {
    const scene = { weapon: W.LongBladeTwoHand, hands: 'single', ...gait };
    const motion = play(scene, 1.5);
    let worst = Infinity, coil = 0, reach = -Infinity;
    for (const f of sections()) {
      play({ ...scene, blow: { type: 'thrust', reversed: false, hand: 'R', ...f, strength: 1 } }, 1 / 60, (m) => {
        const F = bodyFrames(body, m);
        const C = [(F.shoulder.L[0] + F.shoulder.R[0]) / 2, (F.shoulder.L[1] + F.shoulder.R[1]) / 2, (F.shoulder.L[2] + F.shoulder.R[2]) / 2];
        for (const s of ['l', 'r']) worst = Math.min(worst, dot(sub(pt(m, `bip01 ${s} hand`), C), F.fwd) / A);
        if (f.section === 'windup') coil = Math.max(coil, Math.atan2(F.fwd[0], F.fwd[1]) / RAD);
        if (f.section === 'release') reach = Math.max(reach, dot(sub(pt(m, 'weapon bone'), C), [0, 1, 0]) / A);
      }, motion);
    }
    assert.ok(worst > 0, `${name}: a wrist stood ${worst.toFixed(2)} of an arm behind the shoulders' plane`);
    assert.ok(coil > 15, `${name}: the wind-up coils the chest to the right (${coil.toFixed(1)} degrees)`);
    assert.ok(reach > 0.75, `${name}: the release drives the grip out ahead (${reach.toFixed(2)} arm lengths)`);
  }
});

test('ONE-RUN THE ONE-HANDER\'S RUN IN THE STAND\'S FORMAT: at a run and a jog the arm stays low and out from the side, the blade points forward (along the facing by 0.8 and more) and a little down, out to the side by under 0.3 (it pointed 0.54 out and back), and the forearm stands within 30 degrees of its elbow\'s hinge (it stood 64 to 74 off it) (mutants: ONE-RUN-the-old-row, ONE-RUN-out-to-the-side, ONE-RUN-twisted)', () => {
  let zero = 0;
  play({}, 1, (m) => { zero = forearmTurn(m, 'R'); });
  for (const speed of [8.1, 5.5]) {
    const blades = [], turns = [], out = [], low = [];
    play({ weapon: W.LongBladeOneHand, forward: 1, speed, running: true }, 2.4, (m, t) => {
      if (t < 1.4) return;
      blades.push(bladeOf(m));
      turns.push(Math.abs(forearmTurn(m, 'R', zero)));
      out.push((pt(m, 'bip01 r hand')[0] - pt(m, 'bip01 r thigh')[0]) / A);
      low.push(pt(m, 'bip01 r upperarm')[2] - pt(m, 'bip01 r hand')[2]);
    });
    const at = `${speed} m/s`;
    assert.ok(blades.every((b) => b[1] > 0.8), `${at}: the blade forward (${Math.min(...blades.map((b) => b[1])).toFixed(2)} at its least)`);
    assert.ok(blades.every((b) => b[2] < 0 && b[2] > -0.6), `${at}: and a little down`);
    assert.ok(blades.every((b) => Math.abs(b[0]) < 0.3), `${at}: out to the side by ${Math.max(...blades.map((b) => Math.abs(b[0]))).toFixed(2)}`);
    assert.ok(Math.max(...turns) < 30, `${at}: the forearm turned ${Math.max(...turns).toFixed(1)} degrees off its hinge`);
    assert.ok(Math.min(...out) > 0.2, `${at}: the arm out from the side`);
    assert.ok(Math.min(...low) > 0.75 * A, `${at}: the arm low`);
  }
});

test('ONE-RUN THE WAY BETWEEN A STAND AND A RUN: the blade turns under 3 degrees a frame from a stand into a run and back - the old row\'s way round, back and up (`via`), swung it 11 a frame - and the class carries no such way (mutants: ONE-RUN-via-back)', () => {
  assert.equal(CARRY.one.via, undefined);
  for (const [from, to] of [[{}, { forward: 1, speed: 8.1, running: true }], [{ forward: 1, speed: 8.1, running: true }, {}], [{ forward: 1, speed: 4.43 }, { forward: 1, speed: 8.1, running: true }]]) {
    let prev = null, turn = 0;
    play((t) => ({ weapon: W.LongBladeOneHand, ...(t < 1.5 ? from : to) }), 2.6, (m, t) => {
      const b = bladeOf(m);
      if (t >= 1.4 && prev) turn = Math.max(turn, ang(prev, b));
      prev = b;
    });
    assert.ok(turn < 3, `the blade turned ${turn.toFixed(1)} degrees in a frame`);
  }
});
