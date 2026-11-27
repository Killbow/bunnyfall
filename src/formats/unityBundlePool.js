
let _nextBid = 1;

function defaultWorkerFactory() {
  return new Worker(new URL('./unityBundleWorker.js', import.meta.url), { type: 'module' });
}

/**
 * @param {{ size?: number, workerFactory?: () => Worker }} [opts]
 * @returns {{ open(src: Blob|Uint8Array, o?: object): Promise<{ rgba(name: string, o?: object): Promise<object|null>, close(): void }>, busy(): number, close(): void }}
 */
export function createBundlePool({ size = 2, workerFactory = defaultWorkerFactory } = {}) {
  const lanes = [];
  let nextId = 1;
  const laneOf = (i) => {
    if (!lanes[i]) {
      const lane = { w: null, dead: null, pending: new Map(), queue: [], inFlight: 0 };
      try {
        lane.w = workerFactory();
        lane.w.onerror = (e) => kill(lane, e?.message ?? 'bundle worker failed');
        lane.w.onmessage = (ev) => {
          const m = ev.data ?? {};
          const p = lane.pending.get(m.id);
          if (!p) return;
          lane.pending.delete(m.id);
          if (p.decode) lane.inFlight--;
          if (m.t === 'error') p.reject(new Error(m.message)); else p.resolve(m);
          pump(lane);
        };
      } catch (e) { lane.dead = e; }
      lanes[i] = lane;
    }
    return lanes[i];
  };
  const kill = (lane, why) => {
    if (lane.dead) return;
    lane.dead = new Error(why);
    for (const p of lane.pending.values()) p.reject(lane.dead);
    lane.pending.clear();
    for (const q of lane.queue) q.resolve(null);
    lane.queue = [];
    try { lane.w?.terminate?.(); } catch { }
  };
  const send = (lane, msg, transfer = [], decode = false) => new Promise((resolve, reject) => {
    if (lane.dead) { reject(lane.dead); return; }
    const id = nextId++;
    lane.pending.set(id, { resolve, reject, decode });
    if (decode) lane.inFlight++;
    try { lane.w.postMessage({ ...msg, id }, transfer); } catch (e) { lane.pending.delete(id); if (decode) lane.inFlight--; reject(e); }
  });
  const pump = (lane) => {
    while (!lane.dead && lane.inFlight === 0 && lane.queue.length) {
      const q = lane.queue.shift();
      if (q.deadline && Date.now() > q.deadline) { q.resolve(null); continue; }
      send(lane, q.msg, [], true).then((m) => q.resolve(q.msg.t === 'layers' ? (m.images ?? null) : (m.image ?? null)), () => q.resolve(null));
    }
  };
  const live = () => { const out = []; for (let i = 0; i < Math.max(1, size); i++) { const l = laneOf(i); if (!l.dead) out.push(l); } return out; };

  return {
    async open(src, { maxTextureSize = Infinity, knownTextures = null } = {}) {
      const bid = _nextBid++;
      const isBlob = typeof Blob !== 'undefined' && src instanceof Blob;
      const ls = live();
      if (!ls.length) throw new Error('no bundle worker could start');
      const results = await Promise.allSettled(ls.map((lane) => send(lane, isBlob
        ? { t: 'open', bid, blob: src, maxTextureSize, knownTextures, quiet: true }
        : { t: 'open', bid, bytes: src.slice(), maxTextureSize, knownTextures, quiet: true })));
      const held = ls.filter((_, i) => results[i].status === 'fulfilled');
      if (!held.length) throw results[0].reason;
      return {
        onThread: false,
        rgba(name, { maxSize, deadline = 0 } = {}) {
          const ready = held.filter((l) => !l.dead);
          if (!ready.length) return Promise.resolve(null);
          const lane = ready.reduce((a, b) => (a.queue.length + a.inFlight <= b.queue.length + b.inFlight ? a : b));
          return new Promise((resolve) => {
            lane.queue.push({ msg: { t: 'rgba', bid, name, maxSize }, deadline, resolve });
            pump(lane);
          });
        },
        layers(name) {
          const ready = held.filter((l) => !l.dead);
          if (!ready.length) return Promise.resolve(null);
          const lane = ready.reduce((a, b) => (a.queue.length + a.inFlight <= b.queue.length + b.inFlight ? a : b));
          return new Promise((resolve) => { lane.queue.push({ msg: { t: 'layers', bid, name }, deadline: 0, resolve }); pump(lane); });
        },
        close() { for (const l of held) { if (!l.dead) try { l.w.postMessage({ t: 'close', bid }); } catch { } } },
      };
    },
    busy: () => lanes.reduce((n, l) => n + (l ? l.queue.length + l.inFlight : 0), 0),
    close() { for (const l of lanes) if (l) kill(l, 'bundle pool closed'); lanes.length = 0; },
  };
}
