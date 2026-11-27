import { isSocialRoom, tokenGate, SOCIAL_ROOM_HZ_MAX } from '../../relay.js';

export async function socialFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterSocial(ws, a, now); if (!a) return;
  if (!isSocialRoom(a.key)) { this._junk(ws); return; }
  const budget = tokenGate(this._roomSocial, now, SOCIAL_ROOM_HZ_MAX);
  this._roomSocial = budget.bucket;
  if (!budget.pass) { this._sayError(ws, 'busy'); return; }
  if (!a.acct) { this._sayError(ws, 'no account'); return; }
  let err;
  try { err = await this._social(ws, a, m, now); } catch (e) { console.warn('[hub] social act failed', m.k, e?.message ?? e); err = 'the hub stumbled - try again'; }
  if (err) this._sayError(ws, err);
  return;
}
