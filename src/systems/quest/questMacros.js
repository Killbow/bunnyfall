// Quest macro engine. Kept C# quirk: the macro regex has no underscore in its inner class, so `_one_day_`
// truncates to `_one_` and misses its resource.

import { cromwarkQuestSiteBlocked } from '../../world/wild/cromwarkSettlements.js';
import { srand, randomRangeInclusive } from '../../formats/dfRandom.js';
import { liveStat } from '../../characters/statMods.js';
import { permanentSkillValue, SKILL_NAMES } from '../../characters/skills.js';
import { entityMaxEncumbrance, damageModifier, toHitModifier, hitPointsModifier, healingRateModifier } from '../../combat/formulas.js';
import { surname, getRandomNameBank } from '../../characters/nameHelper.js';
import { GENDERS, getNameBankOfRegion, fullName, getNameBank, getRandomFullName } from '../../characters/nameHelper.js';

const FACTION_RACE_KEYS = Object.freeze({
  0: 'Nord', 1: 'Khajiit', 2: 'Redguard', 3: 'Breton',
  4: 'Argonian', 5: 'WoodElf', 6: 'HighElf', 7: 'DarkElf',
});
import { dateFromSeconds, dateString, dayName, monthName, birthSignName, seasonName, CLASSIC_EPOCH_IN_SECONDS } from '../../world/gameDate.js';
import { skySecondsOfEvent } from '../../weather/skyCalendar.js';
import { REGION_TEMPLES, LOCATION_TYPES } from '../../formats/mapsFile.js';
import { factionRaceFromRace } from '../../characters/staticNpc.js';
import { rulerTitle } from '../../world/buildingNames.js';
import { localizedStrings, localizedTable, localizedText, getLocalizedLocationName, getLocalizedRegionName } from '../../ui/textManager.js';
import { getLocalizedFactionName, processGrammar } from '../../ui/textManager.js';
import { legalStandingWord } from '../../justice/legalBands.js';

export const MACRO_TYPES = Object.freeze({
  None: 0, NameMacro1: 1, NameMacro2: 2, NameMacro3: 3, NameMacro4: 4,
  DetailsMacro: 5, FactionMacro: 6, ContextMacro: 7, BindingMacro: 8,
});

const EN = localizedStrings({
  pronounHe: 'he', pronounShe: 'she',
  pronounHim: 'him', pronounHer: 'her',
  pronounHimself: 'himself', pronounHerself: 'herself',
  pronounHis: 'his', pronounHer2: 'her',
  pronounHis2: 'his', pronounHers: 'hers',
  comma: ',  ',
  resolvingError: '...never mind...',
  letterPrefix: 'Letter: ',
});

const DIVINES = Object.freeze([
  'Arkay', 'Zen', 'Mara', 'Ebonarm', 'Akatosh', 'Julianos', 'Dibella',
  'Stendarr', 'Kynareth',
]);

// This table says "Zenithar" where the random arm says "Zen", matching the two enums the C# source stringifies.
const DIVINE_BY_FACTION = localizedTable({
  21: ['Arkay', 'Arkay'], 22: ['Zenithar', 'Zenithar'], 24: ['Mara', 'Mara'], 26: ['Akatosh', 'Akatosh'],
  27: ['Julianos', 'Julianos'], 29: ['Dibella', 'Dibella'], 33: ['Stendarr', 'Stendarr'], 35: ['Kynareth', 'Kynareth'],
});
const THE_FIGHTERS_GUILD = 41;

function templeDivine(w, factionId) {
  if (DIVINE_BY_FACTION[factionId]) return DIVINE_BY_FACTION[factionId];
  const rec = w?.getFactionData?.(factionId);
  if (rec && DIVINE_BY_FACTION[rec.parent]) return DIVINE_BY_FACTION[rec.parent];
  throw new Error(`There is no Divine that matches the factionId: ${factionId}`);
}

// Ordered alternation: longest name prefix first, then ==, =#, =, and %; the token is the exact matched substring.
const MACRO_PATTERN = new RegExp(
  '(?<nm4>____[a-zA-Z0-9.]+_)'
  + '|(?<nm3>___[a-zA-Z0-9.]+_)'
  + '|(?<nm2>__[a-zA-Z0-9.]+_)'
  + '|(?<nm1>_[a-zA-Z0-9.]+_)'
  + '|(?<fac>==[a-zA-Z0-9.]+_)'
  + '|(?<bind>=#[a-zA-Z0-9.]+_)'
  + '|(?<det>=[a-zA-Z0-9.]+_)'
  + '|(?<ctx>%\\w+)');

const GROUP_TYPES = [
  ['nm4', MACRO_TYPES.NameMacro4, 4], ['nm3', MACRO_TYPES.NameMacro3, 3],
  ['nm2', MACRO_TYPES.NameMacro2, 2], ['nm1', MACRO_TYPES.NameMacro1, 1],
  ['fac', MACRO_TYPES.FactionMacro, 2], ['bind', MACRO_TYPES.BindingMacro, 2],
  ['det', MACRO_TYPES.DetailsMacro, 1], ['ctx', MACRO_TYPES.ContextMacro, 1],
];

export function getMacro(word) {
  const match = MACRO_PATTERN.exec(word);
  if (!match) return { token: '', type: MACRO_TYPES.None, symbol: '' };
  for (const [group, type, prefixLen] of GROUP_TYPES) {
    const token = match.groups[group];
    if (token == null) continue;
    const symbol = type === MACRO_TYPES.ContextMacro
      ? token.slice(prefixLen)
      : token.slice(prefixLen, -1);
    return { token, type, symbol };
  }
  return { token: '', type: MACRO_TYPES.None, symbol: '' };
}

