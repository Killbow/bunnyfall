// Draws blood marks and splashes through the real renderer in a WebGL2 page and reads the pixels back.
// Run: npx vite --port 5199 & node tools/bloodProbe.mjs.

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
await page.route('**/__blood_probe__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
await page.goto(`${BASE}/__blood_probe__`, { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async () => {
  const { Renderer } = await import('/src/render/renderer.js');
  const { createHitEffects, BLOOD_ARCHIVE } = await import('/src/combat/hitEffects.js');
  const { DUNGEON_AMBIENT } = await import('/src/world/dungeonLights.js');

  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  document.body.append(canvas);
  const r = new Renderer(canvas);

  const W = 8, H = 8;
  const colors = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { colors[i * 4] = 209; colors[i * 4 + 1] = 16; colors[i * 4 + 2] = 16; colors[i * 4 + 3] = 255; }
  const red = { colors, width: W, height: H };

  const uploaded = [];
  const fx = createHitEffects({
    renderer: r,
    getTexture: async () => ({ recordCount: 8, getFrameCount: () => 1, getSize: () => ({ width: W, height: H }), getScale: () => ({ width: 0, height: 0 }) }),
    uploadRecordFrame: (archive, record, frame) => {
      uploaded.push(`${archive}_${record}#${frame}`);
      r.uploadTexture(archive, `${record}#${frame}`, red);
    },
  });

  const SUN = new Float32Array([0, 0.6, 0.8]);
  const TORCH = new Float32Array([0, 0, 2, 14]);
  const shot = (label, setup, lights = null) => {
    setup();
    r.setPointLights(lights ?? new Float32Array(0), [1, 1, 1], null);
    const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.2, 0];
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1];
    r.beginFrame(proj, view, SUN);
    const gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 128, 128);
    gl.clearColor(0, 0, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    r.drawBillboards(fx.batches(), [1, 0, 0], [0, 1, 0]);
    const px = new Uint8Array(4);
    gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { label, px: [...px] };
  };

  fx.showBloodSplash(0, [0, 0, 0]);
  await new Promise((res) => setTimeout(res, 50));

  const frames = [];
  frames.push(shot('clockless (no setLighting - full bright)', () => {}));
  frames.push(shot('EXTERIOR noon', () => r.setLighting([0.55, 0.55, 0.55], 1, [1, 0.96, 0.9])));
  const dungeon = () => r.setLighting([...(DUNGEON_AMBIENT ?? [0.12, 0.12, 0.12])], 0, [0, 0, 0]);
  frames.push(shot('DUNGEON ambient, no lights', dungeon));
  frames.push(shot('DUNGEON ambient + a torch at the splash', dungeon, TORCH));
  r.uploadTexture(199, '8#0', { colors: (() => { const c = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { c[i * 4] = 209; c[i * 4 + 1] = 16; c[i * 4 + 2] = 16; c[i * 4 + 3] = 255; } return c; })(), width: W, height: H });
  const foe = r.createBillboardBatch(199, 8, { w: 2, h: 2 }, [[0, 0, 0]]);
  foe.frame = 0;
  const foeShot = (label, setup, lights = null) => {
    setup();
    r.setPointLights(lights ?? new Float32Array(0), [1, 1, 1], null);
    const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.2, 0];
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1];
    r.beginFrame(proj, view, SUN);
    const gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 128, 128);
    gl.clearColor(0, 0, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    r.drawBillboards([foe], [1, 0, 0], [0, 1, 0]);
    const px = new Uint8Array(4);
    gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { label, px: [...px] };
  };
  frames.push(foeShot('a SPRITE (not the pool) in the same dungeon', dungeon));

  const wall = r.createMesh({
    positions: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    // Both windings, because the mesh pass culls and the probe builds its projection by hand.
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]),
    subMeshes: [{ startIndex: 0, primitiveCount: 4, textureArchive: 199, textureRecord: '8#0' }],
  });
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const meshShot = (label, setup, lights = null) => {
    setup();
    r.setPointLights(lights ?? new Float32Array(0), [1, 1, 1], null);
    const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.2, 0];
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1];
    r.beginFrame(proj, view, SUN);
    const gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 128, 128);
    gl.clearColor(0, 0, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    r.drawMesh(wall, IDENT);
    const px = new Uint8Array(4);
    gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { label, px: [...px] };
  };

  const { createDecalBatch: _mk } = r;
  const decalTex = r.uploadTexture(777, 'mark', red);
  const batch = r.createDecalBatch(1);
  {
    // Ten floats a corner; the tenth is wetness, and 0 draws a dry mark.
    const quad = new Float32Array(4 * 10);
    const corner = (i, x, y) => {
      const o = i * 10;
      quad[o] = x; quad[o + 1] = y; quad[o + 2] = 0;
      quad[o + 3] = i === 0 || i === 1 ? 0 : 1; quad[o + 4] = i === 0 || i === 3 ? 0 : 1;
      quad[o + 5] = 209 / 255; quad[o + 6] = 16 / 255; quad[o + 7] = 16 / 255; quad[o + 8] = 1; quad[o + 9] = 0;
    };
    corner(0, -1, -1); corner(1, -1, 1); corner(2, 1, 1); corner(3, 1, -1);
    r.writeDecalSlot(batch, 0, quad);
  }
  const decalShot = (label, setup, lights = null) => {
    setup();
    r.setPointLights(lights ?? new Float32Array(0), [1, 1, 1], null);
    const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.2, 0];
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1];
    r.beginFrame(proj, view, SUN);
    const gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 128, 128);
    gl.clearColor(0, 0, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    r.drawDecals(batch, decalTex);
    const px = new Uint8Array(4);
    gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { label, px: [...px] };
  };
  frames.push(decalShot('DECAL: dungeon ambient, no lights', dungeon));
  frames.push(decalShot('DECAL: dungeon ambient + a torch on it', dungeon, TORCH));
  frames.push(decalShot('DECAL: exterior noon', () => r.setLighting([0.55, 0.55, 0.55], 1, [1, 0.96, 0.9])));
  frames.push(meshShot('MESH: dungeon ambient, no lights', dungeon));
  frames.push(meshShot('MESH: dungeon ambient + a torch on it', dungeon, TORCH));
  frames.push(meshShot('MESH: exterior noon', () => r.setLighting([0.55, 0.55, 0.55], 1, [1, 0.96, 0.9])));

  const { bloodAtlas, pickCell, freshTint, driedTint, DRY_STAGES, BLOOD_ATLAS_ARCHIVE, BLOOD_ATLAS_RECORD } = await import('/src/combat/bloodArt.js');
  const atlas = bloodAtlas();
  const atlasTex = r.uploadTexture(BLOOD_ATLAS_ARCHIVE, BLOOD_ATLAS_RECORD, atlas, { smooth: true });
  const cell = pickCell(atlas, 'pool', () => 0);
  const own = r.createDecalBatch(1);
  const wear = (tint, wet = 0) => {
    const quad = new Float32Array(4 * 10);
    const corner = (i, x, y) => {
      const o = i * 10;
      quad[o] = x; quad[o + 1] = y; quad[o + 2] = 0;
      quad[o + 3] = i === 0 || i === 1 ? cell.u0 : cell.u1; quad[o + 4] = i === 0 || i === 3 ? cell.v0 : cell.v1;
      quad[o + 5] = tint[0]; quad[o + 6] = tint[1]; quad[o + 7] = tint[2]; quad[o + 8] = 1; quad[o + 9] = wet;
    };
    corner(0, -1.2, -1.2); corner(1, -1.2, 1.2); corner(2, 1.2, 1.2); corner(3, 1.2, -1.2);
    r.writeDecalSlot(own, 0, quad);
  };
  const ownShot = (label, tint, setup, lights = null, wet = 0, clear = null) => {
    wear(tint, wet);
    setup();
    r.setPointLights(lights ?? new Float32Array(0), [1, 1, 1], null);
    const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.2, 0];
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1];
    r.beginFrame(proj, view, SUN);
    const gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 128, 128);
    gl.clearColor(...(clear ?? [0, 0, 1, 1]));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    r.drawDecals(own, atlasTex);
    const px = new Uint8Array(4);
    gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const all = new Uint8Array(128 * 128 * 4);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, all);
    const ring = (lo, hi) => {
      const acc = [0, 0, 0]; let n = 0;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const d = Math.hypot(x - 63.5, y - 63.5);
        if (d < lo || d >= hi) continue;
        const i = (y * 128 + x) * 4;
        if (!(all[i] > all[i + 2])) continue;
        acc[0] += all[i]; acc[1] += all[i + 1]; acc[2] += all[i + 2]; n++;
      }
      if (!n) return null;
      const m = acc.map((v) => v / n);
      return { n, r: m[0], g: m[1], b: m[2], warm: m[0] > 0 ? (m[1] + m[2]) / 2 / m[0] : 0 };
    };
    return { label, px: [...px], film: { deep: ring(0, 5), thin: ring(12, 17) } };
  };
  const flatInk = (() => {
    const c = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < 64; i++) { const ink = Math.round(255 * (1 - 0.18)); c[i*4] = ink; c[i*4+1] = ink; c[i*4+2] = ink; c[i*4+3] = 255; }
    return { colors: c, width: 8, height: 8 };
  })();
  const flatTex = r.uploadTexture(4242, 'flatink#0', flatInk, { smooth: true });
  const grazeLit = () => r.setLighting([0.06, 0.06, 0.07], 1.6, [1, 0.97, 0.92]);
  const grazeShot = (useAtlas) => {
    wear(fresh0, 0);
    grazeLit();
    r.setPointLights(new Float32Array(0), [1, 1, 1], null);
    const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.2, 0];
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1];
    r.beginFrame(proj, view, [0.945, 0.315, 0.087]);
    const gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 128, 128);
    gl.clearColor(0.06, 0.06, 0.07, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    r.drawDecals(own, useAtlas ? atlasTex : flatTex);
    const all = new Uint8Array(128 * 128 * 4);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, all);
    return all;
  };

  const fresh0 = freshTint(() => 0.5);
  const fresh = fresh0, dried = driedTint(fresh, DRY_STAGES);
  const noonLit = () => r.setLighting([0.55, 0.55, 0.55], 1, [1, 0.96, 0.9]);
  const ownRows = [];
  const ownFilm = [];
  let meniscusOut = null;
  for (const [laneName, enter, leave] of [['classic', () => {}, () => {}], ['lane', async () => { const { EL_LANE } = await import('/src/render/enhancedLighting.js'); r.setLightingLane(EL_LANE); r.setExposure(1.1); }, () => r.setLightingLane(null)]]) {
    await enter();
    ownRows.push({ lane: laneName, what: 'fresh at noon', px: ownShot('', fresh, noonLit).px });
    ownRows.push({ lane: laneName, what: 'dried at noon', px: ownShot('', dried, noonLit).px });
    ownRows.push({ lane: laneName, what: 'fresh, dungeon + torch', px: ownShot('', fresh, dungeon, TORCH).px });
    ownRows.push({ lane: laneName, what: 'dried, dungeon + torch', px: ownShot('', dried, dungeon, TORCH).px });
    ownRows.push({ lane: laneName, what: 'fresh WET, dungeon + torch', px: ownShot('', fresh, dungeon, TORCH, 1).px });
    ownRows.push({ lane: laneName, what: 'fresh WET at noon', px: ownShot('', fresh, noonLit, null, 1).px });
    ownFilm.push({ lane: laneName, ...ownShot('', fresh, noonLit, null, 0, [0, 0, 0, 1]).film });
    if (laneName === 'lane') {
      const bumped = grazeShot(true), flat = grazeShot(false);
      let peak = 0, sIn = 0, nIn = 0, sOut = 0, nOut = 0;
      for (let i = 0; i < bumped.length; i += 4) {
        const d = Math.max(Math.abs(bumped[i] - flat[i]), Math.abs(bumped[i+1] - flat[i+1]), Math.abs(bumped[i+2] - flat[i+2]));
        if (d > peak) peak = d;
        const px = (i / 4) % 128, py = Math.floor((i / 4) / 128);
        const rad = Math.hypot(px - 63.5, py - 63.5) / 64;
        if (rad < 0.45) { sIn += d; nIn++; } else if (rad < 0.80) { sOut += d; nOut++; }
      }
      meniscusOut = { peak, body: sIn / Math.max(1, nIn), rim: sOut / Math.max(1, nOut) };
    }
    leave();
  }

  const { EL_LANE } = await import('/src/render/enhancedLighting.js');
  r.setLightingLane(EL_LANE);
  r.setExposure(1.1);
  const dusk = () => r.setLighting([0.25, 0.25, 0.3], 0.25, [0.9, 0.6, 0.4]);
  const lane = [];
  for (const [what, setup, lights] of [
    ['noon', () => r.setLighting([0.55, 0.55, 0.55], 1, [1, 0.96, 0.9]), null],
    ['dusk', dusk, null],
    ['dungeon + a torch', dungeon, TORCH],
    ['dungeon, no lights', dungeon, null],
  ]) {
    lane.push({ what, sprite: foeShot(`LANE sprite: ${what}`, setup, lights).px, decal: decalShot(`LANE decal: ${what}`, setup, lights).px, mesh: meshShot(`LANE mesh: ${what}`, setup, lights).px });
  }
  r.setLightingLane(null);

  const PW = 8, PH = 8;
  const pcol = new Uint8ClampedArray(PW * PH * 4);
  for (let i = 0; i < PW * PH; i++) { pcol[i * 4] = 40; pcol[i * 4 + 1] = 190; pcol[i * 4 + 2] = 60; pcol[i * 4 + 3] = 255; }
  const picTex = r.uploadTexture(778, 'picture', { colors: pcol, width: PW, height: PH });
  const picBatch = r.createDecalBatch(1);
  {
    const quad = new Float32Array(4 * 10);
    const corner = (i, x, y) => {
      const o = i * 10;
      quad[o] = x; quad[o + 1] = y; quad[o + 2] = 0;
      quad[o + 3] = i === 0 || i === 1 ? 0 : 1; quad[o + 4] = i === 0 || i === 3 ? 0 : 1;
      quad[o + 5] = 1; quad[o + 6] = 1; quad[o + 7] = 1; quad[o + 8] = 1; quad[o + 9] = 0;
    };
    corner(0, -1, -1); corner(1, -1, 1); corner(2, 1, 1); corner(3, 1, -1);
    r.writeDecalSlot(picBatch, 0, quad);
  }
  const picShot = (asPicture) => {
    r.setLighting([0.55, 0.55, 0.55], 1, [1, 0.96, 0.9]);
    r.setPointLights(new Float32Array(0), [1, 1, 1], null);
    const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.02, -1, 0, 0, -0.2, 0];
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1];
    r.beginFrame(proj, view, SUN);
    const gl = r.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 128, 128);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (asPicture) r.drawDecalPicture(picBatch, picTex); else r.drawDecals(picBatch, picTex);
    const px = new Uint8Array(4);
    gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [...px];
  };
  const pictures = [];
  for (const [laneName, enter, leave] of [['classic', () => {}, () => {}], ['lane', async () => { const { EL_LANE } = await import('/src/render/enhancedLighting.js'); r.setLightingLane(EL_LANE); r.setExposure(1.1); }, () => r.setLightingLane(null)]]) {
    await enter();
    pictures.push({ lane: laneName, picture: picShot(true), film: picShot(false) });
    leave();
  }

  return {
    pictures,
    archive: BLOOD_ARCHIVE,
    uploaded,
    batches: fx.batches().length,
    textureKeys: [...r.textures.keys()].filter((k) => String(k).startsWith('380')),
    frames,
    lane,
    ownRows,
    ownFilm,
    meniscus: meniscusOut,
  };
});

