// @ts-check

export const WILD_NEVER_GROUPS = Object.freeze(new Set(['Transportation', 'Deeds', 'QuestItems', 'Currency']));

export const WILD_REVENANTS_MAX = 1;

/**
 * @param {any} list
 * @returns {any[]}
 */
export const wildSwornAtSide = (list) => (Array.isArray(list) ? list : []).filter((r) => !!r && !!r.sworn && !r.defeated && !r.gone && (r.companion?.state ?? 'with') === 'with').slice(0, WILD_REVENANTS_MAX);