// Lookup is maximal munch with an exact match, so %a never fires inside %adj.
export function expandMacroValues(text, values = {}, questLike = null) {
  // Without a caller context, the world's registered context answers the global rows.
  const ctx = questLike ?? macroWorld();
  const vals = values ?? {};
  return String(text ?? '').replace(/%\w+/g, (token) => {
    const sym = token.slice(1);
    if (sym in vals) {
      const v = typeof vals[sym] === 'function' ? vals[sym]() : vals[sym];
      // A null value means the caller does not know: it falls through to the context.
      if (v != null) return String(v);
    }
    const declared = sym in vals;
    if (ctx && HANDLERS[token]) {
      // A caller's context keeps the C# throws; the world context costs only the token and skips subject macros.
      let v;
      if (questLike) v = getContextValue(token, ctx, ctx.hooks);
      else { try { v = getMacroValue(token, null, ctx.hooks, null); } catch { return token; } }
      if ((!questLike || declared) && isErrorShape(v, token)) return token;
      return v;
    }
    return token;
  });
}

let _macroWorld = null;
export function setMacroWorld(fn) { _macroWorld = typeof fn === 'function' ? fn : null; }
export function macroWorld() {
  try { return _macroWorld?.() ?? null; } catch { return null; }
}
const isErrorShape = (v, token) => typeof v !== 'string' || v.startsWith(token + '[');

export function expandRowValues(rows, values = null, questLike = null) {
  // Either values or a context is enough to walk; the value map wins a symbol it carries.
  if (!Array.isArray(rows)) return rows;
  const hasValues = !!values && !!Object.keys(values).length;
  if (!hasValues && !questLike && !macroWorld()) return rows;
  const one = (t) => expandMacroValues(t ?? '', values ?? {}, questLike);
  return rows.map((row) => (typeof row === 'string' ? one(row)
    : row && typeof row === 'object' ? { ...row, text: one(row.text ?? '') } : row));
}

export const NOT_IMPLEMENTED = Symbol('NotImplementedException');

const pronounOf = (quest, male, female) => {
  const last = quest.lastResourceReferenced;
  return (last?.gender === GENDERS.Female) ? female : male;
};

// Stateful: AttributeRating reads the last stat macro this expansion read, so never share one source between boxes.
// The rating words are the reference's own list, not TEXT.RSC.
export const STAT_RATINGS = Object.freeze({
  strength: ['pathetic', 'frail', 'weak', 'below average', 'about average', 'fairly strong', 'athletic', 'very strong', 'powerful', 'superhuman'],
  intelligence: ['vegetable-like', 'idiotic', 'half-witted', 'dim', 'about average', 'cunning', 'fairly clever', 'very intelligent', 'brilliant', 'genius'],
  willpower: ['inane', 'submissive', 'passive', 'distracted', 'unassertive', 'stable', 'confident', 'strong-willed', 'very focused', 'enlightened'],
  agility: ['oafish', 'bumbling', 'clumsy', 'awkward', 'about average', 'spry', 'nimble', 'dexterous', 'very agile', 'acrobatic'],
  endurance: ['sickly', 'pitiable', 'unsteady', 'erratic', 'about average', 'above average', 'very healthy', 'hardy', 'titanic', 'immortal'],
  personality: ['abhorrent', 'unpopular', 'anonymous', 'unassuming', 'unremarkable', 'interesting', 'charming', 'arresting', 'authoritative', 'charismatic'],
  speed: ['inactive', 'sluggish', 'very slow', 'slow', 'about average', 'above average', 'fast', 'fleet-footed', 'lightning-fast', 'meteoric'],
  luck: ['cursed', 'hopeless', 'ill-favored', 'unfortunate', 'about average', 'fairly lucky', 'lucky', 'fortunate', 'very auspicious', 'divinely favored'],
});
const STAT_RATING_THRESHOLDS = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 1000]);

export function statsMacroSource(entity) {
  let lastStat = 'strength', lastStatValue = 0;
  const read = (key) => { lastStat = key; lastStatValue = liveStat(entity, key); return String(lastStatValue); };
  return {
    str: () => read('strength'), int: () => read('intelligence'),
    wil: () => read('willpower'), agi: () => read('agility'),
    end: () => read('endurance'), per: () => read('personality'),
    spd: () => read('speed'), luck: () => read('luck'),
    attributeRating() {
      let i = 0;
      while (i < STAT_RATING_THRESHOLDS.length && lastStatValue >= STAT_RATING_THRESHOLDS[i]) i++;
      return STAT_RATINGS[lastStat][i];
    },
  };
}

