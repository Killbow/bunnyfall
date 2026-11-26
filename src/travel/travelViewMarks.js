import { bandLabel } from './travelBands.js';
import { dungeonTierLabel } from '../world/dungeonLabel.js';
import { farDistanceText, PIXEL_KM } from './travelFarPlaces.js';
import { getPref } from '../ui/uiPrefs.js';
import { isShipMark, travellerWorldOf } from './travellerMarks.js';
import { isWaypointFollowed, mapPointToNative, shownWaypoints } from '../maps/mapWaypoints.js';
import { livingWorldOn } from '../systems/livingWorld/livingSwitch.js';
import { GROUP_M, GROUP_LIFT_M } from '../professions/gatherHost.js';
import { MINE_MARK_CSS } from '../ui/mineMapMark.js';
import { MOUTH_TEXT } from '../systems/mine/mineMouths.js';
import { LODE_COMPASS_CSS, lodeLabel } from '../ui/lodeMapMark.js';
import { mapPixelToWorldCoords } from '../world/streamingWorld.js';
import { markShown, travellerKin } from './travelViewFilters.js';
import { t } from '../ui/textManager.js';
import { NAME_RANGE } from '../net/remotePlayers.js';
import { pixelOfNative, RAIDER_LABEL } from '../systems/naval/seaRaiders.js';
import { playerEntity } from '../characters/playerEntity.js';
import { marksOn, questMapMarks } from '../ui/questMarks.js';
import { questTracker } from '../ui/questTracker.js';
import { skyMinutes } from '../world/worldTick.js';
import { tierPhrase } from '../world/dungeonTier.js';
import { RANGE_PIXELS as TV_BODY_RANGE } from '../net/wire.js';
import { TV_DUNGEON_TYPES } from './travelDungeons.js';
import { vendorWaypoint } from '../maps/vendorWaypoint.js';
import { warmAshesOn } from '../systems/naval/warmAshesShips.js';
import { WILD_MARK } from '../ai/wildAlert.js';
import { WILD_TEXT } from '../world/wildZone.js';

export const QUEST_OW_TITLE_MAX = 40;
export function questMarkWords(q, distance) {
  const quests = Array.isArray(q?.quests) ? q.quests : [];
  let title = String(quests[0]?.title || q?.label || '');
  if (title.length > QUEST_OW_TITLE_MAX) title = `${title.slice(0, QUEST_OW_TITLE_MAX - 1).replace(/\s+\S*$/, '')}\u2026`;
  const more = quests.length > 1 ? ` (+${quests.length - 1})` : '';
  const left = String(quests[0]?.left ?? '');
  return { label: `${title}${more}`, sub: left ? `${distance} \u00b7 ${left}` : distance };
}

