// Wandering-villager designs as data for the neutral-body rig, with the ramps and builds they share.
export const RAMPS = Object.freeze({
  flesh:      [34, 44],
  rose:       [48, 58],
  bone:       [64, 72],
  slate:      [80, 92],
  indigo:     [96, 108],
  ash:        [112, 124],
  teal:       [128, 140],
  saffron:    [144, 156],
  moss:       [160, 172],
  terracotta: [182, 191],
  sage:       [192, 204],
  leather:    [70, 79],
  amber:      [224, 236],
  madder:     [240, 251],
});

export const BUILDS = Object.freeze({
  slight:  { chestScale: 0.94, shoulder: 0.95, height: 0.97 },
  average: { chestScale: 1.00, shoulder: 1.00, height: 1.00 },
  broad:   { chestScale: 1.09, shoulder: 1.10, height: 1.02 },
  stout:   { chestScale: 1.12, shoulder: 1.02, height: 0.95 },
  tall:    { chestScale: 0.98, shoulder: 1.02, height: 1.06 },
});

const B = 'body', AL = 'armL', AR = 'armR', LL = 'legL', LR = 'legR';
const torso   = (mat, yLo, yHi = 1.62, th = 0.008) => ({ groups: [B], yLo, yHi, th, mat });
const sleeves = (mat, yLo, yHi = 1.62, th = 0.008) => ({ groups: [AL, AR], yLo, yHi, th, mat, arm: true });
const legs    = (mat, yLo, yHi = 1.00, th = 0.008) => ({ groups: [LL, LR], yLo, yHi, th, mat, leg: true });
const pelvis  = (mat, yLo = 0.90, yHi = 1.14, th = 0.010) => ({ groups: [B], yLo, yHi, th, mat });
const feet    = (mat, yLo = 0.00, yHi = 0.16, th = 0.012) => ({ groups: [LL, LR], yLo, yHi, th, mat, leg: true });
const sash    = (mat, yLo = 1.06, yHi = 1.20, th = 0.014) => ({ groups: [B], yLo, yHi, th, mat });
const hood    = (mat, th = 0.022) => [
  { groups: ['head', B], yLo: 1.58, yHi: 2.06, th, mat, zHi: 0.03 },
  { groups: ['head'],    yLo: 1.93, yHi: 2.06, th, mat },
];
const collar  = (mat, yLo = 1.44, yHi = 1.60, th = 0.018) => ({ groups: [B, AL, AR], yLo, yHi, th, mat });

const flattenZones = (list) => list.map((d) => ({ ...d, zones: d.zones.flat() }));

