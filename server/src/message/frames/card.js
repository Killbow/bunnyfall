// The `card` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom, isChatRoom } from '../../relay.js';

export function cardFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterCard(ws, a, now); if (!a) return;
  if (isChatRoom(a.key) || isSocialRoom(a.key)) return;
  const to = m.data.to;
  if (to === a.id) { this._junk(ws); return; }
  const target = this._idFirst(to, ws);
  if (!target) return;
  const [tws] = target;
  if (!this._senderFunnel(tws, a.id, now)) return;
  this._send(tws, JSON.stringify({ t: 'card', id: a.id, ...(typeof a.sub === 'string' && a.sub ? { sub: a.sub } : {}), data: m.data }));
  return;
}
