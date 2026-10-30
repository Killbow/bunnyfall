// @ts-check
// BUNNY-GUILDS (Phase 0c): BUNNYFALL'S GUILDS AS BOTH ENDS READ THEM - their factions, their names and what their halls
// ask for. Pure, with no import from the client's world, so the account service reads it as the client does
// (net/npcChapterLaw.js takes them onto the Roll and into the Chapters).
//
// The client's own module (systems/guild/bunnyGuilds.js) adds the rest: the names in the player's language, the ranks'
// titles and the halls in the towns.

/** Each guild: its key, its faction (past every FACTION.TXT id), its English name, and the material families its
 *  chapters' hall writs ask for (nodeLaw.js; none asks for the region's whole table). In the order a town gives out
 *  its houses. */
export const BUNNY_GUILD_LAW = Object.freeze([
  Object.freeze({ key: 'adventurers', factionId: 2001, name: 'Adventurers Guild', families: Object.freeze(['metals', 'wood']) }),
  Object.freeze({ key: 'bards', factionId: 2002, name: "Bards' College", families: Object.freeze([]) }),
  Object.freeze({ key: 'cartographers', factionId: 2003, name: "Cartographers' Society", families: Object.freeze(['wood', 'stone']) }),
  Object.freeze({ key: 'merchants', factionId: 2004, name: "Merchants' League", families: Object.freeze(['metals', 'herbs', 'wood', 'stone']) }),
  Object.freeze({ key: 'hunters', factionId: 2005, name: "Hunters' Lodge", families: Object.freeze(['wood', 'herbs']) }),
  Object.freeze({ key: 'apothecaries', factionId: 2006, name: "Apothecaries' Guild", families: Object.freeze(['herbs']) }),
  Object.freeze({ key: 'artisans', factionId: 2007, name: "Artisans' Guild", families: Object.freeze(['metals', 'wood', 'stone']) }),
]);

/** Their factions, ascending. */
export const BUNNY_FACTIONS = Object.freeze(BUNNY_GUILD_LAW.map((g) => g.factionId).sort((a, b) => a - b));
const BY_FACTION = new Map(BUNNY_GUILD_LAW.map((g) => [g.factionId, g]));

/** Whether a faction id is one of Bunnyfall's guilds. */
export const isBunnyFaction = (/** @type {unknown} */ id) => typeof id === 'number' && BY_FACTION.has(id);
/** A guild's law by its faction, or null. */
export const bunnyLawOf = (/** @type {unknown} */ id) => (typeof id === 'number' ? BY_FACTION.get(id) ?? null : null);
