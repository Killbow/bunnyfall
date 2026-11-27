// @ts-check
// The Worker keeps the cell tree per isolate and falls back to the last tree it saw. It uses the fine key only
// when it never saw one, since under a coarse tree the fine key would put a player alone in an object.
// This is not in index.js because every named export of the entrypoint is read as an entrypoint.
import { readTree, L0_TREE, seedTree, cellSeedOf, isL0Tree, leafOf, isNodeRoom, isCoarseNode, nodeLevelOf, nodeAt, coversCell, cellsOfNode } from '../../src/net/cellTree.js';
import { relayCfgValue } from '../../src/net/relayCfg.js';
import { isCellRoom, cellOfRoom, layerOf, layerName, LAYER_HEADER, CLOSE_SAME_ROOM, HALO_OF_PARAM, HALO_OF_MAX } from './relay.js';
import { layerWalk, ROOM_CALL_MS } from './relayScale.js';

/**
 * @typedef {object} CellRoomFields
 * @property {string | null | undefined} _node
 * @property {boolean | undefined} _nodeRead
 * @property {boolean | undefined} _cellTell
 * @property {number | undefined} _cellLy
 * @property {import('../../src/net/cellTree.js').CellTree | null | undefined} _cellTree
 */

// wire.js roomOf never returns a name with `#`, so no page can reach the directory.
export const CELL_DIRECTORY = '#cells';
export const CELL_INTERNAL_TREE = '/internal/cells/tree';
export const CELL_TREE_KEY = 'celltree';
export const CELL_TREE_KEEP_MS = 30_000;
// A failed ask waits this long, so a directory that is down costs each isolate one deadline, not each page.
export const CELL_TREE_RETRY_MS = 5_000;
export const NODE_HEADER = 'x-df-node';
export const CELL_TELL_HEADER = 'x-df-cells-tell';
export const MOVED_HEADER = 'x-df-moved';

