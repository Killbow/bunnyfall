import { GUILD_OUTS_MAX, GUILD_OUTS_KEY, GUILD_OUT_KEEP_S } from '../room/holds.js';

export class GuildWordsPart {
  _holdGuildOut(gi, gm, i) {
    const k = gm === undefined ? gi : `${gi}:${gm}`;
    const held = this._guildOuts.get(k);
    if (held !== undefined && held >= i) return;
    this._guildOuts.delete(k);
    if (this._guildOuts.size >= GUILD_OUTS_MAX) this._guildOuts.delete(this._guildOuts.keys().next().value);
    this._guildOuts.set(k, i);
  }
  _loadGuildOuts(nowS = Math.floor(Date.now() / 1000)) {
    this._guildOutsLoad ??= (async () => {
      const kept = await this.state.storage.get(GUILD_OUTS_KEY);
      if (!kept || typeof kept !== 'object') return;
      for (const [k, i] of Object.entries(kept)) {
        if (typeof k !== 'string' || !Number.isSafeInteger(i) || i < nowS - GUILD_OUT_KEEP_S) continue;
        if (!(this._guildOuts.get(k) >= i)) this._guildOuts.set(k, i);
      }
    })();
    return this._guildOutsLoad;
  }
  async _saveGuildOuts(nowS) {
    for (const [k, i] of this._guildOuts) if (i < nowS - GUILD_OUT_KEEP_S) this._guildOuts.delete(k);
    await this.state.storage.put(GUILD_OUTS_KEY, Object.fromEntries(this._guildOuts));
  }
  _guildOutAfter(gi, gm, i) {
    const all = this._guildOuts.get(gi);
    const one = gm === undefined ? undefined : this._guildOuts.get(`${gi}:${gm}`);
    return (all !== undefined && all > i) || (one !== undefined && one > i);
  }
  _unguild(a) { const b = { ...a }; delete b.gi; delete b.gt; delete b.gm; delete b.rb; return b; }
  _guildFrame(id, gt) { return JSON.stringify(gt ? { t: 'guild', id, gt } : { t: 'guild', id }); }
}
