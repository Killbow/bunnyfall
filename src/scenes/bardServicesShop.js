// @ts-check
// BARDS' GUILD SERVICES, paid in Favor Tokens (law: net/bardServiceLaw.js; service: server-account/src/bardServices.js).
// The Guild's second counter beside the Favor shop (tavernFavorShop.js): rename a piece of the pack, write a cosmetic
// flourish on one, rename a home you own. The window picks and words the request; the service charges the Favor and
// writes the result in one batch, so a refusal costs nothing.
import {
  BARD_SERVICE_PRICES, BARD_ITEM_NAME_MAX, BARD_BUFF_NAME_MAX, BARD_BUFF_TEXT_MAX, BARD_HOME_NAME_MAX, BARD_BUFF_COSMETIC_TEXT,
  bardItemNameOf, bardHomeNameOf, bardBuffOf, bardWritable,
} from '../net/bardServiceLaw.js';
import { accountRefusalText } from '../net/accountClient.js';
import { createTradePack } from '../trade/tradePack.js';
import { tavernProgress, restoreTavernProgress } from '../guilds/bunnyMembership.js';
import { itemLongName } from '../items/itemInfo.js';
import { t } from '../ui/textManager.js';

/**
 * @param {{ entity: () => any, act: ((body: any, apply: (r: any) => void) => Promise<any>) | null, homes: (() => Promise<any[]>) | null,
 *   choose: (view: any) => void, flow: (boxes: any[]) => void, back?: () => void }} deps
 */
