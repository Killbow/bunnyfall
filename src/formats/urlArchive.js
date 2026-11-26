
export function makeVendoredArchive(urls, fetchBytes) {
  const norm = (p) => String(p).replace(/\\/g, '/').toLowerCase();
  const table = new Map(Object.entries(urls).map(([k, v]) => [norm(k), v]));
  const bytes = new Map();
  const inflight = new Map();
  return {
    vendored: true,
    names: [...table.keys()],
    has: (p) => table.has(norm(p)),
    loaded: (p) => bytes.has(norm(p)),
    get: (p) => bytes.get(norm(p)) ?? null,
    load: async (p) => {
      const key = norm(p);
      if (bytes.has(key)) return bytes.get(key);
      if (!table.has(key)) return null;
      if (!inflight.has(key)) {
        inflight.set(key, (async () => {
          const entry = table.get(key);
          const url = typeof entry === 'function' ? await entry() : entry;
          const b = await fetchBytes(url);
          bytes.set(key, b);
          inflight.delete(key);
          return b;
        })());
      }
      return inflight.get(key);
    },
  };
}
