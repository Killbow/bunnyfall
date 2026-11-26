// Daedra summoning, ported from the DFU DaedraSummoningService. The Glenmoril Witches always summon Hircine,
// an intentional DFU change from classic. Other covens draw a random prince once a day, and temples and the Mages
// Guild answer only the prince whose day it is. Online, those last two call the prince the player names.

import { FACTION_FLAGS } from '../guilds/factionRep.js';
import { FACTION_TYPES, GUILD_GROUPS } from '../formats/factionFile.js';
import { getLocalizedFactionName, t } from '../ui/textManager.js';
import { noteFirstUse } from '../ui/tutorials.js';

// The order matters: index 0 is Hircine (left out of the coven roll), and index 8 is Sheogorath (the gatecrasher).
export const DAEDRA = Object.freeze([
  { factionId: 4, quest: 'X0C00Y00', dayOfYear: 155, video: 'HIRCINE.FLC', bonusCond: null, name: 'Hircine' },
  { factionId: 1, quest: 'V0C00Y00', dayOfYear: 1, video: 'CLAVICUS.FLC', bonusCond: null, name: 'Clavicus Vile' },
  { factionId: 2, quest: 'Y0C00Y00', dayOfYear: 320, video: 'MEHRUNES.FLC', bonusCond: null, name: 'Mehrunes Dagon' },
  { factionId: 3, quest: '20C00Y00', dayOfYear: 350, video: 'MOLAGBAL.FLC', bonusCond: null, name: 'Molag Bal' },
  { factionId: 5, quest: '70C00Y00', dayOfYear: 46, video: 'SANGUINE.FLC', bonusCond: 'Rain', name: 'Sanguine' },
  { factionId: 6, quest: '50C00Y00', dayOfYear: 99, video: 'PERYITE.FLC', bonusCond: 'Rain', name: 'Peryite' },
  { factionId: 7, quest: '80C0XY00', dayOfYear: 278, video: 'MALACATH.FLC', bonusCond: null, name: 'Malacath' },
  { factionId: 8, quest: 'W0C00Y00', dayOfYear: 65, video: 'HERMAEUS.FLC', bonusCond: null, name: 'Hermaeus Mora' },
  { factionId: 9, quest: '60C00Y00', dayOfYear: 32, video: 'SHEOGRTH.FLC', bonusCond: 'Thunder', name: 'Sheogorath' },
  { factionId: 10, quest: 'U0C00Y00', dayOfYear: 302, video: 'BOETHIAH.FLC', bonusCond: 'Rain', name: 'Boethiah' },
  { factionId: 11, quest: '30C00Y00', dayOfYear: 129, video: 'NAMIRA.FLC', bonusCond: null, name: 'Namira' },
  { factionId: 12, quest: '10C00Y00', dayOfYear: 13, video: 'MERIDIA.FLC', bonusCond: null, name: 'Meridia' },
  { factionId: 13, quest: '90C00Y00', dayOfYear: 190, video: 'VAERNIMA.FLC', bonusCond: null, name: 'Vaernima' },
  { factionId: 14, quest: '40C00Y00', dayOfYear: 248, video: 'NOCTURNA.FLC', bonusCond: 'Rain', name: 'Nocturnal' },
  { factionId: 15, quest: 'Z0C00Y00', dayOfYear: 283, video: 'MEPHALA.FLC', bonusCond: null, name: 'Mephala' },
  { factionId: 16, quest: 'T0C00Y00', dayOfYear: 81, video: 'AZURA.FLC', bonusCond: null, name: 'Azura' },
]);
export const HIRCINE_INDEX = 0;
export const SHEOGORATH_INDEX = 8;
export const GLENMORIL_WITCHES = 419;
// Derived from the enum tables, because the callers pass the faction record's raw type and guild group.
export const WITCHES_COVEN_TYPE = FACTION_TYPES.WitchesCoven;
export const WITCHES_GUILD_GROUP = GUILD_GROUPS.Witches;

export const SUMMON_TEXT = Object.freeze({
  notToday: 480, areYouSure: 481, before: 482, failed: 484,
});

// Online no rest moves the sky, and a sky year is fifteen real days, so the summoner calls the named prince on any
// day. A coven keeps its daily draw.
export const summonsByName = ({ factionId = 0, factionType = null, online = false } = {}) => !!online
  && factionId !== GLENMORIL_WITCHES && factionType !== WITCHES_COVEN_TYPE;
