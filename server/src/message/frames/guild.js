// The `guild` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom, isChatRoom, guildGate, guildRoomGate } from '../../relay.js';
import { verifyOrder } from '../../../../src/net/identityToken.js';

export async function guildFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, guildGate, 'gdbucket', 'gddrops', 'too many guild orders')) return;
  if (!this._attach(ws)?.id) return;
  await this._loadKey();
  if (!this._verifyKey) return;
  const r = await verifyOrder(m.order, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'guild' });
  if (!r.ok) return;
  if (r.claims.gi) await this._loadGuildOuts(Math.floor(now / 1000));
  const cur = this._attach(ws);
  if (!cur?.id || !cur.sub || r.claims.s !== cur.sub) return;
  const c = r.claims;
  if (!(c.i > (cur.gio ?? 0)) || (c.gi && this._guildOutAfter(c.gi, c.gm, c.i))) { this._send(ws, this._guildFrame(cur.id, cur.gt)); return; }
  if (!this._setAttach(ws, { ...this._unguild(cur), ...(c.gi ? { gi: c.gi, gt: c.gt, gm: c.gm } : {}), gio: c.i })) return;
  const said = this._guildFrame(cur.id, c.gt);
  const place = !isChatRoom(cur.key) && !isSocialRoom(cur.key);
  const budget = place && (cur.gt ?? null) !== (c.gt ?? null) ? guildRoomGate(this._roomGuild, now) : null;
  if (!budget?.pass) { this._send(ws, said); return; }
  this._roomGuild = budget.bucket;
  for (const [other, b] of [...this._all()]) if (b.id) this._send(other, said);
}
