// The hub's social frame: what an account's friends and tabs are told, and its presence rows and
// whole picture. Its dispatch answers the friend request, accept, and remove words.
import { ACCOUNT_TABS_MAX, INVITE_TTL_MS, FRIENDS_MAX, PENDING_MAX } from '../relay.js';
import { hasEntry, without } from '../room/keys.js';

export class FriendsPart {
  _sayTo(acct, s, except = null) { for (const ws of this._socketsOf(acct, except)) this._send(ws, s); }
  _sayError(ws, m) { this._send(ws, JSON.stringify({ t: 'social', k: 'error', m })); }
  _sayNote(to, code, acct, name) { this._sayTo(to, JSON.stringify({ t: 'social', k: 'note', code, acct, name: name ?? null })); }
  _rowOf(acct, rec, now, except = null) {
    const socks = this._socketsOf(acct, except);
    return { acct, name: rec?.name ?? null, online: socks.length > 0, seen: socks.length ? now : (rec?.seen ?? null), peers: socks.slice(0, ACCOUNT_TABS_MAX).map((ws) => this._attach(ws).id) };
  }
  _blankRow(acct, rec) { return { acct, name: rec?.name ?? null, online: false, seen: null, peers: [] }; }
  async _sayState(acct, rec, now, only = null) {
    const socks = this._socketsOf(acct);
    if (!only && !socks.length) return;
    const [party, mine] = await this._myParty(acct, rec, now);
    const live = (mine.invites ?? []).filter((i) => now - i.at < INVITE_TTL_MS);
    const parties = await this._partiesOf(live.map((i) => i.party));
    const invites = live.filter((i) => parties.has(i.party)).map((i) => [i, parties.get(i.party)]);
    const ids = [...mine.friends, ...mine.in.map((e) => e.acct), ...mine.out.map((e) => e.acct), ...(party?.members ?? [])];
    for (const [i, p] of invites) ids.push(i.from, ...p.members);
    const recs = await this._accts(ids);
    const row = (id) => this._rowOf(id, recs.get(id), now);
    const blank = (id) => this._blankRow(id, recs.get(id));
    const frame = {
      t: 'social', k: 'state', acct, name: mine.name,
      peers: socks.map((ws) => this._attach(ws).id),
      friends: mine.friends.map(row),
      in: mine.in.map((e) => ({ ...blank(e.acct), at: e.at })),
      out: mine.out.map((e) => ({ ...blank(e.acct), at: e.at })),
      party: party ? this._partyView(party, recs, now) : null,
      invites: invites.map(([i, p]) => ({ party: p.id, from: { acct: i.from, name: recs.get(i.from)?.name ?? null }, members: p.members.map((id) => ({ acct: id, name: recs.get(id)?.name ?? null })), at: i.at, expires: i.at + INVITE_TTL_MS })),
    };
    const s = JSON.stringify(frame);
    if (only) this._send(only, s); else this._sayTo(acct, s);
  }
  _sayPresence(acct, rec, now, except = null) {
    const out = JSON.stringify({ t: 'social', k: 'presence', ...this._rowOf(acct, rec, now, except) });
    for (const f of rec.friends) this._sayTo(f, out, except);
  }
  _targetOf(me, m) {
    if (m.acct) return m.acct === me ? { error: 'that is you' } : { acct: m.acct };
    for (const [, b] of this._withId(m.peer, null)) { if (!b.acct) return { error: 'they have no account' }; return b.acct === me ? { error: 'that is you' } : { acct: b.acct }; }
    return { error: 'they are not online' };
  }
  async _social(ws, a, m, now) {
    const me = a.acct;
    const rec = await this._acct(me);
    if (!rec) return 'no account';
    switch (m.k) {
      case 'friend.request': return this._friendRequest(me, rec, m, now);
      case 'friend.accept': return this._friendAccept(me, rec, m.acct, now);
      case 'friend.decline': return this._friendUnlist(me, rec, m.acct, now, 'in', 'out');
      case 'friend.cancel': return this._friendUnlist(me, rec, m.acct, now, 'out', 'in');
      case 'friend.remove': return this._friendRemove(me, rec, m.acct, now);
      case 'party.invite': return this._partyInvite(me, rec, m, now);
      case 'party.accept': return this._partyAccept(me, rec, m.party, now);
      case 'party.decline': return this._partyDecline(me, rec, m.party, now);
      case 'party.leave': return this._partyLeave(me, rec, now);
      case 'party.kick': return this._partyKick(me, rec, m.acct, now);
      case 'party.lead': return this._partyLead(me, rec, m.acct, now);
      default: return 'unknown act';
    }
  }
  async _friendRequest(me, rec, m, now) {
    const t = this._targetOf(me, m);
    if (t.error) return t.error;
    const them = t.acct;
    if (rec.friends.includes(them)) return 'already friends';
    if (hasEntry(rec.in, them)) return this._friendAccept(me, rec, them, now);
    if (hasEntry(rec.out, them)) return 'already asked';
    if (m.acct) return 'meet them first';
    const trec = await this._acct(them);
    if (!trec) return 'no such player';
    if (rec.friends.length >= FRIENDS_MAX) return 'your friend list is full';
    if (trec.friends.length >= FRIENDS_MAX) return 'their friend list is full';
    if (rec.out.length >= PENDING_MAX) return 'too many requests out';
    if (trec.in.length >= PENDING_MAX) return 'their inbox is full';
    if (this._repeated(me, 'friend.request', them, now)) return 'already asked';
    const mine = { ...rec, out: [...rec.out, { acct: them, at: now }] };
    const theirs = { ...trec, in: [...trec.in, { acct: me, at: now }] };
    await this._putAccts({ [me]: mine, [them]: theirs });
    await this._sayState(me, mine, now); await this._sayState(them, theirs, now);
    this._sayNote(them, 'friend.requested', me, mine.name);
    return null;
  }
  async _friendAccept(me, rec, them, now) {
    if (!hasEntry(rec.in, them)) return 'no such request';
    const trec = await this._acct(them);
    if (!trec) { const mine = { ...rec, in: without(rec.in, them) }; await this._putAcct(me, mine); await this._sayState(me, mine, now); return 'no such player'; }
    if (rec.friends.length >= FRIENDS_MAX) return 'your friend list is full';
    if (trec.friends.length >= FRIENDS_MAX) return 'their friend list is full';
    const mine = { ...rec, in: without(rec.in, them), out: without(rec.out, them), friends: rec.friends.includes(them) ? rec.friends : [...rec.friends, them] };
    const theirs = { ...trec, in: without(trec.in, me), out: without(trec.out, me), friends: trec.friends.includes(me) ? trec.friends : [...trec.friends, me] };
    await this._putAccts({ [me]: mine, [them]: theirs });
    await this._sayState(me, mine, now); await this._sayState(them, theirs, now);
    this._sayNote(them, 'friend.accepted', me, mine.name);
    return null;
  }
  async _friendUnlist(me, rec, them, now, mineList, theirList) {
    if (!hasEntry(rec[mineList], them)) return 'no such request';
    const trec = await this._acct(them);
    const mine = { ...rec, [mineList]: without(rec[mineList], them) };
    const puts = { [me]: mine };
    let theirs = null;
    if (trec) { theirs = { ...trec, [theirList]: without(trec[theirList], me) }; puts[them] = theirs; }
    await this._putAccts(puts);
    await this._sayState(me, mine, now); if (theirs) await this._sayState(them, theirs, now);
    return null;
  }
  async _friendRemove(me, rec, them, now) {
    if (!rec.friends.includes(them)) return 'not a friend';
    const trec = await this._acct(them);
    const mine = { ...rec, friends: without(rec.friends, them) };
    const puts = { [me]: mine };
    let theirs = null;
    if (trec) { theirs = { ...trec, friends: without(trec.friends, me) }; puts[them] = theirs; }
    await this._putAccts(puts);
    await this._sayState(me, mine, now); if (theirs) await this._sayState(them, theirs, now);
    return null;
  }
}
