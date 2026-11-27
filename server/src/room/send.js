import { CLOSE_POLICY } from '../relay.js';
import { staffNetClosed } from '../staffFeeds.js';

export class SendPart {
  _send(ws, s) {
    if (this._owed.size && this._owed.has(ws)) this._flushOwedOf(ws);
    try { ws.send(s); this._metrics.c.sends++; this._metrics.c.bytesOut += s.length; return true; } catch {
      try { ws.close(1011, 'send failed'); } catch {  }
      this._dead.add(ws);
      this._closed(ws);
      return false;
    }
  }
  // Forget only a socket the runtime no longer lists; the next walk takes a listed one back in.
  _closed(ws) { if (!this.state.getWebSockets().includes(ws)) this._forget(ws); }
  _refuse(ws, m, code = CLOSE_POLICY, reason = m) {
    this._metrics.c.refusals++; if (m === 'busy') this._metrics.c.busy++;
    staffNetClosed(this, ws, m);
    this._send(ws, JSON.stringify({ t: 'error', m }));
    try { ws.close(code, reason); } catch {  }
    this._dead.add(ws);
    this._closed(ws);
  }
  // The runtime sends no close event for a socket this object closed, so this runs that socket's leave.
  async _reap() {
    while (this._dead.size) {
      const [ws] = this._dead;
      this._dead.delete(ws);
      if (ws.court) continue;
      try { await this._leave(ws); } catch {  }
    }
  }
}
