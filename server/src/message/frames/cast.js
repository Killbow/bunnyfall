import { isSocialRoom, isChatRoom } from '../../relay.js';
import { isEgRoom } from '../../../../src/net/eliteGates/egLaw.js';

export function castFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterCast(ws, a, now); if (!a) return;
  if (isChatRoom(a.key) || isSocialRoom(a.key)) return;
  const to = m.data.to;
  if (to === a.id) { this._junk(ws); return; }
  const target = this._idFirst(to, ws);
  if (!target) return;
  const [tws] = target;
  if (!this._senderFunnel(tws, a.id, now)) return;
  this._send(tws, JSON.stringify({ t: 'cast', id: a.id, data: m.data }));
  if (isEgRoom(a.key) && a.sub && target[1]?.sub) this._egCastSeen(a.sub, target[1].sub, now);
  return;
}
