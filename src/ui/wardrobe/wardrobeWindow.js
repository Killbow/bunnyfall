// @ts-check
// APPEARANCES (2026-10-27; bible/04-Characters/Wardrobe.md): THE WARDROBE'S WINDOW - the worn pieces that can take a look
// in a list, the one pressed beside it with every look of its kind the character has collected: its own look first (for
// nothing), then each look with its fee and a Wear press. A port window, not DFU's (it has none): the Reforge's shape
// (ui/reforgeWindow.js) in the Broker's classes, so both skins dress it - the Plus sheet carries its rules
// (enhancedPlusStyle.js WARDROBE_CSS), the classic skin lays the Broker's sheet and them. The door (ui/wardrobe/
// wardrobeDoor.js) mounts it; everything it does to the world is handed in (`wear`, `clear`), so it draws and asks.
import { wardrobePieces, looksForPiece, wearRefusal, wardrobeFee, lookName, slotName, lookStub, lookGroups, kindName } from '../../systems/appearances.js';
import { appearanceOf, lookOfPiece, lookKey } from '../../net/appearanceLaw.js';
import { inventoryItemImage } from '../../systems/item/itemTemplates.js';
import { totalGoldAmount } from '../../systems/court.js';
import { requestFittedIcon, fittedImg } from '../textureCanvas.js';
import { SLOT_BOX, screenDpr } from '../iconFit.js';
import { closeOnOutsideTap } from '../enhanced/enhancedOverlays.js';
import { overlayAction } from '../input.js';
import { injectEnhancedStyle, injectEnhancedFonts } from '../enhanced/enhancedStyle.js';
import { brokerSkinCss, BROKER_SKIN_STYLE_ID, refusePress } from '../brokerWindow.js';
import { WARDROBE_CSS } from '../enhanced/enhancedPlusStyle.js';
import { isEnhancedPlus } from '../../systems/uiSkin.js';
import { repaintKeepingScroll } from '../domRepaint.js';
import { t } from '../../systems/textManager.js';

/** @param {string} tag @param {string|null} [cls] @param {string|null} [text] */
const el = (tag, cls = null, text = null) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** The window's words, each read when it is said. */
export const WARDROBE_WORDS = Object.freeze({
  title: () => t('wardrobe.title', 'Wardrobe'),
  sub: () => t('wardrobe.sub', 'Give a piece you wear any look of its kind you have collected. Only how it looks changes.'),
  purse: (/** @type {number} */ gold) => t('wardrobe.purse', '{gold, number} gold', { gold }),
  close: () => t('wardrobe.close', 'Close'),
  own: () => t('wardrobe.own', 'Its own look'),
  ownNow: () => t('wardrobe.ownNow', 'Own look'),
  wearing: (/** @type {string} */ name) => t('wardrobe.wearing', 'Looks like {name}', { name }),
  wear: () => t('wardrobe.wear', 'Wear'),
  worn: () => t('wardrobe.worn', 'Worn'),
  free: () => t('wardrobe.free', 'Free'),
  fee: (/** @type {number} */ gold) => t('wardrobe.fee', '{gold, number} gold', { gold }),
  need: (/** @type {number} */ n) => t('wardrobe.need', 'Need {n, number} more gold', { n }),
  none: () => t('wardrobe.none', 'You wear nothing that can take a look. Armour, shields and weapons can.'),
  noLooks: () => t('wardrobe.noLooks', 'You have collected no other look of this kind yet. Every piece you hold adds its look.'),
  kindCount: (/** @type {string} */ kind, /** @type {number} */ held, /** @type {number} */ total) => t('wardrobe.kindCount', '{kind}: {held, number} of {total, number} looks collected', { kind, held, total }),
  done: (/** @type {string} */ piece, /** @type {string} */ look) => t('wardrobe.done', '{piece} now looks like {look}.', { piece, look }),
  cleared: (/** @type {string} */ piece) => t('wardrobe.cleared', '{piece} has its own look again.', { piece }),
  wearAria: (/** @type {string} */ look, /** @type {number} */ gold) => t('wardrobe.wearAria', 'Wear {look} for {gold, number} gold', { look, gold }),
  clearAria: (/** @type {string} */ piece) => t('wardrobe.clearAria', 'Give {piece} its own look back', { piece }),
});
/** Why a Wear is refused, by the law's word (systems/appearances.js wearRefusal) - its reason, read when said. */
export function wardrobeRefusal(/** @type {string|null} */ why) {
  switch (why) {
    case 'gold': return t('wardrobe.refused.gold', 'Not enough gold');
    case 'worn': return t('wardrobe.refused.worn', 'You no longer wear that piece');
    case 'same': return t('wardrobe.refused.same', 'It already wears that look');
    case 'uncollected': return t('wardrobe.refused.uncollected', 'You have not collected that look');
    default: return t('wardrobe.refused.other', 'That look does not fit this piece');
  }
}

