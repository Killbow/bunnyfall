// A house offered at its own door. The service keeps the gold, the goods and the owner.
// ENH-NOTICE3: it builds the game's own windows, so it lives under ui/ - no system names a window.
// The questions are the game's own windows. A form on the page sits under the canvas and cannot be used.

import { ChoiceWindow } from './talkWindow.js';
import { InputMessageBoxWindow } from './inputMessageBox.js';
import { walletReserve } from '../net/realmGoldLaw.js';
import { t } from './textManager.js';
import { charNameOf, resolvedOf, offerAnswerKind } from '../homes/homeOwnerLaw.js';

const PRICE_MAX = 100_000_000;

/**
 * The owner's door: who receives the house, for how much, and whether its furnishings and goods go with it.
 * `giving` is an offer already out (its id). `show` is the town's overlay slot.
 * @param {number} mapId
 * @param {number} buildingKey
 * @param {{ onlineHomes?: { transfer?: Function }, realmAct?: Function }} host
 * @param {(text: string) => void} say
 * @param {(code: string) => string} refusal
 * @param {string | null} [giving]
 * @param {(win: object) => void} [show]
 */
export function openHomeTransfer(mapId, buildingKey, host, say, refusal, giving = null, show = null) {
  const tell = typeof say === 'function' ? say : () => {};
  const word = typeof refusal === 'function' ? refusal : (c) => String(c ?? '');
  const mount = typeof show === 'function' ? show : () => {};
  if (!host?.onlineHomes?.transfer) { tell(t('housing.transfer.signedOut', 'You are not signed in.')); return false; }
  if (giving) {
    mount(new ChoiceWindow({
      lines: [t('housing.transfer.offerOut', 'An offer for this house is already out.')],
      options: [
        { code: 'KeyW', label: t('housing.transfer.withdraw', 'W: withdraw the offer'), action: () => { void send(host, { op: 'cancel', id: giving, mapId, buildingKey }, tell, word); } },
        { code: 'Escape', label: t('housing.transfer.leaveIt', 'Esc: leave it'), action: () => {} },
      ],
    }));
    return true;
  }
  askName(mapId, buildingKey, host, tell, word, mount);
  return true;
}

/** The account named on the offer: accept it, or decline it. */
export function answerHomeTransfer(mapId, buildingKey, home, accept, host, say, refusal, show = null, wallet = null) {
  const offer = home?.offer;
  if (!offer?.id) return false;
  const tell = typeof say === 'function' ? say : () => {};
  const word = typeof refusal === 'function' ? refusal : (c) => String(c ?? '');
  const mount = typeof show === 'function' ? show : () => {};
  const price = Math.max(0, Math.floor(Number(offer.price) || 0));
  const kept = `${offer.keepDecor ? t('housing.transfer.furnishingsStay', 'The furnishings stay.') : t('housing.transfer.furnishingsGo', 'The furnishings do not stay.')}${offer.keepItems ? t('housing.transfer.goodsStay', ' The goods stay.') : ''}`;
  const line = accept ? (price > 0 ? t('housing.transfer.takePriced', 'Take this house for {price} gold? {kept}', { price, kept }) : t('housing.transfer.takeFree', 'Take this house? {kept}', { kept })) : t('housing.transfer.declineAsk', 'Decline this house?');
  const op = accept ? 'accept' : 'decline';
  mount(new ChoiceWindow({
    lines: [line],
    options: [
      { code: 'KeyY', label: accept ? t('housing.transfer.yAccept', 'Y: accept') : t('housing.transfer.yDecline', 'Y: decline'), action: () => { void send(host, { op, id: offer.id, mapId, buildingKey }, tell, word, accept ? { price, wallet } : null); } },
      { code: 'Escape', label: t('housing.transfer.notNow', 'Esc: not now'), action: () => {} },
    ],
  }));
  return true;
}

