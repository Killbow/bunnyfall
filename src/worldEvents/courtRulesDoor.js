// @ts-check
// The account server bundles `courtRules.js` through `itemLaw.js`, so this file wires the hurt listener to keep
// `playerEntity.js` out of that bundle.
import { registerPlayerHurtListener } from '../characters/playerEntity.js';
import { courtRulesHurt } from './courtRules.js';

registerPlayerHurtListener('court-rules', (_e, hurt) => courtRulesHurt(hurt));
