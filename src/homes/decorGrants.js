// @ts-check

import { t } from '../ui/textManager.js';
import { ITEM_UID_RE } from '../items/itemLaw.js';
import { mintItemId } from '../items/itemIds.js';
import { absorbStack, addGoldPieces } from '../items/inventory.js';

let storage = new Set();
let station = new Set();
let bin = new Set();
let shared = new Set();
let known = false;
let door = null;
let asked = 0;
let asking = false;
let again = null;

export function noteDecorGrants(homeDecor, mapId, buildingKey, character) {
  storage = new Set();
  station = new Set();
  bin = new Set();
  shared = new Set();
  known = false;
  const ask = ++asked;
  again = () => noteDecorGrants(homeDecor, mapId, buildingKey, character);
  if (!homeDecor?.use) { asking = false; known = true; return; }
  asking = true;
  Promise.resolve(homeDecor.use({ mapId, buildingKey, character, op: 'grants' })).then((res) => {
    if (ask !== asked) return;
    asking = false;
    if (!res?.ok) return;
    storage = new Set(res.data.storage ?? []);
    station = new Set(res.data.station ?? []);
    bin = new Set(res.data.bin ?? []);
    const use = new Set((res.data.use ?? []).map((row) => row?.id));
    shared = new Set([...(res.data.storage ?? []).filter((id) => use.has(id)), ...(res.data.bin ?? [])]);
    known = true;
  }, () => { if (ask === asked) asking = false; });
}

export const decorMayStorage = (id) => storage.has(id);
export const decorMayStation = (id) => station.has(id);
export const decorStationShut = (id) => known && !station.has(id);
export const decorIsShared = (id) => shared.has(id);
export function noteDecorShared(id, on) {
  if (typeof id !== 'string') return;
  if (on) shared.add(id);
  else shared.delete(id);
}

// Shared chest goods live in the service bin, and the save list for that chest is empty. Online, the chest stays
// shut until the grants say which chests are shared.
/**
 * @param {string} id
 * @param {boolean} online
 * @param {() => void} openSave
 */
export function openOwnChest(id, online, openSave) {
  if (online && !known) {
    door?.say?.(t('decor.grants.shut', 'The chest stays shut.'));
    if (!asking) again?.();
    return false;
  }
  if (online && shared.has(id)) {
    void openSharedChest(id);
    return true;
  }
  openSave();
  return true;
}

export function bindDecorHouse(next) { door = next; }

const peeked = new Map();

export function noteDecorBin(id, items, master = false) {
  if (typeof id !== 'string' || !id) return;
  peeked.set(id, { at: Date.now(), items: Array.isArray(items) ? items : null, master: !!master });
}

export function bindDecorHouseFrom(host, player, say, refusal, mapId, buildingKey, open = null) {
  bindDecorHouse({
    doc: typeof document !== 'undefined' ? document : null,
    use: (body) => host.homeDecor?.use?.(body),
    realm: () => host.realmAct ?? null,
    mapId, buildingKey,
    character: () => host.decorCharacter?.() ?? null,
    items: () => player?.items ?? [],
    take(uid) { const list = player?.items ?? []; const i = list.findIndex((it) => it?.uid === uid); if (i >= 0) list.splice(i, 1); },
    give(it) { if (player) (player.items ??= []).push(it); },
    pay(n) { if (player && Number.isSafeInteger(n) && n > 0) addGoldPieces(player, n); },
    say, refusal, open,
  });
}

export const openDecorChest = (make, spec) => make?.(spec?.loot ? spec : { loot: spec }) ?? null;

const chestShut = (d, error) => d.say?.(error === 'decor-busy' ? (d.refusal?.('decor-busy') ?? t('decor.grants.busy', 'Someone else is using this chest.')) : (d.refusal?.(error) ?? t('decor.grants.shut', 'The chest stays shut.')));

const settling = new Map();
const stampUid = (item) => { if (!ITEM_UID_RE.test(item?.uid)) item.uid = mintItemId(); return item; };
// Gold is a purse count: coins taken from the chest are paid into the purse when the settle lands, never as items.
const coins = (it) => it?.group === 'Currency' && it?.templateIndex === 276;
// Keep this well inside the service's hold life (HOLD_S, 180 s, in server-account/src/decorAccess.js).
export const DECOR_HOLD_KEEP_MS = 60_000;

