// BUNNYFALL (2026-11-26, caverns): THE SHARED MINE, TWO PLAYERS, THE REAL RELAY - the owner: "make the mine shared". Both
// Workers stood in local workerd as the load harness stands them (tools/loadHarness.mjs standServices: a throwaway
// signing pair, every migration), two guest players with realm characters, each the client's own OnlineSession joined
// to one mine's room (net/mine/mineSites.js mineRoomKey), and the room's word checked as both hear it:
//
//   1. both say `hi` and hear the same fresh mine
//   2. A shores a wall; B hears the prop, and B shoring the same wall is refused `taken`
//   3. both strike one section; the dust, creak and rumble come in order, to both
//   4. the section gives: both hear the collapse, the mine reads sealed for an hour, and a strike after it is refused
//   5. a newcomer saying `hi` hears the seal (the client puts them out at once)
//
// The seal's hour and the reset it ends in are the brain's clock (net/mine/mineBrain.js, tools/mineBrain.test.mjs);
// nothing here waits an hour.
//
//   node tools/mineRelayProbe.mjs            (PORT=8870: the account service, the relay on the next port)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { standServices, stopAll, makeBot, setUp, localWebSocket, relayTally, poseAt } from './loadHarness.mjs';
import { OnlineSession } from '../src/net/online.js';
import { mineRoomKey } from '../src/net/mine/mineSites.js';
import { mineLayout } from '../src/net/mine/mineLayout.js';
import { MINE_SEAL_S } from '../src/net/mine/mineBrain.js';

const PX = 616, PY = 398;
const PORT = Number(process.env.PORT ?? 8870);
const LOOK = Object.freeze({ race: 'Nord', gender: 'male', faceIndex: 0, items: [] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
async function until(fn, ms = 15000, step = 50) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); } return fn(); }

const state = mkdtempSync(join(tmpdir(), 'mine-probe-'));
try {
  const svc = await standServices({ port: PORT }, state);
  const ctx = { svc, runTag: Date.now().toString(36).slice(-5), account: { byRoute: new Map(), at: [] } };
  const o = { cells: 1, edge: 0, registered: 0, fighters: 0, movers: 0, gatherers: 0 };
  const WS = localWebSocket({ port: svc.relayPort, tally: relayTally() });
  const room = mineRoomKey(PX, PY);
  const layout = mineLayout(PY * 1000 + PX, 0);
  console.log(`== two players into ${room}`);
  const players = [];
  for (const n of [0, 1]) {
    const bot = await setUp(makeBot(n, o, ctx), o);
    const heard = [];
    const s = new OnlineSession({ url: `ws://127.0.0.1:${svc.relayPort}`, name: bot.account.name, look: LOOK, id: bot.id, secret: bot.secret, mintToken: bot.minter, WebSocketImpl: WS });
    s.onMine = (w) => heard.push(w);
    s.join(room, poseAt(bot, 0));
    players.push({ bot, s, heard });
  }
  const [A, B] = players;
  check(await until(() => A.s.status === 'open' && B.s.status === 'open' && A.s.mnOk && B.s.mnOk), 'both sessions open on a relay that keeps mines');
  await sleep(500);   // the welcome before the first word

  // 1. hi
  A.s.sendMine('hi', { r: 0 }); B.s.sendMine('hi', { r: 0 });
  const stA = await until(() => A.heard.find((w) => w.k === 'st')), stB = await until(() => B.heard.find((w) => w.k === 'st'));
  check(stA && stB && stA.st.reset === stB.st.reset && stA.st.stab.length === layout.sections.length, `both hear the mine: reset ${stA?.st.reset}, ${stA?.st.stab.length} sections`);

  // 2. shoring, shared and taken
  const ch = layout.sections[0].chambers[0];
  const w = ch.walls.findIndex((x) => x.weak) >= 0 ? ch.walls.findIndex((x) => x.weak) : 0;
  A.heard.length = 0; B.heard.length = 0;
  A.s.sendMine('prop', { s: 0, c: 0, w, wood: 'oak' });
  const propped = await until(() => B.heard.find((x) => x.k === 'st' && x.st.props.some((p) => p.s === 0 && p.c === 0 && p.w === w && p.wood === 'oak')));
  check(!!propped, `B hears A's oak prop on wall ${w} (section 0's cap ${propped?.st.cap[0]})`);
  B.s.sendMine('prop', { s: 0, c: 0, w, wood: 'pine' });
  check(!!(await until(() => B.heard.find((x) => x.k === 'no' && x.e === 'taken'))), 'B shoring the same wall is refused: taken');

  // 3 and 4. strikes from both, warnings in order, the collapse
  A.heard.length = 0; B.heard.length = 0;
  const events = (h) => h.filter((x) => x.k === 'st').flatMap((x) => x.ev ?? []);
  for (let i = 0; i < 600 && !events(A.heard).includes('collapse'); i++) {
    (i % 2 ? B : A).s.sendMine('strike', { s: 0, c: 0 });
    await sleep(90);   // two players at about 5.5 a second each: under the relay's gate (MINE_HZ)
  }
  await sleep(500);
  const evA = events(A.heard), evB = events(B.heard);
  const order = ['warn:dust', 'warn:creak', 'warn:rumble', 'collapse'];
  check(order.every((e) => evA.includes(e)) && order.every((e, i) => i === 0 || evA.indexOf(order[i - 1]) < evA.indexOf(e)), `A hears ${evA.join(', ')}`);
  check(order.every((e) => evB.includes(e)), `B hears the same: ${evB.join(', ')}`);
  const last = [...A.heard].reverse().find((x) => x.k === 'st');
  const left = last ? last.st.sealedUntil - Math.floor(Date.now() / 1000) : 0;
  check(left > MINE_SEAL_S - 120 && left <= MINE_SEAL_S, `sealed for about an hour (${left} s left)`);
  A.heard.length = 0;
  A.s.sendMine('strike', { s: 0, c: 0 });
  check(!!(await until(() => A.heard.find((x) => x.k === 'no' && x.e === 'sealed'))), 'a strike on the sealed mine is refused: sealed');

  // 5. a newcomer hears the seal
  const C = { heard: [] };
  const cbot = await setUp(makeBot(2, o, ctx), o);
  C.s = new OnlineSession({ url: `ws://127.0.0.1:${svc.relayPort}`, name: cbot.account.name, look: LOOK, id: cbot.id, secret: cbot.secret, mintToken: cbot.minter, WebSocketImpl: WS });
  C.s.onMine = (x) => C.heard.push(x);
  C.s.join(room, poseAt(cbot, 0));
  await until(() => C.s.status === 'open'); await sleep(500);
  C.s.sendMine('hi', { r: 0 });
  const cst = await until(() => C.heard.find((x) => x.k === 'st'));
  check(!!cst && cst.st.sealedUntil > Date.now() / 1000, 'a newcomer saying hi hears the seal');
  for (const p of [...players, C]) p.s.leave?.();
} catch (e) {
  console.error(e); failed++;
} finally {
  stopAll();
  try { rmSync(state, { recursive: true, force: true }); } catch { /* workerd may hold a file a moment */ }
}
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
