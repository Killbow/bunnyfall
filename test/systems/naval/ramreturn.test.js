// RAM-RETURN (2026-10-26, the owner: "So players are complaining about ship ramming being removed. So I would like to
// reintegrate it in a thoughtful way. The major issue was that you could easily instability ships just by ramming";
// bible/03-World/Naval-Refit.md RAM-RETURN) - THE RAM BACK, BOUNDED: the law's own numbers (systems/naval/navalRam.js);
// THE BOUND over every hull and class, every way to a storm's and every angle - one ram takes GALLEY_SHARE of a hull at
// the most, none takes a fighting ship under her strike, and neither ram nor recoil ever finishes a hull (the old law's
// galley sank a sloop in one); and on the real naval host over Come Sail Away's real pool (test/navalSea.mjs): my stem's
// ram as AUDIT NAV1 H11 found it (the stem, the way remembered, hers along my course, the way spent, once a stretch), its
// blow by the lesser hull, the pace and the angle, the recoil braced and a galley's; a ship rammed to her strike, no
// further, then not rammed at all and boarded by the grapples (BOARD-MAGNET); a galley that rams the ship she fights and
// no other; online, the blow said to her stander bounded by her room and fouling nothing; a booked ship's master never
// rams (FERRY-CLEAR). tools/mutants/ramreturn.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RAM_SPEED, RAM_FULL_SPEED, RAM_SHARE, GALLEY_SHARE, RAM_GLANCE, RAM_RECOIL, BOW_RECOIL, GALLEY_RAM, RAM_A_MAN, RAM_REACH, RAM_MEMORY_S, RAM_COOLDOWN_S,
  ramBlow, ramSquare, ramRoom, recoilRoom, ramRecoil, ramMen, ramMenSaid,
} from '../../../src/systems/naval/navalRam.js';
import { HULL, HULL_BUILDS, SHIP_CLASSES, hullBuild, classById, flatHull } from '../../../src/systems/naval/navalShips.js';
import { SHIP_STATES, STRUCK_AT, BRACE_TAKEN, createShipDamage } from '../../../src/systems/naval/navalDamage.js';
import { forwardOfYaw } from '../../../src/systems/naval/navalAI.js';
import { hullBoxOf } from '../../../src/scenes/naval/navalHost.js';
import { createNavalRams } from '../../../src/scenes/naval/navalRams.js';
import { validNavalHit, navalWireRecord } from '../../../src/systems/naval/navalWire.js';
import { sea, freshPool } from '../../navalSea.mjs';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b} (±${eps})`);

async function helm(o = {}) {
  const h = await sea({ hull: o.hull ?? HULL.SmallShip, ...o, settings: { ShipsAtSea: 'off', Boarders: false, ...(o.settings ?? {}) } });
  const e = h.host._sea.get(h.host.spawnShip(o.ship ?? 'merchantGalleon', { range: 900 }));
  return { ...h, e };
}
/** Frames with each ship held where the test put her (navaudit_helm.test.js's). */
function frames(h, held, n = 1, opts = {}) {
  for (let i = 0; i < n; i++) {
    for (const [e, p] of held) { e.ship.pos = [...p.pos]; e.ship.yaw = p.yaw ?? 0; e.ship.speed = p.speed ?? 0; e.ship.yawRate = 0; }
    h.host.frame(0.1, opts);
  }
}
/** Her keel at `yaw`, her near face `gap` past my stem as I lie at the origin facing +z (H11's `across`, any heading). */
function before(h, e, gap, yaw = Math.PI / 2, hull = h.boat.hull) {
  frames(h, [[e, { pos: [0, 0, 90], yaw }]]);
  const b = hullBoxOf(e.boat, h.pool.models);
  const ext = Math.abs(b.ax[2]) * b.h[0] + Math.abs(b.ay[2]) * b.h[1] + Math.abs(b.az[2]) * b.h[2];
  return { pos: [0, 0, 90 + hullBuild(hull).bowZ + gap - (b.c[2] - ext)], yaw };
}
/** Rammed at `v` m/s: my way on with her 30 m off, then her side under my stem (the collider having taken the way). */
function ram(h, e, v = 6, yaw = Math.PI / 2, opts = {}) {
  const touching = before(h, e, RAM_REACH / 2, yaw);
  h.runtime.state.velocityCurrent = [0, 0, v];
  frames(h, [[e, before(h, e, 30, yaw)]], 1, opts);
  h.runtime.state.velocityCurrent = [0, 0, 0.1];
  frames(h, [[e, touching]], 1, opts);
  return touching;
}
/** Past the cooldown, my way off, her well clear. */
function rest(h, e) {
  h.runtime.state.velocityCurrent = [0, 0, 0];
  frames(h, [[e, { pos: [0, 0, 600], yaw: 0 }]], Math.ceil(RAM_COOLDOWN_S * 10) + 1);
}
const mine = (h) => h.host.hudModel().ship.hull * hullBuild(h.boat.hull).hullHp;

// ── the law ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('RAM-RETURN the law: its numbers; a blow is the stem\'s share of the LESSER hull times the pace (closing over RAM_FULL_SPEED, never past whole) and the angle (RAM_GLANCE along her keel, whole square into her side) - none under RAM_SPEED; the room down to her strike and the recoil\'s a point short of it; the recoil and the men (mutants: the lesser hull, the pace unbounded, the angle unread, the galley\'s share, the room, the recoil\'s room)', () => {
  assert.deepEqual([RAM_SPEED, RAM_FULL_SPEED, RAM_SHARE, GALLEY_SHARE, RAM_GLANCE], [1.6, 8, 0.15, 0.3, 0.4]);
  assert.deepEqual([RAM_RECOIL, BOW_RECOIL, GALLEY_RAM, RAM_A_MAN, RAM_REACH, RAM_MEMORY_S, RAM_COOLDOWN_S], [0.3, 2, 3, 40, 1.2, 0.6, 3]);
  // the angle: a stem along +z into keels at each heading
  near(ramSquare([0, 0, 1], forwardOfYaw(Math.PI / 2)), 1, 1e-12, 'square into her side');
  near(ramSquare([0, 0, 1], forwardOfYaw(0)), 0, 1e-12, 'along her keel (into her stern)');
  near(ramSquare([0, 0, 1], forwardOfYaw(Math.PI)), 0, 1e-12, 'bow to bow');
  near(ramSquare([0, 0, 1], forwardOfYaw(Math.PI / 4)), Math.SQRT1_2, 1e-12, 'forty-five degrees');
  // the blow: a galleon (672) into a merchant galleon (538), square, at a fighting way
  const r = (o) => ramBlow({ closing: 8, square: 1, mine: 672, hers: 538, ...o });
  assert.equal(r({ closing: RAM_SPEED - 0.01 }), 0, 'a bump');
  assert.equal(r({ closing: RAM_SPEED }), Math.round(0.15 * 538 * (1.6 / 8)), 'RAM_SPEED rams');
  assert.equal(r({}), Math.round(0.15 * 538), 'whole at RAM_FULL_SPEED: 81');
  assert.equal(r({ closing: 38.9 }), r({}), 'a storm\'s way rams no harder');
  assert.equal(r({ closing: 4 }), Math.round(0.15 * 538 * 0.5), 'half the way, half the blow');
  assert.equal(r({ square: 0 }), Math.round(0.15 * 538 * RAM_GLANCE), 'along her keel: RAM_GLANCE of it');
  assert.equal(r({ square: 0.5 }), Math.round(0.15 * 538 * 0.7));
  assert.equal(r({ galley: true }), Math.round(0.3 * 538), 'a galley\'s ram: 161');
  assert.equal(r({ mine: 96, hers: 896 }), Math.round(0.15 * 96), 'a rowboat into a Carrack: its own weight');
  assert.equal(r({ mine: 896, hers: 96 }), Math.round(0.15 * 96), 'a Carrack into a rowboat: the rowboat\'s');
  // the room: to her strike, never under it
  const d = createShipDamage({ hullHp: 672, sailHp: 256, crew: 24 });
  assert.equal(ramRoom(d), 672 - 168);
  d.apply({ hull: 400, sail: 0, crew: 0 }, 0);
  assert.equal(ramRoom(d), 272 - 168);
  d.apply({ hull: ramRoom(d), sail: 0, crew: 0 }, 0);
  assert.deepEqual([d.hull, d.state], [168, SHIP_STATES.struck], 'the room brings her exactly to strike');
  assert.equal(ramRoom(d), 0, 'and none past it');
  // the recoil's room: a point short - a rammer just over her line keeps it
  const p = createShipDamage({ hullHp: 672, sailHp: 256, crew: 24, player: true });
  p.apply({ hull: 672 - 168, sail: 0, crew: 0 }, 0);
  p.repair({ hull: 0.5 });   // 168.5: a half point over her line
  assert.deepEqual([ramRoom(p), recoilRoom(p)], [1, 0], 'her own ram never brings her to strike');
  p.apply({ hull: recoilRoom(p), sail: 0, crew: 0 }, 0);
  assert.ok(p.hull > 168, `over her line (${p.hull})`);
  assert.equal(recoilRoom(createShipDamage({ hullHp: 672, sailHp: 0, crew: 0 })), 672 - 168 - 1);
  // the recoil and the men
  assert.equal(ramRecoil(81), Math.round(81 * RAM_RECOIL * BOW_RECOIL), 'a plain stem: 0.6 of it');
  assert.equal(ramRecoil(161, true), Math.round(161 * RAM_RECOIL / GALLEY_RAM), 'a galley\'s: 0.1 of it');
  assert.deepEqual([ramMenSaid(79), ramMenSaid(81), ramMenSaid(161)], [2, 2, 4]);
  assert.equal(ramMen(80, 0.5, 1), 2);
});

test('RAM-RETURN THE BOUND - no ram finishes a ship: over every class and every player\'s hull, every closing way from RAM_SPEED to a storm\'s 40 m/s, every angle, a plain stem and a galley\'s - one ram takes GALLEY_SHARE of the struck hull at the most; rams from whole bring a fighting ship to strike (never under her line, never sinking) and no sooner than the third; the rammer\'s recoils never bring her own hull to its line. The retired law\'s galley at 7 m/s dealt 294, past a Pirate Sloop\'s whole hull (mutants: the lesser hull, the pace, the room, the recoil\'s room)', () => {
  const hulls = [...SHIP_CLASSES.map((c) => ({ hullHp: c.hullHp, sailHp: c.sailHp, crew: c.crew, player: false })), ...HULL_BUILDS.map((b) => ({ hullHp: b.hullHp, sailHp: b.sailHp, crew: b.crew, player: true }))];
  const sloop = classById('pirateSloop').hullHp;
  assert.ok(Math.round(7 * 14 * 3) > sloop, `the retired law sank her in one (${Math.round(7 * 14 * 3)} > ${sloop})`);
  let least = Infinity, worst = 0, cases = 0;
  for (const a of hulls) {
    for (const b of hulls) {
      for (let closing = RAM_SPEED; closing <= 40; closing += 1.7) {
        for (const square of [0, 0.37, 1]) {
          for (const galley of [false, true]) {
            const her = createShipDamage(b), me = createShipDamage({ ...a, player: true });
            let rams = 0;
            for (; rams < 200 && ramRoom(her) > 0; rams++) {
              const blow = ramBlow({ closing, square, mine: a.hullHp, hers: b.hullHp, galley });
              assert.ok(blow <= GALLEY_SHARE * Math.min(a.hullHp, b.hullHp) + 0.5, `one ram: ${blow}`);
              worst = Math.max(worst, blow / b.hullHp);
              her.apply({ hull: Math.min(blow, ramRoom(her)), sail: 0, crew: 0 }, rams);
              me.apply({ hull: Math.min(ramRecoil(blow, galley), recoilRoom(me)), sail: 0, crew: 0 }, rams);
              assert.notEqual(her.state, SHIP_STATES.sinking, 'never sunk by a ram');
              assert.ok(me.hull > me.maxHull * STRUCK_AT, `the rammer over her line (${me.hull})`);
              if (blow === 0) break;
            }
            if (ramRoom(her) > 0) continue;   // a blow of nothing (a rowboat's stem into a Legend's side at a crawl)
            cases++;
            least = Math.min(least, rams);
            assert.ok(her.hull > her.maxHull * STRUCK_AT - 1 && her.hull <= her.maxHull * STRUCK_AT, `struck at her line (${her.hull} of ${her.maxHull})`);
            if (!b.player) assert.equal(her.state, SHIP_STATES.struck);
          }
        }
      }
    }
  }
  assert.ok(cases > 10000, `${cases} cases`);
  assert.equal(least, 3, 'three of a galley\'s rams at the fewest');
  assert.ok(worst < GALLEY_SHARE + 0.01, `a ram's most, a rowboat's rounding past it: ${worst}`);
});

// ── my helm ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('RAM-RETURN my helm\'s ram (AUDIT NAV1 H11\'s finding kept): from my own stem within RAM_REACH of her box, at the way I came in with - the most of the last RAM_MEMORY_S - less hers along my course; the blow her hull takes and the recoil mine takes, said, an act of fire; the way spent on the first; once a stretch; out of reach, a way long spent and a ship sailing on ahead nothing; braced, half the recoil; a galley\'s ram GALLEY_SHARE, a GALLEY_RAM-th back (mutants: the ram unchecked, the way forgotten, her way ignored, the way unspent, the cooldown, the recoil, the brace, the act unsaid)', async () => {
  const h = await helm();
  const hers = () => h.e.ship.damage.hull;
  const full = hers(), mine0 = mine(h);
  // lying still at her side: nothing
  h.runtime.state.velocityCurrent = [0, 0, 0];
  frames(h, [[h.e, before(h, h.e, RAM_REACH / 2)]], 2);
  assert.equal(hers(), full);
  // in at 6 m/s, square into her side
  const touching = ram(h, h.e, 6);
  const blow = ramBlow({ closing: 6, square: 1, mine: hullBuild(HULL.SmallShip).hullHp, hers: full });
  assert.equal(blow, Math.round(0.15 * Math.min(672, full) * 0.75));
  assert.equal(full - hers(), blow, 'the blow');
  near(mine(h), mine0 - ramRecoil(blow), 0.01, 'BOW_RECOIL x RAM_RECOIL back');
  assert.equal(h.log.mid.at(-1), 'You ram the ship!');
  assert.ok(h.e.charged?.has('fire'), 'an act of fire');
  assert.equal(h.e.ship.damage.state, SHIP_STATES.afloat, 'a sound ship rammed fights on - no foul, no boarding');
  assert.equal(h.e.ship.fouled, undefined);
  assert.equal(h.host.hudModel().board, null);
  // the way is spent on her: another hull met the next moment is not rammed with it
  const other = h.host._sea.get(h.host.spawnShip('merchantGalleon', { range: 900 }));
  frames(h, [[h.e, { pos: [0, 0, 400], yaw: 0 }], [other, { pos: [0, 0, 500], yaw: 0 }]], 2);
  frames(h, [[h.e, { pos: [0, 0, 400], yaw: 0 }], [other, touching]]);
  assert.equal(other.ship.damage.hull, other.ship.damage.maxHull, 'the way spent on the first');
  // once a stretch
  h.runtime.state.velocityCurrent = [0, 0, 6];
  frames(h, [[h.e, touching], [other, { pos: [0, 0, 500], yaw: 0 }]], Math.floor(RAM_COOLDOWN_S * 10) - 5);
  assert.equal(full - hers(), blow, 'once a stretch');
  // just out of reach: nothing; a way long spent: nothing
  const h2 = await helm();
  h2.runtime.state.velocityCurrent = [0, 0, 6];
  frames(h2, [[h2.e, before(h2, h2.e, RAM_REACH + 0.6)]], 3);
  assert.equal(h2.e.ship.damage.hull, h2.e.ship.damage.maxHull, 'her planking out of the stem\'s reach');
  frames(h2, [[h2.e, before(h2, h2.e, 30)]]);
  h2.runtime.state.velocityCurrent = [0, 0, 0.1];
  frames(h2, [[h2.e, before(h2, h2.e, 30)]], Math.ceil(RAM_MEMORY_S * 10) + 1);
  frames(h2, [[h2.e, before(h2, h2.e, RAM_REACH / 2)]]);
  assert.equal(h2.e.ship.damage.hull, h2.e.ship.damage.maxHull, 'a way long spent is no ram');
  // her own way along my course: a ship sailing on ahead takes the difference
  const h3 = await helm();
  const ahead = { ...before(h3, h3.e, RAM_REACH / 2, 0), speed: 5 };
  h3.runtime.state.velocityCurrent = [0, 0, 6];
  frames(h3, [[h3.e, ahead]], 3);
  assert.equal(h3.e.ship.damage.hull, h3.e.ship.damage.maxHull, 'closing at 1 m/s: a bump');
  // braced, half the recoil
  const h4 = await helm();
  const m4 = mine(h4);
  ram(h4, h4.e, 6, Math.PI / 2, { brace: true });
  near(mine(h4), m4 - Math.round(ramRecoil(blow) * BRACE_TAKEN), 0.01, 'braced for it');
  // a galley's ram, from her own stem 51 m out
  const g = await helm({ hull: HULL.LargeGalley });
  const gm = mine(g), gfull = g.e.ship.damage.hull;
  ram(g, g.e, 6);
  const gd = ramBlow({ closing: 6, square: 1, mine: hullBuild(HULL.LargeGalley).hullHp, hers: gfull, galley: true });
  assert.equal(gd, Math.round(0.3 * gfull * 0.75));
  assert.equal(gfull - g.e.ship.damage.hull, gd, 'GALLEY_SHARE');
  near(mine(g), gm - ramRecoil(gd, true), 0.01, 'a GALLEY_RAM-th back');
  assert.equal(g.log.mid.at(-1), 'Your ram smashes into the hull!');
});

test('RAM-RETURN the angle: my stem into her stern along her keel deals RAM_GLANCE of a square ram (mutants: the angle unread)', async () => {
  const h = await helm();
  const full = h.e.ship.damage.hull;
  ram(h, h.e, 6, 0);
  assert.equal(full - h.e.ship.damage.hull, ramBlow({ closing: 6, square: 0, mine: 672, hers: full }));
  assert.equal(full - h.e.ship.damage.hull, Math.round(0.15 * Math.min(672, full) * 0.75 * RAM_GLANCE));
});

/** Rams `h`'s ship from whole until her colours come down (`most` rams at the most): each ram's hull, in turn. */
function ramToStrike(h, most = 12) {
  const d = h.e.ship.damage, blows = [];
  for (let i = 0; i < most && d.state === SHIP_STATES.afloat; i++) {
    const was = d.hull;
    ram(h, h.e, 8);
    blows.push(was - d.hull);
    assert.notEqual(d.state, SHIP_STATES.sinking, 'never sunk by a ram');
    if (d.state === SHIP_STATES.afloat) rest(h, h.e);
  }
  return blows;
}

test('RAM-RETURN rammed to her strike and no further: a galley\'s rams on a Coasting Trader - each GALLEY_SHARE of her hull at the most, none sinking her (the retired law\'s first did) - and a galleon\'s plain stem\'s, RAM_SHARE, bring her colours down at her line; struck, she is not rammed again (her hull as it was, no blow said) and the grapples are the key\'s, "E: board" (BOARD-MAGNET); my own hull never under its line by the recoils (mutants: the room, a struck ship rammed)', async () => {
  const g = await helm({ hull: HULL.LargeGalley, ship: 'merchantCoaster' });
  const d = g.e.ship.damage;
  const blows = ramToStrike(g);
  assert.equal(d.state, SHIP_STATES.struck, `struck after ${blows.join(', ')}`);
  assert.equal(blows[0], Math.round(GALLEY_SHARE * d.maxHull), 'a whole ram of a galley\'s');
  assert.ok(blows.length >= 3 && blows.every((b) => b <= blows[0]), `each a share: ${blows}`);
  near(d.hull, d.maxHull * STRUCK_AT, 1, 'at her line');
  assert.ok(mine(g) > hullBuild(HULL.LargeGalley).hullHp * STRUCK_AT, 'mine over its line');
  // struck: no ram lands
  const struckHull = d.hull, said = g.log.mid.length;
  rest(g, g.e);
  ram(g, g.e, 8);
  assert.equal(d.hull, struckHull, 'a struck ship is not rammed');
  assert.equal(g.log.mid.length, said, 'nor any ram said');
  // a galleon's plain stem: five rams and more - and the grapples' reach from her helm to the ship struck at her stem
  const h = await helm({ ship: 'merchantCoaster' });
  const plain = ramToStrike(h);
  assert.equal(h.e.ship.damage.state, SHIP_STATES.struck, `struck after ${plain.join(', ')}`);
  assert.equal(plain[0], Math.round(RAM_SHARE * h.e.ship.damage.maxHull));
  assert.ok(plain.length >= 5, `${plain.length} rams`);
  frames(h, [[h.e, before(h, h.e, RAM_REACH / 2)]]);
  assert.equal(h.host.hudModel().board?.kind, 'board', 'E: board');
});

// ── a galley's ram ──────────────────────────────────────────────────────────────────────────────────────────────────

test('RAM-RETURN a galley rams the ship she fights: a corsair galley engaged on me, her stem at my stern - my hull takes her ram on its lesser-hull law (braced, half), and she a GALLEY_RAM-th back; a War Galley under the same stem, fighting no one, rams nothing; a galley engaged on a merchantman rams her to strike and never under (AUDIT NAV2 F26\'s law, the room), a sister ship under her stem never (mutants: the galleys unchecked, a friend rammed, the brace, the room)', async () => {
  const b = hullBuild(HULL.LargeGalley);
  const atMyStern = (s) => { s.pos = [0, 0, -(b.bowZ + 2)]; s.yaw = 0; s.speed = 5.6; s.course = [0, 5000]; };
  const run = async (brace, cls = 'pirateGalley') => {
    const h = await sea({ hull: HULL.SmallShip, settings: { ShipsAtSea: 'off', Boarders: false } });
    const gal = h.host._sea.get(h.host.spawnShip(cls, { range: 200, bearing: 0 }));
    atMyStern(gal.ship);
    const h0 = mine(h);
    h.host.frame(0.1, { brace });
    return { h, gal, took: h0 - mine(h) };
  };
  const { h, gal, took } = await run(false);
  assert.equal(gal.ship.mode, 'engage');
  const at = (closing) => ramBlow({ closing, square: 0, mine: gal.ship.damage.maxHull, hers: hullBuild(HULL.SmallShip).hullHp, galley: true });
  assert.ok(took >= at(5) && took <= at(5.6), `her ram, along my keel: ${took} in ${at(5)}..${at(5.6)}`);
  assert.ok(took <= GALLEY_SHARE * 672 * RAM_GLANCE + 1, `bounded: ${took}`);
  assert.equal(h.log.mid.at(-1), 'A galley rams you!');
  assert.ok(gal.ship.damage.hullShare() < 1, 'she takes a share back');
  const braced = (await run(true)).took;
  near(braced, took * BRACE_TAKEN, 1.01, 'braced: half');
  const navy = await run(false, 'navyGalley');
  assert.notEqual(navy.gal.ship.mode, 'engage');
  assert.equal(navy.took, 0, 'a War Galley fighting no one rams nothing');
  // one captain's galley on another's ship
  const s = await sea({ hull: null });
  const g = s.host._sea.get(s.host.spawnShip('pirateGalley', { range: 400, bearing: 0, temper: 'bold' }));
  const c = s.host._sea.get(s.host.spawnShip('merchantCoaster', { range: 700, bearing: 0 }));
  const by = s.host._sea.get(s.host.spawnShip('pirateSloop', { range: 700, bearing: 90 }));   // her own trade's: never hers to fight
  for (let i = 0; i < 20 && !(g.boat && c.boat && by.boat); i++) s.host.frame(0.1);
  assert.ok(g.boat && c.boat && by.boat, 'the hulls built');
  const place = (x, speed) => {
    x.ship.pos = [0, 0, 400]; x.ship.yaw = Math.PI / 2; x.ship.speed = 0;
    g.ship.pos = [0, 0, 400 - hullBuild(HULL.LargeBoat).halfWidth - 0.3 - b.bowZ]; g.ship.yaw = 0; g.ship.speed = speed;
  };
  const engage = (x) => { g.ship.mode = 'engage'; g.ship.target = x.id; };
  // a bystander under her stem: she fights the other
  c.ship.pos = [-300, 0, 700];
  place(by, 0); engage(c); s.host.frame(0.1);
  place(by, RAM_SPEED + 4); engage(c); s.host.frame(0.1);
  assert.notEqual(g.ship.target, by.id);
  assert.equal(by.ship.damage.hullShare(), 1, 'a ship she does not fight - her own trade\'s, under her stem - is bumped, never rammed');
  // the merchantman she fights: to her strike, never under
  by.ship.pos = [300, 0, 700];
  for (let i = 0; i < 300 && c.ship.damage.state === SHIP_STATES.afloat; i++) { by.ship.pos = [300, 0, 700]; place(c, RAM_SPEED + 4); engage(c); s.host.frame(0.1); }
  assert.equal(c.ship.damage.state, SHIP_STATES.struck, `struck, not ${c.ship.damage.state}`);
  near(c.ship.damage.hull, c.ship.damage.maxHull * STRUCK_AT, 1, 'at her line');
});

/** A stand-in sea for the module alone (scenes/naval/navalRams.js): ships as the host keeps them, each hull's box off its
 *  build on the flat (navalShips.js flatHull), my boat at the origin heading +z, every seam recorded. */
function standIn() {
  const box = (pos, yaw, hull) => { const f = flatHull(pos, yaw, hull); return { c: [f.c[0], 0, f.c[1]], ax: [f.r[0], 0, f.r[1]], ay: [0, 1, 0], az: [f.f[0], 0, f.f[1]], h: [f.hw, 6, f.hl] }; };
  const boat = { hull: HULL.SmallShip, GameObject: {} };
  const me = { damage: createShipDamage({ hullHp: 672, sailHp: 256, crew: 24, player: true }), guns: { braced: false } };
  const ships = new Map();
  const log = { struck: [], mid: [] };
  let now = 0;
  const ship = (id, cls, o = {}) => {
    const c = classById(cls);
    const e = { id, n: ships.size + 1, owner: o.owner ?? null, boat: {}, ship: { hull: c.hull, pos: [0, 0, 0], yaw: 0, speed: 0, mode: 'cruise', target: null, boarded: false, damage: createShipDamage(c), ...o.ship } };
    ships.set(id, e);
    return e;
  };
  const rams = createNavalRams({
    ships: () => ships.values(), get: (id) => ships.get(id), myBoats: () => [boat], myId: () => 'me', now: () => now, seaY: () => 0, random: () => 0.5,
    boatPose: () => ({ position: [0, 0, 0], rotation: [0, 0, 0, 1], velocity: [0, 0, 0] }),
    hullBox: (b) => { const s = b === boat ? { pos: [0, 0, 0], yaw: 0, hull: boat.hull } : [...ships.values()].find((e) => e.boat === b).ship; return box(s.pos, s.yaw, s.hull); },
    state: () => me, boarding: () => null, called: () => 'A galley',
    strike: (e, hurt, by) => { log.struck.push([e.id, hurt.hull, by]); e.ship.damage.apply(hurt, now); }, sendHit: () => true, charge: () => {},
    hit: () => {}, sound: () => {}, mid: (x) => log.mid.push(x),
  });
  /** A galley's stem `inside` m into the hull at `pos` lying across her bow (her keel along +z, the hull's along +x). */
  const stemInto = (g, pos, inside = 0.5) => { const f = flatHull(pos, Math.PI / 2, HULL.LargeBoat); g.ship.pos = [pos[0], 0, pos[2] - f.hw + inside - hullBuild(g.ship.hull).bowZ]; g.ship.yaw = 0; };
  /** A galley's stem 10 m into my boat from astern. */
  const galleyInto = (g) => { g.ship.pos = [0, 0, -hullBuild(HULL.LargeGalley).bowZ - 10]; g.ship.yaw = 0; };
  return { rams, me, ship, log, stemInto, galleyInto, step: (dt = 0.1) => { now += dt; rams.galleys(); } };
}

test('RAM-RETURN a galley\'s ram, on the module alone: it rams the ship she fights - engaged on her or closing to board - and only while she fights; a galley fleeing me with her stem in my side, one another player stands, one being boarded, and one under RAM_SPEED ram nothing; a wreck of mine is not rammed; a struck ship is not rammed; once a stretch; on my boat its law (her blow by the lesser hull, braced, half, my crew\'s toughness), said, and a GALLEY_RAM-th back on her - never her own strike (mutants: a fleeing galley rams, the brace unread, the cooldown, the room on another\'s, a struck ship rammed, the recoil\'s room)', () => {
  const t = standIn();
  const g = t.ship('g', 'pirateGalley', { ship: { speed: 6, mode: 'flee', target: 'me' } });
  t.galleyInto(g);
  const whole = t.me.damage.hull;
  t.step();
  assert.equal(t.me.damage.hull, whole, 'fleeing: no ram');
  for (const o of [{ owner: 'peer' }, { ship: { boarded: true } }, { ship: { speed: RAM_SPEED - 0.1 } }]) {
    Object.assign(g, o.owner ? { owner: o.owner } : {}); Object.assign(g.ship, { mode: 'engage', ...(o.ship ?? {}) });
    t.step();
    assert.equal(t.me.damage.hull, whole, JSON.stringify(o));
    g.owner = null; g.ship.boarded = false; g.ship.speed = 6;
  }
  g.ship.mode = 'board';
  t.step();
  const blow = ramBlow({ closing: 6, square: 0, mine: g.ship.damage.maxHull, hers: 672, galley: true });
  assert.equal(whole - t.me.damage.hull, blow, 'closing to board, she rams');
  assert.equal(t.log.mid.at(-1), 'A galley rams you!');
  assert.equal(g.ship.damage.maxHull - g.ship.damage.hull, ramRecoil(blow, true), 'a GALLEY_RAM-th back');
  const after = t.me.damage.hull;
  t.step(RAM_COOLDOWN_S - 0.2);
  assert.equal(t.me.damage.hull, after, 'once a stretch');
  t.me.guns.braced = true;
  t.step(0.3);
  assert.equal(after - t.me.damage.hull, Math.round(blow * BRACE_TAKEN), 'braced: half');
  t.me.guns.braced = false;
  // her own strike: the recoil never brings her colours down
  g.ship.damage.apply({ hull: Math.floor(g.ship.damage.hull - g.ship.damage.maxHull * STRUCK_AT) - 2, sail: 0, crew: 0 }, 0);
  t.step(RAM_COOLDOWN_S + 0.1);
  assert.equal(g.ship.damage.state, SHIP_STATES.afloat, `her own ram never strikes her (${g.ship.damage.hull})`);
  assert.ok(g.ship.damage.hull > g.ship.damage.maxHull * STRUCK_AT);
  // a wreck of mine: nothing
  t.me.damage.apply({ hull: 10000, sail: 0, crew: 0 }, 0);
  assert.equal(t.me.damage.state, SHIP_STATES.wrecked);
  const wreck = [t.me.damage.crew, g.ship.damage.hull, t.log.mid.length];
  t.step(RAM_COOLDOWN_S + 0.1);
  assert.deepEqual([t.me.damage.crew, g.ship.damage.hull, t.log.mid.length], wreck, 'a wreck is not rammed: no men, no recoil, no word');
  // on a ship of the sea she fights: to her strike and never under; struck, never again
  const t2 = standIn();
  const g2 = t2.ship('g', 'pirateGalley', { ship: { speed: 6, mode: 'engage', target: 'c' } });
  const c = t2.ship('c', 'merchantCoaster', { ship: { pos: [0, 0, 400], yaw: Math.PI / 2 } });
  for (let i = 0; i < 20 && c.ship.damage.state === SHIP_STATES.afloat; i++) { t2.stemInto(g2, c.ship.pos); t2.step(RAM_COOLDOWN_S + 0.1); }
  assert.equal(c.ship.damage.state, SHIP_STATES.struck);
  assert.equal(c.ship.damage.hull, c.ship.damage.maxHull * STRUCK_AT, 'at her line exactly');
  const n = t2.log.struck.length;
  assert.ok(n >= 3 && t2.log.struck.every(([id, , by]) => id === 'c' && by === 'g'), `${n} rams, the galley's`);
  t2.stemInto(g2, c.ship.pos);
  t2.step(RAM_COOLDOWN_S + 0.1);
  assert.equal(t2.log.struck.length, n, 'struck: never rammed again');
});

