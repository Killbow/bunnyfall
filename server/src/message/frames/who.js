// The `who` frame's handler, called by message/dispatch.js with the room as `this`.
import { isChatRoom, tokenGate, badged, whoIdOf, WHO_ROOM_HZ_MAX, inRange } from '../../relay.js';
import { isBattleRoom } from '../../../../src/net/siegeRef.js';
import { lookKey } from '../../room/keys.js';

export async function whoFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterWho(ws, a, now); if (!a) return;
  if (isChatRoom(a.key)) return;
  const id = whoIdOf(m);
  if (!id || id === a.id) { this._junk(ws); return; }
  const budget = tokenGate(this._roomWho, now, WHO_ROOM_HZ_MAX);
  this._roomWho = budget.bucket;
  if (!budget.pass) return;
  const target = this._idFirst(id, ws);
  if (!target) return;
  const [tws, b] = target;
  let look = this._looks.get(b.id) ?? null;
  if (!look) { look = (await this.state.storage.get(lookKey(b.id))) ?? null; if (look) this._looks.set(b.id, look); }
  if (this._attach(tws)?.id !== b.id) return;
  if (isBattleRoom(a.key)) await this._siegeOf();
  // Send the pose only within range, as the pose fan in server/src/message/pose.js does;
  // past range the answer would leak a member's position.
  this._send(ws, JSON.stringify(badged({ t: 'join', id: b.id, name: b.name, look, pose: inRange(a.key ?? '', a.pose, b.pose) ? (this._drawn(b, a.key).pose ?? null) : null }, b)));
  return;
}
