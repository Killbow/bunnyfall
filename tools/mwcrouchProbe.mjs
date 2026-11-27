// Browser probe at a slow frame rate: a crouch tap delivered between two frames must still toggle the stance.
// Usage: node tools/mwcrouchProbe.mjs  (CHROMIUM=<path> picks another browser)
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PAGE_NAME = 'mwcrouch-probe.tmp.html';
const PAGE_REL = `tools/${PAGE_NAME}`;
const PAGE_PATH = join(ROOT, PAGE_REL);

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>MWCROUCH probe</title></head>
<body><script type="module">
import { held, keyEdges, noteKeyDown, noteKeyUp, beginInputFrame, pressed, released, setBindings } from '/src/ui/input.js';
import { createBindings, resetDefaults } from '/src/ui/inputActions.js';
import { Collider } from '/src/player/collider.js';
import { PlayerMotor } from '/src/player/motor.js';

const store = createBindings();
resetDefaults(store);
setBindings(store);

// A room with a floor and a ceiling four metres up: CanStand is clear, so
// anything that keeps the player crouched is the INPUT and not the motor.
function room() {
  const c = new Collider(() => -Infinity);
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const y of [0, 4]) {
    c.addMesh('m' + y,
      new Float32Array([-10, y, -10, 10, y, -10, 10, y, 10, -10, y, 10]),
      new Uint16Array([0, 1, 2, 0, 2, 3]), I);
  }
  return c;
}

// THE HOST'S OWN LISTENERS, written the way scenes/world.js writes them:
// the Set fed first, the edge noted beside it, the release unconditional.
const keys = new Set();
const edge = keyEdges();
addEventListener('keydown', (e) => { keys.add(e.code); noteKeyDown(edge, e.code, e.repeat); });
addEventListener('keyup', (e) => { keys.delete(e.code); noteKeyUp(edge, e.code); });

let frameMs = 110;        // the loaded scene's frame, forced below
let running = false;
let frames = 0;
let prevCrouch = false;   // the OLD derivation's latch, verbatim
let edgePresses = 0, latchPresses = 0, releases = 0, repeats = 0;
let firstAt = 0, lastAt = 0;
let motorEdge = null, motorLatch = null;
const bag = (crouch) => ({ forward: 0, strafe: 0, run: false, autoRun: false, back: false, sneak: false, jump: false, up: false, down: false, crouch });

function reset(ms) {
  frameMs = ms ?? frameMs;
  frames = 0; edgePresses = 0; latchPresses = 0; releases = 0; repeats = 0; firstAt = 0; lastAt = 0;
  prevCrouch = false;
  keys.clear();
  beginInputFrame(edge); beginInputFrame(edge);
  motorEdge = new PlayerMotor(room()); motorEdge.spawn(0, 0, 0);
  motorLatch = new PlayerMotor(room()); motorLatch.spawn(0, 0, 0);
}

function frame() {
  if (!running) return;
  // ONE rotation, at the head of the frame, as every host does it.
  beginInputFrame(edge);
  const crouchHeld = held(keys, 'Crouch');
  const edgePress = pressed(edge, keys, 'Crouch');
  const latchPress = crouchHeld && !prevCrouch;
  if (edgePress) edgePresses++;
  if (latchPress) latchPresses++;
  if (released(edge, keys, 'Crouch')) releases++;
  const dt = frameMs / 1000;
  motorEdge.update(dt, bag(edgePress), 0, 0);
  motorLatch.update(dt, bag(latchPress), 0, 0);
  prevCrouch = crouchHeld;
  frames++;
  if (!firstAt) firstAt = performance.now();
  lastAt = performance.now();
  // BURN the frame. This is the Morrowind body's cost standing in for
  // itself: the loop must not come back for frameMs, so the browser
  // delivers every event of a tap between two callbacks.
  const until = performance.now() + frameMs;
  while (performance.now() < until) { /* the long frame */ }
  requestAnimationFrame(frame);
}

