// @ts-check
// Sign-in admission line held by one Durable Object, so a mass reconnect after a relay deploy does not overload D1.
// The gate fails open: a missing binding, an error, or a slow answer lets the caller in.

export const ADMIT_ROUTES = new Set(['/v1/auth/guest', '/v1/auth/login', '/v1/auth/recover', '/v1/auth/token', '/v1/auth/session']);
export const ADMIT_RATE = 5;
export const ADMIT_BURST = 25;
export const ADMIT_KEEP_MS = 120_000;
export const ADMIT_PASS_MS = 90_000;
export const ADMIT_WAIT_MIN_MS = 1_000;
export const ADMIT_WAIT_MAX_MS = 30_000;
export const ADMIT_ASK_MS = 2_000;
const ADMIT_SWEEP_MS = 10_000;

export const admitLine = () => ({ head: 0, tail: 0, at: 0, swept: 0, places: new Map(), passes: new Map() });

/**
 * @param {ReturnType<typeof admitLine>} line
 * @param {string} key
 * @param {number} nowMs
 * @param {number} [rate]
 * @param {number} [burst]
 */
export function admitAsk(line, key, nowMs, rate = ADMIT_RATE, burst = ADMIT_BURST) {
  line.head = line.at ? line.head + Math.max(0, nowMs - line.at) * rate / 1000 : line.tail + burst;
  line.at = nowMs;
  line.head = Math.min(line.head, line.tail + burst);
  if (nowMs - line.swept >= ADMIT_SWEEP_MS) {
    line.swept = nowMs;
    for (const [k, p] of line.places) if (nowMs - p.seen > ADMIT_KEEP_MS) line.places.delete(k);
    for (const [k, until] of line.passes) if (until <= nowMs) line.passes.delete(k);
  }
  if ((line.passes.get(key) ?? 0) > nowMs) return { go: true };
  let place = line.places.get(key);
  if (!place) { place = { ticket: ++line.tail, seen: nowMs }; line.places.set(key, place); }
  place.seen = nowMs;
  if (place.ticket <= line.head) {
    line.places.delete(key);
    line.passes.set(key, nowMs + ADMIT_PASS_MS);
    return { go: true };
  }
  const position = Math.ceil(place.ticket - line.head);
  const wait = Math.round(Math.min(ADMIT_WAIT_MAX_MS, Math.max(ADMIT_WAIT_MIN_MS, position / rate * 1000)));
  return { go: false, position, wait };
}

/**
 * @param {any} v
 * @param {number} d
 */
const varOr = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

export class AdmitGate {
  /**
   * @param {any} state
   * @param {any} env
   */
  constructor(state, env) {
    this.line = admitLine();
    this.rate = varOr(env?.ADMIT_RATE, ADMIT_RATE);
    this.burst = varOr(env?.ADMIT_BURST, ADMIT_BURST);
  }

  /** @param {Request} request */
  async fetch(request) {
    let key = '';
    try { key = String((await request.json())?.key ?? ''); } catch { key = ''; }
    return new Response(JSON.stringify(admitAsk(this.line, key, Date.now(), this.rate, this.burst)), { headers: { 'content-type': 'application/json' } });
  }
}

/**
 * @param {any} env
 * @param {string} key
 */
export async function admitWait(env, key) {
  if (!env?.ADMIT) return null;
  try {
    const stub = env.ADMIT.get(env.ADMIT.idFromName('line'));
    const ask = stub.fetch('https://admit/ask', { method: 'POST', body: JSON.stringify({ key }) }).then((/** @type {any} */ res) => res.json());
    const r = await Promise.race([ask, new Promise((resolve) => globalThis.setTimeout(() => resolve(null), ADMIT_ASK_MS))]);
    if (!r || r.go !== false) return null;
    return { position: Math.max(1, Math.trunc(Number(r.position) || 1)), wait: Math.max(ADMIT_WAIT_MIN_MS, Math.trunc(Number(r.wait) || ADMIT_WAIT_MIN_MS)) };
  } catch {
    return null;
  }
}
