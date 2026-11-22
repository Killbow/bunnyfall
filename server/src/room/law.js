// The chat law of a room: new voices paced, lines stamped, and staff and mute orders taken.
// It applies bans, closes banned sockets, refuses a banned hello, and loads and saves the bans.
import { isChatRoom, NEW_VOICE_GAP_MS, muteGate, CLOSE_POLICY } from '../relay.js';
import { mintStamp, stampTabOf } from '../../../src/net/safety/chatStamp.js';
import { lawKindOf } from '../worker/asks.js';
import { hiddenLapse } from '../staffHidden.js';
import { json } from './json.js';
import { takeStaffMessage } from '../staffMessage.js';
import { takeStaffEventLaw } from '../staffEvents.js';
import { takeRestartOrder } from '../restartNotice.js';
import { STAFF_ORDER_KINDS, takeStaffOrder } from '../staffFreeze.js';
import { verifyOrder } from '../../../src/net/identityToken.js';
import { GROUND_OLD_WORDS } from './constants.js';
import { BANS_MAX, ORDERS_MAX, BANS_KEY, BAN_KEEP_S } from './holds.js';

export class LawPart {
  _newVoice(a) { return a.gu === 1 || (Array.isArray(a.glyphs) && a.glyphs.includes('sprout')); }
  _newVoiceWait(a, now) {
    if (!isChatRoom(a.key) || !this._newVoice(a)) return 0;
    const at = this._paces.get(a.sub ?? a.id);
    return at === undefined ? 0 : at + NEW_VOICE_GAP_MS - now;
  }
  _newVoiceSpends(a, now) {
    if (!isChatRoom(a.key) || !this._newVoice(a)) return;
    for (const [k, at] of this._paces) { if (at + NEW_VOICE_GAP_MS > now) break; this._paces.delete(k); }
    const k = a.sub ?? a.id;
    // Delete before set so a reset meter moves to the back; the prune walk
    // above needs oldest first.
    this._paces.delete(k);
    this._paces.set(k, now);
  }
  async _stamped(ws, a, ch, frame) {
    const key = a.sub ? await this._receiptKeyOf() : null;
    const sg = key ? await mintStamp({ tab: stampTabOf(a.key, ch), sub: a.sub, name: frame.name, at: frame.at, text: frame.text }, key, { subtle: crypto.subtle }) : '';
    // Signing awaits, and a ban can close the speaker meanwhile; its line then goes to nobody.
    if (this._dead.has(ws) || this._gone.has(ws)) return null;
    return sg ? { ...frame, sg } : frame;
  }
  async _banFrame(ws, m) {
    const now = Date.now();
    if (!this._spend(ws, now, muteGate, 'mbucket', 'mdrops', 'too many mute orders')) return;
    await this._takeOrder(m.order, now, ['ban', 'staffcut'], false);
  }
  async _lawInternal(request) {
    let body = null;
    try { body = await request.json(); } catch { body = null; }
    if (lawKindOf(body?.order) === 'hide') { const ok = await hiddenLapse(this, body.order, Date.now()); await this._reap(); return json({ ok }); }
    if (lawKindOf(body?.order) === 'smsg') return json(await takeStaffMessage(this, body.order, Date.now()));
    if (lawKindOf(body?.order) === 'sevent') return json(await takeStaffEventLaw(this, body.order, Date.now()));
    if (lawKindOf(body?.order) === 'restart') return json(await takeRestartOrder(this, body.order, Date.now()));
    const ok = await this._takeOrder(body?.order, Date.now(), ['ban', 'mute', 'staffcut'], true);
    await this._reap();
    return json({ ok });
  }
  async _takeOrder(order, now, kinds, hand) {
    if (typeof order !== 'string' || !order || order.length > 1024) return false;
    const kind = lawKindOf(order);
    if (hand && STAFF_ORDER_KINDS.includes(kind)) kinds = STAFF_ORDER_KINDS;
    if (!kinds.includes(kind)) return false;
    await this._loadKey();
    if (!this._verifyKey) return false;
    const nowS = Math.floor(now / 1000);
    const r = await verifyOrder(order, this._verifyKey, { subtle: crypto.subtle, nowS, kind });
    if (!r.ok) return false;
    const c = r.claims;
    if (c.o === 'staffcut') return this._staffCut(c, hand ? order : null);
    if (STAFF_ORDER_KINDS.includes(c.o)) return takeStaffOrder(this, c, order, now, GROUND_OLD_WORDS);
    const ban = c.o === 'ban';
    const sig = order.slice(order.lastIndexOf('.') + 1);
    if (ban) await this._loadBans(nowS);
    const book = ban ? this._bans : this._orders;
    const held = book.get(c.s);
    if (held && (c.i < held.i || held.sig === sig)) return true;
    const bn = ban && c.bn > nowS ? c.bn : 0;
    book.delete(c.s);
    if (book.size >= (ban ? BANS_MAX : ORDERS_MAX)) book.delete(book.keys().next().value);
    book.set(c.s, ban ? { i: c.i, bn, sig } : { i: c.i, mu: c.mu, sig });
    if (ban) await this._saveBans(nowS);
    const told = JSON.stringify(ban ? { t: 'banned', until: bn } : { t: 'muted', until: c.mu });
    const law = hand ? JSON.stringify({ t: 'law', order }) : null;
    for (const [other, b] of [...this._all()]) {
      if (b.sub !== c.s || b.gio > c.i) continue;
      if (law) this._send(other, law);
      if (!ban) this._setAttach(other, { ...b, mu: c.mu });
      this._send(other, told);
      if (bn) this._banClose(other);
    }
    return true;
  }
  async _staffCut(c, order) {
    const nowS = Math.floor(Date.now() / 1000);
    await this._loadBans(nowS);
    const kept = !(this._bans.get(`cut:${c.s}`)?.i >= c.i);
    if (kept) this._bans.set(`cut:${c.s}`, { i: c.i, bn: 0, sig: '' });
    const law = order ? JSON.stringify({ t: 'law', order }) : null;
    for (const [ws, b] of [...this._all()]) if (b.sub === c.s && !(b.gio > c.i)) { if (law) this._send(ws, law); this._banClose(ws, 'staff-cut'); }
    if (kept) await this._saveBans(nowS);
    return true;
  }
  _banClose(ws, why = 'banned') {
    try { ws.close(CLOSE_POLICY, why); } catch {  }
    if (ws.virtual && this._vsocks.get(ws.vid) !== ws) return;
    this._dead.add(ws);
    this._closed(ws);
  }
  async _bannedHello(ws, sub, ti, now) {
    if (typeof sub !== 'string' || !sub) return false;
    const nowS = Math.floor(now / 1000);
    await this._loadBans(nowS);
    if (this._bans.get(`cut:${sub}`)?.i >= (Number.isSafeInteger(ti) ? ti : 0)) { this._metrics.c.refusals++; this._banClose(ws, 'staff-cut'); return true; }
    const ban = this._bans.get(sub);
    if (!ban || !(ban.bn > nowS) || ban.i < (Number.isSafeInteger(ti) ? ti : 0)) return false;
    this._metrics.c.refusals++;
    this._send(ws, JSON.stringify({ t: 'banned', until: ban.bn }));
    this._banClose(ws);
    return true;
  }
  _loadBans(nowS) {
    this._bansLoad ??= (async () => {
      let kept = null;
      try { kept = await this.state.storage.get(BANS_KEY); } catch (e) { this._bansLoad = null; console.warn('[bans] read', e?.message ?? e); return; }
      if (!kept || typeof kept !== 'object') return;
      for (const [s, v] of Object.entries(kept)) {
        if (!Array.isArray(v) || !Number.isSafeInteger(v[0]) || v[0] < nowS - BAN_KEEP_S) continue;
        // A ban heard since the wake can land before this read finishes; keep it when it is newer.
        if (this._bans.get(s)?.i >= v[0]) continue;
        this._bans.set(s, { i: v[0], bn: Number.isSafeInteger(v[1]) ? v[1] : 0, sig: typeof v[2] === 'string' ? v[2] : '' });
      }
    })();
    return this._bansLoad;
  }
  async _saveBans(nowS) {
    for (const [s, b] of this._bans) if (b.i < nowS - BAN_KEEP_S) this._bans.delete(s);
    try { await this.state.storage.put(BANS_KEY, Object.fromEntries([...this._bans].map(([s, b]) => [s, [b.i, b.bn, b.sig]]))); } catch (e) { console.warn('[bans] write', e?.message ?? e); }
  }
}
