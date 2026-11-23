// The say and whisper lines of a room, each struck against its budget before its fan.
import { staffLine } from '../staffFreeze.js';
import { isSocialRoom, tokenGate, GUILD_CHAT_ROOM_HZ_MAX, PARTY_CHAT_ROOM_HZ_MAX, CHAT_ROOM_HZ_MAX, isChatRoom, inRange } from '../relay.js';
import { isArenaPrivateRoom } from '../../../src/net/arenaLaw.js';
import { foldFind } from '../../../src/net/hubShards.js';

export class ChatLinesPart {
  async _sayLine(ws, a, ch, frame, now) {
    const words = frame.t === 'chat';
    if (ch === 'staff') { staffLine(this, ws, a, frame, now); return; }
    if (ch === 'guild') {
      if (!isSocialRoom(a.key)) { this._junk(ws); return; }
      if (!a.gi) return;
      const budget = tokenGate(this._guildChat, now, GUILD_CHAT_ROOM_HZ_MAX);
      this._guildChat = budget.bucket;
      if (!budget.pass) return;
      if (words) frame = await this._stamped(ws, a, ch, frame);
      if (!frame) return;
      const line = JSON.stringify({ ...frame, ch: 'guild' });
      for (const other of [...(this._byGuild().get(a.gi) ?? [])]) this._send(other, line);
      return;
    }
    if (ch === 'party') {
      if (!isSocialRoom(a.key) || !a.acct) { this._junk(ws); return; }
      if (!a.party) return;
      const budget = tokenGate(this._partyChat, now, PARTY_CHAT_ROOM_HZ_MAX);
      this._partyChat = budget.bucket;
      if (!budget.pass) return;
      let party = null;
      try { party = await this._livingParty(a.party, now); } catch (e) { console.warn('[hub] party line failed', e?.message ?? e); return; }
      if (!party || !party.members.includes(a.acct)) { this._markParty(a.acct, null); return; }
      if (words) frame = await this._stamped(ws, a, ch, frame);
      if (!frame) return;
      const line = JSON.stringify({ ...frame, ch: 'party' });
      for (const member of party.members) for (const other of this._socketsOf(member)) this._send(other, line);
      return;
    }
    if (ch === 'whisper') { await this._whisperLine(ws, a, frame, now); return; }
    const S = isArenaPrivateRoom(a.key) ? await this._sessionOf() : null;
    if (isArenaPrivateRoom(a.key) && !S?.members?.[a.sub]) return;
    const wait = words ? this._newVoiceWait(a, now) : 0;
    if (wait > 0) { this._send(ws, JSON.stringify({ t: 'slowed', ms: Math.ceil(wait) })); return; }
    const room = tokenGate(this._roomChat, now, CHAT_ROOM_HZ_MAX);
    this._roomChat = room.bucket;
    if (!room.pass) return;
    if (words) this._newVoiceSpends(a, now);
    if (words) frame = await this._stamped(ws, a, ch, frame);
    if (!frame) return;
    const out = JSON.stringify(frame);
    const chat = isChatRoom(a.key);
    if (chat && !S && this._vper.size) { this._vsendAll(out); for (const [other, b] of this._reals()) if (b.id) this._send(other, out); return; }
    for (const [other, b] of this._all()) {
      if (!b.id || (S && !S.members[b.sub])) continue;
      if (other === ws || chat || inRange(a.key ?? '', a.pose, b.pose)) this._send(other, out);
    }
  }
  async _whisperLine(ws, a, frame, now) {
    if (!isSocialRoom(a.key) || !a.acct) { this._junk(ws); return; }
    const wait = this._newVoiceWait(a, now);
    if (wait > 0) { this._send(ws, JSON.stringify({ t: 'slowed', ms: Math.ceil(wait) })); return; }
    this._whisperAt ??= new WeakMap();
    if (now - (this._whisperAt.get(ws) ?? 0) < 250) return;
    this._whisperAt.set(ws, now);
    const q = foldFind(frame.to);
    if (!q) return;
    const raw = String(frame.to ?? '').trim().toLowerCase();
    let exact = null; const folded = new Map(); const starts = new Map();
    for (const [w, b] of this._all()) {
      if (b.hid || !b.id || !b.acct || b.acct === a.acct || this._dead.has(w) || this._gone.has(w)) continue;
      let f = this._folds.get(b);
      if (f === undefined) this._folds.set(b, f = foldFind(b.name));
      if (String(b.name ?? '').trim().toLowerCase() === raw) { exact = b; break; }
      if (f === q) folded.set(b.acct, b);
      else if (f.startsWith(q)) starts.set(b.acct, b);
    }
    const near = folded.size ? folded : starts;
    const to = exact ?? (near.size === 1 ? [...near.values()][0] : null);
    if (!to) { this._send(ws, JSON.stringify({ t: 'chat', ch: 'whisper', text: frame.text, to: frame.to, miss: near.size > 1 ? 'many' : 'none', id: a.id, name: a.name ?? '' })); return; }
    const budget = tokenGate(this._partyChat, now, PARTY_CHAT_ROOM_HZ_MAX);
    this._partyChat = budget.bucket;
    if (!budget.pass) return;
    this._newVoiceSpends(a, now);
    const said = await this._stamped(ws, a, 'whisper', frame);
    if (!said) return;
    const line = JSON.stringify({ ...said, ch: 'whisper', to: to.name });
    for (const other of new Set([...this._socketsOf(to.acct), ...this._socketsOf(a.acct)])) this._send(other, line);
  }
}