console.log('archive           ', out.archive);
console.log('uploaded keys     ', out.uploaded);
console.log('renderer tex keys ', out.textureKeys);
console.log('live batches      ', out.batches);
for (const f of out.frames) console.log(`  ${f.label.padEnd(38)} -> rgba ${f.px.join(',')}`);
for (const x of out.lane) console.log(`  LANE ${x.what.padEnd(20)} sprite ${x.sprite.join(',').padEnd(16)} mesh ${x.mesh.join(',').padEnd(16)} decal ${x.decal.join(',')}`);
for (const x of out.ownRows) console.log(`  OWN  ${x.lane.padEnd(8)} ${x.what.padEnd(24)} -> rgba ${x.px.join(',')}`);

check('the pool uploaded a texture for the splash', out.uploaded.length > 0, out.uploaded.join(' '));
check('the key the pool uploads is the key the billboard pass asks for',
  out.textureKeys.includes('380_0#0'), out.textureKeys.join(' '));
check('a batch reached the draw', out.batches === 1, String(out.batches));
const lit = out.frames[0]?.px ?? [];
check('full-bright: a RED texture comes back RED, not black',
  lit[0] > 100 && lit[0] > lit[2], `rgba ${lit.join(',')}`);
const noon = out.frames[1]?.px ?? [];
check('exterior noon: still red', noon[0] > 60 && noon[0] > noon[2], `rgba ${noon.join(',')}`);
const dark = out.frames[2]?.px ?? [];
const torch = out.frames[3]?.px ?? [];
const sprite = out.frames[4]?.px ?? [];
check('dungeon ambient with NO light: a splash is ambient x albedo, which reads BLACK',
  dark[0] < 40, `rgba ${dark.join(',')}`);
