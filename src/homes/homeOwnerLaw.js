// Client helpers for house co-owners and transfers by character name. The account service enforces every rule.

import { t } from '../ui/textManager.js';

export const HOME_OWNERS_MAX = 8;
export const CHAR_NAME_MAX = 32;
export const PICK_MAX = 9;

export function charNameOf(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name && name.length <= CHAR_NAME_MAX && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}

export function resolvedOf(answer) {
  const d = answer?.data ?? answer;
  const src = Array.isArray(d?.matches) ? d.matches : [];
  const matches = src.flatMap((m) => (typeof m?.char === 'string' && m.char && typeof m.name === 'string'
    ? [{ char: m.char, name: m.name.slice(0, CHAR_NAME_MAX), account: typeof m.account === 'string' ? m.account.slice(0, 32) : '', own: m.own === true, note: typeof m.note === 'string' ? m.note.slice(0, 40) : '' }] : [])).slice(0, PICK_MAX);
  return { matches, more: d?.more === true };
}

/** @returns {'moved' | 'sent' | 'refused'} */
export function offerAnswerKind(answer) {
  const code = answer?.error ?? answer?.data?.error;
  if (!answer?.ok) return 'refused';
  if (code) return 'refused';
  return answer?.moved === true || answer?.data?.moved === true ? 'moved' : 'sent';
}

// An older account service sends no owner fields, so the caller counts as the main owner.
export function homeOwnerFieldsOf(h) {
  const isMain = h?.main !== false;
  return {
    isMain,
    coOwner: h?.coOwner === true,
    mainName: typeof h?.mainName === 'string' && h.mainName ? h.mainName.slice(0, CHAR_NAME_MAX) : null,
  };
}

export function ownersViewOf(answer) {
  const d = answer?.data ?? answer;
  const one = (c) => (typeof c?.char === 'string' && c.char ? { char: c.char, name: typeof c.name === 'string' ? c.name.slice(0, CHAR_NAME_MAX) : '' } : null);
  const main = one(d?.main);
  const coOwners = (Array.isArray(d?.coOwners) ? d.coOwners : Array.isArray(d?.owners) ? d.owners : []).flatMap((c) => { const o = one(c); return o ? [{ ...o, at: Number.isFinite(c.at) ? c.at : 0 }] : []; }).slice(0, HOME_OWNERS_MAX);
  return { main, coOwners };
}

export function ownersRole(view, myChar) {
  const isMain = !!view?.main && view.main.char === myChar;
  const mine = (view?.coOwners ?? []).some((c) => c.char === myChar);
  return {
    isMain,
    canAdd: isMain && (view?.coOwners?.length ?? 0) < HOME_OWNERS_MAX,
    canRemove: (c) => isMain || (mine && c.char === myChar),
  };
}

export function addCandidates(characters, view, myChar) {
  const held = new Set([view?.main?.char, ...(view?.coOwners ?? []).map((c) => c.char), myChar]);
  return (Array.isArray(characters) ? characters : []).filter((c) => typeof c?.id === 'string' && !held.has(c.id) && typeof c.name === 'string' && c.name && c.dead_at == null);
}

export const homeHasOwners = (home) => !!home?.own && !home.deed && !home.hall;
export const homeMayTransfer = (home) => homeHasOwners(home) && home.isMain !== false;

const REFUSALS = {
  'home-owners-full': () => t('housing.owners.full', 'This house already has {max} co-owners.', { max: HOME_OWNERS_MAX }),
  'home-owner-main': () => t('housing.owners.isMain', 'The main owner cannot be a co-owner.'),
  'home-owner-char': () => t('housing.owners.noChar', 'That character cannot be added.'),
  'home-owner-listed': () => t('housing.owners.listed', 'That character is already a co-owner.'),
  'home-owner-none': () => t('housing.owners.notCo', 'That character is not a co-owner.'),
  'home-not-main': () => t('housing.owners.notMain', 'Only the main owner can do that.'),
};
export function ownersRefusal(code, fallback) {
  const known = REFUSALS[code];
  if (known) return known();
  const said = typeof fallback === 'function' ? fallback(code) : String(code ?? '');
  const unknown = typeof fallback === 'function' && said === fallback('server');
  return typeof code === 'string' && code.startsWith('home-') && unknown ? t('housing.owners.failed', 'The owners of this house could not be changed.') : said;
}
