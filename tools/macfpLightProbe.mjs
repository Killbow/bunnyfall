// Checks in a real WebGL context that the flat light tint multiplies a sprite and that the first-person arm is lit.
// Run against a dev server: npx vite --port 5199 & node tools/macfpLightProbe.mjs.
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/play/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.px-menu button', { timeout: 15000 });

const out = await page.evaluate(async () => {
  const { Renderer, FLAT_LIGHT_FLOOR } = await import('/src/render/renderer.js');
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  document.body.append(canvas);
  const r = new Renderer(canvas);
  const white = { width: 1, height: 1, colors: new Uint8Array([255, 255, 255, 255]) };
  const tex = r.uploadTexture('probe', 'white', white);

  const read = () => {
    const gl = r.gl;
    const px = new Uint8Array(4);
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [...px];
  };
  const drawWith = (tint) => {
    const gl = r.gl;
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    r.drawScreenQuad(tex, { x: 0, y: 0, w: 64, h: 64 }, undefined, tint);
    return read();
  };

  const res = { floor: FLAT_LIGHT_FLOOR };
  res.clockless = r.flatLightAt([0, 0, 0]);
  r.setLighting([0.4, 0.4, 0.4], 1, [0.6, 0.6, 0.6]);
  r.setPointLights(new Float32Array(0), [1, 1, 1], null);
  res.day = r.flatLightAt([0, 0, 0]);
  r.setLighting([0.02, 0.02, 0.02], 0, [0, 0, 0]);
  res.dark = r.flatLightAt([0, 0, 0]);
  r.setPointLights(new Float32Array([0, 0, 2, 8]), [1, 1, 1], new Float32Array([1, 0.6, 0.2]));
  res.nearTorch = r.flatLightAt([0, 0, 0]);
  res.farFromTorch = r.flatLightAt([0, 0, 40]);
  res.pixelWhite = drawWith([1, 1, 1, 1]);
  res.pixelQuarter = drawWith([0.25, 0.25, 0.25, 1]);
  res.pixelTorch = drawWith(r.flatLightAt([0, 0, 0]));

  const V = [];
  const vert = (x, y) => V.push(x, y, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0);
  vert(-1, -1); vert(1, -1); vert(1, 1);
  vert(-1, -1); vert(1, 1); vert(-1, 1);
  const mesh = r.createCharacterMesh(new Float32Array(V), { uv: true });
  mesh.ranges = [{ first: 0, count: 6, tex: null, hidden: false }];
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1];
  const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.2, 0];
  // beginFrame is the only producer of _lightDir and no world pass runs here, so the sun direction is set by hand.
  r._lightDir = new Float32Array([0, 1, 0]);
  const armPixel = (light) => {
    const tex = r.renderCharacterSprite(mesh, I, proj, view, 32, 32, { lensLocal: true, viewmodelLight: light });
    const gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 64, 64);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    r.drawScreenQuad(tex, { x: 0, y: 0, w: 64, h: 64 }, { u0: 0, v0: 32 / 1024, u1: 32 / 1024, v1: 0 });
    return read();
  };
  r.setLighting([0.02, 0.02, 0.02], 0, [0, 0, 0]);
  r.setPointLights(new Float32Array(0), [1, 1, 1], null);
  res.armNoLight = armPixel(null);
  res.armDark = armPixel(r.flatLightAt([0, 0, 0]));
  r.setLighting([0.9, 0.9, 0.9], 1, [1, 1, 1]);
  res.armBright = armPixel(r.flatLightAt([0, 0, 0]));
  res.lightAfter = [...r._ambient];
  return res;
});

const near = (a, b, eps = 0.001) => Math.abs(a - b) <= eps;
check('MAC-I: a clockless scene is white, as its flats are', out.clockless.every((v) => v === 1), JSON.stringify(out.clockless));
check('MAC-I: daylight is the ambient plus the sun’s half', out.day.every((v) => near(v, 0.7)), JSON.stringify(out.day));
check('MAC-I: a black room lands on the floor, not on nothing', out.dark.every((v) => near(v, out.floor)), `${JSON.stringify(out.dark)} floor ${out.floor}`);
check('MAC-I: a torch two units off is warm and bright', out.nearTorch[0] > out.nearTorch[2] && out.nearTorch[0] > 0.5, JSON.stringify(out.nearTorch));
check('MAC-I: the same torch forty units off reaches nothing', out.farFromTorch.every((v) => near(v, out.floor)), JSON.stringify(out.farFromTorch));
check('MAC-I: white tint leaves the sprite alone', out.pixelWhite[0] === 255 && out.pixelWhite[1] === 255, JSON.stringify(out.pixelWhite));
check('MAC-I: a quarter tint really is a quarter on screen', Math.abs(out.pixelQuarter[0] - 64) <= 2, JSON.stringify(out.pixelQuarter));
check('MAC-I: the torch’s own light reaches the sprite as colour', out.pixelTorch[0] > out.pixelTorch[2], JSON.stringify(out.pixelTorch));
check('BLACK-ARMS: an RGB tint leaves the sprite OPAQUE - the alpha the triple lacks is 1, not NaN', out.pixelTorch[3] === 255, JSON.stringify(out.pixelTorch));
check('MAC-P: the old path is nearly black in a dark room', out.armNoLight[0] < 16, `${out.armNoLight[0]}/255`);
check('MAC-P: the room\u2019s light makes the arm readable without making it bright', out.armDark[0] > 40 && out.armDark[0] < 160, `${out.armDark[0]}/255 on the floor`);
check('MAC-P: and noon is a lit arm', out.armBright[0] > out.armDark[0] * 2, `${out.armBright[0]} vs ${out.armDark[0]}`);
check('MAC-P: the frame\u2019s own light survives the borrow', Math.abs(out.lightAfter[0] - 0.9) < 1e-6, JSON.stringify(out.lightAfter));
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} ok`);
process.exit(bad.length ? 1 : 0);
