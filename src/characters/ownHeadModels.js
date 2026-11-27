// @ts-check

const PART = Object.freeze({ head: 0, hair: 1 });

/**
 * @param {string} race
 * @param {boolean} female
 * @param {'head'|'hair'} slot
 * @param {string} id
 */
const record = (race, female, slot, id) => Object.freeze({
  id, model: `${id}.nif`, race, part: PART[slot], female, playable: true, skin: true, vampire: false, bodyKind: 0, slot, firstPerson: false,
});

/**
 * @param {string} race
 * @param {boolean} female
 * @param {string[]} heads
 * @param {string[]} hairs
 */
const pools = (race, female, heads, hairs) => Object.freeze({
  heads: Object.freeze(heads.map((id) => record(race, female, 'head', id))),
  hairs: Object.freeze(hairs.map((id) => record(race, female, 'hair', id))),
});

export const OWN_HEADS = Object.freeze({
  breton: Object.freeze({
    male: pools('breton', false, ['breton_m_head_h04', 'breton_m_head_h0411', 'breton_m_head_h0423'], ['breton_m_hair_01', 'breton_m_hair_0111', 'breton_m_hair_widow']),
  }),
});

/**
 * @param {string} race
 * @param {boolean} female
 */
export function ownFacePools(race, female) {
  const byRace = /** @type {Record<string, any>} */ (OWN_HEADS)[String(race || '').toLowerCase()];
  return byRace?.[female ? 'female' : 'male'] ?? null;
}

export const ownHeadModelPaths = () => Object.values(OWN_HEADS)
  .flatMap((bySex) => Object.values(bySex))
  .flatMap((p) => [...p.heads, ...p.hairs])
  .map((r) => `meshes/${r.model}`);
