// @ts-check

// No Seal is handed out yet. Raising this grants every account and offline character one Seal per step, once.
export const PSIJIC_SEAL_EPOCH = 0;
export const PSIJIC_SEAL_RID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
export const PSIJIC_SEAL_GRANT_MAX = 100;

/**
 * @param {unknown} epochGranted
 * @param {number} [epoch]
 * @returns {number}
 */
export function epochSealsDue(epochGranted, epoch = PSIJIC_SEAL_EPOCH) {
  const seen = Number.isSafeInteger(epochGranted) && /** @type {number} */ (epochGranted) >= 0
    ? /** @type {number} */ (epochGranted) : 0;
  return Math.max(0, epoch - seen);
}

/**
 * @param {any} entity
 * @param {number} [epoch]
 * @returns {number}
 */
export function ensureOfflinePsijicSeals(entity, epoch = PSIJIC_SEAL_EPOCH) {
  if (!entity || typeof entity !== 'object') return 0;
  const prevEpoch = Number.isSafeInteger(entity.psijicSealEpoch) && entity.psijicSealEpoch >= 0 ? entity.psijicSealEpoch : 0;
  const cur = Number.isSafeInteger(entity.psijicSeals) && entity.psijicSeals >= 0 ? entity.psijicSeals : 0;
  const due = epochSealsDue(prevEpoch, epoch);
  entity.psijicSeals = cur + due;
  entity.psijicSealEpoch = Math.max(prevEpoch, epoch);
  return entity.psijicSeals;
}

/**
 * @param {any} entity
 * @returns {{ ok: boolean, balance: number }}
 */
export function spendOfflinePsijicSeal(entity) {
  if (!entity || typeof entity !== 'object') return { ok: false, balance: 0 };
  const bal = ensureOfflinePsijicSeals(entity);
  if (bal < 1) return { ok: false, balance: bal };
  entity.psijicSeals = bal - 1;
  return { ok: true, balance: entity.psijicSeals };
}
