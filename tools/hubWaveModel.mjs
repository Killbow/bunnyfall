// Models the hub's reconnect wave: busy refusals, welcome times, and token mints when a relay drop hits N players.
// Run: node tools/hubWaveModel.mjs (env N, SEEDS, SPREAD=1, RATE, and ARRIVE_S adjust the model).
import { tokenGate, CHAT_HELLO_HZ_MAX } from '../src/net/wire.js';
import { BACKOFF_MIN_MS, BACKOFF_MAX_MS } from '../src/net/online.js';
import { waveSpreadMs } from '../src/net/reconnectWave.js';
import { isMain } from './lib/isMain.mjs';

const PLAYERS = (process.env.N || '500,1000,2000').split(',').map(Number);
const SEEDS = Number(process.env.SEEDS || 20);
const SPREAD = process.env.SPREAD === '1';
const RATE = Number(process.env.RATE || CHAT_HELLO_HZ_MAX);
const ARRIVE_S = Number(process.env.ARRIVE_S || 0);

function roll(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function wave(n, seed, { spread = false, rate = CHAT_HELLO_HZ_MAX, arriveS = 0 } = {}) {
  const rand = roll(seed);
  const at = [], backoff = [];
  const window = spread ? waveSpreadMs(n) : 0;
  for (let i = 0; i < n; i++) {
    const retry = arriveS > 0 ? rand() * arriveS * 1000 : BACKOFF_MIN_MS + rand() * BACKOFF_MIN_MS;
    at.push(window ? Math.max(retry, rand() * window) : retry);
    backoff.push(Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2));
  }
  const mintsBySecond = new Map();
  for (const t of at) { const s = Math.floor(t / 1000); mintsBySecond.set(s, (mintsBySecond.get(s) ?? 0) + 1); }
  const mintPeak = Math.max(...mintsBySecond.values());
  let bucket = null, refused = 0;
  const welcomed = [];
  const queue = at.map((t, i) => [t, i]);
  while (queue.length) {
    queue.sort((x, y) => x[0] - y[0]);
    const [t, i] = queue.shift();
    const gate = tokenGate(bucket, t, rate);
    bucket = gate.bucket;
    if (gate.pass) { welcomed.push(t); continue; }
    refused++;
    backoff[i] = Math.max(backoff[i], BACKOFF_MAX_MS / 2);
    const span = Math.max(BACKOFF_MIN_MS, backoff[i] - BACKOFF_MIN_MS);
    queue.push([t + BACKOFF_MIN_MS + rand() * span, i]);
    backoff[i] = Math.min(BACKOFF_MAX_MS, backoff[i] * 2);
  }
  welcomed.sort((x, y) => x - y);
  return { refused, median: welcomed[Math.floor(n / 2)], p90: welcomed[Math.floor(n * 0.9)], last: welcomed[n - 1], mintPeak };
}

const mid = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
if (isMain(import.meta.url)) {
  process.stdout.write(`${SPREAD ? '(each page waits its slot in the spread - SCALE2c)' : ARRIVE_S > 0 ? `(each player arrives within ${ARRIVE_S} s - GATE-DOOR)` : '(every page retries at once)'}, the door ${RATE} a second\n`);
  process.stdout.write('players   busy refusals (min / median / mean / max of seeds)   welcomed, s (median / p90 / last, median seed)   mints in the busiest second\n');
  for (const n of PLAYERS) {
    const runs = Array.from({ length: SEEDS }, (_, s) => wave(n, s + 1, { spread: SPREAD, rate: RATE, arriveS: ARRIVE_S }));
    const r = runs.map((x) => x.refused).sort((a, b) => a - b);
    const mean = (r.reduce((a, b) => a + b, 0) / r.length).toFixed(1);
    const s = (k) => (mid(runs.map((x) => x[k])) / 1000).toFixed(1);
    process.stdout.write(`${String(n).padStart(7)}   ${`${r[0]} / ${mid(r)} / ${mean} / ${r[r.length - 1]}`.padStart(47)}   ${`${s('median')} / ${s('p90')} / ${s('last')}`.padStart(35)}   ${String(mid(runs.map((x) => x.mintPeak))).padStart(27)}\n`);
  }
}
