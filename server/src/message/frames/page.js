import { isSocialRoom, isChatRoom } from '../../relay.js';

export function pageFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterPage(ws, a, now); if (!a) return;
  if (a.mu && a.mu > Math.floor(now / 1000)) { this._send(ws, JSON.stringify({ t: 'muted', until: a.mu })); return; }
  if (isChatRoom(a.key) || isSocialRoom(a.key)) return;
  const to = m.data.to;
  if (to === a.id) { this._junk(ws); return; }
  const target = this._idFirst(to, ws);
  if (!target) return;
  const [tws] = target;
  if (!this._senderFunnel(tws, a.id, now)) return;
  this._send(tws, this._directedFrame('page', a, m.data));
  return;
}
