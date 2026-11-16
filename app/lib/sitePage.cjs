// Reads the live site's game page for the in-game update check. The app plays its own copy from dagger://game.
// The site sends no CORS header to that origin, so the shell reads the page and passes its text to the game.

'use strict';

async function fetchSitePage(site, fetchImpl, timeoutMs = 15000) {
  try {
    const res = await fetchImpl(new URL('play/', site).href, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

module.exports = { fetchSitePage };
