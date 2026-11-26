import { exteriorNpcFlags, NPC_CONTEXT } from './staticNpc.js';

/** @param flats */
export function collectExteriorNpcs(flats) {
  return flats.filter((f) => f.factionID !== 0 && f.factionID !== undefined);
}

/**
 * @param flat
 * @param flatData
 */
export function exteriorNpcRecord(flat, flatData = null) {
  return {
    x: flat.x, y: flat.y, z: flat.z,
    textureArchive: flat.archive,
    textureRecord: flat.record,
    factionID: flat.factionID,
    flags: exteriorNpcFlags(flat.flags ?? 0, flatData),
    rawX: flat.rawX, rawY: flat.rawY, rawZ: flat.rawZ,
    position: flat.recordPosition,
    context: NPC_CONTEXT.Custom,
  };
}

/**
 * @param npcs
 * @param machine
 * @param makeHost
 * @returns
 */
export function setupExteriorQuestStaticNpcs(npcs, machine, makeHost) {
  if (!machine) return false;
  for (const pn of npcs) {
    pn.host = makeHost(pn);
    const setup = machine.setupIndividualStaticNPC(pn.host, pn.factionID);
    if (setup && setup !== true) pn.questBehaviour = setup;
  }
  return true;
}
