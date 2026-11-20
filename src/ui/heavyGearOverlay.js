// BUNNYFALL: THE ROYAL BALLISTA'S AIMING ARC AND THE GRAPPLING HOOK'S ROPE AND REST - drawn on a 2D canvas laid over the
// game's, by the weapon rig (combat/weapon/weaponRig.js) every frame it runs, in every host.
//
// World points are carried to the screen through the renderer's own camera (the projection and view the frame's world
// pass was drawn with) and the rect that pass was drawn into (renderer.worldViewportRect - FIELD-GUN19's record), so
// the arc lies on the world. A frame that asks nothing hides the layer; a layer not asked for a few frames (a window
// up, the rig not running) hides itself.

import { BURST_RADIUS } from '../characters/heavyGearIds.js';

const ID = 'bf-heavy-gear';
const STALE_MS = 150;
const NEAR_W = 0.05;
let layer = null, ctx = null, lastAsked = 0, watch = 0, shown = false;

function ensureLayer(game) {
  if (layer?.isConnected) return layer;
  const doc = game?.ownerDocument ?? globalThis.document;
  if (!doc?.createElement || !game?.parentNode) return null;
  layer = doc.getElementById(ID) ?? doc.createElement('canvas');
  layer.id = ID;
  Object.assign(layer.style, { position: 'fixed', pointerEvents: 'none', left: '0px', top: '0px', display: 'none' });
  game.insertAdjacentElement('afterend', layer);   // just over the game's picture, under every window that comes after it
  ctx = layer.getContext('2d');
  return layer;
}

function hide() {
  if (layer && shown) { layer.style.display = 'none'; shown = false; }
}

function watchStale() {
  if (watch) return;
  const tick = () => {
    watch = 0;
    if (!shown) return;
    if (performance.now() - lastAsked > STALE_MS) { hide(); return; }
    watch = requestAnimationFrame(tick);
  };
  watch = requestAnimationFrame(tick);
}

/** clip = P * V * [p, 1], the matrices column-major as GL keeps them. */
function toClip(P, V, p) {
  const v = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) v[r] = V[r] * p[0] + V[4 + r] * p[1] + V[8 + r] * p[2] + V[12 + r];
  const c = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) c[r] = P[r] * v[0] + P[4 + r] * v[1] + P[8 + r] * v[2] + P[12 + r] * v[3];
  return c;
}

function makeProjector(renderer, w, h) {
  const P = renderer?._proj, V = renderer?._view;
  if (!P || !V || P.length < 16 || V.length < 16) return null;
  const vp = renderer.worldViewportRect ?? { x: 0, y: 0, w: 1, h: 1 };
  const screen = (c) => [
    (vp.x + (c[0] / c[3] * 0.5 + 0.5) * vp.w) * w,
    (1 - (vp.y + (c[1] / c[3] * 0.5 + 0.5) * vp.h)) * h,
  ];
  return {
    clip: (p) => toClip(P, V, p),
    screen,
    /** A world polyline as screen runs, cut where it passes behind the eye. */
    runs(points) {
      const out = [];
      let run = [];
      let prev = null;
      for (const p of points) {
        const c = toClip(P, V, p);
        if (prev) {
          const a = prev, b = c;
          if (a[3] > NEAR_W && b[3] > NEAR_W) { if (!run.length) run.push(screen(a)); run.push(screen(b)); }
          else if (a[3] > NEAR_W || b[3] > NEAR_W) {
            const k = (NEAR_W - a[3]) / (b[3] - a[3]);
            const m = a.map((x, i) => x + (b[i] - x) * k);
            if (a[3] > NEAR_W) { if (!run.length) run.push(screen(a)); run.push(screen(m)); out.push(run); run = []; }
            else run = [screen(m), screen(b)];
          } else if (run.length) { out.push(run); run = []; }
        }
        prev = c;
      }
      if (run.length > 1) out.push(run);
      return out;
    },
  };
}

function strokeRuns(g, runs, width, colour, dash = null) {
  g.lineWidth = width; g.strokeStyle = colour; g.setLineDash(dash ?? []);
  for (const r of runs) {
    g.beginPath(); g.moveTo(r[0][0], r[0][1]);
    for (let i = 1; i < r.length; i++) g.lineTo(r[i][0], r[i][1]);
    g.stroke();
  }
  g.setLineDash([]);
}

/** A ring on the ground (normal `n`) of `radius` about `at`, as world points. */
function groundRing(at, n, radius, steps = 28) {
  const up = Math.abs(n?.[1] ?? 1) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const nn = n ?? [0, 1, 0];
  let a = [up[1] * nn[2] - up[2] * nn[1], up[2] * nn[0] - up[0] * nn[2], up[0] * nn[1] - up[1] * nn[0]];
  const la = Math.hypot(...a) || 1; a = a.map((x) => x / la);
  const b = [nn[1] * a[2] - nn[2] * a[1], nn[2] * a[0] - nn[0] * a[2], nn[0] * a[1] - nn[1] * a[0]];
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2, c = Math.cos(t) * radius, s = Math.sin(t) * radius;
    pts.push([at[0] + a[0] * c + b[0] * s + nn[0] * 0.05, at[1] + a[1] * c + b[1] * s + nn[1] * 0.05, at[2] + a[2] * c + b[2] * s + nn[2] * 0.05]);
  }
  return pts;
}

