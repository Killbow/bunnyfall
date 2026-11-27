// @ts-check
export const BOAT_VERB = Object.freeze({
  helm: 'helm', board: 'board', cargo: 'cargo', pack: 'pack', variant: 'variant', status: 'status', position: 'position',
  crew: 'crew', orders: 'orders',
  companions: 'companions',
  cabin: 'cabin', door: 'door',
});
export const BOAT_MENU_TEXT = Object.freeze({
  helm: 'Take the helm', leave: 'Leave the helm', board: 'Board', cargo: 'Open storage', pack: 'Pick up',
  variant: 'Change style', status: 'Status', position: 'Position', crew: 'Crew', orders: 'Give orders', companions: 'Companions',
  cabin: 'Enter cabin', door: 'Open / close door',
});
export const BOAT_MENU_WHY = Object.freeze({
  driving: 'driving', passengers: 'passengers aboard', moored: 'a deed ship stays afloat', sailing: 'not at the helm',
  noDeed: 'the deed is not in your pack',
  tooHeavy: 'too heavy to carry',
});

/** @type {Readonly<Record<string, { box: string, mode: string|null }>>} */
export const BOAT_VERB_BOX = Object.freeze({
  helm: { box: 'drive', mode: 'grab' }, pack: { box: 'drive', mode: 'steal' }, board: { box: 'board', mode: null },
  cargo: { box: 'cargo', mode: null }, variant: { box: 'variant', mode: null }, status: { box: 'status', mode: null },
  position: { box: 'position', mode: null },
  door: { box: 'door', mode: null },
});

/**
 * @param {any} root
 * @param {(name: string) => number|null} modelOf
 * @param {Readonly<Record<string, number>>} models
 * @returns {Map<string, any[]>}
 */
export function boatTriggers(root, modelOf, models) {
  const byId = new Map(Object.entries(models).map(([k, v]) => [v, k]));
  const out = new Map();
  const stack = root ? [root] : [];
  while (stack.length) {
    const n = stack.pop();
    const id = modelOf(n?.name);
    const box = id != null ? byId.get(id) : null;
    if (box) { if (!out.has(box)) out.set(box, []); out.get(box).push(n); }
    for (const c of n?.children ?? []) stack.push(c);
  }
  return out;
}

/**
 * @param {{ boxes: Map<string, any[]>|Set<string>, packable?: boolean, sailingThis?: boolean, sailing?: boolean,
 *   aboard?: boolean, passengers?: number, variants?: boolean, naval?: boolean, crewed?: boolean, companions?: boolean,
 *   noDeed?: boolean, tooHeavy?: boolean, cabin?: boolean, cabinWhy?: string|null }} s
 */
export function boatMenuRows(s) {
  const has = (b) => s.boxes.has(b);
  const rows = [];
  if (has('drive')) rows.push({ id: BOAT_VERB.helm, label: s.sailingThis ? BOAT_MENU_TEXT.leave : BOAT_MENU_TEXT.helm });
  if (has('board') && !s.aboard && !s.sailingThis) rows.push({ id: BOAT_VERB.board, label: BOAT_MENU_TEXT.board });
  if (has('cargo')) rows.push({ id: BOAT_VERB.cargo, label: BOAT_MENU_TEXT.cargo });
  if (has('door') && s.cabin) {
    rows.push({ id: BOAT_VERB.cabin, label: BOAT_MENU_TEXT.cabin, ...(s.cabinWhy ? { disabled: true, why: s.cabinWhy } : {}) });
    rows.push({ id: BOAT_VERB.door, label: BOAT_MENU_TEXT.door });
  }
  if (has('drive')) {
    const why = !s.packable ? BOAT_MENU_WHY.moored : s.sailingThis ? BOAT_MENU_WHY.driving : (s.passengers ?? 0) > 0 ? BOAT_MENU_WHY.passengers
      : s.noDeed ? BOAT_MENU_WHY.noDeed
        : s.tooHeavy ? BOAT_MENU_WHY.tooHeavy : null;
    rows.push(why ? { id: BOAT_VERB.pack, label: BOAT_MENU_TEXT.pack, disabled: true, why } : { id: BOAT_VERB.pack, label: BOAT_MENU_TEXT.pack });
  }
  if (has('variant') && s.variants) rows.push(s.sailing ? { id: BOAT_VERB.variant, label: BOAT_MENU_TEXT.variant, disabled: true, why: BOAT_MENU_WHY.sailing } : { id: BOAT_VERB.variant, label: BOAT_MENU_TEXT.variant });
  if (has('status')) rows.push({ id: BOAT_VERB.status, label: BOAT_MENU_TEXT.status });
  if (has('position')) rows.push({ id: BOAT_VERB.position, label: BOAT_MENU_TEXT.position });
  if (s.naval) {
    if (s.crewed) rows.push({ id: BOAT_VERB.crew, label: BOAT_MENU_TEXT.crew });
    rows.push({ id: BOAT_VERB.orders, label: BOAT_MENU_TEXT.orders });
    if (s.crewed && s.companions !== false) rows.push({ id: BOAT_VERB.companions, label: BOAT_MENU_TEXT.companions });
  }
  return rows;
}

