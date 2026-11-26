// @ts-check
import {
  TV_RISE_S, TV_FALL_S, TV_ZOOM_STEP, ceilingFor, initialCamera, stepCamera, zoomTarget, orbitBy, turnCamera, blendView,
  anglesOf, rightOf, leanedUp, turnHeading, forwardOf, tvOwnGrow, keysHeading,
} from '../player/travelCamera.js';
import { travelRateOf } from '../world/timeScale.js';
import { noteFirstUse } from '../ui/tutorials.js';

export const TV_CLICK_SLOP = 6;
export const TV_WORLD_ACTIONS = Object.freeze(['ActivateCenterObject', 'SwingWeapon']);
export const TV_WHEEL_PX = 100, TV_WHEEL_MAX = 3;
// Converts wheel deltas to pixels as `wheelPixels` in ui/heldMap.js does (16 px a line, a screen a page), so small
// trackpad deltas do not each count as a full notch.
export function wheelNotches(e, pageHeight = 800) {
  const d = Number(e?.deltaY) || 0;
  const px = e?.deltaMode === 1 ? d * 16 : e?.deltaMode === 2 ? d * (pageHeight || 800) : d;
  return Math.max(-TV_WHEEL_MAX, Math.min(TV_WHEEL_MAX, -px / TV_WHEEL_PX));
}
export const TV_KEY_ORBIT_RATE = 1.6;
export const TV_KEY_TILT_RATE = 0.9;
export const TV_LOOK_ACTIONS = Object.freeze(['TurnLeft', 'TurnRight', 'LookUp', 'LookDown']);
export const TV_HEARTBEAT_MS = 600;
export const TV_MOVE_ACTIONS = Object.freeze(['MoveForwards', 'MoveBackwards', 'MoveLeft', 'MoveRight']);

export const TRAVEL_VIEW_BUTTON = 'Overworld (O)';
export const TRAVEL_VIEW_TEXT = Object.freeze({
  enhancedOnly: 'Turn on the enhanced interface to use the overworld.',
  indoors: 'You can only survey the land from the open air.',
  underwater: 'You cannot survey the land from under the water.',
  enemies: 'You cannot survey the land with enemies nearby.',
  noJourneys: 'Turn on Travel Options to travel from the overworld.',
  water: 'You cannot walk out onto the water.',
  far: 'That lies beyond what you can see from here.',
  noWay: 'There is no way there by land.',
  mountains: 'The mountains cannot be crossed on foot.',
  placesOnly: 'Travel Options travels only to places. Click a town.',
  spot: 'The marked spot',
  theSpot: 'the marked spot',
  partyHalted: 'The party has stopped.',
  attackAsk: (name) => [`Attack ${name || 'them'}?`, 'You will travel straight to them.'],
  byRoad: (name) => `To ${name}, by the road`,
  acrossCountry: (name) => `To ${name}, across country`,
  toSpot: 'To the marked spot',
  bySea: (name) => `To ${name}, by sea`,
  toSpotBySea: 'To the marked spot, by sea',
  needBoat: 'There is no way there by land. You need a boat to cross the water.',
  passenger: 'You are aboard another\'s boat. Its helmsman sets the course.',
  rider: 'You ride in another\'s wagon. Its driver sets the course.',
  climbing: 'You cannot set out from a wall. Climb down first.',
  noLaunch: 'There is no water here for your boat to float in.',
  noWayAtSea: 'Your boat can make no way toward its mark.',
  noShore: 'There is no safe landing here. Your boat stays in the water.',
  leftMoored: 'Your boat is left moored where it landed.',
  noBoat: 'Your boat is not with you to cross the water.',
  aground: 'Your boat has run aground.',
  raidersAlongside: 'Pirates come alongside!',
  enemiesSlow: 'Enemies are near. You slow your pace.',
  travelling: (rate, held = null) => (held != null && held < rate ? `Traveling at ×${held} of ×${rate}` : `Traveling at ×${rate}`),
  inPlace: (place, region) => (region ? `${place}, ${region}` : place),
  nearPlace: (place, region) => (region ? `Near ${place}, ${region}` : `Near ${place}`),
  wilderness: (region) => (region ? `The wilds of ${region}` : 'The wilds'),
});

