// BUNNYFALL WEEB1: AN INTERIOR NPC STOOD AS FLAT REPLACER'S PICTURE (systems/flatReplacer/). The interior host asks
// this before its own stand; an NPC with no replacement, or one whose picture is not there, stands as it always did.
//
// ReplacementBillboard.SetMaterial(oldSummary, archive, record): the new picture on the OLD billboard's size - an
// HD sprite stands as tall as the flat it replaces. The replacement archive is often one no ARENA2 file has (Weeberfall's
// 21869, 24000...): its picture comes from the attached mod alone, so it is uploaded under a key of its own (as the lamp
// keeper's is) rather than through the archive door, which knows nothing of a mod-only archive's records.

import { billboardSize } from '../world/rmbFlats.js';
import { hasTextureReplacement, preloadTextureRecord, decodedTexture } from '../render/textureReplacement.js';
import { LAST_CLASSIC_TEXTURE_ARCHIVE } from '../formats/textureFile.js';
import { flatNameBank } from '../systems/flatReplacer/flatReplacerLaw.js';

/** The renderer key a replacement picture is uploaded under: well past every archive the port uses. */
export const FLAT_SWAP_ARCHIVE_BASE = 7_000_000;

/** The picture of `archive`_`record` as the upload takes it (COLOR32, rows bottom-up): the mod's, else the classic
 *  record's for an ARENA2 archive, else null. */
async function swapPicture(archive, record, getTexture) {
  if (hasTextureReplacement(archive, record, 0)) {
    await preloadTextureRecord(archive, record, 0).catch(() => null);
    const c = decodedTexture(archive, record, 0);
    if (c) return c;
  }
  if (archive > LAST_CLASSIC_TEXTURE_ARCHIVE) return null;
  const t = await getTexture(archive).catch(() => null);
  if (!t || record >= t.recordCount) return null;
  return t.getColor32(t.getDFBitmap(record, 0), 0);
}

/**
 * Stand `pn` as its replacement (`pn.flatSwap`, the record chosen for it). Answers null when it cannot - the picture is
 * missing, so the host stands the person as usual (and `pn.flatSwap` is cleared, so the talk window and the name keep
 * the person's own) - or `{ batch }`, the batch to draw (null when the room moved on while the picture loaded).
 * `stillWanted()` is the host's word that the person should still be stood now.
 */
export async function standFlatSwap(pn, { getTexture, renderer, stillWanted }) {
  const r = pn.flatSwap;
  if (!r) return null;
  const bornArchive = pn.drawArchive ?? pn.textureArchive;
  const bornRecord = pn.drawRecord ?? pn.textureRecord;
  const [born, pic] = await Promise.all([getTexture(bornArchive).catch(() => null), swapPicture(r.replaceArchive, r.replaceRecord, getTexture)]);
  if (!pic || !born || bornRecord >= born.recordCount) { pn.flatSwap = null; return null; }
  pn.flatNameBank = flatNameBank(r);   // FlatReplacer: npcData.nameBank - read by staticNpcData (characters/staticNpc.js)
  const size = billboardSize(born, bornRecord);
  pn.width = size.w;
  pn.height = size.h;
  if (!stillWanted()) return { batch: null };
  const key = FLAT_SWAP_ARCHIVE_BASE + r.replaceArchive;
  renderer.uploadTexture(key, r.replaceRecord, pic);
  return { batch: renderer.createBillboardBatch(key, r.replaceRecord, size, [[pn.x, pn.y, pn.z]]) };
}
