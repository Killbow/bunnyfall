import { DROP_STRIKES_MAX, poseGate, whoGate, socialGate, partyGate, tradeGate, castGate, cardGate, pageGate, duelGate, wedGate, CAST_HZ_MAX, CAST_DEST_SENDERS_MAX, tokenGate, parkGate, lookGate, actGate, foesGate } from '../relay.js';
import { questMeter, travMeter, amapMeter } from './frameShapes.js';

export class MetersPart {
  _meterOf(ws) { let m = this._meters.get(ws); if (!m) this._meters.set(ws, m = {}); return m; }
  _spend(ws, now, gate, bucketKey, strikesKey, why, max = DROP_STRIKES_MAX) {
    const m = this._meterOf(ws);
    const g = gate(m[bucketKey], now);
    m[bucketKey] = g.bucket;
    m[strikesKey] = g.pass ? 0 : (m[strikesKey] ?? 0) + 1;
    if (!g.pass) m.nr = (m.nr | 0) + 1;
    if (!g.pass && m[strikesKey] > max) this._refuse(ws, why);
    return g.pass;
  }
  _meter(ws, a, now, patch = {}, passPatch = {}, lazy = false) {
    // `patch` is written even when the frame is dropped; anything that counts relayed frames,
    // such as `turn`, belongs in `passPatch`.
    const pass = this._spend(ws, now, poseGate, 'bucket', 'drops', 'too many poses');
    return this._metered(ws, a, pass, patch, passPatch, lazy);
  }
  _metered(ws, a, pass, patch = {}, passPatch = {}, lazy = false) {
    const write = pass ? { ...patch, ...passPatch } : patch;
    const next = Object.keys(write).length ? { ...a, ...write } : a;
    if (next !== a) this._setAttach(ws, next, lazy);
    return pass ? next : null;
  }
  _meterWho(ws, a, now) { return this._spend(ws, now, whoGate, 'wbucket', 'wdrops', 'too many asks') ? a : null; }
  _meterSocial(ws, a, now) { return this._spend(ws, now, socialGate, 'sbucket', 'sdrops', 'too many social acts') ? a : null; }
  _meterParty(ws, a, now) { return this._spend(ws, now, partyGate, 'pbucket', 'pdrops', 'too many party poses') ? a : null; }
  _meterQuest(ws, a, now) { return this._spend(ws, now, questMeter, 'qgateAt', 'qdrops', 'too many quest shares') ? a : null; }
  _meterTrav(ws, a, now) { return this._spend(ws, now, travMeter, 'travAt', 'travDrops', 'too many traveller marks') ? a : null; }
  _meterAmap(ws, a, now) { return this._spend(ws, now, amapMeter, 'amapAt', 'amapDrops', 'too many map shares') ? a : null; }
  _meterTrade(ws, a, now) { return this._spend(ws, now, tradeGate, 'tradeBucket', 'tdrops', 'too many trade frames') ? a : null; }
  _meterCast(ws, a, now) { return this._spend(ws, now, castGate, 'castBucket', 'castDrops', 'too many cast frames') ? a : null; }
  _meterCard(ws, a, now) { return this._spend(ws, now, cardGate, 'cardBucket', 'cardDrops', 'too many card frames') ? a : null; }
  _meterPage(ws, a, now) { return this._spend(ws, now, pageGate, 'pageBucket', 'pageDrops', 'too many page frames') ? a : null; }
  _meterDuel(ws, a, now) { return this._spend(ws, now, duelGate, 'duelBucket', 'duelDrops', 'too many duel frames') ? a : null; }
  _meterWed(ws, a, now) { return this._spend(ws, now, wedGate, 'wedBucket', 'wedDrops', 'too many wed frames') ? a : null; }
  // Carry the verified `sub` so the receiver's block list in src/net/online.js can hold the frame back.
  _directedFrame(t, a, data) { return JSON.stringify({ t, id: a.id, ...(typeof a.sub === 'string' && a.sub ? { sub: a.sub } : {}), data }); }
  _senderFunnel(tws, senderId, now, field = 'cin', hz = CAST_HZ_MAX) {
    const meters = this._meterOf(tws);
    const slots = meters[field] ??= [];
    let slot = slots.find((c) => c.id === senderId) ?? null;
    if (!slot) {
      if (slots.length >= CAST_DEST_SENDERS_MAX) { slots.sort((x, y) => (x.b?.at ?? 0) - (y.b?.at ?? 0)); slots.shift(); }
      slot = { id: senderId, b: null }; slots.push(slot);
    }
    const funnel = tokenGate(slot.b, now, hz);
    slot.b = funnel.bucket;
    return funnel.pass;
  }
  _meterPark(ws, a, now) { return this._spend(ws, now, parkGate, 'parkBucket', 'parkDrops', 'too many park frames') ? a : null; }
  _meterLook(ws, a, now) { return this._spend(ws, now, lookGate, 'lookBucket', 'lookDrops', 'too many looks') ? a : null; }
  _meterActs(ws, a, now) { return this._spend(ws, now, actGate, 'abucket', 'adrops', 'too many acts') ? a : null; }
  _meterFoes(ws, a, now) { return this._spend(ws, now, foesGate, 'fbucket', 'fdrops', 'too many foes') ? a : null; }
  _junk(ws) {
    const m = this._meterOf(ws);
    m.junk = (m.junk ?? 0) + 1;
    if (m.junk > DROP_STRIKES_MAX) this._refuse(ws, 'too many frames');
  }
}
