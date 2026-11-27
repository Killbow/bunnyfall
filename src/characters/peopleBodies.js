// @ts-check
import { GENDERS } from './nameHelper.js';
import { isChildNPCData, isChildNPCTexture } from './staticNpc.js';
import { flatGender } from '../formats/flatsFile.js';
import { textSeed } from '../systems/livingWorld/seed.js';
import { RACES } from './races.js';
import { SOCIAL_GROUPS, GUILD_GROUPS, FACTION_TYPES } from '../formats/factionFile.js';
import { isNpcFlat } from '../world/npcFlatArchives.js';
import { dressPerson } from './wardrobe.js';

const RACE_NAME = Object.freeze(Object.fromEntries(Object.entries(RACES).map(([k, v]) => [v, k])));

export const KIND_ROLE = Object.freeze({
  priest: 'priest', mage: 'mage', knight: 'knight', fighter: 'fighter', noble: 'noble', merchant: 'merchant',
  underworld: 'rogue', scholar: 'scholar', common: 'commoner',
});

function mix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** @param {any} f */
export function wardrobeOf(f) {
  if (!f) return 'common';
  if (f.type === FACTION_TYPES.VampireClan || f.ggroup === GUILD_GROUPS.Vampires || f.sgroup === SOCIAL_GROUPS.SupernaturalBeings) return 'none';
  if (f.type === FACTION_TYPES.Daedra || f.type === FACTION_TYPES.God || f.ggroup === GUILD_GROUPS.Oblivion || f.ggroup === GUILD_GROUPS.TheFey) return 'none';
  if (f.type === FACTION_TYPES.Temple || f.ggroup === GUILD_GROUPS.HolyOrder) return 'priest';
  if (f.ggroup === GUILD_GROUPS.MagesGuild || f.type === FACTION_TYPES.MagicUser) return 'mage';
  if (f.type === FACTION_TYPES.WitchesCoven || f.ggroup === GUILD_GROUPS.Witches || f.ggroup === GUILD_GROUPS.Necromancers) return 'mage';
  if (f.ggroup === GUILD_GROUPS.KnightlyOrder || f.type === FACTION_TYPES.KnightlyGuard) return 'knight';
  if (f.ggroup === GUILD_GROUPS.FightersGuild) return 'fighter';
  if (f.sgroup === SOCIAL_GROUPS.Nobility || f.type === FACTION_TYPES.Courts) return 'noble';
  if (f.sgroup === SOCIAL_GROUPS.Merchants) return 'merchant';
  if (f.sgroup === SOCIAL_GROUPS.Underworld || f.type === FACTION_TYPES.Thieves || f.ggroup === GUILD_GROUPS.DarkBrotherHood) return 'underworld';
  if (f.sgroup === SOCIAL_GROUPS.Scholars) return 'scholar';
  return 'common';
}

/**
 * @param {any} pn
 * @param {any} data
 * @param {any} faction
 */
export function personLook(pn, data, faction) {
  if (pn.guildClerkArt) return (pn._mwLook = null);
  if (pn._mwLook !== undefined) return pn._mwLook;
  if (!data || isChildNPCData(data)) return (pn._mwLook = null);
  if (!data.questPerson && !isNpcFlat(data.billboardArchiveIndex)) return (pn._mwLook = null);
  const kind = wardrobeOf(faction);
  const race = RACE_NAME[data.race];
  if (kind === 'none' || !race) return (pn._mwLook = null);
  const gender = data.gender === GENDERS.Female ? 'female' : 'male';
  const seed = mix((data.nameSeed | 0) ^ mix(data.hash | 0));
  const d = dressPerson({ role: KIND_ROLE[kind], gender, seed });
  return (pn._mwLook = { race, gender, faceIndex: mix(seed ^ 0xfa) % 10, items: d.items, npc: d.npc });
}

/**
 * @param {any} fig
 * @param {{ flats?: any, race?: any } | null} [ctx]
 */
