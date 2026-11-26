// Times the per-frame HUD cost of the travel view and the frame interval of its route line in a real browser.
// Usage: node tools/travelViewPerf.mjs   (prints the table and exits 1 on a blown budget)

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { planRoute, routeLegs, routeDrawPoints } from '../src/travel/travelRoute.js';
import { eyeFor, TV_TILT_DEFAULT, TV_HEIGHT_DEFAULT } from '../src/player/travelCamera.js';
import { projectToScreen } from '../src/player/tapRay.js';
import { perspective, lookAt, mirrorProjectionX } from '../src/world/mat4.js';
import { StreamingWorldState, mapPixelToWorldCoords } from '../src/world/streamingWorld.js';

function routeFrames({ from, goal, spot = null, turn = 0, frames = 120, w = 1366, h = 768 }) {
  const bytes = (n) => new Uint8Array(readFileSync(new URL(`../vendor/roads-hazelnut/${n}`, import.meta.url)));
  const plan = planRoute(from, goal, { roads: bytes('roadData.bytes'), tracks: bytes('trackData.bytes') });
  const mid = (p) => { const o = mapPixelToWorldCoords(p.x, p.y); return [o.x + 16384, o.z + 16384]; };
  const me = mid(from), end = spot ?? mid(goal);
  const natives = routeDrawPoints({ x: me[0], z: me[1] }, routeLegs(plan.pixels, plan.kinds), { x: end[0], z: end[1] }, mid);
  const state = new StreamingWorldState(5);
  state.mapOrigin = { ...from }; state.current = { ...from };
  const proj = mirrorProjectionX(perspective((65 * Math.PI) / 180, w / h, 0.2, 6000));
  const out = [];
  for (let t = 0; t < frames; t++) {
    const [ax, az] = natives[0], [bx, bz] = natives[1];
    const f = Math.min(0.9, (t * 3 * 40) / Math.hypot(bx - ax, bz - az));
    const [fx, fz] = state.localFromWorld(ax + (bx - ax) * f, az + (bz - az) * f);
    const pts = [[fx, 0, fz]];
    const leg = (a, b) => { for (let k = 1; k <= 4; k++) { const [x, z] = state.localFromWorld(a[0] + (b[0] - a[0]) * (k / 4), a[1] + (b[1] - a[1]) * (k / 4)); pts.push([x, 1, z]); } };
    leg([ax + (bx - ax) * f, az + (bz - az) * f], natives[1]);
    for (let i = 2; i < natives.length; i++) leg(natives[i - 1], natives[i]);
    const [nx, nz] = state.localFromWorld(bx, bz);
    const { eye, fwd } = eyeFor(pts[0], Math.atan2(nx - fx, nz - fz) + turn, TV_TILT_DEFAULT, TV_HEIGHT_DEFAULT);
    const view = lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 1, 0]);
    out.push(pts.map((p) => { const q = projectToScreen(p, w, h, proj, view, null, true); return { x: q.x, y: q.y, front: q.front }; }));
  }
  return out;
}