check('...and a TORCH on it brings it back', torch[0] > dark[0] * 3, `rgba ${torch.join(',')}`);
check('A SPRITE IN THE SAME LIGHT IS EXACTLY AS DARK - the pool is not the difference',
  Math.abs(sprite[0] - dark[0]) <= 1, `splash ${dark.join(',')} vs sprite ${sprite.join(',')}`);
const dDark = out.frames[5]?.px ?? [];
const dTorch = out.frames[6]?.px ?? [];
const dNoon = out.frames[7]?.px ?? [];
const mDark = out.frames[8]?.px ?? [];
const mTorch = out.frames[9]?.px ?? [];
const mNoon = out.frames[10]?.px ?? [];
const same = (a, b) => Math.abs(a[0] - b[0]) <= 2 && Math.abs(a[1] - b[1]) <= 2 && Math.abs(a[2] - b[2]) <= 2;
check('DECAL in a dark dungeon is as dark as the WALL it lies on - no darker',
  same(dDark, mDark), `decal ${dDark.join(',')} vs mesh ${mDark.join(',')}`);
check('A TORCH LIGHTS THE MARK exactly as it lights the wall under it (N.L)',
  same(dTorch, mTorch) && dTorch[0] > dDark[0] * 3, `decal ${dTorch.join(',')} vs mesh ${mTorch.join(',')}`);
