// Benchmarks the chat hub's hello wave, chat line, and drain at N sockets on the real Room and test/fakeRoom.mjs.
// Run: node tools/relayHubBench.mjs (N=250,500; ROOT=<worktree> for an A/B base; COPY=1 to copy each frame).
// CPU numbers are relative only: run the base and the change alternately with nothing else running.

import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(process.env.ROOT || fileURLToPath(new URL('..', import.meta.url)));
const { fakeRoom } = await import(pathToFileURL(join(ROOT, 'test/fakeRoom.mjs')).href);
const { CHAT_HELLO_HZ_MAX, CHAT_ROOM_HZ_MAX, SOCIAL_ROOM } = await import(pathToFileURL(join(ROOT, 'src/net/wire.js')).href);

const CROWDS = (process.env.N || '500,1000,2000').split(',').map(Number);
const COPY = process.env.COPY === '1';
let sink = 0;
const print = (...a) => process.stdout.write(`${a.join(' ')}\n`);
console.info = () => {}; console.warn = () => {}; console.log = () => {};

async function hub(n) {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const R = fakeRoom(SOCIAL_ROOM, { now: () => clock });
    const socks = [];
    let sent = 0, bytes = 0;
    const counting = (ws) => { ws.send = (s) => { sent++; bytes += s.length; ws.max = Math.max(ws.max || 0, s.length); if (COPY) sink += Buffer.from(s).length & 1; }; };
    const pad = (i) => String(i).padStart(5, '0');
    // Tokens are minted first so the wave measures the room, not the signer.
    const toks = [];
    for (let i = 0; i < n; i++) toks.push(await R.token(`peer-${pad(i)}`, { s: `acct-${pad(i)}`, n: `Player${i}` }));
    const hellos = [];
    let welcome = 0;
    for (let i = 0; i < n; i++) {
      const ws = R.connect();
      counting(ws);
      clock += Math.ceil(1000 / CHAT_HELLO_HZ_MAX) + 1;
      const frame = { t: 'hello', id: `peer-${pad(i)}`, secret: `secret-${i}`, name: `Player${i}`, look: R.look, pose: null, tok: toks[i], acct: `acct-${pad(i)}`, ps: 1, asecret: `asecret-of-${pad(i)}` };
      const t0 = performance.now();
      await R.room.webSocketMessage(ws, JSON.stringify(frame));
      hellos.push((performance.now() - t0) * 1000);
      if (ws.closed) throw new Error(`bench: hello ${i} refused (${JSON.stringify(ws.closed)})`);
      welcome = Math.max(welcome, ws.max || 0);
      socks.push(ws);
    }
    const wave = { ms: hellos.reduce((a, b) => a + b, 0) / 1000, median: [...hellos].sort((a, b) => a - b)[Math.floor(n / 2)], sent, bytes };
    sent = 0;
    const LINES = 200;
    const tc = performance.now();
    for (let k = 0; k < LINES; k++) {
      clock += Math.ceil(1000 / CHAT_ROOM_HZ_MAX) + 1;
      await R.room.webSocketMessage(socks[(k * 7919) % n], JSON.stringify({ t: 'chat', text: `hello world ${k}` }));
    }
    const chat = { us: ((performance.now() - tc) * 1000) / LINES, sent: sent / LINES };
    const td = performance.now();
    while (socks.length) { const ws = socks.pop(); const j = R.sockets.indexOf(ws); if (j >= 0) R.sockets.splice(j, 1); clock += 5; await R.room.webSocketClose(ws, 1005, ''); }
    return { n, wave, welcome, chat, drainMs: performance.now() - td };
  } finally { Date.now = realNow; }
}

// A warm-up hub keeps compiler warm-up out of the first measured hub.
await hub(300);
print(COPY ? '(every send copies its frame)' : '(sends are counted, never copied)');
print('  hub   wave ms   hello us (median)   welcome KB   wave frames   wave MB   chat us/line   chat frames   drain ms');
for (const n of CROWDS) {
  const r = await hub(n);
  print([String(r.n).padStart(5), r.wave.ms.toFixed(0).padStart(9), r.wave.median.toFixed(0).padStart(19), (r.welcome / 1024).toFixed(1).padStart(12), String(r.wave.sent).padStart(13), (r.wave.bytes / 1048576).toFixed(1).padStart(9), r.chat.us.toFixed(0).padStart(14), r.chat.sent.toFixed(0).padStart(13), r.drainMs.toFixed(0).padStart(10)].join(' '));
}
// Reading the sum keeps the copies from being optimized away.
if (sink < 0) print(sink);
