import { followHello } from '../../staffFollow.js';
import { sayRestartTo } from '../../restartNotice.js';
import { gateHolds } from '../../../../src/net/gateLaw.js';
import { serpentHolds } from '../../../../src/net/serpentLaw.js';
import { riteStands, cageStands } from '../../../../src/net/gateRite.js';
import { riteSaid, cageSaid } from '../../world/riteKeys.js';

export class HubHelloPart {
  async _hubHelloWords(ws, m, sub, now) {
    if (m.acct) { try { await this._helloAccount(ws, m, now); } catch (e) { console.warn('[hub] account hello failed', e?.message ?? e); } }
    followHello(this, ws, now);
    { try { await sayRestartTo(this, ws, now); } catch (e) { console.warn('[hub] restart word failed', e?.message ?? e); } }
    { try { const g = await this._gateFellOf(); if (g && gateHolds(g.d, now)) this._send(ws, JSON.stringify({ t: 'gate', ...g })); } catch (e) { console.warn('[hub] gate word failed', e?.message ?? e); } }
    { try { const g = await this._serpentFellsOf(); if (g && serpentHolds(g.d, now)) for (const fell of g.list) this._send(ws, JSON.stringify({ t: 'serpent', ...fell })); } catch (e) { console.warn('[hub] serpent word failed', e?.message ?? e); } }
    if (sub) { try { await this._serpentReceiptTo(ws, sub, now); } catch (e) { console.warn('[hub] serpent receipt failed', e?.message ?? e); } }
    if (sub) { try { await this._gateReceiptTo(ws, sub, now); } catch (e) { console.warn('[hub] gate receipt failed', e?.message ?? e); } }
    if (sub) { try { await this._sdReceiptTo(ws, sub, now); } catch (e) { console.warn('[hub] sd receipt failed', e?.message ?? e); } }
    if (sub) { try { await this._ktReceiptTo(ws, sub, now); } catch (e) { console.warn('[hub] kt receipt failed', e?.message ?? e); } }
    if (sub) { try { await this._egCallTo(ws, sub, now); } catch (e) { console.warn('[hub] eg call failed', e?.message ?? e); } }
    if (sub) { try { await this._egReceiptTo(ws, sub, now); } catch (e) { console.warn('[hub] eg receipts failed', e?.message ?? e); } }
    {
      try {
        const r = await this._riteOf();
        if (r) {
          const stands = riteStands(r.d, now, await this._fellAtOf(r.d)), caged = cageStands(r.d, now);
          for (const c of Object.values(r.c)) {
            if (c.said && stands) this._send(ws, JSON.stringify({ t: 'rite', ...riteSaid(r.d, c) }));
            if (c.cl && caged) this._send(ws, JSON.stringify({ t: 'rite', ...cageSaid(r.d, c) }));
          }
        }
      } catch (e) { console.warn('[hub] rite word failed', e?.message ?? e); }
    }
    { try { const l = await this._raidCleansOf(now); if (l.length) this._send(ws, JSON.stringify({ t: 'raid', k: 'cls', l })); } catch (e) { console.warn('[hub] raid word failed', e?.message ?? e); } }
    if (sub) { try { await this._raidReceiptsTo(ws, sub, now); } catch (e) { console.warn('[hub] raid receipts failed', e?.message ?? e); } }
    { try { const l = await this._starHeldOf(now); if (l.length) this._send(ws, JSON.stringify({ t: 'star', k: 'hds', l })); } catch (e) { console.warn('[hub] star word failed', e?.message ?? e); } }
    if (sub) { try { await this._starReceiptsTo(ws, sub, now); } catch (e) { console.warn('[hub] star receipts failed', e?.message ?? e); } }
    { try { const h = await this._raidTownsWanted(); if (h) this._send(ws, JSON.stringify({ t: 'raid', k: 'tw', h })); } catch (e) { console.warn('[hub] raid towns ask failed', e?.message ?? e); } }
    { try { const r = await this._sdOf(); if (r && r.s > 0) this._send(ws, JSON.stringify({ t: 'sd', k: 'ev', ...r })); } catch (e) { console.warn('[hub] sd word failed', e?.message ?? e); } }
    {
      try {
        const l = (await this._homeWordsHeld(now)).map((w) => ({ m: w.m, u: w.u, d: w.d, i: w.i }));
        if (l.length) this._send(ws, JSON.stringify({ t: 'home', l }));
      } catch (e) { console.warn('[hub] home words failed', e?.message ?? e); }
    }
  }
}
