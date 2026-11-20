// BUNNYFALL WEEB1: FLAT REPLACER'S LAW - which picture an interior NPC wears, from the JSON files a mod ships.
//
// Flat Replacer (Numidium3rd, MIT - https://github.com/numidium/dfu-mods/tree/master/FlatReplacer) is the framework
// Weeberfall's townsfolk ride: a list of records, each saying "an NPC drawn as archive_record, in these regions,
// factions, building types and qualities, is drawn as this other picture instead, with this portrait and name bank".
// This is its matching, pure: ReplacementConverter's defaults (parseFlatRecords), FlatReplacer.ReplaceBillboard's
// filters, priority and specificity (chooseFlatReplacement). No DOM, no store, no clock.
//
// Departures, each on purpose:
//   - Specificity is counted fresh for every NPC. The original adds to a field it never resets, so a record's score
//     grows with every NPC it was ever weighed for; the intent (prefer the more specific record) is what is kept.
//   - Keeping only the most specific candidates removes every lower one. The original's RemoveAt inside a counting
//     loop skips the element after each removal.
//   - The pick among equals is a hash of the NPC's name seed, not .NET's System.Random(nameSeed): the same NPC still
//     gets the same picture every time, which is what the seed was for.
//   - Records are read leniently (leading zeros, trailing commas, comments): FullSerializer's parser accepts the
//     `"Regions": [05, 16]` Weeberfall's own files carry, and JSON.parse does not.

export const WILDCARD = -1;
export const LOCATION = Object.freeze({ All: 0, Building: 1, Dungeon: 2 });

// ---- reading the files ----------------------------------------------------------------------------------------------

/** A tolerant JSON reader: JSON plus leading zeros on numbers, trailing commas and // or /* comments. */
export function parseRelaxedJson(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  let i = 0;
  const fail = (what) => { throw new Error(`${what} at character ${i}`); };
  const ws = () => {
    for (;;) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
      return;
    }
  };
  const value = () => {
    ws();
    const c = s[i];
    if (c === '{') {
      i++;
      const o = {};
      for (;;) {
        ws();
        if (s[i] === '}') { i++; return o; }
        if (s[i] !== '"') fail('expected a key');
        const k = str();
        ws();
        if (s[i++] !== ':') fail('expected ":"');
        o[k] = value();
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return o; }
        fail('expected "," or "}"');
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      for (;;) {
        ws();
        if (s[i] === ']') { i++; return a; }
        a.push(value());
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return a; }
        fail('expected "," or "]"');
      }
    }
    if (c === '"') return str();
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i, i + 40));
    if (m) { i += m[0].length; return Number(m[0]); }
    for (const [word, v] of [['true', true], ['false', false], ['null', null]]) if (s.startsWith(word, i)) { i += word.length; return v; }
    return fail('unexpected text');
  };
  const str = () => {
    i++;
    let out = '';
    for (;;) {
      const c = s[i++];
      if (c === undefined) fail('unterminated string');
      if (c === '"') return out;
      if (c === '\\') {
        const e = s[i++];
        if (e === 'u') { out += String.fromCharCode(parseInt(s.slice(i, i + 4), 16)); i += 4; }
        else out += { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }[e] ?? e;
      } else out += c;
    }
  };
  const v = value();
  ws();
  if (i < s.length) fail('text after the end');
  return v;
}

const int = (o, k, d = WILDCARD) => (Number.isInteger(o?.[k]) ? o[k] : d);

/** ReplacementConverter.DoDeserialize: one record with its defaults, or null when it names no flat to replace or no
 *  picture to replace it with (FlatReplacer.Start drops those). Only vanilla-named pictures (archive_record) are
 *  read: every Weeberfall record names one; a custom FlatTextureName is kept for the record but not drawn. */
export function flatRecord(o) {
  if (!o || typeof o !== 'object') return null;
  const regions = Array.isArray(o.Regions) && o.Regions.length ? o.Regions.filter(Number.isInteger) : [WILDCARD];
  const r = {
    regions: regions.length ? regions : [WILDCARD],
    locationTypes: int(o, 'LocationTypes', 0),
    factionId: int(o, 'FactionId'),
    buildingType: int(o, 'BuildingType'),
    socialGroup: int(o, 'SocialGroup'),
    nameBank: int(o, 'NameBank'),
    race: int(o, 'Race'),
    gender: int(o, 'Gender'),
    qualityMin: int(o, 'QualityMin', 1),
    qualityMax: int(o, 'QualityMax', 20),
    archive: int(o, 'TextureArchive'),
    record: int(o, 'TextureRecord'),
    replaceArchive: int(o, 'ReplaceTextureArchive'),
    replaceRecord: int(o, 'ReplaceTextureRecord'),
    portrait: int(o, 'FlatPortrait'),
    priority: int(o, 'Priority', 0),
    description: typeof o.Description === 'string' ? o.Description : '',
  };
  if (r.archive === WILDCARD || r.record === WILDCARD) return null;
  if (!(r.replaceArchive > 0 && r.replaceRecord > WILDCARD)) return null;
  return r;
}

