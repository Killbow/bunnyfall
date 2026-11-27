// Builds the paperdoll payload from readers that are already loaded; it never touches the filesystem.
// The payload is rendered game data and must not be committed or bundled.

import { buildNeutralBody, WRIST_JUNCTION_Y, ARM_X, NECK_PIVOT_Y } from './neutralBody.js';
import { ATTACKS_1H, ATTACKS_2H, ATTACKS_RANGED, ATTACKS_FP, REACTIONS, DIRECTION_TO_STRIKE, STRIKES } from './anims.js';
import { STEEL_RAMP } from './pieces/cuirass.js';
import { CLOTH_RAMP } from './pieces/pieceLoft.js';
import { buildHair, HAIR_RAMPS } from './pieces/hair.js';
import { buildPauldrons } from './pieces/pauldrons.js';
import { buildHelm } from './pieces/helm.js';
import { buildTail } from './pieces/tail.js';
import { buildBodyScales, buildBodyFur, KHAJIIT_FUR, KHAJIIT_BELLY, ARGONIAN_HIDE } from './pieces/bodyScales.js';
import { PALETTES } from './palettes.js';
import { drapedPiece, drapedGrid, DRAPED_NAMES, BODY_CORE, DRAPE_MATERIAL } from './pieces/draped.js';
import { POSES } from './poses.js';
import { buildSword } from './pieces/sword.js';
import { WEAPON_MATERIALS, weaponMaterialRamp, buildWeapon, WEAPONS } from './weapons.js';
import { buildClaymore } from './pieces/claymore.js';
import { buildLongBow, buildShortBow, buildNockedArrow } from './pieces/bow.js';
import { buildBladeWeapon, BLADE_SPECS } from './pieces/blades.js';
import { buildHaftedWeapon, HAFTED_SPECS } from './pieces/hafted.js';
import { VILLAGER_DESIGNS, designOpts, designDrape, villagerDelta, RACE_TONE } from './villagerDesigns.js';
import { ORC_DESIGNS, orcOpts } from './orcBody.js';
import { UNDEAD_DESIGNS, undeadOpts } from './undeadBody.js';
import { CLASS_DESIGNS, classOpts } from './humanClasses.js';
import { ATRONACH_DESIGNS, atronachOpts } from './atronachs.js';
import { BEAST_DESIGNS, beastOpts, ALL_GROUPS } from './beasts.js';
import { ENEMY_BASICS } from './enemyBasics.js';
import { buildBeastBody, buildBeastTail } from './pieces/beastBody.js';
import { buildBeastHead, buildHorns } from './pieces/beastHead.js';
import { buildArachnid, buildSting } from './pieces/arachnid.js';
import { buildWings } from './pieces/wings.js';
import { buildFishBody } from './pieces/fishBody.js';
import { DAEDRA_DESIGNS, daedraOpts } from './daedra.js';
import { buildRibcage, buildPelvis, BONE_RAMP } from './pieces/skeletonBones.js';
import { buildHorseBody, BAY_RAMP } from './pieces/centaurBody.js';
import { buildTusks, buildBrow, IVORY_RAMP } from './pieces/orcHead.js';

const OUR_BOOT = [
  [34, 26, 20],
  [56, 42, 32],
  [78, 60, 46],
  [100, 78, 60],
  [122, 96, 74],
];

const BLOCKS = [
  [200, 200, 200],
  [186, 176, 160],
  [178, 132, 84],
  [214, 158, 170],
  [206, 176, 128],
  [150, 148, 172],
  [120, 160, 214],
  [236, 236, 232],
  [140, 200, 200],
  [206, 194, 96],
  [150, 196, 120],
  [176, 108, 66],
  [190, 202, 110],
  [170, 150, 200],
  [236, 206, 140],
  [222, 108, 66],
];

function ourPalette() {
  return {
    get(i) {
      const idx = Math.max(0, Math.min(255, i | 0));
      const [r, g, b] = BLOCKS[(idx >> 4) & 15];
      const k = 1 - (idx & 15) / 15;
      const f = 0.24 + k * 0.86;
      return {
        r: Math.min(255, Math.round(r * f)),
        g: Math.min(255, Math.round(g * f)),
        b: Math.min(255, Math.round(b * f)),
      };
    },
  };
}

