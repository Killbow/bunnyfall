#!/usr/bin/env node
// Builds the Analytics Engine SQL questions about relay room load for the relay-load workflow. It writes nothing.
// Run: node tools/relayLoad.mjs --sql <name> [hours] | --names | --table <name> <file> | --hours [hours]

import { isMain } from './lib/isMain.mjs';
import { loadHours, since, questionBook, runBook } from './d1Load.mjs';

// Must match the dataset in server/wrangler.toml's [[analytics_engine_datasets]].
export const DATASET = 'daggerfall_relay';
// The windows question sizes its LIMIT to every row of these kinds over WINDOW_HOURS_MAX, so no row is cut.
export const WINDOW_KINDS = Object.freeze(['world', 'gate', 'chat']);
export const WINDOW_HOURS_MAX = 24;
// Analytics Engine samples points, so counts and sums are weighted by _sample_interval; a MAX is not.
const W = {
  n: 'SUM(_sample_interval)',
  sockets: 'SUM(double2 * _sample_interval)',
  hellos: 'SUM(double3 * _sample_interval)',
  busy: 'SUM(double4 * _sample_interval)',
  poses: 'SUM(double7 * _sample_interval)',
  sends: 'SUM(double8 * _sample_interval)',
  mbOut: 'SUM(double9 * _sample_interval) / 1000000',
  storage: 'SUM((double10 + double11) * _sample_interval)',
  refused: 'SUM(double12 * _sample_interval)',
  full: 'SUM(double13 * _sample_interval)',
  drops: 'SUM(double14 * _sample_interval)',
};
// toUInt32 fails on an empty string, so queries over these blobs skip points from relays that wrote none.
const B = {
  hitDrops: 'SUM(_sample_interval * toUInt32(blob3))',
  fullDrops: 'SUM(_sample_interval * toUInt32(blob4))',
  fulls: 'SUM(_sample_interval * toUInt32(blob5))',
  held: 'SUM(_sample_interval * toUInt32(blob6))',
  heldSent: 'SUM(_sample_interval * toUInt32(blob7))',
  heldGone: 'SUM(_sample_interval * toUInt32(blob8))',
  heldMs: 'SUM(_sample_interval * toUInt32(blob9))',
  beats: 'SUM(_sample_interval * toUInt32(blob10))',
};
const windowHours = (h) => Math.min(loadHours(h), WINDOW_HOURS_MAX);

export const QUESTIONS = Object.freeze([
  ['kinds', 'The rooms by kind (sends, most first)', ['kind', 'room_windows', 'peak', 'hellos', 'busy', 'room_full', 'refused', 'drops', 'poses', 'sends', 'sends_per_pose', 'mb_out', 'storage'],
    (h) => `SELECT blob1 AS kind, ${W.n} AS room_windows, MAX(double15) AS peak, ${W.hellos} AS hellos, ${W.busy} AS busy, ${W.full} AS room_full, ${W.refused} AS refused, ${W.drops} AS drops, ${W.poses} AS poses, ${W.sends} AS sends, IF(${W.poses} > 0, ${W.sends} / ${W.poses}, 0.0) AS sends_per_pose, ${W.mbOut} AS mb_out, ${W.storage} AS storage FROM ${DATASET} WHERE ${since(h)} GROUP BY kind ORDER BY sends DESC LIMIT 40`],
  ['windows', `Every five minutes, by kind (${WINDOW_KINDS.join(', ')}; the last ${WINDOW_HOURS_MAX} hours at most)`, ['bucket', 'kind', 'sockets', 'peak', 'busy', 'room_full', 'drops', 'poses', 'sends'],
    (h) => `SELECT toStartOfInterval(timestamp, INTERVAL '5' MINUTE) AS bucket, blob1 AS kind, ${W.sockets} AS sockets, MAX(double15) AS peak, ${W.busy} AS busy, ${W.full} AS room_full, ${W.drops} AS drops, ${W.poses} AS poses, ${W.sends} AS sends FROM ${DATASET} WHERE ${since(windowHours(h))} AND blob1 IN (${WINDOW_KINDS.map((k) => `'${k}'`).join(', ')}) GROUP BY bucket, kind ORDER BY bucket DESC, kind LIMIT ${12 * windowHours(h) * WINDOW_KINDS.length + 12 * WINDOW_KINDS.length}`],
  // A chat bus holds every player, so the crowds question leaves the chat kind out.
  ['crowds', 'The busiest rooms but the channels (peak sockets, most first)', ['stamp', 'kind', 'peak', 'sockets', 'hellos', 'busy', 'room_full', 'drops', 'poses', 'sends'],
    (h) => `SELECT timestamp AS stamp, blob1 AS kind, double15 AS peak, double2 AS sockets, double3 AS hellos, double4 AS busy, double13 AS room_full, double14 AS drops, double7 AS poses, double8 AS sends FROM ${DATASET} WHERE ${since(h)} AND blob1 != 'chat' ORDER BY peak DESC LIMIT 40`],
  ['fulls', 'The foes budget\'s full frames and its hold, by kind (FOES-FIRST, FOES-HOLD)', ['kind', 'fulls', 'full_drops', 'held', 'held_sent', 'held_gone', 'wait_ms', 'beats', 'hit_drops'],
    (h) => `SELECT blob1 AS kind, ${B.fulls} AS fulls, ${B.fullDrops} AS full_drops, ${B.held} AS held, ${B.heldSent} AS held_sent, ${B.heldGone} AS held_gone, IF(${B.heldSent} > 0, ${B.heldMs} / ${B.heldSent}, 0.0) AS wait_ms, ${B.beats} AS beats, ${B.hitDrops} AS hit_drops FROM ${DATASET} WHERE ${since(h)} AND blob6 != '' GROUP BY kind ORDER BY fulls DESC LIMIT 40`],
  ['storage', 'The room-windows that wrote storage most (writes, most first)', ['stamp', 'kind', 'writes', 'reads', 'room_sockets', 'room_peak'],
    (h) => `SELECT timestamp AS stamp, blob1 AS kind, double11 AS writes, double10 AS reads, double2 AS room_sockets, double15 AS room_peak FROM ${DATASET} WHERE ${since(h)} ORDER BY writes DESC LIMIT 40`],
  ['levels', 'The cells by their node\'s level (COST-2: 0 a 16-pixel cell, 1-4 a coarse node)',['kind', 'level', 'room_windows', 'sockets', 'peak', 'room_full', 'poses', 'sends'],
    (h) => `SELECT blob1 AS kind, blob11 AS level, ${W.n} AS room_windows, ${W.sockets} AS sockets, MAX(double15) AS peak, ${W.full} AS room_full, ${W.poses} AS poses, ${W.sends} AS sends FROM ${DATASET} WHERE ${since(h)} AND blob1 = 'world' GROUP BY kind, level ORDER BY level LIMIT 10`],
  ['moves', 'The cell directory\'s moves (COST-2 part two)',['kind', 'points', 'moves', 'blocked'],
    (h) => `SELECT blob1 AS kind, ${W.n} AS points, SUM(_sample_interval * toUInt32(blob12)) AS moves, SUM(_sample_interval * toUInt32(blob13)) AS blocked FROM ${DATASET} WHERE ${since(h)} AND blob1 = 'cells' AND blob12 != '' GROUP BY kind LIMIT 1`],
]);

const book = questionBook(QUESTIONS);
export const loadSql = book.loadSql;
export const loadTable = book.loadTable;

if (isMain(import.meta.url)) runBook(book, 'relayLoad.mjs');
