// @ts-check
// A leaf with no imports: quest.js saves and restores this state and must not pull in the questline layer.

// A save with any other stamp reads as unstamped, so a later format is never misread.
export const QL_STAMP = 1;

export const freshState = () => ({ stamp: QL_STAMP, tier: 1, opened: [], done: [], failed: [], choices: {}, outcome: null, paid: false, moved: false, acts: {}, received: false, reread: [] });

const idList = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x))] : []);
const strMap = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).filter(([k, x]) => typeof k === 'string' && typeof x === 'string' && x)) : {});
const countMap = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => Number.isSafeInteger(x) && x > 0)) : {});

export function readState(data) {
  if (!data || typeof data !== 'object' || data.stamp !== QL_STAMP) return null;
  const tier = Number.isSafeInteger(data.tier) ? Math.min(4, Math.max(1, data.tier)) : 1;
  return {
    stamp: QL_STAMP, tier, opened: idList(data.opened), done: idList(data.done), failed: idList(data.failed), choices: strMap(data.choices),
    outcome: typeof data.outcome === 'string' && data.outcome ? data.outcome : null,
    paid: data.paid === true, moved: data.moved === true, acts: countMap(data.acts), received: data.received === true,
    reread: idList(data.reread),
  };
}

export const writeState = (state) => (state ? structuredClone(state) : null);

// A received copy keeps party progress but no pay, and the machine then sets the tier for the holder.
export function receivedState(data) {
  const st = readState(data);
  return st ? { ...st, tier: 1, paid: false, moved: false, acts: {}, received: true } : null;
}

// A resync only adds progress; the holder's paid, moved, acts, tier, and received fields never take the partner's.
export function mergeSharedState(local, incoming) {
  if (!local) return null;
  const inc = readState(incoming);
  if (!inc) return local;
  const done = [...new Set([...local.done, ...inc.done])];
  return {
    ...local,
    opened: [...new Set([...local.opened, ...inc.opened])],
    done,
    failed: [...new Set([...local.failed, ...inc.failed])].filter((id) => !done.includes(id)),
    choices: { ...inc.choices, ...local.choices },
    outcome: local.outcome ?? inc.outcome,
  };
}
