// Walks the Enhanced character creation wizard to the end with the keyboard only.
// Run: ARENA2_PATH=... npx vite --port 5199 & node tools/enhancedChargenProbe.mjs.
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:5199/chargen.html', { waitUntil: 'networkidle' });
await p.waitForSelector('.prov', { timeout: 20000 });
const st = async () => JSON.parse(await p.evaluate(() => window.__chargen()));
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(45); } };
const say = async (l) => { const s = await st(); console.log(`${l.padEnd(18)} ${s.state}`); return s.state; };
await say('start');
await key('ArrowDown', 2); await key('Enter');
await say('race box');
await key('Enter');
await say('gender');
await key('ArrowDown'); await key('Enter');
await say('after gender');
const seen = [];
for (let i = 0; i < 200; i++) {
  const s = await st();
  if (s.state === 'done') break;
  if (seen[seen.length - 1] !== s.state) { seen.push(s.state); console.log('  ->', s.state); }
  // An empty name refuses to advance and the point pools gate their screens, so the walk types a name and spends
  // points with the plus key.
  if (s.state === 'name') { await p.keyboard.type('Vaerin'); await key('Enter'); continue; }
  if (s.state === 'stats' || s.state === 'skills' || s.state === 'summary') {
    await key('+', 3);
    await key('ArrowDown');
    await key('Enter');
    continue;
  }
  await key('Enter');
  if ((await st()).state === s.state) await key('ArrowDown');
}
await say('reached');
await p.screenshot({ path: '/tmp/kb-state.png' });
const state = (await st()).state;
console.log('ERRORS:', errs.length ? errs : 'none');
await b.close();
if (state !== 'done' || errs.length) process.exit(1);
