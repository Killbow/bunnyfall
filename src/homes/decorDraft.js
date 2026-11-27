// @ts-check
import { decorGoldMove, mintDecorId } from '../net/decorLaw.js';
import { t } from '../ui/textManager.js';

const shapeOf = (p) => JSON.stringify({
  model: p?.model ?? null,
  flat: p?.flat ?? null,
  item: p?.item ?? null,
  pos: p?.pos ?? null,
  rot: p?.rot ?? null,
  scale: p?.scale ?? null,
  light: p?.light ?? null,
  storage: !!p?.storage,
  paid: p?.paid ?? 0,
  station: p?.station ?? null,
  name: p?.name ?? null,
});

// Two ids make 24 characters, enough for DECOR_TXN_RE in net/decorLaw.js.
export function mintDecorTxn(rand = Math.random) {
  return `${mintDecorId(rand)}${mintDecorId(rand)}`;
}

/**
 * @param {any[]} before
 * @param {any[]} after
 */
export function decorDelta(before, after) {
  const was = new Map((before ?? []).filter((p) => p?.id).map((p) => [p.id, p]));
  const now = new Map((after ?? []).filter((p) => p?.id).map((p) => [p.id, p]));
  const put = [];
  const drop = [];
  for (const [id, p] of was) if (!now.has(id)) drop.push(id);
  for (const [id, p] of now) {
    const old = was.get(id);
    if (!old || shapeOf(old) !== shapeOf(p)) put.push(p);
  }
  return { put, drop };
}

// A guild hall spends `pay` from the keeper and gives `back` to the guild, so the two are kept apart, not netted.
export function decorDraftParts(before, after) {
  const was = new Map((before ?? []).filter((p) => p?.id).map((p) => [p.id, p]));
  const now = new Map((after ?? []).filter((p) => p?.id).map((p) => [p.id, p]));
  let delta = 0;
  let pay = 0;
  let back = 0;
  const add = (d) => { delta += d; if (d > 0) back += d; else if (d < 0) pay -= d; };
  for (const [id, p] of was) if (!now.has(id)) add(decorGoldMove(p, null, p.paid).delta);
  for (const [id, p] of now) {
    const old = was.get(id) ?? null;
    if (!old || shapeOf(old) !== shapeOf(p)) add(decorGoldMove(old, p, old?.paid ?? 0).delta);
  }
  return { delta, pay, back };
}

export function decorDraftGold(before, after) {
  return decorDraftParts(before, after).delta;
}

export function decorHallDraftText(parts) {
  const pay = parts?.pay ?? 0;
  const back = parts?.back ?? 0;
  if (pay && back) return t('decor.draft.hallBoth', '{pay} gold to confirm, {back} to the company', { pay: pay.toLocaleString('en-US'), back: back.toLocaleString('en-US') });
  if (back) return t('decor.draft.hallBack', '{back} gold to the company', { back: back.toLocaleString('en-US') });
  return decorDraftText(-pay);
}

export function decorDraftText(delta) {
  if (!delta) return t('decor.draft.free', 'nothing to pay');
  const n = Math.abs(delta).toLocaleString('en-US');
  return delta < 0 ? t('decor.draft.pay', '{n} gold to confirm', { n }) : t('decor.draft.back', '{n} gold back on confirm', { n });
}
