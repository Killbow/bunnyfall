import { isSocialRoom, bodyWordRelayGate, gateGate } from '../../relay.js';
import { isGateRoom } from '../../../../src/net/gateLaw.js';

export async function gateFrame(ws, a, m) {
  const now = Date.now();
  if (m.k === 'vt' ? !this._spend(ws, now, bodyWordRelayGate, 'bodyBucket', 'bodyDrops', 'too many body words') : !this._spend(ws, now, gateGate, 'gateBucket', 'gateDrops', 'too many gate frames')) return;
  if (m.k === 'spent') {
    if (!isSocialRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
    try { await this._gateSpent(a.sub, m.d); } catch (e) { console.warn('[hub] gate spent failed', e?.message ?? e); }
    return;
  }
  if (m.k === 'site') {
    if (!isSocialRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
    try { await this._gateSite(a.sub, m, now); } catch (e) { console.warn('[hub] gate site failed', e?.message ?? e); }
    return;
  }
  if (!isGateRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
  // A court copy forwards its gate frame, re-serialized with `t` first, and never runs it;
  // running it here would start a second fight.
  if (a.ly) { if (a.vid && a.id) this._hubUpOwe(a.vid, 'f', JSON.stringify({ t: 'gate', ...m })); return; }
  try { await this._gateFrame(ws, a, m, now); } catch (e) { console.warn('[gate] frame failed', e?.message ?? e); }
  return;
}
