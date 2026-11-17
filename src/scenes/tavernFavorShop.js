// @ts-check
import { FAVOR_OFFERS } from '../net/tavernFavorLaw.js';
import { tavernProgress, restoreTavernProgress } from '../systems/guild/bunnyMembership.js';
import { addItem } from '../systems/inventory.js';
import { t } from '../systems/textManager.js';

/** @param {any} deps */
export function createTavernFavorShop(deps) {
  let busy = false, pending = null;
  const applied = new Set();
  const apply = (reply, txn) => {
    if (!reply?.ok || applied.has(txn)) return;
    applied.add(txn);
    restoreTavernProgress(reply.data.progress);
    if (reply.data.item) addItem(deps.entity().items, reply.data.item);
  };
  async function buy(offer) {
    if (busy) return;
    if (!deps.buy) { open(t('tavern.favor.realm', 'Load an online realm character to shop.')); return; }
    busy = true;
    pending ??= { offer: offer.id, txn: globalThis.crypto.randomUUID() };
    const request = pending;
    try {
      const r = await deps.buy(request, (reply) => apply(reply, request.txn));
      if (r?.ok) {
        apply(r, request.txn); pending = null;
        open(t('tavern.favor.bought', 'Purchased: {name}.', { name: FAVOR_OFFERS.find((x) => x.id === request.offer)?.name ?? offer.name }));
      } else {
        if (!r?.unknown) pending = null;
        open(r?.unknown ? t('tavern.favor.retry', 'The answer was lost. Reopen the shop to retry your purchase.') : r?.error === 'owned'
          ? t('tavern.favor.owned', 'You already own that title.') : r?.error === 'favor-short'
            ? t('tavern.favor.short', 'You do not have enough Favor Tokens.') : t('tavern.favor.failed', 'The Guild could not complete that purchase.'));
      }
    } catch { open(t('tavern.favor.retry', 'The answer was lost. Reopen the shop to retry your purchase.')); }
    finally { busy = false; }
  }
  function open(note = '') {
    const progress = tavernProgress();
    deps.choose({ lines: [t('tavern.favor.heading', 'Bards’ Guild — Favor Shop'), note,
      t('tavern.favor.balance', 'Favor Tokens: {n}', { n: progress.favor }),
      t('tavern.favor.heartsFire', "Legendary Bartender includes the Heart's Fire aura."),
      t('tavern.favor.rules', 'Earn 1 Favor Token per full song minute or completed shift. Songs and finished shifts raise city and regional reputation. Serve clean orders before patience runs out for streak tips (+5 base gold per step, up to +30, increased by guild rank).'),
      ...Object.entries(progress.cities).filter(([city]) => city === deps.city?.()).map(([, rep]) => t('tavern.favor.city', 'City goodwill: {n}/100', { n: rep }))],
    options: [...(pending ? [{ code: 'KeyR', label: t('tavern.favor.retryBuy', 'Retry pending purchase'), action: () => { const offer = FAVOR_OFFERS.find((x) => x.id === pending?.offer); if (offer) void buy(offer); } }] : FAVOR_OFFERS.map((offer, i) => ({
      code: `Digit${i + 1}`, label: `${t('tavern.favor.offer.' + offer.id, offer.name)}${offer.id === 'legendarybartender' ? t('tavern.favor.auraBundle', " + aura") : ''} — ${offer.price} Favor Tokens`, action: () => { void buy(offer); },
    }))), { code: 'Escape', label: t('tavern.favor.close', 'Close shop'), action: () => {} }] });
  }
  return { open };
}
