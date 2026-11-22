// The `hit` frame's handler, called by message/dispatch.js with the room as `this`.
import { isCellRoom, isWorldRoom, hitOwnerOf } from '../../relay.js';

export function hitFrame(ws, a, m, message) {
  this._metrics.c.hits++;
  const now = Date.now();
  a = this._meter(ws, a, now); if (!a) return;
  const cell = isCellRoom(a.key);
  if (!cell && !isWorldRoom(a.key)) return;
  const owned = cell || m.data.own === 1;
  const host = owned ? hitOwnerOf(m.data) : this._hostOf();
  if (!host || host === a.id) return;
  const target = this._idFirst(host, ws);
  if (!target) { if (owned) this._junk(ws); return; }
  this._hitFunnel(ws, a, m.data, message.length, target[0], now);
  return;
}
