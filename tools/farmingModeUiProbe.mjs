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
    const { stepFarmHaul } = await import('/src/net/farm/haulLaw.js');
    const { stepFarmPlough } = await import('/src/net/farmGardenLaw.js'); const { stepFarmStation } = await import('/src/net/farm/stationLaw.js');   // PHASE 5
    const { stepFarmHerdAction } = await import('/src/net/farm/herdLaw.js'); const { farmWeek } = await import('/src/net/farmProgressLaw.js');
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
          const step = body.op==='upgrade'?stepFarmUpgrade(p.garden,body.upgrade):body.op==='deliver'?stepFarmDelivery(p.garden,body.crop,p.now):body.op==='haul'?stepFarmHaul(p.garden,body.sacks,p.now):body.op==='herd'?stepFarmHerdAction(p.garden,body,p.now,farmWeek):body.op==='plough'?stepFarmPlough(p.garden,{beds:body.beds,game:body.game,who:'tester'},p.now):body.op==='station'||body.op==='recall'?stepFarmStation(p.garden,{...body,act:body.op,who:'tester',character:'char1'},p.now):stepFarmGardenAction(p.garden, body, p.now);
          if (step.error) return { ok: false, error: step.error };
          p.garden = step.garden; p.version++;
        }
        return { ok: true, data: { garden: structuredClone(p.garden), version: p.version, nowS: p.now,mayManage:true,economy:{gold:1000000,argents:1000,earned:0} } };
      },
    };
    p.mode = createFarmingMode({ renderer, canvas, getTexture, uploadRecord, uploadRecordFrame: () => {}, cam: p.cam, feet: () => p.feet, farms: () => book,
      built: new Map([['1,2',{ locOrigin: [0,0,0], locBlocks: [{ originX: 0, originZ: 0, layout: { models: [{ modelIdNum: 999102, matrix }] } }] }]]),
      state: () => ({ pixelTranslation: () => [0,0,0] }), heightAt: () => 0, collider: { raycast: () => Infinity },
      available: () => p.available, blocked: () => p.blocked, alive: () => true, say: (s) => { p.notice = s; }, show: (w) => { p.asked = w; }, holdThird: (b) => { p.held = b; return true; } });
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
    // FARM EXPANSION PHASE 1: the farmyard's fixtures, where they stand on screen; walk to one before using it
    p.project = (at) => projectToScreen(at, canvas.clientWidth, canvas.clientHeight, p.proj, p.view, renderer.worldViewportRect);
    p.fixture = (id) => p.mode.inspect().fixtures.find((f) => f.id === id);
    p.fixturePoint = (id) => { const f = p.fixture(id); return projectToScreen([f.pos[0], f.pos[1] + f.h * .5, f.pos[2]], canvas.clientWidth, canvas.clientHeight, p.proj, p.view, renderer.worldViewportRect); };
    p.walkTo = (id) => { const f = p.fixture(id); p.feet = [f.pos[0] - (f.r + 1.2), 0, f.pos[2]]; for (let i = 0; i < 30; i++) p.render(); };
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
  // THE FARMYARD (docs/FARM-EXPANSION.md section 3): every fixture laid out, drawn without a GL error, and used in place
  const ids = await page.evaluate(() => window.probe.mode.inspect().fixtures.map((f) => f.id));
  for (const id of ['orderPost', 'wagon', 'ledger', 'seed:grain', 'seed:mushroom', 'seed:herbs', 'toolRack', 'well', 'compost', 'haystack', 'scarecrow']) assert.ok(ids.includes(id), `farmyard lacks ${id}`);
  assert.equal(await page.evaluate(() => window.probe.glError), 0, 'farmyard draw error');
  const lamps = await page.evaluate(() => { window.probe.walkTo('ledger'); return window.probe.mode.lights(); });
  assert.ok(lamps.length >= 1 && lamps.length <= 3 && lamps.every((l) => Number.isFinite(l.x) && l.range > 0), 'The farmyard lanterns light the night');
  async function useFixture(id) {
    await page.evaluate(id => window.probe.walkTo(id), id);
    const at = await page.evaluate(id => window.probe.fixturePoint(id), id);
    await page.mouse.move(at.x, at.y); await page.evaluate(() => window.probe.render());
    await page.mouse.click(at.x, at.y); await page.evaluate(() => window.probe.render());
  }
  assert.equal(await page.locator('.farm-seed').textContent(), 'Seed: Grain');
  await useFixture('seed:mushroom');
  assert.equal(await page.locator('.farm-seed').textContent(), 'Seed: Mushrooms', 'The seed sack must hand over its seed');
  assert.equal(await page.getByRole('button', { name: 'Crop: Grain', exact: true }).count(), 0, 'The Crop button is gone');
  await page.evaluate(async()=>{const {emptyFarmProgress}=await import('/src/net/farmProgressLaw.js');const p=window.probe;p.garden.progress=emptyFarmProgress();p.garden.progress.harvested={grain:7000,mushroom:6000,herbs:6000};p.garden.progress.delivered={grain:0,mushroom:6000,herbs:6000};p.version++;});
  await page.waitForTimeout(1100);await page.evaluate(()=>window.probe.render());
  assert.equal(await page.getByRole('button',{name:'Progress & orders',exact:true}).count(),0,'The sidebar is gone');
  await useFixture('ledger');
  const ledgerLine = await page.locator('.farm-message').textContent();
  assert.ok(ledgerLine.includes('19,000 crops harvested'), `The ledger reads the totals: ${ledgerLine}`);
  await useFixture('wagon');
  assert.ok(await page.evaluate(()=>!!window.probe.asked), 'The wagon must ask an officer first');
  assert.equal(await page.evaluate(()=>window.probe.garden.progress.delivered.grain),0,'Asking must not ship');
  await page.evaluate(()=>{window.probe.asked.input('KeyY');window.probe.asked=null;});
  await page.waitForFunction(()=>window.probe.garden.progress.delivered.grain===1000);await page.evaluate(()=>window.probe.render());
  await useFixture('toolRack');
  assert.ok(await page.evaluate(()=>!!window.probe.asked), 'The tool rack must ask before buying');
  assert.equal(await page.evaluate(()=>window.probe.garden.progress.upgrades.tools),0);
  await page.evaluate(()=>{window.probe.asked.input('KeyY');window.probe.asked=null;});
  await page.waitForFunction(()=>window.probe.garden.progress.upgrades.tools===1);
  await useFixture('orderPost');
  assert.ok((await page.locator('.farm-message').textContent()).includes('filled this week'), 'The order post shows the filled order');
  // SACKS (section 3.3): a harvest's sack is shouldered at its bed and loaded onto the wagon
  await page.evaluate(()=>{const p=window.probe;p.garden.sacks=[{id:7,crop:'grain',qty:2,bed:0,t:p.now},{id:8,crop:'grain',qty:3,bed:0,t:p.now}];p.garden.nextSack=9;p.version++;});
  await page.waitForTimeout(1100);await page.evaluate(()=>{for(let i=0;i<3;i++)window.probe.render();});
  assert.equal(await page.evaluate(()=>window.probe.mode.inspect().sacks.length),2,'The sacks lie at their bed');
  await page.evaluate(()=>{const p=window.probe;const s=p.mode.inspect().sacks[0];p.feet=[s.pos[0]-1.6,0,s.pos[2]];for(let i=0;i<30;i++)p.render();});
  const sackAt=await page.evaluate(()=>{const p=window.probe,s=p.mode.inspect().sacks[0];return p.project([s.pos[0],s.pos[1]+.3,s.pos[2]]);});
  await page.mouse.move(sackAt.x,sackAt.y);await page.evaluate(()=>window.probe.render());await page.mouse.click(sackAt.x,sackAt.y);await page.evaluate(()=>window.probe.render());
  assert.deepEqual((await page.evaluate(()=>window.probe.mode.inspect().carried)).sort(),[7,8],'Both sacks at the bed are shouldered');
  assert.equal(await page.evaluate(()=>window.probe.mode.inspect().sacks.length),0,'Shouldered sacks leave the ground');
  await useFixture('wagon');
  await page.waitForFunction(()=>window.probe.garden.cargo?.grain===5);
  assert.deepEqual(await page.evaluate(()=>window.probe.mode.inspect().carried),[],'The wagon takes the sacks');
  assert.equal(await page.evaluate(()=>window.probe.glError),0,'sack draw error');
  // CAREFUL WORK (PHASE 2): F turns sowing into the sowing game, pinned over the bed; its report rides the planting
  await page.evaluate(()=>{const p=window.probe;p.feet=[(1%4+.5)*2-1.6,0,(Math.floor(1/4)+.5)*2];for(let i=0;i<30;i++)p.render();});
  await page.keyboard.press('f'); await page.keyboard.press('2'); await page.evaluate(()=>window.probe.render());
  assert.equal(await page.locator('.farm-careful').getAttribute('aria-pressed'),'true','Careful work is on');
  const acts=()=>page.evaluate(()=>window.probe.requests.filter((r)=>r.op&&r.op!=='read').length);   // the once-a-second reads are not actions
  const sowBefore=await acts();
  await clickBed(1);
  assert.equal(await page.locator('.farm-game').count(),1,'The sowing game appears over the bed');
  assert.equal(await acts(),sowBefore,'Nothing is sent while the game is played');
  for(let k=0;k<5;k++){await page.waitForTimeout(700);await page.keyboard.press('Space');await page.evaluate(()=>window.probe.render());}
  await page.waitForFunction(()=>{window.probe.render();return !document.querySelector('.farm-game');},null,{timeout:15000});
  await page.waitForFunction(()=>window.probe.garden.beds[1]?.crop,null,{timeout:5000});
  const sowReq=await page.evaluate(()=>window.probe.requests.filter((r)=>r.op&&r.op!=='read').at(-1));
  assert.equal(sowReq.op,'plant');assert.equal(sowReq.game?.kind,'sow','The play rides the planting');assert.ok(sowReq.game.ms>=2500,'A real play takes its time: '+sowReq.game.ms);
  await page.keyboard.press('f');
  // SWORN BEASTS (PHASE 5): beast posts on the farmstead; a sworn wolf walked to one is stationed with Y, drawn and held by the farm, called back with Y
  assert.ok(await page.evaluate(() => window.probe.mode.inspect().fixtures.some((f) => f.id === 'beastPost0')), 'The farmstead has beast posts');
  await useFixture('beastPost0');
  assert.ok((await page.locator('.farm-message').textContent()).includes('sworn beast'), 'With no beast at my side the post says so');
  await page.evaluate(async () => {
    const R = await import('/src/systems/revenant/revenant.js'), C = await import('/src/systems/revenant/revenantCompanions.js');
    const player = { characterId: 'probe-char', name: 'Tester', items: [] }; window.probe.sworn = { R, C, player };
    const rec = (id, mobileType) => ({ id, rev: 1, mobileType, gender: 'male', given: id === 'w1' ? 'Fang' : 'Bruin', epithet: 'the Scarred', name: `${id === 'w1' ? 'Fang' : 'Bruin'} the Scarred`, rank: 3, born: 1, sworn: true, fate: 'sworn', swornAt: 5, companion: { state: 'with', loyalty: 90 }, history: [] });
    localStorage.setItem('dagger.revenant.probe-char', JSON.stringify({ v: 1, lastDay: 3, list: [rec('w1', 262), rec('b1', 4)] }));
    C.setRetinuePlayer(player); R.revenantsFor(player);
  });
  await useFixture('beastPost0');
  assert.ok(await page.evaluate(() => !!window.probe.asked), 'The post asks before it takes a beast');
  assert.equal(await page.evaluate(() => window.probe.garden.stations?.length ?? 0), 0, 'Asking stations nothing');
  await page.evaluate(() => { window.probe.asked.input('KeyY'); window.probe.asked = null; });
  await page.waitForFunction(() => window.probe.garden.stations?.length === 1);
  const stationed = await page.evaluate(() => { const p = window.probe; return { rec: p.sworn.R.revenantRecord(p.sworn.player, 'w1').companion, entry: p.garden.stations[0], with: p.sworn.C.revenantsWithYou().length, notice: document.querySelector('.farm-message')?.textContent }; });
  assert.equal(stationed.rec.state, 'station'); assert.equal(stationed.rec.station.mapId, 42); assert.equal(stationed.entry.kind, 262); assert.equal(stationed.with, 1, 'a station frees a companion slot');
  await page.evaluate(() => { for (let i = 0; i < 10; i++) window.probe.render(); });
  assert.equal(await page.evaluate(() => window.probe.glError), 0, 'the stationed beast draws without a GL error');
  const label = await page.evaluate(() => { const p = window.probe, f = p.fixture('beastPost0'); p.walkTo('beastPost0'); const at = p.fixturePoint('beastPost0'); return { at, stations: p.mode.inspect().stationEntries.length, f: !!f }; });
  assert.equal(label.stations, 1);
  await useFixture('beastPost0');
  assert.ok(await page.evaluate(() => !!window.probe.asked), 'Clicking it at its post asks to call it back');
  await page.evaluate(() => { window.probe.asked.input('KeyY'); window.probe.asked = null; });
  await page.waitForFunction(() => !window.probe.garden.stations?.length);
  assert.equal(await page.evaluate(() => { const p = window.probe; return p.sworn.R.revenantRecord(p.sworn.player, 'w1').companion.state; }), 'with', 'called back, it walks at my heel again');
  // the ploughing game: a stationed grizzly and Careful work make the hoe on wild ground a row-ploughing game
  await page.evaluate(() => { const p = window.probe, g = p.garden; g.stations = [{ player: 'tester', character: 'char1', revenantId: 'b1', kind: 4, name: 'Bruin the Scarred', rank: 3, art: null, post: 1, since: 1 }]; g.stationDay = Math.floor(p.now / 86400); p.version++; });
  await page.waitForTimeout(1100); await page.evaluate(() => window.probe.render());
  await page.evaluate(() => { const p = window.probe; p.feet = [(9 % 4 + .5) * 2 - 1.6, 0, (Math.floor(9 / 4) + .5) * 2]; for (let i = 0; i < 30; i++) p.render(); });
  await page.keyboard.press('f'); await page.keyboard.press('1'); await page.evaluate(() => window.probe.render());
  assert.equal(await page.locator('.farm-careful').getAttribute('aria-pressed'), 'true');
  await clickBed(9);
  assert.equal(await page.locator('.farm-game[data-kind=plough]').count(), 1, 'The ploughing game appears over the bed');
  for (let k = 0; k < 40; k++) { await page.keyboard.down(k % 2 ? 'a' : 'd'); await page.waitForTimeout(150); await page.keyboard.up(k % 2 ? 'a' : 'd'); await page.evaluate(() => window.probe.render()); }
  await page.waitForFunction(() => { window.probe.render(); return !document.querySelector('.farm-game'); }, null, { timeout: 15000 });
  await page.waitForFunction(() => window.probe.garden.beds[9] === null || window.probe.garden.beds[9]?.crop === null, null, { timeout: 5000 });
  const ploughReq = await page.evaluate(() => window.probe.requests.filter((r) => r.op === 'plough').at(-1));
  assert.ok(ploughReq && ploughReq.beds.includes(9) && ploughReq.game.kind === 'plough' && ploughReq.game.ms >= 6000, 'The play rides the ploughing: ' + JSON.stringify(ploughReq));
  assert.ok(await page.evaluate(() => Object.values(window.probe.garden.beds).filter((b) => b && b.crop === null && b.care >= 1).length) >= 1, 'The plough turned wild beds with care');
  await page.keyboard.press('f');
  for (const width of [360,736]) {
    await page.setViewportSize({width,height:800}); await page.evaluate(() => window.probe.render());
    assert.ok(await page.getByRole('button', { name: '1 · Hoe', exact: true }).isVisible());
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.farming-hud footer button')].every(b=>{ const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth; })));
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
  console.log('PASS: real WebGL soil/crop rendering, the farmyard drawn and used (seed sacks, ledger, wagon, tool rack, order post, sacks carried to the wagon, the sowing game with Careful work, sworn beasts stationed at the beast posts and called back, the ploughing game), screen-to-bed picking, hoe/plant/water, range gate, tools, orbit, responsive belt and camera/body cleanup.');
} finally { await browser?.close(); await server.close(); }
