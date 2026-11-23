// A Royal Tourney's room: a contender's account by peer id, and the ladder and bout frames.
// It says a contender's entry, answers a challenge or its accept, and ends each bout.
import { royalLadder, royalAsk, royalLevel, royalAccept, royalMarks, royalNextBeat, ROYAL_RC_KEEP } from '../../../src/net/siegeRef.js';
import { mintRoyalReceipt } from '../../../src/net/siegeReceipt.js';

export class RoyalPart {
  _royalSubOf(id) {
    for (const [, t] of this._withId(id, null)) if (t.sub) return t.sub;
    return null;
  }
  _royalLadderFrame(b) {
    return { k: 'lad', l: royalLadder(b).map(([sub, w, l]) => [this._siegeSocketOf(sub)?.[1].id ?? '', w, l]) };
  }
  _royalBoutFrame(b) {
    const bt = b.bout;
    if (!bt) return null;
    const ia = this._siegeSocketOf(bt.a)?.[1].id, ib = this._siegeSocketOf(bt.b)?.[1].id;
    return ia && ib ? { k: 'bout', a: ia, b: ib, n: bt.n, s: bt.startMs, e: bt.endMs } : null;
  }
  _royalSay(ws, s, b, sub) {
    this._send(ws, JSON.stringify({ t: 'siege', ...this._royalLadderFrame(b) }));
    const bout = this._royalBoutFrame(b);
    if (bout) this._send(ws, JSON.stringify({ t: 'siege', ...bout }));
    for (const rc of s.royalRc?.[sub] ?? []) this._send(ws, JSON.stringify({ t: 'siege', k: 'won', rc }));
  }
  async _royalHand(ws, a, s, b, m, now) {
    const other = this._royalSubOf(m.to);
    if (!other || !s.fighters[other]) { this._send(ws, JSON.stringify({ t: 'siege', k: 'no', m: 'no such contender' })); return; }
    if (m.k === 'ask') {
      const no = royalAsk(b, a.sub, other, now);
      if (no) { this._send(ws, JSON.stringify({ t: 'siege', k: 'no', m: no })); return; }
      const sk = this._siegeSocketOf(other);
      if (sk) this._send(sk[0], JSON.stringify({ t: 'siege', k: 'ask', id: a.id }));
      return;
    }
    if (!royalLevel(s.fighters[other].pose, s.fighters[a.sub]?.pose)) { this._send(ws, JSON.stringify({ t: 'siege', k: 'no', m: 'the ring is not level' })); return; }
    const r = royalAccept(b, a.sub, other, now);
    if (r.no) { this._send(ws, JSON.stringify({ t: 'siege', k: 'no', m: r.no })); return; }
    const fa = s.fighters[r.bout.a], fb = s.fighters[r.bout.b];
    const [pa, pb] = royalMarks(b, fa.pose, fb.pose);
    const frames = [];
    for (const [sub, f, p] of [[r.bout.a, fa, pa], [r.bout.b, fb, pb]]) {
      Object.assign(f, { pose: p, poseAt: now });
      const sk = this._siegeSocketOf(sub);
      if (sk) { this._send(sk[0], JSON.stringify({ t: 'siege', k: 'back', p })); frames.push({ k: 'hp', id: sk[1].id, h: f.hp, m: f.max }); }
    }
    const bout = this._royalBoutFrame(b);
    this._siegeFan(bout ? [...frames, bout] : frames);
    await this._siegeSave(now, true);
    await this._siegeArm(royalNextBeat(b, now));
  }
  async _royalBoutEnd(s, b, e, now) {
    if (!e) return;
    const frames = [];
    for (const sub of [e.a, e.b]) {
      const f = s.fighters[sub];
      if (!f) continue;
      Object.assign(f, { hp: f.max, down: false, upAt: 0 });
      const sk = this._siegeSocketOf(sub);
      if (sk) frames.push({ k: 'hp', id: sk[1].id, h: f.hp, m: f.max });
    }
    const idOf = (sub) => (sub ? this._siegeSocketOf(sub)?.[1].id ?? '' : '');
    const w = idOf(e.w), l = idOf(e.l);
    frames.push({ k: 'bend', n: e.n, w: e.w ? w : '', l: e.w ? l : '', c: e.counted && w ? 1 : 0 }, this._royalLadderFrame(b));
    this._siegeFan(frames);
    if (e.w && e.l) {
      try {
        const rc = await mintRoyalReceipt({ s: e.w, l: e.l, sk: s.of.sk, sw: s.of.sw, n: e.n }, await this._receiptKeyOf(), { subtle: crypto.subtle, nowS: Math.floor(now / 1000) });
        s.royalRc ??= {};
        s.royalRc[e.w] = [...(s.royalRc[e.w] ?? []), rc].slice(-ROYAL_RC_KEEP);
        const sk = this._siegeSocketOf(e.w);
        if (sk) this._send(sk[0], JSON.stringify({ t: 'siege', k: 'won', rc }));
      } catch (err) { console.warn('[royal] receipt failed', err?.message ?? err); }
    }
    await this._siegeSave(now, true);
  }
}
