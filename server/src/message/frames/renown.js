// The `renown` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom, isChatRoom, renownGate, renownRoomGate } from '../../relay.js';
import { verifyOrder, renownIssuable } from '../../../../src/net/identityToken.js';

export async function renownFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, renownGate, 'rnbucket', 'rndrops', 'too many renown orders')) return;
  const at = this._attach(ws);
  if (!at?.id || isChatRoom(at.key) || isSocialRoom(at.key)) return;
  await this._loadKey();
  if (!this._verifyKey) return;
  const r = await verifyOrder(m.order, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'renown' });
  if (!r.ok) return;
  const cur = this._attach(ws);
  if (!cur?.id || !cur.sub || r.claims.s !== cur.sub) return;
  const held = () => { if (renownIssuable(cur.lv)) this._send(ws, JSON.stringify({ t: 'renown', id: cur.id, lv: cur.lv })); };
  if (!(r.claims.lv > (cur.lv ?? 0))) { held(); return; }
  const budget = renownRoomGate(this._roomRenown, now);
  if (!budget.pass) { held(); return; }
  this._roomRenown = budget.bucket;
  if (!this._setAttach(ws, { ...cur, lv: r.claims.lv })) return;
  const said = JSON.stringify({ t: 'renown', id: cur.id, lv: r.claims.lv });
  for (const [other, b] of [...this._all()]) if (b.id) this._send(other, said);
}
