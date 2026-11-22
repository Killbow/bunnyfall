// The `ow` frame's handler, called by message/dispatch.js with the room as `this`.
import { isCellRoom, owGate } from '../../relay.js';

export async function owFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, owGate, 'owBucket', 'owDrops', 'too many overworld frames')) return;
  if (!isCellRoom(a.key)) { this._junk(ws); return; }
  try { await this._owWord(ws, a, m, now); } catch (e) { console.warn('[ow] word failed', e?.message ?? e); }
  return;
}
