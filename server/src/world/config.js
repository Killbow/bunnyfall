// The relay settings the hub holds in storage, read once a wake and refreshed from the hub.
// A saved setting is held and its lease door told to every socket in the room.
import { relayCfgValue, RELAY_CFG_TTL_MS, RELAY_INTERNAL_CFG } from '../../../src/net/relayCfg.js';
import { SOCIAL_ROOM } from '../relay.js';
import { ROOM_CALL_MS } from '../relayScale.js';

export class ConfigPart {
  async _relayCfgOf() {
    if (this._relayCfg === undefined) { const v = await this.state.storage.get('relaycfg'); this._relayCfg = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    return this._relayCfg;
  }
  _cfgKept(cfg, k) {
    this._relayCfg = cfg; this._herald = undefined; this._bodyCfg = undefined;
    if (k !== 'leaseDoor') return;
    const said = `{"t":"ldo","on":${relayCfgValue(cfg, this.env, 'leaseDoor') === 'on' ? 1 : 0}}`;
    for (const [other, b] of this._all()) if (b.id) this._send(other, said);
  }
  async _relayCfgFresh(now) {
    if (now - this._relayCfgAt < RELAY_CFG_TTL_MS) return;
    // Stamp before the ask, so unawaited calls from beats send one ask per TTL; `_relayCfgAsk`
    // catches every failure, since nobody awaits it.
    this._relayCfgAt = now;
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return;
    await (this._relayCfgP = this._relayCfgAsk(rooms));
  }
  async _relayCfgAsk(rooms) {
    try {
      const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${RELAY_INTERNAL_CFG}`, { signal: AbortSignal.timeout(ROOM_CALL_MS) }));
      const v = res?.ok ? await res.json() : null;
      if (v && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v) !== JSON.stringify(this._relayCfg ?? {})) { this._relayCfg = v; this._bodyCfg = undefined; }
    } catch (e) { console.warn('[cfg] the hub did not answer', e?.message ?? e); }
  }
}
