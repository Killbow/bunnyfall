// @ts-check
// Headless verification suite for Bazaar Betwixt spatial rules, Psijic Seals D1 ledger,
// character reset invariants, and banked pre-reset build restoration.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bazaarStepAcross,
  clampBazaarLocalXZ,
  validBazaarPortalWord,
} from '../src/systems/bazaarBetwixt.js';
import { bazaarAstralSong } from '../src/audio/bazaarAudio.js';
import {
  PSIJIC_SEAL_EPOCH,
  epochSealsDue,
  ensureOfflinePsijicSeals,
  spendOfflinePsijicSeal,
} from '../src/systems/psijicSealsLaw.js';
import {
  sealsBalanceOf,
  spendPsijicSeal,
  grantPsijicSeals,
  ensureSealsAccountRow,
} from '../server-account/src/psijicSeals.js';
import { necromancerCareer } from '../src/systems/necromancy/necroCareer.js';
import { createCharacter, statTotal } from '../src/characters/chargen.js';
import { STAT_KEYS_ORDER, liveStat } from '../src/characters/statMods.js';
import { SKILLS, levelUpSkillSum } from '../src/characters/skills.js';
import { LEVELING_CLASSIC, LEVELING_VIRTUE } from '../src/characters/oblivionLeveling.js';
import { OGHMA_BONUS_POOL } from '../src/items/artifactEffects.js';
import { mintCondition, setItemFields } from '../src/items/itemTemplates.js';
import { createVampirismCurse } from '../src/afflictions/vampirism.js';
import { awakenVampire, vitaeNow } from '../src/systems/vampire/vitae.js';
import {
  thrallState,
  takePrisoner,
  makeServant,
  giveGear,
  thrallRound,
} from '../src/systems/vampire/thralls.js';
import { snapshotPlayer, restorePlayer } from '../src/saves/save.js';
import { crossLeveling } from '../src/saves/realmCustoms.js';
import {
  initialRespecStats,
  defaultSkillSlotPlan,
  buildRespecCustomCareer,
  sanitizeParkedRespec,
  hasParkedRespec,
  applyCharacterRespec,
  revertCharacterRespec,
} from '../src/characters/characterRespec.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function makeD1Sqlite() {
  const raw = new DatabaseSync(':memory:');
  const migDir = join(ROOT, 'server-account/migrations');
  for (const name of readdirSync(migDir).filter((n) => n.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(join(migDir, name), 'utf8'));
  }
  const wrapStmt = (/** @type {string} */ sql, /** @type {any[]} */ args = []) => ({
    bind: (/** @type {any[]} */ ...next) => wrapStmt(sql, next),
    async first() {
      const row = raw.prepare(sql).get(...args);
      return row ?? null;
    },
    async all() {
      return { results: raw.prepare(sql).all(...args) };
    },
    async run() {
      const r = raw.prepare(sql).run(...args);
      return { meta: { changes: Number(r.changes ?? 0) } };
    },
  });
  return {
    raw,
    prepare: (/** @type {string} */ sql) => wrapStmt(sql),
    async batch(/** @type {any[]} */ stmts) {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

function makeMageCareer() {
  const built = buildRespecCustomCareer({
    name: 'Sorcerer',
    hp: 8,
    primarySkills: [SKILLS.Destruction, SKILLS.Mysticism, SKILLS.Alteration],
    majorSkills: [SKILLS.Thaumaturgy, SKILLS.Illusion, SKILLS.Restoration],
    minorSkills: [SKILLS.ShortBlade, SKILLS.Dodging, SKILLS.Medical, SKILLS.Mercantile, SKILLS.Streetwise, SKILLS.Running],
    advantages: [],
    disadvantages: [],
  });
  assert.equal(built.ok, true);
  return built.career;
}

function makeWarriorCareer() {
  const built = buildRespecCustomCareer({
    name: 'Knight',
    hp: 18,
    primarySkills: [SKILLS.LongBlade, SKILLS.BluntWeapon, SKILLS.CriticalStrike],
    majorSkills: [SKILLS.Axe, SKILLS.Archery, SKILLS.Dodging],
    minorSkills: [SKILLS.Running, SKILLS.Swimming, SKILLS.Climbing, SKILLS.Medical, SKILLS.Etiquette, SKILLS.Mercantile],
    advantages: [],
    disadvantages: [{ primary: 'forbiddenMaterial', secondary: 'daedric', difficulty: -8 }],
  });
  assert.equal(built.ok, true);
  return built.career;
}

test('bazaarBetwixt spatial hysteresis, platform clamping, and wire validation', () => {
  const tear = [10, 2, 20];
  let st = bazaarStepAcross(null, [10, 2, 19.2], tear, 0, false);
  assert.equal(st.armed, true);
  assert.equal(st.crossed, false);
  st = bazaarStepAcross([10, 2, 19.2], [10, 2, 20.1], tear, 0, st.armed);
  assert.equal(st.crossed, true);
  assert.ok(Array.isArray(st.arrivalFeet));

  const clamped = clampBazaarLocalXZ(99, 99);
  assert.ok(Math.hypot(clamped[0], clamped[1]) < 40);
  assert.deepEqual(validBazaarPortalWord({ i: 'bz1234', r: 45000 }), { i: 'bz1234', r: 45000 });
  assert.equal(validBazaarPortalWord({ i: 'bad space!', r: 100 }), null);

  const song = bazaarAstralSong();
  assert.equal(song.seamless, true);
  assert.ok(song.events.some((e) => e.type === 'noteOn' && e.velocity > 0));
  assert.ok(song.events.every((e) => e.type === 'programChange' || e.type === 'controller' || e.type === 'noteOn'));
});

test('psijicSeals D1 ledger rejects guests, grants nothing at first, takes staff grants, and deduplicates retries', async () => {
  const db = makeD1Sqlite();
  db.raw.prepare('INSERT INTO players (id, handle, guest_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)').run('guest_1', null, 'Guest#1111', 1000, 1000);
  db.raw.prepare('INSERT INTO players (id, handle, guest_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)').run('acct_1', 'celarusfan', 'Wanderer#2222', 1000, 1000);
  db.raw.prepare('INSERT INTO players (id, handle, guest_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)').run('admin_1', 'killbunny', 'Wanderer#3333', 1000, 1000);

  const guestPlayer = { id: 'guest_1', handle: null, guest_name: 'Guest#1111' };
  const linkedPlayer = { id: 'acct_1', handle: 'celarusfan', guest_name: null };
  const adminPlayer = { id: 'admin_1', handle: 'killbunny', guest_name: null };
  const env = { DEVELOPER_HANDLES: 'killbunny' };

  const guestBal = await sealsBalanceOf({ db, nowS: 1001 }, guestPlayer);
  assert.deepEqual(guestBal, { error: 'seals-need-account' });
  const guestSpend = await spendPsijicSeal({ db, nowS: 1001 }, guestPlayer, { rid: 'respec_guest_try_1' });
  assert.deepEqual(guestSpend, { error: 'seals-need-account' });
  const guestRows = db.raw.prepare('SELECT COUNT(*) AS n FROM psijic_seals WHERE account_id = ?').get('guest_1');
  assert.equal(Number(guestRows?.n ?? 0), 0);

  assert.equal(PSIJIC_SEAL_EPOCH, 0, 'no Seal is handed out yet');
  const b1 = await sealsBalanceOf({ db, nowS: 1002 }, linkedPlayer);
  assert.deepEqual(b1, { ok: true, balance: 0, epoch: 0 });
  const linkedRows = db.raw.prepare('SELECT COUNT(*) AS n FROM psijic_seal_ledger WHERE account_id = ?').get('acct_1');
  assert.equal(Number(linkedRows?.n ?? 0), 0, 'a first balance read writes no grant');

  const sEmpty = await spendPsijicSeal({ db, nowS: 1003 }, linkedPlayer, { rid: 'respec_at_zero_1' });
  assert.deepEqual(sEmpty, { error: 'seals-short', balance: 0 });

  const gOne = await grantPsijicSeals({ db, nowS: 1003 }, adminPlayer, env, { target: 'celarusfan', delta: 1, click: 'grant_first_01' });
  assert.equal(gOne.ok, true);
  assert.equal('balance' in gOne ? gOne.balance : -1, 1, 'a staff grant on an account with no row yet lands');

  const s1 = await spendPsijicSeal({ db, nowS: 1004 }, linkedPlayer, { rid: 'respec_retry_same_1', character: 'char_a' });
  assert.equal(s1.ok, true);
  assert.equal('balance' in s1 ? s1.balance : -1, 0);

  const s1Retry = await spendPsijicSeal({ db, nowS: 1005 }, linkedPlayer, { rid: 'respec_retry_same_1', character: 'char_a' });
  assert.equal(s1Retry.ok, true);
  assert.equal('repeat' in s1Retry ? s1Retry.repeat : false, true);
  assert.equal('balance' in s1Retry ? s1Retry.balance : -1, 0);

  const sShort = await spendPsijicSeal({ db, nowS: 1005 }, linkedPlayer, { rid: 'respec_second_empty' });
  assert.deepEqual(sShort, { error: 'seals-short', balance: 0 });

  const badGrant = await grantPsijicSeals({ db, nowS: 1006 }, adminPlayer, env, { target: 'celarusfan', delta: 2, click: 'bad id!' });
  assert.deepEqual(badGrant, { error: 'seals-rid' });

  const g1 = await grantPsijicSeals({ db, nowS: 1007 }, adminPlayer, env, { target: 'celarusfan', delta: 2, click: 'grant_click_01' });
  assert.equal(g1.ok, true);
  assert.equal('balance' in g1 ? g1.balance : -1, 2);

  const g1Retry = await grantPsijicSeals({ db, nowS: 1008 }, adminPlayer, env, { target: 'celarusfan', delta: 2, click: 'grant_click_01' });
  assert.equal(g1Retry.ok, true);
  assert.equal('repeat' in g1Retry ? g1Retry.repeat : false, true);
  assert.equal('balance' in g1Retry ? g1Retry.balance : -1, 2);

  // A later epoch bump grants exactly one Seal, once, to accounts with a row and to accounts without one.
  const e1 = await ensureSealsAccountRow({ db, nowS: 1010 }, 'acct_1', 1);
  assert.equal(e1.balance, 3);
  const e1Again = await ensureSealsAccountRow({ db, nowS: 1011 }, 'acct_1', 1);
  assert.equal(e1Again.balance, 3);
  const fresh = await ensureSealsAccountRow({ db, nowS: 1012 }, 'admin_1', 1);
  assert.equal(fresh.balance, 1);
  assert.equal((await ensureSealsAccountRow({ db, nowS: 1013 }, 'admin_1', 1)).balance, 1);
  const epochRows = db.raw.prepare("SELECT COUNT(*) AS n FROM psijic_seal_ledger WHERE reason = 'epoch-grant'").get();
  assert.equal(Number(epochRows?.n ?? 0), 2);

  const offline = /** @type {any} */ ({});
  assert.equal(ensureOfflinePsijicSeals(offline), 0, 'no offline Seal yet');
  assert.equal(spendOfflinePsijicSeal(offline).ok, false);
  assert.equal(ensureOfflinePsijicSeals(offline, 1), 1);
  assert.equal(ensureOfflinePsijicSeals(offline, 1), 1, 'an offline epoch bump grants once');
  assert.equal(epochSealsDue(1, 1), 0);
});

test('characterRespec, banked revert, Oghma +30 preservation, Customs, and Thrall kits', () => {
  const mageCareer = makeMageCareer();
  const warriorCareer = makeWarriorCareer();
  const necro = necromancerCareer();

  const hero = /** @type {any} */ ({ isPlayer: true, items: [], spells: [], activeEffects: [] });
  createCharacter(hero, mageCareer, -1, { name: 'Evelyn', race: 'Breton', raceId: 1, gender: 'female', faceIndex: 0 });
  hero.levelingSystem = LEVELING_VIRTUE;
  hero.level = 10;
  for (const k of STAT_KEYS_ORDER) hero.stats[k] = 60;
  hero.skills[SKILLS.Destruction] = 108;
  hero.masterSkills = true;
  hero.masteredSkills = [SKILLS.Destruction];
  hero.masteryPrompted = [SKILLS.Destruction];
  hero.oghmaLevelUp = true;

  assert.equal(ensureOfflinePsijicSeals(hero), 0);
  hero.psijicSeals = 1;
  assert.equal(spendOfflinePsijicSeal(hero).ok, true);

  // Add an active disease draining Agility by 55 so lowering Agility to 30 must clamp the drain safely.
  hero.activeEffects = [{
    kind: 'disease',
    permanent: true,
    ended: false,
    statMods: { agility: -55 },
  }];

  // Awaken vampire + bind a servant with a gifted iron longsword to verify kit return & upkeep rebase.
  const vamp = createVampirismCurse({ clan: 0, nowMinutes: 10_000 });
  hero.activeEffects.push(vamp);
  hero.racialOverride = vamp;
  awakenVampire(hero, 10_000);
  const st = thrallState();
  st.prisoners = [];
  st.servants = [];
  st.socials = [];
  st.upkeepDay = 6;
  st.hushDay = 6;
  const pris = takePrisoner(hero, { name: 'Raleth', type: 'guard', quality: 80, mobile: 128, source: 'test' });
  assert.ok(pris);
  makeServant(hero, pris.id, 10_000);
  const svId = st.servants[0]?.id;
  assert.ok(svId);
  const sword = mintCondition(setItemFields({ group: 'Weapons', templateIndex: 113, nativeMaterialValue: 0 }));
  hero.items.push(sword);
  giveGear(hero, svId, sword);
  assert.equal(hero.items.includes(sword), false);

  const preSum = levelUpSkillSum(hero);
  const nextStats = initialRespecStats(hero);
  const diff = (60 * 8 + OGHMA_BONUS_POOL) - statTotal(nextStats);
  nextStats.strength += diff;
  nextStats.agility -= 30;
  nextStats.endurance += 30;
  const plan = defaultSkillSlotPlan(hero.career, hero.skills, warriorCareer);

  const res1 = applyCharacterRespec(hero, {
    career: warriorCareer,
    careerIndex: -1,
    stats: nextStats,
    skillPlan: plan,
    rid: 'respec_probe_1',
    bankPolicy: 'replace',
  }, { nowMinutes: 10_000 });
  assert.equal(res1.ok, true);
  assert.equal(hero.lastRespecRid, 'respec_probe_1');
  assert.equal(hasParkedRespec(hero), true);
  assert.equal(levelUpSkillSum(hero), preSum);
  assert.equal(hero.skills[SKILLS.LongBlade], 108);
  assert.deepEqual(hero.masteredSkills, [SKILLS.LongBlade]);
  assert.equal(hero.items.includes(sword), true, 'Servant thrall kit must return to player pack when Vampirism is lifted');
  assert.equal(liveStat(hero, 'agility') >= 1, true, 'Disease stat drain must clamp so liveStat stays >= 1');

  // Save/restore round-trip + Customs crossLeveling on banked Oblivion state + tampered rawMaxHealth clamp.
  const snap = snapshotPlayer(hero);
  assert.equal(snap.lastRespecRid, 'respec_probe_1');
  snap.parkedRespec.state.rawMaxHealth = 9_999_999;
  const sanitized = sanitizeParkedRespec(snap.parkedRespec);
  assert.ok(sanitized && sanitized.state.rawMaxHealth < 2000);
  assert.equal(crossLeveling(snap), true);
  assert.equal(snap.levelingSystem, LEVELING_CLASSIC);
  assert.equal(snap.parkedRespec.state.levelingSystem, LEVELING_CLASSIC);

  const reloaded = /** @type {any} */ ({ isPlayer: true, items: [], spells: [], activeEffects: [] });
  createCharacter(reloaded, warriorCareer, -1, { name: 'Reload', race: 'Breton', raceId: 1, gender: 'female', faceIndex: 0 });
  restorePlayer(reloaded, snap);
  assert.equal(reloaded.lastRespecRid, 'respec_probe_1');
  assert.equal(hasParkedRespec(reloaded), true);

  // Second Seal with bankPolicy: 'keep' preserves original Sorcerer banked build.
  const necroPlan = defaultSkillSlotPlan(reloaded.career, reloaded.skills, necro);
  const res2 = applyCharacterRespec(reloaded, {
    career: necro,
    careerIndex: -1,
    stats: initialRespecStats(reloaded),
    skillPlan: necroPlan,
    rid: 'respec_probe_2',
    bankPolicy: 'keep',
  }, { nowMinutes: 12_000 });
  assert.equal(res2.ok, true);
  assert.equal(reloaded.parkedRespec.state.career.name, 'Sorcerer');

  // Revert 10 days later (24,400 min): Sorcerer restored, Oghma +30 preserved, thrall upkeepDay rebased, bank cleared.
  const beforeVitae = reloaded.parkedRespec.state.curse.racialOverride.vitae;
  const rev = revertCharacterRespec(reloaded, { nowMinutes: 24_400 });
  assert.equal(rev.ok, true);
  assert.equal(reloaded.career.name, 'Sorcerer');
  assert.equal(hasParkedRespec(reloaded), false);
  assert.equal(reloaded.oghmaLevelUp, false);
  assert.equal(statTotal(reloaded.stats), 60 * 8 + OGHMA_BONUS_POOL, 'All +30 Oghma points must persist in restored stats');
  assert.equal(vitaeNow(reloaded, 24_400), beforeVitae);
  thrallRound(reloaded, 24_400);
  assert.equal(st.servants.length, 1, 'Rebased upkeepDay must prevent 10-day thrall desertion shock on revert');
});
