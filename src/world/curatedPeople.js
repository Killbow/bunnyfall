import { NPC_SERVICE } from '../guilds/guildNpcServices.js';

export const TEMPLE_SUMMONER_VENDOR = 'beautiful-villages';
const MAGES_GUILD_SUMMONER = 66;
export const SUMMONER_FACTIONS = Object.freeze(Object.entries(NPC_SERVICE)
  .filter(([id, kind]) => kind === 'DaedraSummoning' && Number(id) !== MAGES_GUILD_SUMMONER).map(([id]) => Number(id)));

const row = (block, record, deity, person) => Object.freeze({ vendor: TEMPLE_SUMMONER_VENDOR, block, record, deity, person: Object.freeze(person) });
export const CURATED_TEMPLE_SUMMONERS = Object.freeze([
  row('TEMPASA0.RMB', 24, 21, { position: 8032, xPos: -90, yPos: 0, zPos: -226, factionID: 456, flags: 1, textureArchive: 177, textureRecord: 4 }),
  row('TEMPASA1.RMB', 21, 21, { position: 8032, xPos: -90, yPos: 0, zPos: -226, factionID: 456, flags: 1, textureArchive: 177, textureRecord: 4 }),
  row('TEMPASA2.RMB', 25, 21, { position: 8032, xPos: -90, yPos: 0, zPos: -232, factionID: 456, flags: 1, textureArchive: 177, textureRecord: 4 }),
  row('TEMPASB0.RMB', 9, 22, { position: 49857, xPos: 97, yPos: 0, zPos: 224, factionID: 464, flags: 1, textureArchive: 181, textureRecord: 0 }),
  row('TEMPASC0.RMB', 9, 24, { position: 50600, xPos: -93, yPos: 0, zPos: 176, factionID: 470, flags: 33, textureArchive: 184, textureRecord: 29 }),
  row('TEMPASD0.RMB', 13, 26, { position: 49353, xPos: 97, yPos: 0, zPos: 314, factionID: 475, flags: 33, textureArchive: 181, textureRecord: 5 }),
  row('TEMPASD1.RMB', 11, 26, { position: 49353, xPos: 97, yPos: 0, zPos: 314, factionID: 475, flags: 33, textureArchive: 181, textureRecord: 5 }),
  row('TEMPASE0.RMB', 26, 29, { position: 8203, xPos: 82, yPos: 0, zPos: 146, factionID: 488, flags: 33, textureArchive: 184, textureRecord: 10 }),
  row('TEMPASF0.RMB', 12, 27, { position: 54605, xPos: 82, yPos: 0, zPos: 96, factionID: 482, flags: 1, textureArchive: 182, textureRecord: 40 }),
  row('TEMPASF1.RMB', 12, 27, { position: 54605, xPos: 82, yPos: 0, zPos: 96, factionID: 482, flags: 1, textureArchive: 182, textureRecord: 40 }),
  row('TEMPASG0.RMB', 18, 33, { position: 43356, xPos: 162, yPos: 0, zPos: -98, factionID: 492, flags: 33, textureArchive: 181, textureRecord: 1 }),
  row('TEMPASH0.RMB', 11, 35, { position: 36089, xPos: -92, yPos: 0, zPos: 122, factionID: 498, flags: 1, textureArchive: 177, textureRecord: 4 }),
  row('TEMPASH1.RMB', 13, 35, { position: 36089, xPos: -92, yPos: 0, zPos: 122, factionID: 498, flags: 1, textureArchive: 177, textureRecord: 4 }),
  row('TEMPASH2.RMB', 12, 35, { position: 36089, xPos: -92, yPos: 0, zPos: 122, factionID: 498, flags: 1, textureArchive: 177, textureRecord: 4 }),
  row('TEMPASH3.RMB', 3, 35, { position: 36089, xPos: -92, yPos: 0, zPos: 122, factionID: 498, flags: 1, textureArchive: 177, textureRecord: 4 }),
  row('TEMPASH4.RMB', 4, 35, { position: 36089, xPos: -92, yPos: 0, zPos: 122, factionID: 498, flags: 1, textureArchive: 177, textureRecord: 4 }),
  row('TEMPBSA0.RMB', 9, 21, { position: 8032, xPos: -90, yPos: 0, zPos: -226, factionID: 456, flags: 1, textureArchive: 177, textureRecord: 4 }),
  row('TEMPBSB0.RMB', 9, 22, { position: 49857, xPos: 97, yPos: 0, zPos: 224, factionID: 464, flags: 1, textureArchive: 181, textureRecord: 0 }),
  row('TEMPBSC0.RMB', 12, 24, { position: 50600, xPos: -93, yPos: 0, zPos: 176, factionID: 470, flags: 33, textureArchive: 184, textureRecord: 29 }),
  row('TEMPBSD0.RMB', 8, 26, { position: 49353, xPos: 97, yPos: 0, zPos: 314, factionID: 475, flags: 33, textureArchive: 181, textureRecord: 5 }),
  row('TEMPBSE0.RMB', 7, 29, { position: 8203, xPos: 82, yPos: 0, zPos: 146, factionID: 488, flags: 33, textureArchive: 184, textureRecord: 10 }),
  row('TEMPBSF0.RMB', 12, 27, { position: 54605, xPos: 82, yPos: 0, zPos: 96, factionID: 482, flags: 1, textureArchive: 182, textureRecord: 40 }),
  row('TEMPBSG0.RMB', 10, 33, { position: 43356, xPos: 162, yPos: 0, zPos: -98, factionID: 492, flags: 33, textureArchive: 181, textureRecord: 1 }),
  row('TEMPBSH0.RMB', 8, 35, { position: 36089, xPos: -92, yPos: 0, zPos: 122, factionID: 498, flags: 1, textureArchive: 177, textureRecord: 4 }),
]);
const BY_BLOCK = new Map();
for (const r of CURATED_TEMPLE_SUMMONERS) (BY_BLOCK.get(r.block) ?? BY_BLOCK.set(r.block, []).get(r.block)).push(r);

export const curatedSummonersOf = (name, vendor) => (vendor === TEMPLE_SUMMONER_VENDOR ? BY_BLOCK.get(name) ?? [] : []);

export function curateBlockPeople(dfBlock, vendor) {
  // Match on the block name the town lays out, since a pack's JSON can name itself as a different block.
  const rows = curatedSummonersOf(dfBlock?.servedName ?? dfBlock?.name, vendor);
  let stood = 0;
  for (const r of rows) {
    const sub = dfBlock.rmbBlock?.subRecords?.[r.record];
    const data = dfBlock.rmbBlock?.fldHeader?.buildingDataList?.[r.record];
    const interior = sub?.interior;
    if (!interior || data?.factionId !== r.deity) continue;
    const people = interior.blockPeopleRecords ?? (interior.blockPeopleRecords = []);
    if (people.some((p) => SUMMONER_FACTIONS.includes(p.factionID))) continue;
    const p = r.person;
    people.push({ ...p, textureBitfield: ((p.textureArchive << 7) | (p.textureRecord & 0x7f)) & 0xffff });
    if (interior.header) interior.header.numPeopleRecords = people.length;
    stood++;
  }
  return stood;
}
