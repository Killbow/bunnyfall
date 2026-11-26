// @ts-check
import { mintId, overRate } from './accounts.js';
import { dice } from './unitRoll.js';
import { signingKey } from './signing.js';
import {
  profAsks, profShut, trackRow, trackView, storeOf, workableSql, spendableSql, workStatements, spendStatements, silverClothOut,
  provenanceId, workHeld, focusOf,
} from './professions.js';
import { FOCUS_TRACKS } from '../../src/net/craft/craftLaw.js';
import { rankOfXp, PROF_OPS_MAX, PROF_OPS_WINDOW_S } from '../../src/net/professionLaw.js';
import { recipeById, recipeOpen, makerMark, dyeOk, MASTERWORK, JUDGED_CLOTH } from '../../src/net/recipeLaw.js';
import { mintProductRecord, MINT_V_MASTER } from '../../src/net/productRecord.js';
import { MASTER_RANK, MASTER_CATALYSTS, masterChoiceRefusal, masterTrackOf, masterDayOf, rollMasterLines, masterRecordLines, masterLinesOfRecord, masterKeyOf } from '../../src/net/masterLaw.js';
import { LOOSE_ORIGIN } from '../../src/net/bagLaw.js';

/** @param {any} r */
export function masterSpends(r) {
  /** @type {Map<string, { key: string, in: number, cat: number }>} */
  const by = new Map();
  for (const i of r.inputs) by.set(i.key, { key: i.key, in: (by.get(i.key)?.in ?? 0) + i.n, cat: 0 });
  for (const c of MASTER_CATALYSTS) {
    const was = by.get(c.key);
    by.set(c.key, { key: c.key, in: was?.in ?? 0, cat: (was?.cat ?? 0) + c.n });
  }
  return [...by.values()];
}

async function masterAnswer(db, player, row, nowS, extra = {}) {
  const r = recipeById(row.recipe);
  const piece = await db.prepare('SELECT provenance, record, maker, marked, dye FROM products WHERE provenance = ?1').bind(row.provenance).first();
  let kept = null;
  try { kept = JSON.parse(row.lines); } catch { kept = null; }
  const lines = masterLinesOfRecord(kept);
  const craft = masterTrackOf(r);
  return {
    ok: true, ...extra, master: true, recipe: row.recipe, quality: MASTERWORK, count: 1, seed: Number(row.seed), day: Number(row.day),
    maker: piece?.maker ?? null, marked: Number(piece?.marked ?? 0) === 1, dye: piece?.dye == null ? null : Number(piece.dye),
    xp: 0, first: false, chosen: lines ? lines.map(masterKeyOf) : null, lines,
    pieces: piece ? [{ provenance: piece.provenance, record: piece.record }] : [],
    track: trackView(await trackRow(db, player.id, row.char_id, craft), craft, nowS),
    stores: r ? await Promise.all(masterSpends(r).map((s) => storeOf(db, player.id, row.char_id, s.key))) : [],
  };
}