window.__mw = {
  start(ms) { reset(ms); running = true; requestAnimationFrame(frame); },
  stop() { running = false; },
  reset,
  read: () => ({
    frames, edgePresses, latchPresses, releases, repeats,
    meanFrameMs: frames > 1 ? Math.round((lastAt - firstAt) / (frames - 1)) : null,
    crouchedByEdge: !!motorEdge?.crouching,
    crouchedByLatch: !!motorLatch?.crouching,
    heightByEdge: motorEdge?.height ?? null,
  }),
};
reset(110);
document.title = 'ready';
<\/script></body></html>`;

const vite = await createServer({ root: ROOT, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const port = vite.httpServer.address().port;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const fails = [];
const ok = (cond, what, got) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${what}${got !== undefined ? `   (${JSON.stringify(got)})` : ''}`); if (!cond) fails.push(what); };

try {
  await writeFile(PAGE_PATH, PAGE);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/tools/${PAGE_NAME}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__mw, null, { timeout: 30000 });
  // Keydown and keyup go out back to back over CDP, because keyboard.press waits on the busy frame.
  const cdp = await page.context().newCDPSession(page);
  const KEY = { code: 'KeyC', key: 'c', text: 'c', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67 };
  const tap = async () => {
    const down = cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...KEY });
    const up = cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...KEY });
    await Promise.all([down, up]);
  };
  const read = () => page.evaluate(() => window.__mw.read());
  const start = (ms) => page.evaluate((x) => window.__mw.start(x), ms);
  const stop = () => page.evaluate(() => window.__mw.stop());

  console.log('1. three taps of C at ~9 fps - the old derivation misses them, the ring does not');
  await start(110);
  for (let i = 0; i < 3; i++) { await tap(); await page.waitForTimeout(260); }
  await page.waitForTimeout(400);
  let r = await read();
  await stop();
  ok(r.meanFrameMs >= 90, 'the loop really ran at the slowed rate', { frames: r.frames, meanFrameMs: r.meanFrameMs });
  ok(r.edgePresses === 3, 'GetKeyDown saw every tap', r.edgePresses);
  ok(r.releases === 3, 'and GetKeyUp saw every release', r.releases);
  ok(r.latchPresses < 3, 'THE BUG: the held-ring derivation missed taps the browser delivered whole', r.latchPresses);
  ok(r.crouchedByEdge === true, 'three taps off the ring end CROUCHED - crouch, stand, crouch', r.crouchedByEdge);
  ok(r.crouchedByLatch !== r.crouchedByEdge,
    'and the old reader ended in the WRONG stance, which is the report', { latch: r.crouchedByLatch, edge: r.crouchedByEdge });

  console.log('\n2. crouch, then UNCROUCH - one tap each, at the same frame rate');
  await start(110);
  await tap();
  await page.waitForTimeout(400);
  r = await read();
  ok(r.crouchedByEdge === true, 'the first tap crouched', r.crouchedByEdge);
  ok(Math.abs(r.heightByEdge - 0.9) < 1e-6, 'and the capsule really is the crouched one', r.heightByEdge);
  await tap();
  await page.waitForTimeout(400);
  r = await read();
  await stop();
  ok(r.crouchedByEdge === false, 'AND THE SECOND STOOD BACK UP', r.crouchedByEdge);
  ok(Math.abs(r.heightByEdge - 1.8) < 1e-6, 'the standing capsule is back', r.heightByEdge);

  console.log('\n3. C held down through the OS repeat storm - ONE press, one stance');
  await start(110);
  await page.keyboard.down('c');
  await page.waitForTimeout(1400);
  await page.keyboard.up('c');
  await page.waitForTimeout(300);
  r = await read();
  await stop();
  ok(r.edgePresses === 1, 'a held key is ONE GetKeyDown however many keydowns the OS sends', r.edgePresses);
  ok(r.crouchedByEdge === true, 'and the player is crouched, once', r.crouchedByEdge);

  console.log('\n4. the same taps at a normal frame rate - the two readers agree, as they always did');
  await start(0);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('c', { delay: 40 }); await page.waitForTimeout(160); }
  await page.waitForTimeout(300);
  r = await read();
  await stop();
  ok(r.edgePresses === 4 && r.latchPresses === 4, 'both saw all four - the fix changes nothing where the old reader worked', { edge: r.edgePresses, latch: r.latchPresses });
  ok(r.crouchedByEdge === r.crouchedByLatch, 'and they end in the same stance', { edge: r.crouchedByEdge, latch: r.crouchedByLatch });

  ok(errors.length === 0, 'no page errors', errors);
} finally {
  await browser.close();
  await vite.close();
  await unlink(PAGE_PATH).catch(() => {});
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
