// The `duel` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom, isChatRoom, DUEL_HZ_MAX } from '../../relay.js';
import { ROYAL_RING } from '../../../../src/net/siegeRef.js';
import { duelNote, duelVitals } from '../../../../src/net/duelRef.js';

export async function duelFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterDuel(ws, a, now); if (!a) return;
  if (isChatRoom(a.key) || isSocialRoom(a.key)) return;
  const to = m.data.to;
  if (to === a.id) { this._junk(ws); return; }
  await this._duelBeat(now);
  const k = m.data.k;
  if (k === 'strike' || k === 'spell') { await this._duelBlow(a, m.data, now); return; }
  if ((k === 'end' || k === 'cancel') && await this._duelForfeit(a, m.data, now)) return;
  const target = this._idFirst(to, ws);
  if (!target) return;
  const [tws, tb] = target;
  if (!this._senderFunnel(tws, a.id, now, 'duin', DUEL_HZ_MAX)) return;
  if (k === 'ask' || k === 'yes') duelNote(this._duels(), k, a.sub, tb.sub, m.data.s, now);
  const bout = k === 'start' ? this._duelOpen(ws, a, tb, m.data, now) : null;
  if (k === 'start' && !bout) return;
  this._send(tws, JSON.stringify({ t: 'duel', id: a.id, ...(typeof a.sub === 'string' && a.sub ? { sub: a.sub } : {}), data: m.data }));
  if (bout) this._duelSay(bout, (x) => ({ t: 'dref', k: 'bout', s: bout.s, op: x === bout.a ? bout.b.id : bout.a.id, ms: ROYAL_RING.countdownMs, h: duelVitals(bout) }));
  return;
}
