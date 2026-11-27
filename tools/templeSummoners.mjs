#!/usr/bin/env node
// Measures a Daedra summoner spot for each Beautiful Villages temple design from ARENA2, for the curated rows.
// Usage: ARENA2_PATH=<dir> node tools/templeSummoners.mjs [--check]   (--check compares with the committed rows)
import { join } from 'node:path';
import { isMain } from './lib/isMain.mjs';
import { openTownData, interiorTriangles, walkFloor, rayVerdict, rayHit, UNIT } from './townQuestMarkers.mjs';
import { SUMMONER_FACTIONS, TEMPLE_SUMMONER_VENDOR as VENDOR } from '../src/world/curatedPeople.js';
import { rayAabb, STATIC_NPC_ACTIVATION_DISTANCE } from '../src/player/activate.js';
import { EYE_HEIGHT } from '../src/player/motor.js';

// Beautiful Villages' Akatosh temples use faction 26 where the classic temples use 92.
export const DEITY_ALIAS = Object.freeze({ 26: 92 });
const PRIEST = 240;
export const SUMMONER_CLEAR_M = 1.5;
const NEAREST_VIEW_M = 0.6;
const EDITOR = 199, SPAWN = 11, ITEM = 18, ENTER = 8, REST = 4;

export function classicSummoners(blocks) {
  const out = {};
  const names = [];
  for (let i = 0; i < blocks.count; i++) { const n = blocks.getBlockName(i); if (/^TEMPAA[A-H]0\.RMB$/.test(n)) names.push([n, i]); }
  names.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const [, i] of names) {
    const b = blocks.readClassicBlock(i);
    b.rmbBlock.subRecords.forEach((sub, r) => {
      const deity = b.rmbBlock.fldHeader.buildingDataList[r]?.factionId;
      const p = (sub.interior?.blockPeopleRecords ?? []).find((q) => SUMMONER_FACTIONS.includes(q.factionID));
      if (p && out[deity] == null) out[deity] = { position: p.position, factionID: p.factionID, flags: p.flags, textureArchive: p.textureArchive, textureRecord: p.textureRecord };
    });
  }
  return out;
}

export async function measureSummoners(data, { log = () => {} } = {}) {
  const { blocks, packs, getModel, packBlock, billboardSize } = data;
  const summoners = classicSummoners(blocks);
  const rows = [];
  for (const file of packs[VENDOR].names()) {
    const m = /^(TEMP[AB]S..\.RMB)\.json$/.exec(file);
    if (!m) continue;
    const name = m[1];
    const { dfBlock, index } = packBlock(VENDOR, name);
    for (let r = 0; r < dfBlock.rmbBlock.subRecords.length; r++) {
      const interior = dfBlock.rmbBlock.subRecords[r].interior;
      const people = interior.blockPeopleRecords ?? [];
      const priest = people.find((p) => p.factionID === PRIEST);
      if (!priest || people.some((p) => SUMMONER_FACTIONS.includes(p.factionID))) continue;
      const deity = dfBlock.rmbBlock.fldHeader.buildingDataList[r]?.factionId;
      const classic = summoners[DEITY_ALIAS[deity] ?? deity];
      if (!classic) throw new Error(`${name} #${r}: no Daggerfall summoner for deity ${deity}`);
      // The record position seeds the person's name, so the classic one stays unless a person in the room holds it.
      const used = new Set(people.map((p) => p.position));
      let position = classic.position;
      while (used.has(position)) position++;
      const { tris, layout } = await interiorTriangles(getModel, dfBlock, index, r);
      const metres = (f) => ({ x: f.xPos * UNIT, y: -f.yPos * UNIT, z: f.zPos * UNIT });
      const entries = layout.markers.filter((k) => k.type === ENTER || k.type === REST);
      const walk = walkFloor(tris, entries);
      const keepOff = [
        ...people.map(metres),
        ...interior.blockFlatObjectRecords.filter((f) => f.textureArchive === EDITOR && (f.textureRecord === SPAWN || f.textureRecord === ITEM)).map(metres),
        ...entries,
      ];
      const boxAt = (m, size) => ({ min: [m.x - size.w / 2, m.y, m.z - size.w / 2], max: [m.x + size.w / 2, m.y + size.h, m.z + size.w / 2] });
      const room = people.map((p) => { const m = metres(p), size = billboardSize(p.textureArchive, p.textureRecord); return { aim: [m.x, m.y + size.h / 2, m.z], box: boxAt(m, size) }; });
      const views = [];
      for (const cell of walk.reached) {
        const eye = [cell.x, cell.y + EYE_HEIGHT, cell.z];
        for (const P of room) {
          const v = [P.aim[0] - eye[0], P.aim[1] - eye[1], P.aim[2] - eye[2]], L = Math.hypot(...v);
          if (L > STATIC_NPC_ACTIVATION_DISTANCE || L < NEAREST_VIEW_M) continue;
          const d = v.map((e) => e / L);
          if (rayHit(tris, eye, d, L - 0.3)) continue;
          let first = Infinity;
          for (const B of room) { const t = rayAabb(eye, d, B.box); if (t != null && t < first) first = t; }
          views.push({ eye, d, first });
        }
      }
      const size = billboardSize(classic.textureArchive, classic.textureRecord);
      const takesNone = (c) => { const box = boxAt(c, size); return views.every((v) => { const t = rayAabb(v.eye, v.d, box); return t == null || t >= v.first; }); };
      const floor = metres(priest).y;
      const passes = (c) => Math.abs(c.y - floor) < 0.1 && rayVerdict(tris, c) === 'ok'
        && keepOff.every((k) => Math.hypot(c.x - k.x, c.z - k.z) >= SUMMONER_CLEAR_M || Math.abs(c.y - k.y) > 2) && takesNone(c);
      const spot = walk.clearSpot(metres(priest), passes);
      if (!spot) throw new Error(`${name} #${r}: no clear floor for the summoner`);
      const at = [Math.round(spot.x / UNIT), Math.round(-spot.y / UNIT) || 0, Math.round(spot.z / UNIT)];
      log(`${name} #${r} deity ${deity}: summoner ${classic.factionID} at ${at}`);
      rows.push({ block: name, record: r, deity, person: { position, xPos: at[0], yPos: at[1], zPos: at[2], factionID: classic.factionID, flags: classic.flags, textureArchive: classic.textureArchive, textureRecord: classic.textureRecord } });
    }
  }
  rows.sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : a.record - b.record));
  return rows;
}

if (isMain(import.meta.url)) {
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2) { console.error('ARENA2_PATH not set'); process.exit(2); }
  const data = await openTownData(join(arena2));
  const rows = await measureSummoners(data, { log: (s) => console.error(s) });
  if (process.argv.includes('--check')) {
    const { CURATED_TEMPLE_SUMMONERS } = await import('../src/world/curatedPeople.js');
    const strip = (r) => ({ block: r.block, record: r.record, deity: r.deity, person: r.person });
    const want = JSON.stringify(rows), have = JSON.stringify(CURATED_TEMPLE_SUMMONERS.map(strip));
    if (want !== have) { console.error('the committed rows are not the measurement'); console.log(JSON.stringify(rows, null, 2)); process.exit(1); }
    console.log(`the ${rows.length} committed rows are the measurement`);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
}
