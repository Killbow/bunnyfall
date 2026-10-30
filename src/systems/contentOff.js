// @ts-check
// BUNNYFALL PHASE 2: CONTENT SWITCHED OFF, to make room for our own. One list, read by the client and the relay alike
// (server/src imports it too), so both sides agree. The code stays; flip a flag back to true to bring a piece back.
// Saves are left as they are: progress and items from these stay in the save, they just lead nowhere.
//
// A LEAF: imports nothing, so any law file can read it without a cycle.

export const CONTENT = Object.freeze({
  /** Daggerfall's main quest: a new game starts no backbone (_BRISIEN, S0000999). */
  mainQuest: true,
  /** The Curse of Daggerfall (S0000977): no longer the first quest of a new game. */
  curseOfDaggerfall: true,
  /** The Sky-Ketch: no voyage ever comes (net/ketch/ketchLaw.js ketchVoyageAt). */
  skyKetch: false,
  /** The Sea Serpent: no serpent day (net/serpent/serpentLaw.js isSerpentDay). */
  seaSerpent: false,
  /** The Abyss Dungeons: no new Hollow rises; one already standing ends on its own clock (net/superDungeon/sdLaw.js sdDue). */
  abyssDungeons: false,
  /** The Elite Breach: the Spire's road shut - a key used at the arch is handed back (server egDraining). */
  eliteBreach: false,
  /** Dagon's Breaches: no gate day (net/gate/gateLaw.js isGateDay). */
  dagonBreaches: false,
  /** The Witches' Festival: never open (net/festivalLaw.js festivalAt). */
  witchesFestival: false,
  /** Oblivion leveling: not offered at creation, and every character levels Daggerfall's way. */
  oblivionLeveling: false,
  /** Permadeath: a death never ends a character or passes the line on - Daggerfall's own respawn. Family, marriage and
   *  heirs are kept for fun (scenes/legacyHost.js onDeath, systems/chargenSession.js). */
  permadeath: false,
});

/** Whether a piece of content is on. */
export const contentOn = (/** @type {keyof typeof CONTENT} */ key) => CONTENT[key] === true;
