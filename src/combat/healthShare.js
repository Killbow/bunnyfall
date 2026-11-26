// @ts-check

// Relay-run bodies are struck against a stand-in with placeholder health, so their share comes from relayShare.
/**
 * @param {any} e
 * @returns {number|null}
 */
export function healthShare(e) {
  if (e?.relayHealth) {
    let s = null;
    try { s = typeof e.relayShare === 'function' ? e.relayShare() : null; } catch { s = null; }
    return typeof s === 'number' && Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : null;
  }
  return Number.isFinite(e?.health) && e.maxHealth > 0 ? e.health / e.maxHealth : 1;
}

/**
 * @param {any} hp
 * @param {any} max
 * @returns {number|null}
 */
export const wordShare = (hp, max) => (typeof hp === 'number' && Number.isFinite(hp) && typeof max === 'number' && Number.isFinite(max) && max > 0 ? hp / max : null);