export async function openSharedChest(id) {
  const d = door;
  if (!d?.use || typeof d.open !== 'function') { d?.say?.(t('decor.grants.shut', 'The chest stays shut.')); return false; }
  // One settle at a time: a second open waits, so a take still in flight cannot be granted again.
  const waited = [...settling.values()];
  if (waited.length) await Promise.all(waited.map((job) => Promise.resolve(job).catch(() => {})));
  const at = { mapId: d.mapId, buildingKey: d.buildingKey, character: d.character?.() ?? d.character, id };
  const cached = peeked.get(id);
  const goods = [...(Array.isArray(cached?.items) ? cached.items : [])];
  Object.defineProperty(goods, 'unstacked', { value: true });
  Object.defineProperty(goods, 'pileCoins', { value: true });
  let touched = false;
  let heldAt = 0;
  /** @type {string | null} */
  let lost = null;
  const ready = Promise.resolve(d.use({ ...at, op: 'list', hold: true })).then((listed) => {
    if (listed?.ok) heldAt = Date.now();
    if (listed?.ok && !touched) {
      const byUid = new Map();
      for (const it of goods) if (it?.uid) byUid.set(it.uid, it);
      const used = new Set();
      const merged = [];
      for (let i = 0; i < (listed.data?.items ?? []).length; i++) {
        const it = listed.data.items[i];
        let prev = it?.uid ? byUid.get(it.uid) : null;
        const atRow = goods[i];
        if (!prev && atRow && !used.has(atRow) && !atRow.uid && !it?.uid && atRow.templateIndex === it.templateIndex) prev = atRow;
        if (prev) {
          if (Number.isInteger(it?.stackCount) && prev.stackCount !== it.stackCount) prev.stackCount = it.stackCount;
          used.add(prev); merged.push(prev);
        }
        else merged.push(it);
      }
      goods.splice(0, goods.length, ...merged);
      noteDecorBin(id, goods, !!listed.data?.master);
    }
    return listed;
  }, () => null);
  let master = !!cached?.master;
  if (!Array.isArray(cached?.items)) {
    const listed = await ready;
    if (!listed?.ok) { chestShut(d, listed?.error); return false; }
    master = !!listed.data?.master;
  }
  // Pieces this window takes out stay in its own pack copy until the close, so a take and put back cannot duplicate
  // them.
  const draft = [...(d.items?.() ?? [])];
  Object.defineProperty(draft, 'unstacked', { value: true });
  const put = new Set();
  const take = new Set();
  const takenOf = new Map();
  const cuts = [];
  const note = (dir, item) => {
    const uid = item.uid;
    if (dir === 'put') {
      if (take.has(uid)) { take.delete(uid); takenOf.delete(uid); }
      else put.add(uid);
    } else if (put.has(uid)) {
      put.delete(uid);
    } else { take.add(uid); takenOf.set(uid, item); }
  };
  let pending = 0;
  let idle = Promise.resolve();
  let wake = null;
  const cutOf = (item, landed) => {
    const leave = item.stackCount ?? 1;
    const at = cuts.findIndex((c) => c.uid === item.uid);
    if (at < 0) { cuts.push({ uid: item.uid, leave, give: landed }); return; }
    const prior = cuts[at];
    if (landed && prior.give && landed !== prior.give) {
      absorbStack(prior.give, landed);
      const from = draft.indexOf(landed);
      if (from >= 0) draft.splice(from, 1);
    } else if (landed && !prior.give) prior.give = landed;
    prior.leave = leave;
  };
  const takeWhole = (item) => {
    const at = cuts.findIndex((c) => c.uid === item.uid);
    if (at >= 0) {
      const prior = cuts.splice(at, 1)[0];
      if (prior.give && prior.give !== item) {
        absorbStack(item, prior.give);
        const from = draft.indexOf(prior.give);
        if (from >= 0) draft.splice(from, 1);
      }
    }
    note('take', item);
  };
  let sent = false;
  let job = null;
  let loot = null;
  const keepHeld = () => {
    if (lost || Date.now() - heldAt < DECOR_HOLD_KEEP_MS) return;
    heldAt = Date.now();
    Promise.resolve(d.use({ ...at, op: 'hold' })).then((r) => {
      if (!r?.ok && (r?.error === 'decor-lapsed' || r?.error === 'decor-busy' || r?.error === 'decor-shut')) lost = r.error;
    }, () => {});
  };
  const commit = async (dir, item, amount, go) => {
    if (sent) return false;
    pending += 1;
    if (!wake) idle = new Promise((resolve) => { wake = resolve; });
    try {
    const listed = await ready;
    if (!listed?.ok) { chestShut(d, listed?.error); return false; }
    if (lost) { chestShut(d, lost); return false; }
    keepHeld();
    const stack = item?.stackCount ?? 1;
    const n = amount == null ? stack : amount;
    if (!Number.isInteger(n) || n < 1 || n > stack || typeof go !== 'function') { d.say?.(t('decor.grants.whole', 'The chest takes the whole stack.')); return false; }
    if (!item || typeof item !== 'object') { d.say?.(dir === 'put' ? t('decor.grants.badItem', 'That cannot be stored.') : t('decor.grants.stays', 'It stays in the chest.')); return false; }
    const real = d.items?.() ?? [];
    if (dir === 'put' && draft.includes(item) && !real.includes(item)) {
      const cut = cuts.find((c) => c.give === item);
      if (n !== stack || (!cut && !take.has(item.uid))) { d.say?.(t('decor.grants.whole', 'The chest takes the whole stack.')); return false; }
      touched = true;
      if (!go() || !goods.includes(item)) return false;
      if (cut) {
        const source = goods.find((g) => g !== item && g?.uid === cut.uid);
        if (source) { absorbStack(source, item); goods.splice(goods.indexOf(item), 1); }
        cuts.splice(cuts.indexOf(cut), 1);
      } else { take.delete(item.uid); takenOf.delete(item.uid); }
      return true;
    }
    touched = true;
    const before = item?.stackCount ?? 1;
    const moved = go();
    if (!moved) return false;
    const landed = moved === item && dir === 'put' && goods.at(-1) && goods.at(-1) !== item && !real.includes(goods.at(-1)) ? goods.at(-1) : (moved === item && dir === 'take' && draft.at(-1) && draft.at(-1) !== item && (item.stackCount ?? 1) < before ? draft.at(-1) : moved);
    stampUid(landed);
    if (dir === 'put') {
      for (let i = real.length - 1; i >= 0; i--) if (real[i] === landed || (landed?.uid && real[i]?.uid === landed.uid && real[i] !== item)) real.splice(i, 1);
      if (!real.includes(landed)) real.push(landed);
      note('put', landed);
    } else if (landed !== item && ITEM_UID_RE.test(item?.uid)) {
      if (put.has(item.uid)) { if (!real.includes(landed)) real.push(landed); } else cutOf(item, landed);
    } else takeWhole(landed);
    return true;
    } finally {
      pending -= 1;
      if (pending === 0 && wake) { const done = wake; wake = null; done(); }
    }
  };
  const closed = () => {
    if (job) return job;
    sent = true;
    if (loot) loot.busy = t('decor.grants.saving', 'Saving the chest...');
    job = (async () => {
      if (pending) await idle;
      const putting = [...put];
      const taking = [...take];
      const cutting = cuts.map(({ uid, leave }) => ({ uid, leave }));
      if (!putting.length && !taking.length && !cutting.length) { noteDecorBin(id, goods); await d.use({ ...at, op: 'release' }).catch(() => {}); return; }
      const act = d.realm?.();
      if (typeof act !== 'function') { await d.use({ ...at, op: 'release' }).catch(() => {}); chestShut(d, null); return; }
      // The service pays `purse` into the record in the settle's own batch and refuses a count that does not match.
      const coin = taking.reduce((n, uid) => n + (coins(takenOf.get(uid)) ? takenOf.get(uid).stackCount ?? 1 : 0), 0)
        + cuts.reduce((n, cut) => n + (coins(cut.give) ? cut.give.stackCount ?? 1 : 0), 0);
      const res = await act({
        apply: () => {
          for (const uid of putting) d.take(uid);
          const have = d.items?.() ?? [];
          for (const uid of taking) {
            const it = takenOf.get(uid);
            if (it && !coins(it) && !have.includes(it) && !have.some((x) => x?.uid === uid)) d.give(it);
          }
          for (const cut of cuts) if (cut.give && !coins(cut.give) && !have.includes(cut.give) && !have.some((x) => x?.uid === cut.give.uid)) d.give(cut.give);
          if (coin > 0) d.pay?.(coin);
        },
        call: (realm) => d.use({ ...at, op: 'settle', put: putting, take: taking, ...(cutting.length ? { cut: cutting } : {}), purse: coin, realm }),
      }).catch(() => null);
      if (!res?.ok) { peeked.delete(id); chestShut(d, res?.error); }
      else noteDecorBin(id, goods, master);
    })();
    settling.set(id, job.finally(() => { if (settling.get(id) === job) settling.delete(id); }));
    return job;
  };
  const vaultPour = async () => {
    const res = await d.use({ ...at, op: 'vault' });
    if (!res?.ok) { chestShut(d, res?.error); return null; }
    const items = res.data?.items ?? [];
    if (!items.length) { d.say?.(t('decor.grants.vaultEmpty', 'The vault is empty.')); return []; }
    for (const it of items) if (!goods.some((g) => g?.uid === it.uid)) goods.push(it);
    touched = true;
    return items;
  };
  loot = { items: () => goods, storage: true, title: 'Chest', busy: null, commit, closed, finish: () => closed(), ...(master ? { vaultPour } : {}) };
  ready.then((listed) => { if (listed?.data?.master) loot.vaultPour = vaultPour; }, () => {});
  d.open({
    loot,
    items: () => draft,
    onDrop: (items) => { for (const it of items ?? []) draft.push(it); d.say?.(t('decor.grants.noDrop', 'Shut the chest before you drop that.')); return null; },
    dropRefusal: () => t('decor.grants.noDrop', 'Shut the chest before you drop that.'),
  });
  return true;
}
