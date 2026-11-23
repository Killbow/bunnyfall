// A player's socket on a shard, as the bus holds it. A frame sent to it is queued for the
// shard's next poll, a close is passed on to the shard, and the attachment lives here, not in
// the runtime.
export class ShardSocket {
  constructor(bus, hub, vid) { this.virtual = true; this.hub = hub; this.vid = vid; this.att = null; this.closed = false; this._bus = bus; }
  send(s) { if (this.closed) throw new Error('closed'); this._bus._vsend(this, s); }
  close(code, reason) { if (this.closed) return; this.closed = true; this._bus._vclose(this, code, reason); }
  serializeAttachment(a) { this.att = a; }
  deserializeAttachment() { return this.att; }
}
