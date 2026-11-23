// The `sd` frame's handler, called by message/dispatch.js with the room as `this`.
import { isCellRoom, isSocialRoom, bodyWordRelayGate, sdPzRelayGate, sdFightRelayGate, sdRelayGate } from '../../relay.js';
import { isSdRoom } from '../../../../src/net/sdLaw.js';

export async function sdFrame(ws, a, m) {
  const now = Date.now();
  if (m.k === 'pz') {
    if (!this._spend(ws, now, sdPzRelayGate, 'sdPzBucket', 'sdPzDrops', 'too many turns')) return;
    if (!isSdRoom(a.key)) { this._junk(ws); return; }
    try { await this._sdTurn(ws, a, m, now); } catch (e) { console.warn('[sd] turn failed', e?.message ?? e); }
    return;
  }
  if (m.k === 'in' || m.k === 'hit' || m.k === 'ehit' || m.k === 'xhit' || m.k === 'vt') {
    if (m.k === 'vt' ? !this._spend(ws, now, bodyWordRelayGate, 'bodyBucket', 'bodyDrops', 'too many body words') : !this._spend(ws, now, sdFightRelayGate, 'sdFightBucket', 'sdFightDrops', 'too many fight frames')) return;
    if (!isSdRoom(a.key)) { this._junk(ws); return; }
    try { await this._sdFightFrame(ws, a, m, now); } catch (e) { console.warn('[sd] fight failed', e?.message ?? e); }
    return;
  }
  if (!this._spend(ws, now, sdRelayGate, 'sdBucket', 'sdDrops', 'too many sd frames')) return;
  if (m.k === 'rz') { try { if (isSdRoom(a.key)) await this._sdRaise(ws, a, m, now); else this._junk(ws); } catch (e) { console.warn('[sd] raise failed', e?.message ?? e); } return; }
  if (m.k === 'spent') {
    if (!isSocialRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
    try { await this._sdSpent(a.sub, m.s, now); } catch (e) { console.warn('[hub] sd spent failed', e?.message ?? e); }
    return;
  }
  if (!isCellRoom(a.key)) { this._junk(ws); return; }
  try { await this._sdFoundWord(ws, a, m, now); } catch (e) { console.warn('[sd] word failed', e?.message ?? e); }
  return;
}