check('and at noon the mark takes the SUN as the wall does (N.L), not the flat’s half',
  same(dNoon, mNoon) && dNoon[0] > dDark[0] * 3, `decal ${dNoon.join(',')} vs mesh ${mNoon.join(',')}`);
for (const x of out.lane) {
  check(`LANE ${x.what}: the mark is lit as the wall it lies on is`,
    same(x.decal, x.mesh), `decal ${x.decal.join(',')} vs mesh ${x.mesh.join(',')} (sprite ${x.sprite.join(',')})`);
}
for (const lane of ['classic', 'lane']) {
  const at = (what) => out.ownRows.find((x) => x.lane === lane && x.what === what)?.px ?? [0, 0, 0, 0];
  const fN = at('fresh at noon'), dN = at('dried at noon'), fT = at('fresh, dungeon + torch'), dT = at('dried, dungeon + torch');
  check(`OWN ${lane}: fresh blood at noon is RED - red well over the rest, and bright`,
    fN[0] > 80 && fN[0] > fN[1] * 4 && fN[0] > fN[2] * 4, `rgba ${fN.join(',')}`);
  check(`OWN ${lane}: dried blood at noon is a RUST, browner than fresh and about as bright`,
    dN[1] / Math.max(1, dN[0]) > 2 * (fN[1] / Math.max(1, fN[0])) && dN[0] > fN[0] * 0.4 && dN[0] > 40, `dried ${dN.join(',')} vs fresh ${fN.join(',')}`);
  check(`OWN ${lane}: under a torch in a dungeon, fresh is red and dried is a visible rust - not black`,
    fT[0] > 30 && dT[0] > 15 && dT[1] > 4, `fresh ${fT.join(',')} dried ${dT.join(',')}`);
  const wT = at('fresh WET, dungeon + torch'), wN = at('fresh WET at noon');
  if (lane === 'lane') {
    check('OWN lane: a WET mark under a torch glints in the lamp\'s colour AND darkens in its own',
      wT[1] >= fT[1] + 6 && wT[2] >= fT[2] + 6 && wT[0] < fT[0], `wet ${wT.join(',')} vs dry ${fT.join(',')}`);
    check('OWN lane: ...but it is still BLOOD, not a white highlight - the red keeps a clear lead over the glint',
      wT[0] > wT[1] * 2.2 && wT[0] > wT[2] * 2.2, `wet ${wT.join(',')} (r/g ${(wT[0] / Math.max(1, wT[1])).toFixed(2)})`);
    check('OWN lane: and in the sun, head on, a wet mark is not a highlight - it is DARKER, and still blood',
      wN[0] < fN[0] && wN[0] > wN[1] * 2.2 && wN[1] <= fN[1] + 2, `wet ${wN.join(',')} vs dry ${fN.join(',')}`);
  } else {
    check('OWN classic: the wet float means nothing to the classic set - the same mark, wet or dry',
      wT.join(',') === fT.join(',') && wN.join(',') === fN.join(','), `wet ${wT.join(',')} vs dry ${fT.join(',')}`);
  }
}
for (const f of out.ownFilm ?? []) {
  const d = f.deep, t = f.thin;
  console.log(`  FILM ${f.lane}: deep ${d?.n}px ${d?.r.toFixed(0)},${d?.g.toFixed(0)},${d?.b.toFixed(0)} | thin ${t?.n}px ${t?.r.toFixed(0)},${t?.g.toFixed(0)},${t?.b.toFixed(0)} (g+b over r: ${d?.warm.toFixed(3)} -> ${t?.warm.toFixed(3)})`);
  check(`FILM ${f.lane}: a mark is not ONE red - a pool's heart is a DEEPER film than its shoulder, so it comes back darker`,
    !!d && !!t && t.r > d.r + 4, `heart ${d?.r.toFixed(0)} against shoulder ${t?.r.toFixed(0)} - inverted, the heart is the brighter one`);
  check(`FILM ${f.lane}: ...and the thinner blood is DESATURATED - green and blue pass a thinning film, which is the whole of reading it as depth`,
    !!d && !!t && t.warm > d.warm * 1.06, `g+b over r, heart ${d?.warm.toFixed(3)} -> shoulder ${t?.warm.toFixed(3)}`);
  const gain = d && t ? t.r / d.r : 0;
  check(`FILM ${f.lane}: ...and by an amount the law allows - not a no-op, not unbounded`,
    gain > 1.08 && gain < 1.65, `red gain heart -> shoulder ${gain.toFixed(3)} (1.0 would be no film; exp(ABSORB.r) = 1.649 is the ceiling, at zero thickness)`);
}
const laneDusk = out.lane.find((x) => x.what === 'dusk');
check('LANE dusk: the mark is RED, not the near-black the classic program drew under the lane', (laneDusk?.decal[0] ?? 0) > 50, `rgba ${laneDusk?.decal.join(',')}`);
if (out.meniscus) {
  const m = out.meniscus;
  console.log(`  MENISCUS lane: peak ${m.peak}/255 | body (r<0.45) mean ${m.body.toFixed(2)} | rim band (0.45-0.80) mean ${m.rim.toFixed(2)}`);
  check('MENISCUS lane: the mark is lit as a RELIEF - flatten its thickness and a grazing sun lands differently',
    m.peak >= 12, `peak change ${m.peak}/255 between a real mark and a uniform-thickness one`);
  check('MENISCUS lane: ...and it is the WHOLE mark, not a rim lip - a pool\'s thickness is a smoothstep, and a smoothstep is steepest in the MIDDLE',
    m.body > m.rim, `body ${m.body.toFixed(2)} against rim band ${m.rim.toFixed(2)} - the record said "raised edge" until this row was written`);
}
for (const p of out.pictures ?? []) {
  console.log(`  PICTURE ${p.lane.padEnd(8)} picture ${p.picture.join(',').padEnd(16)} film ${p.film.join(',')}`);
  check(`WEAPON-MOUNT ${p.lane}: a hung picture comes back its own colour - GREEN in, green out`,
    p.picture[1] > 90 && p.picture[1] > p.picture[0] * 1.6 && p.picture[1] > p.picture[2] * 1.6, `rgba ${p.picture.join(',')}`);
  check(`WEAPON-MOUNT ${p.lane}: ...where the blood pass reads the same texel as a film and loses the colour - the defect`,
    !(p.film[1] > p.film[0] * 1.6), `rgba ${p.film.join(',')}`);
}
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