/** @param {string|null} box @param {{id: string}[]} rows @param {string} [mode] */
export function boatMenuStart(box, rows, mode) {
  if (box == null) return 0;
  if (box === 'door' && rows.some((r) => r.id === BOAT_VERB.cabin)) return rows.findIndex((r) => r.id === BOAT_VERB.cabin);
  const verb = box === 'drive' ? (mode === 'steal' ? BOAT_VERB.pack : BOAT_VERB.helm) : box;
  return rows.findIndex((r) => r.id === verb);
}

export const boatMenuRefusal = (why) => (why === BOAT_MENU_WHY.driving ? 'You cannot pack a boat you are driving!'
  : why === BOAT_MENU_WHY.passengers ? 'You cannot pack a boat with passengers aboard!'
    : why === BOAT_MENU_WHY.moored ? 'A ship from a deed can\'t be packed. It stays afloat.'
      : why === BOAT_MENU_WHY.sailing ? 'Not while at the helm.'
        // These two lines must match DEED_NOT_HELD_TEXT and PARTS_TOO_HEAVY_TEXT in comeSailAway.js.
        : why === BOAT_MENU_WHY.noDeed ? 'You need the ship\'s deed in your pack to pick it up.'
          : why === BOAT_MENU_WHY.tooHeavy ? 'The ship\'s parts are too heavy for you to carry.' : null);

/**
 * @param {Map<string, any[]>} boxes
 * @param {string} verb
 * @param {number[]} at
 * @param {(n: any) => number[]} posOf
 */
export function boatVerbNode(boxes, verb, at, posOf, aimed = null) {
  const list = boxes.get(BOAT_VERB_BOX[verb]?.box ?? '') ?? [];
  if (aimed && list.includes(aimed)) return aimed;
  let best = null, bestD = Infinity;
  for (const n of list) {
    const p = posOf(n);
    const d = (p[0] - at[0]) ** 2 + (p[1] - at[1]) ** 2 + (p[2] - at[2]) ** 2;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

/**
 * @param {{ boxes: Map<string, any[]>, rows: {id: string, disabled?: boolean, why?: string}[], verb: string|null,
 *   distance: number, reach: number, at: number[], posOf: (n: any) => number[], hit: object, mode: string,
 *   models: Readonly<Record<string, number>>, activate: (model: number, hit: object, mode: string) => any,
 *   say: (line: string) => void, aimed?: any }} p
 * @returns {'far'|'none'|'refused'|'pressed'}
 */
export function pressBoatVerb(p) {
  if (!(p.distance <= p.reach)) return 'far';
  const row = p.rows.find((r) => r.id === p.verb);
  if (!row) return 'none';
  if (row.disabled) { const line = boatMenuRefusal(row.why); if (line) p.say(line); return 'refused'; }
  const how = BOAT_VERB_BOX[row.id];
  const node = boatVerbNode(p.boxes, row.id, p.at, p.posOf, p.aimed ?? null);
  if (!how || !node) return 'none';
  p.activate(p.models[how.box], { ...p.hit, node, distance: p.distance }, how.mode ?? p.mode);
  return 'pressed';
}
