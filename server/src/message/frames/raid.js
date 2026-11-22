// The `raid` frame's handler, called by message/dispatch.js with the room as `this`.
import { isCellRoom, raidGate } from '../../relay.js';

export async function raidFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, raidGate, 'raidBucket', 'raidDrops', 'too many raid frames')) return;
  if (!isCellRoom(a.key)) { this._junk(ws); return; }
  try { await this._raidWord(ws, a, m, now); } catch (e) { console.warn('[raid] word failed', e?.message ?? e); }
  return;
}
