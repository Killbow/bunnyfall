// The `rite` frame's handler, called by message/dispatch.js with the room as `this`.
import { isCellRoom, riteRelayGate } from '../../relay.js';

export async function riteFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, riteRelayGate, 'riteBucket', 'riteDrops', 'too many rite frames')) return;
  if (!isCellRoom(a.key)) { this._junk(ws); return; }
  try { await this._riteWord(ws, a, m, now); } catch (e) { console.warn('[rite] word failed', e?.message ?? e); }
  return;
}
