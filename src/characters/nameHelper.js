import { rand, srand, randomRangeInclusive } from '../formats/dfRandom.js';
import { REGION_RACES } from '../formats/mapsFile.js';
import { RACES } from './races.js';
import { localeDocument, localizedText } from '../ui/textManager.js';
import { PACK_KIND } from '../ui/translationPacks.js';
import nameGen from './nameGen.json' with { type: 'json' };

export const BANK_TYPES = Object.freeze({
  Breton: 0, Redguard: 1, Nord: 2, DarkElf: 3, HighElf: 4,
  WoodElf: 5, Khajiit: 6, Imperial: 7, Monster1: 8, Monster2: 9, Monster3: 10,
});
export const GENDERS = Object.freeze({ Male: 0, Female: 1 });

const BANK_NAMES = ['Breton', 'Redguard', 'Nord', 'DarkElf', 'HighElf',
  'WoodElf', 'Khajiit', 'Imperial', 'Monster1', 'Monster2', 'Monster3'];

export function parseFsJson(src) {
  const s = String(src ?? '');
  let i = 0;
  const fail = (what) => { throw new Error(`${what} at ${i}`); };
  const space = () => {
    for (;;) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
      if (s[i] === '/' && s[i + 1] === '*') { const end = s.indexOf('*/', i + 2); i = end < 0 ? s.length : end + 2; continue; }
      return;
    }
  };
  const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  const string = () => {
    if (s[i] !== '"') fail('Expected a string');
    let out = '';
    for (i++; i < s.length && s[i] !== '"'; i++) {
      if (s[i] !== '\\') { out += s[i]; continue; }
      const e = s[++i];
      if (e === 'u') { const hex = s.slice(i + 1, i + 5); if (!/^[0-9a-f]{4}$/i.test(hex)) fail('Bad \\u escape'); out += String.fromCharCode(parseInt(hex, 16)); i += 4; } else if (ESCAPES[e] !== undefined) out += ESCAPES[e];
      else fail(`Bad escape \\${e}`);
    }
    if (s[i] !== '"') fail('Unterminated string');
    i++;
    return out;
  };
  const value = () => {
    space();
    if (s[i] === '{') {
      const obj = {};
      for (i++, space(); i < s.length && s[i] !== '}'; space()) {
        const key = string();
        space();
        if (s[i] !== ':') fail(`Expected : after key "${key}"`);
        i++;
        obj[key] = value();
        space();
        if (s[i] === ',') i++;
      }
      if (s[i] !== '}') fail('No closing } for object');
      i++;
      return obj;
    }
    if (s[i] === '[') {
      const arr = [];
      for (i++, space(); i < s.length && s[i] !== ']'; space()) {
        arr.push(value());
        space();
        if (s[i] === ',') i++;
      }
      if (s[i] !== ']') fail('No closing ] for array');
      i++;
      return arr;
    }
    if (s[i] === '"') return string();
    const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(s.slice(i, i + 32));
    if (!m) fail('Unexpected character');
    i += m[0].length;
    return m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'null' ? null : Number(m[0]);
  };
  const out = value();
  space();
  return out;
}

export function nameBanksOf(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('NameGen is not a dictionary of banks');
  const banks = {};
  for (const name of BANK_NAMES) {
    const bank = parsed[name];
    if (!Array.isArray(bank?.sets) || bank.sets.length < nameGen[name].sets.length) throw new Error(`NameGen bank ${name} is missing or short`);
    for (const set of bank.sets) {
      if (!Array.isArray(set?.parts) || !set.parts.length || !set.parts.every((p) => typeof p === 'string')) throw new Error(`NameGen bank ${name} has a set without parts`);
    }
    banks[name] = bank;
  }
  return banks;
}

export function loadNameGenData() {
  const text = localeDocument(PACK_KIND.NAMEGEN, 'NameGen');
  if (text == null) return nameGen;
  try { return nameBanksOf(parseFsJson(text)); } catch (err) {
    console.log(`Could not load or deserialize NameGen.txt database from StreamingAssets/Text or internal Resources. Check file exists and is in correct format. (${err?.message ?? err})`);
    return nameGen;
  }
}

let _session = null;
function session() {
  if (!_session) _session = { banks: loadNameGenData(), nordSuffix: localizedText('nordSurnameImmutableSuffix', 'sen') };
  return _session;
}
export function resetNameBanks() { _session = null; }

