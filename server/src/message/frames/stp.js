import { isSocialRoom, tokenGate, SOCIAL_ROOM_HZ_MAX } from '../../relay.js';
import { routeStaffTeleport } from '../../staffTeleport.js';

export function stpFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, (b, t) => tokenGate(b, t, 4, 8), 'tpbucket', 'tpdrops', 'too many teleport requests')) return;
  if (!isSocialRoom(a.key)) { this._junk(ws); return; }
  const budget = tokenGate(this._roomStaffTp, now, SOCIAL_ROOM_HZ_MAX);
  this._roomStaffTp = budget.bucket;
  if (!budget.pass) {
    if (m.k === 'ask') this._send(ws, JSON.stringify({ t: 'stp', k: 'result', nonce: m.nonce, error: 'busy' }));
    return;
  }
  routeStaffTeleport(this, ws, a, m, now);
  return;
}
