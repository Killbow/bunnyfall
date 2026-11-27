import { isSocialRoom, tokenGate, WDUN_HZ_MAX } from '../../relay.js';

export async function wdunFrame(ws, a, m) {
  if (!isSocialRoom(a.key) || !(a.acct || a.sub)) { this._junk(ws); return; }
  const now = Date.now();
  const g = tokenGate(this._wdunRate.get(ws) ?? null, now, WDUN_HZ_MAX, 6);
  this._wdunRate.set(ws, g.bucket);
  if (!g.pass) return;
  try { await this._wdunWord(ws, a.acct || a.sub, m, now, a); } catch (e) { console.warn('[wdun] word failed', e?.message ?? e); }
  return;
}
