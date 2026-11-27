// Keeps recently left places warm and frees the rest so memory stays bounded.

export const PLACES_KEPT = Object.freeze({ pixel: 49, interior: 4, dungeon: 2 });

const WHATS = Object.freeze(['mesh', 'tex', 'tile']);

/**
 * @param {{ free: { mesh: (key: any) => boolean, tex: (key: string) => any, tile: (key: any) => any }, kept?: Record<string, number> }} o
 */
export function createPlaceHolds({ free, kept = PLACES_KEPT }) {
  const held = { mesh: new Map(), tex: new Map(), tile: new Map() };
  const pinned = { mesh: new Set(), tex: new Set(), tile: new Set() };
  const loose = { mesh: new Set(), tex: new Set(), tile: new Set() };
  const meshTex = new Map();
  const keep = { ...kept };
  const shelves = new Map();
  let live = 0;

  const add = (what, key) => { const m = held[what]; m.set(key, (m.get(key) ?? 0) + 1); };
  const sub = (what, key) => {
    const m = held[what], n = (m.get(key) ?? 0) - 1;
    if (n > 0) m.set(key, n);
    else { m.delete(key); loose[what].add(key); }
  };

  function sweep() {
    for (const key of loose.mesh) {
      if (held.mesh.has(key) || pinned.mesh.has(key) || !free.mesh(key)) continue;
      const pictures = meshTex.get(key);
      meshTex.delete(key);
      for (const t of pictures ?? []) sub('tex', t);
    }
    loose.mesh.clear();
    for (const what of ['tex', 'tile']) {
      for (const key of loose[what]) if (!held[what].has(key) && !pinned[what].has(key)) free[what](key);
      loose[what].clear();
    }
  }

  function drop(h) {
    h.state = 'dropped';
    for (const what of WHATS) {
      for (const key of h.holds[what]) sub(what, key);
      h.holds[what].clear();
    }
  }

  function trim(kind) {
    const shelf = shelves.get(kind);
    if (!shelf) return;
    const limit = keep[kind] ?? 0;
    while (shelf.size > limit) {
      const [k, oldest] = shelf.entries().next().value;
      shelf.delete(k);
      drop(oldest);
    }
  }

  function place(kind, key) {
    live++;
    const h = {
      kind, key, state: 'live',
      holds: { mesh: new Set(), tex: new Set(), tile: new Set() },
      hold(what, k) {
        if (h.state === 'dropped') { if (!held[what].has(k) && !pinned[what].has(k)) loose[what].add(k); return; }
        if (h.holds[what].has(k)) return;
        h.holds[what].add(k);
        add(what, k);
      },
      release() {
        if (h.state !== 'live') return;
        live--;
        h.state = 'kept';
        let shelf = shelves.get(kind);
        if (!shelf) shelves.set(kind, (shelf = new Map()));
        const older = shelf.get(key);
        if (older) { shelf.delete(key); drop(older); }
        shelf.set(key, h);
        trim(kind);
        sweep();
      },
      settle() {
        const shelf = shelves.get(kind);
        const older = shelf?.get(key);
        if (!older || older === h) return;
        shelf.delete(key);
        drop(older);
        sweep();
      },
    };
    return h;
  }

  return {
    place,
    pin(what, key) { pinned[what].add(key); },
    meshBuilt(key, pictures) {
      const was = meshTex.get(key);
      meshTex.set(key, pictures);
      for (const t of pictures) add('tex', t);
      for (const t of was ?? []) sub('tex', t);
      if (!held.mesh.has(key) && !pinned.mesh.has(key)) loose.mesh.add(key);
    },
    keep(kind, n) {
      keep[kind] = Math.max(0, Math.floor(Number(n) || 0));
      trim(kind);
      sweep();
    },
    stats() {
      const keptBy = {};
      for (const [kind, shelf] of shelves) keptBy[kind] = shelf.size;
      return {
        live, kept: keptBy,
        held: { mesh: held.mesh.size, tex: held.tex.size, tile: held.tile.size },
        pinned: { mesh: pinned.mesh.size, tex: pinned.tex.size, tile: pinned.tile.size },
      };
    },
  };
}
