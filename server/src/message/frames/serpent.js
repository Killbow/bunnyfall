// The `serpent` frame's handler, called by message/dispatch.js with the room as `this`.
import { isCellRoom, isSocialRoom, bodyWordRelayGate, serpentGate } from '../../relay.js';

export async function serpentFrame(ws, a, m) {
  const now = Date.now();
  if (m.k === 'vt' ? !this._spend(ws, now, bodyWordRelayGate, 'bodyBucket', 'bodyDrops', 'too many body words') : !this._spend(ws, now, serpentGate, 'serpentBucket', 'serpentDrops', 'too many serpent frames')) return;
  if (m.k === 'site') {
    if (!isSocialRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
    try { await this._serpentSite(a.sub, m, now); } catch (e) { console.warn('[hub] serpent site failed', e?.message ?? e); }
    return;
  }
  if (!isCellRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
  try { await this._serpentFrame(ws, a, m, now); } catch (e) { console.warn('[serpent] word failed', e?.message ?? e); }
  return;
}
