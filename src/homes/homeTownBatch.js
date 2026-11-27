// @ts-check
// Batches home lookups for towns that stream in at boot into one request per TOWN_BATCH_WAIT_MS.
// Each town gets the single-town route's answer shape; a server without the batch route is asked town by town.

export const TOWN_BATCH_WAIT_MS = 40;
/** Matches HOMES_TOWNS_MAX in server-account/src/homes.js. */
export const TOWN_BATCH_MAX = 40;

/**
 * @param {{ api: any, waitMs?: number, setTimer?: (fn: () => void, ms: number) => unknown }} deps
 * @returns {(id: number, as: (string|null|undefined)) => Promise<any>}
 */
export function createTownBatch({ api, waitMs = TOWN_BATCH_WAIT_MS, setTimer = (fn, ms) => setTimeout(fn, ms) }) {
  /** @type {Array<{ id: number, as: (string|null|undefined), done: (r: any) => void }>} */
  let queue = [];
  let timer = /** @type {unknown} */ (null);
  let off = !api?.towns;
  const single = (/** @type {number} */ id, /** @type {any} */ as) => Promise.resolve().then(() => api.town(id, as));

  async function send(/** @type {typeof queue} */ group, /** @type {any} */ as) {
    const ids = [...new Set(group.map((g) => g.id))];
    if (off || ids.length < 2) { for (const g of group) single(g.id, as).then(g.done, () => g.done({ ok: false, error: 'offline' })); return; }
    /** @type {any} */
    let r;
    try { r = await api.towns(ids, as); } catch { r = { ok: false, error: 'offline' }; }
    const list = r?.ok && Array.isArray(r.data?.towns) ? r.data.towns : null;
    if (!list) {
      if (r?.error === 'not-found' || r?.error === 'method') { off = true; for (const g of group) single(g.id, as).then(g.done, () => g.done({ ok: false, error: 'offline' })); return; }
      for (const g of group) g.done(r?.ok ? { ok: false, error: 'server' } : r);
      return;
    }
    const byId = new Map(list.map((/** @type {any} */ t) => [t?.mapId, t]));
    for (const g of group) {
      const t = byId.get(g.id);
      if (t) g.done({ ok: true, data: t }); else single(g.id, as).then(g.done, () => g.done({ ok: false, error: 'offline' }));
    }
  }

  function flush() {
    const all = queue;
    queue = [];
    timer = null;
    /** @type {Map<any, typeof queue>} */
    const groups = new Map();
    for (const g of all) { const k = g.as ?? null; if (!groups.has(k)) groups.set(k, []); /** @type {any} */ (groups.get(k)).push(g); }
    for (const [as, group] of groups) {
      for (let i = 0; i < group.length; i += TOWN_BATCH_MAX) send(group.slice(i, i + TOWN_BATCH_MAX), as);
    }
  }

  return (id, as) => {
    if (off) return single(id, as);
    return new Promise((done) => {
      queue.push({ id, as, done });
      if (!timer) timer = setTimer(flush, waitMs);
    });
  };
}
