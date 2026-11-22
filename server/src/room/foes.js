// The live monster frames a room fans out: the byte budget, held frames, their turns, and beats.
// A blow onto one socket passes that socket's frame and byte funnels.
import { foesFrameFull, foesFrameHandsOn, FOES_FULL_RESERVE, FOES_ROOM_BYTES_PER_S, isRoomKey, floorGate, isCellRoom, inRangeOf, FOES_STALE_MS, FOES_UNHEARD_MS, FOES_FULL_MS, FOES_FIRST_MS, tokenGate, HIT_ROOM_HZ_MAX, byteGate, HIT_ROOM_BYTES_PER_S } from '../relay.js';
import { heldOf, holdFrame, createFoesHold, heldHead, unhold, served, FOES_BEAT_SCAN_MS, FOES_LEFT_FLOOR } from '../foesHold.js';
import { relayCfgValue } from '../../../src/net/relayCfg.js';
import { staffFoesSeen } from '../staffFeeds.js';
import { fanOut } from './frameShapes.js';

export class FoesPart {
  _foesFan(ws, a, kind, data, text, ranged, bucket, now) {
    const full = foesFrameFull(data), hands = foesFrameHandsOn(data), lane = this._foesLane(ws, kind), length = text.length;
    const urgent = this._foesUrgent(lane, hands, now);
    const first = this._foesFirst(lane, full, urgent, now);
    this._metrics.c.foes++;
    if (full) this._metrics.c.fulls++;
    lane.in = now;
    const hold = this._foesHoldOf(kind);
    if (hold.entries.length) bucket = this._foesDrain(kind, hold, bucket, now);
    if (!first && !hands && !(full && hold.entries.length && heldOf(hold, ws).length)) {
      // While any frame is held, a delta is dropped: it must never overtake a held frame.
      if (hold.entries.length) return this._foesDropped(full, bucket);
      const sent = this._foesSend(ws, a, kind, data, length, ranged, bucket, now, FOES_FULL_RESERVE, lane);
      return sent.pass ? sent.bucket : this._foesDropped(full, sent.bucket);
    }
    if (first && full) lane.first = now;
    if (urgent && hands) lane.hands = now;
    if (!hold.entries.length) {
      const sent = this._foesSend(ws, a, kind, data, length, ranged, bucket, now, first ? -FOES_FULL_RESERVE : FOES_FULL_RESERVE, lane);
      if (sent.pass) return sent.bucket;
      bucket = sent.bucket;
      if (sent.fan > FOES_ROOM_BYTES_PER_S + FOES_FULL_RESERVE) return this._foesDropped(full, bucket);
    }
    const { fate, gone } = holdFrame(hold, { ws, text, k: isRoomKey(data.k) ? data.k : null, length, ranged, full, hands, at: now });
    if (fate === 'refused') return this._foesDropped(full, bucket);
    this._metrics.c.held++;
    for (const e of gone) this._foesGone(e, bucket);
    return bucket;
  }
  _foesGone(e, bucket) {
    this._metrics.c.heldGone++;
    return this._foesDropped(e.full, bucket);
  }
  _foesServed(e, sent, now) {
    if (sent.junk) this._metrics.c.heldGone++;
    else { this._metrics.c.heldSent++; this._metrics.c.heldMs += now - e.since; }
  }
  _foesSend(ws, a, kind, data, length, ranged, bucket, now, floor, lane) {
    const per = length + a.id.length + 8;
    const ahead = floorGate(bucket, now, per, FOES_ROOM_BYTES_PER_S, floor);
    if (!ahead.pass) return { bucket: ahead.bucket, pass: false, fan: per };
    const listeners = this._foesListeners(ws, a, ranged);
    const budget = floorGate(bucket, now, per * listeners.length, FOES_ROOM_BYTES_PER_S, floor);
    if (!budget.pass) return { bucket: budget.bucket, pass: false, fan: per * listeners.length };
    if (!listeners.length) return { bucket: budget.bucket, pass: true, fan: 0 };
    lane.heard = now;
    if (typeof data === 'string') data = JSON.parse(data).data;
    if (relayCfgValue(this._relayCfg, this.env, 'grantStrip') === 'on' && (kind === 'own' || isCellRoom(a.key))) data = this._grantStripped(a, data, kind, now);
    else data = this._foesBounded(a, data, kind);
    staffFoesSeen(this, a, data, now, lane);
    const out = fanOut(kind, a.id, data, length, a.gv === 1);
    if (out == null) { this._junk(ws); return { bucket: budget.bucket, pass: true, fan: 0, junk: true }; }
    for (const other of listeners) this._send(other, out);
    return { bucket: budget.bucket, pass: true, fan: per * listeners.length };
  }
  _foesListeners(ws, a, ranged) {
    const reach = ranged ? inRangeOf(a.key, a.pose) : null;
    const listeners = [];
    for (const [other, b] of this._all()) if (other !== ws && b.id && (!reach || reach(b.pose))) listeners.push(other);
    return listeners;
  }
  _foesHoldOf(kind) { return ((this._foesHolds ??= {})[kind] ??= createFoesHold()); }
  _foesDrain(kind, hold, bucket, now) {
    for (let e = heldHead(hold); e; e = heldHead(hold)) {
      const a = this._all().get(e.ws);
      if (!a?.id || (!e.hands && now - e.at > FOES_STALE_MS)) { unhold(hold, e); this._foesGone(e, bucket); continue; }
      const sent = this._foesSend(e.ws, a, kind, e.text, e.length, e.ranged, bucket, now, -FOES_FULL_RESERVE, this._foesLane(e.ws, kind));
      bucket = sent.bucket;
      if (!sent.pass) {
        if (sent.fan <= FOES_ROOM_BYTES_PER_S + FOES_FULL_RESERVE) break;
        unhold(hold, e); this._foesGone(e, bucket); continue;
      }
      served(hold, e);
      this._foesServed(e, sent, now);
    }
    return this._foesBeats(kind, hold, bucket, now);
  }
  _foesBeats(kind, hold, bucket, now) {
    if (!hold.entries.length || now - (hold.beatAt ?? -Infinity) < FOES_BEAT_SCAN_MS) return bucket;
    hold.beatAt = now;
    for (const e of hold.entries) {
      const lane = this._foesLane(e.ws, kind);
      if (now - Math.max(lane.heard ?? e.since, lane.beat ?? -Infinity) < FOES_UNHEARD_MS || now - (lane.in ?? -Infinity) > FOES_FULL_MS) continue;
      const a = this._all().get(e.ws);
      if (!a?.id) continue;
      const listeners = this._foesListeners(e.ws, a, e.ranged);
      if (!listeners.length) { lane.beat = now; continue; }
      const data = e.k === null ? { f: [] } : { f: [], k: e.k };
      const out = JSON.stringify(a.gv === 1 ? { t: kind, id: a.id, g: 1, data } : { t: kind, id: a.id, data });
      const beat = floorGate(bucket, now, out.length * listeners.length, FOES_ROOM_BYTES_PER_S, -FOES_FULL_RESERVE);
      bucket = beat.bucket;
      if (!beat.pass) continue;
      lane.beat = now;
      for (const other of listeners) this._send(other, out);
      this._metrics.c.beats++;
    }
    return bucket;
  }
  _foesLeft(ws, a, now) {
    if (!this._foesHolds || !a?.id) return;
    for (const kind of Object.keys(this._foesHolds)) {
      const hold = this._foesHolds[kind];
      for (const e of heldOf(hold, ws)) {
        unhold(hold, e);
        const field = kind === 'own' ? '_roomOwn' : '_roomFoes';
        if (e.hands) {
          const sent = this._foesSend(ws, a, kind, e.text, e.length, e.ranged, this[field], now, FOES_LEFT_FLOOR, this._foesLane(ws, kind));
          this[field] = sent.bucket;
          if (sent.pass) { this._foesServed(e, sent, now); continue; }
        }
        this._foesGone(e, this[field]);
      }
    }
  }
  _foesLane(ws, kind) { const m = this._meterOf(ws); return ((m.fl ??= {})[kind] ??= {}); }
  _foesUrgent(lane, hands, now) { return (hands && now - (lane.hands ?? -Infinity) >= FOES_FIRST_MS) || now - (lane.heard ?? -Infinity) >= FOES_UNHEARD_MS; }
  _foesFirst(lane, full, urgent, now) { return (full && now - (lane.first ?? -Infinity) >= FOES_FIRST_MS) || urgent; }
  _foesDropped(full, bucket) {
    this._metrics.c.drops++;
    if (full) this._metrics.c.fullDrops++;
    return bucket;
  }
  _hitFunnel(ws, a, data, length, tws, now) {
    const tm = this._meterOf(tws);
    const funnel = tokenGate(tm.hbucket ?? null, now, HIT_ROOM_HZ_MAX);
    tm.hbucket = funnel.bucket;
    if (!funnel.pass) { this._metrics.c.hitDrops++; return; }
    const out = fanOut('hit', a.id, data, length);
    if (out == null) { this._junk(ws); return; }
    const bytes = byteGate(tm.hbytes ?? null, now, out.length, HIT_ROOM_BYTES_PER_S);
    tm.hbytes = bytes.bucket;
    if (!bytes.pass) { this._metrics.c.hitDrops++; return; }
    this._send(tws, out);
  }
}
