// The `look` frame's handler, called by message/dispatch.js with the room as `this`.
import { isChatRoom, tokenGate, CLOSE_BUSY, badged } from '../../relay.js';
import { isBattleRoom } from '../../../../src/net/siegeRef.js';
import { lookKey } from '../../room/keys.js';

export async function lookFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterLook(ws, a, now); if (!a) return;
  if (isChatRoom(a.key)) return;
  const battleGate = isBattleRoom(a.key) ? await this._battleHelloGate(a.sub, a.sd, now) : null;
  const gate = battleGate ?? tokenGate(this._hellos, now, this._helloHz(a.key));
  if (!battleGate) this._hellos = gate.bucket;
  if (!gate.pass) { this._refuse(ws, 'busy', CLOSE_BUSY); return; }
  await this.state.storage.put(lookKey(a.id), m.look); this._looks.set(a.id, m.look);
  // Check that the socket still holds the id after the await;
  // a replacing hello has already sent its own look.
  if (this._attach(ws)?.id !== a.id) return;
  const said = JSON.stringify(badged({ t: 'join', id: a.id, name: a.name, look: m.look, pose: null }, a));
  for (const [other, b] of [...this._all()]) if (other !== ws && b.id) this._send(other, said);
  return;
}