function askName(mapId, buildingKey, host, tell, word, mount) {
  mount(new InputMessageBoxWindow({
    lines: [t('housing.transfer.title', 'Transfer this house')],
    label: t('housing.transfer.toCharacter', 'To character: '),
    maxCharacters: 32,
    onSubmit: (raw) => {
      const to = charNameOf(raw);
      if (!to) { tell(t('housing.transfer.badName', 'That is not a character name.')); askName(mapId, buildingKey, host, tell, word, mount); return; }
      void resolveName(mapId, buildingKey, host, tell, word, mount, to);
    },
  }));
}

async function resolveName(mapId, buildingKey, host, tell, word, mount, to) {
  let r;
  try { r = await host.onlineHomes.transfer({ op: 'resolve', mapId, buildingKey, toName: to }); } catch { r = null; }
  const found = resolvedOf(r);
  if (!found.matches.length) { tell(r?.ok === false || r?.error ? word(r?.error ?? 'server') : word('home-no-char')); return; }
  if (found.matches.length === 1) { chooseTarget(mapId, buildingKey, host, tell, word, mount, found.matches[0]); return; }
  pickCharacter(mapId, buildingKey, host, tell, word, mount, to, found);
}

function chooseTarget(mapId, buildingKey, host, tell, word, mount, m) {
  const who = { to: m.name, toChar: m.char };
  if (m.own) confirmMove(mapId, buildingKey, host, tell, word, mount, who);
  else askPrice(mapId, buildingKey, host, tell, word, mount, who);
}

function confirmMove(mapId, buildingKey, host, tell, word, mount, who) {
  mount(new ChoiceWindow({
    lines: [t('housing.transfer.moveAsk', 'Make {to} the main owner of this house? You become a co-owner. Access for your other characters does not change.', { to: who.to })],
    options: [
      { code: 'KeyY', label: t('housing.transfer.yesMove', 'Y: make {to} the main owner', { to: who.to }), action: () => { void offer(mapId, buildingKey, host, tell, word, { ...who, price: 0, keepDecor: true, keepItems: true }); } },
      { code: 'Escape', label: t('housing.transfer.cancel', 'Esc: cancel'), action: () => {} },
    ],
  }));
}

function askPrice(mapId, buildingKey, host, tell, word, mount, who) {
  mount(new InputMessageBoxWindow({
    lines: [t('housing.transfer.offerTo', 'Offer the house to {to}.', { to: who.to })],
    label: t('housing.transfer.price', 'Price in gold (0 is a gift): '),
    numeric: true,
    maxCharacters: 9,
    onSubmit: (raw) => {
      const price = Math.max(0, Math.min(PRICE_MAX, Math.floor(Number(raw) || 0)));
      askKeep(mapId, buildingKey, host, tell, word, mount, who, price);
    },
  }));
}

function askKeep(mapId, buildingKey, host, tell, word, mount, who, price) {
  mount(new ChoiceWindow({
    lines: [t('housing.transfer.leaveFurnishings', 'Leave the furnishings with the house?')],
    options: [
      { code: 'KeyY', label: t('housing.transfer.yesLeave', 'Y: leave them'), action: () => askGoods(mapId, buildingKey, host, tell, word, mount, who, price) },
      { code: 'KeyN', label: t('housing.transfer.noTake', 'N: take them back'), action: () => confirm(mapId, buildingKey, host, tell, word, mount, who, price, false, false) },
      { code: 'Escape', label: t('housing.transfer.cancel', 'Esc: cancel'), action: () => {} },
    ],
  }));
}

function askGoods(mapId, buildingKey, host, tell, word, mount, who, price) {
  mount(new ChoiceWindow({
    lines: [t('housing.transfer.leaveGoods', 'Leave the goods in its chests and stalls?')],
    options: [
      { code: 'KeyY', label: t('housing.transfer.yesGoods', 'Y: leave the goods'), action: () => confirm(mapId, buildingKey, host, tell, word, mount, who, price, true, true) },
      { code: 'KeyN', label: t('housing.transfer.noGoods', 'N: keep the goods'), action: () => confirm(mapId, buildingKey, host, tell, word, mount, who, price, true, false) },
      { code: 'Escape', label: t('housing.transfer.cancel', 'Esc: cancel'), action: () => {} },
    ],
  }));
}

