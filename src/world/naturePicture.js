// @ts-check

import { LPT_ARCHIVES } from './lowPolyTrees.js';
import { billboardSize } from './rmbFlats.js';

export const seasonPictureKey = (record, installedSeason) => `${record}#season${installedSeason}`;

/**
 * @param {{ door?: any, seasons?: any, renderer: any, uploadRecord: (archive: number, record: number) => any }} deps
 * @param {any} t
 * @param {number} archive
 * @param {number} record
 */
export async function naturePicture({ door = null, seasons = null, renderer, uploadRecord }, t, archive, record) {
  const sib = seasons?.lookup?.(archive, record) ?? null;
  const plain = sib ? sib.size : billboardSize(t, record);
  const proto = door && LPT_ARCHIVES.includes(archive) && (await door.load()) ? door.proto(archive, record) : null;
  const far = proto ? await door.farPicture(proto) : null;
  if (far) return { key: far.record, size: far.size, plain, sib, proto, far };
  if (sib) {
    const key = seasonPictureKey(record, seasons.installedSeason);
    renderer.uploadTexture(archive, key, sib.texture.image, { mips: false, variant: '' });
    return { key, size: sib.size, plain, sib, proto: null, far: null };
  }
  uploadRecord(archive, record);
  return { key: record, size: plain, plain, sib: null, proto: null, far: null };
}

/**
 * @param {any} door
 * @param {number} species
 */
export async function junglePicture(door, species) {
  const proto = door.proto(species);
  const far = proto ? await door.farPicture(proto) : null;
  return far ? { proto, far } : null;
}

/**
 * @param {any} door
 * @param {number} kind
 * @param {number} side
 */
export async function pairPicture(door, kind, side) {
  const proto = door.pairProto(kind, side);
  const far = proto ? await door.farPicture(proto) : null;
  return far ? { proto, far } : null;
}