export const VILLAGER_DESIGNS = Object.freeze(flattenZones([
  { archive: 381, race: 'Redguard', gender: 'male', name: 'Water carrier', build: 'broad',
    hair: { style: 'buzz', ramp: 'black' },
    zones: [torso('linen', 1.16), sash('sash'), pelvis('linen', 0.94, 1.16), feet('sandal', 0, 0.09)],
    mats: { linen: RAMPS.bone, sash: RAMPS.terracotta, sandal: RAMPS.leather } },
  { archive: 382, race: 'Redguard', gender: 'male', name: 'Kiln hand', build: 'broad',
    hair: { style: 'short', ramp: 'black' },
    zones: [pelvis('wrap', 0.90, 1.22, 0.020), legs('wrap', 0.74, 0.96), feet('sandal', 0, 0.09)],
    mats: { wrap: RAMPS.ash, sandal: RAMPS.leather } },
  { archive: 383, race: 'Redguard', gender: 'male', name: 'Spice seller', build: 'average',
    hair: { style: 'medium', ramp: 'black' },
    zones: [torso('robe', 1.04), sleeves('robe', 1.30), sash('sash'), feet('sandal', 0, 0.09)],
    drape: { name: 'Plain Robes', mat: 'robe' },
    mats: { robe: RAMPS.teal, sash: RAMPS.saffron, sandal: RAMPS.leather } },
  { archive: 384, race: 'Redguard', gender: 'male', name: 'Caravan master', build: 'tall',
    hair: { style: 'ponytail', ramp: 'black' },
    zones: [collar('coat'), torso('coat', 1.10), sleeves('coat', 1.22), sash('sash'), feet('boot', 0, 0.20)],
    drape: { name: 'Anticlere Surcoat', mat: 'coat' },
    mats: { coat: RAMPS.indigo, sash: RAMPS.amber, boot: RAMPS.leather } },

  { archive: 395, race: 'Redguard', gender: 'female', name: 'Well keeper', build: 'average',
    hair: { style: 'long', ramp: 'black' },
    zones: [torso('shift', 1.20), sash('sash'), feet('sandal', 0, 0.09)],
    drape: { name: 'Long Skirt', mat: 'shift' },
    mats: { shift: RAMPS.bone, sash: RAMPS.madder, sandal: RAMPS.leather } },
  { archive: 396, race: 'Redguard', gender: 'female', name: 'Dyer', build: 'slight',
    hair: { style: 'topknot', ramp: 'black' },
    zones: [torso('shift', 1.16), sleeves('shift', 1.34), sash('sash'), feet('sandal', 0, 0.09)],
    drape: { name: 'Long Skirt', mat: 'overskirt' },
    mats: { shift: RAMPS.saffron, overskirt: RAMPS.terracotta, sash: RAMPS.teal, sandal: RAMPS.leather } },
  { archive: 397, race: 'Redguard', gender: 'female', name: 'Herbalist', build: 'average',
    hair: { style: 'medium', ramp: 'black' },
    zones: [hood('veil'), torso('shift', 1.12), sleeves('shift', 1.26), feet('sandal', 0, 0.09)],
    drape: { name: 'Long Skirt', mat: 'shift' },
    mats: { veil: RAMPS.sage, shift: RAMPS.moss, sandal: RAMPS.leather } },
  { archive: 398, race: 'Redguard', gender: 'female', name: 'Silk factor', build: 'tall',
    hair: { style: 'long', ramp: 'black' },
    zones: [hood('veil'), collar('gown'), torso('gown', 1.10), sleeves('gown', 1.20), sash('sash'), feet('slipper', 0, 0.08)],
    drape: { name: 'Casual Dress', mat: 'gown' },
    mats: { veil: RAMPS.indigo, gown: RAMPS.indigo, sash: RAMPS.amber, slipper: RAMPS.rose } },

  { archive: 387, race: 'Nord', gender: 'male', name: 'Woodcutter', build: 'broad',
    hair: { style: 'medium', ramp: 'blonde' },
    zones: [torso('wool', 1.14), sleeves('wool', 1.30), legs('trews', 0.30), feet('boot', 0, 0.26)],
    mats: { wool: RAMPS.moss, trews: RAMPS.leather, boot: RAMPS.leather } },
  { archive: 388, race: 'Nord', gender: 'male', name: 'Fisher', build: 'stout',
    hair: { style: 'short', ramp: 'brown' },
    zones: [hood('hood'), torso('wool', 1.10), sleeves('wool', 1.24), legs('trews', 0.26), feet('boot', 0, 0.30)],
    mats: { hood: RAMPS.slate, wool: RAMPS.terracotta, trews: RAMPS.ash, boot: RAMPS.leather } },
  { archive: 389, race: 'Nord', gender: 'male', name: 'Smith', build: 'broad',
    hair: { style: 'topknot', ramp: 'brown' },
    zones: [torso('jerkin', 1.16, 1.56, 0.016), sleeves('wool', 1.36), pelvis('apron', 0.86, 1.18, 0.022), legs('trews', 0.30), feet('boot', 0, 0.24)],
    mats: { jerkin: RAMPS.leather, wool: RAMPS.teal, apron: RAMPS.leather, trews: RAMPS.slate, boot: RAMPS.leather } },
  { archive: 390, race: 'Nord', gender: 'male', name: 'Timber factor', build: 'tall',
    hair: { style: 'ponytail', ramp: 'blonde' },
    zones: [collar('coat'), torso('coat', 1.08), sleeves('coat', 1.22), legs('trews', 0.30), feet('boot', 0, 0.28)],
    drape: { name: 'Anticlere Surcoat', mat: 'coat' },
    mats: { coat: RAMPS.moss, trews: RAMPS.ash, boot: RAMPS.leather } },

  { archive: 392, race: 'Nord', gender: 'female', name: 'Brewer', build: 'stout',
    hair: { style: 'long', ramp: 'blonde' },
    zones: [torso('wool', 1.18), sleeves('wool', 1.32), pelvis('apron', 0.88, 1.16, 0.020), feet('boot', 0, 0.20)],
    drape: { name: 'Long Skirt', mat: 'wool' },
    mats: { wool: RAMPS.slate, apron: RAMPS.bone, boot: RAMPS.leather } },
  { archive: 393, race: 'Nord', gender: 'female', name: 'Netmender', build: 'average',
    hair: { style: 'ponytail', ramp: 'brown' },
    zones: [hood('hood'), torso('wool', 1.14), sleeves('wool', 1.28), feet('boot', 0, 0.22)],
    drape: { name: 'Long Skirt', mat: 'wool' },
    mats: { hood: RAMPS.teal, wool: RAMPS.teal, boot: RAMPS.leather } },
  { archive: 451, race: 'Nord', gender: 'female', name: 'Shepherd', build: 'average',
    hair: { style: 'medium', ramp: 'blonde' },
    zones: [hood('shawl'), torso('wool', 1.12), sleeves('wool', 1.26), feet('boot', 0, 0.26)],
    drape: { name: 'Long Skirt', mat: 'wool' },
    mats: { shawl: RAMPS.moss, wool: RAMPS.sage, boot: RAMPS.leather } },
  { archive: 452, race: 'Nord', gender: 'female', name: 'Hall matron', build: 'tall',
    hair: { style: 'long', ramp: 'blonde' },
    zones: [hood('shawl'), collar('gown'), torso('gown', 1.06), sleeves('gown', 1.18), sash('sash'), feet('boot', 0, 0.18)],
    drape: { name: 'Casual Dress', mat: 'gown' },
    mats: { shawl: RAMPS.ash, gown: RAMPS.slate, sash: RAMPS.madder, boot: RAMPS.leather } },

  { archive: 385, race: 'Breton', gender: 'male', name: 'Carter', build: 'average',
    hair: { style: 'short', ramp: 'brown' },
    zones: [torso('wool', 1.16), sleeves('wool', 1.30), legs('hose', 0.28), feet('shoe', 0, 0.12)],
    mats: { wool: RAMPS.terracotta, hose: RAMPS.ash, shoe: RAMPS.leather } },
  { archive: 386, race: 'Breton', gender: 'male', name: 'Cooper', build: 'stout',
    hair: { style: 'medium', ramp: 'brown' },
    zones: [torso('doublet', 1.12, 1.58, 0.014), sleeves('wool', 1.32), pelvis('apron', 0.88, 1.18, 0.020), legs('hose', 0.28), feet('shoe', 0, 0.12)],
    mats: { doublet: RAMPS.teal, wool: RAMPS.bone, apron: RAMPS.leather, hose: RAMPS.slate, shoe: RAMPS.leather } },
  { archive: 391, race: 'Breton', gender: 'male', name: 'Clerk', build: 'slight',
    hair: { style: 'short', ramp: 'blonde' },
    zones: [collar('gown'), torso('gown', 1.06), sleeves('gown', 1.16), feet('shoe', 0, 0.12)],
    drape: { name: 'Plain Robes', mat: 'gown' },
    mats: { gown: RAMPS.indigo, shoe: RAMPS.leather } },
  { archive: 394, race: 'Breton', gender: 'male', name: 'Guildmaster', build: 'broad',
    hair: { style: 'medium', ramp: 'brown' },
    zones: [hood('chaperon'), collar('coat'), torso('coat', 1.04), sleeves('coat', 1.14), sash('chain'), feet('shoe', 0, 0.14)],
    drape: { name: 'Dwynnen Surcoat', mat: 'coat' },
    mats: { chaperon: RAMPS.madder, coat: RAMPS.madder, chain: RAMPS.saffron, shoe: RAMPS.leather } },

  { archive: 453, race: 'Breton', gender: 'female', name: 'Baker', build: 'stout',
    hair: { style: 'topknot', ramp: 'blonde' },
    zones: [torso('kirtle', 1.16), sleeves('kirtle', 1.30), pelvis('apron', 0.86, 1.16, 0.020), feet('shoe', 0, 0.12)],
    drape: { name: 'Long Skirt', mat: 'kirtle' },
    mats: { kirtle: RAMPS.amber, apron: RAMPS.bone, shoe: RAMPS.leather } },
  { archive: 454, race: 'Breton', gender: 'female', name: 'Seamstress', build: 'slight',
    hair: { style: 'medium', ramp: 'blonde' },
    zones: [torso('bodice', 1.18, 1.56, 0.014), sleeves('shift', 1.28), feet('shoe', 0, 0.12)],
    drape: { name: 'Long Skirt', mat: 'kirtle' },
    mats: { bodice: RAMPS.madder, shift: RAMPS.bone, kirtle: RAMPS.indigo, shoe: RAMPS.leather } },
  { archive: 455, race: 'Breton', gender: 'female', name: 'Almswoman', build: 'average',
    hair: { style: 'long', ramp: 'brown' },
    zones: [hood('coif'), torso('kirtle', 1.12), sleeves('kirtle', 1.26), feet('shoe', 0, 0.12)],
    drape: { name: 'Long Skirt', mat: 'kirtle' },
    mats: { coif: RAMPS.terracotta, kirtle: RAMPS.terracotta, shoe: RAMPS.leather } },
  { archive: 456, race: 'Breton', gender: 'female', name: 'Merchant wife', build: 'tall',
    hair: { style: 'long', ramp: 'blonde' },
    zones: [collar('gown'), torso('gown', 1.04), sleeves('shift', 1.14), sash('sash'), feet('slipper', 0, 0.08)],
    drape: { name: 'Casual Dress', mat: 'gown' },
    mats: { gown: RAMPS.rose, shift: RAMPS.ash, sash: RAMPS.saffron, slipper: RAMPS.rose } },

  { archive: 399, race: 'Guard', gender: 'any', name: 'City watch', build: 'broad',
    hair: { style: 'buzz', ramp: 'brown' },
    zones: [torso('gambeson', 1.06), sleeves('gambeson', 1.20), legs('gambeson', 0.24), feet('boot', 0, 0.26)],
    armor: [
      { groups: [B], yLo: 1.14, yHi: 1.58, th: 0.026, mat: 'steel' },
      { groups: [AL, AR], yLo: 1.16, yHi: 1.50, th: 0.022, mat: 'steel', arm: true },
      { groups: [LL, LR], yLo: 0.30, yHi: 0.96, th: 0.022, mat: 'steel', leg: true },
      { groups: ['head'], yLo: 1.60, yHi: 1.96, th: 0.024, mat: 'steel' },
    ],
    mats: { gambeson: RAMPS.ash, boot: RAMPS.leather, steel: RAMPS.slate } },
]));

