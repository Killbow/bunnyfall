// Real ARENA2 texture rendering and browser input; the body-hold seam is injected.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
assert.ok(process.env.ARENA2_PATH, 'Set ARENA2_PATH to local Daggerfall game files.');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr:false, watch:null } }); await server.listen();
let browser;
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'chrome' } : {});
  const page = await browser.newPage({ viewport: { width: 1122, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/__farming_probe*', (route) => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"><canvas style="width:100vw;height:100vh;display:block"></canvas></body>' }));
  await page.goto(server.resolvedUrls.local[0] + '__farming_probe?dress=none');
  const setup = async (observer = false) => {
    const { Renderer } = await import('/src/render/renderer.js');
    const { createFarmingMode } = await import('/src/scenes/farmingMode.js');
    const { emptyGarden, stepFarmGardenAction } = await import('/src/net/farmGardenLaw.js');
    const {stepFarmUpgrade,stepFarmDelivery}=await import('/src/net/farmProgressLaw.js');
    const { registerFlatField } = await import('/src/world/flatFields.js');
    const { perspective, mirrorProjectionX, lookAt } = await import('/src/world/mat4.js');
    const { projectToScreen } = await import('/src/player/tapRay.js');
    const { DFPalette } = await import('/src/formats/dfPalette.js');
    const { TextureFile } = await import('/src/formats/textureFile.js');
    const { hotbarHeld } = await import('/src/ui/enhanced/enhancedHotbar.js');
    const { setUiSkin } = await import('/src/systems/uiSkin.js');
    const { setPlusTheme } = await import('/src/ui/enhanced/enhancedPlusStyle.js');
    registerFlatField(999102, { rangeX: 35, rangeZ: 35, spacing: 4, noise: 0 });
    const canvas = document.querySelector('canvas'), renderer = new Renderer(canvas);
    const matrix = Array(16).fill(0); matrix[12] = matrix[14] = 12;
    const p = window.probe = { canvas, renderer, garden: emptyGarden(), version: 0, now: 100000, held: false, available: true, blocked: false, requests: [], feet: [2,0,0], cam: { pos: [2,1.6,0], yaw: 0 }, overlay: 0, hotbarHeld, setUiSkin, setPlusTheme };
    const palette = new DFPalette(); palette.load(new Uint8Array(await (await fetch('/arena2/ART_PAL.COL')).arrayBuffer()));
    const textures = new Map();
    const getTexture = async (archive) => {
      if (!textures.has(archive)) { const name = `TEXTURE.${archive}`; const texture = new TextureFile(); texture.load(new Uint8Array(await (await fetch('/arena2/' + name)).arrayBuffer()), name, palette); textures.set(archive, texture); }
      return textures.get(archive);
    };
    const uploadRecord = (archive, record, opts = {}) => { const texture = textures.get(archive); renderer.uploadTexture(archive, record, texture.getColor32(texture.getDFBitmap(record,0),opts.opaque ? -1 : 0), opts); };
    const farm = { mapId: 42, name: 'Test farm', choreDone: false };
    const book = { placeOf: () => ({ px: 1, py: 2 }), mine: () => ({ farms: observer ? [] : [farm] }), atFarm: () => true, visibleHere: () => farm, refresh() {},
      async garden(id, body = {}) {
        p.requests.push(body);
        if(observer)return window.remoteFarmRead(body);
        if (body.op && body.op !== 'read') {
          const step = body.op==='upgrade'?stepFarmUpgrade(p.garden,body.upgrade):body.op==='deliver'?stepFarmDelivery(p.garden,body.crop,p.now):stepFarmGardenAction(p.garden, body, p.now);
          if (step.error) return { ok: false, error: step.error };
          p.garden = step.garden; p.version++;
        }
        return { ok: true, data: { garden: structuredClone(p.garden), version: p.version, nowS: p.now,mayManage:true,economy:{gold:1000000,argents:1000,earned:0} } };
      },
    };
    p.mode = createFarmingMode({ renderer, canvas, getTexture, uploadRecord, cam: p.cam, feet: () => p.feet, farms: () => book,
      built: new Map([['1,2',{ locOrigin: [0,0,0], locBlocks: [{ originX: 0, originZ: 0, layout: { models: [{ modelIdNum: 999102, matrix }] } }] }]]),
      state: () => ({ pixelTranslation: () => [0,0,0] }), heightAt: () => 0, collider: { raycast: () => Infinity },
      available: () => p.available, blocked: () => p.blocked, alive: () => true, say: (s) => { p.notice = s; }, holdThird: (b) => { p.held = b; return true; } });
    p.render = () => {
      p.mode.frame();
      const out = { eye: p.cam.pos }; p.mode.camera(out, .1, [0,0,1]);
      const eye = out.eye, forward = p.mode.look ?? [0,0,1];
      const proj = mirrorProjectionX(perspective(Math.PI/3, canvas.clientWidth/canvas.clientHeight, .1, 100));
      const view = lookAt(eye, eye.map((v,i) => v + forward[i]), [0,1,0]);
      renderer.beginFrame(proj, view, [.4,.9,.4]); renderer.setLighting([.6,.6,.6], .8, [1,1,.9]);
      p.mode.draw(proj, view, [Math.cos(p.cam.yaw),0,-Math.sin(p.cam.yaw)], [0,1,0]);
      p.glError = renderer.gl.getError(); p.proj = proj; p.view = view; p.eye = eye;
    };
    p.bedPoint = (i) => projectToScreen([(i%4+.5)*2,0,(Math.floor(i/4)+.5)*2],canvas.clientWidth,canvas.clientHeight,p.proj,p.view,renderer.worldViewportRect);
    p.enter = async () => { await p.mode.enter(farm); for(let i=0;i<20;i++) p.render(); };
    if(observer)p.render();else await p.enter();
  };
  await page.evaluate(setup);
  assert.ok(await page.evaluate(() => window.probe.held && window.probe.mode.active));
  assert.ok(await page.evaluate(() => window.probe.hotbarHeld()));
  assert.equal(await page.locator('.farming-hud').count(), 1);
  async function clickBed(i) {
    const at = await page.evaluate(i => window.probe.bedPoint(i), i);
    await page.mouse.click(at.x, at.y); await page.evaluate(() => window.probe.render());
  }
  await clickBed(0);
  assert.equal(await page.evaluate(() => window.probe.garden.beds[0]?.crop), null);
  await page.getByRole('button', { name: '2 · Seeds', exact: true }).click(); await clickBed(0);
  assert.equal(await page.evaluate(() => window.probe.garden.beds[0].crop), 'grain');
  await page.keyboard.press('3'); await clickBed(0);
  assert.ok(await page.evaluate(() => window.probe.garden.beds[0].wetUntil > window.probe.now));
  assert.equal(await page.evaluate(() => window.probe.glError), 0, 'WebGL upload/draw error');
  // A separate browser page is a visitor with no Company, no Farming Mode and no input holds.
  const visitor = await browser.newPage({viewport:{width:1122,height:800}});
  await visitor.route('**/__farming_probe*',route=>route.fulfill({contentType:'text/html',body:'<canvas style="width:100vw;height:100vh;display:block"></canvas>'}));
  await visitor.exposeFunction('remoteFarmRead',()=>page.evaluate(()=>({ok:true,data:{garden:structuredClone(window.probe.garden),version:window.probe.version,nowS:window.probe.now}})));
  await visitor.goto(server.resolvedUrls.local[0]+'__farming_probe?dress=none');
  await visitor.evaluate(setup,true);
  await visitor.waitForFunction(()=>window.probe.mode.inspect().version===3);
  assert.equal(await visitor.locator('.farming-hud').count(),0);
  assert.equal(await visitor.evaluate(()=>window.probe.held||window.probe.hotbarHeld()),false);
  await page.keyboard.press('1');await clickBed(1);
  await visitor.waitForTimeout(1100);await visitor.evaluate(()=>window.probe.render());
  await visitor.waitForFunction(()=>window.probe.mode.inspect().version===4);
  await visitor.evaluate(()=>window.probe.render());
  assert.equal(await visitor.evaluate(()=>window.probe.glError),0);
  await visitor.evaluate(()=>window.probe.mode.dispose());await visitor.close();
  const palettes = new Set();
  for (const theme of ['slate','ember','forest']) {
    palettes.add(await page.evaluate(theme => { window.probe.setPlusTheme(theme); window.probe.render(); return getComputedStyle(document.querySelector('.farm-info')).backgroundColor; },theme));
  }
  assert.ok(palettes.size >= 3, 'Farming panels must inherit the active Enhanced Plus theme');
  await page.evaluate(() => { window.probe.setUiSkin('classic'); window.probe.render(); });
  assert.equal(await page.locator('.farming-hud').getAttribute('data-skin'),'classic');
  await page.evaluate(() => { window.probe.setUiSkin('enhanced'); window.probe.render(); });
  const before = await page.evaluate(() => window.probe.requests.length);
  await page.keyboard.press('1'); await clickBed(15);
  assert.equal(await page.evaluate(() => window.probe.requests.length), before, 'Distant bed must not send an action');
  assert.ok((await page.locator('.farm-message').textContent()).includes('closer'));
  const yaw = await page.evaluate(() => window.probe.cam.yaw);
  await page.keyboard.press('e'); await page.evaluate(() => window.probe.render());
  assert.notEqual(await page.evaluate(() => window.probe.cam.yaw), yaw);
  const zoomBefore = await page.evaluate(() => window.probe.eye[1]);
  const atZoom = await page.evaluate(() => window.probe.bedPoint(0));
  await page.mouse.move(atZoom.x, atZoom.y); await page.mouse.wheel(0, 100);
  await page.evaluate(() => { for(let i=0;i<20;i++) window.probe.render(); });
  assert.ok(await page.evaluate(before => window.probe.eye[1] > before + .3, zoomBefore), 'Wheel zoom did not raise the camera');
  await page.getByRole('button', { name: 'Crop: Grain', exact: true }).click();
  await page.evaluate(() => window.probe.render());
  assert.ok(await page.getByRole('button', { name: 'Crop: Mushrooms', exact: true }).isVisible());
  await page.evaluate(async()=>{const {emptyFarmProgress}=await import('/src/net/farmProgressLaw.js');const p=window.probe;p.garden.progress=emptyFarmProgress();p.garden.progress.harvested={grain:7000,mushroom:6000,herbs:6000};p.garden.progress.delivered={grain:0,mushroom:6000,herbs:6000};p.version++;});
  await page.waitForTimeout(1100);await page.evaluate(()=>window.probe.render());
  await page.getByRole('button',{name:'Progress & orders',exact:true}).click();await page.evaluate(()=>window.probe.render());
  await page.waitForFunction(()=>document.querySelector('.farm-progress')?.textContent.includes('Harvested here: 7000'));
  const deliver=page.getByRole('button',{name:'Deliver 1000 Grain · earn 2000 gold + 10 Argents',exact:true});
  await deliver.click();await page.evaluate(()=>window.probe.render());
  assert.equal(await page.evaluate(()=>window.probe.garden.progress.delivered.grain),0,'First click must only ask for confirmation');
  await page.getByRole('button',{name:'Confirm: Deliver 1000 Grain · earn 2000 gold + 10 Argents',exact:true}).click();await page.evaluate(()=>window.probe.render());
  assert.equal(await page.evaluate(()=>window.probe.garden.progress.delivered.grain),1000);
  await page.getByRole('button',{name:'Farm improvements',exact:true}).click();await page.evaluate(()=>window.probe.render());
  const buy=page.getByRole('button',{name:'Buy · 20000 gold + 25 Argents',exact:true});
  await buy.click();await page.evaluate(()=>window.probe.render());
  assert.equal(await page.evaluate(()=>window.probe.garden.progress.upgrades.tools),0);
  await page.getByRole('button',{name:'Confirm: Buy · 20000 gold + 25 Argents',exact:true}).click();await page.evaluate(()=>window.probe.render());
  assert.equal(await page.evaluate(()=>window.probe.garden.progress.upgrades.tools),1);
  for (const width of [360,736]) {
    await page.setViewportSize({width,height:800}); await page.evaluate(() => window.probe.render());
    assert.ok(await page.getByRole('button', { name: '1 · Hoe', exact: true }).isVisible());
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.farming-hud footer button')].every(b=>{ const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth; })));
    assert.ok(await page.evaluate(()=>{const r=document.querySelector('.farm-progress').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.farming-hud').count(),0);
  assert.equal(await page.evaluate(() => window.probe.held),false);
  assert.equal(await page.evaluate(() => window.probe.hotbarHeld()),false);
  await page.evaluate(async () => { await window.probe.enter(); window.probe.available=false; window.probe.mode.frame(); });
  assert.equal(await page.locator('.farming-hud').count(),0,'Leaving the farm/world must clean up');
  assert.equal(await page.evaluate(() => window.probe.held),false);
  await page.evaluate(() => window.probe.mode.dispose());
  assert.deepEqual(errors,[]);
  console.log('PASS: real WebGL soil/crop rendering, screen-to-bed picking, hoe/plant/water, range gate, tools, seeds, orbit, responsive belt and camera/body cleanup.');
} finally { await browser?.close(); await server.close(); }
