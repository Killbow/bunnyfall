// @ts-check
import { readFamily } from './family.js';
import { loadFamily, storeFamily, mergeFacts, rekeyClashes } from './store.js';
import { realmLineages, realmLineagePut } from '../../saves/realmSaves.js';

export const PUSH_TRIES = 4;
// Server error slugs that the same record would earn again; they match the account server, and a line refused with
// one is not re-sent this session.
export const LINE_REFUSALS = Object.freeze(['body', 'lineage-too-large', 'lineage-model', 'too-many-lineages', 'lineage-law']);

/**
 * Realm person ids win because realm births reference them by `person_id`, so clashing device persons are rekeyed
 * first, whichever copy is newer.
 * @param {any} mine
 * @param {any} theirs
 */
export function mergeLines(mine, theirs) {
  const a = readFamily(mine), b = readFamily(theirs);
  if (!a || !b) return a ?? b;
  rekeyClashes(a, b);
  const [base, other] = b.rev > a.rev ? [b, a] : [a, b];
  mergeFacts(base, other);
  base.rev = Math.max(a.rev, b.rev);
  return base;
}

/** @param {{ io: () => any, storage: () => any, list?: typeof realmLineages, put?: typeof realmLineagePut, onRefused?: (id: string, error: string) => void }} deps */
export function createRealmLine({ io, storage, list = realmLineages, put = realmLineagePut, onRefused = () => {} }) {
  /** @type {Map<string, any>} */
  const queued = new Map();
  /** @type {Map<string, number>} */
  const bases = new Map();
  /** @type {Map<string, string>} */
  const landed = new Map();
  /** @type {Map<string, string>} */
  const refused = new Map();
  /** @type {Promise<any> | null} */
  let running = null;
  let lastError = null;

  async function pull({ waitMs = 0 } = {}) {
    const r = await list(io(), { waitMs });
    if (!r.ok) return r;
    const ids = [];
    for (const row of r.lineages) {
      const theirs = readFamily(row?.record);
      if (!theirs) continue;
      if (Number.isSafeInteger(row?.rev)) bases.set(theirs.id, row.rev);
      const local = loadFamily(storage(), theirs.id);
      const kept = mergeLines(local, theirs);
      // Store against the rev read here, so a device write made since is merged in instead of lost.
      if (kept && storeFamily(storage(), kept, local?.rev ?? null)) ids.push(kept.id);
    }
    return { ok: true, ids };
  }

  async function drain() {
    while (queued.size) {
      const [id, rec] = queued.entries().next().value;
      queued.delete(id);
      let record = rec;
      let tries = 0;
      for (;;) {
        const r = await put(io(), id, record, bases.get(id) ?? null);
        if (r.ok) {
          lastError = null;
          bases.set(id, Number.isSafeInteger(r.data?.rev) ? r.data.rev : record.rev);
          landed.set(id, JSON.stringify(record));
          break;
        }
        if (r.error === 'lineage-stale' && r.data?.record && ++tries < PUSH_TRIES) {
          if (Number.isSafeInteger(r.data.rev)) bases.set(id, r.data.rev);
          const merged = mergeLines(record, r.data.record);
          merged.rev = Math.max(record.rev | 0, r.data.rev | 0) + 1;
          storeFamily(storage(), merged, record.rev);
          record = JSON.parse(JSON.stringify(merged));
          continue;
        }
        lastError = r.error ?? 'server';
        if (LINE_REFUSALS.includes(lastError)) {
          if (!refused.has(id)) { refused.set(id, lastError); try { onRefused(id, lastError); } catch { } }
          queued.delete(id);
          break;
        }
        if (!queued.has(id)) queued.set(id, record);
        return;
      }
    }
  }
  const run = () => {
    if (!running) running = drain().finally(() => { running = null; });
    return running;
  };

  return {
    pull,
    push(/** @type {any} */ family) {
      if (!family?.id || !io() || refused.has(family.id)) return null;
      const text = JSON.stringify(family);
      if (landed.get(family.id) === text && !queued.has(family.id)) return running;
      queued.set(family.id, JSON.parse(text));
      return run();
    },
    async flush() {
      if (running) await running;
      if (queued.size) await run();
      return queued.size === 0 && refused.size === 0;
    },
    get error() { return lastError; },
    refusalOf: (/** @type {string} */ id) => refused.get(id) ?? null,
    unwrittenOf: (/** @type {string} */ id) => refused.get(id) ?? (queued.has(id) ? lastError ?? 'offline' : null),
  };
}
