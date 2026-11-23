// Parties on the hub: kept through a bounded cache and stored, a living party's view said to its
// members, and the invite, accept, decline, leave, kick, and lead words.
import { partyKey } from '../room/keys.js';
import { PARTY_OFFLINE_MS, mintPartyId, PARTY_MAX, INVITE_TTL_MS, PARTY_INVITES_MAX, PENDING_MAX } from '../relay.js';
import { withoutRoom } from '../staffFollow.js';

export class PartiesPart {
  async _party(pid) {
    if (this._parties.has(pid)) return this._parties.get(pid);
    const r = await this.state.storage.get(partyKey(pid));
    const party = r && typeof r === 'object' ? r : null;
    this._parties.set(pid, party);
    return party;
  }
  async _partiesOf(pids) {
    const out = new Map();
    const missing = [];
    for (const pid of new Set(pids)) { if (this._parties.has(pid)) { const p = this._parties.get(pid); if (p) out.set(pid, p); } else missing.push(pid); }
    for (let i = 0; i < missing.length; i += 128) {
      const slice = missing.slice(i, i + 128);
      const got = await this.state.storage.get(slice.map(partyKey));
      for (const pid of slice) { const v = got.get(partyKey(pid)); const party = v && typeof v === 'object' ? v : null; this._parties.set(pid, party); if (party) out.set(pid, party); }
    }
    return out;
  }
  async _putParty(party) { this._parties.set(party.id, party); await this.state.storage.put(partyKey(party.id), party); }
  async _delParty(pid) { this._parties.set(pid, null); await this.state.storage.delete(partyKey(pid)); }
  async _livingParty(pid, now) {
    let party = await this._party(pid);
    if (!party) return null;
    const lapsed = party.members.filter((id) => party.away?.[id] != null && now - party.away[id] >= PARTY_OFFLINE_MS && !this._socketsOf(id).length);
    const leaderBefore = party.leader;
    for (const id of lapsed) { if (!party) break; const rec = await this._acct(id); party = await this._partyOut(id, party, now, 'party.lapsed', rec?.name ?? null, { leaderNote: false }); }
    if (party && party.leader !== leaderBefore) { const lrec = await this._acct(party.leader); for (const m of party.members) this._sayNote(m, 'party.leader', party.leader, lrec?.name ?? null); }
    return party;
  }
  async _myParty(acct, rec, now) {
    if (!rec.party) return [null, rec];
    const party = await this._livingParty(rec.party, now);
    if (party && party.members.includes(acct)) return [party, rec];
    const next = { ...rec, party: null };
    await this._putAcct(acct, next);
    this._markParty(acct, null);
    return [null, next];
  }
  _markParty(acct, pid) { for (const ws of this._socketsOf(acct)) { const b = this._attach(ws); if ((b.party ?? null) !== pid) this._setAttach(ws, { ...b, party: pid }); } }
  _partyView(party, recs, now, except = null) {
    const members = party.members.map((id) => {
      let pm = null;
      for (const ws of this._socketsOf(id, except)) { const b = this._attach(ws); if (b.pm && (!pm || b.pm.at > pm.at)) pm = b.pm; }
      let p = null;
      if (pm) { p = withoutRoom(pm); delete p.at; }
      return { ...this._rowOf(id, recs.get(id), now, except), p };
    });
    return { id: party.id, leader: party.leader, members };
  }
  async _sayParty(party, now, except = null) {
    const recs = await this._accts(party.members);
    const out = JSON.stringify({ t: 'social', k: 'party', party: this._partyView(party, recs, now, except) });
    for (const id of party.members) this._sayTo(id, out, except);
  }
  async _partyOut(acct, party, now, code, name, { leaderNote = true } = {}) {
    if (!party.members.includes(acct)) return party;
    const members = party.members.filter((m) => m !== acct);
    const away = { ...(party.away ?? {}) }; delete away[acct];
    if (!members.length) { await this._delParty(party.id); return null; }
    const leader = party.leader === acct ? (members.find((id) => this._socketsOf(id).length) ?? members[0]) : party.leader;
    const next = { ...party, members, leader, away };
    await this._putParty(next);
    for (const m of members) this._sayNote(m, code, acct, name);
    if (leaderNote && leader !== party.leader) { const lrec = await this._acct(leader); for (const m of members) this._sayNote(m, 'party.leader', leader, lrec?.name ?? null); }
    await this._sayParty(next, now);
    return next;
  }
  async _partyInvite(me, rec, m, now) {
    const t = this._targetOf(me, m);
    if (t.error) return t.error;
    const them = t.acct;
    // Refuse a non-friend named by account before the online check, or the reply reveals whether
    // any id is online.
    if (m.acct && !rec.friends.includes(them)) return 'meet them first';
    if (!this._socketsOf(them).length) return 'they are not online';
    const trec = await this._acct(them);
    if (!trec) return 'no such player';
    let [party, mine] = await this._myParty(me, rec, now);
    let made = false;
    if (!party) {
      party = { id: mintPartyId(Math.random, now), leader: me, members: [me], invites: [], away: {}, at: now };
      mine = { ...mine, party: party.id };
      made = true;
    }
    if (party.members.includes(them)) return 'already in your party';
    if (party.members.length >= PARTY_MAX) return 'the party is full';
    const live = party.invites.filter((i) => now - i.at < INVITE_TTL_MS && i.acct !== them);
    if (live.length >= PARTY_INVITES_MAX) return 'too many invites out';
    const tinv = (trec.invites ?? []).filter((i) => now - i.at < INVITE_TTL_MS && i.party !== party.id);
    if (tinv.length >= PENDING_MAX) return 'their invites are full';
    if (this._repeated(me, 'party.invite', them, now)) return 'already asked';
    const next = { ...party, invites: [...live, { acct: them, at: now }] };
    const theirs = { ...trec, invites: [...tinv, { party: party.id, from: me, at: now }] };
    await this._putParty(next);
    const puts = { [them]: theirs };
    if (made) puts[me] = mine;
    await this._putAccts(puts);
    if (made) this._markParty(me, next.id);
    const recs = await this._accts(next.members);
    this._sayTo(them, JSON.stringify({ t: 'social', k: 'invite', party: next.id, from: { acct: me, name: mine.name }, members: next.members.map((id) => ({ acct: id, name: recs.get(id)?.name ?? null })), at: now, expires: now + INVITE_TTL_MS }));
    if (made) await this._sayParty(next, now);
    this._sayNote(me, 'party.invited', them, trec.name);
    return null;
  }
  async _partyAccept(me, rec, pid, now) {
    const inv = (rec.invites ?? []).find((i) => i.party === pid);
    if (!inv) return 'no such invite';
    const shed = { ...rec, invites: rec.invites.filter((i) => i.party !== pid) };
    const refuse = async (why) => { await this._putAcct(me, shed); await this._sayState(me, shed, now); return why; };
    if (now - inv.at >= INVITE_TTL_MS) return refuse('that invite has lapsed');
    const party = await this._livingParty(pid, now);
    if (!party) return refuse('that party is gone');
    if (party.members.includes(me)) return refuse('you are in that party already');
    if (party.members.length >= PARTY_MAX) return refuse('the party is full');
    let mine = shed;
    const [old] = await this._myParty(me, mine, now);
    if (old) await this._partyOut(me, old, now, 'party.left', mine.name);
    const away = { ...(party.away ?? {}) }; delete away[me];
    const next = { ...party, members: [...party.members, me], invites: party.invites.filter((i) => i.acct !== me), away };
    mine = { ...mine, party: pid };
    await this._putParty(next);
    await this._putAcct(me, mine);
    this._markParty(me, pid);
    await this._sayState(me, mine, now);
    for (const member of party.members) this._sayNote(member, 'party.joined', me, mine.name);
    await this._sayParty(next, now);
    return null;
  }
  async _partyDecline(me, rec, pid, now) {
    const inv = (rec.invites ?? []).find((i) => i.party === pid);
    if (!inv) return 'no such invite';
    const mine = { ...rec, invites: rec.invites.filter((i) => i.party !== pid) };
    await this._putAcct(me, mine);
    const party = await this._party(pid);
    if (party) await this._putParty({ ...party, invites: party.invites.filter((i) => i.acct !== me) });
    await this._sayState(me, mine, now);
    if (now - inv.at < INVITE_TTL_MS && party?.members.includes(inv.from)) this._sayNote(inv.from, 'party.declined', me, mine.name);
    return null;
  }
  async _partyLeave(me, rec, now) {
    const [party, mine] = await this._myParty(me, rec, now);
    if (!party) return 'you are not in a party';
    await this._partyOut(me, party, now, 'party.left', mine.name);
    const next = { ...mine, party: null };
    await this._putAcct(me, next);
    this._markParty(me, null);
    this._sayTo(me, JSON.stringify({ t: 'social', k: 'party', party: null }));
    return null;
  }
  async _partyKick(me, rec, them, now) {
    const [party] = await this._myParty(me, rec, now);
    if (!party) return 'you are not in a party';
    if (party.leader !== me) return 'only the leader can do that';
    if (them === me) return 'that is you';
    if (!party.members.includes(them)) return 'they are not in your party';
    const trec = await this._acct(them);
    await this._partyOut(them, party, now, 'party.kicked', trec?.name ?? null);
    if (trec) await this._putAcct(them, { ...trec, party: null });
    this._markParty(them, null);
    this._sayTo(them, JSON.stringify({ t: 'social', k: 'party', party: null }));
    this._sayNote(them, 'party.kicked', them, trec?.name ?? null);
    return null;
  }
  async _partyLead(me, rec, them, now) {
    const [party] = await this._myParty(me, rec, now);
    if (!party) return 'you are not in a party';
    if (party.leader !== me) return 'only the leader can do that';
    if (them === me) return 'that is you';
    if (!party.members.includes(them)) return 'they are not in your party';
    if (!this._socketsOf(them).length) return 'they are not online';
    const next = { ...party, leader: them };
    await this._putParty(next);
    const trec = await this._acct(them);
    for (const m of next.members) this._sayNote(m, 'party.leader', them, trec?.name ?? null);
    await this._sayParty(next, now);
    return null;
  }
}