const server = await createServer({ server: { port: 5233, strictPort: true }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch();
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  await page.goto('http://localhost:5233/play/');
  const r = await page.evaluate(async () => {
    const hud = await import('/src/ui/travelViewHud.js');
    hud.showTravelViewHud({});
    const W = innerWidth, H = innerHeight;
    const route = Array.from({ length: 120 }, (_, i) => ({ x: 683 + i * 3, y: 384 - i * 2, front: true }));
    const frameOf = (n, t, moving) => {
      const marks = [];
      const all = n + 20;
      for (let i = 0; i < all; i++) {
        const a = (i / all) * Math.PI * 2 + (moving ? t * 0.01 : 0);
        const place = i < 20;
        const far = !place && i % 4 === 0;
        const rr = far ? 2000 : 250;
        marks.push(place
          ? { key: `p${i}`, x: W / 2 + Math.cos(a) * rr, y: H / 2 + Math.sin(a) * rr * 0.6, front: true, label: `Place ${i}`, kind: 'place', pick: true }
          : { key: `t${i}`, x: W / 2 + Math.cos(a) * rr, y: H / 2 + Math.sin(a) * rr * 0.6, front: i % 8 !== 0, label: `Rider ${i}`, kind: i % 5 ? 'traveller' : 'party journey', edge: far });
      }
      return {
        feet: { x: 683 + (moving ? Math.sin(t * 0.05) * 2 : 0), y: 384, front: true }, heading: moving ? t % 360 : 30, yaw: moving ? t * 0.01 : 0.5,
        where: 'Near Daggerfall, Daggerfall', trip: 'To Ripwych, by the road', fade: 1, marks,
        route: moving ? route.map((p) => ({ x: p.x + Math.sin(t * 0.02) * 3, y: p.y, front: true })) : route,
      };
    };
    const run = (n, moving, frames = 400) => {
      const pre = Array.from({ length: frames }, (_, t) => frameOf(n, t, moving));
      for (let t = 0; t < 30; t++) { hud.updateTravelViewHud(pre[t]); document.body.getBoundingClientRect(); }
      const t0 = performance.now();
      for (let t = 0; t < frames; t++) { hud.updateTravelViewHud(pre[t]); void document.body.offsetHeight; }
      return (performance.now() - t0) / frames;
    };
    // These first runs warm the JIT and the label images.
    run(64, true, 200); run(256, true, 100);
    const out = { m64: run(64, true) };
    out.canvas = hud.travelViewHudState().marks.length;
    out.hits = hud.travelViewHudState().hits.length;
    out.p20 = run(0, true);
    out.nodes = document.querySelectorAll('.tview-mark').length;
    Object.assign(out, { m256: run(256, true), s64: run(64, false), s0: run(0, false) });
    hud.hideTravelViewHud();
    return out;
  });
  console.log(`readout, ms a frame (update + the style and layout it owes):`);
  console.log(`  20 places + 64 travellers moving   ${r.m64.toFixed(3)}`);
  console.log(`  20 places + 256 travellers moving  ${r.m256.toFixed(3)}`);
  console.log(`  20 places + 64 travellers at rest  ${r.s64.toFixed(3)}`);
  console.log(`  20 places alone, at rest           ${r.s0.toFixed(3)}`);
  console.log(`  20 places alone, moving            ${r.p20.toFixed(3)}`);
  check(r.m64 <= 0.6, `20 places + 64 moving travellers within 0.60 ms (${r.m64.toFixed(3)})`);
  check(r.m256 <= 1.5, `20 places + 256 moving travellers within 1.50 ms (${r.m256.toFixed(3)})`);
  check(r.s64 <= 0.15, `20 places + 64 travellers at rest within 0.15 ms (${r.s64.toFixed(3)})`);
  check(r.canvas === 84 && r.nodes === 0 && r.hits === 20, `every mark on the canvas (${r.canvas} handed, ${r.nodes} DOM nodes), the 20 places taking clicks (${r.hits} boxes)`);
  const from = { x: 195, y: 172 }, o = mapPixelToWorldCoords(from.x, from.y);
  const lines = {
    'a click in view, 300 m': routeFrames({ from, goal: from, spot: [o.x + 16384, o.z + 16384 + 300 * 40] }),
    'a pick across the map, 139 legs': routeFrames({ from, goal: { x: 595, y: 5 } }),
    'the same, the camera turned': routeFrames({ from, goal: { x: 595, y: 5 }, turn: Math.PI }),
  };
  const framed = await page.evaluate(async (sets) => {
    const hud = await import('/src/ui/travelViewHud.js');
    hud.showTravelViewHud({});
    const base = { heading: 30, yaw: 0.5, where: 'Near Daggerfall, Daggerfall', trip: 'To Sentinel, by the road', fade: 1, marks: [] };
    const run = (fr, n = 90) => new Promise((done) => {
      const at = [];
      let t = 0;
      const step = (now) => {
        at.push(now);
        const f = fr[t % fr.length];
        hud.updateTravelViewHud({ ...base, feet: { ...f[0] }, route: f });
        if (++t < n) requestAnimationFrame(step);
        else { const iv = at.slice(11).map((s, i) => s - at[10 + i]).sort((a, b) => a - b); done(iv[iv.length >> 1]); }
      };
      requestAnimationFrame(step);
    });
    const out = {};
    for (const [k, fr] of Object.entries(sets)) out[k] = await run(fr);
    hud.hideTravelViewHud();
    return out;
  }, lines);
  console.log(`a journey's route line, ms a frame (median requestAnimationFrame interval: paint and raster included):`);
  for (const [k, ms] of Object.entries(framed)) {
    console.log(`  ${k.padEnd(34)} ${ms.toFixed(1)}`);
    check(ms <= 20, `${k}: within 20 ms a frame (${ms.toFixed(1)})`);
  }
  check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`);
} finally {
  await browser.close();
  await server.close();
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nOK');
process.exit(failures.length ? 1 : 0);
