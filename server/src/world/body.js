// The body count of the boss fights: the line it runs by, the trails, and the counted bodies.
// It says and tells the count, and measures it for the receipt.
import { bodyConfig, BODY_TRAIL_MAX, BODY_TRAIL_MS, bodyStruck, bodyTellOwed, bodyMeasure } from '../../../src/net/bossBody.js';
import { relayCfgValue } from '../../../src/net/relayCfg.js';
import { isGateRoom } from '../../../src/net/gateLaw.js';
import { isSdRoom } from '../../../src/net/sdLaw.js';
import { isKetchRoom } from '../../../src/net/ketch/ketchLaw.js';

export class BodyPart {
  _bodyLine() { return (this._bodyCfg ??= bodyConfig(relayCfgValue(this._relayCfg, this.env, 'bossBody'))); }
  _trailing(a) {
    const sub = a?.sub;
    if (typeof sub !== 'string' || !sub) return false;
    if (isGateRoom(a.key)) { const f = this._fight; return !!f?.players?.[sub] && !f.fell && !f.wrath; }
    if (isSdRoom(a.key)) { const f = this._sdFight; return !!f?.players?.[sub] && !f.fell && !f.lost; }
    if (isKetchRoom(a.key)) { const V = this._kt; return !!V?.players?.[sub] && !V.said; }
    if (!this._serpents?.size) return false;
    for (const f of this._serpents.values()) if (f.players?.[sub] && !f.fell && !f.gone) return true;
    return false;
  }
  _trailPose(ws, p, now) {
    // Keep trails per socket, never per account: a merged trail lets a decoy socket far off make
    // every blow miss.
    const all = (this._trails ??= new Map());
    const tr = all.get(ws) ?? [];
    tr.push([now, p.x, p.y ?? 0, p.z]);
    while (tr.length > BODY_TRAIL_MAX || now - tr[0][0] > BODY_TRAIL_MS) tr.shift();
    all.delete(ws); all.set(ws, tr);
    if (all.size > 256) all.delete(all.keys().next().value);
  }
  _trailOf(ws, frame) {
    const tr = this._trails?.get(ws);
    // Entries are `[t, x, z, y]`: src/net/bossRef.js posAt and posAfter read x and z,
    // posYAt the height.
    if (tr?.length) return tr.map(([t, x, y, z]) => { const c = frame({ x, y, z }); return [t, c.x, c.z, c.y ?? y]; });
    // `[]` means a wake lost the trail, so src/net/bossRef.js posAt reads the position as unknown;
    // `undefined` means no pose since, so posAt uses the current one.
    return Date.now() - this._trailsAt < BODY_TRAIL_MS ? [] : undefined;
  }
  _trailSeed(ws, a, now) { if (a?.pose && !this._trails?.has(ws) && this._trailing(a)) this._trailPose(ws, a.pose, now); }
  _bodiesBare(bodies) { return bodies.map((b) => { const bare = { ...b }; delete bare.tr; return bare; }); }
  async _bodyCount(t, f, hits, now, line, fell = null, extra = {}) {
    const cfg = this._bodyLine();
    for (const { sub, share } of hits) {
      const p = f.players[sub];
      if (!p || !bodyStruck(p, share, now, line) || !cfg.enforce) continue;
      if (fell) await fell(sub);
      p.bd.ta = now;
      this._bodyWord(t, sub, extra);
    }
  }
  _bodyWord(t, sub, extra = {}) {
    const word = JSON.stringify({ t, k: 'bd', ...extra });
    for (const [ws, b] of [...this._courtSockets()]) if (b.id && b.sub === sub) this._send(ws, word);
  }
  _bodyTell(t, f, now, extra = {}, owed = () => true) {
    if (!this._bodyLine().enforce) return;
    for (const [sub, p] of Object.entries(f.players)) if (owed(p) && bodyTellOwed(p, now, true)) this._bodyWord(t, sub, extra);
  }
  _bodyMeasureOf(f, sub, earnedFn) {
    const m = bodyMeasure(f.players[sub], (q) => earnedFn({ ...f, players: { ...f.players, [sub]: q } }, sub));
    return m ? { m } : {};
  }
}