/** Every record of one file's text: `[record]`, the unreadable ones left out. Throws when the file is not a list. */
export function parseFlatRecords(text) {
  const list = parseRelaxedJson(text);
  if (!Array.isArray(list)) throw new Error('not a list of replacements');
  return list.map(flatRecord).filter(Boolean);
}

/** The records indexed by the flat they replace: Map(`archive_record` -> [record]). */
export function indexFlatRecords(records) {
  const map = new Map();
  for (const r of records ?? []) {
    const k = `${r.archive}_${r.record}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// ---- the choice -----------------------------------------------------------------------------------------------------

/** A small stable hash of the name seed, for the pick among equals. */
const seedPick = (seed, n) => {
  let x = (seed | 0) ^ 0x9E3779B9;
  x = Math.imul(x ^ (x >>> 16), 0x85EBCA6B);
  x = Math.imul(x ^ (x >>> 13), 0xC2B2AE35);
  return ((x ^ (x >>> 16)) >>> 0) % n;
};

/**
 * FlatReplacer.ReplaceBillboard's choice for one NPC, or null.
 * @param index       indexFlatRecords' map
 * @param npc         { archive, record } - the flat the NPC is drawn as; `factionId`; `nameSeed`; `isQuestNpc`
 * @param place       { location: LOCATION.Building | LOCATION.Dungeon, region, building: { factionId, buildingType,
 *                      quality } (a building's), socialGroup (the NPC's faction's sgroup) }
 */
export function chooseFlatReplacement(index, npc, place) {
  if (!index || !npc || npc.isQuestNpc) return null;   // a quest's NPC keeps its billboard (QuestResourceBehaviour)
  const list = index.get(`${npc.archive}_${npc.record}`);
  if (!list?.length) return null;
  const candidates = [];
  let maxPriority = 0;
  for (const r of list) {
    let spec = 0;
    if (r.locationTypes !== LOCATION.All) {
      if ((r.locationTypes & place.location) === 0) continue;
      spec++;
    }
    if (r.regions[0] !== WILDCARD) {
      if (!r.regions.includes(place.region)) continue;
      spec += r.regions.length === 1 ? 2 : 1;
    }
    if (place.location === LOCATION.Building) {
      const b = place.building ?? {};
      if (r.factionId !== WILDCARD && r.factionId !== b.factionId) continue;
      if (r.buildingType !== WILDCARD && r.buildingType !== b.buildingType) continue;
      const q = b.quality ?? 0;
      if (q < r.qualityMin || q > r.qualityMax) continue;
    } else if (r.factionId !== WILDCARD) continue;   // castles and dungeons are factionless
    if (r.socialGroup !== WILDCARD && r.socialGroup !== place.socialGroup) continue;
    if (r.qualityMin !== 1) spec++;
    if (r.qualityMax !== 20) spec++;
    if (r.socialGroup === place.socialGroup) spec++;
    if (r.factionId !== WILDCARD) spec++;
    if (r.buildingType !== WILDCARD) spec++;
    if (r.priority > maxPriority) maxPriority = r.priority;
    candidates.push({ r, spec });
  }
  const top = candidates.filter((c) => c.r.priority === maxPriority);
  if (!top.length) return null;
  const best = Math.max(...top.map((c) => c.spec));
  const kept = top.filter((c) => c.spec === best);
  return kept[kept.length > 1 ? seedPick(npc.nameSeed ?? 0, kept.length) : 0].r;
}

/** FlatReplacer.OnWindowChange: the talk window's portrait for a chosen record, or null to keep the NPC's own. A named
 *  individual whose own face is a special one (faction type 4, face 60 or less) draws from FACES.CIF. */
export function flatPortrait(record, factionData = null) {
  if (!record || !(record.portrait > WILDCARD)) return null;
  const special = factionData?.type === 4 && (factionData.face ?? 0) <= 60;
  return { archive: special ? 'SpecialFaces' : 'CommonFaces', record: record.portrait };
}

/** The name bank a chosen record gives its NPC (NameHelper.BankTypes 0-10), or null to keep the region's. */
export const flatNameBank = (record) => (record && record.nameBank >= 0 && record.nameBank <= 10 ? record.nameBank : null);
