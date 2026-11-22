// A gate court's copies: their hellos and poses, one seat an account, and frames to every copy.
import { courtOfCopy } from '../../../../src/net/hubShards.js';
import { ShardSocket } from './shardSocket.js';
import { gateHolds, gateDayOfRoom } from '../../../../src/net/gateLaw.js';
import { CLOSE_BUSY, CLOSE_REPLACED, validPose } from '../../relay.js';

export class CourtPart {
  async _courtHello(hub, vid, p) {
    if (this._vsocks.has(vid) || !p || !p.att || typeof p.att !== 'object' || typeof p.att.id !== 'string') return;
    const court = /** @type {string} */ (courtOfCopy(hub)), now = Date.now();
    const vws = new ShardSocket(this, hub, vid);
    vws.court = true;
    vws.att = { ...p.att, key: court };
    let no;
    try { no = p.m?.re === 1 ? (gateHolds(gateDayOfRoom(court), now) ? null : 'the gate is closed') : await this._gateAdmit(court, vws.att.sub, now); } catch (e) { console.warn('[gate] a copy\'s hello', e?.message ?? e); no = 'busy'; }
    if (no) { if (no === 'busy') this._refuse(vws, no, CLOSE_BUSY); else this._refuse(vws, no); return; }
    this._vput(vws);
    if (typeof vws.att.sub === 'string' && vws.att.sub) {
      for (const [other, b] of [...this._all()]) if (b.id && b.sub === vws.att.sub) this._refuse(other, 'replaced', CLOSE_REPLACED);
      this._courtReplace(vws.att.sub, vws);
    }
  }
  _courtPose(vws, p) {
    const pose = validPose(p);
    if (!pose || vws.closed) return;
    vws.att = { ...vws.att, pose };
    if (this._trailing(vws.att)) this._trailPose(vws, pose, Date.now());
  }
  _courtReplace(sub, keep) {
    if (!this._cper.size) return;
    for (const v of [...this._vsocks.values()]) if (v.court && v !== keep && !v.closed && v.att?.sub === sub) this._refuse(v, 'replaced', CLOSE_REPLACED);
  }
  *_courtSockets() {
    yield* this._all();
    if (this._cper.size) for (const v of this._vsocks.values()) if (v.court && !v.closed && v.att) yield [v, v.att];
  }
  _courtIdFirst(id) {
    const here = this._idFirst(id);
    if (here || !this._cper.size || !id) return here;
    for (const v of this._vsocks.values()) if (v.court && !v.closed && v.att?.id === id) return [v, v.att];
    return null;
  }
  _courtSendAll(s) {
    for (const [hub, n] of this._cper) {
      if (!(n > 0)) continue;
      const b = this._vbatch(hub);
      b.seg.push({ all: this._vframe(b, s) });
      b.cur = null;
    }
    if (this._cper.size) this._downArm();
  }
}
