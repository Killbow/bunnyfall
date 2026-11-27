// @ts-check
// The cell directory splits and merges the tree one node at a time from node counts. Its alarm makes each move,
// never a node call, and the plan is stored before each stage so a stopped directory resumes. This is not in
// index.js because every named export of the entrypoint is read as an entrypoint.
import { isL0Tree, cellMoveDue, treeAfter, isNodeRoom, isCoarseNode, nodeHoldsCell } from '../../src/net/cellTree.js';
import { CELL_HELLO_LAW, CLOSE_REPARTITION, LAYERS_MAX, LAYER_HEADER, PARK_INTERNAL_DROP, isCellRoom, layerName, layerOf, roomOf } from './relay.js';
import { ROOM_CALL_MS } from './relayScale.js';
import { CELL_DIRECTORY, CELL_INTERNAL_TREE, CELL_TREE_KEY, CELL_TREE_KEEP_MS, CELL_TREE_RETRY_MS, CELL_TELL_HEADER, MOVED_HEADER, NODE_HEADER, cellTreeInternal, directoryTree, nodeOfRoom } from './cellNodes.js';
import { CELL_INTERNAL_TAKE, CELL_MOVED_KEY, CELL_PULLED_KEY, cellTakeInternal, handOver, handoverPayloads, letGo, roomPost, rowsOf, takeHandover } from './cellHandover.js';
import { SEV_INTERNAL_CALL } from './staffEvents.js';

/** @typedef {import('../../src/net/cellTree.js').TreeMove & { stage: 'move' | 'close', at: number }} CellPlan */
/**
 * @typedef {object} CountReport
 * @property {string} node
 * @property {number} n
 * @property {number} at
 */
/**
 * @typedef {object} DirectoryState
 * @property {Map<string, CountReport>} reports
 * @property {import('../../src/net/cellTree.js').MoveDwell} dwell
 * @property {Record<string, number>} cool
 */
/**
 * @typedef {object} CellMoveFields
 * @property {boolean | undefined} _isCellDir
 * @property {number | undefined} _cellToldAt
 * @property {number | null | undefined} _cellMoved
 * @property {Set<string> | undefined} _cellPulled
 * @property {Map<string, number> | undefined} _cellPullAt
 * @property {DirectoryState | undefined} _cellDir
 * @property {CellPlan | null | undefined} _cellPlan
 */

export const CELL_INTERNAL_PREFIX = '/internal/cells/';
export const CELL_INTERNAL_COUNT = '/internal/cells/count';
export const CELL_INTERNAL_MOVE = '/internal/cells/move';
export const CELL_INTERNAL_CLOSE = '/internal/cells/close';
export const CELL_INTERNAL_GIVE = '/internal/cells/give';
export const CELL_INTERNAL_FORGET = '/internal/cells/forget';
export const COUNT_TELL_MS = 15_000;
// Nodes report counts as frames arrive, with no timer, so a node silent for COUNT_STALE_MS counts zero and can merge.
export const COUNT_STALE_MS = 60_000;
export const COUNT_FORGET_MS = 30 * 60_000;
export const COUNT_MAX = 100_000;
export const MOVE_COOLDOWN_MS = 10 * 60_000;
// Twice the time an isolate caches its tree, so no isolate still holds an older tree when the moved mark lapses.
export const MOVED_KEEP_MS = 2 * CELL_TREE_KEEP_MS;
export const CLOSE_RETRY_MS = 5_000;
export const CELL_PLAN_KEY = 'cellplan';
export const CELL_LAW_DEFAULT = Object.freeze({ splitAt: 150, splitDwellMs: 60_000, mergeAt: 40, mergeDwellMs: 600_000 });
export const CELL_LAW_VARS = Object.freeze({ splitAt: 'CELL_SPLIT_AT', splitDwellMs: 'CELL_SPLIT_DWELL_MS', mergeAt: 'CELL_MERGE_AT', mergeDwellMs: 'CELL_MERGE_DWELL_MS' });
/** @param {any} env */
export function cellLawOf(env) {
  const law = /** @type {Record<string, number>} */ ({});
  for (const [field, varName] of Object.entries(CELL_LAW_VARS)) {
    const text = String(env?.[varName] ?? '');
    law[field] = /^\d{1,9}$/.test(text) ? Number(text) : CELL_LAW_DEFAULT[/** @type {keyof typeof CELL_LAW_DEFAULT} */ (field)];
  }
  // The merge line must sit under the split line, or a split's children would merge back at once.
  return law.mergeAt < law.splitAt ? /** @type {typeof CELL_LAW_DEFAULT} */ (law) : CELL_LAW_DEFAULT;
}