const bankOf = (type) => session().banks[BANK_NAMES[type]];
const draw = (parts) => parts[rand() % parts.length];

const BANK_BY_RACE = Object.freeze({
  Breton: BANK_TYPES.Breton, Redguard: BANK_TYPES.Redguard, Nord: BANK_TYPES.Nord,
  DarkElf: BANK_TYPES.DarkElf, HighElf: BANK_TYPES.HighElf, WoodElf: BANK_TYPES.WoodElf,
  Khajiit: BANK_TYPES.Khajiit, Argonian: BANK_TYPES.Imperial,
});
export const getNameBank = (raceKey) => BANK_BY_RACE[raceKey] ?? BANK_TYPES.Breton;

const RACE_KEY_BY_ORDINAL = Object.freeze(Object.fromEntries(
  Object.entries(RACES).map(([key, ordinal]) => [ordinal, key])));

export function getRandomNameBank() {
  srand((Math.random() * 0x80000000) >>> 0);
  return getNameBank(RACE_KEY_BY_ORDINAL[randomRangeInclusive(1, 8)]);
}

export function getRandomFullName(regionIndex) {
  const bank = getNameBankOfRegion(regionIndex ?? -1);
  const gender = randomRangeInclusive(0, 1) === 1 ? GENDERS.Female : GENDERS.Male;
  return fullName(bank, gender);
}

export function getNameBankOfRegion(regionIndex) {
  if (regionIndex > -1) return REGION_RACES[regionIndex];
  return BANK_TYPES.Breton;
}

export function firstName(type, gender) {
  const bank = bankOf(type);
  switch (type) {
    case BANK_TYPES.Breton:
    case BANK_TYPES.Nord:
    case BANK_TYPES.DarkElf:
    case BANK_TYPES.HighElf:
    case BANK_TYPES.WoodElf:
    case BANK_TYPES.Khajiit:
    case BANK_TYPES.Imperial: {
      const [a, b] = gender === GENDERS.Male
        ? [bank.sets[0].parts, bank.sets[1].parts]
        : [bank.sets[2].parts, bank.sets[3].parts];
      return draw(a) + draw(b);
    }
    case BANK_TYPES.Redguard: {
      const partsD = gender === GENDERS.Male ? bank.sets[3].parts : bank.sets[4].parts;
      const a = draw(bank.sets[0].parts);
      const b = draw(bank.sets[1].parts);
      const c = draw(bank.sets[2].parts);
      let d = '';
      // The female path never draws the 75% roll, which keeps the random stream aligned with DFU.
      if (gender === GENDERS.Female || (rand() % 100 < 75)) d = draw(partsD);
      return a + b + c + d;
    }
    default:
      return '';
  }
}

export function surname(type) {
  const bank = bankOf(type);
  switch (type) {
    case BANK_TYPES.Breton:
    case BANK_TYPES.DarkElf:
    case BANK_TYPES.HighElf:
    case BANK_TYPES.WoodElf:
    case BANK_TYPES.Khajiit:
    case BANK_TYPES.Imperial:
      return draw(bank.sets[4].parts) + draw(bank.sets[5].parts);
    case BANK_TYPES.Nord:
      return draw(bank.sets[0].parts) + draw(bank.sets[1].parts) + session().nordSuffix;
    default:
      return '';
  }
}

export function fullName(type, gender) {
  const first = firstName(type, gender);
  const last = surname(type);
  return last ? `${first} ${last}` : first;
}

export function monsterName(gender = GENDERS.Male, bankRoll = Math.random, bankType = null) {
  const type = bankType ?? (8 + Math.floor(bankRoll() * 2));
  const bank = bankOf(type);
  const partsA = bank.sets[0].parts;
  const partsB = bank.sets[1].parts;
  const partsC = bank.sets[2].parts;
  const partsD = bank.sets.length >= 4 ? bank.sets[3].parts : null;
  let a = '', b = '', c = '', d = '';
  if (type !== BANK_TYPES.Monster3) {
    a = draw(partsA);
    if (rand() % 50 < 25) b = draw(partsB);
    c = draw(partsC);
    if (partsD && gender === GENDERS.Female) d = draw(partsD);
  } else {
    if (gender === GENDERS.Female || rand() % 100 >= 25) {
      a = draw(partsA);
    } else {
      a = draw(partsD) + ' ';
      b = draw(partsA);
    }
    c = draw(partsB);
    d = draw(partsC);
  }
  return a + b + c + d;
}
