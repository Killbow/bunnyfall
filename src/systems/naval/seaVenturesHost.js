// @ts-check
import { inEther, etherBandAt, compassPoint } from '../../world/ethericSea.js';
import { seaVaultPicks, seaVaultAt, seaVaultByKey } from './sea/seaVaults.js';
import { seaVaultCell } from '../../net/wire.js';
import { etherRingName, etherWildRingAt } from '../../world/wild/etherWild.js';
import { stormAt, stormHere, stormEye, nextStorm, stormWrackSlot, wrackOf, stormStrikeOf, fleetAt, nextFleet, fleetPlace, fleetOf } from './sea/seaEvents.js';
import { rollElthericPiece, elthericChance } from '../../items/aetheric.js';
import { setById } from '../../items/sigilSets.js';
import { mintGood, goodById } from './tradeGoods.js';
import { STRAND_SITE, STRAND_YIELD } from './etherHost.js';
import { NATIVE_PIXEL } from './seaRaiders.js';
import { createSeaBounty } from './seaBountyHost.js';
import { createSeaSeason } from './seaSeasonHost.js';
import { createSeaBroadsides } from './seaBroadsides.js';
import { createSeaWreckHost } from './seaWreckHost.js';
import { wildHere, wildZoneKind } from '../../world/wildZone.js';
import { ETHER_KIND, etherWayWord } from '../../world/wild/etherWild.js';
import { t } from '../../ui/textManager.js';
import { characterIdOf } from '../../characters/characterId.js';
import { playerEntity } from '../../characters/playerEntity.js';

export const WRACK_SITE = `${STRAND_SITE}wrack:`;
export const FLEET_FEED_MS = 500;
export const FLEET_LEAD_MS = 60_000;
export const FLEET_TELL_MS = 30_000;
// Band names go in parentheses, never declined, so a language that declines them can still use them in a sentence.
const bandName = (id) => etherRingName(['shallows', 'reaches', 'deep', 'abyss'].indexOf(id) + 1);

let _stormShown = null;
export const seaStormShown = () => _stormShown;

const capFirst = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());