const json = (/** @type {any} */ body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const post = (/** @type {string} */ path, /** @type {unknown} */ body) => new Request(`https://relay.internal${path}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(ROOM_CALL_MS) });
const bodyOf = async (/** @type {Request} */ request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};
/** @param {unknown} listed */
const nodesOf = (listed) => (Array.isArray(listed) && listed.length >= 1 && listed.length <= 4 && listed.every(isNodeRoom) ? /** @type {string[]} */ (listed) : null);

/** @param {any} room */
export function isCellDirectory(room) {
  if (room._isCellDir === undefined) {
    let isDirectory = false;
    try {
      const id = room.state?.id,
        directoryId = room.env?.ROOMS?.idFromName?.(CELL_DIRECTORY);
      isDirectory = id != null && directoryId != null && (typeof id.equals === 'function' ? id.equals(directoryId) : id === directoryId);
    } catch {
      isDirectory = false;
    }
    room._isCellDir = isDirectory;
  }
  return room._isCellDir;
}

/** @param {any} room @param {number} now */
export function cellTell(room, now) {
  const node = nodeOfRoom(room);
  if (!room._cellTell || !node || now - (room._cellToldAt ?? -Infinity) < COUNT_TELL_MS) return;
  const rooms = room.env?.ROOMS;
  if (!rooms?.idFromName || !rooms?.get) return;
  room._cellToldAt = now;
  const body = { node, ly: room._cellLy | 0, n: room._namedCount() };
  // Start inside a promise so a binding that throws at once is caught here, never in the frame's handler.
  void Promise.resolve()
    .then(() => rooms.get(rooms.idFromName(CELL_DIRECTORY)).fetch(post(CELL_INTERNAL_COUNT, body)))
    .catch((/** @type {any} */ error) => console.warn('[cells] count', error?.message ?? error));
}

/** @param {any} room @param {number} now */
async function movedNow(room, now) {
  if (room._cellMoved === undefined) room._cellMoved = (await room.state.storage.get(CELL_MOVED_KEY)) ?? null;
  if (room._cellMoved == null) return false;
  if (now - room._cellMoved < MOVED_KEEP_MS) return true;
  room._cellMoved = null;
  await room.state.storage.delete(CELL_MOVED_KEY);
  return false;
}

/** @param {any} room @param {Request} request @param {string} key @param {number} now */
async function cellPull(room, request, key, now) {
  const node = request.headers.get(NODE_HEADER);
  if (!isCoarseNode(node) || !nodeHoldsCell(node, key) || layerOf(request.headers.get(LAYER_HEADER)) !== 0) return;
  const storage = room.state.storage;
  room._cellPulled ??= new Set((await storage.get(CELL_PULLED_KEY)) ?? []);
  room._cellPullAt ??= new Map();
  if (room._cellPulled.has(key) || now < (room._cellPullAt.get(key) ?? -Infinity)) return;
  const rooms = room.env?.ROOMS;
  if (!rooms?.idFromName || !rooms?.get) return;
  room._cellPullAt.set(key, now + CELL_TREE_RETRY_MS);
  // A cell that gave its rows once gives nothing again, so the pulled set is never handed over.
  try {
    const cellObject = rooms.get(rooms.idFromName(key));
    const response = await cellObject.fetch(post(CELL_INTERNAL_GIVE, { to: [node] }));
    if (!response.ok) return;
    const payload = await response.json();
    const rowCount = (payload?.parks?.length ?? 0) + (payload?.sp?.length ?? 0) + (payload?.dg?.length ?? 0) + (payload?.gr?.length ?? 0) + Object.keys(payload?.copy ?? {}).length;
    if (rowCount && (await takeHandover(room, payload, now)) == null) return;
    room._cellPulled.add(key);
    await storage.put(CELL_PULLED_KEY, [...room._cellPulled]);
    if (rowCount) await cellObject.fetch(post(CELL_INTERNAL_FORGET, {}));
  } catch (error) {
    console.warn('[cells] pull', /** @type {any} */ (error)?.message ?? error);
  }
}

// A build without `of` would open a halo into this very coarse node and be replaced by it.
/** @param {any} room @param {any} socket @param {any} hello */
export const cellDoorShut = (room, socket, hello) => isCoarseNode(room._attach(socket)?.nd) && !(hello.cv >= CELL_HELLO_LAW);

/** @param {any} room @param {string} path @param {Request} request */
export async function cellDoors(room, path, request) {
  if (path.startsWith(CELL_INTERNAL_PREFIX)) return cellInternal(room, path, request);
  if (request.headers.get(CELL_TELL_HEADER) !== '1') return null;
  const key = path.startsWith('/room/') ? roomOf(path) : null;
  const isSocket = isCellRoom(key);
  if (!isSocket && path !== PARK_INTERNAL_DROP && path !== SEV_INTERNAL_CALL) return null;
  const now = Date.now();
  if (await movedNow(room, now)) {
    const answer = json({ error: 'moved' }, 503);
    answer.headers.set(MOVED_HEADER, '1');
    return answer;
  }
  if (isSocket) await cellPull(room, request, /** @type {string} */ (key), now);
  return null;
}

/** @param {any} room @param {string} path @param {Request} request */
async function cellInternal(room, path, request) {
  if (path === CELL_INTERNAL_TREE) return cellTreeInternal(room);
  if (path === CELL_INTERNAL_TAKE) return cellTakeInternal(room, request);
  const body = await bodyOf(request);
  if (path === CELL_INTERNAL_COUNT) return countInternal(room, body, Date.now());
  if (path === CELL_INTERNAL_FORGET) {
    await letGo(room, (await rowsOf(room.state.storage, Date.now())).parks);
    return json({ ok: true });
  }
  const to = nodesOf(body?.to);
  if (!to) return json({ ok: false, error: 'no receivers' }, 400);
  if (path === CELL_INTERNAL_GIVE) return json(handoverPayloads(await rowsOf(room.state.storage, Date.now()), to).get(to[0]));
  if (path === CELL_INTERNAL_MOVE) return json(await handOver(room, to, roomPost(room.env), Date.now(), { keep: true }));
  if (path === CELL_INTERNAL_CLOSE) return closeInternal(room, to, layerOf(body?.ly));
  return json({ error: 'no such door' }, 404);
}

/** @param {any} room @param {string[]} to @param {number} layer */
async function closeInternal(room, to, layer) {
  const now = Date.now();
  const sockets = room.state.getWebSockets();
  if (layer === 0 || sockets.length) {
    await room.state.storage.put(CELL_MOVED_KEY, now);
    room._cellMoved = now;
  }
  for (const socket of sockets) {
    try {
      socket.close(CLOSE_REPARTITION, 'cells moved');
    } catch {
      // The socket is already closed.
    }
    // The runtime sends no close event for a close the object made, so the room reaps it.
    room._dead.add(socket);
    room._closed(socket);
  }
  await room._reap();
  const result = await handOver(room, to, roomPost(room.env), now, { force: true });
  if (result.orphaned) console.warn(`[cells] a move left behind ${result.orphaned.join(' ')}`);
  return json(result);
}

/** @param {any} room @returns {DirectoryState} */
const directoryOf = (room) => (room._cellDir ??= { reports: new Map(), dwell: { over: {}, under: {} }, cool: {} });
/** @param {any} room @returns {Promise<CellPlan | null>} */
async function planOf(room) {
  if (room._cellPlan === undefined) room._cellPlan = (await room.state.storage.get(CELL_PLAN_KEY)) ?? null;
  return room._cellPlan;
}

/** @param {any} room @param {any} body @param {number} now */
async function countInternal(room, body, now) {
  if (!body || !isNodeRoom(body.node) || !Number.isInteger(body.ly) || body.ly < 0 || body.ly >= LAYERS_MAX || !Number.isInteger(body.n) || body.n < 0 || body.n > COUNT_MAX) return json({ ok: false }, 400);
  room._kind ??= 'cells';
  directoryOf(room).reports.set(`${body.node}#${body.ly}`, { node: body.node, n: body.n, at: now });
  await cellPlanDue(room, now);
  room._metricsTick();
  return json({ ok: true });
}

/** @param {any} room @param {number} now */
async function cellPlanDue(room, now) {
  const tree = await directoryTree(room, now);
  if (isL0Tree(tree) || (await planOf(room))) return;
  const directory = directoryOf(room);
  const counts = new Map();
  for (const [reportKey, report] of directory.reports) {
    if (now - report.at > COUNT_FORGET_MS) {
      directory.reports.delete(reportKey);
      continue;
    }
    counts.set(report.node, (counts.get(report.node) ?? 0) + (now - report.at <= COUNT_STALE_MS ? report.n : 0));
  }
  const { move, dwell } = cellMoveDue(tree, counts, directory.dwell, directory.cool, now, cellLawOf(room.env));
  directory.dwell = dwell;
  if (!move) return;
  room._cellPlan = { ...move, stage: 'move', at: now };
  await room.state.storage.put(CELL_PLAN_KEY, room._cellPlan);
  await room.state.storage.setAlarm(now);
  console.log(`[cells] ${move.kind} planned: ${move.from.join(' ')} -> ${move.to.join(' ')}`);
}

// Asks one layer at a time, since each take merges rows into the ledger of the receiving node.
/** @param {any} room @param {any} plan @param {string} path */
async function askDeparting(room, plan, path) {
  const rooms = room.env?.ROOMS;
  const blocked = [],
    failed = [];
  for (const node of plan.from) {
    for (let layer = 0; layer < LAYERS_MAX; layer++) {
      const name = layerName(node, layer);
      let answer = null;
      try {
        const response = await rooms.get(rooms.idFromName(name)).fetch(post(path, { to: plan.to, ly: layer }));
        answer = response.ok ? await response.json() : null;
      } catch {
        answer = null;
      }
      if (answer?.blocked?.length) blocked.push(`${name} (${answer.blocked.join(', ')})`);
      else if (!answer?.ok) failed.push(name);
      if (path === CELL_INTERNAL_MOVE && (blocked.length || failed.length)) return { blocked, failed };
    }
  }
  return { blocked, failed };
}

/** @param {any} room @param {number} [now] */
export async function cellPlanAlarm(room, now = Date.now()) {
  const plan = await planOf(room);
  if (!plan) return;
  const storage = room.state.storage,
    directory = directoryOf(room);
  room._kind ??= 'cells';
  if (plan.stage === 'move') {
    const { blocked, failed } = await askDeparting(room, plan, CELL_INTERNAL_MOVE);
    const next = blocked.length || failed.length ? null : treeAfter(await directoryTree(room, now), plan);
    if (!next) {
      await storage.delete(CELL_PLAN_KEY);
      room._cellPlan = null;
      for (const node of plan.from) directory.cool[node] = now + MOVE_COOLDOWN_MS;
      room._metrics.c.cellBlocked++;
      room._metricsTick(true);
      console.warn(`[cells] ${plan.kind} of ${plan.from.join(' ')} not made: ${blocked.length ? `blocked by ${blocked.join('; ')}` : failed.length ? `no answer from ${failed.join(' ')}` : 'the tree is no longer its'}`);
      return;
    }
    room._cellPlan = { ...plan, stage: 'close' };
    await storage.put({ [CELL_TREE_KEY]: next, [CELL_PLAN_KEY]: room._cellPlan });
    room._cellTree = next;
    for (const node of plan.from)
      for (let layer = 0; layer < LAYERS_MAX; layer++) directory.reports.delete(`${node}#${layer}`);
  }
  const { failed } = await askDeparting(room, plan, CELL_INTERNAL_CLOSE);
  if (failed.length) {
    await storage.setAlarm(now + CLOSE_RETRY_MS);
    console.warn(`[cells] close unanswered by ${failed.join(' ')} - asked again`);
    return;
  }
  await storage.delete(CELL_PLAN_KEY);
  room._cellPlan = null;
  room._metrics.c.cellMoves++;
  room._metricsTick(true);
  console.log(`[cells] ${plan.kind} made: ${plan.from.join(' ')} -> ${plan.to.join(' ')}`);
}