function confirm(mapId, buildingKey, host, tell, word, mount, who, price, keepDecor, keepItems) {
  const kept = `${keepDecor ? t('housing.transfer.furnishingsStayLow', 'furnishings stay') : t('housing.transfer.furnishingsReturn', 'furnishings return')}${keepItems ? t('housing.transfer.goodsAlso', ', goods stay') : ''}`;
  mount(new ChoiceWindow({
    lines: [t('housing.transfer.confirm', 'Offer this house to {to} for {price} gold. {kept}.', { to: who.to, price, kept })],
    options: [
      { code: 'KeyY', label: t('housing.transfer.yesOffer', 'Y: offer it'), action: () => { void offer(mapId, buildingKey, host, tell, word, { ...who, price, keepDecor, keepItems }); } },
      { code: 'Escape', label: t('housing.transfer.cancel', 'Esc: cancel'), action: () => {} },
    ],
  }));
}

async function offer(mapId, buildingKey, host, tell, word, fields) {
  const { to, ...rest } = fields;
  await send(host, { op: 'offer', mapId, buildingKey, toName: to, ...rest }, tell, word);
}

function pickCharacter(mapId, buildingKey, host, tell, word, mount, to, { matches, more }) {
  const options = matches.map((m, i) => ({
    code: `Digit${i + 1}`,
    label: pickLabel(m, i + 1),
    action: () => chooseTarget(mapId, buildingKey, host, tell, word, mount, m),
  }));
  options.push({ code: 'Escape', label: t('housing.transfer.cancel', 'Esc: cancel'), action: () => {} });
  const lines = [t('housing.transfer.pickAsk', 'Several characters are named {to}. Which one?', { to })];
  if (more) lines.push(t('housing.transfer.pickMore', 'Only the first {n} matches are shown.', { n: matches.length }));
  mount(new ChoiceWindow({ lines, options }));
}

function pickLabel(m, n) {
  if (m.own) return m.note ? t('housing.transfer.pickOwnNote', '{n}: {name} (yours, {note})', { n, name: m.name, note: m.note }) : t('housing.transfer.pickOwn', '{n}: {name} (yours)', { n, name: m.name });
  return m.account ? t('housing.transfer.pickRow', '{n}: {name}, account {account}', { n, name: m.name, account: m.account }) : `${n}: ${m.name}`;
}

async function send(host, body, tell, word, pay = null) {
  const homes = host.onlineHomes;
  const act = host.realmAct;
  const price = Math.max(0, Math.floor(Number(pay?.price) || 0));
  const wallet = pay?.wallet ?? null;
  if (body.op === 'accept' && price > 0 && !(wallet?.gold >= price)) { tell(word('realm-gold')); return { ok: false, error: 'realm-gold' }; }
  const held = body.op === 'accept' && price > 0 ? walletReserve(wallet, price) : null;
  let r;
  try {
    r = !act || body.op !== 'accept'
      ? await homes.transfer(body)
      : await act({
        needsAnswer: true,
        reserve: held?.reserve ?? null,
        apply: (res) => { if (res?.repeat || res?.data?.repeat) held?.back(); },
        call: (at) => homes.transfer({ ...body, realm: at }),
      });
  } catch {
    tell(t('housing.transfer.unsent', 'The offer could not be sent.'));
    return { ok: false, error: 'server' };
  }
  const kind = body.op === 'offer' ? offerAnswerKind(r) : null;
  if (kind === 'refused' || (!kind && !r?.ok)) tell(word(r?.error ?? r?.data?.error ?? 'server'));
  else if (kind === 'moved') tell(t('housing.transfer.moved', '{to} is now the main owner of this house.', { to: r?.data?.name ?? r?.name ?? body.toName }));
  else if (body.op === 'offer') tell(t('housing.transfer.sent', 'The offer is out. It lasts three days.'));
  else if (body.op === 'accept') tell(t('housing.transfer.yours', 'The house is yours.'));
  else if (body.op === 'decline') tell(t('housing.transfer.declined', 'The offer is declined.'));
  else if (body.op === 'cancel') tell(t('housing.transfer.withdrawn', 'The offer is withdrawn.'));
  return r;
}