export function createBardServices(deps) {
  let busy = false;
  /** A request asked again after a lost answer keeps its receipt, so the service answers it once. @type {Map<string, string>} */
  const receipts = new Map();
  const price = (op) => BARD_SERVICE_PRICES[op];
  const favorNow = () => tavernProgress().favor;
  const shortNote = (op) => t('bard.svc.short', 'That costs {n} Favor Tokens. You have {have}.', { n: price(op), have: favorNow() });

  /** Run one paid request; `local(r)` writes what the answer changes in the pack. Re-opens the counter with the outcome. */
  async function run(op, body, local) {
    if (busy) return;
    if (!deps.act) { menu(t('bard.svc.realm', 'Load an online realm character to use the Guild’s services.')); return; }
    if (favorNow() < price(op)) { menu(shortNote(op)); return; }
    busy = true;
    const key = JSON.stringify([op, body]);
    const txn = receipts.get(key) ?? globalThis.crypto.randomUUID();
    receipts.set(key, txn);
    try {
      const r = await deps.act({ ...body, op, txn }, (reply) => { if (reply?.ok && reply.data) { restoreTavernProgress(reply.data.progress); local(reply.data); } });
      if (r?.ok) { receipts.delete(key); busy = false; menu(t('bard.svc.done', 'Done. {n} Favor Tokens paid.', { n: price(op) })); return; }
      if (r?.unknown) { busy = false; menu(t('bard.svc.retry', 'No response from the server. Try again to complete your request without paying twice.')); return; }
      receipts.delete(key);
      busy = false;
      menu(accountRefusalText(r?.error));
    } catch {
      busy = false;
      menu(t('bard.svc.retry', 'No response from the server. Try again to complete your request without paying twice.'));
    }
  }

  /** The pack's pieces the Guild will write on, each with how the picker names it. */
  function writableItems() {
    const items = (deps.entity()?.items ?? []).filter((it) => bardWritable(it));
    return items.map((item) => ({ item, label: `${itemLongName(item)}${(item.stackCount ?? 1) > 1 ? ` × ${item.stackCount}` : ''}${item.bardBuff ? ' ✦' : ''}` }));
  }
  /** One item's wire record and where it stands in the save: what the service matches against the realm's record. */
  function itemRequest(item) {
    const pack = createTradePack(deps.entity());
    const entries = [{ item, count: Math.max(1, item.stackCount ?? 1) }];
    const offered = pack.wire(entries)?.[0] ?? null, pick = pack.picks(entries)[0];
    return offered && pick >= 0 ? { pick, item: offered } : null;
  }
  const field = (rows, max, initial, onInput) => ({ rows, field: { numeric: false, maxCharacters: max, initial }, onInput });
  const note = (text, then) => [{ rows: [text], onClick: () => { then?.(); return null; } }];

  function pickItem(onPicked) {
    const list = writableItems();
    if (!list.length) { menu(t('bard.svc.noItems', 'You have no items in your pack that the Guild can inscribe.')); return; }
    deps.flow([{ picker: list.map((x) => x.label), onPick: (i) => { const item = list[i]?.item; if (item) onPicked(item); return null; }, onCancel: () => { menu(); return null; } }]);
  }

  function renameItem() {
    pickItem((item) => {
      deps.flow([field([t('bard.svc.nameAsk', 'Name for this item ({n} Favor Tokens). Up to {max} characters.', { n: price('item-name'), max: BARD_ITEM_NAME_MAX })],
        BARD_ITEM_NAME_MAX, item.bardName ?? '', (text) => {
          const clean = bardItemNameOf(text);
          if ('error' in clean) return note(accountRefusalText(clean.error), () => menu());
          const req = itemRequest(item);
          if (!req) { menu(accountRefusalText('bard-item-gone')); return null; }
          void run('item-name', { ...req, name: clean.text }, () => { item.bardName = clean.text; });
          return null;
        })]);
    });
  }

  function writeFlourish() {
    pickItem((item) => {
      const intro = t('bard.svc.buffIntro', 'A flourish adds custom text to the item\'s card. {cosmetic}', { cosmetic: BARD_BUFF_COSMETIC_TEXT });
      deps.flow([field([intro, t('bard.svc.buffNameAsk', 'Name of the flourish ({n} Favor Tokens). Up to {max} characters.', { n: price('item-buff'), max: BARD_BUFF_NAME_MAX })],
        BARD_BUFF_NAME_MAX, item.bardBuff?.name ?? '', (name) => [field([t('bard.svc.buffTextAsk', 'What does it say? Up to {max} characters.', { max: BARD_BUFF_TEXT_MAX })],
          BARD_BUFF_TEXT_MAX, item.bardBuff?.text ?? '', (text) => {
            const clean = bardBuffOf({ name, text });
            if ('error' in clean) return note(accountRefusalText(clean.error), () => menu());
            const req = itemRequest(item);
            if (!req) { menu(accountRefusalText('bard-item-gone')); return null; }
            void run('item-buff', { ...req, buff: clean.buff }, () => { item.bardBuff = clean.buff; });
            return null;
          })])]);
    });
  }

  async function renameHome() {
    const homes = deps.homes ? await deps.homes().catch(() => []) : [];
    if (!homes.length) { menu(t('bard.svc.noHomes', 'You do not own a home to rename.')); return; }
    const label = (h) => `${h.title || t('bard.svc.homeIn', 'Home in {town}', { town: h.town || t('bard.svc.aTown', 'a town') })}${h.title && h.town ? ` (${h.town})` : ''}`;
    deps.flow([{ picker: homes.map(label), onCancel: () => { menu(); return null; }, onPick: (i) => {
      const home = homes[i];
      if (!home) return null;
      return [field([t('bard.svc.homeAsk', 'New name for this home ({n} Favor Tokens). Up to {max} characters.', { n: price('home-name'), max: BARD_HOME_NAME_MAX })],
        BARD_HOME_NAME_MAX, home.title ?? '', (text) => {
          const clean = bardHomeNameOf(text);
          if ('error' in clean) return note(accountRefusalText(clean.error), () => menu());
          void run('home-name', { mapId: home.mapId, buildingKey: home.buildingKey, name: clean.text }, () => {});
          return null;
        })];
    } }]);
  }

  function menu(message = '') {
    deps.choose({
      lines: [t('bard.svc.heading', 'Bards\' Guild: Services'), message,
        t('bard.svc.balance', 'Favor Tokens: {n}', { n: favorNow() }),
        t('bard.svc.rules', 'The Guild\'s scribes work for Favor Tokens. Custom names and flourishes are cosmetic only and do not change stats, spells, or enchantments.')].filter(Boolean),
      options: [
        { code: 'Digit1', label: t('bard.svc.opName', 'Rename an item ({n} Favor Tokens)', { n: price('item-name') }), action: renameItem },
        { code: 'Digit2', label: t('bard.svc.opBuff', 'Write a flourish on an item ({n} Favor Tokens)', { n: price('item-buff') }), action: writeFlourish },
        { code: 'Digit3', label: t('bard.svc.opHome', 'Rename a home you own ({n} Favor Tokens)', { n: price('home-name') }), action: () => { void renameHome(); } },
        { code: 'Escape', label: t('bard.svc.close', 'Back'), action: () => deps.back?.() },
      ],
    });
  }
  return { open: menu };
}
