// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, City Charters): A CITY CHARTER - up to three Companies that hold a city together.
//
//   - A Charter stands at a REGIONAL CAPITAL: the region's hub (systems/region/regionHubs.js), one Charter a capital.
//   - Up to CHARTER_COMPANIES_MAX Companies, each with its hall in the capital's region; a Company is in one Charter at most.
//   - A Captain founds it (their Company's hall in the region), invites another Company by its tag, and answers an
//     invitation; a Captain takes their Company out. The last Company out ends the Charter.
//   - On the maps the Charter is one outline round the capital, sized by its Companies' territories together
//     (territoryLaw.js), and its members gather and loot TERRITORY_YIELD_PCT more anywhere inside it.
//
// Pure: no clock, no DOM, no network. Both ends read it.
import { guildNameOf } from './guild/guildLaw.js';
import { territoryRadius, TERRITORY_R_MAX } from './territoryLaw.js';

/** The most Companies a Charter holds, its members and its invitations together. */
export const CHARTER_COMPANIES_MAX = 3;
/** A Charter's territory is its Companies' strengths together, this much wider, and at most this wide (map pixels). */
export const CHARTER_R_MULT = 1.25;
export const CHARTER_R_MAX = Math.round(TERRITORY_R_MAX * CHARTER_R_MULT);
/** How long an invitation stands, seconds. */
export const CHARTER_INVITE_TTL_S = 7 * 24 * 3600;

/** A Charter's name, tidied, or null - a Company name's rules (3-32 letters, digits, spaces, apostrophes, hyphens). */
export const charterNameOf = (raw) => guildNameOf(raw);

/** A Charter's radius in map pixels, from its Companies' strengths. */
export const charterRadius = (strengths) => {
  const sum = (strengths ?? []).reduce((a, s) => a + (Number.isFinite(Number(s)) && Number(s) > 0 ? Number(s) : 0), 0);
  return Math.min(CHARTER_R_MAX, territoryRadius(sum) * CHARTER_R_MULT);
};

/** What a refusal says, by its error. */
export const CHARTER_WORDS = Object.freeze({
  'charter-captain': 'Only a Captain can do that for their Company.',
  'charter-no-hall': 'Your Company needs a hall in this region first.',
  'charter-region-held': 'This capital already has a Charter.',
  'charter-already': 'Your Company is already in a Charter.',
  'charter-name': 'A Charter\'s name is 3 to 32 letters, digits, spaces, apostrophes or hyphens.',
  'charter-full': `A Charter holds at most ${CHARTER_COMPANIES_MAX} Companies, invitations included.`,
  'charter-no-company': 'There is no Company with that tag.',
  'charter-their-hall': 'That Company has no hall in this Charter\'s region.',
  'charter-they-joined': 'That Company is already in a Charter.',
  'charter-invited': 'That Company is already invited.',
  'charter-no-invite': 'That invitation is gone.',
  'charter-none': 'Your Company is in no Charter.',
  'charter-bad': 'That Charter request was not understood.',
});
export const charterWordText = (error) => CHARTER_WORDS[error] ?? 'The Charter could not be changed just now.';
