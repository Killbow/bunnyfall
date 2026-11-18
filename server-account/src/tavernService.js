// @ts-check
// BUNNYFALL: recipes, order identities, timing and pay are checked here. World presence is the character's
// checkpoint, as with other services; this is not an independent server simulation of the room's NPCs.
import { createTavernShift, stepTavernShift, tavernOrder, TAVERN_RECIPES, TAVERN_BARDS_FACTION, TAVERN_SHIFT_MAX_S } from '../../src/net/tavernServiceLaw.js';
import { realmAtOf, recordMovedOf, prepareRealmRecord, dropIfUnnamed, dropObjects, realmSaveTextOf, mustChange } from './realm.js';
import { tavernProgressOf, tavernReputation } from '../../src/net/tavernFavorLaw.js';
import { tavernDiscordNames, discordServeStatement, pendingDiscordTips, collectDiscordTips, TAVERN_DISCORD_TIP } from './discordTavernPatrons.js';
import { creditSave } from '../../src/net/realm/realmGoldLaw.js';

const keyOk = (s) => typeof s === 'string' && /^[A-Za-z0-9:._-]{1,100}$/.test(s);
const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
/** @param {any} ctx @param {string} player @param {any} body */
export async function tavernServiceAct(ctx, player, body) {
  const { db, bucket, nowS, rand } = ctx;
  const at = realmAtOf(body);
  if (!at || typeof body.txn !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(body.txn)) return { error: 'tavern-bad' };
  // An acknowledgement lost before a checkpoint is still the same operation, before the sequence check.
  const replay = await db.prepare('SELECT t.result, c.seq, c.lease FROM tavern_service_txns t JOIN realm_characters c ON c.id = t.character WHERE t.character = ? AND t.txn = ? AND c.player = ?')
    .bind(at.id, body.txn, player).first();
  if (replay) {
    if (replay.lease !== at.lease) return { error: 'lease' };
    const result = parse(replay.result);
    return { ...result, ...(result.realm ? { realm: { seq: replay.seq } } : {}), replayed: true };
  }
  const moved = await recordMovedOf(db, player, at);
  if (moved) return moved;
  const row = await db.prepare('SELECT version, state FROM tavern_service WHERE character = ? AND player = ?').bind(at.id, player).first();
  const previous = parse(row?.state ?? 'null');
  if (body.op === 'read') {
    const patrons = Array.isArray(body.patrons) ? body.patrons.slice(0, 24).filter(keyOk) : [];
    const audience = await tavernDiscordNames(db, nowS, patrons);
    return { ok: true, state: previous, version: row?.version ?? 0, discordNames: audience?.names ?? {} };
  }
  const version = row?.version ?? 0;
  if (body.version !== version) return { error: 'tavern-version' };
  const char = await db.prepare('SELECT obj, name FROM realm_characters WHERE id = ? AND player = ?').bind(at.id, player).first();
  const save = parse(await realmSaveTextOf(await bucket?.get(char?.obj)));
  if (!save) return { error: 'no-data' };
  const b = save.interior?.building;
  if (!b || b.buildingType !== 15 || String(b.buildingKey) !== String(body.buildingKey)) return { error: 'tavern-place' };
  const place = JSON.stringify([b.buildingKey, b.regionIndex ?? null, b.locationIndex ?? null, b.townMapId ?? null]);
  let result;
  if (body.op === 'start') {
    if (!keyOk(body.where) || !keyOk(body.keeper) || !Array.isArray(body.patrons) || body.patrons.length < 1 || body.patrons.length > 24 || !body.patrons.every(keyOk) || body.patrons.includes(body.keeper)) return { error: 'tavern-bad' };
    if (previous && previous.phase !== 'done' && nowS - previous.started <= TAVERN_SHIFT_MAX_S) {
      if (previous.where !== body.where || previous.place !== place) return { error: 'tavern-other-shift' };
      return { ok: true, state: previous, version };
    }
    const m = save.modData?.BunnyGuilds?.bards;
    const seed = new DataView(rand(new Uint8Array(4)).buffer).getUint32(0);
    result = { state: createTavernShift({ keeper: body.keeper, patrons: [...new Set(body.patrons)], where: body.where, member: !!m,
      rank: m?.rank ?? 0, seed, nowS }), gold: 0, rep: 0 };
    result.state.place = place;
    result.state.discordAudience = await tavernDiscordNames(db, nowS, body.patrons);
  } else if (body.op === 'discord-tips') {
    result = { state: previous, gold: 0, rep: 0 };
  } else {
    if (!previous || previous.where !== body.where || previous.place !== place) return { error: 'tavern-place' };
    result = stepTavernShift(previous, body, nowS);
    if ('error' in result) return result;
  }
  const tips = await pendingDiscordTips(db, at.id);
  if (body.op === 'discord-tips' && !tips.n) return { ok: true, state: previous, version, discordGold: 0 };
  const discordGold = tips.n * TAVERN_DISCORD_TIP;
  const order = tavernOrder(previous);
  const audience = previous?.discordAudience;
  const patron = audience?.names[order?.patron];
  const drink = TAVERN_RECIPES.find((entry) => entry.id === order?.recipe)?.name;
  const served = body.op === 'serve' && result.state.phase === 'served' && patron && drink;
  let prep = null;
  if (discordGold || result.gold || result.rep || result.favor || result.localRep) {
    prep = await prepareRealmRecord(ctx, player, at, (record) => {
      creditSave(record, result.gold + discordGold);
      if (result.favor || result.localRep) {
        record.modData ??= {}; record.modData.BunnyGuilds ??= {}; record.modData.BunnyGuilds._marks ??= {};
        const marks = record.modData.BunnyGuilds._marks;
        marks.tavern = tavernProgressOf(marks.tavern);
        marks.tavern.favor += result.favor ?? 0;
        tavernReputation(record, marks.tavern, b.regionIndex, String(b.townMapId ?? body.where.split(':')[0]), result.localRep ?? 0);
      }
      if (result.rep) {
        const reps = record.factionRep;
        const i = reps?.ids?.indexOf(TAVERN_BARDS_FACTION) ?? -1;
        if (i >= 0) reps.rep[i] = Math.min(100, (Number(reps.rep[i]) || 0) + result.rep);
      }
      return null;
    });
    if ('error' in prep) return prep;
  }
  const answer = { ok: true, ...result, discordGold, version: version + 1, ...(prep ? { realm: { seq: prep.seq } } : {}) };
  const stateText = JSON.stringify(result.state);
  try {
    await db.batch([
      ...(prep?.steps ?? []),
      ...(row ? [db.prepare('UPDATE tavern_service SET version = ?, state = ?, updated_at = ? WHERE character = ? AND player = ? AND version = ?')
        .bind(version + 1, stateText, nowS, at.id, player, version)] : [db.prepare('INSERT INTO tavern_service (character, player, version, state, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(at.id, player, 1, stateText, nowS)]),
      mustChange(db),
      ...(discordGold ? [collectDiscordTips(db, at.id, tips.last)] : []),
      ...(served ? [discordServeStatement(db, audience, at.id, char.name, patron, drink, nowS)] : []),
      db.prepare('INSERT INTO tavern_service_txns (character, txn, result, at) VALUES (?, ?, ?, ?)').bind(at.id, body.txn, JSON.stringify(answer), nowS),
      db.prepare('DELETE FROM tavern_service_txns WHERE character = ? AND at < ?').bind(at.id, nowS - 30 * 86400),
    ]);
  } catch (error) {
    if (prep) await dropIfUnnamed(db, bucket, player, at.id, prep.key);
    const again = await db.prepare('SELECT result FROM tavern_service_txns WHERE character = ? AND txn = ?').bind(at.id, body.txn).first();
    if (again) return { ...parse(again.result), replayed: true };
    const changed = await recordMovedOf(db, player, at);
    if (changed) return changed;
    const latest = await db.prepare('SELECT version FROM tavern_service WHERE character = ?').bind(at.id).first();
    if (latest?.version !== version) return { error: 'tavern-version' };
    throw error;
  }
  if (prep) await dropObjects(bucket, [prep.prev]);
  return answer;
}