export function questMacroSource(quest) {
  const world = () => quest.hooks?.world ?? null;
  return {
    name() {
      srand(quest.uid);
      const w = world();
      const bank = getNameBankOfRegion(w?.currentRegionIndex?.() ?? -1);
      const gender = randomRangeInclusive(0, 1) === 1 ? GENDERS.Female : GENDERS.Male;
      return fullName(bank, gender);
    },
    femaleName() {
      srand(quest.uid);
      return fullName(getNameBankOfRegion(world()?.currentRegionIndex?.() ?? -1), GENDERS.Female);
    },
    maleName() {
      srand(quest.uid + 3457);
      return fullName(getNameBankOfRegion(world()?.currentRegionIndex?.() ?? -1), GENDERS.Male);
    },
    factionOrderName() {
      const record = world()?.getFactionData?.(quest.factionId);
      if (!record) return null;
      const name = getLocalizedFactionName(quest.factionId, record.name);
      return name.startsWith('The ') ? name.slice(4) : name;
    },
    pronoun() { return pronounOf(quest, EN.pronounHe, EN.pronounShe); },
    pronoun2() { return pronounOf(quest, EN.pronounHim, EN.pronounHer); },
    pronoun2self() { return pronounOf(quest, EN.pronounHimself, EN.pronounHerself); },
    pronoun3() { return pronounOf(quest, EN.pronounHis, EN.pronounHer2); },
    pronoun4() { return pronounOf(quest, EN.pronounHis2, EN.pronounHers); },
    vampireNpcClan() {
      const person = quest.lastResourceReferenced;
      if (!person?.isPerson) return null;
      if (person.factionData?.type !== 6) return null;
      let regionIndex = person.homeRegionIndex ?? -1;
      if (regionIndex === -1) regionIndex = world()?.currentRegionIndex?.() ?? -1;
      return world()?.regionVampireClanName?.(regionIndex) ?? getLocalizedFactionName(person.factionData.id, person.factionData.name);
    },
    // %qdt reads the current log step, which the journal sets while rendering; -1 falls back to the quest start.
    questDate() {
      return dateString(dateFromSeconds(skySecondsOfEvent(quest.getCurrentLogMessageTime())));
    },
    // %oth uses the questor's race; every branch yields a Races value, and one GetFactionRaceFromRace runs last.
    oath() {
      let race = -1;
      const questors = [...(quest.questors?.keys() ?? [])];
      if (questors.length > 0) race = quest.getPerson({ name: questors[0] })?.race ?? -1;
      else {
        // Some main quests use %oth before the questor is set, so the last clicked NPC is used instead.
        const clicked = quest.hooks?.lastNPCClicked?.();
        if (clicked) race = clicked.race ?? -1;
      }
      if (race === -1) race = world()?.currentRegionRace?.() ?? -1;
      return world()?.getRandomText?.(201 + factionRaceFromRace(race)) ?? null;
    },
    homeRegion() {
      const last = quest.lastResourceReferenced;
      return last?.isPerson ? (last.homeRegionName ?? '') : '';
    },
    god() {
      // %god falls back to the region's main temple and rolls only when that is 0 or the Fighters Guild, as in C#.
      const w = world();
      const inside = w?.playerInside?.();
      let factionId = 0;
      if (inside?.building?.buildingType === 14) {
        factionId = inside.building.factionId ?? 0;
      } else {
        // C# indexes the table directly and would throw; with no region this falls to the random arm.
        factionId = REGION_TEMPLES[w?.currentRegionIndex?.()] ?? 0;
      }
      if (factionId === 0 || factionId === THE_FIGHTERS_GUILD) {
        return DIVINES[Math.floor((quest.rolls ?? Math.random)() * 9)];
      }
      return templeDivine(w, factionId);
    },
    // With nothing referenced yet, %di reads the last quest Person's dialog place, else "...never mind...".
    direction() {
      let place = quest.lastPlaceReferenced;
      if (!place) {
        for (const r of quest.resources?.values?.() ?? []) {
          const at = r?.isPerson && !r.isQuestor ? r.getDialogPlace?.() : null;
          if (at?.siteDetails) place = at;
        }
      }
      const w = world();
      if (!place) return EN.resolvingError;
      if (place.scope === 'remote') {
        return w?.locationCompassDirection?.(place) ?? EN.resolvingError;
      } else if (place.scope === 'local') {
        if (place.siteDetails?.locationName === w?.currentLocation?.()?.name) {
          return w?.buildingCompassDirection?.(place.siteDetails.buildingKey) ?? EN.resolvingError;
        }
        return place.siteDetails?.locationName + EN.comma
          + (w?.locationCompassDirection?.(place) ?? EN.resolvingError);
      }
      return EN.resolvingError;
    },
  };
}

const source = (mcp) => mcp?.source ?? null;
const call = (mcp, method) => {
  const src = source(mcp);
  if (!src) return null;
  if (typeof src[method] !== 'function') return NOT_IMPLEMENTED;
  return src[method]();
};
const capFirst = (s) => s.substring(0, 1).toUpperCase() + s.substring(1);

let idRegion = -1;
export const setIdRegion = (v) => { idRegion = v; };
let idFaction1 = -1, idFaction2 = -1;
export const setIdFactions = (f1, f2) => { idFaction1 = f1; idFaction2 = f2; };

const cap = (p) => (typeof p === 'string' ? capFirst(p) : p);

const shownRegionName = (w, i) => {
  const canonical = (r) => w?.maps?.getRegion?.(r)?.name ?? null;
  return Number.isInteger(i) ? getLocalizedRegionName(i, canonical) : canonical(i);
};

const shownFactionName = (w, id) => {
  const fd = w?.getFactionData?.(id);
  return fd?.name != null ? getLocalizedFactionName(id, fd.name) : null;
};