/** The classic skin lays the Broker's sheet (the rows are his classes) and the window's own rules; Plus carries both. */
export const WARDROBE_SKIN_STYLE_ID = 'wardrobe-skin-style';
function injectSkinStyle(doc = document) {
  if (isEnhancedPlus()) return;
  const has = (/** @type {string} */ id) => !!doc.getElementById?.(id) || [...(doc.head?.children ?? [])].some((c) => c.id === id);
  /** @type {Array<[string, () => string]>} */
  const sheets = [[BROKER_SKIN_STYLE_ID, brokerSkinCss], [WARDROBE_SKIN_STYLE_ID, () => WARDROBE_CSS]];
  for (const [id, css] of sheets) {
    if (has(id)) continue;
    const st = doc.createElement('style');
    st.id = id;
    st.textContent = css();
    (doc.head ?? doc.body).append(st);
  }
}

/** A piece's or a look's picture - the classic icon of what it is drawn as - fitted, or null while it loads. */
function pictureOf(/** @type {any} */ drawn, /** @type {any} */ wearer, /** @type {() => void} */ onReady) {
  const img = drawn ? inventoryItemImage(drawn, wearer ?? undefined) : null;
  return img?.archive ? requestFittedIcon(img.archive, img.record, { box: SLOT_BOX.broker, dpr: screenDpr(), dye: img.dye, dyeTarget: img.dyeTarget, onReady }) : null;
}

/**
 * Mount the window in the door's host.
 * @param {HTMLElement} host
 * @param {{ entity: any, wear: (item: any, look: any) => { ok: boolean, reason?: string|null }, clear: (item: any) => { ok: boolean, reason?: string|null },
 *   nameOf?: (item: any) => string, picture?: ((item: any) => any) | null, onExit?: (() => void) | null }} deps
 * @returns {{ repaint: () => void, unmount: () => void }}
 */
