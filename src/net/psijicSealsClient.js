// @ts-check
import { accountSeals } from './accountClient.js';
import { appStorage } from '../platform/appStorage.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { setWalletPsijicSeals } from '../items/walletItem.js';
import { ensureOfflinePsijicSeals, spendOfflinePsijicSeal, PSIJIC_SEAL_RID_RE } from '../systems/psijicSealsLaw.js';

/** @type {string|null} */
let _account = null;
/** @type {number|false|null} */
let _balance = null;
/** @type {Promise<any>|null} */
let _inflight = null;

const PENDING_RID_PREFIX = 'bf.pendingRespecRid.';

function charStorageKey(/** @type {any} */ entity) {
  const id = typeof entity?.characterId === 'string' && entity.characterId.trim()
    ? entity.characterId.trim()
    : (typeof entity?.name === 'string' && entity.name.trim() ? `name:${entity.name.trim()}` : 'default');
  return `${PENDING_RID_PREFIX}${id.slice(0, 80)}`;
}

/** @param {any} entity */
export function pendingRespecRidFor(entity) {
  if (!isOnlinePage()) return null;
  try {
    const raw = appStorage()?.getItem?.(charStorageKey(entity)) ?? null;
    if (typeof raw !== 'string' || !PSIJIC_SEAL_RID_RE.test(raw)) return null;
    if (entity?.lastRespecRid === raw) {
      appStorage()?.removeItem?.(charStorageKey(entity));
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/** @param {any} entity @param {string} rid */
export function rememberPendingRespecRid(entity, rid) {
  if (!isOnlinePage() || !PSIJIC_SEAL_RID_RE.test(rid)) return;
  try { appStorage()?.setItem?.(charStorageKey(entity), rid); } catch { /* ignore */ }
}

/** @param {any} entity @param {string} rid */
export function clearPendingRespecRid(entity, rid) {
  if (!isOnlinePage()) return;
  try {
    const key = charStorageKey(entity);
    if (appStorage()?.getItem?.(key) === rid) appStorage()?.removeItem?.(key);
  } catch { /* ignore */ }
}

function clientOf() {
  if (typeof globalThis.fetch !== 'function') return null;
  return accountSeals({ fetch: globalThis.fetch.bind(globalThis), storage: appStorage() });
}

function syncAccount(c) {
  const acct = c?.account?.() ?? null;
  if (acct !== _account) {
    _account = acct;
    _balance = acct ? null : false;
    _inflight = null;
  }
  return acct;
}

export async function refreshOnlinePsijicSeals() {
  const c = clientOf();
  if (!c) { _balance = false; return { ok: false, error: 'offline' }; }
  const acct = syncAccount(c);
  if (!acct) { _balance = false; return { ok: false, error: 'seals-need-account' }; }
  if (_inflight) return _inflight;
  const run = c.balance().then((/** @type {any} */ r) => {
    if (c.account() === acct) {
      if (r?.ok && Number.isSafeInteger(r.data?.balance)) _balance = Math.max(0, r.data.balance);
      else if (r?.error === 'seals-need-account' || r?.error === 'auth') _balance = false;
    }
    return r;
  }, () => ({ ok: false, error: 'offline' })).finally(() => {
    if (_inflight === run) _inflight = null;
  });
  _inflight = run;
  return run;
}

export function mountOnlinePsijicSeals() {
  if (!isOnlinePage()) return;
  setWalletPsijicSeals(
    () => {
      const c = clientOf();
      if (!c) return false;
      const acct = syncAccount(c);
      if (!acct) return false;
      return _balance;
    },
    () => refreshOnlinePsijicSeals(),
  );
  void refreshOnlinePsijicSeals();
}

/**
 * @param {any} entity
 * @returns {Promise<{ ok: boolean, online: boolean, balance: number, error?: string }>}
 */
export async function readPsijicSeals(entity) {
  if (!isOnlinePage()) {
    return { ok: true, online: false, balance: ensureOfflinePsijicSeals(entity) };
  }
  const r = await refreshOnlinePsijicSeals();
  if (r?.ok && 'data' in r && Number.isSafeInteger(r.data?.balance)) {
    return { ok: true, online: true, balance: Math.max(0, r.data.balance) };
  }
  if (typeof _balance === 'number' && Number.isSafeInteger(_balance)) {
    return { ok: true, online: true, balance: _balance };
  }
  return { ok: false, online: true, balance: 0, error: String(('error' in (r ?? {}) ? /** @type {any} */ (r).error : null) ?? 'offline') };
}

/**
 * @param {any} entity
 * @param {string} rid
 * @returns {Promise<{ ok: boolean, online: boolean, balance: number, error?: string }>}
 */
export async function spendPsijicSealNow(entity, rid) {
  if (!isOnlinePage()) {
    const res = spendOfflinePsijicSeal(entity);
    return res.ok
      ? { ok: true, online: false, balance: res.balance }
      : { ok: false, online: false, balance: res.balance, error: 'seals-short' };
  }
  const c = clientOf();
  const acct = syncAccount(c);
  if (!c || !acct) return { ok: false, online: true, balance: 0, error: 'seals-need-account' };
  const r = /** @type {any} */ (await c.spend(rid, typeof entity?.characterId === 'string' ? entity.characterId : null));
  if (r?.ok && Number.isSafeInteger(r.data?.balance)) {
    _balance = Math.max(0, r.data.balance);
    return { ok: true, online: true, balance: _balance };
  }
  const reportedBal = Number.isSafeInteger(r?.balance)
    ? r.balance
    : (Number.isSafeInteger(r?.data?.balance) ? r.data.balance : null);
  const bal = reportedBal != null
    ? Math.max(0, reportedBal)
    : (typeof _balance === 'number' ? _balance : 0);
  if (reportedBal != null) _balance = bal;
  return { ok: false, online: true, balance: bal, error: String(r?.error ?? 'offline') };
}
