// Who the hub can name: a name search, everyone online, and the members of a guild online.
import { foldFind, HUB_FIND_MAX, HUB_WHO_KEEP_MS, HUB_GUILD_WHO_MAX } from '../../../../src/net/hubShards.js';
import { badged, CHAT_ROSTER_MAX } from '../../relay.js';

export class WhoPart {
  _findNames(ws, q) {
    const l = [];
    if (!q) return l;
    for (const [w, b] of this._all()) {
      if (b.hid) continue;
      if (w === ws || !b.id || this._dead.has(w) || this._gone.has(w)) continue;
      let f = this._folds.get(b);
      if (f === undefined) this._folds.set(b, f = foldFind(b.name));
      if (!f.includes(q)) continue;
      l.push(badged({ id: b.id, name: b.name, sub: b.sub }, b));
      if (l.length >= HUB_FIND_MAX) break;
    }
    return l;
  }
  _everyoneSaid(now) {
    if (this._everyone && now - this._everyone.at < HUB_WHO_KEEP_MS) return this._everyone.s;
    const l = [];
    if ((this._vsocks.size ? this._busCount() : this._namedCount()) <= CHAT_ROSTER_MAX) {
      for (const [w, b] of this._all()) {
        if (!b.id || b.hid || this._dead.has(w) || this._gone.has(w)) continue;
        l.push(badged({ id: b.id, name: b.name, sub: b.sub }, b));
        if (l.length >= CHAT_ROSTER_MAX) break;
      }
    }
    this._everyone = { at: now, s: JSON.stringify({ t: 'found', all: 1, l }) };
    return this._everyone.s;
  }
  _guildWho(ws, a) {
    const l = [];
    if (!a.gi) return l;
    const idx = this._all();
    for (const w of this._byGuild().get(a.gi) ?? []) {
      const b = idx.get(w);
      if (w === ws || !b?.id || this._dead.has(w) || this._gone.has(w)) continue;
      l.push(badged({ id: b.id, name: b.name, sub: b.sub }, b));
      if (l.length >= HUB_GUILD_WHO_MAX) break;
    }
    return l;
  }
}
