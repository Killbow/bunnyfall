// Which enemy mods are loaded for the game, for leaves that cannot import an install:
// Daggerfall Enemy Expansion's switch and MUDEX's, which follows from DEX plus Meaner Monsters.

import { modSetting, modLatchedOn } from '../modSettings.js';

export const DEX_VENDOR = 'daggerfall-enemy-expansion';
export const MUDEX_VENDOR = 'mudex';

export const dexLoaded = () => modLatchedOn(DEX_VENDOR) ?? modSetting(DEX_VENDOR, 'Enabled') === true;

export const mudexLoaded = () => modLatchedOn(MUDEX_VENDOR) === true;

export const meanerMonstersAlone = (on) => !!on && modLatchedOn(DEX_VENDOR) !== true;