const json = (/** @type {any} */ body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let isolateCopy = /** @type {{ tree: any, at: number } | null} */ (null);
let failedAt = -Infinity;
export const cellTreeCache = {
  get: () => isolateCopy,
  reset: () => {
    isolateCopy = null;
    failedAt = -Infinity;
  },
  stale: () => {
    if (isolateCopy) isolateCopy.at = -Infinity;
    failedAt = -Infinity;
  },
};

/** @param {any} env @param {number} [now] */
export async function cellTreeOf(env, now = Date.now()) {
  if (isolateCopy && now - isolateCopy.at < CELL_TREE_KEEP_MS) return isolateCopy.tree;
  if (now - failedAt < CELL_TREE_RETRY_MS) return isolateCopy?.tree ?? null;
  try {
    const directory = env.ROOMS.get(env.ROOMS.idFromName(CELL_DIRECTORY));
    const response = await directory.fetch(new Request(`https://relay.internal${CELL_INTERNAL_TREE}`, { signal: AbortSignal.timeout(ROOM_CALL_MS) }));
    const tree = response.ok ? readTree(await response.json()) : null;
    if (tree) {
      isolateCopy = { tree, at: now };
      return tree;
    }
  } catch {
    // A thrown ask is a failed ask, the same as an answer that cannot be read.
  }
  failedAt = now;
  return isolateCopy?.tree ?? null;
}

/** @param {any} tree @param {string} key */
export const cellNodeOf = (tree, key) => (tree && leafOf(tree, key)) || key;

// A browser sees no HTTP status on a refused upgrade, so the close code tells the page its halo is its own room.
export function sameRoomAnswer() {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.close(CLOSE_SAME_ROOM, 'same room');
  return new Response(null, { status: 101, webSocket: client });
}

/** @param {Response} response */
const movedAnswer = (response) => response.status === 503 && response.headers.get(MOVED_HEADER) === '1';

/** @param {any} env @param {string} key @param {URL} url @param {Request} request */
export async function cellDoor(env, key, url, request) {
  for (let attempt = 0; ; attempt++) {
    const tree = await cellTreeOf(env);
    const node = cellNodeOf(tree, key);
    const held = String(url.searchParams.get(HALO_OF_PARAM) ?? '').split(';').slice(0, HALO_OF_MAX).filter((room) => room !== key && isCellRoom(room));
    if (held.some((room) => cellNodeOf(tree, room) === node)) return sameRoomAnswer();
    // Headers lower-cases its names, as these are, so the Worker's values overwrite whatever the page sent.
    const headers = { ...Object.fromEntries(request.headers), [NODE_HEADER]: node, [CELL_TELL_HEADER]: tree && !isL0Tree(tree) ? '1' : '' };
    const response = await layerWalk(env.ROOMS, node, new Request(request, { headers }), layerOf(url.searchParams.get('ly')));
    if (attempt || !movedAnswer(response)) return response;
    cellTreeCache.stale();
  }
}

/**
 * @param {any} env
 * @param {string} cell
 * @param {number} layer
 * @param {string} path
 * @param {unknown} body
 * @param {number} [deadlineMs]
 */
export async function cellCall(env, cell, layer, path, body, deadlineMs = ROOM_CALL_MS) {
  const rooms = env?.ROOMS;
  if (!rooms?.idFromName || !rooms?.get) return null;
  for (let attempt = 0; ; attempt++) {
    const tree = await cellTreeOf(env);
    // A node answers "moved" only to a caller in a moving tree.
    const headers = { [CELL_TELL_HEADER]: tree && !isL0Tree(tree) ? '1' : '' };
    const response = await rooms.get(rooms.idFromName(layerName(cellNodeOf(tree, cell), layer))).fetch(new Request(`https://relay.internal${path}`, { method: 'POST', body: JSON.stringify(body), headers, signal: AbortSignal.timeout(deadlineMs) }));
    if (attempt || !movedAnswer(response)) return response;
    cellTreeCache.stale();
  }
}

/** @param {any} room @param {number} [now] */
export async function directoryTree(room, now = Date.now()) {
  if (room._relayCfgAt === -Infinity) await room._relayCfgFresh(now);
  else void room._relayCfgFresh(now);
  const seed = cellSeedOf(relayCfgValue(await room._relayCfgOf(), room.env, 'cellSeed')) ?? 0;
  if (!seed) return L0_TREE;
  if (room._cellTree === undefined) room._cellTree = readTree(await room.state.storage.get(CELL_TREE_KEY));
  if (!room._cellTree) {
    room._cellTree = seedTree(seed);
    await room.state.storage.put(CELL_TREE_KEY, room._cellTree);
  }
  return room._cellTree;
}
/** @param {any} room */
export async function cellTreeInternal(room) {
  return json(await directoryTree(room));
}

/** @param {any} room @param {Request} request @param {string} key */
export function nodeHeard(room, request, key) {
  const node = request.headers.get(NODE_HEADER);
  const cell = cellOfRoom(key);
  if (!cell || !node || !isNodeRoom(node)) return null;
  const level = /** @type {number} */ (nodeLevelOf(node));
  if (nodeAt(level, cell[0], cell[1]) !== node) return null;
  room._node = node;
  room._cellTell = request.headers.get(CELL_TELL_HEADER) === '1';
  room._cellLy = layerOf(request.headers.get(LAYER_HEADER));
  return level > 0 ? node : null;
}

// The runtime tells a woken object nothing, so a woken instance reads its coarse node back from a socket's
// attachment.
/** @param {any} room */
export function nodeOfRoom(room) {
  if (room._node == null && !room._nodeRead) {
    room._nodeRead = true;
    for (const [, attachment] of room._all?.() ?? [])
      if (isCoarseNode(attachment?.nd)) {
        room._node = attachment.nd;
        room._cellTell = true;
        room._cellLy = attachment.ly | 0;
        break;
      }
  }
  return room._node ?? null;
}
/** @param {any} room */
export const cellLevelOf = (room) => {
  const node = nodeOfRoom(room);
  return node ? String(nodeLevelOf(node)) : '';
};

/** @param {any} attachment */
export const coverOf = (attachment) => attachment?.nd ?? attachment?.key;
/** @param {any} attachment @param {unknown} cell */
export const inCover = (attachment, cell) => coversCell(coverOf(attachment), cell);
/**
 * @param {{ _junk: (ws: any) => void }} room
 * @param {any} ws
 * @param {any} attachment
 * @param {unknown} cell
 * @returns {boolean}
 */
export function junkOutsideCover(room, ws, attachment, cell) {
  if (inCover(attachment, cell)) return false;
  room._junk(ws);
  return true;
}
/** @param {unknown} cover @param {unknown} cell */
export const atCover = (cover, cell) => (cover == null ? cell == null : coversCell(cover, cell));
/** @param {any} attachment */
export const cellsWelcome = (attachment) => (isCellRoom(attachment?.key) ? `,"cells":${JSON.stringify(cellsOfNode(coverOf(attachment)))}` : '');
