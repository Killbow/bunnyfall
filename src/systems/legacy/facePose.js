// @ts-check

/**
 * @param {{ id?: number, race?: string, gender?: string, face?: number, kind?: string, residentFace?: number|null, residentId?: string|null }} p
 * @param {{ currentId?: number|null }} [o]
 * @returns {{ race: string|undefined, gender: string|undefined, face: number|undefined, common?: number, resident?: string, kin?: boolean }}
 */
export const facePose = (p, { currentId = null } = {}) => ({
  race: p.race, gender: p.gender, face: p.face,
  ...(p.kind === 'member' && currentId != null && p.id !== currentId ? { kin: true } : {}),
  ...(p.kind === 'resident' && Number.isInteger(p.residentFace) && /** @type {number} */ (p.residentFace) >= 0 ? { common: /** @type {number} */ (p.residentFace), ...(p.residentId ? { resident: String(p.residentId) } : {}) } : {}),
});
