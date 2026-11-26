// Compiles and links the four lane shaders and the water shader in a real browser.
// Usage: start npx vite --port 5199, then run node tools/perfSunShaderProbe.mjs.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:5199';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${BASE}/play/?skin=enhanced`, { waitUntil: 'networkidle' });
const r = await page.evaluate(async () => {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200; document.body.append(cv);
  const gl = cv.getContext('webgl2');
  const el = await import('/src/render/enhancedLighting.js');
  const ws = await import('/src/render/waterSurface.js');
  const sp = await import('/src/render/shadowPass.js');
  const out = [];
  const compile = (name, src, kind) => {
    const sh = gl.createShader(kind);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
    out.push([name, !!ok, ok ? '' : (gl.getShaderInfoLog(sh) || '').slice(0, 300)]);
  };
  for (const n of ['EL_MESH_FS', 'EL_TERRAIN_FS', 'EL_BB_FS', 'EL_CHAR_FS']) {
    if (typeof el[n] === 'string') compile(n, el[n], gl.FRAGMENT_SHADER);
    else out.push([n, false, 'not exported as a string']);
  }
  for (const withLane of [false, true]) {
    const cloud = (await import('/src/render/cloudShadow.js')).CLOUD_SHADOW_GLSL ?? '';
    const src = ws.waterSurfaceFs ? ws.waterSurfaceFs(cloud, withLane ? sp.SHADOW_GLSL : '') : null;
    if (typeof src === 'string') compile(`WATER_FS(lane=${withLane})`, src, gl.FRAGMENT_SHADER);
    else out.push([`WATER_FS(lane=${withLane})`, null, 'no factory export - checked by the renderer build instead']);
  }
  // A fog uniform the optimizer drops reads back null and the shader then mixes toward black fog.
  const rend = await import('/src/render/renderer.js');
  const cv2 = document.createElement('canvas'); cv2.width = 64; cv2.height = 64; document.body.append(cv2);
  const r = new rend.Renderer(cv2);
  r.setLightingLane(el.EL_LANE);
  const set = r._laneSet;
  for (const k of ['mesh', 'terrain', 'char', 'bb']) {
    const prog = set?.[k];
    const linked = !!prog && r.gl.getProgramParameter(prog, r.gl.LINK_STATUS) === true;
    const loc = linked ? r.gl.getUniformLocation(prog, 'uFogColor') : null;
    out.push([`lane ${k}: links and keeps uFogColor`, linked && !!loc, linked ? (loc ? '' : 'the uniform was optimised out - the fog would go black') : 'did not link']);
  }
  return out;
});
let bad = 0;
for (const [n, ok, log] of r) {
  if (ok === null) { console.log(`skip ${n} - ${log}`); continue; }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${log ? ` - ${log}` : ''}`);
  if (!ok) bad++;
}
if (errs.length) { console.log('page errors:', errs.slice(0, 3)); bad++; }
await browser.close();
process.exit(bad ? 1 : 0);
