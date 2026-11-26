import { isSocialRoom, homeGate, HOME_WORDS_MAX, HOME_WORDS_KEY } from '../../relay.js';
import { verifyOrder } from '../../../../src/net/identityToken.js';

export async function homeFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, homeGate, 'hmbucket', 'hmdrops', 'too many home orders')) return;
  if (!isSocialRoom(a.key)) { this._junk(ws); return; }
  await this._loadKey();
  if (!this._verifyKey) return;
  const r = await verifyOrder(m.order, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'home' });
  if (!r.ok) return;
  const sig = m.order.slice(m.order.lastIndexOf('.') + 1);
  const held = await this._homeWordsHeld(now);
  if (held.some((w) => w.sig === sig)) return;
  const word = { m: r.claims.bm, u: r.claims.bu ?? [], d: r.claims.bd ?? [], i: r.claims.i };
  this._homeWords = [...held, { ...word, at: now, sig }].slice(-HOME_WORDS_MAX);
  // HOME_WORDS_KEY stays outside the prefixes `_sweep` (server/src/room/store.js) and
  // `_sweepHub` (server/src/room/alarm.js) delete; late hub joiners read it on the welcome.
  await this.state.storage.put(HOME_WORDS_KEY, this._homeWords);
  const said = JSON.stringify({ t: 'home', l: [word] });
  for (const [other, b] of [...this._all()]) if (b.id) this._send(other, said);
}
