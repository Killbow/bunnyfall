// @ts-check
import { accountSeaBounty, accountSeaWreck, accountRefusalText } from '../../net/accountClient.js';
import { collectSeaPrizes, reclaimSeaPrizes } from './seaWreckHost.js';
import { appStorage } from '../../platform/appStorage.js';
import { realmGoldAct } from '../../saves/realmSaves.js';
import { readSeaBoard, SEA_BOUNTY_POSTS } from '../../net/sea/seaBountyLaw.js';
import { repaintNavalYard } from '../../ui/navalPlunderDoor.js';
import { t } from '../../ui/textManager.js';

export const SEA_BOARD_FRESH_MS = 30_000;
// Refused reads back off, because the repaint that ends each read would otherwise ask again at once.
export const SEA_BOARD_READ_RETRY_MS = 5_000;
export const boardRetryMs = (/** @type {number} */ fails) => Math.min(SEA_BOARD_FRESH_MS, SEA_BOARD_READ_RETRY_MS * 2 ** Math.max(0, fails - 1));

const gold = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
// One request id per post, so a retried post counts once.
const ridOf = () => `sb${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;

/** @param {any} deps */
export function createSeaBounty(deps) {
  const now = () => Number(deps.now?.()) || Date.now();
  let door = deps.door ?? null, wreckDoor = deps.wreckDoor ?? null;
  const doorNow = () => (door ??= accountSeaBounty({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }));
  const wreckDoorNow = () => (wreckDoor ??= accountSeaWreck({ fetch: (u, i) => globalThis.fetch(u, i), storage: appStorage() }));
  // Act answers and read refusals are separate lines, so a refused read never hides a post that landed.
  let board = null, nextAt = -Infinity, fails = 0, reading = false, busy = false, actLine = null, readLine = null;
  const on = () => !!deps.live?.() && !!deps.session;
  const repaint = () => { try { repaintNavalYard(); } catch { } };
  const purseOf = () => { const g = deps.wallet?.(deps.region?.())?.gold?.(); return Number.isFinite(g) ? g : Infinity; };
  async function read() {
    if (reading || !on()) return;
    reading = true;
    try {
      const r = await doorNow().board({ character: deps.character?.() }).catch(() => null);
      if (r?.ok) { board = readSeaBoard(r.data); fails = 0; readLine = null; nextAt = now() + SEA_BOARD_FRESH_MS; }
      else { readLine = { text: accountRefusalText(r?.error), warn: true }; nextAt = now() + boardRetryMs(++fails); }
    } finally { reading = false; repaint(); }
  }
  async function act(o, said) {
    busy = true; repaint();
    try {
      const r = await realmGoldAct({ ...o, needsAnswer: true, session: deps.session, checkpoint: () => deps.checkpoint?.() });
      actLine = r?.ok ? { text: said(r.data ?? {}), warn: false } : { text: accountRefusalText(r?.error), warn: true };
    } finally { busy = false; nextAt = -Infinity; await read(); }
  }
  function post(row, n) {
    if (!on() || busy || !row) return;
    const region = deps.region(), rid = ridOf();
    if (!(purseOf() >= n)) { actLine = { text: t('sea.bounty.short', 'You do not have {gold} gold to post.', { gold: gold(n) }), warn: true }; repaint(); return; }
    void act({
      reserve: () => deps.wallet?.(region)?.pay(n),
      call: (/** @type {any} */ at) => doorNow().post({ character: deps.character(), realm: at, region, target: row.char, gold: n, rid }),
    }, (d) => (d.repeat ? t('sea.bounty.repeat', 'That bounty was already posted.') : t('sea.bounty.posted', 'You post {gold} gold on {name}\'s head. The bounty stands at {bounty} gold.', { gold: gold(n), name: row.name, bounty: gold(d.bounty) })));
  }
  function collect() {
    if (!on() || busy) return;
    const region = deps.region();
    void act({
      apply: (/** @type {any} */ a) => { const g = a?.data?.gold; if (Number.isSafeInteger(g) && g > 0) deps.wallet?.(region)?.bank(g); },
      call: (/** @type {any} */ at) => doorNow().collect({ character: deps.character(), realm: at, region }),
    }, (d) => (d.gold > 0 ? t('sea.bounty.collected', 'You collect {gold} gold in bounties. It is in your account here.', { gold: gold(d.gold) }) : t('sea.bounty.nothing', 'Nothing is owed you.')));
  }
  async function prizesAct(/** @type {any} */ fn) {
    if (!on() || busy) return;
    busy = true; repaint();
    try {
      const r = await fn({ session: deps.session, checkpoint: () => deps.checkpoint?.(), character: () => deps.character(), door: wreckDoorNow(), say: (/** @type {string} */ text) => { actLine = { text, warn: false }; } });
      if (!r?.ok) actLine = { text: accountRefusalText(r?.error), warn: true };
    } finally { nextAt = -Infinity; busy = false; await read(); }
  }
  function office() {
    if (!on()) return null;
    if (!reading && now() >= nextAt) void read();
    return {
      asking: !board, rows: board?.wanted ?? [], owed: board?.owed ?? 0, refund: board?.refund ?? 0, mine: board?.mine ?? 0, prizes: board?.prizes ?? 0, back: board?.back ?? 0, posts: SEA_BOUNTY_POSTS, purse: purseOf(), busy: busy || reading, line: actLine ?? readLine,
      post: (row, n) => post(row, n), collect: () => collect(),
      collectPrizes: () => void prizesAct(collectSeaPrizes), reclaim: () => void prizesAct(reclaimSeaPrizes),
    };
  }
  return { office, read };
}
