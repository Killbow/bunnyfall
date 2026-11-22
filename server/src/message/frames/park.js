// The `park` frame's handler, called by message/dispatch.js with the room as `this`.
import { isCellRoom, isSocialRoom, isChatRoom, parkKeyOf, cellRoomOfWire } from '../../relay.js';
import { coverOf, atCover } from '../../cellNodes.js';

export async function parkFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterPark(ws, a, now); if (!a) return;
  if (isChatRoom(a.key) || isSocialRoom(a.key) || typeof a.sub !== 'string' || !a.sub) return;
  const k = await parkKeyOf(a.sub, m.data.c);
  if (a.pk !== k) { a = { ...a, pk: k }; this._setAttach(ws, a); }
  const here = isCellRoom(a.key) ? coverOf(a) : null;
  const cell = m.data.a ? cellRoomOfWire(m.data.a[0], m.data.a[1]) : null;
  if (m.data.r && atCover(here, cell)) {
    const thrown = await this._parkStore(k, a.sub, a.id, a.name ?? '', m.data.r, now);
    if (thrown) this._parkTellOwner(thrown, ws);
  } else if (here && !atCover(here, cell)) await this._parkDrop(k);
  await this._parkRegister(k, cell, now, m.data.r && atCover(here, cell) ? a.ly | 0 : undefined);
  return;
}
