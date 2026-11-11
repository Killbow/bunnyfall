// @ts-check

// The builder's door to the account service. It reuses the game's own clients (net/accountClient.js for sign-in,
// poi/poiService.js for every POI route), so a route is spelled in one place. This file adds the environments, the
// kept session per environment and a plain status for the toolbar.

import { login, logout } from '../../../src/net/accountClient.js';
import { poiMe, poiList, poiQueue, poiHistory, poiSaveDraft, poiShelf, poiSubmit, poiWithdraw, poiReview, poiRollback, poiShelfEntry, poiShelve, poiPutAsset } from '../../../src/poi/poiService.js';

/** The environments the toolbar offers. `custom` takes the builder's own URL. */
export const ENVIRONMENTS = Object.freeze([
  { id: 'local', name: 'Local dev', base: 'http://127.0.0.1:8788' },
  { id: 'production', name: 'Production', base: 'https://dagg.campfirerp.com' },
  { id: 'custom', name: 'Staging or custom', base: '' },
]);

const SESSION_KEY = 'bunnyfall.worldbuilder.session';
const ENV_KEY = 'bunnyfall.worldbuilder.env';

/** A base URL the builder typed, made safe: http(s) only, no path, no trailing slash. Null when it is not a URL. */
export function cleanBase(text) {
  try {
    const u = new URL(String(text).trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin;
  } catch { return null; }
}

/**
 * @param {{ storage?: any, fetch?: (url: string, init?: any) => Promise<any> }} [deps]
 */
export function createApi({ storage = globalThis.localStorage, fetch = globalThis.fetch?.bind(globalThis) } = {}) {
  const read = (k) => { try { return JSON.parse(storage?.getItem(k) ?? 'null'); } catch { return null; } };
  const write = (k, v) => { try { storage?.setItem(k, JSON.stringify(v)); } catch { /* blocked storage: sign in again next time */ } };
  // served from a real host (the /builder/ page), it starts on that host; on localhost it starts on Local dev
  const here = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? location.origin : null;
  let env = read(ENV_KEY) ?? (here ? { id: 'custom', base: here } : { id: 'local', base: ENVIRONMENTS[0].base });
  /** @type {Record<string, string>} secrets by base */
  let sessions = read(SESSION_KEY) ?? {};
  /** @type {{ handle: string | null, builder: boolean, approver: boolean } | null} */
  let me = null;
  const listeners = new Set();
  const note = () => { for (const f of listeners) f(); };
  const io = () => ({ fetch: (u, i) => fetch(u, i), base: env.base, secret: sessions[env.base] ?? null });

  const api = {
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
    environment: () => ({ ...env }),
    /** Pick an environment. `base` is needed for `custom`. Answers false when the URL is not one. */
    setEnvironment(id, base = '') {
      const found = ENVIRONMENTS.find((e) => e.id === id);
      const b = id === 'custom' ? cleanBase(base) : found?.base;
      if (!found || !b) return false;
      env = { id, base: b }; me = null; write(ENV_KEY, env); note();
      return true;
    },
    signedIn: () => !!sessions[env.base],
    me: () => me,
    /** Sign in and ask the store who this is. Answers `{ ok }` or `{ ok: false, error }`. */
    async signIn(handle, password) {
      const r = await login({ fetch: (u, i) => fetch(u, i), base: env.base, secret: null }, handle, password, 'World Builder');
      if (!r.ok) return r;
      sessions = { ...sessions, [env.base]: r.data.secret }; write(SESSION_KEY, sessions);
      return api.refreshMe();
    },
    /** The kept session's bearer for the chosen service, or null (the live view hands it to the game for draft models). */
    bearer: () => sessions[env.base] ?? null,
    /** Ask `/v1/poi/me`. A refused session is dropped. */
    async refreshMe() {
      const r = await poiMe(io());
      if (r.ok) { me = { handle: r.data.handle ?? null, builder: !!r.data.builder, approver: !!r.data.approver }; note(); return { ok: true, me }; }
      if (r.error === 'unauthorized' || r.status === 401) { delete sessions[env.base]; write(SESSION_KEY, sessions); }
      me = null; note();
      return r;
    },
    async signOut() {
      if (sessions[env.base]) await logout(io(), false).catch(() => null);
      delete sessions[env.base]; write(SESSION_KEY, sessions); me = null; note();
    },
    list: () => poiList(io()),
    queue: () => poiQueue(io()),
    history: (id) => poiHistory(io(), id),
    saveDraft: (doc, base = null) => poiSaveDraft(io(), doc, base),
    submit: (id, rev) => poiSubmit(io(), id, rev),
    shelf: () => poiShelf(io()),
    withdraw: (id, rev) => poiWithdraw(io(), id, rev),
    review: (id, rev, verdict, note, docSha) => poiReview(io(), id, rev, verdict, note, docSha),
    rollback: (id, rev) => poiRollback(io(), id, rev),
    shelfEntry: (id) => poiShelfEntry(io(), id),
    shelve: (item) => poiShelve(io(), item),
    putAsset: (bytes, kind) => poiPutAsset(io(), bytes, kind),
    /** An asset's bytes (a draft's with this session's bearer). Throws on a refusal: the pack export stops and says which. */
    async assetBytes(sha) {
      const secret = sessions[env.base];
      const r = await fetch(`${env.base}/v1/poi/asset/${sha}`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
      if (!r.ok) throw new Error(`asset ${sha}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  };
  return api;
}
