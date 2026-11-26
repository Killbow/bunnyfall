import { isRegionBus, HUB_FIND_ROOM_HZ_MAX, foldFind } from '../../../../src/net/hubShards.js';
import { isSocialRoom, tokenGate } from '../../relay.js';

export function findFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, (b, t) => tokenGate(b, t, 1, 3), 'findbucket', 'finddrops', 'too many searches')) return;
  if (m.all === 1 && isRegionBus(a.key)) { this._send(ws, this._everyoneSaid(now)); return; }
  if (!isSocialRoom(a.key)) { this._junk(ws); return; }
  if (m.g === 1) { this._send(ws, JSON.stringify({ t: 'found', g: 1, l: this._guildWho(ws, a) })); return; }
  if (m.all === 1) { this._send(ws, this._everyoneSaid(now)); return; }
  const room = tokenGate(this._findRoom, now, HUB_FIND_ROOM_HZ_MAX);
  this._findRoom = room.bucket;
  if (!room.pass) { this._send(ws, JSON.stringify({ t: 'found', q: m.q, l: [], busy: 1 })); return; }
  this._send(ws, JSON.stringify({ t: 'found', q: m.q, l: this._findNames(ws, foldFind(m.q)) }));
  return;
}
