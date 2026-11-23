// The `act` frame's handler, called by message/dispatch.js with the room as `this`.
import { isWorldRoom, byteGate, tokenGate, ACT_ROOM_HZ_MAX, ACT_SENDER_BYTES_PER_S, ACT_ROOM_BYTES_PER_S } from '../../relay.js';

export function actFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterActs(ws, a, now); if (!a) return;
  if (!isWorldRoom(a.key)) return;
  const budget = tokenGate(this._roomActs, now, ACT_ROOM_HZ_MAX);
  this._roomActs = budget.bucket;
  if (!budget.pass) return;
  const out = JSON.stringify({ t: 'act', id: a.id, data: m.data });
  const listeners = [...this._all()].filter(([other, b]) => other !== ws && b.id);
  const cost = out.length * listeners.length;
  const meters = this._meterOf(ws);
  const mine = byteGate(meters.abytes, now, cost, ACT_SENDER_BYTES_PER_S, true);
  if (!mine.pass) { meters.abytes = mine.bucket; return; }
  const bytes = byteGate(this._roomActBytes, now, cost, ACT_ROOM_BYTES_PER_S, true);
  this._roomActBytes = bytes.bucket;
  if (!bytes.pass) { meters.abytes = { bytes: mine.bucket.bytes + cost, at: now }; return; }
  meters.abytes = mine.bucket;
  for (const [other] of listeners) this._send(other, out);
  return;
}
