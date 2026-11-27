import { isSocialRoom, bodyWordRelayGate, EG_HUB_KINDS, egHubGate, egGate } from '../../relay.js';
import { isEgRoom } from '../../../../src/net/eliteGates/egLaw.js';

export async function egFrame(ws, a, m) {
  const now = Date.now();
  if (m.k === 'vt' ? !this._spend(ws, now, bodyWordRelayGate, 'bodyBucket', 'bodyDrops', 'too many body words') : EG_HUB_KINDS.includes(m.k) ? !this._spend(ws, now, egHubGate, 'egHubBucket', 'egHubDrops', 'too many breach words') : !this._spend(ws, now, egGate, 'egBucket', 'egDrops', 'too many breach frames')) return;
  if (m.k === 'open') {
    if (!isSocialRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
    try { await this._egOpen(ws, a, m, now); } catch (e) { console.warn('[hub] eg open failed', e?.message ?? e); }
    return;
  }
  if (m.k === 'void' || m.k === 'claimed') {
    if (!isSocialRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
    try { if (m.k === 'void') await this._egVoid(ws, a, m, now); else await this._egClaimed(a.sub, m, now); } catch (e) { console.warn('[hub] eg word failed', e?.message ?? e); }
    return;
  }
  if (!isEgRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
  try { await this._egFrame(ws, a, m, now); } catch (e) { console.warn('[eg] frame failed', e?.message ?? e); }
  return;
}
