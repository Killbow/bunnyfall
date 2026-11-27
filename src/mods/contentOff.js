// @ts-check

// Owner switches for content: false turns a piece off. The client and the relay both read this one list.
// Switching content off never edits saves: its progress and items stay in the save and lead nowhere.
// It imports nothing, so any rules file can read it without a cycle.

export const CONTENT = Object.freeze({
  // Off: a new game starts no main quest (systems/quest/questBridge.js GAME_START_QUESTS, mainSpine.js).
  mainQuest: true,
  // Off: The Curse of Daggerfall is not the first quest of a new game (systems/quest/questBridge.js).
  curseOfDaggerfall: true,
  // Off: no Sky-Ketch voyage comes (net/ketch/ketchLaw.js ketchVoyageAt).
  skyKetch: false,
  // Off: no serpent day (net/serpentLaw.js isSerpentDay).
  seaSerpent: false,
  // Off: no new Hollow rises, and one already open ends on its own clock (net/sdLaw.js).
  abyssDungeons: false,
  // Off: the relay treats the Elite Breach as draining and shuts the arch (server/src/world/eg.js _egDraining).
  eliteBreach: false,
  // Off: no gate day (net/gateLaw.js isGateDay).
  dagonBreaches: false,
  // Off: the Witches' Festival never opens (net/festivalLaw.js festivalAt).
  witchesFestival: false,
  // Off: not offered at creation, and every character levels Daggerfall's way (characters/oblivionLeveling.js).
  oblivionLeveling: false,
  // Off: a death never ends a character, and Daggerfall's own respawn applies (systems/legacy/legacyHost.js).
  permadeath: false,
  // Off: one report from an account a day old confirms a map pixel or dungeon (net/nodeLaw.js WITNESS).
  witnessedGround: false,
  // Off: a chat line is sent as typed (net/wire.js); names, guild names, notes, and letters keep the filter.
  chatFilter: false,
  // On: in a town with two taverns or more, one picked by map id opens the shared hall (systems/magicTavern.js).
  magicTaverns: true,
  // Off: Envoy Valenis opens no portal and the Bazaar Betwixt cannot be entered (systems/bazaarBetwixt.js).
  bazaarBetwixt: true,
  // Off: no daily elite dungeons are picked and the game shows none (systems/eliteDungeons/edBook.js).
  eliteDungeons: true,
  // Off: no Company farm holds a market day (net/farm/marketLaw.js marketToday).
  farmMarkets: true,
  // Off: no Clan Elder summons comes, and a vampire lives by Daggerfall's rules (systems/vampire/vitae.js).
  vampireBlood: true,
});

export const contentOn = (/** @type {keyof typeof CONTENT} */ key) => CONTENT[key] === true;