export function shipPassageRows(name, fareRow, days = 0, unwell = false, own = false) {
  const rows = [`There is no way to ${name || 'there'} by land. Sail there by ship?`, fareRow];
  if (days > 0) rows.push(`The voyage takes ${days} ${days === 1 ? 'day' : 'days'}${own ? ' of your time' : ''}.`);
  if (unwell) rows.push('You are diseased or poisoned.');
  return rows;
}

export function travelTripLine({ name = '', share = 0, spot = false, sea = false } = {}) {
  if (spot) return sea ? TRAVEL_VIEW_TEXT.toSpotBySea : TRAVEL_VIEW_TEXT.toSpot;
  if (sea) return TRAVEL_VIEW_TEXT.bySea(name);
  return share >= 0.5 ? TRAVEL_VIEW_TEXT.byRoad(name) : TRAVEL_VIEW_TEXT.acrossCountry(name);
}

export function travelWalkRate({ viewUp = false, journey = false, moving = false, onFoot = false, paused = false, travels = true, onRoad = false } = {}) {
  if (!viewUp || journey || !moving || !onFoot || paused || !travels) return 0;
  return travelRateOf(onRoad);
}

export function travelViewLine({ place = null, near = null, region = '' } = {}) {
  if (place) return TRAVEL_VIEW_TEXT.inPlace(place, region);
  if (near) return TRAVEL_VIEW_TEXT.nearPlace(near, region);
  return TRAVEL_VIEW_TEXT.wilderness(region);
}

/**
 * @param {object} deps
 * @param {any} deps.canvas
 * @param {() => number[]} deps.feet
 * @param {() => {eye:number[], fwd:number[]}} deps.headView
 * @param {() => number} deps.yaw
 * @param {(y:number) => void} deps.setYaw
 * @param {(x:number, z:number) => number} [deps.heightAt]
 * @param {() => number|null} [deps.cloudBase]
 * @param {() => {ok:boolean, why?:string}} deps.allowed
 * @param {() => boolean} deps.windowUp
 * @param {() => boolean} [deps.overlayUp]
 * @param {(why: string) => void} [deps.onLower]
 * @param {() => boolean} [deps.danger]
 * @param {(e:any) => string[]} deps.actionsOf
 * @param {() => boolean} [deps.movementHeld]
 * @param {() => {forward: number, strafe: number}} [deps.movementAxes]
 * @param {() => boolean} [deps.autopilot]
 * @param {(on:boolean) => boolean} [deps.holdBody]
 * @param {(free:boolean) => void} [deps.freeCursor]
 * @param {() => string} [deps.where]
 * @param {(p:number[]) => {x:number,y:number,front:boolean}} [deps.project]
 * @param {(x:number, y:number, e:any) => void} [deps.onPick]
 * @param {(key:string, e?:any) => void} [deps.onMark]
 * @param {(x:number, y:number, key:string|null, e?:any) => void} [deps.onContext]
 * @param {(x:number, y:number) => void} [deps.onPing]
 * @param {() => Array<{key:string, at:number[], label?:string, sub?:string, kind?:string, pick?:boolean, edge?:boolean, badge?:any, color?:string, kin?:string|null, lv?:number|null, dist?:number, hub?:boolean, tip?:(() => any)|null, wpKind?:string, followed?:boolean}>} [deps.marks]
 * @param {() => number[][]} [deps.route]
 * @param {() => string} [deps.trip]
 * @param {() => {move?:string, out?:string}} [deps.hintKeys]
 * @param {{show:Function, hide:Function, update:Function, pickAt?:(x:number, y:number) => string|null}} [deps.hud]
 * @param {() => void} [deps.openMap]
 * @param {(id:string) => void} [deps.onWaypointGo]
 * @param {() => Record<string,string>|null} [deps.followDist]
 * @param {(t:string) => void} [deps.say]
 * @param {boolean} [deps.touch]
 * @param {any} [deps.win]
 * @param {() => boolean} [deps.alive]
 * @param {(fn:Function, ms:number) => any} [deps.schedule]
 * @param {(h:any) => void} [deps.cancel]
 */
