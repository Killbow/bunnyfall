// @ts-check
// A stand flat represents a body: a town horse or a person's flat that no StaticNPC holds.
// Both exterior hosts build the record here, so a 3D body can replace the billboard.
import { isNpcFlat } from './npcFlatArchives.js';
import { isStandingHorseFlat, standingHorseYaw, standingHorseSeed } from './standingHorses.js';
import { strangerHorseLook } from '../travel/horseCoats.js';

export const isStandFlat = (archive, record) => isStandingHorseFlat(archive, record) || isNpcFlat(archive);

export const standFlatId = (place, x, z) => `flat:${place}:${Math.round(x * 100)},${Math.round(z * 100)}`;

/**
 * @param {{ archive: number, record: number, x: number, y: number, z: number }} sf
 * @param {any} batch
 * @param {string} id
 */
export function standFlatRecord(sf, batch, id) {
  if (isStandingHorseFlat(sf.archive, sf.record)) {
    return { kind: 'horse', x: sf.x, y: sf.y, z: sf.z, batch, yaw: standingHorseYaw(id), seed: standingHorseSeed(id), look: strangerHorseLook(id), feet: [sf.x, sf.y, sf.z] };
  }
  return { kind: 'person', x: sf.x, y: sf.y, z: sf.z, batch, piece: { id, flat: [sf.archive, sf.record] }, _mwFeet: null };
}
