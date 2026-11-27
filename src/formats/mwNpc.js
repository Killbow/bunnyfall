
import { MW_BODY_PARTS, BODY_TYPE, isFirstPersonId } from './mwEsmFile.js';

export const PART_BONES = Object.freeze({
  head: ['head'],
  hair: ['head'],
  neck: ['neck'],
  chest: ['chest'],
  groin: ['groin'],
  tail: ['tail'],
  hand: ['left hand', 'right hand'],
  wrist: ['left wrist', 'right wrist'],
  forearm: ['left forearm', 'right forearm'],
  upperarm: ['left upper arm', 'right upper arm'],
  foot: ['left foot', 'right foot'],
  ankle: ['left ankle', 'right ankle'],
  knee: ['left knee', 'right knee'],
  upperleg: ['left upper leg', 'right upper leg'],
  clavicle: ['left clavicle', 'right clavicle'],
});

export const MESH_ROOT = 'meshes\\';

/** @param {Map} bodies */
export function indexSkins(bodies) {
  const byRace = new Map();
  for (const body of bodies.values()) {
    // Matches OpenMW's getBodyParts: only playable skin-type records count, with no vampire filter, and
    // first-person records are skipped so they never take a third-person slot.
    if (body.kind !== BODY_TYPE.skin || !body.playable || body.part < 0 || isFirstPersonId(body.id)) continue;
    let race = byRace.get(body.race);
    if (!race) byRace.set(body.race, (race = new Map()));
    let slot = race.get(body.part);
    if (!slot) race.set(body.part, (slot = {}));
    slot[body.female ? 'female' : 'male'] = body;
  }
  return byRace;
}

/**
 * @param {{npcs:Map, races:Map, bodies:Map}} esm
 * @param {string} npcId
 * @param {Map} [skinIndex]
 * @returns {{npc:object, race:object, animFile:string, parts: {slot:string, bodyId:string, model:string, attachBones:string[]}[], missing:string[]}}
 */
export function assembleNpc(esm, npcId, skinIndex = null) {
  const npc = esm.npcs.get(String(npcId).toLowerCase());
  if (!npc) throw new Error(`assembleNpc: no NPC_ "${npcId}"`);
  const race = esm.races.get(npc.race);
  if (!race) throw new Error(`assembleNpc: NPC "${npc.id}" names unknown race "${npc.race}"`);
  const skins = (skinIndex ?? indexSkins(esm.bodies)).get(npc.race) ?? new Map();

  const parts = [];
  const missing = [];
  const push = (slot, body) => {
    parts.push({
      slot,
      bodyId: body.id,
      model: MESH_ROOT + body.model,
      attachBones: PART_BONES[slot] ?? [],
    });
  };

  for (const [slot, id] of [
    ['head', npc.head],
    ['hair', npc.hair],
  ]) {
    const body = id && esm.bodies.get(id);
    if (body) push(slot, body);
    else missing.push(`${slot}: ${id ?? '(none named)'}`);
  }
  for (let p = 0; p < MW_BODY_PARTS.length; p++) {
    const slot = MW_BODY_PARTS[p];
    if (slot === 'head' || slot === 'hair') continue;
    const pair = skins.get(p);
    if (!pair) {
      if (slot === 'tail' && !race.beast) continue;
      missing.push(`${slot}: no ${npc.race} skin`);
      continue;
    }
    const body = (npc.female && pair.female) || pair.male || pair.female;
    if (body) push(slot, body);
  }

  const animFile = npc.model
    ? MESH_ROOT + npc.model
    : race.beast
      ? MESH_ROOT + 'base_animkna.nif'
      : npc.female
        ? MESH_ROOT + 'base_anim_female.nif'
        : MESH_ROOT + 'base_anim.nif';

  return { npc, race, animFile, parts, missing };
}

export function mwRaceId(dfRace) {
  if (!dfRace) return null;
  return String(dfRace).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export function dfRaceKeyOf(mwRace) {
  if (!mwRace) return null;
  return String(mwRace).split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