export const ROUTE_DOT_PX = 12;
export const ROUTE_DOT_MIN_PX = 4;
export const ROUTE_DOT_SIZES = Object.freeze([1, 0.85, 0.72, 0.6, 0.5, 0.42]);
export function routeDotClass(r) {
  let best = 0;
  for (let i = 1; i < ROUTE_DOT_SIZES.length; i++) if (Math.abs(ROUTE_DOT_SIZES[i] - r) < Math.abs(ROUTE_DOT_SIZES[best] - r)) best = i;
  return best;
}
// Every spacing is this value doubled, so a coarser set of dots is a subset of a finer one and thinning never moves
// a dot.
export const ROUTE_DOT_M = 0.25;
export const ROUTE_DOTS_MAX = 1500;
// The spacing chosen at the feet is reused while its screen spacing stays inside this share of `ROUTE_DOT_PX`, so a
// spacing on the edge does not flicker.
export const ROUTE_DOT_KEEP = Object.freeze([0.8, 2.2]);
const dotStep = (perM, px) => ROUTE_DOT_M * 2 ** Math.max(0, Math.ceil(Math.log2(px / (perM * ROUTE_DOT_M))));
/**
 * Each dot sits at a whole multiple of one ground spacing measured back from the journey end, so the dots stay in
 * place on the land while the camera moves.
 * @param {number[][]} points
 * @param {(p:number[]) => ({x:number, y:number, front:boolean}|null)} proj
 * @returns {{x:number, y:number, c:number}[]}
 */
export function routeGroundDots(points, proj, { px = ROUTE_DOT_PX, min = ROUTE_DOT_MIN_PX, max = ROUTE_DOTS_MAX, w = Infinity, h = Infinity, m = 16, keep = null } = {}) {
  const out = [];
  if (!points || points.length < 2 || typeof proj !== 'function') return out;
  const off = (q) => !q?.front || !Number.isFinite(q.x) || !Number.isFinite(q.y);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  let base = 0, feetPerM = 0;
  {
    const f = points[0];
    let n = 1;
    while (n < points.length - 1 && Math.hypot(points[n][0] - f[0], points[n][2] - f[2]) < 1e-6) n++;
    const L = Math.hypot(points[n][0] - f[0], points[n][2] - f[2]);
    const t = L > 0 ? Math.min(1, 1 / L) : 0;
    const q0 = proj(f), q1 = t > 0 ? proj(lerp(f, points[n], t)) : null;
    const perM = !off(q0) && !off(q1) ? Math.hypot(q1.x - q0.x, q1.y - q0.y) / (L * t) : 0;
    feetPerM = perM;
    if (perM > 0) {
      const kept = keep?.k > 0 ? keep.k * perM : 0;
      base = kept >= px * ROUTE_DOT_KEEP[0] && kept <= px * ROUTE_DOT_KEEP[1] ? keep.k : dotStep(perM, px);
      if (keep) keep.k = base;
    } else if (keep?.k > 0) base = keep.k;
  }
  const piece = (a, b, dA, dB, qa, qb, depth) => {
    if (out.length >= max || !(dA > dB)) return;
    if (off(qa) && off(qb)) return;
    if (!off(qa) && !off(qb)) {
      if ((qa.x < -m && qb.x < -m) || (qa.x > w + m && qb.x > w + m) || (qa.y < -m && qb.y < -m) || (qa.y > h + m && qb.y > h + m)) return;
    }
    const len = off(qa) || off(qb) ? Infinity : Math.hypot(qb.x - qa.x, qb.y - qa.y);
    if (len > 80 && depth < 16) {
      const mid = lerp(a, b, 0.5), dm = (dA + dB) / 2, qm = proj(mid);
      piece(a, mid, dA, dm, qa, qm, depth + 1);
      piece(mid, b, dm, dB, qm, qb, depth + 1);
      return;
    }
    if (!Number.isFinite(len)) return;
    const perM = len / (dA - dB);
    if (!(perM > 0)) return;
    const k = Math.max(base || dotStep(perM, px), dotStep(perM, min));
    const qs = [];
    for (let t = Math.floor(dA / k) * k; t > dB && qs.length + out.length < max; t -= k) {
      if (t > dA || t <= 0) continue;
      qs.push(proj(lerp(b, a, (t - dB) / (dA - dB))));
    }
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (off(q) || q.x < -m || q.x > w + m || q.y < -m || q.y > h + m) continue;
      const nb = [qs[i - 1], qs[i + 1]].filter((o) => o && !off(o));
      const here = nb.length ? nb.reduce((sum, o) => sum + Math.hypot(q.x - o.x, q.y - o.y), 0) / nb.length / k : perM;
      out.push({ x: q.x, y: q.y, c: routeDotClass(feetPerM > 0 ? here / feetPerM : 1) });
    }
  };
  let d = 0;
  let qb = proj(points[points.length - 1]);
  for (let i = points.length - 1; i > 0 && out.length < max; i--) {
    const b = points[i], a = points[i - 1];
    const seg = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const qa = proj(a);
    if (seg > 0) piece(a, b, d + seg, d, qa, qb, 0);
    d += seg; qb = qa;
  }
  return out;
}

