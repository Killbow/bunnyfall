import { ROOM_CALL_MS } from '../relayScale.js';
import { MATCH_QUEUE_MAX, matchBand, arenaRatingOk, bannerClaim, ARENA_LIVE_MAX, MATCH_REPAIR_MS, arenaBoutRoom, pairQueue, MATCH_ACCEPT_MS, ARENA_TICK_MS, ARENA_HALL, isArenaExhibitionRoom, isArenaPrivateRoom, arenaExhibitionHourOf, arenaBoutIdOf, isArenaHall, privateSessionOver, ARENA_EX_KEEP_MS, ARENA_PRIVATE_KEEP_MS, ARENA_KEEP_MS } from '../../../src/net/arenaLaw.js';
import { arenaId, ARENA_INTERNAL_OPEN, ARENA_SAY_BAND_MS, ARENA_SAVE_MS, ARENA_INTERNAL_LIVE, ARENA_LIVE_TELL_MS } from '../room/keys.js';
import { json } from '../room/json.js';
import { stateWord, liveEntry, openBout, boutFinished, fighterOfSub, joinBout, seatOnMark, poseOf, aiWords, hpWord, refBlow, yieldOf, cheerOf, fighterGone, leaveSeat, stepBout, sessionHist } from '../../../src/net/arenaBrain.js';
import { exhibitionOpening, exhibitionBoutId } from '../../../src/net/arenaExhibition.js';
import { sharedClassicMinutes } from '../relay.js';
import { rand01 } from '../room/dice.js';
import { mintArenaReceipt } from '../../../src/net/arenaReceipt.js';

