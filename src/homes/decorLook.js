import { t } from '../ui/textManager.js';

const NONE = Object.freeze({ move: false, duplicate: false, remove: false, out: false });

export const DECOR_USE_MODES = Object.freeze(['private', 'friends', 'party', 'guild']);
export const DECOR_USE_WORDS = Object.freeze({ private: 'Me', friends: 'Friends', party: 'Party', guild: 'Guild' });
export const decorUseLabel = (mode) => t('decor.look.use', 'Who may use: {who}', { who: DECOR_USE_WORDS[mode] ?? DECOR_USE_WORDS.private });
export const decorUseNext = (mode) => DECOR_USE_MODES[(Math.max(0, DECOR_USE_MODES.indexOf(mode)) + 1) % DECOR_USE_MODES.length];
export const HALL_USE_RANKS = Object.freeze([3, 2, 1, 0]);
export const HALL_USE_WORDS = Object.freeze({ 3: 'Everyone', 2: 'Members', 1: 'Officers', 0: 'Guildmaster' });
export const decorHallRankNext = (rank) => HALL_USE_RANKS[(Math.max(0, HALL_USE_RANKS.indexOf(rank)) + 1) % HALL_USE_RANKS.length];
export const decorHallUseLabel = (rank) => t('decor.look.hall', 'Who may use: {who}', { who: HALL_USE_WORDS[rank] ?? HALL_USE_WORDS[3] });
export function decorUseCircle(social) {
  const friends = [];
  const party = [];
  if (social?.friends?.values) for (const r of social.friends.values()) if (typeof r?.name === 'string' && r.name) friends.push(r.name);
  const mine = social?.name;
  for (const m of social?.party?.members ?? []) if (typeof m?.name === 'string' && m.name && m.name !== mine) party.push(m.name);
  return { friends, party };
}

export function decorAimKind(key, piece) {
  if (piece?.roomDoor) return 'roomdoor';
  if (piece) {
    if (piece.door) return 'door';
    if (piece.station) return 'station';
    if (piece.storage) return 'container';
    return 'decor';
  }
  if (typeof key !== 'string') return null;
  if (key.startsWith('intdoor:')) return 'roomdoor';
  if (key.startsWith('base:')) return 'base';
  if (key.startsWith('container:') || key.startsWith('shelf:')) return 'container';
  if (key.startsWith('exit:') || key.startsWith('act:') || key.startsWith('ladder:')) return 'structural';
  return null;
}

/** @param {{ kind?: string, key?: string, piece?: any, holds?: boolean, mayEdit?: boolean } | null} aim */
export function decorLookOffers(aim) {
  if (!aim || aim.mayEdit === false) return { ...NONE };
  const kind = aim.kind ?? decorAimKind(aim.key, aim.piece);
  if (kind === 'roomdoor') return { move: false, duplicate: false, remove: true, out: false };
  if (kind === 'base') return { move: false, duplicate: false, remove: false, out: true };
  if (!aim.piece) return { ...NONE };
  if (kind !== 'decor' && kind !== 'container' && kind !== 'station' && kind !== 'door') return { ...NONE };
  const row = { move: true, duplicate: !aim.piece.item, remove: !aim.holds, out: false, rename: true };
  if (kind === 'container' || kind === 'station') row.access = true;
  return row;
}

const PLAQUE_LABEL = { move: 'Move', duplicate: 'Duplicate', remove: 'Remove', rename: 'Rename', out: t('decor.look.takeOut', 'Take out') };

/**
 * @param {{ title?: string, subs?: any, actions?: any[] } | null} named
 * @param {{ kind?: string, key?: string, piece?: any, holds?: boolean, mayEdit?: boolean, name?: string } | null} aim
 */
export function decorPlaque(named, aim) {
  const offers = decorLookOffers(aim ? { ...aim, kind: aim.kind ?? decorAimKind(aim.key, aim.piece) } : null);
  const actions = [];
  if (offers.move) actions.push({ id: 'move', label: PLAQUE_LABEL.move });
  if (offers.duplicate) actions.push({ id: 'duplicate', label: PLAQUE_LABEL.duplicate });
  if (offers.remove) actions.push({ id: 'remove', label: PLAQUE_LABEL.remove });
  if (offers.rename) actions.push({ id: 'rename', label: PLAQUE_LABEL.rename });
  if (offers.access) actions.push({ id: 'access', label: aim.use || decorUseLabel('private') });
  if (offers.out) actions.push({ id: 'out', label: aim?.holds ? t('decor.look.takeOutHolds', 'Take out (its contents to your pack)') : PLAQUE_LABEL.out });
  if (!actions.length) return named ?? null;
  return { ...(named && typeof named === 'object' ? named : {}), title: named?.title || aim?.name || 'Piece', actions };
}

export function decorBuiltInPlaque(title, entry, editing) {
  const name = title || 'Piece';
  if (!editing || !entry?.baseKey) return title ? { title } : null;
  const holds = Array.isArray(entry.items) && entry.items.length > 0;
  return decorPlaque({ title: name }, { key: entry.baseKey, kind: 'base', mayEdit: true, name, holds });
}

const DECOR_VERB_KEYS = Object.freeze(['decor:', 'base:', 'container:', 'shelf:', 'chair:', 'bed:', 'door:', 'act:decor:']);
export const decorVerbKey = (key) => typeof key === 'string' && DECOR_VERB_KEYS.some((k) => key.startsWith(k));

// The plaque is not drawn on touch screens or on the classic skin without quick loot. There a press uses only the
// first verb of the frame, the row the plaque lights first.
export function decorPressFrame(frame) {
  if (frame?.kind !== 'actions' || !decorVerbKey(frame.key) || !frame.rows?.length || frame.startUnlit) return null;
  return { ...frame, rows: frame.rows.slice(0, 1) };
}