/** @param {any} deps */
export function createSeaVentures(deps) {
  const live = () => !!deps.live?.();
  const openSeaAt = (p) => live() && !!p && etherWildRingAt(p.x, p.y) > 0;
  const vaultsNow = () => (live() ? seaVaultPicks(deps.day()) : []);
  function vaultHere() {
    if (!live()) return null;
    const p = deps.pixel?.();
    if (!p || !inEther(p.x, p.y)) return null;
    return seaVaultAt(vaultsNow(), p.x, p.y);
  }
  const myWayBack = (key, now) => { const m = deps.mine?.(); return !!m && m.dungeon === key && m.until > now; };
  function chartWord(now = Date.now()) {
    return {
      pvp: live(),
      vaults: vaultsNow().map((v) => ({
        key: v.key, x: v.x, y: v.y, name: v.name, band: v.band, ring: v.ring,
        locked: (deps.locks?.get(v.key) ?? 0) > now && !myWayBack(v.key, now), crows: !!deps.crows?.has(v.key),
      })),
    };
  }
  function crowLine(h) {
    if (!seaVaultCell(h)) return null;
    const d = Number(deps.day?.()) || 0;
    // A body can lie past the day's turn, so yesterday's vaults are asked too.
    const v = seaVaultByKey(vaultsNow(), h) ?? (live() ? seaVaultByKey(seaVaultPicks(d - 1), h) : null);
    return v
      ? t('sea.vault.crows', 'Crows gather over {name} ({band}). Someone has fallen there.', { name: capFirst(v.name), band: etherRingName(v.ring) })
      : t('sea.vault.crowsAnon', 'Crows gather over a vault of the deep. Someone has fallen there.');
  }
  const clock = () => Number(deps.clock?.()) || Date.now();
  const toScene = (x, y) => deps.state?.localFromWorld?.(x * NATIVE_PIXEL, (500 - y) * NATIVE_PIXEL) ?? null;
  const mid = (text, s) => deps.ether?.mid?.(text, s), say = (text, s) => deps.ether?.say?.(text, s);
  const atSea = (p = deps.pixel?.()) => !!p && inEther(p.x, p.y);
  const centre = (p) => ({ x: p.x + 0.5, y: p.y + 0.5 });
  const stormOver = (p, now) => (p ? stormHere(p.x + 0.5, p.y + 0.5, now) : null);
  const stormWord = () => (stormOver(deps.pixel?.(), clock()) ? 'thunder' : null);
  const stormTurned = () => { const w = stormWord(); if (w === _stormShown) return false; _stormShown = w; return true; };
  const wracked = new Set();
  const hauled = (id) => wracked.has(id) || !!deps.ether?.wrackHauled?.(id);
  function wrackSites(px, py) {
    const now = clock(), s = stormOver({ x: px, y: py }, now);
    if (!s) return [];
    const slot = stormWrackSlot(s, now), id = `${WRACK_SITE}${s.n}:${slot}`;
    if (hauled(id)) return [];
    return [{ id, kind: 'strand', px, py, seed: (s.n * 977 + slot) >>> 0, n: 1, word: t('sea.storm.wrack', 'The storm throws up wrack. A cask bobs in the swell alongside.') }];
  }
  function gather(siteId) {
    const m = /^strand:wrack:(\d+):(\d+)$/.exec(String(siteId ?? ''));
    if (!m) return null;
    const id = String(siteId);
    if (hauled(id)) return { items: [], text: '' };
    wracked.add(id);
    // Hauled wrack is saved, so a reload never floats the same cask again.
    deps.ether?.haulWrack?.(id);
    const p = deps.pixel?.(), band = p && inEther(p.x, p.y) ? etherBandAt(p.x).id : 'deep';
    const w = wrackOf(Number(m[1]), Number(m[2]), band, STRAND_YIELD);
    const g = goodById(w.good), items = [mintGood(w.good, w.n)];
    const piece = rollElthericPiece(w.rolls, elthericChance('storm', band));
    if (piece) items.push(piece);
    const haul = t('sea.storm.wrackHaul', '{n} {unit} of {good} from the storm\'s wrack.', { n: w.n, unit: w.n === 1 ? g?.unit ?? '' : g?.units ?? '', good: String(g?.name ?? '').toLowerCase() });
    return { items, text: piece ? `${haul} ${t('sea.storm.wrackTidemail', 'In the wrack: {piece}, a piece of {set}!', { piece: piece.name, set: setById('eltheric')?.name ?? '' })}` : haul };
  }
  const sunk = new Set();
  // Sailings whose flagship I ended; the hub's word never clears them, and each is resent until the hub confirms.
  const mine = new Set();
  const down = (n) => sunk.has(n) || mine.has(n) || !!deps.ether?.fleetDone?.(n);
  const tellHub = (n) => { const link = deps.link?.(); return !!link?.wdunSeaOk && link.status === 'open' && link.sendWdun({ k: 'fk', n }) === true; };
  let fkAt = -Infinity;
  let fedAt = -Infinity, heardStorm = null, heardFleet = null, inStorm = null, strikesSeen = null;
  const wayTo = (p, q) => (p && q ? etherWayWord(compassPoint(q.x - centre(p).x, q.y - centre(p).y)) : '');
  function fleetList(now, p) {
    const f = fleetAt(now);
    const a = f && atSea(p) ? fleetPlace(f, now) : null, b = a && fleetPlace(f, now + FLEET_LEAD_MS);
    const sa = a && toScene(a.x, a.y), sb = sa && toScene(b.x, b.y);
    if (!sb) return null;
    const [ax, az] = sa, [bx, bz] = sb;
    const len = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / len, dz = (bz - az) / len;
    const at = (x, z, st) => [x + dz * st[0] - dx * st[1], 0, z - dx * st[0] - dz * st[1]];
    return { n: f.n, band: f.band, ships: f.ships.map((s) => ({ seed: s.seed, classId: s.classId, flag: s.flag, pos: at(ax, az, s.station), ahead: at(bx, bz, s.station), yaw: Math.atan2(dx, dz) })) };
  }
  function step(strikes = 0) {
    const now = clock(), p = deps.pixel?.();
    if (now - fedAt >= FLEET_FEED_MS) { fedAt = now; const list = fleetList(now, p); deps.naval?.()?.fleet?.(list, { sunk: !!list && down(list.n) }); }
    const cur = fleetAt(now);
    if (cur && !sunk.has(cur.n) && (mine.has(cur.n) || deps.ether?.fleetDone?.(cur.n)) && now - fkAt >= FLEET_TELL_MS && tellHub(cur.n)) fkAt = now;
    if (!atSea(p)) { inStorm = null; strikesSeen = null; return; }
    const s = stormAt(now), f = fleetAt(now);
    if (s && heardStorm !== s.n) { heardStorm = s.n; const e = stormEye(s, now); mid(t('sea.storm.gathers', 'An Aether storm gathers to the {way} ({band}).', { band: bandName(etherBandAt(e.x).id), way: wayTo(p, e) || etherWayWord('north') }), 5); }
    if (f && heardFleet !== f.n && !down(f.n)) { heardFleet = f.n; const q = fleetPlace(f, now); mid(t('sea.fleet.sails', 'A treasure fleet weighs anchor ({band}): the {ship} and her escorts, bound east. It lies to the {way}.', { band: bandName(f.band), ship: f.name, way: wayTo(p, q) || etherWayWord('north') }), 6); }
    const here = stormOver(p, now);
    if ((here?.n ?? null) !== inStorm) {
      if (here) say(t('sea.storm.enter', 'You sail into the Aether storm. Lightning seeks the masts, and wrack rides the swell.'), 5);
      else if (inStorm != null) say(t('sea.storm.leave', 'You sail out of the Aether storm.'), 4);
      inStorm = here?.n ?? null;
    }
    const n = Number(strikes) || 0;
    if (here && strikesSeen != null && n > strikesSeen) {
      const k = stormStrikeOf();
      if (k && deps.naval?.()?.stormStrike?.(k)) say(k.fire ? t('sea.storm.strikeFire', 'Lightning strikes your ship and sets her alight!') : t('sea.storm.strike', 'Lightning strikes your ship!'), 4);
    }
    strikesSeen = here ? n : null;
  }
  function fleetEnded(n, act) {
    const f = fleetOf(n);
    const first = !mine.has(f.n) && !deps.ether?.fleetDone?.(f.n);
    mine.add(f.n);
    deps.ether?.endFleet?.(f.n);
    if (tellHub(f.n)) fkAt = clock();
    // The purse pays once a sailing by my ledger, whatever copy of her or reload went down.
    if (!first) return 0;
    deps.ether?.credit?.(f.purse);
    mid(act === 'board' ? t('sea.fleet.taken', 'The {ship} is taken! {gold} gold from her strongroom.', { ship: f.name, gold: f.purse }) : t('sea.fleet.sunk', 'The {ship} is sunk! {gold} gold floats up from her strongroom.', { ship: f.name, gold: f.purse }), 6);
    return f.purse;
  }
  function hubWord(w) {
    if (w?.k !== 'st' && w?.k !== 'fd') return false;
    const now = clock(), cur = fleetAt(now), was = !!cur && down(cur.n);
    // The hub's list replaces only its own word; my own sinkings stay in mine.
    sunk.clear();
    for (const n of w.fleets ?? []) sunk.add(n);
    if (w.k === 'fd' && cur && !was && sunk.has(cur.n) && atSea()) mid(t('sea.fleet.scattered', 'The treasure fleet\'s flagship has gone down. The fleet scatters.'), 5);
    return w.k === 'fd';
  }
  function eventsWord(now = clock()) {
    const s = stormAt(now), f = fleetAt(now);
    const eye = s ? stormEye(s, now) : null, at = f ? fleetPlace(f, now) : null;
    return {
      storm: s ? { n: s.n, x: eye.x, y: eye.y, r: s.r } : null,
      fleet: f ? { n: f.n, x: at.x, y: at.y, yaw: at.yaw, from: f.from, to: f.to, band: f.band, name: f.name, sunk: down(f.n) } : null,
    };
  }
  function rumours(port) {
    const now = clock(), out = [], mins = (ms) => Math.max(1, Math.ceil(ms / 60_000));
    const f = fleetAt(now);
    if (f && !down(f.n)) out.push(t('sea.rumour.fleet', 'A treasure fleet is under way ({band}): the {ship} and her escorts, {way} of here and bound east. It makes port in {min} minutes.', { band: bandName(f.band), ship: f.name, way: wayTo(port && { x: port.px, y: port.py }, fleetPlace(f, now)) || etherWayWord('north'), min: mins(f.end - now) }));
    else { const g = nextFleet(now); out.push(t('sea.rumour.fleetNext', 'The next treasure fleet weighs anchor in {min} minutes ({band}), {way} of here.', { band: bandName(g.band), way: wayTo(port && { x: port.px, y: port.py }, g.from) || etherWayWord('north'), min: mins(g.start - now) })); }
    const s = stormAt(now);
    if (s) out.push(t('sea.rumour.storm', 'An Aether storm is blowing {way} of here. It blows itself out in {min} minutes.', { way: wayTo(port && { x: port.px, y: port.py }, stormEye(s, now)) || etherWayWord('north'), min: mins(s.end - now) }));
    else { const g = nextStorm(now); out.push(t('sea.rumour.stormNext', 'Sailors say an Aether storm will gather {way} of here in {min} minutes.', { way: wayTo(port && { x: port.px, y: port.py }, { x: g.x0, y: g.y0 }) || etherWayWord('north'), min: mins(g.start - now) })); }
    return out;
  }
  const character = deps.character ?? (() => characterIdOf(playerEntity));
  const bounty = createSeaBounty({ live, session: deps.session, checkpoint: deps.checkpoint, wallet: deps.wallet, character, region: deps.region, door: deps.bountyDoor, now: clock });
  const wrecks = createSeaWreckHost({ session: deps.session, checkpoint: deps.checkpoint, character, me: () => deps.cell?.()?.acct ?? null, naval: deps.naval, say: (text, s) => say(text, s) });
  const broadsides = createSeaBroadsides({
    live: () => live() && !!deps.cell?.()?.seaPvpOk && wildHere() && wildZoneKind() === ETHER_KIND,
    naval: deps.naval, send: (d, o) => deps.cell?.()?.sendWild?.(d, o) === true, me: () => deps.cell?.()?.id ?? null,
    stranger: (id) => !!deps.foe?.(id), name: (id) => (deps.name ? deps.name(id) : deps.cell?.()?.peers?.get?.(id)?.name) || '', receipt: (rc) => wrecks.receipt(rc),
    say: (text, s) => say(text, s), mid: (text, s) => mid(text, s),
  });
  let armed = null;
  // Runs every online frame, paused or below deck, so the helm and wreck carries are never left unsaid.
  function pvpStep() {
    try {
      const nv = deps.naval?.() ?? null;
      if (nv && nv !== armed) { nv.pvp?.attach?.(broadsides); armed = nv; }
      broadsides.step();
      wrecks.frame();
    } catch (e) { console.warn('[sea] guns', e?.message ?? e); }
  }
  const season = createSeaSeason({ live, session: deps.session, character, door: deps.seasonDoor, now: clock });
  return { vaultsNow, vaultHere, openSeaAt, chartWord: (now) => ({ ...chartWord(now), ...eventsWord() }), crowLine, stormWord, stormTurned, wrackSites, office: () => ({ wanted: bounty.office(), season: season.office() }), wref: (g, room) => broadsides.hear(g, room), gather, step, guns: pvpStep, fleetEnded, hubWord, rumours, fleetList: (now = clock()) => fleetList(now, deps.pixel?.()) };
}
