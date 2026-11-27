// Sprite-lane two hands: the second hand is the same art mirrored about the screen middle. Each hand sees a view of
// the one weapon machine: the strike while it is that hand's, the idle otherwise.
import { poseStrikeRect } from '../abilities/strikeMotion.js';

import { createWeaponWidget } from '../weaponWidget.js';
import { fpsWeaponQuad, getWeaponAnims, STATE_INDEX, WEAPON_TYPES, NATIVE_W, NATIVE_H } from '../fpsWeapon.js';
import {
  HANDS_MODE, twoHanded, otherHand, mirrorRect, MIRROR_UV, handOnLeft, MELEE_PAINTED_ARM, strikePicture,
  guardStep, guardOffset, easeTo, runPhaseFollow, runPhaseOfBob, pumpOf, runWeightStep, RUN_PUMP,
} from './handsLaw.js';

const BOUNCE_TAU = 0.3;
const BELOW = 0.15;
const MELEE_ANIMS = getWeaponAnims(WEAPON_TYPES.Melee);

export function createTwoHands({ audio = null, envHit = null, missEffect = null, settings } = {}) {
  // Never flipped by Handedness: a pair's hand is drawn as a right hand and mirrored whole.
  const offWidget = createWeaponWidget({ audio, envHit, missEffect, settings, handedness: () => false, hidden: true });
  const st = {
    mode: HANDS_MODE.Single, machine: null, strikeHand: null, leftHanded: false, time: 0,
    guard: { R: 0, L: 0 }, bounce: 0,
    run: { w: 0, phase: 0, wanted: false },
    fromBelow: null,
  };

  const paintedAt = (i) => (st.mode === HANDS_MODE.Fists ? MELEE_PAINTED_ARM[MELEE_ANIMS[i]?.Record ?? 0] ?? 'R' : 'R');
  const painted = (state) => paintedAt(STATE_INDEX[state] ?? 0);
  const sideOf = (hand) => (handOnLeft(hand, st.leftHanded) ? 'L' : 'R');
  // A record is mirrored exactly when the arm it paints is not on the hand's side, so the arm drawn is that hand's.
  const mirrorOf = (hand, paintedSide) => paintedSide !== sideOf(hand);
  const mine = (hand) => !!st.machine && twoHanded(st.mode) && st.strikeHand === hand && st.machine.state !== 'Idle';
  const picture = (hand) => strikePicture(hand, mine(hand) ? st.machine.state : 'Idle', { leftHanded: st.leftHanded, painted });

  function view(hand) {
    return {
      get state() { return mine(hand) ? picture(hand).state : 'Idle'; },
      get frame() { return mine(hand) ? st.machine.frame : 0; },
      get isBow() { return !!st.machine?.isBow; },
      get isUnarmed() { return !!st.machine?.isUnarmed; },
      get now() { return st.machine?.now ?? 0; },
    };
  }
  const views = Object.freeze({ R: view('R'), L: view('L') });

  function step(dt, { mode = HANDS_MODE.Single, machine = null, strike = null, leftHanded = false, run = null, standing = false } = {}) {
    const d = Math.max(0, Math.min(0.1, dt || 0));
    st.mode = mode; st.machine = machine; st.leftHanded = !!leftHanded;
    // A punch thrown off the running arm winds up from below the view, where the arm went.
    if (strike?.hand && strike.hand !== st.strikeHand) st.fromBelow = st.run.w >= RUN_PUMP.SWAP ? strike.hand : null;
    else if (!strike) st.fromBelow = null;
    st.strikeHand = strike?.hand ?? null;
    st.time += d;
    const two = twoHanded(mode);
    for (const h of /** @type {const} */ (['R', 'L'])) st.guard[h] = guardStep(st.guard[h], two && st.strikeHand === otherHand(h), d);
    st.bounce = easeTo(st.bounce, mode === HANDS_MODE.Fists && !st.strikeHand && standing ? 1 : 0, BOUNCE_TAU, d);
    const r = run ?? {};
    st.run.wanted = !!r.wanted;
    if (st.run.wanted || st.run.w > 0) st.run.phase = runPhaseFollow(st.run.phase, Number.isFinite(r.bob) ? runPhaseOfBob(r.bob) : null, r.speed ?? 0, d, !(st.run.w > 0));
    st.run.w = runWeightStep(st.run.w, st.run.wanted, !!r.punching, d);
    if (!st.run.wanted && st.run.w < 1e-3) st.run.w = 0;
  }

  // A striking picture is never moved, or a flurry blow that starts still lowered clips its top inside the view.
  function nudge(hand, canvas, h = null, striking = false) {
    if (striking) return [0, 0];
    const height = st.mode === HANDS_MODE.Dual && Number.isFinite(h) ? /** @type {number} */ (h) * NATIVE_H / canvas.height : null;
    const [gx, gy] = guardOffset(st.guard[hand], handOnLeft(hand, st.leftHanded) ? 'left' : 'right', { time: st.time, bounce: st.bounce, hand, height });
    return [gx * canvas.width / NATIVE_W, gy * canvas.height / NATIVE_H];
  }
  const nudgeBefore = (hand, canvas, mirror, h = null, striking = false) => { const [dx, dy] = nudge(hand, canvas, h, striking); return [mirror ? -dx : dx, dy]; };
  const moved = (r, [dx, dy]) => ({ ...r, x: r.x + dx, y: r.y + dy });

  const drawOrder = () => (st.strikeHand === 'L' ? ['R', 'L'] : ['L', 'R']);

  function drawClassicHand(renderer, canvas, hand, art, { tint = null, offsetHeight = 0, glow = null, pose = null } = {}) {
    const v = views[hand];
    const q = fpsWeaponQuad(canvas, art, v.state, v.frame, { flipHorizontal: false, offsetHeight });
    if (!q) return null;
    const mirror = mirrorOf(hand, painted(v.state));
    const base = moved(mirror ? mirrorRect(q.rect, canvas.width) : q.rect, nudge(hand, canvas, q.rect.h, v.state !== 'Idle'));
    const rect = poseStrikeRect(base, pose, canvas.height, mirror);
    const uv = mirror ? MIRROR_UV : q.uv;
    renderer.drawScreenQuad(q.tex, rect, uv, tint ?? undefined);
    if (glow) renderer.drawScreenQuadGlow?.(q.tex, rect, uv, glow, { art: [q.rec.width, q.rec.height], view: [canvas.width, canvas.height] });
    return rect;
  }

  function drawPair(renderer, canvas, { widget = null, widgetOn = false, artFor, glowFor = () => null, shown = true, tint = null, offsetHeight = 0, running = st.run.w > 0, pose = null, only = null } = {}) {
    if (!renderer || !canvas || !twoHanded(st.mode)) return false;
    for (const hand of drawOrder()) {
      if ((running && hand !== st.strikeHand) || (only && hand !== only)) continue;
      const clone = hand === 'R' ? widget : offWidget;
      // The clone plays its strike a frame behind the machine.
      const shows = clone?.state ?? 0;
      const mirror = mirrorOf(hand, paintedAt(shows));
      const strikePose = hand === st.strikeHand ? pose : null;
      if (widgetOn && clone?.draw(renderer, canvas, tint, { pose: strikePose, transform: (r) => moved(r, nudgeBefore(hand, canvas, mirror, r.h, shows !== 0)), mirror })) continue;
      if (shown) drawClassicHand(renderer, canvas, hand, artFor(hand), { tint, offsetHeight, glow: glowFor(hand), pose: strikePose });
    }
    return true;
  }

  function restRect(hand, canvas, { widget = null, widgetOn = false, art = null, shown = true, offsetHeight = 0 } = {}) {
    if (!twoHanded(st.mode) || st.mode !== HANDS_MODE.Fists) return null;
    const mirror = mirrorOf(hand, painted('Idle'));
    const clone = hand === 'R' ? widget : offWidget;
    let rect = null;
    if (widgetOn && clone?.drawing()) rect = clone.pairRect(mirror);
    else if (shown && art) rect = fpsWeaponQuad(canvas, art, 'Idle', 0, { flipHorizontal: false, offsetHeight })?.rect ?? null;
    if (!rect) return null;
    return moved(mirror ? mirrorRect(rect, canvas.width) : rect, nudge(hand, canvas));
  }

  function drawRun(renderer, canvas, fistArt, { widget = null, widgetOn = false, shown = true, tint = null, offsetHeight = 0 } = {}) {
    const w = st.run.w;
    if (!(w > 0) || !renderer || !canvas || !fistArt) return false;
    const hands = /** @type {const} */ (['R', 'L']).filter((hand) => hand !== st.strikeHand);
    const under = (r) => canvas.height + BELOW * r.h;
    if (w < RUN_PUMP.SWAP) {
      const k = w / RUN_PUMP.SWAP;
      const q = fpsWeaponQuad(canvas, fistArt, 'Idle', 0, { flipHorizontal: false, offsetHeight });
      if (!q) return false;
      for (const hand of hands) {
        const rest = restRect(hand, canvas, { widget, widgetOn, art: fistArt, shown, offsetHeight });
        if (!rest) continue;
        const mirror = mirrorOf(hand, painted('Idle'));
        renderer.drawScreenQuad(q.tex, { ...rest, y: rest.y + (under(rest) - rest.y) * k }, mirror ? MIRROR_UV : q.uv, tint ?? undefined);
      }
      return true;
    }
    const k = (w - RUN_PUMP.SWAP) / (1 - RUN_PUMP.SWAP);
    const idle = fpsWeaponQuad(canvas, fistArt, 'Idle', 0, { flipHorizontal: false, offsetHeight });
    if (!idle) return false;
    const cx = idle.rect.x + idle.rect.w / 2;
    const drawn = [];
    for (const hand of hands) {
      const p = pumpOf(st.run.phase, hand);
      const q = fpsWeaponQuad(canvas, fistArt, RUN_PUMP.ARM_STATE, p.frame, { flipHorizontal: false, offsetHeight });
      if (!q) continue;
      const right = { x: cx - q.rect.w / 2 - p.dx * canvas.width, y: q.rect.y + p.dy * q.rect.h, w: q.rect.w, h: q.rect.h };
      const placed = handOnLeft(hand, st.leftHanded) ? mirrorRect(right, canvas.width) : right;
      const rect = { ...placed, y: placed.y + (under(placed) - placed.y) * (1 - k) };
      drawn.push({ tex: q.tex, uv: mirrorOf(hand, painted(RUN_PUMP.ARM_STATE)) ? MIRROR_UV : q.uv, rect, s: p.s });
    }
    drawn.sort((a, b) => a.s - b.s);
    for (const h of drawn) renderer.drawScreenQuad(h.tex, h.rect, h.uv, tint ?? undefined);
    return true;
  }

  return {
    step, drawPair, drawRun, restRect, view: (hand) => views[hand], offWidget,
    drawOrder,
    fromBelow: (hand) => st.fromBelow === hand,
    get running() { return st.run.w > 0; },
    get state() { return { mode: st.mode, strikeHand: st.strikeHand, guard: { ...st.guard }, bounce: st.bounce, run: { ...st.run } }; },
  };
}
