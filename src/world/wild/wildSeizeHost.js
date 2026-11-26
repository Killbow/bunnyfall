import { WILD_FALL_GRACE_S } from '../../net/wildReceipt.js';

/** @param {any} host */
export function createWildSeizeHost(host) {
  const {
    _wildSeize, campToWire, player, wildAccount, wildDeposit
  } = host;
  const wildSeizeFrame = () => {
    const now = Date.now();
    for (const [r, s] of [..._wildSeize]) {
      if (now < s.due) continue;
      _wildSeize.delete(r);
      if (host.wildRemains.has(r)) continue;
      const p = s.p ?? campToWire(player.feetAt());
      wildAccount.fall({ receipt: s.rc, room: s.room, ...(host.online?.wildCollectAt?.(s.room) ? { collect: 1 } : {}) }).then((a) => {
        const d = a?.ok ? a.data : null;
        if (d?.order && Array.isArray(d.items) && d.items.length) { wildDeposit({ r: d.r, items: d.items, o: d.order, p, room: s.room, mine: null }); return; }
        if (['offline', 'server', 'rate', 'seq', 'no-session'].includes(a?.error) && s.tries < 3) _wildSeize.set(r, { ...s, due: Date.now() + 5_000 * (s.tries + 1), tries: s.tries + 1 });
        else if (a?.error === 'grace' && !s.graceWaited) _wildSeize.set(r, { ...s, due: Date.now() + (WILD_FALL_GRACE_S + 5) * 1000, graceWaited: true });
      }).catch(() => { });
    }
  };
  return { wildSeizeFrame };
}
