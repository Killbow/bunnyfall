// The caravan travel marks of a room, fanned to its sockets, and the travel owed, cleared or paid.
import { byteGate, ACT_SENDER_BYTES_PER_S, ACT_ROOM_BYTES_PER_S, TRAV_WELCOME_MAX, travRoomGate } from '../relay.js';

export class CaravanPart {
  async _caravanFan(now) {
    const from = this._cvOwed;
    if (!from) return;
    const out = `{"t":"caravan","data":${this._cvDoc ?? 'null'}}`;
    const listeners = [...this._all()].filter(([other, b]) => other !== from && b.id);
    const cost = out.length * listeners.length;
    const meters = this._meterOf(from);
    const mine = byteGate(meters.abytes, now, cost, ACT_SENDER_BYTES_PER_S, true);
    let refused = mine.pass ? null : { bytes: mine.bucket.bytes, rate: ACT_SENDER_BYTES_PER_S };
    if (!refused) {
      const room = byteGate(this._roomActBytes, now, cost, ACT_ROOM_BYTES_PER_S, true);
      this._roomActBytes = room.bucket;
      if (!room.pass) refused = { bytes: room.bucket.bytes, rate: ACT_ROOM_BYTES_PER_S };
    }
    if (refused) {
      if (!mine.pass) meters.abytes = mine.bucket;
      this._cvOwedAt = now + Math.ceil((-refused.bytes / refused.rate) * 1000) + 1;
      await this.state.storage.setAlarm(this._cvOwedAt);
      return;
    }
    meters.abytes = mine.bucket;
    this._cvOwed = null;
    for (const [other] of listeners) this._send(other, out);
  }
  _oweTravClear(id, out) {
    this._travOwed.delete(id);
    if (this._travOwed.size >= TRAV_WELCOME_MAX) this._travOwed.delete(this._travOwed.keys().next().value);
    this._travOwed.set(id, out);
  }
  _payTravOwed(now) {
    for (const [id, out] of this._travOwed) {
      const g = travRoomGate(this._travClearFan, now);
      this._travClearFan = g.bucket;
      if (!g.pass) return;
      this._travOwed.delete(id);
      this._fanAllBut(null, id, out);
    }
  }
}