const HANDLERS = {
  '%pcn': (mcp, hooks) => hooks?.playerName?.() ?? null,
  '%pcf': (mcp, hooks) => {
    const name = hooks?.playerName?.();
    if (name == null) return null;
    const parts = name.split(' ');
    return parts.length > 0 ? parts[0] : name;
  },
  // %pct has no quest source override, so it falls to externalMCP and, with none, to the player's name, as in C#.
  '%pct': (mcp, hooks) => {
    if (!source(mcp)) return hooks?.playerName?.() ?? null;
    return call(mcp, 'guildTitle');
  },
  '%ra': (mcp, hooks) => hooks?.playerRaceName?.() ?? null,
  '%reg': (mcp, hooks) => {
    if (idRegion !== -1) return shownRegionName(hooks?.world, idRegion);
    const w = hooks?.world;
    return w ? shownRegionName(w, w.currentRegionIndex?.()) : null;
  },
  '%crn': (mcp, hooks) => {
    const w = hooks?.world;
    return w ? shownRegionName(w, w.currentRegionIndex?.()) : null;
  },
  '%rn': (mcp, hooks) => {
    const w = hooks?.world;
    const region = w?.findFactionByTypeAndRegion?.(7, w.currentRegionIndex?.());
    if (region?.children) {
      for (const childID of region.children) {
        const child = w.getFactionData?.(childID);
        if (child?.type === 4) return getLocalizedFactionName(childID, child.name);
      }
    }
    if (!w) return null;
    return getRandomFullName(w.currentRegionIndex?.() ?? -1);
  },
  // C# reads a zeroed struct on a miss, so a miss answers "Lord"; return null only when there is no world.
  '%rt': (mcp, hooks) => {
    const w = hooks?.world;
    if (!w) return null;
    const region = w.findFactionByTypeAndRegion?.(7, w.currentRegionIndex?.());
    return rulerTitle(region?.ruler ?? 0);
  },
  '%t': (mcp, hooks) => HANDLERS['%rt'](mcp, hooks),
  // %nrn has no null path in C#: a miss reads ruler 0, which gives a female Nord and seed 0.
  '%nrn': (mcp, hooks) => {
    const w = hooks?.world;
    if (!w) return null;
    const fd = w.getFactionData?.(w.currentRegionFaction?.());
    if (fd?.children?.length > 0) {
      const firstChild = w.getFactionData?.(fd.children[0]);
      if (firstChild?.type === 4) return getLocalizedFactionName(fd.children[0], firstChild.name);
    }
    const gender = ((fd?.ruler ?? 0) + 1) % 2;
    srand((fd?.rulerNameSeed ?? 0) & 0xffff);
    return fullName(getNameBank(FACTION_RACE_KEYS[fd?.race ?? 0]), gender);
  },
  '%vam': (mcp, hooks) => hooks?.world?.playerVampireClanName?.() ?? '%vam[ERROR: PC not a vampire]',
  // Joke text carries its own macros, and expansion never walks inserted text, so each one goes through this table.
  '%jok': (mcp, hooks) => {
    const joke = hooks?.world?.getRandomText?.(200) ?? null;
    if (typeof joke !== 'string') return null;
    return joke.replace(/%[a-zA-Z][a-zA-Z0-9]*/g, (tok, at) => {
      if (tok === '%jok' || !HANDLERS[tok]) return tok;
      const v = getMacroValue(tok, mcp, hooks);
      if (typeof v !== 'string' || v.startsWith(`${tok}[`)) return tok;
      return /(^|[^a-z])the $/i.test(joke.slice(0, at)) ? v.replace(/^the /i, '') : v;
    });
  },
  '%cn': (mcp, hooks) => {
    const w = hooks?.world;
    if (!w) return null;
    const loc = w.currentLocation?.();
    if (loc?.loaded) return getLocalizedLocationName(loc.mapTableData?.mapId, loc.name);
    return shownRegionName(w, w.currentRegionIndex?.());
  },
  // %dat is global in C#, so it reads the same clock as the rest of the date block, not the quest's.
  '%dat': (mcp, hooks) => { const d = nowDate(hooks); return d ? dateString(d) : null; },
  '%pg3': (mcp, hooks) =>
    (hooks?.playerGender?.() === 'female') ? EN.pronounHer2 : EN.pronounHis,
  '%G': (mcp) => cap(call(mcp, 'pronoun')),
  '%G1': (mcp) => cap(call(mcp, 'pronoun')),
  '%G2': (mcp) => cap(call(mcp, 'pronoun2')),
  '%G2self': (mcp) => cap(call(mcp, 'pronoun2self')),
  '%G3': (mcp) => cap(call(mcp, 'pronoun3')),
  '%G4': (mcp) => cap(call(mcp, 'pronoun4')),
  '%g': (mcp) => call(mcp, 'pronoun'),
  '%g1': (mcp) => call(mcp, 'pronoun'),
  '%g2': (mcp) => call(mcp, 'pronoun2'),
  '%g2self': (mcp) => call(mcp, 'pronoun2self'),
  '%g3': (mcp) => call(mcp, 'pronoun3'),
  '%g4': (mcp) => call(mcp, 'pronoun4'),
  '%n': (mcp) => call(mcp, 'name'),
  '%nam': (mcp) => call(mcp, 'name'),
  '%fn': (mcp) => call(mcp, 'femaleName'),
  '%mn': (mcp) => call(mcp, 'maleName'),
  '%kno': (mcp) => call(mcp, 'factionOrderName'),
  '%oth': (mcp) => call(mcp, 'oath'),
  '%god': (mcp) => call(mcp, 'god'),
  '%di': (mcp) => call(mcp, 'direction'),
  '%qdt': (mcp) => call(mcp, 'questDate'),
  '%qdat': (mcp) => call(mcp, 'questDate'),
  '%vcn': (mcp) => call(mcp, 'vampireNpcClan'),
  '%hrn': (mcp) => call(mcp, 'homeRegion'),

  '%str': (mcp) => call(mcp, 'str'),
  '%int': (mcp) => call(mcp, 'int'),
  '%wil': (mcp) => call(mcp, 'wil'),
  '%agi': (mcp) => call(mcp, 'agi'),
  '%end': (mcp) => call(mcp, 'end'),
  '%per': (mcp) => call(mcp, 'per'),
  '%spd': (mcp) => call(mcp, 'spd'),
  '%luc': (mcp) => call(mcp, 'luck'),
  '%ark': (mcp) => call(mcp, 'attributeRating'),

  '%spc': (mcp, hooks) => str(hooks?.playerEntity?.()?.magicka),
  '%spt': (mcp, hooks) => str(hooks?.playerEntity?.()?.maxMagicka),
  '%enc': (mcp, hooks) => {
    const e = hooks?.playerEntity?.();
    return e ? String(entityMaxEncumbrance(e)) : null;
  },
  '%mad': (mcp, hooks) => {
    const e = hooks?.playerEntity?.();
    return e ? String(Math.floor(liveStat(e, 'willpower') / 10)) : null;
  },
  '%thd': (mcp, hooks) => signedOff(hooks, 'toHitModifier'),
  '%dam': (mcp, hooks) => signedOff(hooks, 'damageModifier'),
  '%hea': (mcp, hooks) => signedOff(hooks, 'hitPointsModifier'),
  '%hmd': (mcp, hooks) => signedOff(hooks, 'healingRateModifier'),
  '%ski': (mcp, hooks) => {
    const e = hooks?.playerEntity?.();
    if (!e?.career?.primarySkills) return null;
    for (const id of e.career.primarySkills) {
      if (permanentSkillValue(e, id) === 100) return SKILL_NAMES[id] ?? String(id);
    }
    return 'BLANK';
  },

  '%hour': (mcp, hooks) => str(nowDate(hooks)?.hour),
  '%min': (mcp, hooks) => str(nowDate(hooks)?.minute),
  '%tim': (mcp, hooks) => {
    const d = nowDate(hooks);
    return d ? `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}` : null;
  },
  '%day': (mcp, hooks) => str(nowDate(hooks) && nowDate(hooks).day + 1),
  '%dayn': (mcp, hooks) => { const d = nowDate(hooks); return d ? dayName(d) : null; },
  '%days': (mcp, hooks) => {
    const d = nowDate(hooks);
    return d ? `${d.day + 1}${daySuffix(d.day + 1)}` : null;
  },
  '%mon': (mcp, hooks) => str(nowDate(hooks) && nowDate(hooks).month + 1),
  '%monn': (mcp, hooks) => { const d = nowDate(hooks); return d ? monthName(d) : null; },
  '%year': (mcp, hooks) => str(nowDate(hooks)?.year),
  '%sea': (mcp, hooks) => { const d = nowDate(hooks); return d ? seasonName(d) : null; },
  '%sign': (mcp, hooks) => { const d = nowDate(hooks); return d ? birthSignName(d) : null; },

  '%pcl': (mcp, hooks) => {
    const name = hooks?.playerName?.();
    if (name == null) return null;
    const parts = name.split(' ');
    return parts.length > 1 ? parts[1] : name;
  },
  '%pg': (mcp, hooks) => pgender(hooks) ? EN.pronounShe : EN.pronounHe,
  '%pg1': (mcp, hooks) => pgender(hooks) ? EN.pronounShe : EN.pronounHe,
  '%pg2': (mcp, hooks) => pgender(hooks) ? EN.pronounHer : EN.pronounHim,
  '%pg2self': (mcp, hooks) => pgender(hooks) ? EN.pronounHerself : EN.pronounHimself,
  '%pg4': (mcp, hooks) => pgender(hooks) ? EN.pronounHers : EN.pronounHis2,

  // LastName rolls a random race's bank and reads no world state, so it never answers [nullMCP].
  '%ln': () => surname(getRandomNameBank()),
  '%bn': (mcp) => call(mcp, 'name'),
  '%fn2': (mcp) => call(mcp, 'femaleName'),
  '%mn2': (mcp) => call(mcp, 'maleName'),
  '%imp': (mcp) => call(mcp, 'imperialName'),

  '%ml': (mcp) => call(mcp, 'maxLoan'),
  '%r2': (mcp) => call(mcp, 'merchantsRep'),
  '%r3': (mcp) => call(mcp, 'scholarsRep'),
  '%r1': (mcp) => call(mcp, 'commonersRep'),
  '%r4': (mcp) => call(mcp, 'nobilityRep'),
  '%r5': (mcp) => call(mcp, 'underworldRep'),
  '%ltn': (mcp, hooks) => {
    const rep = hooks?.world?.legalRepNow?.();
    if (rep == null) return null;
    return legalStandingWord(rep);
  },

  '%lp': (mcp, hooks) => {
    const race = hooks?.world?.currentRegionRace?.();
    if (race == null) return null;
    return race === LOCAL_PROVINCE_BRETON ? localizedText('highRock', 'High Rock') : localizedText('hammerfell', 'Hammerfell');
  },
  '%ct': (mcp, hooks) => {
    const t = hooks?.world?.currentLocationType?.();
    if (t == null) return null;
    return CITY_TYPES[t] ?? LOCATION_TYPE_NAMES[t] ?? String(t);
  },
  '%cn2': (mcp, hooks) => {
    const w = hooks?.world;
    const region = w?.maps?.getRegion?.(w.currentRegionIndex?.());
    if (!region?.mapTable) return null;
    const here = w.currentLocationIndex?.() ?? -1;
    for (let i = 0; i < region.mapTable.length; i++) {
      if (i !== here && !cromwarkQuestSiteBlocked(region.mapTable[i].mapId) && region.mapTable[i].locationType === TOWN_CITY_TYPE) {
        return getLocalizedLocationName(region.mapTable[i].mapId, region.mapNames?.[i] ?? localizedText('daggerfall', CITY_NAME2_FALLBACK));
      }
    }
    // C#'s error fallback is "Daggerfall"; a region whose only TownCity is the current one takes it.
    return localizedText('daggerfall', CITY_NAME2_FALLBACK);
  },
  '%cbd': (mcp, hooks) => {
    const w = hooks?.world;
    if (!w) return null;
    return w.currentBuildingName?.() ?? '[invalid]';
  },
  '%nt': (mcp, hooks) => hooks?.world?.randomTavernName?.() ?? null,

  // Kept C# asymmetries: %fae reads the same getter as %fe, and %fea the same as %fa.
  '%fa': (mcp, hooks) => hooks?.world?.factionNPCAlly?.() ?? null,
  '%fae': (mcp, hooks) => hooks?.world?.factionNPCEnemy?.() ?? null,
  '%fe': (mcp, hooks) => hooks?.world?.factionNPCEnemy?.() ?? null,
  '%fea': (mcp, hooks) => hooks?.world?.factionNPCAlly?.() ?? null,
  '%fnpc': (mcp, hooks) => hooks?.world?.factionNPC?.() ?? null,
  '%fpa': (mcp, hooks) => hooks?.world?.factionName?.() ?? null,
  '%fpc': (mcp, hooks) => hooks?.world?.factionPC?.() ?? null,
  '%fon': (mcp) => call(mcp, 'factionOrderName'),
  '%fx1': (mcp, hooks) => (idFaction1 !== -1 ? shownFactionName(hooks?.world, idFaction1) : null),
  '%fx2': (mcp, hooks) => (idFaction2 !== -1 ? shownFactionName(hooks?.world, idFaction2) : null),
  '%fl1': (mcp, hooks) => hooks?.world?.lordNameForFaction?.(idFaction1) ?? null,
  '%fl2': (mcp, hooks) => hooks?.world?.lordNameForFaction?.(idFaction2) ?? null,
  // Same zeroed-struct rule as %rt: gate on the world, never on the lookup.
  '%lt1': (mcp, hooks) => {
    const w = hooks?.world;
    if (!w) return null;
    return rulerTitle(w.getFactionData?.(idFaction1)?.ruler ?? 0);
  },
  '%ol1': (mcp, hooks) => hooks?.world?.lordNameForFaction?.(idFaction1, true) ?? null,
  // OldLeaderFate uses the engine PRNG, not the DFRandom stream %ol1 has just seeded.
  '%olf': (mcp, hooks) => hooks?.world?.oldLeaderFate?.(Math.floor((mcp?.quest?.rolls ?? Math.random)() * 5)) ?? null,

  '%gdd': (mcp) => call(mcp, 'godDesc'),
  '%dae': (mcp) => call(mcp, 'daedra'),
  '%dng': (mcp) => call(mcp, 'dungeon'),
  '%hpn': (mcp) => call(mcp, 'homeProvinceName'),
  '%hpw': (mcp) => call(mcp, 'geographicalFeature'),
  // %lev and %pct are the same C# row, so %lev also falls back to the player's name.
  '%lev': (mcp, hooks) => HANDLERS['%pct'](mcp, hooks),

  '%1am': (mcp) => call(mcp, 'magnitudePlusMin'),
  '%1bm': (mcp) => call(mcp, 'magnitudeBaseMin'),
  '%2am': (mcp) => call(mcp, 'magnitudePlusMax'),
  '%2bm': (mcp) => call(mcp, 'magnitudeBaseMax'),
  '%ach': (mcp) => call(mcp, 'chancePlus'),
  '%adr': (mcp) => call(mcp, 'durationPlus'),
  '%bch': (mcp) => call(mcp, 'chanceBase'),
  '%bdr': (mcp) => call(mcp, 'durationBase'),
  '%clc': (mcp) => call(mcp, 'chancePerLevel'),
  '%cld': (mcp) => call(mcp, 'durationPerLevel'),
  '%clm': (mcp) => call(mcp, 'magnitudePerLevel'),
  '%mpw': (mcp) => call(mcp, 'magicPowers'),

  // '%' is itself a terminator, so `%%` and `%.` name the one-character symbol and the second character survives.
  '%': () => '%',

  '%it': (mcp) => call(mcp, 'itemName'),
  '%wep': (mcp) => call(mcp, 'itemName'),
  '%arm': (mcp) => call(mcp, 'itemName'),
  '%bt': (mcp) => call(mcp, 'itemName'),
  '%ba': (mcp) => call(mcp, 'bookAuthor'),
  '%mat': (mcp) => call(mcp, 'material'),
  '%qua': (mcp) => call(mcp, 'condition'),
  '%kg': (mcp) => call(mcp, 'weight'),
  '%wdm': (mcp) => call(mcp, 'weaponDamage'),
  '%mod': (mcp) => call(mcp, 'armourMod'),
  '%wth': (mcp) => call(mcp, 'worth'),
  '%hs': (mcp) => call(mcp, 'heldSoul'),
  '%po': (mcp) => call(mcp, 'potion'),

  '%adj': (mcp) => call(mcp, 'paintingAdjective'),
  '%an': (mcp) => call(mcp, 'artistName'),
  '%pp1': (mcp) => call(mcp, 'paintingPrefix1'),
  '%pp2': (mcp) => call(mcp, 'paintingPrefix2'),
  '%sub': (mcp) => call(mcp, 'paintingSubject'),

  '%a': (mcp) => call(mcp, 'amount'),
  '%cpn': (mcp) => call(mcp, 'shopName'),
  '%dwr': (mcp) => call(mcp, 'roomHoursLeft'),

  '%hnt': (mcp) => call(mcp, 'dialogHint'),
  '%hnt2': (mcp) => call(mcp, 'dialogHint2'),
  '%pqn': (mcp) => call(mcp, 'potentialQuestorName'),
  '%pqp': (mcp) => call(mcp, 'potentialQuestorLocation'),

  '%gii': (mcp, hooks) => str(hooks?.getGoldPieces?.()),

  '%map': (mcp, hooks) => hooks?.world?.locationRevealedByMapItem?.() ?? null,

  '%1com': (mcp, hooks) => hooks?.world?.talkPCGreetingOrFollowUpText?.() ?? null,
  '%hnr': (mcp, hooks) => hooks?.world?.talkHonoric?.() ?? null,
  '%fcn': (mcp, hooks) => hooks?.world?.talkLocationOfRegionalBuilding?.() ?? null,
  '%key': (mcp, hooks) => {
    const w = hooks?.world;
    if (!w?.talkKeySubjectType) return null;
    switch (w.talkKeySubjectType()) {
      case 'Building':
      case 'Person':
      case 'Thing':
      case 'Organization':
        return w.talkKeySubject?.() ?? null;
      case 'Work':
        return w.talkWorkString?.() ?? null;
      case 'QuestTopic': {
        const item = w.talkCurrentQuestionListItem?.() ?? null;
        return item != null ? item.caption : (w.talkKeySubject?.() ?? null);
      }
      default:
        return '';
    }
  },
  // %loc reveals the map only when the answer being expanded is the map-reveal record.
  '%loc': (mcp, hooks) => {
    const w = hooks?.world;
    if (!w?.talkKeySubject) return null;
    if (w.talkMarkLocationOnMap?.()) w.markKeySubjectLocationOnMap?.();
    return w.talkKeySubject();
  },

  '%cri': (mcp, hooks) => hooks?.world?.courtCrimeName?.() ?? null,
  '%pen': (mcp, hooks) => hooks?.world?.courtPenaltyText?.() ?? null,
  '%gtp': (mcp, hooks) => str(hooks?.world?.courtFine?.()),
  '%dip': (mcp, hooks) => str(hooks?.world?.courtDaysInPrison?.()),
};

