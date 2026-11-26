// @ts-check

export const NPC_FLAT_ARCHIVES = Object.freeze([334, 346, 357, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184]);
const NPC_FLAT_ARCHIVE_SET = new Set(NPC_FLAT_ARCHIVES);
export const isNpcFlat = (archive) => NPC_FLAT_ARCHIVE_SET.has(archive);
