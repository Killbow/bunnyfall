// @ts-check
// BUNNYFALL AUDIT BF-16 / L4-03: WHICH RELAY A `?server=` LINK MAY NAME. The page's query is anyone's word (a link sent in
// chat), and the relay it names is sent the player's signed identity token, their peer secret and their hub pair as the
// hello. So the query is taken only where the player already trusts the host: the default relay's, the one they saved in
// the menu, or their own machine (a developer's). Anything else is ignored, and the saved or default relay is used.

/** @param {unknown} url @returns {string | null} the host of a ws(s) URL, lower case */
const hostOf = (url) => {
  try { const u = new URL(String(url)); return /^wss?:$/.test(u.protocol) ? u.host.toLowerCase() : null; } catch { return null; }
};
const LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * @param {unknown} asked the query's `server`
 * @param {unknown} saved the menu's saved relay
 * @param {unknown} fallback the default relay
 * @returns {string | null} the asked relay when it is trusted, else null
 */
export function trustedServerParam(asked, saved, fallback) {
  if (!asked) return null;
  const host = hostOf(asked);
  if (!host) return null;
  if (LOCAL.test(host)) return String(asked);
  if (host === hostOf(saved) || host === hostOf(fallback)) return String(asked);
  return null;
}
