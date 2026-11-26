// @ts-check

import { TITLES, GLYPHS, AURAS, ICONS, SEAT_TITLES, CHAPTER_TITLES } from '../../src/net/identityToken.js';
import { insigniaHeld, insigniaKeys } from '../../src/net/insignia.js';
import { patreonTitlesOf } from './patreon.js';
import { SD_HONOUR_TITLE, SD_HONOUR_AURA } from './sds.js';
import { SERPENT_HONOUR_TITLE, SERPENT_HONOUR_AURA } from './serpents.js';
import { farmTitlesFor, FARM_TITLE_AURA } from '../../src/net/farm/farmWorkLaw.js';
import { EG_HONOUR, EG_HONOUR_TITLES, EG_HONOUR_AURA, EG_CHAMPION_TITLE, EG_FIRST_TITLE, EG_FIRST_AURA } from './egHonours.js';
import { LAMP_TITLE } from './lamp.js';
import { QL_TITLES, qlTitleBit } from '../../src/net/questlineClaims.js';
import { festivalWaresHeld, HEARTHKEEPER_GIVEN, SOULCAKE_TAKEN } from '../../src/net/festivalLaw.js';
import { STAFF_GLYPHS } from '../../src/net/staffCommands.js';
import { MASTERY_MARKS } from '../../src/net/huntLaw.js';

// 2026-09-25T12:00:00Z: the end of September 24 on the last clock to reach the 25th (UTC-12).
// Move it only later, never earlier, so no account that holds Founder loses it.
export const FOUNDER_UNTIL = 1_790_337_600;

export function founderHandles(env) {
  return handleList(env?.FOUNDER_HANDLES);
}

export const isNamedFounder = (player, env) =>
  typeof player?.handle === 'string' && !!player.handle
  && founderHandles(env).has(player.handle.toLowerCase());

export function hoursFirstHandles(env) {
  return handleList(env?.HOURS_FIRST_HANDLES);
}
export const isHoursFirst = (player, env) =>
  typeof player?.handle === 'string' && !!player.handle
  && hoursFirstHandles(env).has(player.handle.toLowerCase());
export const HOURS_FIRST_AURA = 'firsthour';
export function egFirstHandles(env) {
  return handleList(env?.EG_FIRST_HANDLES);
}
export const isSpireFirst = (player, env) =>
  typeof player?.handle === 'string' && !!player.handle
  && egFirstHandles(env).has(player.handle.toLowerCase());

export const SPROUT_S = 14 * 24 * 60 * 60;

export function developerHandles(env) {
  return handleList(env?.DEVELOPER_HANDLES);
}

export function moderatorHandles(env) {
  return handleList(env?.MODERATOR_HANDLES);
}

