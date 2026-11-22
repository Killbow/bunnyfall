// The `cfg` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom, tokenGate } from '../../relay.js';
import { relayCfgValue, mayRelayCfg } from '../../../../src/net/relayCfg.js';
import { relayCfgRefusal } from '../../worker/relayCfg.js';

export async function cfgFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, (b, t) => tokenGate(b, t, 1, 4), 'cfgbucket', 'cfgdrops', 'too many settings')) return;
  if (!isSocialRoom(a.key)) { this._junk(ws); return; }
  if (!mayRelayCfg(a.glyphs)) { this._send(ws, JSON.stringify({ t: 'cfg', k: m.k, error: 'only a developer may change the relay\'s settings' })); return; }
  const no = m.v === null ? null : relayCfgRefusal(m.k, m.v);
  if (no) { this._send(ws, JSON.stringify({ t: 'cfg', k: m.k, error: no })); return; }
  const cfg = { ...(await this._relayCfgOf()) };
  if (m.v === null) delete cfg[m.k]; else cfg[m.k] = m.v;
  await this.state.storage.put('relaycfg', cfg);
  this._cfgKept(cfg, m.k);
  console.info('[cfg] set', m.k, m.v === null ? '(the var)' : m.v);
  this._send(ws, JSON.stringify({ t: 'cfg', k: m.k, v: relayCfgValue(cfg, this.env, m.k) ?? '' }));
  return;
}
