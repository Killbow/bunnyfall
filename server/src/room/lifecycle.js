// A socket's close and error entries and the leave they share: the index, the drain sweep, the
// leave frame, and each game's own leave.
import { staffLeft } from '../staffFeeds.js';
import { isWorldRoom, worldTtlMsFor, isChatRoom, isSocialRoom } from '../relay.js';
import { flushAtDrain } from '../drainWindows.js';
import { followLeft } from '../staffFollow.js';
import { wildGone } from '../../../src/net/wildRef.js';
import { seaGone } from '../../../src/net/sea/seaRef.js';
import { lookKey } from './keys.js';
import { isChannelShard, isChannelBus } from '../../../src/net/hubShards.js';
import { isGateRoom } from '../../../src/net/gateLaw.js';
import { isBattleRoom } from '../../../src/net/siegeRef.js';
import { isArenaRoom } from '../../../src/net/arenaLaw.js';

export class LifecyclePart {
  async webSocketClose(ws, code, reason) {
    try { await this._leave(ws); } finally { await this._reap(); this._metricsTick(); }
    try { ws.close(code, reason); } catch {  }
  }
  async webSocketError(ws) { try { await this._leave(ws); } finally { await this._reap(); } }
  async _leave(ws) {
    // The reap and the runtime's close can both call `_leave`; `_gone` makes the leave run once.
    if (this._gone.has(ws)) return;
    this._gone.add(ws);
    this._dead.delete(ws);
    const a = this._attach(ws);
    staffLeft(this, ws, a, Date.now());
    this._foesLeft(ws, a, Date.now());
    this._trails?.delete(ws);
    const listed = this.state.getWebSockets();
    if (!listed.includes(ws)) this._forget(ws);
    const last = (listed.length === 0 || (listed.length === 1 && listed[0] === ws)) && !this._vsocks.size;
    if (last) { try { await this._sweep(a.key); this._swept = this.state.getWebSockets().length === 0; if (isWorldRoom(a.key)) await this.state.storage.setAlarm(Date.now() + worldTtlMsFor(a.key)); } catch {  } this._metricsTick(true); void flushAtDrain(this); }
    if (!a.id) return;
    followLeft(this, ws, a);
    if (a.sub && this._wildRef && ![...this._all()].some(([w, b]) => w !== ws && b.id && b.sub === a.sub)) { wildGone(this._wildRef, a.sub, Date.now()); seaGone(this._wildRef, a.sub, Date.now()); }
    this._looks.delete(a.id);
    if (!last) this._secrets.set(a.id, null);
    this._raidTownsUp.delete(ws);
    if (!last && !isChatRoom(a.key)) { try { await this.state.storage.delete(lookKey(a.id)); } catch {  } }
    const out = JSON.stringify({ t: 'leave', id: a.id, ...(isChatRoom(a.key) && !(isChannelShard(a.key) && this._hubTotal == null) ? { n: isChannelShard(a.key) ? this._hubN(this._namedCount()) : this._vsocks.size ? this._busCount() : this._namedCount() } : {}) });
    if (a.hid) {  } else if (isChatRoom(a.key)) this._fanRoster(ws, out); else this._fanBut(ws, out);
    if ((isChannelShard(a.key) || (a.ly && isGateRoom(a.key))) && a.vid) { this._vidIdx.delete(a.vid); this._hubUpOwe(a.vid, 'x', 0); }
    else if (isChannelBus(a.key)) this._busCountMoved();
    this._travOwed.delete(a.id);
    if (!isChatRoom(a.key) && this._leaveMovesSeat(a, ws)) this._sayHost({ skip: ws, except: ws });
    if (isBattleRoom(a.key) && a.sub) { try { await this._siegeGone(ws, a.sub, Date.now()); } catch (e) { console.warn('[siege] leave failed', e?.message ?? e); } }
    if (isSocialRoom(a.key) && a.acct) { try { await this._leaveAccount(ws, a, Date.now()); } catch (e) { console.warn('[hub] leave failed', e?.message ?? e); } }
    if (a.id && String(a.key ?? '').startsWith('interior:')) { try { await this._holdemLeave(a, Date.now()); } catch (e) { console.warn('[holdem] leave failed', e?.message ?? e); } }
    if (a.id && String(a.key ?? '').startsWith('interior:')) { try { await this._iliacLeave(a, Date.now()); } catch (e) { console.warn('[iliac] leave failed', e?.message ?? e); } }
    if (a.id && String(a.key ?? '').startsWith('interior:')) { try { await this._gambitLeave(a, Date.now()); } catch (e) { console.warn('[gambit] leave failed', e?.message ?? e); } }
    if (isArenaRoom(a.key) && a.sub) { try { await this._arenaLeave(ws, a, Date.now()); } catch (e) { console.warn('[arena] leave failed', e?.message ?? e); } }
  }
}
