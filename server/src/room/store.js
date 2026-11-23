// What a room reads once from storage: the live event, an id's secret, and the keys under a prefix.
// Its sweep forgets looks, secrets, and parties, and never an account or its world.
import { EVENT_KEY, validLiveEvent, isChatRoom, isSocialRoom, SWEEP_PAGE } from '../relay.js';
import { HOLDEM_STAKE_KEEP_S } from './keys.js';

export class StorePart {
  async _liveEvent() {
    if (this._event === undefined) { const e = await this.state.storage.get(EVENT_KEY); this._event = validLiveEvent(e) ? e : null; }
    return this._event;
  }
  async _sweep(key) {
    this._looks.clear();
    const dead = ['hellos'];
    this._secrets.clear();
    const chat = isChatRoom(key), social = isSocialRoom(key), cards = typeof key === 'string' && key.startsWith('interior:');
    if (!chat) { const m = await this.state.storage.list({ prefix: 'look:' }); for (const k of m.keys()) dead.push(k); }
    if (cards) {
      const tables = await this._holdemOf();
      if (tables.size && this._holdemGhosts(tables, Date.now(), true)) await this._holdemSave();
      const iliac = await this._iliacOf();
      if (iliac.size && this._iliacGhosts(iliac, Date.now(), true)) await this._iliacSave();
      const gambit = await this._gambitOf();
      if (gambit.size && this._gambitGhosts(gambit, Date.now(), true)) await this._gambitSave();
      const nowS = Math.floor(Date.now() / 1000), old = nowS - HOLDEM_STAKE_KEEP_S;
      for (const k of await this._keysOf('cstake:')) if (!((await this.state.storage.get(k)) > old)) dead.push(k);
      for (const k of await this._keysOf('cashout:')) if (!((await this.state.storage.get(k)) ?? []).some((x) => x && x.e > nowS)) dead.push(k);
      for (const k of await this._keysOf('iowed:')) if (!((await this.state.storage.get(k)) ?? []).some((x) => x && x.e > nowS)) dead.push(k);
      for (const k of await this._keysOf('gowed:')) if (!((await this.state.storage.get(k)) ?? []).some((x) => x && x.e > nowS)) dead.push(k);
    }
    if (social) { this._parties.clear(); for (const k of await this._keysOf('party:')) dead.push(k); }
    for (let i = 0; i < dead.length; i += 128) await this.state.storage.delete(dead.slice(i, i + 128));
  }
  async _secretOf(id) {
    if (this._secrets.has(id)) return this._secrets.get(id);
    let held = null;
    for (const [, b] of this._all()) if (b.id === id && typeof b.sc === 'string') { held = b.sc; break; }
    if (!this._secrets.has(id)) this._secrets.set(id, held);
    return this._secrets.get(id);
  }
  async _keysOf(prefix) {
    const out = [];
    let after = null;
    for (;;) {
      const page = await this.state.storage.list({ prefix, limit: SWEEP_PAGE, ...(after ? { startAfter: after } : {}) });
      for (const k of page.keys()) { out.push(k); after = k; }
      if (page.size < SWEEP_PAGE) return out;
    }
  }
}
