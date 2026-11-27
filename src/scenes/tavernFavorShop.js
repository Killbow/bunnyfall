// @ts-check
import { FAVOR_OFFERS } from '../net/tavernFavorLaw.js';
import { tavernProgress, restoreTavernProgress } from '../guilds/bunnyMembership.js';
import { addItem } from '../items/inventory.js';
import { t } from '../ui/textManager.js';

/** @param {any} deps */
export function createTavernFavorShop(deps) {
  let busy = false, pending = null, page = 0;
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
        open(r?.unknown ? t('tavern.favor.retry', 'Your purchase could not be confirmed. Reopen the shop to retry it.') : r?.error === 'owned'
          ? t('tavern.favor.owned', 'You already own that title.') : r?.error === 'favor-short'
            ? t('tavern.favor.short', 'You do not have enough Favor Tokens.') : t('tavern.favor.failed', 'The Guild could not complete that purchase.'));
      }
    } catch { open(t('tavern.favor.retry', 'Your purchase could not be confirmed. Reopen the shop to retry it.')); }
    finally { busy = false; }
  }
  function open(note = '') {
    const progress = tavernProgress();
    deps.choose({ lines: [t('tavern.favor.heading', 'Bards\' Guild: Favor Shop'), note,
      t('tavern.favor.balance', 'Favor Tokens: {n}', { n: progress.favor }),
      t('tavern.favor.heartsFire', "Legendary Bartender includes the Heart's Fire aura."),
      t('tavern.favor.rules', 'Earn 1 Favor Token per full song minute or served order. Songs and completed shifts raise city and regional reputation. Clean orders served in time earn streak tips (+5 base gold per step, up to +30, more with guild rank).'),
      ...Object.entries(progress.cities).filter(([city]) => city === deps.city?.()).map(([, rep]) => t('tavern.favor.city', 'City goodwill: {n}/100', { n: rep }))],
    options: [...(pending ? [{ code: 'KeyR', label: t('tavern.favor.retryBuy', 'Retry pending purchase'), action: () => { const offer = FAVOR_OFFERS.find((x) => x.id === pending?.offer); if (offer) void buy(offer); } }] : FAVOR_OFFERS.slice(page * 3, page * 3 + 3).map((offer, i) => ({
      code: `Digit${i + 1}`, label: `${t('tavern.favor.offer.' + offer.id, offer.name)}${offer.id === 'legendarybartender' ? t('tavern.favor.auraBundle', " + aura") : ''} — ${offer.price} Favor Tokens`, action: () => { void buy(offer); },
    }))), ...(!pending && page > 0 ? [{ code: 'ArrowLeft', label: t('tavern.favor.previous', 'Previous rewards'), action: () => { page--; open(); } }] : []),
      ...(!pending && (page + 1) * 3 < FAVOR_OFFERS.length ? [{ code: 'ArrowRight', label: t('tavern.favor.next', 'More rewards'), action: () => { page++; open(); } }] : []),
      ...(deps.services && !pending ? [{ code: 'KeyG', label: t('tavern.favor.services', 'Guild services: names, flourishes, and home names'), action: () => deps.services() }] : []),   // BARDS' GUILD (bardServicesShop.js)
      { code: 'Escape', label: t('tavern.favor.close', 'Close shop'), action: () => {} }] });
  }
  return { open };
}