export function createTravelView(deps) {
  const win = deps.win ?? globalThis;
  let state = 'off';
  let t = 0;
  let camera = null;
  let shown = null;
  let askedBody = false;
  let listening = false;
  let press = null;
  const pointers = new Map();
  let pinch = null;
  const lookHeld = new Set();
  const keysTaken = new Set();
  const buttonsTaken = new Set();
  let lastHeading = null;
  let hintKeys = null;
  let beat = null;
  let missed = false;
  const schedule = deps.schedule ?? ((fn, ms) => (typeof setTimeout === 'function' ? setTimeout(fn, ms) : null));
  const cancel = deps.cancel ?? ((h) => { if (h != null && typeof clearTimeout === 'function') clearTimeout(h); });
  const gone = () => { if (state === 'off' || !deps.alive || deps.alive()) return false; finish(true); return true; };

  const isCanvasEvent = (e) => {
    const c = deps.canvas;
    const tg = e?.target;
    return !!c && (tg === c || (typeof c.contains === 'function' && tg && c.contains(tg)));
  };
  const swallow = (e) => { e.preventDefault?.(); e.stopImmediatePropagation?.(); e.stopPropagation?.(); };
  const typing = (e) => { const tg = e?.target; return !!tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || !!tg.isContentEditable); };

  function onPointerDown(e) {
    if (state === 'off' || gone() || !isCanvasEvent(e)) return;
    swallow(e);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; press = null; return; }
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: e.button ?? 0 };
  }
  function onPointerMove(e) {
    if (state === 'off') return;
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 0 && d > 0) zoom(Math.log(d / pinch.d) / Math.log(TV_ZOOM_STEP));
      pinch.d = d;
      return;
    }
    if (!press || press.id !== e.pointerId || !camera) return;
    // A mouse move with no button down ends the drag: its release went elsewhere when focus was lost.
    if (e.pointerType === 'mouse' && e.buttons === 0) { press = null; pointers.delete(e.pointerId); return; }
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) > TV_CLICK_SLOP) press.moved = true;
    if (press.moved) camera = orbitBy(camera, e.clientX - prev.x, e.clientY - prev.y);
  }
  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (state === 'off') { press = null; return; }
    swallow(e);
    const p = press;
    press = null;
    if (p && p.id === e.pointerId && !p.moved && p.button === 0 && state === 'up' && e.type !== 'pointercancel') {
      const key = deps.hud?.pickAt?.(e.clientX, e.clientY) ?? null;
      if (key) deps.onMark?.(key, e); else deps.onPick?.(e.clientX, e.clientY, e);
    }
    if (p && p.id === e.pointerId && !p.moved && p.button === 2 && state === 'up' && e.type !== 'pointercancel') {
      const key = deps.hud?.pickAt?.(e.clientX, e.clientY) ?? null;
      deps.onContext?.(e.clientX, e.clientY, key, e);
    }
    if (p && p.id === e.pointerId && !p.moved && p.button === 1 && state === 'up' && e.type !== 'pointercancel') {
      deps.onPing?.(e.clientX, e.clientY);
    }
  }
  function onMouse(e) {
    if (state === 'off' || gone() || !isCanvasEvent(e)) return;
    // Only buttons pressed while the view is up are swallowed on release; a button held before the view rose must
    // release to the host, or the swing sticks down.
    const b = e.button ?? 0;
    if (e.type === 'mouseup') { if (!buttonsTaken.delete(b)) return; } else buttonsTaken.add(b);
    swallow(e);
  }
  // Only the touch start is taken, so a finger that went down before the view rose still ends in the touch layer
  // and its stick releases.
  function onTouchStart(e) {
    if (state === 'off' || gone() || !isCanvasEvent(e)) return;
    swallow(e);
  }
  function onWheel(e) {
    if (state === 'off' || gone() || !isCanvasEvent(e)) return;
    swallow(e);
    zoom(wheelNotches(e, win?.innerHeight));
  }
  function onContext(e) { if (state !== 'off' && !gone() && isCanvasEvent(e)) swallow(e); }
  function onKey(e, down) {
    if (state === 'off' || gone()) return;
    const acts = deps.actionsOf?.(e) ?? [];
    const code = e.code ?? e.key ?? '';
    // A key released inside a text box still clears the view's held look keys, or the view keeps turning after the
    // chat opens.
    if (typing(e)) { if (!down) { keysTaken.delete(code); for (const a of acts) lookHeld.delete(a); } return; }
    // A release belongs to the view only when the press did; a look key held before the view rose must release to
    // the host.
    if (!down && !keysTaken.delete(code)) {
      for (const a of acts) lookHeld.delete(a);
      return;
    }
    // Auto-repeat of a key held before the view rose stays with the host, so the host also receives its release.
    if (down && e.repeat && !keysTaken.has(code)) return;
    // An open enhanced overlay such as the Tab dial owns the keys, so its Escape closes the dial and not the view.
    if (down && deps.overlayUp?.()) return;
    if (acts.includes('Escape')) { if (down) { keysTaken.add(code); exit('escape'); } swallow(e); return; }
    // Gamepad A and Y arrive as these key actions, so they are swallowed to stop an activation or a swing from
    // under the view.
    if (acts.some((a) => TV_WORLD_ACTIONS.includes(a))) { if (down) keysTaken.add(code); swallow(e); return; }
    const look = acts.filter((a) => TV_LOOK_ACTIONS.includes(a));
    if (!look.length) return;
    for (const a of look) { if (down) lookHeld.add(a); else lookHeld.delete(a); }
    if (down) keysTaken.add(code);
    swallow(e);
  }
  const onKeyDown = (e) => onKey(e, true);
  const onKeyUp = (e) => onKey(e, false);
  function onBlur() {
    press = null; pinch = null;
    pointers.clear(); lookHeld.clear(); keysTaken.clear();
  }

  function listen(on) {
    if (on === listening || typeof win?.addEventListener !== 'function') return;
    const m = on ? 'addEventListener' : 'removeEventListener';
    win[m]('pointerdown', onPointerDown, true);
    win[m]('pointermove', onPointerMove, true);
    win[m]('pointerup', onPointerUp, true);
    win[m]('pointercancel', onPointerUp, true);
    win[m]('mousedown', onMouse, true);
    win[m]('mouseup', onMouse, true);
    win[m]('wheel', onWheel, { capture: true, passive: false });
    win[m]('contextmenu', onContext, true);
    win[m]('touchstart', onTouchStart, { capture: true, passive: false });
    win[m]('keydown', onKeyDown, true);
    win[m]('keyup', onKeyUp, true);
    win[m]('blur', onBlur, true);
    listening = on;
  }

  function zoom(notches) {
    if (!camera || !notches) return;
    camera = { ...camera, heightTarget: zoomTarget(camera.heightTarget, notches, ceilingFor(deps.cloudBase?.() ?? null)) };
  }

  function enter() {
    if (state === 'up' || state === 'rising') return true;
    const ok = deps.allowed();
    if (!ok?.ok) { if (ok?.why) deps.say?.(ok.why); return false; }
    if (deps.danger?.()) { deps.say?.(TRAVEL_VIEW_TEXT.enemies); return false; }
    noteFirstUse('travel-view');
    const from = state;
    if (from === 'off') camera = initialCamera(deps.feet(), deps.yaw());
    state = 'rising';
    if (from === 'off') {
      hintKeys = deps.hintKeys?.() ?? null;
      deps.holdBody?.(true);
      askedBody = !!deps.holdBody;
      deps.freeCursor?.(true);
    }
    listen(true);
    deps.hud?.show({ onReturn: () => exit('button'), onMap: () => deps.openMap?.(), onWaypointGo: (id) => deps.onWaypointGo?.(id) });
    rearm();
    return true;
  }

  function rearm() {
    missed = false;
    cancel(beat);
    beat = schedule(stalled, TV_HEARTBEAT_MS);
  }
  function stalled() {
    beat = null;
    if (state === 'off') return;
    if (gone()) return;
    if (win?.document?.hidden) { rearm(); return; }
    // One missed beat is usually a long task such as a quicksave or a first shader compile; the view comes down
    // only after two missed beats.
    if (!missed) { missed = true; beat = schedule(stalled, TV_HEARTBEAT_MS); return; }
    finish();
  }

  function exit(why = 'escape', cut = false) {
    if (state === 'off') return false;
    if (!cut) deps.onLower?.(why);
    if (cut) { finish(); return true; }
    state = 'falling';
    return true;
  }

  // With `quiet` the host is gone and the cursor belongs to its successor, so the cursor is not handed back.
  function finish(quiet = false) {
    cancel(beat);
    beat = null;
    state = 'off';
    t = 0;
    shown = null;
    press = null; pinch = null; pointers.clear(); lookHeld.clear(); keysTaken.clear(); buttonsTaken.clear();
    listen(false);
    deps.hud?.hide();
    if (askedBody) deps.holdBody?.(false);
    askedBody = false;
    if (!quiet) deps.freeCursor?.(false);
  }

  function steer(dt) {
    if (state === 'off' || !camera) return;
    const yawDir = (lookHeld.has('TurnRight') ? 1 : 0) - (lookHeld.has('TurnLeft') ? 1 : 0);
    const tiltDir = (lookHeld.has('LookDown') ? 1 : 0) - (lookHeld.has('LookUp') ? 1 : 0);
    if (yawDir || tiltDir) camera = turnCamera(camera, yawDir * TV_KEY_ORBIT_RATE * dt, tiltDir * TV_KEY_TILT_RATE * dt);
    if (!deps.autopilot?.() && deps.movementHeld?.()) {
      const ax = deps.movementAxes?.();
      deps.setYaw(turnHeading(deps.yaw(), (ax && keysHeading(camera.yaw, ax.forward, ax.strafe)) ?? camera.yaw, dt));
    }
  }

  function frame(dt, headArg = null) {
    if (state === 'off') return null;
    rearm();
    const ok = deps.allowed();
    if (!ok?.ok || deps.windowUp()) { finish(); return null; }
    if ((state === 'up' || state === 'rising') && deps.danger?.()) exit('danger');
    const head = headArg ?? deps.headView();
    const ceiling = ceilingFor(deps.cloudBase?.() ?? null);
    const r = stepCamera(camera, { feet: deps.feet(), dt, ceiling, heightAt: deps.heightAt ?? null });
    camera = r.camera;
    if (state === 'rising') { t = Math.min(1, t + dt / TV_RISE_S); if (t >= 1) state = 'up'; }
    else if (state === 'falling') { t = Math.max(0, t - dt / TV_FALL_S); if (t <= 0) { finish(); return null; } }
    else t = 1;
    shown = blendView(head, { eye: r.eye, fwd: r.fwd }, t);
    const ang = anglesOf(shown.fwd);
    const tilt = Math.max(0, -ang.pitch);
    const f = deps.feet();
    return {
      eye: shown.eye, fwd: shown.fwd, yaw: ang.yaw, pitch: ang.pitch,
      right: rightOf(ang.yaw), up: leanedUp(ang.yaw, tilt * Math.min(1, t)),
      focus: [camera.focus[0], camera.focus[1], camera.focus[2]],
      blend: t, fullyUp: state === 'up', state,
      grow: tvOwnGrow(Math.hypot(shown.eye[0] - f[0], shown.eye[1] - f[1], shown.eye[2] - f[2])),
    };
  }

  const dotSpacing = { k: 0 };
  function drawHud() {
    if (state === 'off' || !deps.hud) return;
    const feet = deps.feet();
    const f = deps.project ? deps.project(feet) : null;
    const ahead = forwardOf(deps.yaw(), 0);
    const a = deps.project ? deps.project([feet[0] + ahead[0] * 4, feet[1], feet[2] + ahead[2] * 4]) : null;
    const h = f && a && f.front && a.front ? (Math.atan2(a.x - f.x, -(a.y - f.y)) * 180) / Math.PI : null;
    if (h != null) lastHeading = h;
    const proj = (p) => (deps.project && p ? deps.project(p) : null);
    const routeWorld = deps.route?.() ?? [];
    const marks = [];
    for (const m of deps.marks?.() ?? []) {
      const at = proj(m.at);
      marks.push({ key: m.key, x: at?.x ?? 0, y: at?.y ?? 0, front: !!at?.front, label: m.label, sub: m.sub, kind: m.kind, pick: !!m.pick, edge: !!m.edge, ...(m.color ? { color: m.color } : {}), badge: m.badge ?? null,
        ...(m.kin ? { kin: m.kin } : {}), ...(m.lv != null ? { lv: m.lv } : {}), ...(Number.isFinite(m.dist) ? { dist: m.dist } : {}), ...(m.hub ? { hub: true } : {}), ...(m.tip ? { tip: m.tip } : {}),
        ...(m.wpKind ? { wpKind: m.wpKind } : {}), ...(m.followed ? { followed: true } : {}) });
    }
    deps.hud.update({
      feet: f, heading: lastHeading, yaw: camera?.yaw ?? 0, where: deps.where?.() ?? '',
      touch: !!deps.touch, fade: t, marks, keys: hintKeys,
      route: routeWorld.map(proj), trip: deps.trip?.() ?? '', sky: deps.sky?.() ?? '',
      routeDots: routeGroundDots(routeWorld, proj, { w: deps.canvas?.clientWidth || Infinity, h: deps.canvas?.clientHeight || Infinity, keep: dotSpacing }),
      routeDotSizes: ROUTE_DOT_SIZES,
      followDist: deps.followDist?.() ?? null,
    });
  }

  return {
    enter, exit, steer, frame, drawHud,
    dispose() { if (state !== 'off') finish(); },
    get active() { return state !== 'off'; },
    get state() { return state; },
    get camera() { return camera; },
    get blend() { return t; },
    get eye() { return shown?.eye ?? null; },
    get fwd() { return shown?.fwd ?? null; },
    // Shifts every scene point the view holds when the floating origin re-anchors, so the re-anchor does not read
    // as a jump of the focus and camera.
    rebase(offset) {
      if (!offset) return;
      const sh = (p) => (p ? [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]] : p);
      if (camera) camera = { ...camera, focus: sh(camera.focus), feet: sh(camera.feet) };
      if (shown) shown = { ...shown, eye: sh(shown.eye) };
    },
  };
}
