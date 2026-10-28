// @ts-check
// BUNNYFALL: where this copy's own servers live. The game is served by the same box as the relay and the
// account service (selfhost/Caddyfile), so a page on http(s)://host/ finds the relay at host/relay and the account
// service's /v1 routes on the host itself.
// A page with no web origin (the desktop app, a test) uses the public domain.
export const SELF_HOST_DOMAIN = 'dagg.campfirerp.com';

function webOrigin() {
  try {
    const l = globalThis.location;
    if (!l || !l.host) return null;
    if (l.protocol === 'https:') return { secure: true, host: l.host, origin: l.origin };
    // ws:// is accepted on localhost only (wire.js relayUrl), so plain http elsewhere falls back to the domain.
    if (l.protocol === 'http:' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(l.host)) return { secure: false, host: l.host, origin: l.origin };
  } catch { /* no location */ }
  return null;
}

export function selfRelayUrl() {
  const o = webOrigin();
  return o ? `${o.secure ? 'wss' : 'ws'}://${o.host}/relay` : `wss://${SELF_HOST_DOMAIN}/relay`;
}

export function selfAccountUrl() {
  const o = webOrigin();
  return o ? o.origin : `https://${SELF_HOST_DOMAIN}`;
}

/** The owner's update door (selfhost/updater.mjs), beside the account service. */
export function selfUpdaterUrl() {
  return `${selfAccountUrl()}/updater`;
}