// Handles are case-folded because their uniqueness is on handle_lc.
export function handleList(raw) {
  if (typeof raw !== 'string' || !raw) return new Set();
  return new Set(raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
}

export const TIER_LISTS = Object.freeze({
  dungeonmaster: 'DUNGEON_MASTER_HANDLES',
  disciple: 'DISCIPLE_HANDLES',
  apostle: 'APOSTLE_HANDLES',
  hierophant: 'HIEROPHANT_HANDLES',
  shadowfang: 'SHADOW_FANG_HANDLES',
  penitent: 'PENITENT_HANDLES',
  herald: 'HERALD_HANDLES',
  aegis: 'AEGIS_HANDLES',
  primarch: 'PRIMARCH_HANDLES',
  crystalfist: 'CRYSTAL_FIST_HANDLES',
  wikimaid: 'WIKIMAID_HANDLES',
  nirnrootsage: 'NIRNROOT_SAGE_HANDLES',
});
export const TIER_GLYPH = Object.freeze({ dungeonmaster: 'dm', disciple: 'disciple', apostle: 'apostle', hierophant: 'hierophant', shadowfang: 'shadowfang', penitent: 'penitent', herald: 'herald', aegis: 'aegis', primarch: 'primarch', crystalfist: 'crystalfist', wikimaid: 'wikimaid', nirnrootsage: 'nirnrootsage' });
export const TIER_AURA = Object.freeze({ aegis: 'oblivionward', primarch: 'radiance', shadowfang: 'shadowcloak', crystalfist: 'resonance', wikimaid: 'lilacwarren', nirnrootsage: 'sagesmoke' });

/** @param {any} player */
export const staffSuspended = (player) => player?.staff_suspended === 1;

export const holdsTier = (title, player, env) =>
  typeof player?.handle === 'string' && !!player.handle && Object.hasOwn(TIER_LISTS, title)
  && !(staffSuspended(player) && STAFF_GLYPHS.includes(TIER_GLYPH[/** @type {keyof typeof TIER_GLYPH} */ (title)]))
  && (handleList(env?.[TIER_LISTS[title]]).has(player.handle.toLowerCase()) || patreonTitlesOf(player, env).includes(title));

export const isDeveloper = (player, env) =>
  typeof player?.handle === 'string' && !!player.handle && !staffSuspended(player)
  && developerHandles(env).has(player.handle.toLowerCase());

export const isModerator = (player, env) =>
  typeof player?.handle === 'string' && !!player.handle && !staffSuspended(player)
  && (moderatorHandles(env).has(player.handle.toLowerCase()) || player.staff_mod === 1);

export const MOD_TIERS = Object.freeze(['shadowfang']);

export const canModerate = (player, env) => isModerator(player, env) || isDeveloper(player, env)
  || MOD_TIERS.some((t) => holdsTier(t, player, env));

const firstPlayed = (player) => Math.min(
  player.registered_at,
  Number.isFinite(player.created_at) ? player.created_at : Infinity,
  Number.isFinite(player.first_played_at) ? player.first_played_at : Infinity,
);

/** @param {any} player @param {any} env */
export function titlesHeld(player, env) {
  const held = [];
  // registered_at is checked first: D1 gives a guest a NULL registered_at, and Math.min reads null as 0.
  if (Number.isFinite(player?.registered_at) && firstPlayed(player) <= FOUNDER_UNTIL) held.push('founder');
  if (!held.includes('founder') && isNamedFounder(player, env)) held.push('founder');
  if (isDeveloper(player, env)) held.push('developer');
  for (const t of Object.keys(TIER_LISTS)) if (holdsTier(t, player, env)) held.push(t);
  for (const t of insigniaKeys(player?.insignia, 'title')) if (!held.includes(t)) held.push(t);
  if (Array.isArray(player?.seatTitles)) for (const t of player.seatTitles) if (SEAT_TITLES.includes(t) && !held.includes(t)) held.push(t);
  if (Array.isArray(player?.chapterTitles)) for (const t of player.chapterTitles) if (CHAPTER_TITLES.includes(t) && !held.includes(t)) held.push(t);
  if (player?.arena?.grand === true) held.push('grandchampion');
  if (player?.arena?.champion === true) held.push('arenachampion');
  if (player?.iliac?.champion === true) held.push('iliacchampion');
  if (player?.gambit?.champion === true) held.push('grandmaster');
  if (typeof player?.handle === 'string' && player.handle && (Number(player?.sd_honours) & SD_HONOUR_TITLE)) held.push('hourbreaker');
  if (isHoursFirst(player, env)) held.push('hoursfirst');
  if (typeof player?.handle === 'string' && player.handle && Number(player?.lamp_title) === 1) held.push(LAMP_TITLE);
  if (typeof player?.handle === 'string' && player.handle && (Number(player?.serpent_honours) & SERPENT_HONOUR_TITLE)) held.push('coilbreaker');
  if (typeof player?.handle === 'string' && player.handle) for (const t of EG_HONOUR_TITLES) if (Number(player?.eg_honours) & EG_HONOUR[t]) held.push(t);
  if (player?.eg?.champion === true) held.push(EG_CHAMPION_TITLE);
  if (isSpireFirst(player, env)) held.push(EG_FIRST_TITLE);
  if (typeof player?.handle === 'string' && player.handle) for (const t of QL_TITLES) if (Number(player?.ql_titles) & qlTitleBit(t)) held.push(t);
  if (typeof player?.handle === 'string' && player.handle) {
    for (const t of festivalKeys(player, 'title')) if (!held.includes(t)) held.push(t);
    if (Number(player?.fest_given) >= HEARTHKEEPER_GIVEN) held.push(HEARTHKEEPER_TITLE);
    if (Array.isArray(player?.masteryMarks)) for (const t of MASTERY_MARKS) if (player.masteryMarks.includes(t) && !held.includes(t)) held.push(t);
    for (const t of farmTitlesFor(player?.farm_work)) if (!held.includes(t)) held.push(t);
  }
  return held;
}
export const HEARTHKEEPER_TITLE = 'hearthkeeper';
const festivalKeys = (/** @type {any} */ player, /** @type {string} */ kind) => festivalWaresHeld(player?.fest_wares).filter((id) => id.startsWith(`${kind}:`)).map((id) => id.slice(kind.length + 1));

export const DEVELOPER_AURA = 'seraphwings';
export function aurasHeld(player, env) {
  const held = [];
  for (const [t, a] of Object.entries(TIER_AURA)) if (holdsTier(t, player, env) && !held.includes(a)) held.push(a);
  if (isDeveloper(player, env) && !held.includes(DEVELOPER_AURA)) held.push(DEVELOPER_AURA);
  if (typeof player?.handle === 'string' && player.handle && (Number(player?.sd_honours) & SD_HONOUR_AURA)) held.push('turninghour');
  if (isHoursFirst(player, env) && !held.includes(HOURS_FIRST_AURA)) held.push(HOURS_FIRST_AURA);
  if (typeof player?.handle === 'string' && player.handle) for (const [t, a] of Object.entries(EG_HONOUR_AURA)) if ((Number(player?.eg_honours) & EG_HONOUR[t]) && !held.includes(a)) held.push(a);
  if (isSpireFirst(player, env) && !held.includes(EG_FIRST_AURA)) held.push(EG_FIRST_AURA);
  // Owning the legendarybartender title grants this aura, so purchases made before the aura existed hold it too.
  if (player?.handle && insigniaKeys(player.insignia, 'title').includes('legendarybartender') && !held.includes('beaconlight')) held.push('beaconlight');
  for (const a of insigniaKeys(player?.insignia, 'aura')) if (!held.includes(a)) held.push(a);
  if (typeof player?.handle === 'string' && player.handle && (Number(player?.serpent_honours) & SERPENT_HONOUR_AURA)) held.push('maelstrom');
  if (typeof player?.handle === 'string' && player.handle) for (const a of festivalKeys(player, 'aura')) if (!held.includes(a)) held.push(a);
  if (typeof player?.handle === 'string' && player.handle) for (const t of farmTitlesFor(player?.farm_work)) { const a = FARM_TITLE_AURA[t]; if (a && !held.includes(a)) held.push(a); }
  return held;
}

export const SOULCAKE_ICON = 'soulcake';
export function iconsHeld(/** @type {any} */ player) {
  if (!(typeof player?.handle === 'string' && player.handle)) return [];
  const own = new Set(festivalKeys(player, 'icon'));
  if (Number(player?.fest_taken) >= SOULCAKE_TAKEN) own.add(SOULCAKE_ICON);
  return ICONS.filter((i) => own.has(i));
}
export function iconWorn(/** @type {any} */ player) {
  const i = player?.icon;
  return typeof i === 'string' && i && iconsHeld(player).includes(i) ? i : undefined;
}
export function iconRefusal(/** @type {unknown} */ icon, /** @type {any} */ player) {
  if (icon === null) return null;
  if (typeof icon !== 'string' || !ICONS.includes(icon)) return 'no-icon';
  return iconsHeld(player).includes(icon) ? null : 'not-held';
}
export function auraWorn(player, env) {
  const a = player?.aura;
  if (typeof a !== 'string' || !a) return undefined;
  return aurasHeld(player, env).includes(a) ? a : undefined;
}
export function auraRefusal(aura, player, env) {
  if (aura === null) return null;
  if (typeof aura !== 'string' || !AURAS.includes(aura)) return 'no-aura';
  return aurasHeld(player, env).includes(aura) ? null : 'not-held';
}

export function glyphsOf(player, env, nowS) {
  const on = [];
  if (Number.isFinite(player?.created_at) && nowS - player.created_at < SPROUT_S) on.push('sprout');
  if (isDeveloper(player, env)) on.push('dev');
  if (isModerator(player, env)) on.push('mod');
  for (const t of Object.keys(TIER_LISTS)) if (holdsTier(t, player, env)) on.push(TIER_GLYPH[t]);
  if (player?.arena?.champion === true) on.push('laurel');
  return on;
}

export function glyphsHidden(player, env, nowS) {
  const off = typeof player?.glyphs_off === 'string' ? player.glyphs_off.split(' ') : [];
  return glyphsOf(player, env, nowS).filter((g) => off.includes(g));
}

// Display only: rights that ride a glyph, such as relay commands and canModerate, read glyphsOf, never this.
export function glyphsShown(player, env, nowS) {
  const off = glyphsHidden(player, env, nowS);
  return glyphsOf(player, env, nowS).filter((g) => !off.includes(g));
}

export function glyphRefusal(glyph, player, env, nowS) {
  if (typeof glyph !== 'string' || !GLYPHS.includes(glyph)) return 'no-glyph';
  return glyphsOf(player, env, nowS).includes(glyph) ? null : 'not-held';
}

// The worn title is checked on every read, so a lapsed title stops showing without anyone clearing the column.
export function titleWorn(player, env) {
  const t = player?.title;
  if (typeof t !== 'string' || !t) return undefined;
  return titlesHeld(player, env).includes(t) ? t : undefined;
}

export function equipRefusal(title, player, env) {
  if (title === null) return null;
  if (typeof title !== 'string' || !TITLES.includes(title)) return 'no-title';
  return titlesHeld(player, env).includes(title) ? null : 'not-held';
}

const glyphsOffOf = (player, env, nowS) => { const off = glyphsHidden(player, env, nowS); return off.length ? { glyphsOff: off } : {}; };

export const wardrobeOf = (player, env, nowS) => ({
  titles: titlesHeld(player, env),
  title: titleWorn(player, env) ?? null,
  glyphs: glyphsOf(player, env, nowS),
  ...glyphsOffOf(player, env, nowS),
  auras: aurasHeld(player, env),
  aura: auraWorn(player, env) ?? null,
  insignia: insigniaHeld(player?.insignia),
  icons: iconsHeld(player),
  icon: iconWorn(player) ?? null,
});

export { TITLES, GLYPHS };
