import { templateByIndex, ITEM_TEMPLATES } from '../items/itemTemplates.js';

export const EQUIP_SLOTS = Object.freeze({
  None: -1,
  Amulet0: 0, Amulet1: 1,
  Bracelet0: 2, Bracelet1: 3,
  Ring0: 4, Ring1: 5,
  Bracer0: 6, Bracer1: 7,
  Mark0: 8, Mark1: 9,
  Crystal0: 10, Crystal1: 11,
  Head: 12,
  RightArm: 13,
  Cloak1: 14,
  LeftArm: 15,
  Cloak2: 16,
  ChestClothes: 17,
  ChestArmor: 18,
  RightHand: 19,
  Gloves: 20,
  LeftHand: 21,
  Unknown1: 22,
  LegsArmor: 23,
  LegsClothes: 24,
  Unknown2: 25,
  Feet: 26,
});

export { ITEM_TEMPLATES };

export const getTemplate = (index) => templateByIndex(index) ?? undefined;

export function paperdollOrder(items) {
  return [...items].sort((a, b) => a.drawOrder - b.drawOrder);
}
