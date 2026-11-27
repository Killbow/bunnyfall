// @ts-check
import { liveVampirism, cureVampirism } from './vampirism.js';
import { liveLycanthropy, cureLycanthropy } from './lycanthropy.js';
import { liveInfections } from './infection.js';
import { totalGoldAmount, deductGold } from '../justice/court.js';

export const HEAL_CURSE_BASE = 12000;
export const HEAL_CURSE_ROW = 'Heal Curse';
export const HEAL_CURSE_KEY = 'KeyH';

export function curseOf(entity) {
  const blood = liveInfections(entity).filter((e) => /vamp|lycan|were/i.test(String(e.key ?? e.infection ?? '')));
  return { vampire: !!liveVampirism(entity), were: !!liveLycanthropy(entity), blood: blood.length };
}
export const bearsCurse = (entity) => { const c = curseOf(entity); return c.vampire || c.were || c.blood > 0; };

export function healCursePrice({ priceAdjustment = 1000, quality = 10 } = {}) {
  const q = Math.max(0, Math.min(20, quality | 0));
  return Math.max(1, Math.round(HEAL_CURSE_BASE * (priceAdjustment / 1000) * (1.1 - q * 0.01)));
}

export function healCurseOffer(entity, deps = {}) {
  const curse = curseOf(entity);
  if (!curse.vampire && !curse.were && !curse.blood) return { kind: 'none' };
  return { kind: 'offer', cost: healCursePrice(deps), curse };
}

export function healCurseLift(entity, { nowMinutes = 0, advanceMinutes = null, refreshHead = null } = {}) {
  const went = { vampire: false, were: false, blood: 0 };
  for (const e of liveInfections(entity)) {
    if (!/vamp|lycan|were/i.test(String(e.key ?? e.infection ?? ''))) continue;
    e.ended = true;
    went.blood += 1;
  }
  if (went.blood) entity.timeToBecomeVampireOrWerebeast = 0;
  went.were = cureLycanthropy(entity, { nowMinutes, advanceMinutes, refreshHead });
  went.vampire = cureVampirism(entity, { advanceMinutes });
  return went;
}

export function healCursePaid(entity, deps = {}) {
  const offer = healCurseOffer(entity, deps);
  if (offer.kind !== 'offer') return { kind: 'none' };
  if (totalGoldAmount(entity) < offer.cost) return { kind: 'notEnoughGold', cost: offer.cost };
  deductGold(entity, offer.cost);
  return { kind: 'lifted', cost: offer.cost, went: healCurseLift(entity, deps) };
}

export const healCurseText = Object.freeze({
  none: 'You bear no curse that the Divines need lift.',
  offer: (cost, c) => [
    `${c.vampire ? 'The blood-hunger of the vampire' : c.were ? 'The beast within you' : 'A curse in your blood'} can be lifted here.`,
    'Every gift and every weakness it gave you will go with it.',
    `The rite costs ${cost.toLocaleString('en-US')} gold. Will you have it done?`,
  ],
  poor: (cost) => `The rite costs ${cost.toLocaleString('en-US')} gold, more than you carry.`,
  lifted: 'The priests chant over you through the long hours. When it is done, the curse is gone.',
});