export const RACE_TONE = Object.freeze({
  Redguard: 'Deep', Nord: 'Pale', Breton: 'Fair',
  Guard: 'Tan',
});

export function designForArchive(archive) {
  return VILLAGER_DESIGNS.find((d) => d.archive === archive) ?? null;
}

export function designOpts(design, pal) {
  const ramp = ([a, b]) => {
    const out = [];
    for (let i = b; i >= a; i--) { const c = pal.get(i); out.push([c.r, c.g, c.b]); }
    return out;
  };
  const mats = {};
  for (const [name, span] of Object.entries(design.mats)) mats[name] = ramp(span);
  return { clothZones: design.zones, armorZones: design.armor ?? [], mats };
}

export function designDrape(design, pal) {
  if (!design.drape) return null;
  const span = design.mats[design.drape.mat];
  if (!span) return null;
  const ramp = [];
  for (let i = span[1]; i >= span[0]; i--) { const c = pal.get(i); ramp.push([c.r, c.g, c.b]); }
  return { name: design.drape.name, ramp };
}

export function villagerDelta(baseFaces, villagerFaces) {
  const idx = [], P = [], C = [];
  for (let i = 0; i < villagerFaces.length; i++) {
    const a = villagerFaces[i], b = baseFaces[i];
    let moved = false;
    for (let k = 0; k < 12; k++) if (Math.abs(a.p[k] - b.p[k]) > 1e-6) { moved = true; break; }
    const recoloured = a.c[0] !== b.c[0] || a.c[1] !== b.c[1] || a.c[2] !== b.c[2];
    if (!moved && !recoloured) continue;
    idx.push(i);
    for (let k = 0; k < 12; k++) P.push(Math.round(a.p[k] * 1000));
    C.push(a.c[0], a.c[1], a.c[2]);
  }
  return { idx, P, C };
}
