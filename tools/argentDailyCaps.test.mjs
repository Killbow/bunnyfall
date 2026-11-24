import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { deedStatements, exchangeMarks, findMarks, gatherStrikeStatement, gateStrikeStatement } from '../server-account/src/marks.js';

test('Argent payouts and bank sales pass the former daily caps without replaying ledger entries', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`
      CREATE TABLE players (id TEXT PRIMARY KEY);
      CREATE TABLE guilds (id TEXT PRIMARY KEY);
      CREATE TABLE gate_kills (day INTEGER, account TEXT, at INTEGER);
      CREATE TABLE node_harvests (player TEXT, rid TEXT, n TEXT);
      CREATE TABLE guild_members (guild_id TEXT, player TEXT, char_id TEXT, joined_at INTEGER);
      CREATE TABLE guild_deed_marks (guild_id TEXT, event TEXT, account TEXT, char_id TEXT, at INTEGER, UNIQUE(guild_id,event,account));
      CREATE TABLE rate_limits (key TEXT PRIMARY KEY, window_start INTEGER, count INTEGER);
      INSERT INTO players VALUES ('player');
      INSERT INTO guilds VALUES ('guild');
      INSERT INTO guild_members VALUES ('guild','player','character',0);
      INSERT INTO node_harvests VALUES ('player','gather-rid','nonce');
    `);
    sqlite.exec(readFileSync(new URL('../server-account/migrations/0025_marks.sql', import.meta.url), 'utf8'));
    const db = {
      prepare(sql) {
        const statement = sqlite.prepare(sql);
        return { bind(...values) {
          const args = /\?\d+/.test(sql)
            ? [Object.fromEntries(values.map((value,i) => ['?' + (i+1),value]))]
            : values;
          return {
            first: async () => statement.get(...args),
            run: async () => ({ meta: statement.run(...args) }),
          };
        } };
      },
      batch: async statements => Promise.all(statements.map(async statement => ({ results: [await statement.first()] }))),
    };
    const player = { id: 'player', handle: 'Tester', registered_at: 0 };
    const env = { MARKS_OPEN: 'on' };
    const ctx = { db, nowS: 864000, rand: () => .99 };
    const seed = sqlite.prepare("INSERT INTO marks_ledger VALUES (NULL,'mint',NULL,?1,?2,?3,?4,10,864000,'seed',NULL,?5)");
    seed.run('account','player','gate',150,'old-gate');
    seed.run('account','player','gather',30,'old-gather');
    seed.run('account','player','find',20,'old-find');
    seed.run('account','player','find',1000,'funds');
    for (let n=0; n<4; n++) seed.run('guild','guild','guild-deed',25,'old-deed-' + n);
    sqlite.exec(`
      INSERT INTO gate_kills VALUES (123,'player',864000);
      INSERT INTO guild_deed_marks VALUES ('guild','event','one','c1',0), ('guild','event','two','c2',0);
    `);
    assert.equal((await gateStrikeStatement(ctx,player,env,123).run()).meta.changes,1);
    assert.equal((await gateStrikeStatement(ctx,player,env,123).run()).meta.changes,0);
    assert.equal((await gatherStrikeStatement(ctx,player,env,{rid:'gather-rid',nonce:'nonce',amount:4}).run()).meta.changes,1);
    assert.equal((await findMarks(ctx,player,env,{kind:'corpse',rid:'find-new-01'})).struck,1);
    for (const statement of deedStatements(ctx,player,env,{kind:'gate',event:'event',character:'character',guard:[123]})) await statement.run();
    assert.equal(sqlite.prepare("SELECT balance FROM guild_marks WHERE guild_id='guild'").get().balance,125);
    assert.equal((await exchangeMarks(ctx,player,env,{marks:400,rid:'sale-one-01'})).gold,3200);
    assert.equal((await exchangeMarks(ctx,player,env,{marks:400,rid:'sale-two-02'})).exchangedToday,800);
    assert.equal((await exchangeMarks(ctx,player,env,{marks:400,rid:'sale-two-02'})).repeat,true);
  } finally {
    sqlite.close();
  }
});
