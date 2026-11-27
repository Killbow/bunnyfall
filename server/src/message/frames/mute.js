import { muteGate } from '../../relay.js';
import { verifyOrder } from '../../../../src/net/identityToken.js';
import { ORDERS_MAX } from '../../room/holds.js';

export async function muteFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, muteGate, 'mbucket', 'mdrops', 'too many mute orders')) return;
  await this._loadKey();
  if (!this._verifyKey) return;
  const r = await verifyOrder(m.order, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'mute' });
  if (!r.ok) return;
  const { s: sub, mu, i } = r.claims;
  const sig = m.order.slice(m.order.lastIndexOf('.') + 1);
  const held = this._orders.get(sub);
  // The newest mute order wins and a repeated signature is ignored, so a replayed old
  // mute cannot undo a later unmute.
  if (held && (i < held.i || held.sig === sig)) return;
  this._orders.delete(sub);
  if (this._orders.size >= ORDERS_MAX) this._orders.delete(this._orders.keys().next().value);
  this._orders.set(sub, { i, mu, sig });
  const told = JSON.stringify({ t: 'muted', until: mu });
  for (const [other, b] of [...this._all()]) {
    if (b.sub !== sub || b.gio > i) continue;
    this._setAttach(other, { ...b, mu, lt: Math.max(b.lt ?? 0, i) });
    this._send(other, told);
  }
}
