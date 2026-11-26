// @ts-check
// Holstered weapons, scabbards, and quivers for the third-person body, built from the Weapon Sheathing meshes.
// Holster parts attach bare at the sheathing bone, with no BoneOffset and no mirror, unlike the weapon in hand.

import { MW_WEAPON_TYPE, ammoTypeFor } from '../formats/mwFirstPerson.js';
import { findNodeByName, nodeTransformOf } from '../formats/mwCharacter.js';
import { deref } from '../formats/mwNifFile.js';

export const SHEATHING_BONE = Object.freeze({
  [MW_WEAPON_TYPE.ShortBladeOneHand]: 'Bip01 ShortBladeOneHand',
  [MW_WEAPON_TYPE.LongBladeOneHand]: 'Bip01 LongBladeOneHand',
  [MW_WEAPON_TYPE.LongBladeTwoHand]: 'Bip01 LongBladeTwoClose',
  [MW_WEAPON_TYPE.BluntOneHand]: 'Bip01 BluntOneHand',
  [MW_WEAPON_TYPE.BluntTwoClose]: 'Bip01 BluntTwoClose',
  [MW_WEAPON_TYPE.BluntTwoWide]: 'Bip01 BluntTwoWide',
  [MW_WEAPON_TYPE.SpearTwoWide]: 'Bip01 SpearTwoWide',
  // The one-handed axe sheathes at the long blade bone, as the reference weapon table does.
  [MW_WEAPON_TYPE.AxeOneHand]: 'Bip01 LongBladeOneHand',
  [MW_WEAPON_TYPE.AxeTwoHand]: 'Bip01 AxeTwoClose',
  [MW_WEAPON_TYPE.MarksmanBow]: 'Bip01 MarksmanBow',
  [MW_WEAPON_TYPE.MarksmanCrossbow]: 'Bip01 MarksmanCrossbow',
  [MW_WEAPON_TYPE.MarksmanThrown]: 'Bip01 MarksmanThrown',
});
export const SHEATH_WEAPON_NODE = 'Bip01 Weapon';
export const SHEATH_AMMO_NODE = 'Bip01 Ammo';
export const HOLSTER_SLOTS = Object.freeze(['holster', 'sheath', 'quiver']);

export function sheathedMeshPath(model) {
  const p = String(model || '');
  const dot = p.lastIndexOf('.');
  if (dot <= p.lastIndexOf('/')) return p ? `${p}_sh` : '';
  return `${p.slice(0, dot)}_sh${p.slice(dot)}`;
}

export function animationsDirOf(model) {
  let p = String(model || '').replace(/\\/g, '/').toLowerCase();
  if (p.startsWith('meshes/')) p = `animations/${p.slice(7)}`;
  const dot = p.lastIndexOf('.');
  if (dot > p.lastIndexOf('/')) p = p.slice(0, dot);
  return `${p}/`;
}

export function boneSourcesFor(baseModel, skeletonPath, archives) {
  const dirs = [animationsDirOf(baseModel)];
  const own = animationsDirOf(skeletonPath);
  if (own !== dirs[0]) dirs.push(own);
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    for (const arc of archives ?? []) {
      const names = typeof arc.list === 'function' ? arc.list() : (arc.names ?? []);
      for (const raw of names) {
        const n = String(raw).replace(/\\/g, '/').toLowerCase();
        if (n.startsWith(dir) && n.endsWith('.nif') && !seen.has(n)) { seen.add(n); out.push(n); }
      }
    }
  }
  return out;
}

// Thrown weapons stack, so the holstered weapon never shows for them; a scabbard still attaches.
export const holsters = (mwType) => SHEATHING_BONE[mwType] != null && mwType !== MW_WEAPON_TYPE.MarksmanThrown;

export function holsterPartPaths({ weaponModel }) {
  return weaponModel ? [sheathedMeshPath(`meshes/${weaponModel}`)] : [];
}