export function mountWardrobeWindow(host, deps) {
  injectEnhancedStyle();
  injectEnhancedFonts();
  injectSkinStyle();
  const nameOf = deps.nameOf ?? ((/** @type {any} */ it) => String(it?.name ?? ''));
  const exit = () => deps.onExit?.();
  /** @type {any} */
  let picked = null;
  /** @type {{ ok: boolean, text: string } | null} */
  let note = null;
  let alive = true;
  const shell = el('div', 'broker-shell wardrobe-shell');
  shell.id = 'wardrobe';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-label', WARDROBE_WORDS.title());
  const win = el('div', 'broker-win');
  shell.append(win);
  const head = el('header', 'broker-head');
  const title = el('div', 'broker-title');
  const noteLine = el('p', 'broker-note');
  noteLine.setAttribute('aria-live', 'polite');
  title.append(el('h2', null, WARDROBE_WORDS.title()), el('p', 'broker-sub', WARDROBE_WORDS.sub()), noteLine);
  const purse = el('span', 'broker-purse');
  const close = el('button', 'act broker-close', WARDROBE_WORDS.close());
  close.setAttribute('type', 'button');
  close.setAttribute('data-focus', 'wardrobe-close');
  close.onclick = (e) => { e.stopPropagation(); exit(); };
  head.append(title, purse, close);
  const body = el('div', 'broker-body');
  win.append(head, body);

  const picture = (/** @type {any} */ drawn) => (deps.picture !== undefined ? deps.picture?.(drawn) ?? null : pictureOf(drawn, deps.entity, () => repaint()));
  const frameOf = (/** @type {any} */ drawn, /** @type {string} */ name) => {
    const frame = el('span', 'broker-frame');
    const tile = el('span', 'tile');
    const pic = picture(drawn);
    if (pic && typeof pic === 'object') tile.append(fittedImg(pic));
    else tile.textContent = name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
    frame.append(tile);
    return frame;
  };
  const pressable = (/** @type {any} */ row, /** @type {() => void} */ pick) => {
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.onclick = pick;
    row.onkeydown = (/** @type {any} */ e) => { if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault?.(); pick(); } };
  };
  const drawNote = () => {
    noteLine.textContent = note ? note.text : '';
    noteLine.className = `broker-note${note?.ok ? ' ok' : ''}`;
    if (!note) noteLine.setAttribute('hidden', ''); else noteLine.removeAttribute?.('hidden');
  };
  const refused = (/** @type {string} */ reason) => { note = { ok: false, text: reason }; drawNote(); };
  /** What a piece is drawn as now: its look's name, or its own. */
  const lookNow = (/** @type {any} */ item) => { const a = appearanceOf(item); return a ? WARDROBE_WORDS.wearing(lookName(a)) : WARDROBE_WORDS.ownNow(); };
  /** A piece's look drawn, for its picture: the stub of its look, else the piece. */
  const drawnStub = (/** @type {any} */ item) => { const a = appearanceOf(item); return a ? lookStub(a) : item; };

  function draw() {
    const entity = deps.entity;
    const gold = totalGoldAmount(entity);
    purse.textContent = WARDROBE_WORDS.purse(Math.max(0, Math.trunc(gold) || 0));
    drawNote();
    for (const c of [...body.children]) c.remove();
    const pieces = wardrobePieces(entity);
    if (!pieces.some((p) => p.item === picked)) picked = pieces[0]?.item ?? null;
    const list = el('ul', 'broker-offers wardrobe-pieces');
    list.setAttribute('role', 'list');
    if (!pieces.length) {
      const empty = el('li', 'broker-insignia-head wardrobe-empty', WARDROBE_WORDS.none());
      empty.setAttribute('role', 'presentation');
      list.append(empty);
    }
    for (const p of pieces) {
      const row = el('li', `broker-offer wardrobe-piece${p.item === picked ? ' on' : ''}`);
      row.setAttribute('aria-pressed', p.item === picked ? 'true' : 'false');
      row.setAttribute('data-focus', `wardrobe-piece-${p.slot}`);
      const text = el('div', 'broker-offer-body');
      text.append(el('span', 'broker-name', nameOf(p.item)), el('span', 'broker-set', `${slotName(p.slot)} · ${lookNow(p.item)}`));
      row.append(frameOf(drawnStub(p.item), nameOf(p.item)), text);
      pressable(row, () => { picked = p.item; note = null; repaint(); });
      list.append(row);
    }
    body.append(list);
    if (picked) body.append(card(entity, picked, gold));
  }
  /** THE PIECE PICKED: its own look, then every collected look of its kind, each its fee and its press. */
  function card(/** @type {any} */ entity, /** @type {any} */ item, /** @type {number} */ gold) {
    const box = el('div', 'card broker-card wardrobe-card');
    box.append(el('h3', null, nameOf(item)));
    const kind = wardrobePieces(entity).find((p) => p.item === item)?.kind ?? '';
    const group = lookGroups(entity).find((g) => g.kind === kind);
    if (group) box.append(el('p', 'wardrobe-count', WARDROBE_WORDS.kindCount(kindName(kind), group.held, group.total)));
    const ul = el('ul', 'wardrobe-looks');
    ul.setAttribute('role', 'list');
    const worn = appearanceOf(item);
    // its own look: free, and Worn while it wears no other
    const own = lookOfPiece(item);
    const ownRow = el('li', 'wardrobe-look own');
    const ownPress = el('button', 'act broker-buy wardrobe-press', worn ? WARDROBE_WORDS.wear() : WARDROBE_WORDS.worn());
    ownPress.setAttribute('type', 'button');
    ownPress.setAttribute('data-focus', 'wardrobe-own');
    ownPress.setAttribute('aria-label', worn ? WARDROBE_WORDS.clearAria(nameOf(item)) : `${WARDROBE_WORDS.worn()} - ${WARDROBE_WORDS.own()}`);
    if (worn) {
      ownPress.onclick = (/** @type {any} */ e) => {
        e?.stopPropagation?.();
        const done = deps.clear(item);
        note = done.ok ? { ok: true, text: WARDROBE_WORDS.cleared(nameOf(item)) } : { ok: false, text: wardrobeRefusal(done.reason ?? null) };
        repaint();
      };
    } else ownPress.setAttribute('aria-current', 'true');
    ownRow.append(frameOf(own ? lookStub(own) : item, nameOf(item)), el('span', 'wardrobe-name', WARDROBE_WORDS.own()), el('span', 'broker-price', WARDROBE_WORDS.free()), ownPress);
    ul.append(ownRow);
    const looks = looksForPiece(entity, item);
    for (const look of looks) {
      const name = lookName(look), fee = wardrobeFee(look), on = worn === look;
      const row = el('li', `wardrobe-look${on ? ' on' : ''}`);
      const why = on ? null : wearRefusal(entity, item, look);
      const press = el('button', 'act broker-buy wardrobe-press', on ? WARDROBE_WORDS.worn() : why === 'gold' ? WARDROBE_WORDS.need(fee - Math.trunc(gold)) : WARDROBE_WORDS.wear());
      press.setAttribute('type', 'button');
      press.setAttribute('data-focus', `wardrobe-look-${lookKey(look)}`);
      press.setAttribute('aria-label', on ? `${WARDROBE_WORDS.worn()} - ${name}` : WARDROBE_WORDS.wearAria(name, fee));
      if (on) press.setAttribute('aria-current', 'true');
      else {
        press.onclick = (/** @type {any} */ e) => {
          e?.stopPropagation?.();
          const done = deps.wear(item, look);
          note = done.ok ? { ok: true, text: WARDROBE_WORDS.done(nameOf(item), name) } : { ok: false, text: wardrobeRefusal(done.reason ?? null) };
          repaint();
        };
        if (why) refusePress(press, wardrobeRefusal(why), refused);   // MENU-ORDER: a refused press says why, pressed
      }
      row.append(frameOf(lookStub(look), name), el('span', 'wardrobe-name', name), el('span', 'broker-price', WARDROBE_WORDS.fee(fee)), press);
      ul.append(row);
    }
    box.append(ul);
    if (!looks.length) box.append(el('p', 'boundline wardrobe-nolooks', WARDROBE_WORDS.noLooks()));
    return box;
  }
  const repaint = () => { if (alive) repaintKeepingScroll(body, draw, { focus: true }); };
  draw();
  host.append(shell);
  /** @type {any} */ (body.querySelector?.('.wardrobe-piece.on'))?.focus?.();   // the keyboard starts on the piece picked
  const onKey = (/** @type {any} */ e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (overlayAction(e) === 'back') { e.preventDefault(); e.stopPropagation(); exit(); }
  };
  globalThis.addEventListener('keydown', onKey, { capture: true });
  const offOutside = closeOnOutsideTap(shell, '.broker-win', exit);
  return {
    repaint,
    unmount() {
      if (!alive) return;
      alive = false;
      globalThis.removeEventListener('keydown', onKey, { capture: true });
      offOutside();
      shell.remove();
    },
  };
}
