// Probe: measures whether a browser WebSocket close() right after send() loses the payload still buffered.
// It serves a minimal RFC 6455 endpoint that counts received bytes, since this tree has no ws package.
// Run: node tools/wsDrainProbe.mjs (WS_TRIALS, PAYLOAD_KB, and CHROMIUM tune the run).
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const TRIALS = Number(process.env.WS_TRIALS ?? 10);
const PAYLOAD_KB = Number(process.env.PAYLOAD_KB ?? 256);
const PAYLOAD_BYTES = PAYLOAD_KB * 1024;

function listen() {
  const conns = [];
  const server = createServer((_req, res) => { res.writeHead(404); res.end(); });
  server.on('upgrade', (req, socket) => {
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n'
      + `Connection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const c = { bytes: 0 };
    conns.push(c);
    socket.on('data', (chunk) => { c.bytes += chunk.length; });
    socket.on('error', () => {});
  });
  return { server, conns };
}

const { server, conns } = listen();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

async function trial(mode) {
  const before = conns.length;
  const page = await browser.newPage();
  await page.setContent('<meta charset="utf-8">');
  const buffered = await page.evaluate(async ([p, m, bytes]) => {
    const ws = new WebSocket(`ws://127.0.0.1:${p}/probe`);
    const opened = await new Promise((res) => {
      ws.onopen = () => res(true); ws.onerror = () => res(false); setTimeout(() => res(false), 5000);
    });
    if (!opened) return -1;
    ws.send(JSON.stringify({ pad: 'x'.repeat(bytes) }));
    const held = ws.bufferedAmount;
    if (m === 'drained') {
      const t0 = performance.now();
      while (ws.readyState === 1 && ws.bufferedAmount > 0 && performance.now() - t0 < 500) {
        await new Promise((r) => setTimeout(r, 15));
      }
    }
    ws.close(1000, 'leaving');
    return held;
  }, [port, mode, PAYLOAD_BYTES]);
  await page.waitForTimeout(250);
  await page.close();
  const c = conns[before];
  return { buffered, arrived: (c?.bytes ?? 0) >= PAYLOAD_BYTES };
}

const rows = [];
try {
  for (const mode of ['close-now', 'drained']) {
    let arrived = 0, everBuffered = 0;
    for (let i = 0; i < TRIALS; i++) {
      const r = await trial(mode);
      if (r.arrived) arrived++;
      if (r.buffered > 0) everBuffered++;
    }
    rows.push([mode, arrived, everBuffered]);
    console.log(`  ${mode.padEnd(10)} whole payload arrived ${arrived}/${TRIALS}   (it was still buffered at the close in ${everBuffered}/${TRIALS})`);
  }
} finally {
  await browser.close();
  server.close();
}

const now = rows.find(([m]) => m === 'close-now');
console.log(`\npayload ${PAYLOAD_KB} KiB, ${TRIALS} trials each`);
console.log(now[2] === 0
  ? 'INCONCLUSIVE: nothing was ever buffered, so no close ever raced a flush - raise PAYLOAD_KB.'
  : now[1] === TRIALS
    ? 'VERDICT: close() after send() loses NOTHING. The browser flushes the send buffer before the close frame\n'
      + '         (RFC 6455 7.1.1: the close frame follows the data already queued), so a drain loop before\n'
      + '         close() buys nothing on this path.'
    : `VERDICT: close() after send() LOSES the frame (${now[1]}/${TRIALS} arrived); draining first recovers ${rows[1][1]}/${TRIALS}.`);