/** @returns {{ parts: object[], info: object|null, notes: string[] }} */
export function resolveHolsterParts({ mwType, weaponModel, weaponBytes, ammo = null, ammoCount = 0, find, hasBone, parseNif }) {
  const notes = [];
  const parts = [];
  if (mwType == null || mwType === MW_WEAPON_TYPE.None || !weaponModel || !weaponBytes) return { parts, info: null, notes };
  const bone = SHEATHING_BONE[mwType];
  if (!bone) return { parts, info: null, notes };
  const showHolstered = holsters(mwType);
  if (!hasBone(bone)) {
    notes.push(`holster: this skeleton has no "${bone}" - no bone addon (animations/xbase_anim/xbase_anim_sh.nif) was found`);
    return { parts, info: { bone, reason: 'no sheathing bone' }, notes };
  }
  const shPath = sheathedMeshPath(`meshes/${weaponModel}`);
  const shArc = find(shPath);
  if (!shArc) {
    if (showHolstered) parts.push({ slot: 'holster', bones: [bone], bytes: weaponBytes, bare: true });
    return { parts, info: { bone, scabbard: null, weaponNode: false, thrown: !showHolstered }, notes };
  }
  const shBytes = shArc.get(shPath).slice();
  let shNif;
  try { shNif = parseNif(shBytes); } catch (err) {
    notes.push(`holster: ${shPath}: ${err.message}`);
    if (showHolstered) parts.push({ slot: 'holster', bones: [bone], bytes: weaponBytes, bare: true });
    return { parts, info: { bone, scabbard: null, weaponNode: false, thrown: !showHolstered }, notes };
  }
  const weaponNode = findNodeByName(shNif, SHEATH_WEAPON_NODE);
  if (!weaponNode) {
    parts.push({ slot: 'sheath', bones: [bone], bytes: shBytes, bare: true });
    return { parts, info: { bone, scabbard: shPath, weaponNode: false, thrown: !showHolstered }, notes };
  }
  parts.push({ slot: 'sheath', bones: [bone], bytes: shBytes, excludeNode: SHEATH_WEAPON_NODE, bare: true });
  const weaponKids = (weaponNode.rec.children ?? []).filter((c) => c >= 0).length;
  if (!showHolstered) {
    // Thrown weapons keep the weapon node masked whatever the hand does.
  } else if (weaponKids > 0) {
    parts.push({ slot: 'holster', bones: [bone], bytes: shBytes, underNode: SHEATH_WEAPON_NODE, bare: true });
  } else {
    parts.push({ slot: 'holster', bones: [bone], bytes: weaponBytes, preTransform: nodeTransformOf(shNif, SHEATH_WEAPON_NODE), bare: true, inheritOffsetFrom: 'sheath' });
  }
  let quiver = 0;
  const ammoNode = findNodeByName(shNif, SHEATH_AMMO_NODE);
  if (ammoNode && ammo?.bytes) {
    const wanted = mwType === MW_WEAPON_TYPE.MarksmanThrown ? mwType : ammoTypeFor(mwType);
    const suitable = wanted !== MW_WEAPON_TYPE.None && ammo.type === wanted;
    if (suitable) {
      const slots = (ammoNode.rec.children ?? []).filter((c) => c >= 0);
      // No `| 0` here: a full quiver is requested with MAX_SAFE_INTEGER.
      const n = Math.min(Math.max(0, Math.floor(Number(ammoCount) || 0)), slots.length);
      for (let i = 0; i < n; i++) {
        const child = /** @type {any} */ (deref(shNif, slots[i]));
        const name = child?.name || `${SHEATH_AMMO_NODE} ${i}`;
        // The tag lets the rig hide the last quiver slot while a round is on the string.
        parts.push({ slot: 'quiver', bones: [bone], bytes: ammo.bytes, preTransform: nodeTransformOf(shNif, name), bare: true, inheritOffsetFrom: 'sheath', tag: { i, n } });
        quiver++;
      }
    }
  }
  return { parts, info: { bone, scabbard: shPath, weaponNode: true, weaponNodeEmpty: weaponKids === 0, quiver, thrown: !showHolstered }, notes };
}

export function holsterHidden(slot, weaponShown, { arrowShown = false, tag = null } = {}) {
  if (slot === 'holster') return !!weaponShown;
  if (slot === 'sheath') return false;
  if (slot === 'quiver') return !!(arrowShown && tag && tag.i === tag.n - 1);
  return null;
}

// Re-exported so existing imports from this module keep resolving.
export { makeVendoredArchive } from '../formats/urlArchive.js';

export function vendoredDataPath(file) {
  const p = String(file).replace(/\\/g, '/').toLowerCase();
  const at = p.indexOf('data files/');
  return at >= 0 ? p.slice(at + 'data files/'.length) : p.slice(p.lastIndexOf('/') + 1);
}
