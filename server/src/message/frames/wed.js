// The `wed` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom, isChatRoom, WED_HZ_MAX } from '../../relay.js';

export function wedFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterWed(ws, a, now); if (!a) return;
  if (isChatRoom(a.key) || isSocialRoom(a.key)) return;
  const to = m.data.to;
  if (to === a.id) { this._junk(ws); return; }
  const target = this._idFirst(to, ws);
  if (!target) return;
  const [tws] = target;
  if (!this._senderFunnel(tws, a.id, now, 'wein', WED_HZ_MAX)) return;
  this._send(tws, JSON.stringify({ t: 'wed', id: a.id, ...(typeof a.sub === 'string' && a.sub ? { sub: a.sub } : {}), ...(typeof a.ci === 'string' && a.ci ? { sc: a.ci } : {}), data: m.data }));
  return;
}
