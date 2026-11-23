// The room's one alarm and the duties it runs in turn: hub sync, boss and table beats, rites,
// raids, and a drained world's forgetting. On the hub it also sweeps lapsed accounts and records,
// a page at a time.
import { isCellDirectory, cellPlanAlarm } from '../cellMoves.js';
import { HUB_SYNC_MS } from '../../../src/net/hubShards.js';
import { PARK_TTL_MS, CARAVAN_DECOR_KEY, RITE_TELL_RETRY_MS, SD_TELL_RETRY_MS, SWEEP_PAGE, ACCOUNT_IDLE_MS, PARTY_OFFLINE_MS, RAID_RC_PREFIX, SERPENT_RC_PREFIX, SD_RC_PREFIX, egCallKey, STAR_RC_PREFIX, SWEEP_STEP_MS, ACCOUNT_SWEEP_MS } from '../relay.js';
import { SERPENT_REST_MS } from '../world/serpentKeys.js';
import { unlisted, raidRcLive } from './limits.js';
import { acctSecretKey } from './keys.js';
import { EG_RC_PREFIX, egRcFold } from '../../../src/net/eliteGates/egDurable.js';
import { KT_RC_PREFIX } from '../../../src/net/wire.js';

export class AlarmPart {
  async alarm() {
    if (isCellDirectory(this)) return cellPlanAlarm(this);
    await this._busSilentSweep(Date.now());
    if (await this._hubKeyOf()) { this._hubSyncAt = 0; await this._hubUpFlush(); this._hubPollEnsure(); if (this.state.getWebSockets().length || this._up.length || this._upRetry) await this.state.storage.setAlarm(Date.now() + HUB_SYNC_MS); return; }
    await this._seaAlarm(Date.now());
    if (await this.state.storage.get('hub')) { await this._relayCfgOf(); await this._sweepHub(Date.now()); await this._heraldBeat(Date.now()); await this._egHeraldBeat(Date.now()); await this._serpentHeraldBeat(Date.now()); await this._sdBeat(Date.now()); await this._sdHeraldBeat(Date.now()); await this._ktHeraldBeat(Date.now()); return; }
    const reg = await this.state.storage.get('reg');
    if (reg) { const due = reg.at + PARK_TTL_MS; if (Date.now() >= due) await this.state.storage.delete('reg'); else await this.state.storage.setAlarm(due); return; }
    const cv = await this.state.storage.get(CARAVAN_DECOR_KEY);
    if (cv) {
      const now = Date.now(), due = (cv.at ?? 0) + PARK_TTL_MS;
      if (now >= due) { this._cvDoc = null; this._cvOwed = null; await this.state.storage.delete(CARAVAN_DECOR_KEY); return; }
      if (this._cvOwed) await this._caravanFan(now);
      await this.state.storage.setAlarm(this._cvOwed ? Math.min(due, this._cvOwedAt) : due);
      return;
    }
    if (this._cvOwed) { await this._caravanFan(Date.now()); return; }
    if (await this._gateTick()) return;
    if (await this._siegeTick()) return;
    if (await this._arenaTick()) return;
    const held = await this._holdemTick();
    const iheld = await this._iliacTick();
    const gheld = await this._gambitTick();
    if (this._dead.size) await this._reap();
    if (held || iheld || gheld) return;
    await this._sdInBeat(Date.now());
    if (await this._sdFightTick()) return;
    if (await this._egTick()) return;
    if (await this._ktTick()) return;
    const sp = await this._serpentTick();
    if (sp) {
      const now = Date.now();
      if (!sp.live || !(now < this._serpentRestAt)) { this._serpentRestAt = now + SERPENT_REST_MS; await this._alarmRest(); }
      const rest = await this.state.storage.getAlarm();
      await this.state.storage.setAlarm(Math.min(sp.at, Number.isFinite(rest) && rest > now ? rest : Infinity));
      return;
    }
    await this._alarmRest();
  }
  async _alarmRest() {
    const riteDue = await this._riteTellHub(Date.now());
    const sdOwed = await this._sdTellHub(Date.now());
    const starDue = await this._starSweep(Date.now());
    if (await this._raidSweep(Date.now())) { if (riteDue) await this._riteArm(Date.now() + RITE_TELL_RETRY_MS); if (sdOwed) await this._sdCellArm(Date.now() + SD_TELL_RETRY_MS); if (starDue) await this._starArm(starDue); return; }
    if (starDue) return;
    for (const [, b] of this._all()) if (b.id) return;
    const m = await this.state.storage.list({ prefix: 'world:' });
    const dead = [...m.keys()];
    this._worldMemo = undefined;
    for (let i = 0; i < dead.length; i += 128) await this.state.storage.delete(dead.slice(i, i + 128));
  }
  async _sweepHub(now) {
    const cur = (await this.state.storage.get(['sweep:acct', 'sweep:party', 'sweep:gaterc', 'sweep:raidrc', 'sweep:serpentrc', 'sweep:sdrc', 'sweep:egrc', 'sweep:egcall', 'sweep:starrc', 'sweep:ktrc']));
    const acur = cur.get('sweep:acct') ?? null, pcur = cur.get('sweep:party') ?? null, gcur = cur.get('sweep:gaterc') ?? null, rcur = cur.get('sweep:raidrc') ?? null, scur = cur.get('sweep:serpentrc') ?? null;
    const accts = await this.state.storage.list({ prefix: 'acct:', limit: SWEEP_PAGE, ...(acur ? { startAfter: acur } : {}) });
    const dead = [], idle = []; let alast = null;
    for (const [k, r] of accts) { alast = k; const id = k.slice(5); if (unlisted(r, now) && now - (r.seen ?? 0) >= ACCOUNT_IDLE_MS && !this._socketsOf(id).length) idle.push([k, id, r.party]); }
    const seats = await this._partiesOf(idle.filter(([, , pid]) => pid).map(([, , pid]) => pid));
    for (const [k, id, pid] of idle) { const party = pid ? seats.get(pid) : null; if (party && party.members.includes(id)) continue; dead.push(k, acctSecretKey(id)); this._recs.delete(id); this._asecrets.delete(id); }
    const parties = await this.state.storage.list({ prefix: 'party:', limit: SWEEP_PAGE, ...(pcur ? { startAfter: pcur } : {}) });
    let plast = null;
    for (const [k, p] of parties) {
      plast = k;
      const lapsed = !p || !Array.isArray(p.members) || p.members.every((id) => !this._socketsOf(id).length && (p.away?.[id] == null || now - p.away[id] >= PARTY_OFFLINE_MS));
      if (lapsed) { dead.push(k); this._parties.set(k.slice(6), null); }
    }
    const kept = await this.state.storage.list({ prefix: 'gaterc:', limit: SWEEP_PAGE, ...(gcur ? { startAfter: gcur } : {}) });
    let glast = null;
    for (const [k, r] of kept) { glast = k; if (!r || typeof r !== 'object' || !(Number.isFinite(r.e) && now < r.e * 1000)) dead.push(k); }
    const rcs = await this.state.storage.list({ prefix: RAID_RC_PREFIX, limit: SWEEP_PAGE, ...(rcur ? { startAfter: rcur } : {}) });
    let rlast = null;
    for (const [k, v] of rcs) { rlast = k; if (!raidRcLive(v, now).length) dead.push(k); }
    const src = await this.state.storage.list({ prefix: SERPENT_RC_PREFIX, limit: SWEEP_PAGE, ...(scur ? { startAfter: scur } : {}) });
    let slast = null;
    for (const [k, r] of src) { slast = k; if (!r || typeof r !== 'object' || !(Number.isFinite(r.e) && now < r.e * 1000)) dead.push(k); }
    const dcur = cur.get('sweep:sdrc') ?? null;
    const drc = await this.state.storage.list({ prefix: SD_RC_PREFIX, limit: SWEEP_PAGE, ...(dcur ? { startAfter: dcur } : {}) });
    let dlast = null;
    for (const [k, v] of drc) { dlast = k; if (!v || typeof v !== 'object' || !(Number.isFinite(v.e) && now < v.e * 1000)) dead.push(k); }
    const ecur = cur.get('sweep:egrc') ?? null;
    const erc = await this.state.storage.list({ prefix: EG_RC_PREFIX, limit: SWEEP_PAGE, ...(ecur ? { startAfter: ecur } : {}) });
    let elast = null;
    for (const [k, v] of erc) { elast = k; if (!egRcFold(v, [], Math.floor(now / 1000)).length) dead.push(k); }
    const ccur = cur.get('sweep:egcall') ?? null;
    const calls = await this.state.storage.list({ prefix: egCallKey(''), limit: SWEEP_PAGE, ...(ccur ? { startAfter: ccur } : {}) });
    let clast = null;
    for (const [k, v] of calls) { clast = k; if (!(v?.until > now)) dead.push(k); }
    const tcur = cur.get('sweep:starrc') ?? null;
    const trc = await this.state.storage.list({ prefix: STAR_RC_PREFIX, limit: SWEEP_PAGE, ...(tcur ? { startAfter: tcur } : {}) });
    let tlast = null;
    for (const [k, v] of trc) { tlast = k; if (!raidRcLive(v, now).length) dead.push(k); }
    const kcur = cur.get('sweep:ktrc') ?? null;
    const krc = await this.state.storage.list({ prefix: KT_RC_PREFIX, limit: SWEEP_PAGE, ...(kcur ? { startAfter: kcur } : {}) });
    let klast = null;
    for (const [k, v] of krc) { klast = k; if (!v || typeof v !== 'object' || !(Number.isFinite(v.e) && now < v.e * 1000)) dead.push(k); }
    for (let i = 0; i < dead.length; i += SWEEP_PAGE) await this.state.storage.delete(dead.slice(i, i + SWEEP_PAGE));
    const more = accts.size >= SWEEP_PAGE || parties.size >= SWEEP_PAGE || kept.size >= SWEEP_PAGE || rcs.size >= SWEEP_PAGE || src.size >= SWEEP_PAGE || drc.size >= SWEEP_PAGE || erc.size >= SWEEP_PAGE || calls.size >= SWEEP_PAGE || trc.size >= SWEEP_PAGE || krc.size >= SWEEP_PAGE;
    await this.state.storage.put({ 'sweep:acct': accts.size >= SWEEP_PAGE ? alast : null, 'sweep:party': parties.size >= SWEEP_PAGE ? plast : null, 'sweep:gaterc': kept.size >= SWEEP_PAGE ? glast : null, 'sweep:raidrc': rcs.size >= SWEEP_PAGE ? rlast : null, 'sweep:serpentrc': src.size >= SWEEP_PAGE ? slast : null, 'sweep:sdrc': drc.size >= SWEEP_PAGE ? dlast : null, 'sweep:egrc': erc.size >= SWEEP_PAGE ? elast : null, 'sweep:egcall': calls.size >= SWEEP_PAGE ? clast : null, 'sweep:starrc': trc.size >= SWEEP_PAGE ? tlast : null, 'sweep:ktrc': krc.size >= SWEEP_PAGE ? klast : null });
    await this.state.storage.setAlarm(now + (more ? SWEEP_STEP_MS : ACCOUNT_SWEEP_MS));
  }
}