/** @param {any} host */
export function createTravelViewMarks(host) {
  const {
    TV_PLACE_LIFT, _bandChase, _bandSpent, _hiddenPeers, _lodesSensed, _peerMapPoses, _townOfMapId, _tvBountyHold,
    _tvLodeHold, _tvPartyHold, _tvVendorHold, _tvWaypointHold, _veils, _wildStrangerIds, bandMake, bandNowMs,
    bandPlace, cam, carriageTown, csaOn, exteriorFoes, livingHideoutsHostOf, lodeSense, lodeWords, motherlodeBook,
    myGuildTag, owForecast, params, player, playerTravelPixel, questPixel, seaRaidPeerChase, townEcon, state, travelViewBands, tvPlaceRect, tvPlaceSummary,
    travelViewCamps, travelViewDungeons, travelViewFarPlaces, travelViewPlaces, travelViewRaiders, travellerBook,
    tvRaid, tvSceneKept, tvTrip, tvTripLive, walkMode, wildCampKeys, wildHidesPlayer
  } = host;
  const tvBadgeOf = (p) => ({ title: p.title ?? null, glyphs: Array.isArray(p.glyphs) ? p.glyphs : [], lv: p.lv ?? null, gt: p.gt ?? null, rb: p.rb ?? null });
  const TV_PEER_HEAD_M = 1.8;
  const mineTranslation = [0, 0, 0];
  const _tvQuestHold = new Map();
  const placeTip = (econ, name, x, z) => () => {
    const base = econ?.() ?? null;
    const sky = owForecast?.placeLine({ x, z }) ?? '';
    if (!sky) return base;
    return { title: base?.title ?? name, lines: [t('travelView.tip.weather', 'Weather: {sky}', { sky }), ...(base?.lines ?? [])] };
  };
  function travelViewMarks() {
    const live = tvTripLive();
    if (!live) { tvTrip.plan = null; tvTrip.natives = []; tvTrip.end = null; tvTrip.line = ''; }
    const endKey = live && tvTrip.plan.summary ? `place:${tvTrip.plan.summary.mapId}` : null;
    const marks = [];
    for (const p of travelViewPlaces()) {
      if (p.key === endKey) continue;
      const tier = params.has('online') ? tierPhrase(dungeonTierLabel(p.summary.loc)) : '';
      const isDungeon = TV_DUNGEON_TYPES.has(p.summary.loc?.mapTableData?.locationType);
      marks.push({ key: p.key, at: tvSceneKept(p, p.x, p.z, TV_PLACE_LIFT), label: p.summary.name, ...(tier ? { sub: tier } : {}), kind: isDungeon ? 'place dungeon' : 'place', pick: true, hub: carriageTown(p.summary.mapId), tip: placeTip(townEcon.tipFnAt(p.summary.mapId), p.summary.name, p.x, p.z) });
    }
    const farEnd = endKey ? `far:${tvTrip.plan.summary.mapId}` : null;
    const here = state.worldCoords(player.pos);
    for (const f of travelViewFarPlaces()) {
      if (f.key === farEnd) continue;
      // A map pixel is 32768 native units (the MapsFile world map terrain dimension).
      const km = (Math.hypot(f.x - here.x, f.z - here.z) / 32768) * PIXEL_KM;
      marks.push({ key: f.key, at: tvSceneKept(f, f.x, f.z, TV_PLACE_LIFT), label: f.summary.name, sub: farDistanceText(km), kind: 'far', pick: true, edge: true, hub: carriageTown(f.summary.mapId), tip: placeTip(townEcon.tipFnAt(f.summary.mapId), f.summary.name, f.x, f.z) });
    }
    for (const g of travelViewDungeons()) {
      if (g.found) {
        if (!g.spawn && `far:${g.row.mapID}` === farEnd) continue;
        const km = (Math.hypot(g.x - here.x, g.z - here.z) / 32768) * PIXEL_KM;
        const tier = params.has('online') ? tierPhrase(dungeonTierLabel(g.loc)) : '';
        marks.push({ key: g.key, at: tvSceneKept(g, g.x, g.z, TV_PLACE_LIFT), label: g.loc.name, sub: tier ? `${tier} - ${farDistanceText(km)}` : farDistanceText(km), kind: 'far dungeon', pick: true, edge: true });
      } else marks.push({ key: g.key, at: tvSceneKept(g, g.x, g.z, TV_PLACE_LIFT), label: '?', kind: 'lair' });
    }
    if (host.livingRoads && livingWorldOn()) {
      for (const m of host.livingRoads.marks()) if (markShown({ kind: m.kind })) marks.push({ key: m.key, at: [m.at[0], m.at[1] + 2, m.at[2]], label: m.label, kind: m.kind });
      const hereN = state.worldCoords(cam.pos);
      for (const m of livingHideoutsHostOf().marks(hereN.x, hereN.z, skyMinutes())) if (markShown({ kind: m.kind })) marks.push({ key: m.key, at: [m.at[0], m.at[1] + 2, m.at[2]], label: m.label, kind: m.kind });
    }
    const bms = bandNowMs();
    const shown = getPref('wildernessCamps') === false || playerEntity.preventEnemySpawns ? [] : [...travelViewBands()];
    for (const c of _bandChase.values()) if (!shown.some((o) => o.id === c.band.id)) shown.push(c.band);
    for (const b of shown) {
      if (_bandSpent.has(b.id)) continue;
      const mk = bandMake(b);
      if (!mk) continue;
      const chasing = _bandChase.has(b.id), p = bandPlace(b, bms);
      marks.push({ key: `band:${b.id}`, at: tvSceneKept(b, p.x, p.z, 2), label: chasing ? `${WILD_MARK} ${bandLabel(mk.name, mk.mobileTypes.length)}` : bandLabel(mk.name, mk.mobileTypes.length), kind: chasing ? 'band chase' : 'band', edge: chasing, pick: true });
    }
    const wildCamps = wildCampKeys();
    for (const c of travelViewCamps()) marks.push({ key: `camp:${c.key}`, at: [c.at[0], c.at[1] + 2, c.at[2]], label: wildCamps.has(c.key) ? `${WILD_MARK} ${c.label}` : c.label, kind: 'camp', pick: true });
    const gatherOrigin = walkMode ? player.pos : cam.pos;
    for (const g of host.gatherHost?.overworldGroups(gatherOrigin) ?? []) marks.push(g);
    for (const { px, py, local } of host.mines?.stood() ?? []) {
      const tr = state.pixelTranslation(px, py, mineTranslation);
      const x = local[0] + tr[0], z = local[2] + tr[2];
      const distance = Math.hypot(x - gatherOrigin[0], z - gatherOrigin[2]);
      if (distance > GROUP_M) continue;
      marks.push({
        key: `mine:${px},${py}`, at: [x, local[1] + tr[1] + GROUP_LIFT_M, z],
        label: MOUTH_TEXT.title(), kind: 'gather mining', color: MINE_MARK_CSS, dist: distance / 1000,
      });
    }
    for (const m of host.merchantYards?.overworldMarks() ?? []) marks.push(m);
    for (const m of host.buildingNames?.overworldMarks() ?? []) marks.push(m);
    for (const m of host.portHost?.overworldMarks() ?? []) marks.push(m);
    for (const m of host.quays?.overworldMarks() ?? []) marks.push(m);
    const bountyIds = new Set();
    for (const b of host.bountyHost?.mapMarks?.() ?? []) {
      const px = Math.floor(b.cx), py = Math.floor(b.cy);
      if (!Number.isInteger(px) || !Number.isInteger(py) || !b.id) continue;
      bountyIds.add(b.id);
      const o = mapPixelToWorldCoords(px, py);
      // Adding 16384, half a pixel in native units, moves the point to the middle of the map pixel.
      const x = o.x + 16384, z = o.z + 16384;
      let h = _tvBountyHold.get(b.id);
      if (!h) { h = {}; _tvBountyHold.set(b.id, h); }
      const km = (Math.hypot(x - here.x, z - here.z) / 32768) * PIXEL_KM;
      h.snap = { px, py, x, z, place: !!b.place, farmKey: b.farmKey ?? null };
      marks.push({ key: `bounty:${b.id}`, at: tvSceneKept(h, x, z, TV_PLACE_LIFT), label: `Bounty: ${b.label}`, sub: farDistanceText(km), kind: 'bounty', edge: true, pick: true });
    }
    for (const id of [..._tvBountyHold.keys()]) if (!bountyIds.has(id)) _tvBountyHold.delete(id);
    {
      const keep = new Set();
      for (const q of marksOn() ? questMapMarks(questTracker.views, questTracker.shown()?.id ?? null, questPixel) : []) {
        let h = _tvQuestHold.get(q.key);
        if (!h) { h = {}; _tvQuestHold.set(q.key, h); }
        if (!h.mid) { const s = tvPlaceSummary(q.px, q.py), r = s ? tvPlaceRect(s) : null; if (r) h.mid = { x: r.cx, z: r.cz }; }
        const o = h.mid ? null : mapPixelToWorldCoords(q.px, q.py);
        const x = h.mid?.x ?? o.x + 16384, z = h.mid?.z ?? o.z + 16384;
        keep.add(q.key);
        const km = (Math.hypot(x - here.x, z - here.z) / 32768) * PIXEL_KM;
        const bound = live && tvTrip.end?.kind === 'dest' && Math.hypot(tvTrip.end.x - x, tvTrip.end.z - z) < 1;
        marks.push({ key: q.key, at: tvSceneKept(h, x, z, TV_PLACE_LIFT), ...questMarkWords(q, farDistanceText(km)), kind: q.tracked ? 'quest tracked' : 'quest', tip: q.tip, edge: q.tracked && !bound, pick: true });
      }
      for (const k of [..._tvQuestHold.keys()]) if (!keep.has(k)) _tvQuestHold.delete(k);
    }
    {
      const wp = vendorWaypoint();
      const t = wp ? _townOfMapId.get(wp.map) : null;
      if (t) {
        const o = mapPixelToWorldCoords(t.px, t.py);
        const x = o.x + 16384, z = o.z + 16384;
        const km = (Math.hypot(x - here.x, z - here.z) / 32768) * PIXEL_KM;
        marks.push({ key: `vendor:${wp.map}:${wp.buildingKey}`, at: tvSceneKept(_tvVendorHold, x, z, TV_PLACE_LIFT), label: `Trader: ${wp.owner || 'a'}'s house`, sub: `${t.name} · ${farDistanceText(km)}`, kind: 'target', edge: true });
      }
    }
    {
      const keep = new Set();
      if (lodeSense()) {
        const nowS = Math.floor((Date.now() + host._sharedOffsetMs) / 1000);
        for (const l of motherlodeBook.sensedAll(_lodesSensed)) {
          keep.add(l.key);
          const o = mapPixelToWorldCoords(l.x, l.y);
          const x = o.x + 16384, z = o.z + 16384;
          let h = _tvLodeHold.get(l.key);
          if (!h) { h = {}; _tvLodeHold.set(l.key, h); }
          const km = (Math.hypot(x - here.x, z - here.z) / 32768) * PIXEL_KM;
          marks.push({ key: `lode:${l.key}`, at: tvSceneKept(h, x, z, TV_PLACE_LIFT), label: lodeLabel(l, nowS, lodeWords), sub: farDistanceText(km), kind: 'gather mining', color: LODE_COMPASS_CSS, edge: true });
        }
      }
      for (const k of [..._tvLodeHold.keys()]) if (!keep.has(k)) _tvLodeHold.delete(k);
    }
    {
      const keep = new Set();
      for (const w of shownWaypoints()) {
        const n = mapPointToNative(w.mx, w.my);
        let h = _tvWaypointHold.get(w.id);
        if (!h) { h = {}; _tvWaypointHold.set(w.id, h); }
        keep.add(w.id);
        const followed = isWaypointFollowed(w.id);
        const km = (Math.hypot(n.x - here.x, n.z - here.z) / 32768) * PIXEL_KM;
        marks.push({ key: `wp:${w.id}`, at: tvSceneKept(h, n.x, n.z, 0), label: w.name, ...(followed ? { sub: farDistanceText(km) } : {}),
          kind: `waypoint ${w.kind}`, color: w.color, wpKind: w.kind, followed, edge: followed, pick: true });
      }
      for (const id of [..._tvWaypointHold.keys()]) if (!keep.has(id)) _tvWaypointHold.delete(id);
    }
    if (live && tvTrip.end) {
      const e = tvTrip.end, place = e.kind === 'dest';
      const km = place ? (Math.hypot(e.x - here.x, e.z - here.z) / 32768) * PIXEL_KM : NaN;
      marks.push({ key: 'dest', at: tvSceneKept(e, e.x, e.z, place ? TV_PLACE_LIFT : 0), label: e.label, kind: e.kind, edge: true, ...(place ? { pick: true, sub: farDistanceText(km) } : {}) });
    }
    const near = new Set();
    const book = travellerBook.live(Date.now());
    const sharing = new Map();
    for (const t of book) sharing.set(t.id, t);
    const myGt = myGuildTag();
    for (const gf of exteriorFoes.foes) { if (gf.entity?.wildGiant && !(gf.entity.health <= 0) && gf.ai?.feet) marks.push({ key: `giant:${gf.id ?? gf.entity.name ?? marks.length}`, at: [gf.ai.feet[0], gf.ai.feet[1] + 8, gf.ai.feet[2]], label: 'Giant', kind: 'stranger', edge: true }); }
    for (const d of host.online?.drawable?.() ?? []) {
      if (!d?.shown || _hiddenPeers.has(d.id) || _veils.has(d.id)) continue;
      const f = host.onlineToScene(_peerMapPoses.get(d.id) ?? d.shown);
      if (_wildStrangerIds.has(d.id)) {
        near.add(d.id);
        marks.push({ key: `peer:${d.id}`, at: [f[0], f[1] + TV_PEER_HEAD_M, f[2]], label: WILD_TEXT.stranger, kind: 'stranger', edge: true });
        continue;
      }
      // A player who does not share with the region and is not in the party is named only within `NAME_RANGE` and
      // is never held at the screen edge.
      const party = !!host.social?.isPartyPeer(d.id), t = sharing.get(d.id);
      if (!party && !t && Math.hypot(f[0] - player.pos[0], f[2] - player.pos[2]) > NAME_RANGE) continue;
      if (wildHidesPlayer({ kin: travellerKin({ friend: !!host.social?.isFriendPeer(d.id), gt: d.gt }, myGt), wire: [d.shown.x, 0, d.shown.z], party })) continue;
      const h = host.peerRiders.heightOf(d.id) || host.peerBodies.heightOf(d.id) || host.peerWalkers.heightOf(d.id) || TV_PEER_HEAD_M;
      near.add(d.id);
      marks.push({ key: `peer:${d.id}`, at: [f[0], f[1] + h, f[2]], label: d.name ?? '', kind: `${party ? 'party' : 'traveller'}${isShipMark(t?.p) ? ' ship' : ''}${t?.p.tv ? ' journey' : ''}`, edge: party || !!t, badge: tvBadgeOf(d),
        kin: travellerKin({ friend: !!host.social?.isFriendPeer(d.id), gt: d.gt }, myGt), lv: d.lv ?? null });
    }
    const me = playerTravelPixel();
    for (const t of book) {
      if (near.has(t.id) || Math.max(Math.abs(t.p.px - me.x), Math.abs(t.p.py - me.y)) <= TV_BODY_RANGE) continue;
      const w = (t._w ??= travellerWorldOf(t.p));
      // Party membership is checked by peer id, since a token subject is another id space; this also keeps the
      // player's own other tab out of the party color.
      const kind = host.social?.isPartyPeer(t.id) ? 'party' : 'traveller';
      if (wildHidesPlayer({ kin: travellerKin({ friend: !!host.social?.isFriendPeer(t.id), gt: t.gt }, myGt), wire: [w.x, 0, w.z], party: kind === 'party' })) continue;
      const ship = isShipMark(t.p);
      marks.push({ key: `trav:${t.id}`, at: tvSceneKept(t, w.x, w.z, 2, ship), label: t.name, kind: `${kind}${ship ? ' ship' : ''}${t.p.tv ? ' journey' : ''}`, edge: true, badge: tvBadgeOf(t),
        kin: travellerKin({ friend: !!host.social?.isFriendPeer(t.id), gt: t.gt }, myGt), lv: t.lv ?? null });
      near.add(t.id);
    }
    for (const m of host.social?.others() ?? []) {
      if (!Number.isInteger(m.p?.px) || !Number.isInteger(m.p?.py) || (m.peers ?? []).some((id) => near.has(id))) continue;
      const o = mapPixelToWorldCoords(m.p.px, m.p.py);
      let h = _tvPartyHold.get(m.acct);
      if (!h) { h = {}; _tvPartyHold.set(m.acct, h); }
      marks.push({ key: `pty:${m.acct}`, at: tvSceneKept(h, o.x + 16384, o.z + 16384, 2), label: m.name ?? '', kind: 'party', edge: true });
    }
    if (warmAshesOn() && csaOn()) {
      const grid = Math.max(1, state.terrainDistance ?? 3);
      const listed = travelViewRaiders();
      for (const r of listed) {
        const c = tvRaid.chase.get(r.id);
        const ship = host.navalRaidersOn() ? host.naval.raiderShipOf(r.seed) : null;
        if (tvRaid.spent.has(r.id) && !c && !ship) continue;
        const at = ship ? state.worldCoords(ship.pos) : c ? c.pos : (seaRaidPeerChase(r.id) ?? r);
        const chase = ship ? ship.chase : !!c;
        const px = pixelOfNative(at.x, at.z);
        if (!chase && Math.max(Math.abs(px.x - me.x), Math.abs(px.y - me.y)) > grid) continue;
        marks.push({ key: `raid:${r.id}`, at: tvSceneKept(c ?? r, at.x, at.z, 2, true), label: RAIDER_LABEL, kind: chase ? 'raider ship chase' : 'raider ship', edge: chase });
      }
      for (const [id, c] of tvRaid.chase) {
        if (listed.some((r) => r.id === id)) continue;
        marks.push({ key: `raid:${id}`, at: tvSceneKept(c, c.pos.x, c.pos.z, 2, true), label: RAIDER_LABEL, kind: 'raider ship chase', edge: true });
      }
    }
    return marks;
  }
  return { travelViewMarks };
}