export async function masterWork(ctx, player, env, { character, recipe: id, lines, name = null, dye = null, rid } = {}) {
  const { db, nowS, rand, subtle } = ctx;
  const refused = profAsks(player, { character, rid });
  if (refused) return refused;
  const prior = await db.prepare('SELECT * FROM prof_masters WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return masterAnswer(db, player, prior, nowS, { repeat: true });
  const closed = profShut(player, env);
  if (closed) return closed;
  const r = recipeById(id);
  if (!r) return { error: 'bad-recipe' };
  const why = masterChoiceRefusal(r, lines);
  if (why === 'recipe') return { error: 'prof-master' };
  if (why) return { error: 'prof-master-lines' };
  if (!dyeOk(r, dye)) return { error: 'prof-dye' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const craft = masterTrackOf(r);
  const track = await trackRow(db, player.id, character, craft);
  const rank = rankOfXp(Number(track?.xp ?? 0));
  if (rank < MASTER_RANK || !recipeOpen(r, rank)) return { error: 'prof-rank' };
  const focused = FOCUS_TRACKS.includes(craft);
  if (focused && !(await focusOf(db, player.id, character)).crafts.includes(craft)) return { error: 'prof-focus' };
  const day = masterDayOf(nowS);
  const maker = makerMark(name);
  const seed = Math.floor(dice(rand) * 4294967296);
  const provenance = provenanceId(rand);
  // The lines roll once, and the record and the row keep the values, so no reader rolls the bands again.
  const rolled = rollMasterLines(r, lines, seed);
  if (!rolled) return { error: 'prof-master-lines' };
  const signed = masterRecordLines(rolled);
  const record = await mintProductRecord({ p: provenance, s: player.id, h: character, r: r.id, q: MASTERWORK, m: maker, c: seed, a: maker !== null,
    u: dye ?? null, v: MINT_V_MASTER, l: signed }, await signingKey(env, subtle), { subtle, nowS });
  const nonce = mintId(rand);
  const spends = masterSpends(r);
  const decided = 'EXISTS (SELECT 1 FROM prof_masters WHERE player = ?1 AND rid = ?5 AND n = ?6)';
  // Goods spend loose units first and catalysts only counted units, so counted units must cover the catalysts and
  // whatever goods the loose units cannot.
  const binds = [player.id, character, rid, day, r.id, provenance, JSON.stringify(signed), seed, nowS, nonce];
  const held = spends.map((s, i) => {
    const [k, n, c] = [`?${11 + 3 * i}`, `?${12 + 3 * i}`, `?${13 + 3 * i}`];
    binds.push(s.key, s.in, s.cat);
    const loose = `COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ${k} AND origin = '${LOOSE_ORIGIN}'), 0)`;
    return `${workableSql('?1', '?2', k)} >= ${n} + ${c} AND ${spendableSql('?1', '?2', k)} >= ${c} + MAX(0, ${n} - ${loose})`;
  });
  // The product's loose and bought flags are read in the batch before the spends, so they see the goods as held.
  const goods = spends.filter((s) => s.in > 0).map((s) => s.key), all = spends.map((s) => s.key);
  const any = (/** @type {string[]} */ keys, /** @type {string} */ origin) => keys.map((k) => `COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = '${k.replace(/'/g, "''")}' AND origin = '${origin}'), 0) > 0`).join(' OR ') || '0';
  const marked = maker !== null ? 1 : 0;
  await db.batch([
    // The unique day allows one work a character a day, and each later statement runs only if this row landed.
    db.prepare(`INSERT OR IGNORE INTO prof_masters (player, rid, char_id, day, recipe, provenance, lines, seed, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE ${held.join(' AND ')}${focused ? ` AND EXISTS (SELECT 1 FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession = '${craft}')` : ''}`).bind(...binds),
    db.prepare(`INSERT INTO products (provenance, owner, char_id, maker, recipe, template, material, quality, seed, record, made_at, marked, dye, hand, bought_with, loose)
      SELECT ?5, ?1, ?2, ?6, ?7, ?8, ?9, ?10, seed, ?11, at, ?12, ?13, NULL,
        CASE WHEN ${any(goods, LOOSE_ORIGIN)} THEN 'gold' WHEN ${any(all, 'bought')} THEN 'marks' END,
        CASE WHEN ${any(goods, LOOSE_ORIGIN)} THEN 1 ELSE 0 END
      FROM prof_masters WHERE player = ?1 AND rid = ?3 AND n = ?4`)
      .bind(player.id, character, rid, nonce, provenance, maker, r.id, r.templateIndex, r.material, MASTERWORK, record, marked, dye ?? null),
    ...spends.filter((s) => s.in > 0).flatMap((s) => workStatements(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided, binds: [s.key, s.in, rid, nonce] })),
    ...spends.filter((s) => s.cat > 0).flatMap((s) => spendStatements(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided, binds: [s.key, s.cat, rid, nonce] })),
    ...spends.filter((s) => s.in > 0 && JUDGED_CLOTH.includes(s.key)).flatMap((s) => silverClothOut(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided, binds: [s.key, s.in, rid, nonce] })),
  ]);
  const made = await db.prepare('SELECT * FROM prof_masters WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return masterAnswer(db, player, made, nowS);
  if (made) return masterAnswer(db, player, made, nowS, { repeat: true });
  if (focused && !(await focusOf(db, player.id, character)).crafts.includes(craft)) return { error: 'prof-focus' };
  if (await db.prepare('SELECT 1 FROM prof_masters WHERE player = ?1 AND char_id = ?2 AND day = ?3').bind(player.id, character, day).first()) return { error: 'prof-master-day' };
  for (const s of spends) {
    const st = await storeOf(db, player.id, character, s.key);
    const counted = (st.own ?? 0) + (st.bought ?? 0), want = s.cat + Math.max(0, s.in - (st[LOOSE_ORIGIN] ?? 0)), gold = st.gold ?? 0;
    if (workHeld(st) < s.in + s.cat || counted < want) {
      return { error: workHeld(st) + gold >= s.in + s.cat && counted + gold >= want ? 'stores-gold' : 'stores-short', material: s.key };
    }
  }
  return { error: 'stores-short' };
}
