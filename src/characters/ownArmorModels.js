import { ARMOR_MATERIAL, isPlate } from '../items/armorMaterials.js';

export const RRI_JERKIN_TEMPLATE = 520;

export const BRIGANDINE_METALS = Object.freeze(Object.keys(ARMOR_MATERIAL).filter((k) => isPlate(ARMOR_MATERIAL[k])));

export const CLASSIC_ARMOR_TEMPLATE = Object.freeze({
  Cuirass: 102, Gauntlets: 103, Greaves: 104, Left_Pauldron: 105, Right_Pauldron: 106, Helm: 107, Boots: 108,
});

export const STEEL_HELM_STYLES = Object.freeze(['closed', 'open']);
export const STEEL_HELM_DEFAULT = STEEL_HELM_STYLES[0];

const part = (p, model, hides = null) => Object.freeze({ part: p, model, ...(hides ? { hides: Object.freeze(hides) } : {}) });
const plate = (material) => (id, name, templateIndex, { parts, styles = null }) => Object.freeze({
  id, name, templateIndex, material, parts: Object.freeze(parts),
  ...(styles ? { styles: Object.freeze(styles) } : {}),
});
const steel = plate(ARMOR_MATERIAL.Steel);
const ebony = plate(ARMOR_MATERIAL.Ebony);

function steelPlate() {
  const helmClosed = Object.freeze([part('hair', 'steel_plate_helm_closed.nif', ['head'])]);
  const helmOpen = Object.freeze([part('hair', 'steel_plate_helm_open.nif')]);
  return [
    steel('daggerfall_steel_cuirass', 'Steel Cuirass', CLASSIC_ARMOR_TEMPLATE.Cuirass, {
      parts: [part('cuirass', 'steel_plate_cuirass.nif'), part('skirt', 'steel_plate_skirt.nif')],
    }),
    steel('daggerfall_steel_gauntlets', 'Steel Gauntlets', CLASSIC_ARMOR_TEMPLATE.Gauntlets, {
      parts: [
        part('right hand', 'steel_plate_gauntlet_right.nif', ['right wrist', 'right forearm']),
        part('left hand', 'steel_plate_gauntlet_left.nif', ['left wrist', 'left forearm']),
      ],
    }),
    steel('daggerfall_steel_greaves', 'Steel Greaves', CLASSIC_ARMOR_TEMPLATE.Greaves, {
      parts: [part('right upper leg', 'steel_plate_greave_right.nif'), part('left upper leg', 'steel_plate_greave_left.nif')],
    }),
    steel('daggerfall_steel_left_pauldron', 'Steel Left Pauldron', CLASSIC_ARMOR_TEMPLATE.Left_Pauldron, {
      parts: [part('left pauldron', 'steel_plate_pauldron_left.nif', ['left upper arm'])],
    }),
    steel('daggerfall_steel_right_pauldron', 'Steel Right Pauldron', CLASSIC_ARMOR_TEMPLATE.Right_Pauldron, {
      parts: [part('right pauldron', 'steel_plate_pauldron_right.nif', ['right upper arm'])],
    }),
    steel('daggerfall_steel_helm', 'Steel Helm', CLASSIC_ARMOR_TEMPLATE.Helm, {
      parts: helmClosed, styles: { closed: helmClosed, open: helmOpen },
    }),
    steel('daggerfall_steel_boots', 'Steel Boots', CLASSIC_ARMOR_TEMPLATE.Boots, {
      parts: [
        part('right foot', 'steel_plate_boot_right.nif', ['right ankle', 'right knee']),
        part('left foot', 'steel_plate_boot_left.nif', ['left ankle', 'left knee']),
      ],
    }),
  ];
}

const BRIGANDINE_SKIN_FROM = Object.freeze(['chest', 'groin', 'upperleg', 'knee']);
const brigandine = (metal) => Object.freeze({
  id: `daggerfall_brigandine_${metal.toLowerCase()}`,
  name: `${metal} Brigandine`,
  templateIndex: RRI_JERKIN_TEMPLATE,
  material: ARMOR_MATERIAL[metal],
  skinFrom: BRIGANDINE_SKIN_FROM,
  fitTo: 'chest',
  parts: Object.freeze([Object.freeze({ part: 'cuirass', model: `brigandine_${metal.toLowerCase()}.nif` })]),
});

function ebonyPlate() {
  return [
    ebony('daggerfall_ebony_cuirass', 'Ebony Cuirass', CLASSIC_ARMOR_TEMPLATE.Cuirass, {
      parts: [part('cuirass', 'ebony_plate_cuirass.nif'), part('skirt', 'ebony_plate_skirt.nif')],
    }),
    ebony('daggerfall_ebony_gauntlets', 'Ebony Gauntlets', CLASSIC_ARMOR_TEMPLATE.Gauntlets, {
      parts: [
        part('right hand', 'ebony_plate_gauntlet_right.nif', ['right wrist', 'right forearm']),
        part('left hand', 'ebony_plate_gauntlet_left.nif', ['left wrist', 'left forearm']),
      ],
    }),
    ebony('daggerfall_ebony_greaves', 'Ebony Greaves', CLASSIC_ARMOR_TEMPLATE.Greaves, {
      parts: [part('right upper leg', 'ebony_plate_greave_right.nif'), part('left upper leg', 'ebony_plate_greave_left.nif')],
    }),
    ebony('daggerfall_ebony_left_pauldron', 'Ebony Left Pauldron', CLASSIC_ARMOR_TEMPLATE.Left_Pauldron, {
      parts: [part('left pauldron', 'ebony_plate_pauldron_left.nif', ['left upper arm'])],
    }),
    ebony('daggerfall_ebony_right_pauldron', 'Ebony Right Pauldron', CLASSIC_ARMOR_TEMPLATE.Right_Pauldron, {
      parts: [part('right pauldron', 'ebony_plate_pauldron_right.nif', ['right upper arm'])],
    }),
    ebony('daggerfall_ebony_helm', 'Ebony Helm', CLASSIC_ARMOR_TEMPLATE.Helm, { parts: [part('hair', 'ebony_plate_helm.nif', ['head'])] }),
    ebony('daggerfall_ebony_boots', 'Ebony Boots', CLASSIC_ARMOR_TEMPLATE.Boots, {
      parts: [
        part('right foot', 'ebony_plate_boot_right.nif', ['right ankle', 'right knee']),
        part('left foot', 'ebony_plate_boot_left.nif', ['left ankle', 'left knee']),
      ],
    }),
  ];
}

export const OWN_MW_ARMOR = Object.freeze([
  ...BRIGANDINE_METALS.map(brigandine),
  ...steelPlate(),
  ...ebonyPlate(),
]);

export const ownArmorModelFor = (piece) =>
  (piece && OWN_MW_ARMOR.find((a) => a.templateIndex === piece.templateIndex && a.material === piece.material)) || null;

export const ownArmorParts = (own, { helmStyle = STEEL_HELM_DEFAULT } = {}) =>
  (own?.styles?.[helmStyle] ?? own?.parts ?? []);

export const ownArmorModelPaths = () =>
  [...new Set(OWN_MW_ARMOR.flatMap((a) => [a.parts, ...Object.values(a.styles ?? {})].flat().map((p) => `meshes/${p.model}`)))];