export function figureLook(fig, ctx = null) {
  if (fig._mwLook !== undefined) return fig._mwLook;
  const piece = fig.piece, flat = piece?.flat;
  if (!Array.isArray(flat)) return (fig._mwLook = null);
  const [a, r] = flat;
  if (a === DAEDRA_PRINCES_ARCHIVE || isChildNPCTexture(a, r)) return (fig._mwLook = null);
  const flats = ctx?.flats ?? null;
  if (!flats) return null;
  const row = flats.getFlatData?.(a, r) ?? null;
  const gender = row ? flatGender(row.gender) : null;
  if (!gender) return (fig._mwLook = null);
  const seed = textSeed(`decor:${piece.id}`);
  const d = dressPerson({ role: figureRole(row.caption), gender, seed });
  return (fig._mwLook = { race: raceNameOf(ctx?.race ?? null), gender, faceIndex: seed % 10, items: d.items, npc: d.npc });
}
export const DAEDRA_PRINCES_ARCHIVE = 175;
const raceNameOf = (race) => (typeof race === 'number' ? RACE_NAME[race] : typeof race === 'string' && race in RACES ? race : null) ?? 'Breton';
/** @type {ReadonlyArray<[string, RegExp]>} */
export const FIGURE_ROLE_WORDS = Object.freeze([
  ['priest', /\b(?:priest|monks?\b|nuns?\b|cleric|healer|acolyte|templar|abbot|abbess|holy\b)/i],
  ['mage', /\b(?:mages?\b|wizard|sorcer|witch|warlock|necromanc|magician|enchant|seers?\b|mystic|alchemist)/i],
  ['knight', /\b(?:knight|soldier|captain|sentry|sentries|paladin|sergeant)|guard/i],
  ['fighter', /\b(?:warrior|fighter|barbarian|mercenar|swordsm|archer|spear|axes?\b|axe-?m[ae]n|crossbow|amazon|gladiator)/i],
  ['noble', /\b(?:noble|lords?\b|lady|ladies|kings?\b|queen|prince|baron|duke|duchess|count(?:ess)?\b|regent|courtier|elegant|royal|emperor|empress|aristocra)/i],
  ['rogue', /\b(?:thief|thieves|rogue|assassin|cutthroat|bandit|brotherhood|smuggler|pirate|cowl)/i],
  ['merchant', /\b(?:merchant|shopkeep|trader|vendor|innkeep|barkeep|bartender|banker|tailor|grocer)|smith/i],
  ['scholar', /\b(?:scholar|sages?\b|librarian|scribe|teacher|professor|clerk|historian)/i],
]);
/**
 * @param {any} caption
 * @returns {string}
 */
export function figureRole(caption) {
  const c = String(caption ?? '');
  for (const [role, re] of FIGURE_ROLE_WORDS) if (re.test(c)) return role;
  return 'commoner';
}

export const PERSON_TURN_RATE = 3;
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

let _ids = 0;
/**
 * @param {any} pn
 * @param {any} look
 * @param {number[]} feet
 * @param {number[]} eye
 * @param {number} dt
 */
export function personActor(pn, look, feet, eye, dt) {
  const a = pn._mwActor ??= { id: `p${++_ids}`, look: null, feet: null, yaw: 0, moving: false, running: false, drawn: false, swings: 0, strike: 0, casts: 0, castRange: 0, hits: 0, dead: 0 };
  a.look = look; a.feet = feet;
  const want = Math.atan2(eye[0] - feet[0], eye[2] - feet[2]);
  if (pn._mwYaw == null) pn._mwYaw = want;
  else {
    const d = wrap(want - pn._mwYaw), step = PERSON_TURN_RATE * Math.max(0, dt);
    pn._mwYaw = wrap(pn._mwYaw + (Math.abs(d) <= step ? d : Math.sign(d) * step));
  }
  a.yaw = pn._mwYaw;
  return a;
}
