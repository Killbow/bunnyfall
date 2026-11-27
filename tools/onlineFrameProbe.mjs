// Measures the online game's frame in headless Chromium against a local relay and account service with a bot crowd.
// Usage: ARENA2_PATH=<dir> node tools/onlineFrameProbe.mjs. Other settings come from environment variables.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { probeTransforms, editsPlugin, waitFrames, settle, measure, measured, summaryLine, CENSUS, SWIFTSHADER_ARGS } from './frameProbe.mjs';
import { isMain } from './lib/isMain.mjs';
import { standServices, stopAll, makeBot, setUp, localFetch, localWebSocket, relayTally, botStorage, LOAD_SERVICE } from './loadHarness.mjs';
import { OnlineSession } from '../src/net/online.js';
import { SESSION_KEY, SERVICE_KEY } from '../src/net/accountClient.js';
import { realmIo, realmCreate, createRealmSession } from '../src/saves/realmSaves.js';
import { worldRoom, CHAT_WORLD_ROOM, PIXEL_UNITS } from '../src/net/wire.js';
import { PIXEL_M } from '../src/net/gateLaw.js';
import { ACCEPTED } from '../src/net/legalLaw.js';

const ROOT = process.env.TREE || fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 5241);
const SVC_PORT = Number(process.env.SVC_PORT || 8870);
const W = Number(process.env.W || 480), H = Number(process.env.H || 270);
const CHAT = process.env.CHAT === '1';
const WAYS_FRAMES = Number(process.env.WAYS_FRAMES || 1500);
const UNITS_M = PIXEL_UNITS / PIXEL_M;
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
export function crowdsOf(env = process.env.PEERS) {
  const peers = (env || '0,20,60,0').split(',').map(Number);
  if (!peers.length || !peers.every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error(`PEERS is a list of crowd sizes, not ${env}`);
  const seen = new Map();
  return peers.map((n) => { const k = seen.get(n) ?? 0; seen.set(n, k + 1); return { crowd: n, name: `online${n}${k ? String.fromCharCode(97 + k) : ''}${CHAT ? 'chat' : ''}` }; });
}
let stateDir = null;
const dropState = () => { if (stateDir) { try { rmSync(stateDir, { recursive: true, force: true }); } catch { } stateDir = null; } };

export const ONLINE_PROBE_EDITS = Object.freeze([
  // The account base may be the local service, because serviceBase accepts only an https base.
  { file: 'src/net/accountClient.js', edits: [["/^https:\\/\\/\\S+$/.test(v)", "/^(https:\\/\\/\\S+|http:\\/\\/127\\.0\\.0\\.1:\\d+)$/.test(v)"]] },
  // Online boots refuse ?shot because it installs the probe seams, which this local run needs.
  { file: 'src/platform/onlineLane.js', edits: [["export const ONLINE_REFUSED_FLAGS = Object.freeze(['shot', ", 'export const ONLINE_REFUSED_FLAGS = Object.freeze([']] },
  { file: 'src/scenes/world.js', edits: [['    window.__quickSave = (name) => modes.quickSaveNow(name);', `    window.__quickSave = (name) => modes.quickSaveNow(name);
    window.__probeSaveText = () => { let t = null; modes.quickSaveNow('probe', { quiet: true, sink: (s) => { t = JSON.stringify(s); } }); return t; };
    window.__probeOnline = () => ({ peers: online ? online.drawable().length : null, status: online ? online.status : null, ways: livingWays.size, frame: window.__frame | 0 });`]] },
]);

export const probePlugins = () => [probeTransforms(), editsPlugin('online-probe-transforms', ONLINE_PROBE_EDITS)];

const BOT_O = Object.freeze({ cells: 1, edge: 0, movers: 0.7, fighters: 0, registered: 0, setup: 8 });

function botPose(bot, at, t) {
  // The golden angle spreads the bots' spots evenly round the player.
  const a0 = bot.n * 2.399963229728653;
  const r = (4 + (bot.n % 7) * 4) * UNITS_M;
  const cx = at.x + Math.cos(a0) * r, cz = at.z + Math.sin(a0) * r;
  const a = bot.phase + (bot.mover ? t * bot.speed : 0);
  const ring = bot.mover ? 2 * UNITS_M : 0;
  return { x: cx + Math.cos(a) * ring, y: at.y, z: cz + Math.sin(a) * ring, yaw: a + Math.PI / 2, pitch: 0, mv: bot.mover ? 1 : 0 };
}

async function main() {
  const CROWDS = crowdsOf();
  const state = stateDir = mkdtempSync(join(tmpdir(), 'online-frame-probe-'));
  const restore = { warn: console.warn, info: console.info };
  let server = null, browser = null, ticker = null;
  const bots = [];
  const failed = [];
  try {
    // The page's server starts first, so a port already in use fails before the services start.
    server = await createServer({ root: ROOT, configFile: `${ROOT}/vite.config.js`, plugins: probePlugins(), server: { port: PORT, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
    await server.listen();
    const svc = await standServices({ port: SVC_PORT }, state);
    const runTag = Math.random().toString(36).slice(2, 6);
    const io0 = { fetch: localFetch({ port: svc.accountPort, ip: '10.9.9.9' }), base: LOAD_SERVICE };

    console.log('== the player: a guest, and a realm character');
    const made = await io0.fetch(`${LOAD_SERVICE}/v1/auth/guest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'probe', ...ACCEPTED }),
    }).then((r) => r.json());
    if (!made?.secret) throw new Error(`no guest for the player (${JSON.stringify(made)})`);
    const playerStorage = botStorage({ [SESSION_KEY]: JSON.stringify({ secret: made.secret, id: made.id, name: made.name }), [SERVICE_KEY]: LOAD_SERVICE });
    const pio = realmIo({ fetch: io0.fetch, storage: playerStorage });
    browser = await chromium.launch({ args: SWIFTSHADER_ARGS });

    let saveText = process.env.SAVE && existsSync(process.env.SAVE) ? readFileSync(process.env.SAVE, 'utf8') : null;
    if (saveText) console.log(`== the first save: ${process.env.SAVE}`);
    else {
      console.log('== the first save: an offline boot at Knightstale, composed by the world host');
      const ctx = await browser.newContext({ viewport: { width: W, height: H } });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/play/?world&region=Wayrest&loc=Knightstale&class=1&novideo&shot&play&tod=15:00`);
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 1200000, polling: 500 });
      await waitFrames(page, 3);
      saveText = await page.evaluate(() => window.__probeSaveText());
      await ctx.close();
      if (saveText && process.env.SAVE) writeFileSync(process.env.SAVE, saveText);
    }
    if (!saveText) throw new Error('the world host composed no save');
    const c = await realmCreate(pio, made.name || 'Probe', null);
    if (!c.ok) throw new Error(`no realm character (${c.error})`);
    const rs = createRealmSession({ io: pio, id: c.data.id, lease: c.data.lease, seq: c.data.seq ?? 0, gzip: c.data.gzip === true, hidden: () => false, watchHidden: () => {} });
    const first = await rs.checkpoint(saveText);
    if (!first?.ok) throw new Error(`the first save did not land (${first?.error})`);
    console.log(`   realm ${c.data.id}, ${(saveText.length / 1024).toFixed(0)} KB of save`);

    console.log('== the online boot');
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript(({ sk, sv, sess, base }) => {
      try { localStorage.setItem(sk, sess); localStorage.setItem(sv, base); } catch { }
    }, { sk: SESSION_KEY, sv: SERVICE_KEY, sess: JSON.stringify({ secret: made.secret, id: made.id, name: made.name }), base: `http://127.0.0.1:${svc.accountPort}` });
    await ctx.addInitScript(CENSUS);
    const page = await ctx.newPage();
    const bootErrors = [];
    let errors = bootErrors;
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (/\[(realm|online|account|chat)\]/.test(m.text())) console.log(`   page ${m.type()}: ${m.text().slice(0, 240)}`); });
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_CERT|WebSocket/.test(m.text())) errors.push(m.text().slice(0, 300)); });
    const url = `/play/?world&online&realm=${c.data.id}&load&server=ws://127.0.0.1:${svc.relayPort}&novideo&shot&play&fps&tod=15:00`;
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}${url}`);
    for (let i = 0; !(await page.evaluate(() => window.__shotReady === true)); i++) {
      if (i >= 40) throw new Error('the online boot never readied in 20 minutes');
      await sleep(30000);
      const at = await page.evaluate(() => ({ href: location.href.replace(/^.*\/play\//, ''), text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 160), frame: window.__frame | 0 })).catch((e) => ({ error: e.message }));
      console.log(`   booting (${(i + 1) * 30}s): ${JSON.stringify(at)}`);
    }
    const bootS = (Date.now() - t0) / 1000;
    const probe = () => page.evaluate(() => (window.__probeOnline ? window.__probeOnline() : null)).catch((e) => ({ error: e.message }));
    console.log(`   ready after ${bootS.toFixed(0)}s: ${JSON.stringify(await probe())}`);
    if (bootErrors.length) { console.log(`   the boot's errors: ${bootErrors.slice(0, 5).join(' | ')}`); failed.push(`the boot (${bootErrors[0]})`); }
    const [px, py] = (await page.evaluate(() => window.__currentPixel())).split(',').map(Number);
    const cell = worldRoom(px, py);
    await settle(page);
    let ways = -1, still = 0, waysFrames = 0;
    for (; waysFrames < WAYS_FRAMES && still < 3; waysFrames += 10) {
      await waitFrames(page, 10);
      const w = (await probe())?.ways ?? -2;
      if (w === ways) still++; else still = 0;
      ways = w;
    }
    console.log(`   settled: ${JSON.stringify(await probe())}${still < 3 ? ` - the way book still growing after ${WAYS_FRAMES} frames` : ''}`);
    if (CHAT) await page.keyboard.press('Enter').catch(() => {});

    const most = Math.max(...CROWDS.map((c) => c.crowd));
    const fleetCtx = { svc: { accountPort: svc.accountPort }, runTag, account: { byRoute: new Map(), at: [] } };
    for (let n = 0; n < most; n++) bots.push(makeBot(n, BOT_O, fleetCtx));
    console.log(`== setting up ${most} bots`);
    for (let i = 0; i < bots.length; i += BOT_O.setup) await Promise.all(bots.slice(i, i + BOT_O.setup).map((b) => setUp(b, BOT_O)));
    const tally = relayTally();
    const WS = localWebSocket({ port: svc.relayPort, tally });
    const relayUrl = `ws://127.0.0.1:${svc.relayPort}`;
    const botIds = new Set(bots.map((b) => b.id));
    let at = null;
    const tStart = Date.now();
    const connect = (bot) => {
      const presence = new OnlineSession({ url: relayUrl, name: bot.account.name, look: { race: 'Nord', gender: 'male', faceIndex: 0, items: [] }, id: bot.id, secret: bot.secret, mintToken: bot.minter, WebSocketImpl: WS });
      presence.join(cell, at ? botPose(bot, at, 0) : null);
      const hub = new OnlineSession({ url: relayUrl, name: bot.account.name, look: null, id: bot.id, secret: bot.secret, presence: false, mintToken: bot.minter, WebSocketImpl: WS });
      hub.join(CHAT_WORLD_ROOM);
      hub.acct = bot.acct; hub.asecret = bot.asecret; hub.claim = true;
      bot.presence = presence;
      bot.sessions = [presence, hub];
    };
    const sendAway = (bot) => { for (const s of bot.sessions ?? []) { try { s.leave(); } catch { } } bot.presence = null; bot.sessions = null; };
    console.warn = () => {}; console.info = () => {};
    ticker = setInterval(() => {
      const t = (Date.now() - tStart) / 1000;
      for (const b of bots) {
        if (!b.presence) continue;
        if (at) b.presence.sendPose(botPose(b, at, t));
        for (const s of b.sessions) s.tick();
      }
    }, 50);
    ticker.unref?.();

    let joined = 0;
    for (const { crowd, name } of CROWDS) {
      while (joined > crowd) sendAway(bots[--joined]);
      while (joined < crowd) {
        connect(bots[joined]);
        joined += 1;
        if (!at) {
          for (let i = 0; i < 600 && !at; i++) {
            await sleep(100);
            const peer = [...bots[0].presence.peers.values()].find((p) => !botIds.has(p.id) && p.pose);
            if (peer) at = { x: peer.pose.x, y: peer.pose.y, z: peer.pose.z };
          }
          if (!at) throw new Error(`the relay never told a bot of the player in ${cell}`);
        }
        await sleep(200);
      }
      let o = null;
      for (let i = 0; i < 300; i++) {
        o = await probe();
        if (o?.status === 'open' && o.peers === crowd) break;
        await sleep(500);
      }
      await waitFrames(page, 30);
      console.warn = restore.warn; console.info = restore.info;
      errors = [];
      // measure() removes the census wrappers after its window, so each crowd wraps the page again.
      await page.evaluate(`window.__censusOff?.(); ${CENSUS}`);
      const r = await measure(ctx, page, { name, url, bootS, errors, extra: () => probe() });
      const ready = o?.status === 'open' && o.peers === crowd;
      console.log(`== ${name}: ${summaryLine(r)}, peers ${r.extra?.peers ?? '?'} of ${crowd} (${r.extra?.status ?? '?'}), ways ${r.extra?.ways ?? '?'}`);
      if (!measured(r)) failed.push(`${name} (${r.errors[0] ?? 'an empty window'})`);
      if (!ready) failed.push(`${name} (${o?.peers ?? 'no'} peers of ${crowd} drawn, the session ${o?.status ?? o?.error ?? 'unread'})`);
      console.warn = () => {}; console.info = () => {};
    }
    await ctx.close();
  } finally {
    console.warn = restore.warn; console.info = restore.info;
    if (ticker) clearInterval(ticker);
    for (const b of bots) for (const s of b.sessions ?? []) { try { s.leave(); } catch { } }
    try { await browser?.close(); } catch { }
    try { await server?.close(); } catch { }
    try { stopAll(); } finally { dropState(); }
  }
  if (failed.length) throw new Error(`onlineFrameProbe: no measurement for ${failed.join('; ')}`);
}

if (isMain(import.meta.url)) {
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(sig, () => { try { stopAll(); } finally { dropState(); process.exit(code); } });
  main().then(() => process.exit(0), (e) => { console.error(`\nthe online probe failed: ${e?.stack ?? e}`); try { stopAll(); } finally { dropState(); process.exit(1); } });
}