for (let n = 1; n <= 12; n++) {
  for (const suffix of ['', 'a', 'b']) HANDLERS[`%q${n}${suffix}`] = (mcp) => call(mcp, `q${n}${suffix}`);
}

const str = (v) => (v == null ? null : String(v));
const signedFmt = (n) => (n > 0 ? `+${n}` : String(n));
// Computed from live stats, not stored: nothing assigns these entity fields.
const DERIVED_MODIFIER = {
  damageModifier: (e) => damageModifier(liveStat(e, 'strength')),
  toHitModifier: (e) => toHitModifier(liveStat(e, 'agility')),
  hitPointsModifier: (e) => hitPointsModifier(liveStat(e, 'endurance')),
  healingRateModifier: (e) => healingRateModifier(liveStat(e, 'endurance')),
};
const signedOff = (hooks, field) => {
  const e = hooks?.playerEntity?.();
  return e ? signedFmt(DERIVED_MODIFIER[field](e)) : null;
};
const pgender = (hooks) => hooks?.playerGender?.() === 'female';
// hooks.nowSeconds is epoch-relative, so the epoch (exactly 404 360-day years) is added back before the date.
const nowDate = (hooks) => {
  const sec = (hooks?.skySeconds ?? hooks?.nowSeconds)?.();
  return sec == null ? null : dateFromSeconds(CLASSIC_EPOCH_IN_SECONDS + sec);
};
const daySuffix = (day) => (day === 1 || day === 21 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th');
const LOCAL_PROVINCE_BRETON = 1;
const TOWN_CITY_TYPE = 0;
const CITY_NAME2_FALLBACK = 'Daggerfall';
const CITY_TYPES = localizedTable({
  0: ['city', 'city'], 1: ['hamlet', 'hamlet'], 2: ['village', 'village'], 3: ['farm', 'farm'],
  11: ['shack', 'shack'], 8: ['manor', 'manor'], 6: ['community', 'community'], 5: ['temple', 'temple'], 9: ['shrine', 'shrine'],
});
const LOCATION_TYPE_NAMES = Object.freeze(Object.fromEntries(
  Object.entries(LOCATION_TYPES).map(([name, id]) => [id, name])));

const NULL_HANDLERS = new Set(['%1hn', '%2hn', '%3hn', '%cbl', '%dts', '%ef',
  '%hol', '%hrg', '%htwn', '%key2', '%mit', '%on', '%pdg', '%plq', '%pnq',
  '%ptm', '%qot', '%vn', '%wpn',
  '%tcn']);

export const macroTableCoverage = () => ({ handled: Object.keys(HANDLERS), nulls: [...NULL_HANDLERS] });

// The second try calls the same handler with the second provider, as C#'s `svp.Invoke(mcp2)` does.
export function getMacroValue(symbolStr, mcp, hooks, mcp2 = null) {
  if (NULL_HANDLERS.has(symbolStr)) return symbolStr + '[unhandled]';
  const handler = HANDLERS[symbolStr];
  if (!handler) return symbolStr + '[undefined]';
  const try1 = handler(mcp, hooks);
  if (try1 !== NOT_IMPLEMENTED) {
    return try1 != null ? try1 : symbolStr + '[nullMCP]';
  }
  const try2 = handler(mcp2, hooks);
  if (try2 !== NOT_IMPLEMENTED && try2 != null) return try2;
  return symbolStr + '[srcDataUnknown]';
}

export function getContextValue(symbolStr, quest, hooks) {
  const mcp = quest ? { quest, source: questMacroSource(quest) } : null;
  return getMacroValue(symbolStr, mcp, hooks, quest?.externalMCP ?? null);
}

export function sourceValues(source) {
  const mcp = { source };
  const out = {};
  for (const token of Object.keys(HANDLERS)) {
    out[token.slice(1)] = () => {
      let v;
      try { v = getMacroValue(token, mcp, null, null); } catch { return null; }
      return isErrorShape(v, token) ? null : v;
    };
  }
  return out;
}

// JS replace(string, string) reads `$&` patterns and stops at the first match, so this splits and joins instead.
const csReplace = (text, oldValue, newValue) => text.split(oldValue).join(newValue ?? '');

export function expandQuestMessage(parentQuest, tokens, revealDialogLinks = false) {
  for (const token of tokens) {
    if (!token.text) continue;
    const words = token.text.split(' ');
    for (let w = 0; w < words.length; w++) {
      const macro = getMacro(words[w]);
      if (macro.type === MACRO_TYPES.None) continue;
      if (macro.type === MACRO_TYPES.ContextMacro) {
        words[w] = csReplace(words[w], macro.token, getContextValue(macro.token, parentQuest, parentQuest?.hooks));
        continue;
      }
      if (!parentQuest) return;
      const resource = parentQuest.getResource({ name: macro.symbol });
      if (!resource) continue;
      const result = resource.expandMacro?.(macro.type);
      // A resource may answer true with a null text; C# Replace treats null as empty, so the token is removed.
      if (typeof result === 'string' || result === null) words[w] = csReplace(words[w], macro.token, result);
      if (revealDialogLinks && macro.type === MACRO_TYPES.NameMacro1) {
        const hooks = parentQuest.hooks;
        // The reveal calls use the three-argument overload, whose rebuild flag defaults to true, as in C#.
        if (resource.isPlace) hooks?.addDialog?.(parentQuest.uid, macro.symbol, 'Location');
        else if (resource.isPerson) hooks?.addDialog?.(parentQuest.uid, macro.symbol, 'Person');
        else if (resource.isItem) hooks?.addDialog?.(parentQuest.uid, macro.symbol, 'Thing');
      }
    }
    token.text = processGrammar(words.join(' '));
  }
}

// Keeps exactly one non-empty line, as the C# code does; a location macro replaces its whole word with "...".
export function expandLetterSignoff(parentQuest, tokens) {
  let signoff = '';
  let lines = 0;
  for (let t = tokens.length - 1; t >= 0; t--) {
    const words = (tokens[t].text ?? '').split(' ');
    for (let w = 0; w < words.length; w++) {
      const macro = getMacro(words[w]);
      switch (macro.type) {
        case MACRO_TYPES.NameMacro1:
        case MACRO_TYPES.DetailsMacro:
        case MACRO_TYPES.FactionMacro:
        case MACRO_TYPES.ContextMacro:
        case MACRO_TYPES.BindingMacro: {
          if (macro.type === MACRO_TYPES.ContextMacro) {
            words[w] = csReplace(words[w], macro.token, getContextValue(macro.token, parentQuest, parentQuest.hooks));
          } else {
            const resource = parentQuest.getResource({ name: macro.symbol });
            if (resource) {
              const result = resource.expandMacro?.(macro.type);
              // A true and null pair removes the token here too.
              if (typeof result === 'string' || result === null) words[w] = csReplace(words[w], macro.token, result);
              if (macro.type === MACRO_TYPES.NameMacro1) {
                const hooks = parentQuest.hooks;
                if (resource.isPlace) hooks?.addDialog?.(parentQuest.uid, macro.symbol, 'Location');
                else if (resource.isPerson) hooks?.addDialog?.(parentQuest.uid, macro.symbol, 'Person');
                else if (resource.isItem) hooks?.addDialog?.(parentQuest.uid, macro.symbol, 'Thing');
              }
            }
          }
          break;
        }
        case MACRO_TYPES.NameMacro2:
        case MACRO_TYPES.NameMacro3:
        case MACRO_TYPES.NameMacro4:
          words[w] = '...';
          break;
      }
    }
    const final = words.join(' ');
    if (final.length > 0) {
      signoff = final.trim() + ' ' + signoff;
      lines++;
    }
    if (lines >= 1) break;
  }
  return EN.letterPrefix + signoff;
}

export function expandQuestString(parentQuest, questString) {
  const macro = getMacro(questString);
  if (macro.type !== MACRO_TYPES.ContextMacro) return questString;
  return csReplace(questString, macro.token, getContextValue(macro.token, parentQuest, parentQuest?.hooks));
}

export function getMessageResources(message, roll = Math.random) {
  if (!message) return null;
  const resources = [];
  const tokens = message.getTextTokens(-1, roll, false);
  for (const token of tokens) {
    if (!token.text) continue;
    for (const word of token.text.split(' ')) {
      const macro = getMacro(word);
      const resource = message.parentQuest?.getResource({ name: macro.symbol });
      if (resource) resources.push(resource);
    }
  }
  return resources;
}