/**
 * @param {object|null} pal
 * @param {object|null} img
 * @param {object|null} cif
 */
export function buildPaperdollPayload(pal, img, cif) {
  const haveData = !!(pal && img);
  if (!pal) pal = ourPalette();
  const { width: W, data } = haveData ? img.getDFBitmap() : { width: 0, data: [] };
  const lum = (i) => { const c = pal.get(i); return 0.299*c.r + 0.587*c.g + 0.114*c.b; };
  const rampOf = (r0, r1, keep) => { const m = new Map(); for (let y=r0;y<=r1;y++) for (let x=0;x<W;x++){ const i=data[y*W+x]; if(i&&(!keep||keep(x,y))) m.set(i,lum(i)); } return [...m.entries()].sort((a,b)=>a[1]-b[1]).map(e=>{const c=pal.get(e[0]);return [c.r,c.g,c.b];}); };
  const ramps = haveData
    ? { skin: rampOf(40, 60, (x) => Math.abs(x - 34) < 14), boot: rampOf(132, 144) }
    : { skin: PALETTES.human[1].ramp, boot: OUR_BOOT };
  let faceSet = null;
  if (cif) {
    faceSet = [];
    for (let r = 0; r < 10; r++) {
      try {
        const b = cif.getDFBitmap(r, 0);
        const rgb = [];
        for (let i2 = 0; i2 < b.data.length; i2++) {
          const idx = b.data[i2];
          if (idx) { const c = pal.get(idx); rgb.push(c.r, c.g, c.b, 255); } else rgb.push(0, 0, 0, 0);
        }
        faceSet.push({ w: b.width, h: b.height, rgba: rgb });
      } catch { break; }
    }
    if (!faceSet.length) faceSet = null;
  }

  const faces = buildNeutralBody(ramps);

  const drapeRowsOf = (name) => {
    const g = drapedGrid(name);
    if (!g) return null;
    const rows = [];
    for (let r = 0; r < g.rows; r++) {
      let y = 0, rx = 0, rz = 0;
      for (let c = 0; c < g.cols; c++) {
        const i = (r * g.cols + c) * 3;
        y = g.pos[i + 1];
        rx = Math.max(rx, Math.abs(g.pos[i]));
        rz = Math.max(rz, Math.abs(g.pos[i + 2]));
      }
      if (rx > 1e-6 && rz > 1e-6) rows.push({ y, rx, rz });
    }
    return rows;
  };

  const measureDrapeFit = (bodyFaces, drapeName) => {
    const rows = drapeRowsOf(drapeName);
    if (!rows || !rows.length) return null;
    const BAND = 0.05;
    const MARGIN = 1.05;
    const per = rows.map((r) => {
      let worst = 0;
      for (const f of bodyFaces) {
        if (f.g !== 'body') continue;
        for (let i = 0; i < 4; i++) {
          if (Math.abs(f.p[i * 3 + 1] - r.y) > BAND) continue;
          const nx = Math.abs(f.p[i * 3]) / r.rx;
          const nz = Math.abs(f.p[i * 3 + 2]) / r.rz;
          const need = Math.hypot(nx, nz);
          if (need > worst) worst = need;
        }
      }
      return Math.max(1, worst * MARGIN);
    });
    for (let pass = 0; pass < 2; pass++) {
      const src = per.slice();
      for (let i = 0; i < per.length; i++) {
        const a = src[Math.max(0, i - 1)];
        const b = src[i];
        const c = src[Math.min(src.length - 1, i + 1)];
        per[i] = Math.max(b, (a + b + c) / 3);
      }
    }
    return per;
  };

  const withFit = (drape, bodyFaces) =>
    drape ? { ...drape, fit: measureDrapeFit(bodyFaces, drape.name) } : null;

  let minY = 1e9, maxY = -1e9;
  for (const f of faces) for (let i=0;i<4;i++){ const y=f.p[i*3+1]; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  const GI = { body:0, head:1, armL:2, armR:3, legL:4, legR:5 };
  const packPiece = (pf) => { const pP=[], pN=[], pC=[], pG=[], pI=[]; for (const f of pf) { for (let i=0;i<4;i++) pP.push(Math.round(f.p[i*3]*1000), Math.round(f.p[i*3+1]*1000), Math.round(f.p[i*3+2]*1000)); pN.push(Math.round(f.n[0]*127), Math.round(f.n[1]*127), Math.round(f.n[2]*127)); pC.push(f.c[0], f.c[1], f.c[2]); pI.push(Math.round((f._i ?? 0.6) * 255)); pG.push(GI[f.g] ?? 0); } return { P: pP, N: pN, C: pC, G: pG, I: pI }; };
  const { P, N, C, G, I: Ib } = packPiece(faces);
  const villagerPacks = VILLAGER_DESIGNS.map((d) => {
    const vf = buildNeutralBody(ramps, designOpts(d, pal));
    return {
      archive: d.archive, race: d.race, gender: d.gender, name: d.name, build: d.build,
      tone: RACE_TONE[d.race],
      hair: d.hair,
      drape: withFit(designDrape(d, pal), vf),
      ...villagerDelta(faces, vf),
    };
  });

  const HAIR_RACES = ['Human', 'Elf'];
  const HAIR_STYLES = ['short', 'buzz', 'medium', 'long', 'ponytail', 'topknot', 'mohawk'];
  const hairPacks = {};
  for (const R of HAIR_RACES) {
    hairPacks[R] = {};
    for (const st of HAIR_STYLES) hairPacks[R][st] = packPiece(buildHair(HAIR_RAMPS.brown, R, ramps.skin, st));
  }

  const orcPacks = ORC_DESIGNS.map((d) => {
    const { ramps: oramps, opts, hide } = orcOpts(d, pal);
    const of = buildNeutralBody(oramps, opts);
    return {
      id: d.id, name: d.name, level: d.level, damage: d.damage, weaponTier: d.weaponTier,
      build: d.build, hide,
      tusks: packPiece(buildTusks(IVORY_RAMP, { jaw: d.build.jaw, size: d.tusk.size })),
      brow: packPiece(buildBrow(hide, { skull: d.build.skull, jut: d.brow.jut })),
      ...villagerDelta(faces, of),
    };
  });

  const collapseGroups = (fs, groups, at) => {
    for (const f of fs) {
      if (!groups.includes(f.g)) continue;
      for (let i = 0; i < f.p.length; i += 3) {
        f.p[i] = at[0];
        f.p[i + 1] = at[1];
        f.p[i + 2] = at[2];
      }
    }
    return fs;
  };

  const undeadPacks = UNDEAD_DESIGNS.map((d) => {
    const { ramps: uramps, opts, hide, drape } = undeadOpts(d, pal);
    let uf = buildNeutralBody(uramps, opts);
    if (d.collapse) uf = collapseGroups(uf, d.collapse, [0, 0.8, -0.2]);
    return {
      id: d.id, name: d.name, level: d.level, damage: d.damage, weaponTier: d.weaponTier,
      build: d.build, zones: d.zones, hide, spectral: d.spectral || null,
      ribcage: d.bones ? packPiece(buildRibcage(BONE_RAMP, { torso: d.build.torso, ...d.bones })) : null,
      pelvis: d.bones ? packPiece(buildPelvis(BONE_RAMP, { torso: d.build.torso })) : null,
      horse: d.horse ? packPiece(buildHorseBody(BAY_RAMP, d.horse)) : null,
      drape: withFit(drape, uf),
      ...villagerDelta(faces, uf),
    };
  });

  const classPacks = CLASS_DESIGNS.map((d) => {
    const { ramps: cramps, opts, hide, drape } = classOpts(d, pal);
    const cf = buildNeutralBody(cramps, opts);
    return {
      id: d.id, name: d.name, level: d.level, damage: d.damage, weaponTier: d.weaponTier,
      build: d.build, zones: d.zones, hide, drape: withFit(drape, cf),
      ...villagerDelta(faces, cf),
    };
  });

  const atronachPacks = ATRONACH_DESIGNS.map((d) => {
    const { ramps: aramps, opts, hide } = atronachOpts(d, pal);
    const af = buildNeutralBody(aramps, opts);
    return {
      id: d.id, name: d.name, level: d.level, damage: d.damage, weaponTier: d.weaponTier,
      build: d.build, zones: d.zones, hide, spectral: d.spectral || null,
      ...villagerDelta(faces, af),
    };
  });

  const beastPacks = BEAST_DESIGNS.map((d) => {
    const { ramps: bramps, opts, hide, pelt, drape } = beastOpts(d, pal);
    let bf = buildNeutralBody(bramps, opts);
    bf = collapseGroups(bf, d.collapse || ALL_GROUPS, [0, 1.5, 0]);
    return {
      id: d.id, name: d.name, level: d.level, damage: d.damage, weaponTier: d.weaponTier,
      build: d.build || {}, zones: d.zones || [], hide,
      attack: d.attack || null,
      attackFrames: (ENEMY_BASICS[d.id] || {}).primaryAttackAnimFrames || null,
      beast: d.beast ? packPiece(buildBeastBody(pelt, d.beast)) : null,
      beastHead: d.beastHead ? packPiece(buildBeastHead(pelt, d.beastHead)) : null,
      arachnid: d.arachnid ? packPiece(buildArachnid(pelt, d.arachnid)) : null,
      sting:
        d.arachnid && d.arachnid.sting
          ? [0, 0.25, 0.5, 0.75, 1].map((k) =>
              packPiece(buildSting(pelt, { ...d.arachnid, strike: k })),
            )
          : null,
      wings: d.wings ? packPiece(buildWings(pelt, d.wings)) : null,
      fish: d.fish ? packPiece(buildFishBody(pelt, d.fish)) : null,
      claws: d.claws ? packPiece(buildArachnid(pelt, d.claws)) : null,
      horns: d.horns ? packPiece(buildHorns(pelt, d.horns)) : null,
      drape: withFit(drape, bf),
      beastTail: d.tail ? packPiece(buildBeastTail(pelt, d.tail)) : null,
      ...villagerDelta(faces, bf),
    };
  });

  const daedraPacks = DAEDRA_DESIGNS.map((d) => {
    const { ramps: dramps, opts, hide, drape } = daedraOpts(d, pal);
    let df = buildNeutralBody(dramps, opts);
    if (d.collapse) df = collapseGroups(df, d.collapse, [0, 1.5, 0]);
    return {
      id: d.id, name: d.name, level: d.level, damage: d.damage, weaponTier: d.weaponTier,
      build: d.build, zones: d.zones, hide, drape: withFit(drape, df), spectral: d.spectral || null,
      beastHead: d.beastHead ? packPiece(buildBeastHead(hide, d.beastHead)) : null,
      beastTail: d.tail ? packPiece(buildBeastTail(hide, d.tail)) : null,
      horns: d.horns ? packPiece(buildHorns(hide, d.horns)) : null,
      ...villagerDelta(faces, df),
    };
  });

  const colorsOf = (fs) => { const c=[]; for (const f of fs) c.push(f.c[0], f.c[1], f.c[2]); return c; };
  const Ck = colorsOf(buildNeutralBody({ skin: KHAJIIT_FUR, boot: ramps.boot }));
  const Ca = colorsOf(buildNeutralBody({ skin: ARGONIAN_HIDE, boot: ramps.boot }));
  const drapeGridsOut = {}, drapedPacks = {};
  for (const nm of DRAPED_NAMES) { const g = drapedGrid(nm);
    if (g) drapeGridsOut[nm] = { rows: g.rows, cols: g.cols, wrap: g.wrap, pos: Array.from(g.pos), faces: g.faces };
    else drapedPacks[nm] = packPiece(drapedPiece(nm, CLOTH_RAMP)); }
  const payload = ({ n: faces.length, Ck, Ca, Ib, PALETTES, draped: drapedPacks, drapeGrids: drapeGridsOut, drapeMaterials: DRAPE_MATERIAL, bodyCore: BODY_CORE, poses: POSES, wristY: WRIST_JUNCTION_Y * 0.9, armX: ARM_X, neckY: NECK_PIVOT_Y * 0.9, attacks: ATTACKS_1H, attacks2H: ATTACKS_2H, attacksRanged: ATTACKS_RANGED, attacksFP: ATTACKS_FP, reactions: REACTIONS, strikes: STRIKES, dirToStrike: DIRECTION_TO_STRIKE,
    faceSet,
    hair: hairPacks, hairRamps: HAIR_RAMPS,
    tail: packPiece(buildTail(ARGONIAN_HIDE, 'argonian')),
    tailCat: packPiece(buildTail(KHAJIIT_FUR, 'khajiit')),
    arrow: packPiece(buildNockedArrow(weaponMaterialRamp(WEAPON_MATERIALS.Steel, (i) => pal.get(i)))),
    weaponPacks: (() => {
      const steel = weaponMaterialRamp(WEAPON_MATERIALS.Steel, (i) => pal.get(i));
      const items = (id) => Object.fromEntries(Object.entries(WEAPON_MATERIALS).filter(([, v]) => v >= 0).map(([n, v]) => [n, buildWeapon(id, v)]));
      const list = [
        { name: 'Longsword', hands: '1h', pack: packPiece(buildSword(steel)), items: items(WEAPONS.Longsword) },
        { name: 'Claymore', hands: '2h', pack: packPiece(buildClaymore(steel)), items: items(WEAPONS.Claymore) },
        { name: 'Long Bow', hands: 'bow', pack: packPiece(buildLongBow(steel)), items: items(WEAPONS.Long_Bow) },
        { name: 'Short Bow', hands: 'bow', pack: packPiece(buildShortBow(steel)), items: items(WEAPONS.Short_Bow) },
      ];
      for (const nm of Object.keys(BLADE_SPECS)) {
        list.push({ name: nm.replace('_', '-'), hands: BLADE_SPECS[nm].twoHand ? '2h' : '1h', pack: packPiece(buildBladeWeapon(steel, nm)), items: items(WEAPONS[nm]) });
      }
      for (const nm of Object.keys(HAFTED_SPECS)) {
        list.push({ name: nm.replace('_', ' '), hands: HAFTED_SPECS[nm].twoHand ? '2h' : '1h', pack: packPiece(buildHaftedWeapon(steel, nm)), items: items(WEAPONS[nm]) });
      }
      return list;
    })(),
    swordRamps: Object.fromEntries(Object.entries(WEAPON_MATERIALS).filter(([, v]) => v >= 0).map(([n, v]) => [n, weaponMaterialRamp(v, (i) => pal.get(i))])),
    swordItems: Object.fromEntries(Object.entries(WEAPON_MATERIALS).filter(([, v]) => v >= 0).map(([n, v]) => [n, buildWeapon(WEAPONS.Longsword, v)])), cloth: CLOTH_RAMP, drapedNames: DRAPED_NAMES, villagers: villagerPacks, orcs: orcPacks, undead: undeadPacks, classes: classPacks, atronachs: atronachPacks, beasts: beastPacks, daedra: daedraPacks, cy:(minY+maxY)/2, h:maxY-minY, P, N, C, G, pauldrons: packPiece(buildPauldrons(STEEL_RAMP)), helm: packPiece(buildHelm(STEEL_RAMP)), bodyScales: packPiece(buildBodyScales(faces, ramps.skin)), bodyFurCoat: packPiece(buildBodyFur(faces, KHAJIIT_FUR, KHAJIIT_BELLY, 'coat')), bodyFurBelly: packPiece(buildBodyFur(faces, KHAJIIT_FUR, KHAJIIT_BELLY, 'belly')) });

  return payload;
}