/**
 * One frame. `arc` - the ballista's predicted path ({ points, land, normal }, combat/ballista/ballistaFlight.js
 * predictArc) or null; `grapple` - grappleView() or null; `flip` the Handedness setting's left hand.
 */
export function drawHeavyGearOverlay({ canvas, renderer, arc = null, grapple = null, flip = false }) {
  const rope = grapple?.hook;
  const ring = grapple?.held && grapple.cooldownLeft > 0;
  const heldIdle = grapple?.held && !ring && !rope;
  if (!arc && !rope && !ring && !heldIdle) { hide(); return; }
  const el = ensureLayer(canvas);
  if (!el || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) { hide(); return; }
  const dpr = globalThis.devicePixelRatio || 1;
  const W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
  if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
  Object.assign(el.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  if (!shown) { el.style.display = 'block'; shown = true; }
  lastAsked = performance.now();
  watchStale();
  const g = ctx;
  g.clearRect(0, 0, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const proj = makeProjector(renderer, W, H);
  const px = dpr;

  if (arc && proj) {
    const runs = proj.runs(arc.points);
    strokeRuns(g, runs, 5 * px, 'rgba(20, 12, 4, 0.55)');
    strokeRuns(g, runs, 2.5 * px, 'rgba(240, 196, 92, 0.95)', [10 * px, 7 * px]);
    if (arc.land) {
      const ringPts = groundRing(arc.land, arc.normal, BURST_RADIUS);
      const rr = proj.runs(ringPts);
      strokeRuns(g, rr, 5 * px, 'rgba(20, 12, 4, 0.5)');
      strokeRuns(g, rr, 2 * px, 'rgba(255, 120, 60, 0.9)');
      const c = proj.clip(arc.land);
      if (c[3] > NEAR_W) {
        const [x, y] = proj.screen(c);
        g.fillStyle = 'rgba(255, 140, 70, 0.95)';
        g.beginPath(); g.arc(x, y, 4 * px, 0, Math.PI * 2); g.fill();
      }
    }
  }

  if (rope && proj) {
    const hand = [W * (flip ? 0.26 : 0.74), H * 0.66];
    const c = proj.clip(rope);
    let end = null;
    if (c[3] > NEAR_W) end = proj.screen(c);
    else end = [hand[0] + (flip ? -1 : 1) * W * 0.05, -H * 0.2];   // behind: the rope runs off the screen's top
    const sag = Math.min(60 * px, Math.hypot(end[0] - hand[0], end[1] - hand[1]) * (grapple.pulling ? 0.03 : 0.12));
    const mid = [(hand[0] + end[0]) / 2, (hand[1] + end[1]) / 2 + sag];
    for (const [wdt, col] of [[5 * px, 'rgba(40, 24, 10, 0.8)'], [2.5 * px, 'rgba(196, 150, 84, 1)']]) {
      g.lineWidth = wdt; g.strokeStyle = col;
      g.beginPath(); g.moveTo(hand[0], hand[1]); g.quadraticCurveTo(mid[0], mid[1], end[0], end[1]); g.stroke();
    }
    if (c[3] > NEAR_W) {   // the hook's head: three prongs
      g.strokeStyle = 'rgba(70, 60, 54, 1)'; g.lineWidth = 3 * px;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.9;
        g.beginPath(); g.moveTo(end[0], end[1]); g.lineTo(end[0] + Math.cos(a) * 9 * px, end[1] + Math.sin(a) * 9 * px); g.stroke();
      }
    }
  }

  if (grapple?.held) {   // the rest, as a ring about the cross
    const cx = W / 2, cy = H / 2, r = 16 * px;
    g.lineWidth = 3 * px;
    g.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    if (ring) {
      const k = grapple.cooldownTotal > 0 ? grapple.cooldownLeft / grapple.cooldownTotal : 0;
      g.strokeStyle = 'rgba(214, 170, 96, 0.95)';
      g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
      g.font = `${Math.round(11 * px)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0, 0, 0, 0.6)'; g.fillText(Math.ceil(grapple.cooldownLeft).toString(), cx + px, cy + r + 11 * px);
      g.fillStyle = 'rgba(240, 220, 180, 1)'; g.fillText(Math.ceil(grapple.cooldownLeft).toString(), cx, cy + r + 10 * px);
    } else {
      g.strokeStyle = 'rgba(214, 170, 96, 0.5)';
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    }
  }
}

/** Hide the layer now (a scene torn down). */
export function hideHeavyGearOverlay() { hide(); }