// ── online ──────────────────────────────────────────────────────────────────────────────────────────────────────────

test('RAM-RETURN online: a ram on a ship another player stands is her stander\'s to take - sent as a blow (holed, its men) bounded by her room as her word has her, fouling nothing; my copy of her untouched (mutants: the peer\'s blow unbounded)', async () => {
  const sent = [];
  const h = await sea({ hull: HULL.SmallShip, online: { id: () => 'a-player', peers: () => [], sendHit: (d) => { sent.push(d); return true; } }, pool: await freshPool(), settings: { ShipsAtSea: 'off', Boarders: false } });
  const w = (pos, hull = 1) => navalWireRecord({ ships: [{ n: 4, classId: 'merchantGalleon', variant: 0, pos, yaw: Math.PI / 2, speed: 0, sails: 0, hull, sail: 1, crew: 1, state: 'afloat', heel: 0, seed: 99, fire: false, gen: 0, region: 17 }] });
  h.host.applyWord('b-player', w([0, 0, 200], 0.3), (p) => p);
  h.run(0.3);
  const e = h.host._sea.get('b-player:4');
  assert.ok(e?.boat, 'her copy stands, a hull of her own');
  h.runtime.state.velocityCurrent = [0, 0, 6];
  h.host.applyWord('b-player', w([0, 0, 40], 0.3), (p) => p);
  h.run(0.3);
  for (let z = 24; z >= 4 && !sent.length; z -= 1) {
    h.host.applyWord('b-player', w([0, 0, z], 0.3), (p) => p);
    e.ship.pos = [0, 0, z]; e.target = { ...e.target, pos: [0, 0, z], speed: 0 };
    h.host.frame(0.1);
  }
  const blow = sent.find((d) => d?.nv && d.to === 'b-player');
  assert.ok(blow, 'her blow sent to her stander');
  const hit = validNavalHit(blow);
  const room = Math.ceil(e.ship.damage.maxHull * (0.3 - STRUCK_AT));
  assert.ok(hit.hull > 0 && hit.hull <= room, `bounded by her room: ${hit.hull} of ${room}`);
  assert.equal(hit.zone, 'holed');
  assert.equal(blow.nv.u, undefined, 'no foul');
  near(e.ship.damage.hullShare(), 0.3, 1e-9, 'my copy hers to say');
});

// ── a booked ship ───────────────────────────────────────────────────────────────────────────────────────────────────

test('RAM-RETURN FERRY-CLEAR a booked ship\'s master never rams: her stem in a ship\'s side at a ram\'s way deals nothing, takes nothing back, says nothing and charges nobody - the same stem on a boat of mine rams (mutants: the charter unread)', async () => {
  const h = await helm();
  h.boat.charter = { v: 1, ship: 'Sea Hare', to: 'Daggerfall' };
  const full = h.e.ship.damage.hull, m0 = mine(h);
  ram(h, h.e, 6);
  frames(h, [[h.e, before(h, h.e, RAM_REACH / 2)]], 2);
  assert.equal(h.e.ship.damage.hull, full, 'her hull whole');
  assert.equal(mine(h), m0, 'nothing back on the booked ship');
  assert.ok(!h.e.charged?.has('fire'), 'no charge of piracy');
  delete h.boat.charter;
  rest(h, h.e);
  ram(h, h.e, 6);
  assert.ok(h.e.ship.damage.hull < full, 'a boat of mine rams');
});