export class ArenaPart {
  _arenaSend(ws, w) { return this._send(ws, JSON.stringify({ t: 'arena', ...w })); }
  _arenaSocketsOf(sub) { return [...this._all()].filter(([, b]) => b.id && b.sub === sub).map(([w]) => w); }
  _arenaTell(sub, w) { for (const s of this._arenaSocketsOf(sub)) this._arenaSend(s, w); }
  async _arenaPost(key, path, body) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return true;
    try { const res = await rooms.get(rooms.idFromName(key)).fetch(new Request(`https://relay.internal${path}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ROOM_CALL_MS) })); return !!res?.ok; }
    catch (e) { console.warn('[arena] post', path, e?.message ?? e); return false; }
  }
  async _hallOf() {
    if (this._hall === undefined) {
      const v = await this.state.storage.get('arenahall');
      this._hall = v && typeof v === 'object' ? v : { q: [], offers: [], live: {}, apart: [], said: {} };
    }
    return this._hall;
  }
  async _hallSave() { await this.state.storage.put('arenahall', this._hall); }
  async _hallArm(now) {
    const at = await this.state.storage.getAlarm();
    if (at == null || at > now + 1000) await this.state.storage.setAlarm(now + 1000);
  }
  _bill(e) { return { n: e.name, r: e.rating, ...(e.title ? { t: e.title } : {}), ...(e.banner ? { b: e.banner } : {}) }; }
  _casualWord(e) { return e?.casual ? { u: 1 } : {}; }
  _queueWord(H, now, sub) {
    const e = H.q.find((x) => x.sub === sub);
    return e ? { k: 'qd', n: Math.min(MATCH_QUEUE_MAX, H.q.length), band: matchBand(now - e.at) } : null;
  }
  async _hallWord(ws, a, m, now) {
    const H = await this._hallOf();
    const sub = a.sub;
    const inOffer = H.offers.find((f) => f.a.sub === sub || f.b.sub === sub) ?? null;
    if (m.k === 'q') {
      if (!a.lk) { this._arenaSend(ws, { k: 'qx', m: 'guest' }); return; }
      if (inOffer) { this._arenaSend(ws, { k: 'of', o: inOffer.o, vs: this._bill(inOffer.a.sub === sub ? inOffer.b : inOffer.a), until: inOffer.until, ...this._casualWord(inOffer.a) }); return; }
      if (!H.q.some((x) => x.sub === sub)) {
        if (H.q.length >= MATCH_QUEUE_MAX) { this._arenaSend(ws, { k: 'qx', m: 'full' }); return; }
        H.q.push({ sub, name: a.name, rating: arenaRatingOk(a.ar), title: a.title ?? null, lv: a.lv ?? 1, banner: bannerClaim(m.b), casual: m.u === 1, at: now });
        await this._hallSave();
      }
      this._arenaTell(sub, this._queueWord(H, now, sub));
      await this._hallArm(now);
      return;
    }
    if (m.k === 'x') {
      const was = H.q.length;
      H.q = H.q.filter((x) => x.sub !== sub);
      if (inOffer) await this._hallDecline(H, inOffer, sub, now);
      if (H.q.length !== was || inOffer) await this._hallSave();
      this._arenaTell(sub, { k: 'qx', m: 'left' });
      return;
    }
    if (m.k === 'y' || m.k === 'n') {
      if (!inOffer || inOffer.o !== m.o) { this._arenaSend(ws, { k: 'qx', m: 'lapsed' }); return; }
      if (m.k === 'n') { await this._hallDecline(H, inOffer, sub, now); this._arenaTell(sub, { k: 'qx', m: 'left' }); await this._hallSave(); return; }
      if (inOffer.a.sub === sub) inOffer.ya = true; else inOffer.yb = true;
      if (inOffer.ya && inOffer.yb) await this._hallGo(H, inOffer, now);
      await this._hallSave();
      return;
    }
    if (m.k === 'ls') { this._arenaSend(ws, this._liveWord(H, now)); return; }
    this._junk(ws);
  }
  _liveWord(H, now) {
    const l = Object.values(H.live).filter((e) => now - e.at < 30 * 60_000).sort((x, y) => y.at - x.at).slice(0, ARENA_LIVE_MAX);
    return { k: 'live', l };
  }
  async _hallDecline(H, f, sub, now) {
    H.offers = H.offers.filter((x) => x !== f);
    const other = f.a.sub === sub ? f.b : f.a;
    if (!H.q.some((x) => x.sub === other.sub)) H.q.push(other);
    H.apart.push([f.a.sub, f.b.sub, now + MATCH_REPAIR_MS]);
    this._arenaTell(other.sub, { k: 'qx', m: 'declined' });
    this._arenaTell(other.sub, this._queueWord(H, now, other.sub));
  }
  async _hallGo(H, f, now) {
    H.offers = H.offers.filter((x) => x !== f);
    // Mint a new bout id instead of reusing the offer id: both players see the offer id early,
    // and a ladder bout may already hold that room.
    const o = arenaId();
    const fighters = [f.a, f.b].map((e) => ({ sub: e.sub, name: e.name, lv: e.lv, rating: e.rating, title: e.title, banner: e.banner ?? null }));
    const ok = await this._arenaPost(arenaBoutRoom(o), ARENA_INTERNAL_OPEN, { o, kind: 'pvp', f: fighters, casual: !!f.a.casual, at: now });
    if (!ok) {
      for (const e of [f.a, f.b]) { if (!H.q.some((x) => x.sub === e.sub)) H.q.push(e); this._arenaTell(e.sub, { k: 'qx', m: 'busy' }); }
      return;
    }
    H.live[o] = { o, kind: 'pvp', a: this._bill(f.a), b: this._bill(f.b), ...this._casualWord(f.a), sp: 0, at: now };
    this._arenaTell(f.a.sub, { k: 'go', o, side: 0, vs: this._bill(f.b), ...this._casualWord(f.a) });
    this._arenaTell(f.b.sub, { k: 'go', o, side: 1, vs: this._bill(f.a), ...this._casualWord(f.a) });
  }
  async _hallTick(now) {
    const H = await this._hallOf();
    for (const f of [...H.offers]) {
      if (now < f.until) continue;
      H.offers = H.offers.filter((x) => x !== f);
      for (const [e, yes] of [[f.a, f.ya], [f.b, f.yb]]) {
        if (yes) { if (!H.q.some((x) => x.sub === e.sub)) H.q.push(e); this._arenaTell(e.sub, { k: 'qx', m: 'lapsed' }); this._arenaTell(e.sub, this._queueWord(H, now, e.sub)); }
        else this._arenaTell(e.sub, { k: 'qx', m: 'lapsed' });
      }
      H.apart.push([f.a.sub, f.b.sub, now + MATCH_REPAIR_MS]);
    }
    H.apart = H.apart.filter((p) => p[2] > now);
    H.q = H.q.filter((e) => this._arenaSocketsOf(e.sub).length);
    const apart = (x, y) => H.apart.some((p) => (p[0] === x && p[1] === y) || (p[0] === y && p[1] === x));
    for (const [a, b] of pairQueue(H.q, now, apart)) {
      H.q = H.q.filter((x) => x.sub !== a.sub && x.sub !== b.sub);
      const f = { o: arenaId(), a, b, until: now + MATCH_ACCEPT_MS, ya: false, yb: false };
      H.offers.push(f);
      this._arenaTell(a.sub, { k: 'of', o: f.o, vs: this._bill(b), until: f.until, ...this._casualWord(a) });
      this._arenaTell(b.sub, { k: 'of', o: f.o, vs: this._bill(a), until: f.until, ...this._casualWord(a) });
    }
    H.said ??= {};
    for (const e of H.q) {
      const band = matchBand(now - e.at);
      const was = H.said[e.sub];
      if (!was || was.band !== band || now - was.at >= ARENA_SAY_BAND_MS) { H.said[e.sub] = { band, at: now }; this._arenaTell(e.sub, this._queueWord(H, now, e.sub)); }
    }
    for (const k of Object.keys(H.said)) if (!H.q.some((e) => e.sub === k)) delete H.said[k];
    for (const [o, e] of Object.entries(H.live)) if (now - e.at > 30 * 60_000) delete H.live[o];
    await this._hallSave();
    if (H.q.length || H.offers.length) await this.state.storage.setAlarm(now + 1000);
  }
  async _arenaLiveInternal(request) {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad' }, 400); }
    if (!body || typeof body.o !== 'string') return json({ error: 'bad' }, 400);
    const H = await this._hallOf();
    if (body.done) delete H.live[body.o];
    else if (body.e && typeof body.e === 'object') H.live[body.o] = { ...body.e, at: Number.isFinite(body.e.at) ? body.e.at : Date.now() };
    await this._hallSave();
    return json({ ok: true });
  }
  async _boutOf() {
    if (this._bout === undefined) { const v = await this.state.storage.get('arenabout'); this._bout = v && typeof v === 'object' ? v : null; }
    return this._bout;
  }
  async _boutSave(now, force = false) {
    if (!force && now - (this._boutSavedAt ?? 0) < ARENA_SAVE_MS) return;
    this._boutSavedAt = now;
    await this.state.storage.put('arenabout', this._bout);
  }
  async _boutArm(now, at = now + ARENA_TICK_MS) {
    const cur = await this.state.storage.getAlarm();
    if (cur == null || cur > at) await this.state.storage.setAlarm(at);
  }
  _boutFan(words) {
    if (!words?.length) return;
    this._fanFrames(words.map((w) => JSON.stringify({ t: 'arena', ...w })), (b) => b.id && (b.af || b.asp));
  }
  _boutFanState(st) { for (const [ws, b] of [...this._all()]) if (b.id && (b.af || b.asp)) this._arenaSend(ws, stateWord(st, b.afid ?? '')); }
  async _boutTellHall(st, done = false) {
    if (st.priv) return true;
    const e = done ? null : liveEntry(st);
    return this._arenaPost(ARENA_HALL, ARENA_INTERNAL_LIVE, { o: st.o, ...(done ? { done: true } : { e }) });
  }
  async _arenaOpenInternal(request) {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad' }, 400); }
    if (!body || typeof body.o !== 'string' || body.kind !== 'pvp' || !Array.isArray(body.f) || body.f.length !== 2) return json({ error: 'bad' }, 400);
    if (await this._boutOf()) return json({ error: 'taken' }, 409);
    const now = Date.now();
    this._bout = openBout({ o: body.o, kind: 'pvp', f: body.f, casual: body.casual === true, now });
    await this._boutSave(now, true);
    await this._boutArm(now);
    return json({ ok: true });
  }
  async _boutWord(ws, a, m, now) {
    let st = await this._boutOf();
    if (m.k === 'in') {
      const exRoom = isArenaExhibitionRoom(a.key);
      if (isArenaPrivateRoom(a.key)) {
        const S = await this._sessionOf();
        const no = !S ? 'no session' : !S.members[a.sub] ? (S.kicked.includes(a.sub) ? 'removed' : 'not member') : !st ? 'no bout' : null;
        if (no) { this._arenaSend(ws, { k: 'no', m: no }); return; }
      }
      if (!st && exRoom) {
        const hour = arenaExhibitionHourOf(a.key);
        const ex = m.r === 's' ? exhibitionOpening(hour, sharedClassicMinutes(now)) : null;
        if (!ex) { this._arenaSend(ws, { k: 'no', m: 'no bout' }); return; }
        st = this._bout = openBout({ o: exhibitionBoutId(hour), kind: 'ex', f: [], ex, now });
      } else if (!st) {
        if (m.r !== 'f' || m.tier === undefined) { this._arenaSend(ws, { k: 'no', m: 'no bout' }); return; }
        if (typeof m.z !== 'string') { this._arenaSend(ws, { k: 'no', m: 'no bout' }); return; }
        st = this._bout = openBout({ o: arenaBoutIdOf(a.key), kind: 'pve', f: [{ sub: a.sub, name: a.name, lv: m.lv ?? a.lv ?? 1, cl: a.cl ?? null, title: a.title ?? null, banner: m.b ?? null, tk: m.z }], tier: m.tier, bout: m.bout, now });
        await this._boutTellHall(st);
      // Answer a finished bout before `joinBout`, which refuses 'no bout' once the healers end;
      // a returning fighter still needs its result and receipt.
      } else if (boutFinished(st) && (exRoom || fighterOfSub(st, a.sub))) {
        const me = exRoom ? null : fighterOfSub(st, a.sub);
        this._arenaSend(ws, stateWord(st, me?.id ?? ''));
        const r = me ? st.rc?.[a.sub] : null;
        if (r) this._arenaSend(ws, { k: 'rc', r });
        return;
      }
      const before = st.phase;
      const cur = this._attach(ws);
      // `joinBout` takes a seat on every call,
      // so a socket already watching must not call it again.
      const again = m.r === 's' && !!cur.asp && !fighterOfSub(st, a.sub);
      const j = again ? { role: 's' } : joinBout(st, a.sub, m.r, now);
      if (j.no) { this._arenaSend(ws, { k: 'no', m: j.no }); return; }
      if (j.role === 'f') {
        this._setAttach(ws, { ...cur, af: 1, afid: j.id, asp: 0 });
        if (!(st.priv && seatOnMark(st, j.id, now)) && cur.pose) poseOf(st, j.id, cur.pose.x, cur.pose.z, now);
      } else if (!cur.asp) {
        this._setAttach(ws, { ...cur, asp: 1 });
        this._boutFan([{ k: 'sp', n: st.spectators }]);
        if (now - (this._boutHallAt ?? 0) >= ARENA_LIVE_TELL_MS) { this._boutHallAt = now; await this._boutTellHall(st); }
      }
      if (before === 'wait' && st.phase === 'law') this._boutFanState(st);
      else this._arenaSend(ws, stateWord(st, j.role === 'f' ? j.id : ''));
      if (st.ai.length) for (const w of aiWords(st, now)) this._arenaSend(ws, w);
      if (st.b) this._arenaSend(ws, hpWord(st));
      const r = st.rc?.[a.sub];
      if (r && j.role === 'f') this._arenaSend(ws, { k: 'rc', r });
      await this._boutSave(now, !again);
      if (!boutFinished(st)) await this._boutArm(now);
      return;
    }
    if (!st) { this._junk(ws); return; }
    const cur = this._attach(ws);
    if (m.k === 'hit') {
      if (!cur.af || !cur.afid) { this._junk(ws); return; }
      const r = refBlow(st, cur.afid, m, now, cur.wa ?? null);
      this._boutFan(r.words);
      return;
    }
    if (m.k === 'yd') {
      if (!cur.af || !cur.afid) { this._junk(ws); return; }
      const r = yieldOf(st, cur.afid, now);
      this._boutFan(r.words);
      if (r.no === 'early') this._arenaSend(ws, { k: 'no', m: 'early' });
      return;
    }
    if (m.k === 'ch') {
      if (!cur.asp) { this._junk(ws); return; }
      const w = cheerOf(st, cur.id, m.c, now);
      if (w) this._boutFan([w]);
      return;
    }
    if (m.k === 'out') return;
    this._junk(ws);
  }
  async _arenaLeave(ws, a, now) {
    if (isArenaHall(a.key)) {
      if (this._arenaSocketsOf(a.sub).some((w) => w !== ws)) return;
      const H = await this._hallOf();
      const f = H.offers.find((x) => x.a.sub === a.sub || x.b.sub === a.sub);
      const was = H.q.length;
      H.q = H.q.filter((x) => x.sub !== a.sub);
      if (f) await this._hallDecline(H, f, a.sub, now);
      if (f || was !== H.q.length) await this._hallSave();
      return;
    }
    const S = isArenaPrivateRoom(a.key) ? await this._sessionOf() : null;
    // Load the bout before the session fan below;
    // `_sessionFan` reads `this._bout`, which is unset after a wake.
    const st = await this._boutOf();
    if (S && S.members[a.sub] && !this._arenaSocketsOf(a.sub).some((w) => w !== ws)) {
      S.members[a.sub].seen = now;
      if (a.sub === S.host) S.hostGoneAt = now;
      await this._sessionSave();
      if (a.sub === S.host) await this._sessionArm(S, now);
      this._sessionFan(S, ws);
    }
    if (!st) return;
    if (a.af && fighterOfSub(st, a.sub)) {
      if (!this._arenaSocketsOf(a.sub).some((w) => w !== ws)) { fighterGone(st, a.sub, now); await this._boutSave(now, true); }
    } else if (a.asp) {
      leaveSeat(st);
      this._boutFan([{ k: 'sp', n: st.spectators }]);
      if (now - (this._boutHallAt ?? 0) >= ARENA_LIVE_TELL_MS) { this._boutHallAt = now; await this._boutTellHall(st); }
    }
  }
  async _arenaTick() {
    const now = Date.now();
    if (this._hall !== undefined || (await this.state.storage.get('arenahall'))) { await this._hallTick(now); return true; }
    const S = await this._sessionOf();
    if (S && privateSessionOver(S, now)) { await this._sessionEnd(S, 'ended'); return true; }
    const st = await this._boutOf();
    if (!st) { if (!S) return false; await this._sessionArm(S, now); return true; }
    const keep = st.kind === 'ex' ? ARENA_EX_KEEP_MS : st.priv ? ARENA_PRIVATE_KEEP_MS : ARENA_KEEP_MS;
    const keptFrom = (b) => (b.priv ? b.doneAt ?? b.endAt ?? b.at : b.endAt || b.at);
    if (boutFinished(st) && st.toldDone) {
      if (now >= keptFrom(st) + keep) {
        if (S) { await this._sessionClear(S, now); return true; }
        this._bout = null; await this.state.storage.delete('arenabout'); return true;
      }
      await this.state.storage.setAlarm(keptFrom(st) + keep);
      return true;
    }
    const ph = st.phase === 'law' ? st.b?.phase : st.phase;
    let words = [];
    try { words = stepBout(st, now, rand01); } catch (e) { console.warn('[arena] beat failed', e?.message ?? e); }
    const ph2 = st.phase === 'law' ? st.b?.phase : st.phase;
    this._boutFan(words);
    if (ph2 !== ph) this._boutFanState(st);
    if (st.owed?.length) {
      const key = await this._receiptKeyOf();
      const nowS = Math.floor(now / 1000);
      st.rc = st.rc ?? {};
      for (const w of st.owed) {
        try {
          const r = await mintArenaReceipt(w, key, { subtle: crypto.subtle, nowS });
          for (const sub of w.a === 'p' ? w.f : [w.s]) st.rc[sub] = r;
        } catch (e) { console.warn('[arena] receipt refused', e?.message ?? e); }
      }
      st.owed = [];
      await this._boutSave(now, true);
      for (const [ws, b] of [...this._all()]) { const r = b.id && b.af ? st.rc[b.sub] : null; if (r) this._arenaSend(ws, { k: 'rc', r }); }
    }
    if (S && st.priv && st.res && !st.histed) { st.histed = true; sessionHist(S, st, now); await this._sessionSave(); this._sessionFan(S); }
    if (boutFinished(st)) {
      st.endAt = Number.isFinite(st.endAt) ? st.endAt : now;
      st.doneAt = Number.isFinite(st.doneAt) ? st.doneAt : now;
      if (!st.toldDone && (await this._boutTellHall(st, true))) st.toldDone = true;
      await this._boutSave(now, true);
      await this.state.storage.setAlarm(st.toldDone ? keptFrom(st) + keep : now + 1000);
      return true;
    }
    await this._boutSave(now);
    await this.state.storage.setAlarm(now + ARENA_TICK_MS);
    return true;
  }
}
