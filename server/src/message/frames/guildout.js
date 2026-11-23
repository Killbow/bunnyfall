// The `guildout` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom, isChatRoom, guildGate, guildRoomGate } from '../../relay.js';
import { verifyOrder } from '../../../../src/net/identityToken.js';

export async function guildoutFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, guildGate, 'gdbucket', 'gddrops', 'too many guild orders')) return;
  await this._loadKey();
  if (!this._verifyKey) return;
  const r = await verifyOrder(m.order, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'guildout' });
  if (!r.ok) return;
  const { gi, gm, i } = r.claims;
  await this._loadGuildOuts(Math.floor(now / 1000));
  this._holdGuildOut(gi, gm, i);
  await this._saveGuildOuts(Math.floor(now / 1000));
  const gone = [];
  for (const [other, b] of [...this._all()]) {
    if (!b.id || b.gi !== gi || (gm !== undefined && b.gm !== gm) || !(i > (b.gio ?? 0))) continue;
    if (this._setAttach(other, { ...this._unguild(b), gio: i })) gone.push([other, b]);
  }
  const place = !isChatRoom(this._attach(ws)?.key) && !isSocialRoom(this._attach(ws)?.key);
  for (const [other, b] of gone) {
    const said = this._guildFrame(b.id, null);
    const budget = place ? guildRoomGate(this._roomGuild, now) : null;
    if (!budget?.pass) { this._send(other, said); continue; }
    this._roomGuild = budget.bucket;
    for (const [each, e] of [...this._all()]) if (e.id) this._send(each, said);
  }
}
