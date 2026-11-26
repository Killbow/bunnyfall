// Checks on a real WebGL2 context that cloud shadow at the player's feet removes the sun shafts.
// Usage: `node tools/vc6ShaftProbe.mjs`

import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

const server = await createServer({ server: { port: 5266, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
await page.goto('http://localhost:5266/play/');

const W = 640, H = 400;
const out = await page.evaluate(async ({ W, H }) => {
  const { Renderer, WORLD_FRAME } = await import('/src/render/renderer.js');
  const { EL_LANE } = await import('/src/render/enhancedLighting.js');
  const { perspective, lookAt, identity } = await import('/src/world/mat4.js');

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  document.body.appendChild(canvas);
  const r = new Renderer(canvas);
  const gl = r.gl;

  const stone = (() => {
    const w = 32, h = 32, colors = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { const v = 150 + ((i * 7919) % 61); colors[i * 4] = v; colors[i * 4 + 1] = v - 10; colors[i * 4 + 2] = v - 25; colors[i * 4 + 3] = 255; }
    return { width: w, height: h, colors };
  })();
  r.uploadTexture(1, 1, stone);

  const P = [], N = [], UV = [], IDX = [];
  const quad = (a, b, c, d, n) => {
    const base = P.length / 3;
    for (const v of [a, b, c, d]) { P.push(...v); N.push(...n); }
    UV.push(0, 0, 4, 0, 4, 4, 0, 4);
    IDX.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad([-40, 0, -40], [40, 0, -40], [40, 0, 40], [-40, 0, 40], [0, 1, 0]);
  quad([-1, 0, -12], [1, 0, -12], [1, 9, -12], [-1, 9, -12], [0, 0, 1]);
  const mesh = r.createMesh({ positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(UV), indices: new Uint32Array(IDX), subMeshes: [{ textureArchive: 1, textureRecord: 1, startIndex: 0, primitiveCount: IDX.length / 3 }] });

  const proj = perspective(Math.PI / 3, W / H, 0.1, 400);
  const eye = [0, 1.7, 6];
  const view = lookAt(eye, [0, 6, -20], [0, 1, 0]);
  const I = identity();
  // The sun sits in front of the camera and up, since the pass needs the sun's screen position on screen.
  const lightDir = new Float32Array([0, 0.62, -0.78]);

  const deckOf = (t) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const v = Math.round(t * 255);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([v, v, v, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { map: tex, rect: [eye[0] - 500, eye[2] - 500, 1 / 1000, 1] };
  };

  const shot = (deck) => {
    r.setLightingLane(EL_LANE);
    r.setAir(true);
    r.setHaze(false);
    // The frozen clock keeps eye adaptation out of the with and without comparison.
    if (r.air) r.air._now = () => 1000;
    r.setClearColor([0.53, 0.7, 0.92, 1]);
    r.setLighting(new Float32Array([0.35, 0.35, 0.4]), 0.9, new Float32Array([1, 0.95, 0.85]));
    r.setFog('linear', 0, 200, 400, new Float32Array([0.6, 0.6, 0.7]));
    r.setPointLights(new Float32Array([]), null);
    let stats = null, shaft = null, ground = 0;
    for (let f = 0; f < 4; f++) {
      r.beginFrame(proj, view, lightDir, WORLD_FRAME);
      // This must follow beginFrame, which clears the deck every frame.
      r.setCloudShadow(deck);
      r.drawMesh(mesh, I, null);
      r.resolveFrame();
      stats = { gl: gl.getError(), shafts: r.air ? r.air.stats.shafts : null };
      if (r.air?.targets) {
        const T = r.air.readTarget('shaft');
        const b = r.air.stats.shafts || r.air.stats.haze ? T.px : new Uint8Array(T.px.length);
        let sum = 0, max = 0;
        for (let i = 0; i < b.length; i += 4) { const l = b[i] + b[i + 1] + b[i + 2]; sum += l; if (l > max) max = l; }
        shaft = { w: T.w, h: T.h, sum, max };
      }
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let g = 0, n = 0;
      for (let y = 0; y < H * 0.10; y++) for (let x = W * 0.3; x < W * 0.7; x++) { const i = (y * W + (x | 0)) * 4; g += (px[i] + px[i + 1] + px[i + 2]) / 3; n++; }
      ground = g / n;
    }
    return { stats, shaft, ground };
  };

  const clear = shot(null);
  const open = shot(deckOf(1));
  const half = shot(deckOf(0.5));
  const solid = shot(deckOf(0));
  return { clear, open, half, solid, renderer: gl.getParameter(gl.RENDERER) };
}, { W, H });

console.log('renderer:', out.renderer);
for (const [k, v] of Object.entries(out)) {
  if (k === 'renderer') continue;
  console.log(`  ${k.padEnd(6)} shafts ${v.stats.shafts} sum ${v.shaft?.sum} max ${v.shaft?.max} ground ${v.ground.toFixed(1)} gl ${v.stats.gl}`);
}
check('no page errors and no GL error', pageErrors.length === 0 && Object.values(out).every((v) => typeof v !== 'object' || v.stats?.gl === 0 || v.stats === undefined), pageErrors.join(' | '));
check('the pass runs at all: a clear sky with the sun in front throws shafts', out.clear.stats.shafts === true && out.clear.shaft.sum > 0, `sum ${out.clear.shaft.sum}`);
check('a deck that is all light is the same as no deck at all', Math.abs(out.open.shaft.sum - out.clear.shaft.sum) <= Math.max(1, out.clear.shaft.sum * 0.02), `${out.open.shaft.sum} vs ${out.clear.shaft.sum}`);
check('a SOLID deck takes the rays away - the sun is behind the bank', out.solid.shaft.sum === 0, `sum ${out.solid.shaft.sum}, max ${out.solid.shaft.max}`);
{
  const want = out.clear.shaft.sum * 0.25, got = out.half.shaft.sum;
  check('half the sun is a QUARTER of the rays - the gate is squared, so a bank takes them rather than dimming them politely', Math.abs(got - want) <= Math.max(2, want * 0.08), `${got} against ${want.toFixed(0)} (a linear gate would be ${(out.clear.shaft.sum * 0.5).toFixed(0)})`);
}
// Only the order is judged, since eye adaptation pulls a darkened frame back up.
check('the ground moves with the rays - one field, two consumers, so a shaft can never outlive the sun that would cast it', out.clear.ground > out.half.ground && out.half.ground > out.solid.ground, `clear ${out.clear.ground.toFixed(1)} > half ${out.half.ground.toFixed(1)} > solid ${out.solid.ground.toFixed(1)} (the eye's adaptation compresses the drop; the order is the law)`);

await browser.close();
await server.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
