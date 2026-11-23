// The `trade` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom, byteGate, isChatRoom, tokenGate, TRADE_ROOM_HZ_MAX, TRADE_ROOM_BYTES_PER_S } from '../../relay.js';

export function tradeFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterTrade(ws, a, now); if (!a) return;
  if (isChatRoom(a.key) || isSocialRoom(a.key)) return;
  const to = m.data.to;
  if (to === a.id) { this._junk(ws); return; }
  const target = this._idFirst(to, ws);
  if (!target) return;
  const [tws] = target;
  const tm = this._meterOf(tws);
  const funnel = tokenGate(tm.tinbucket ?? null, now, TRADE_ROOM_HZ_MAX);
  tm.tinbucket = funnel.bucket;
  if (!funnel.pass) return;
  const out = this._directedFrame('trade', a, m.data);
  const mine = this._meterOf(ws);
  const bytes = byteGate(mine.tbytes ?? null, now, out.length, TRADE_ROOM_BYTES_PER_S);
  mine.tbytes = bytes.bucket;
  if (!bytes.pass) return;
  this._send(tws, out);
  return;
}
