// @ts-check
import { WILD_TEXT } from '../wildZone.js';
import { itemLongName } from '../../items/itemInfo.js';
import { validLootList } from '../../items/loot.js';
import { addItem } from '../../items/inventory.js';
import { realmGoldAct } from '../../saves/realmSaves.js';
import { DeathScreen } from '../../ui/deathScreen.js';
import { playerEntity } from '../../characters/playerEntity.js';

/**
 * @param {{ townTalk: any, session: any, modes: () => any, wildAccount: any, checkpoint: () => any }} deps
 */
export function createWildEscrowHost({ townTalk, session, modes, wildAccount, checkpoint }) {
  const _wildEscrows = new Map();
  let _wildEscrowsAsked = false;
  const wildEscrowHeld = (e, { killer = null, name = null, say = true } = {}) => {
    if (!e?.r || _wildEscrows.has(e.r)) return;
    const shown = name ?? (e.rec ? itemLongName(validLootList([e.rec])?.[0] ?? e.rec) : null);
    const dueMs = Number.isFinite(e.back) ? e.back * 1000 : Date.now();
    _wildEscrows.set(e.r, { name: shown, killer, due: Math.max(Date.now(), dueMs), tries: 0, busy: false });
    if (say) townTalk.say(WILD_TEXT.heldNote(killer, shown, Math.max(1, Math.ceil((dueMs - Date.now()) / 60_000))));
  };
  const _wildCollects = new Map();
  const wildCollectHeard = (cr, at) => { if (at?.r && !_wildCollects.has(at.r)) _wildCollects.set(at.r, { cr, tries: 0, due: 0, busy: false }); };
  const wildCollected = (d) => {
    if (!d || d.again) return;
    const item = validLootList([d.item])?.[0] ?? null;
    if (!item) return;
    addItem((playerEntity.items ??= []), item);
    townTalk.say(WILD_TEXT.collected(itemLongName(item)));
  };
  const wildEscrowBack = (r, d) => {
    const e = _wildEscrows.get(r);
    _wildEscrows.delete(r);
    if (!d || d.again) return;
    const item = validLootList([d.item])?.[0] ?? null;
    if (item) addItem((playerEntity.items ??= []), item);
    townTalk.say(WILD_TEXT.heldBack(item ? itemLongName(item) : e?.name ?? null));
  };
  const wildEscrowFrame = () => {
    if (!session || session.lost) return;
    if (!_wildEscrowsAsked) {
      _wildEscrowsAsked = true;
      wildAccount.escrows({ character: session.id }).then((a) => { for (const e of (a?.ok ? a.data?.escrows : null) ?? []) wildEscrowHeld(e, { say: false }); }).catch(() => { _wildEscrowsAsked = false; });
    }
    // Acts on the player record never run on a dead frame.
    if (!(playerEntity.health > 0) || modes()?.deathUp?.() || townTalk.overlay instanceof DeathScreen) return;
    const now = Date.now();
    const again = (/** @type {any} */ res) => !res?.unknown && ['offline', 'server', 'rate', 'no-session'].includes(res?.error);
    for (const [r, e] of _wildEscrows) {
      if (e.busy || now < e.due) continue;
      e.busy = true;
      realmGoldAct({ session, checkpoint: () => checkpoint(), needsAnswer: true, call: (at) => wildAccount.reclaim({ r, realm: at }), apply: (a) => wildEscrowBack(r, a?.data ?? null) })
        .then((res) => {
          e.busy = false;
          if (res?.ok) return;
          if (res?.error === 'escrow-collected') { _wildEscrows.delete(r); townTalk.say(WILD_TEXT.heldTaken(e.killer, e.name)); return; }
          if (res?.error === 'escrow-wait') { e.due = Date.now() + Math.max(1, res.wait ?? 30) * 1000 + 1_000; return; }
          if (again(res) && e.tries < 8) { e.tries++; e.due = Date.now() + 15_000 * e.tries; return; }
          _wildEscrows.delete(r);
        })
        .catch(() => { e.busy = false; e.tries++; e.due = Date.now() + 30_000; });
    }
    for (const [r, c] of _wildCollects) {
      if (c.busy || now < c.due) continue;
      c.busy = true;
      realmGoldAct({ session, checkpoint: () => checkpoint(), needsAnswer: true, call: (at) => wildAccount.collect({ receipt: c.cr, realm: at }), apply: (a) => wildCollected(a?.data ?? null) })
        .then((res) => {
          c.busy = false;
          if (res?.ok) { _wildCollects.delete(r); return; }
          if (again(res) && c.tries < 8) { c.tries++; c.due = Date.now() + 5_000 * c.tries; return; }
          _wildCollects.delete(r);
          if (['escrow-late', 'escrow-returned', 'escrow-collected'].includes(res?.error)) townTalk.say(WILD_TEXT.collectLate());
        })
        .catch(() => { c.busy = false; c.tries++; c.due = Date.now() + 30_000; });
    }
  };
  return { held: wildEscrowHeld, collectHeard: wildCollectHeard, frame: wildEscrowFrame };
}