export const PRINCES_BY_NAME = Object.freeze([...DAEDRA].sort((a, b) => a.name.localeCompare(b.name)));
export const SUMMON_BY_NAME_ROWS = Object.freeze([
  Object.freeze({ text: 'Do you, %pcn, wish', center: true }),
  Object.freeze({ text: 'to risk you life and very soul by summoning', center: true }),
  Object.freeze({ text: '%dae into our mundane world?', center: true }),
]);
// Rows are read before %dae resolves. The first sentence holds only %dat and %dae, and neither adds a full stop.
export function summonQuestionRows(record) {
  const rows = Array.isArray(record) ? record : [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = typeof row === 'string' ? row : String(row?.text ?? '');
    const end = /[.!?](?:\s+|$)/.exec(text);
    if (!end) continue;
    const rest = text.slice(end.index + end[0].length);
    const tail = [...(rest ? [typeof row === 'string' ? rest : { ...row, text: rest }] : []), ...rows.slice(i + 1)];
    return tail.length ? tail : SUMMON_BY_NAME_ROWS;
  }
  return SUMMON_BY_NAME_ROWS;
}
export function summonByNameBoxes(summon, ask = () => SUMMON_BY_NAME_ROWS) {
  return [{
    picker: PRINCES_BY_NAME.map((d) => d.name),
    onPick: (i) => [{
      rows: ask(PRINCES_BY_NAME[i]),
      buttons: 'YesNo',
      onYes: () => { const next = summon(PRINCES_BY_NAME[i]); return next ? [next] : null; },
    }],
  }];
}

// %dae is this window's own macro with no global source, so its value travels with the box. A null daedra leaves
// the token as written.
export const summonMacroValues = (daedra) => Object.freeze({ dae: daedra?.name != null ? getLocalizedFactionName(daedra.factionId, daedra.name) : null });

export const DAEDRIC_FOES = Object.freeze([
  'DaedraLord', 'DaedraSeducer', 'Daedroth', 'FireDaedra', 'FrostDaedra',
]);

export const summoningCost = (npcRep) => 200000 - (npcRep * 1000);
export const summoningChance = (daedraRep, bonus) => 30 + daedraRep + bonus;

// `state` is mutated when a coven re-rolls, as DFU writes it onto the player. Online, `rerollDay` is the event
// clock day, while the day of each prince stays on the sky calendar.
export function daedraForSummoner({
  factionId, factionType = null, dayOfYear = 0, rerollDay = dayOfYear, state = null, rolls = Math.random,
} = {}) {
  // Glenmoril is tested by id before the type test, so its witches never reach the coven's random draw.
  if (factionId === GLENMORIL_WITCHES) return DAEDRA[HIRCINE_INDEX];
  if (factionType === WITCHES_COVEN_TYPE) {
    const s = state ?? {};
    // The roll excludes index 0, so a coven never draws Hircine, and a stored 0 re-rolls.
    if (s.daedraSummonDay !== rerollDay || !s.daedraSummonIndex) {
      s.daedraSummonIndex = 1 + Math.floor(rolls() * (DAEDRA.length - 1));
      s.daedraSummonDay = rerollDay;
    }
    return DAEDRA[s.daedraSummonIndex];
  }
  return DAEDRA.find((d) => d.dayOfYear === dayOfYear) ?? null;
}

export function weatherBonus(daedra, { raining = false, storming = false } = {}) {
  if (!daedra?.bonusCond) return 30;
  if (daedra.bonusCond === 'Rain' && raining) return 30;
  if (daedra.bonusCond === 'Thunder' && storming) return 30;
  return 0;
}

// The gold pays for the summoning, so a failure is not refunded. Departure from DFU: the quest is requested before
// the gold is spent and the flag recorded, so a region where it cannot be made costs nothing.
export function attemptSummoning({
  daedra, summonerRep = 0, summonerGuildGroup = null, gold = 0,
  daedraRep = () => 0, hasSummoned = () => false, offerQuest = () => null,
  raining = false, storming = false, rolls = Math.random,
} = {}) {
  const cost = summoningCost(summonerRep);
  if (gold < cost) return { kind: 'poor', cost };
  noteFirstUse('daedra-summoning');

  // Sheogorath's gatecrash is rolled before the summoning chance, so the chance that follows is his.
  const sheoChance = storming ? 15 : 5;
  const called = (Math.floor(rolls() * 100) + 1) <= sheoChance ? DAEDRA[SHEOGORATH_INDEX] : daedra;

  const bonus = weatherBonus(called, { raining, storming });
  const chance = summoningChance(daedraRep(called.factionId), bonus);
  const roll = Math.floor(rolls() * 100) + 1;
  if (roll > chance) {
    return {
      kind: 'failed', cost, daedra: called, chance, roll,
      spawnFoes: summonerGuildGroup === WITCHES_GUILD_GROUP,
    };
  }
  if (hasSummoned(called.factionId)) {
    return { kind: 'greeting', daedra: called, cost, textId: SUMMON_TEXT.before };
  }
  const offered = offerQuest(called.quest);
  if (!offered) return { kind: 'noQuest', daedra: called, cost, quest: called.quest };
  return { kind: 'quest', daedra: called, cost, quest: called.quest, flag: FACTION_FLAGS.Summoned, offered };
}

export const noQuestText = (daedra) => t('summon.noQuest',
  '{prince} answers, but has no task for you in this region. You keep your gold. Try summoning in another region.',
  { prince: getLocalizedFactionName(daedra.factionId, daedra.name) });
