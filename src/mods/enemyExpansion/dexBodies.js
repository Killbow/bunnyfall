// Daggerfall Enemy Expansion's fifty enemies matched to Morrowind creatures and person bodies.
// A monster maps to a creature or to a declared miss with a reason, and its sprite is shown on a miss.

import { registerCreatureMatches, _resetCreatureMatches } from '../../characters/creatureBodies.js';
import { registerPersonFoes, _resetPersonFoes } from '../../characters/foeBodies.js';

const NO_RIDE = 'a rider - its horse is its sprite\'s, and no person\'s body rides';

/** @type {Readonly<Record<number, { creature?: string[], miss?: string, veil?: boolean }>>} */
export const DEX_CREATURE_MATCH = Object.freeze({
  256: { creature: ['goblin_grunt'] },
  257: { miss: 'a flyer - no homunculus flies Morrowind' },
  258: { miss: 'a lizard man is a person - Morrowind\'s Argonian (DEX_PERSON_FOES), never a creature' },
  259: { miss: 'a lizard man is a person' },
  260: { miss: 'no bat walks Morrowind' },
  261: { miss: 'no medusa' },
  262: { creature: ['bm_wolf_grey'] },
  263: { creature: ['bm_wolf_snow_unique', 'bm_wolf_grey'] },
  264: { miss: 'no hell hound' },
  265: { miss: 'no grotesque' },
  266: { creature: ['skeleton warrior', 'skeleton'] },
  267: { miss: 'no dog' },
  268: { miss: 'no nymph' },
  269: { miss: 'no minotaur' },
  270: { creature: ['atronach_storm'] },
  271: { miss: 'no giant spider (the centurion spider is a Dwemer machine)' },
  272: { creature: ['bm_ice_troll'] },
  273: { creature: ['ancestor_ghost'], veil: true },
  274: { creature: ['ancestor_ghost'], veil: true },
  275: { miss: 'a named spectral keeps his own sprite (MWNPC13) - the body is the stock ghost\'s, and he is no stock ghost' },
  276: { miss: 'no fire daemon' },
  277: { creature: ['bonewalker'] },
  278: { creature: ['bm_frost_boar'] },
  279: { miss: 'Morrowind\'s dreugh swims, and this one walks' },
  280: { miss: 'no great cat' },
  281: { creature: ['mudcrab'] },
  282: { creature: ['ogrim'] },
  283: { miss: 'no will-o\'-wisp' },
  284: { creature: ['atronach_frost'] },
  285: { creature: ['dremora'] },
  286: { creature: ['atronach_storm'] },
  287: { creature: ['bonewalker_greater', 'bonewalker'] },
  288: { creature: ['scamp'] },
  289: { creature: ['centurion_sphere'] },
  290: { creature: ['centurion_steam'] },
});

/** @type {Readonly<Record<number, { race?: string, sprite?: string }>>} */
export const DEX_PERSON_FOES = Object.freeze({
  258: { race: 'Argonian' },
  259: { race: 'Argonian' },
  386: { sprite: NO_RIDE },
  387: { sprite: NO_RIDE },
  392: { sprite: NO_RIDE },
  397: { sprite: NO_RIDE },
  398: { sprite: NO_RIDE },
});

const rowsOf = (table) => Object.entries(table).map(([t, row]) => /** @type {[number, any]} */ ([Number(t), row]));

let _installed = false;
export function installDexBodies() {
  if (_installed) return false;
  _installed = true;
  registerCreatureMatches(rowsOf(DEX_CREATURE_MATCH));
  registerPersonFoes(rowsOf(DEX_PERSON_FOES));
  return true;
}
export function _resetDexBodies() { _resetCreatureMatches(); _resetPersonFoes(); _installed = false; }
