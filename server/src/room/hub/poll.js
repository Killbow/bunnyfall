import { json } from '../json.js';
import { upOf, HUB_POLL_MS, HUB_BATCH_BYTES } from '../../../../src/net/hubShards.js';

export class PollPart {
  async _hubPollInternal(request) {
    let b;
    try { b = await request.json(); } catch { return json({ error: 'bad' }, 400); }
    const hub = b?.hub;
    if (upOf(hub) == null) return json({ error: 'bad' }, 400);
    if (this._busKey === undefined) this._busKey = upOf(hub);
    else if (this._busKey !== upOf(hub)) return json({ error: 'bad' }, 400);
    this._all();
    const box = this._outbox.get(hub), ack = b.ack;
    if (box && ack && ack.b === this._boot && Number.isSafeInteger(ack.q)) while (box.l.length && box.l[0].q <= ack.q) box.bytes -= /** @type {{ body: string }} */ (box.l.shift()).body.length;
    for (const vid of Array.isArray(b.gone) ? b.gone : []) { const v = typeof vid === 'string' ? this._vsocks.get(vid) : null; if (v && v.hub === hub) await this._vgone(v, true); }
    await this._reap();
    const rs = b.rb !== this._boot;
    const held = this._polls.get(hub);
    if (held) this._pollAnswer(hub, held, false);
    if (rs || !b.w || this._outbox.get(hub)?.l.length) return this._pollReply(hub, rs);
    return new Promise((done) => { const p = { done, t: setTimeout(() => this._pollAnswer(hub, p), HUB_POLL_MS) }; this._polls.set(hub, p); });
  }
  _pollAnswer(hub, p, give = true) {
    if (this._polls.get(hub) === p) this._polls.delete(hub);
    clearTimeout(p.t);
    p.done(give ? this._pollReply(hub, false) : this._pollReply(null, false));
  }
  _pollReply(hub, rs) {
    const out = [];
    let bytes = 0;
    for (const e of (hub != null && this._outbox.get(hub)?.l) || []) { if (out.length && bytes + e.body.length > HUB_BATCH_BYTES) break; out.push(e.body); bytes += e.body.length; }
    return new Response(`{"ok":1,"d":[${out.join(',')}]${rs ? `,"rs":1,"rb":${JSON.stringify(this._boot)}` : ''}}`, { headers: { 'content-type': 'application/json' } });
  }
}
