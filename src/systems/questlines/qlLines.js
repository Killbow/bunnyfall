// @ts-check
import { t } from '../../ui/textManager.js';
import { QL_SERVICE_LINES } from '../../net/questlineClaims.js';
import { REVENANT_MIN_RENOWN } from '../../revenants/revenant.js';

/**
 * @typedef {{ quest: string, title: () => string, needs?: ReadonlyArray<LineNeed> }} LineStep
 * @typedef {'lootRarity'|'kingsGambit'|'naval'|'renown'|'starfall'} LineNeed
 * @typedef {{ level?: number, after?: string, online?: boolean, account?: boolean, event?: LineNeed }} LineOpens
 * @typedef {'board'|'magery'|'temple'|'tavern'} LinePost
 * @typedef {{ id: string, group: 'cycle'|'hour'|'coil'|'ketch'|'intro'|'festival', tier: number, post?: LinePost,
 *   title: () => string, lead: () => string, giver: () => string, opens: LineOpens, steps: ReadonlyArray<LineStep> }} Line
 */

/** @param {Line} l @returns {Readonly<Line>} */
const line = (l) => Object.freeze({ ...l, opens: Object.freeze({ ...l.opens }), steps: Object.freeze(l.steps.map((s) => Object.freeze({ ...s, ...(s.needs ? { needs: Object.freeze([...s.needs]) } : {}) }))) });

// Each step's English title matches the DisplayName in its quest script.
export const QL_LINES = Object.freeze([
  line({
    id: 'burningDoors', group: 'cycle', tier: 3, post: 'magery',
    title: () => t('ql.line.burningDoors', 'The Burning Doors'),
    lead: () => t('ql.line.burningDoors.lead', 'Someone is opening Dagon’s Breaches on purpose. A Master Conjurer of the Mages Guild wants to know who, and how.'),
    giver: () => t('ql.line.burningDoors.giver', 'Ysolde Marnhel, Master Conjurer of the Mages Guild of Wayrest'),
    opens: { level: 10, online: true, account: true },
    steps: [
      { quest: 'QLBD01', title: () => t('ql.step.QLBD01', 'A Letter from Wayrest') },
      { quest: 'QLBD02', title: () => t('ql.step.QLBD02', 'The Faithful') },
      { quest: 'QLBD03', title: () => t('ql.step.QLBD03', 'Breaking the Rite') },
      { quest: 'QLBD04', title: () => t('ql.step.QLBD04', 'Through the Burning Door') },
      { quest: 'QLBD05', title: () => t('ql.step.QLBD05', 'The Caged Broker') },
    ],
  }),
  line({
    id: 'covensHoard', group: 'cycle', tier: 3, post: 'magery',
    title: () => t('ql.line.covensHoard', 'The Covens’ Hoard'),
    lead: () => t('ql.line.covensHoard.lead', 'Dagon’s covens hoard the Battlespire’s keys in the deep places. Their champions glow gold.'),
    giver: () => t('ql.line.covensHoard.giver', 'Ysolde Marnhel, Master Conjurer of the Mages Guild of Wayrest'),
    opens: { after: 'burningDoors', online: true, account: true },
    steps: [
      { quest: 'QLCH01', title: () => t('ql.step.QLCH01', 'Gold-Lit') },
      { quest: 'QLCH02', title: () => t('ql.step.QLCH02', 'The Lieutenant') },
      { quest: 'QLCH03', title: () => t('ql.step.QLCH03', 'What the Key Opens') },
    ],
  }),
  line({
    id: 'weirRoad', group: 'cycle', tier: 4, post: 'tavern',
    title: () => t('ql.line.weirRoad', 'The Weir Road'),
    lead: () => t('ql.line.weirRoad.lead', 'The Battlespire fell in 3E 398. One of its last class of Battlemages has never stopped living that year.'),
    giver: () => t('ql.line.weirRoad.giver', 'Corvane Tull, Battlemage of the Spire’s last class'),
    opens: { after: 'covensHoard', online: true, account: true },
    steps: [
      { quest: 'QLWR01', title: () => t('ql.step.QLWR01', 'The Weir Gate') },
      { quest: 'QLWR02', title: () => t('ql.step.QLWR02', 'The Torn Halls') },
      { quest: 'QLWR03', title: () => t('ql.step.QLWR03', 'A Warrior Duke') },
      { quest: 'QLWR04', title: () => t('ql.step.QLWR04', 'The Battlemage’s Account') },
    ],
  }),
  line({
    id: 'hourThatWasNot', group: 'hour', tier: 4, post: 'temple',
    title: () => t('ql.line.hourThatWasNot', 'The Hour That Was Not'),
    lead: () => t('ql.line.hourThatWasNot.lead', 'The priests of Akatosh feel a wound in time under the Bay, and brass where there should be stone.'),
    giver: () => t('ql.line.hourThatWasNot.giver', 'Prior Anselm Vey of the Order of the Hour'),
    opens: { level: 12, online: true, account: true },
    steps: [
      { quest: 'QLHR01', title: () => t('ql.step.QLHR01', 'Brass at Dusk') },
      { quest: 'QLHR02', title: () => t('ql.step.QLHR02', 'The Orrery of Endings') },
    ],
  }),
  line({
    id: 'skyKetch', group: 'ketch', tier: 4, post: 'tavern',
    title: () => t('ql.line.skyKetch', 'The Sky-Ketch'),
    lead: () => t('ql.line.skyKetch.lead', 'Every ten hours a Rourken airship appears over Daggerfall. An antiquarian from Sentinel wants to know why.'),
    giver: () => t('ql.line.skyKetch.giver', 'Imrah Bel-Tavir, Antiquarian of Sentinel'),
    opens: { level: 12, online: true, account: true },
    steps: [
      { quest: 'QLSK01', title: () => t('ql.step.QLSK01', 'The Ketch That Never Lands') },
      { quest: 'QLSK02', title: () => t('ql.step.QLSK02', 'The Starved Engine') },
      { quest: 'QLSK03', title: () => t('ql.step.QLSK03', 'The Tonal Warden') },
      { quest: 'QLSK04', title: () => t('ql.step.QLSK04', 'What the Lodestone Answers') },
    ],
  }),
  line({
    id: 'oldCoil', group: 'coil', tier: 3, post: 'tavern',
    title: () => t('ql.line.oldCoil', 'The Old Coil'),
    lead: () => t('ql.line.oldCoil.lead', 'Sentinel’s sailors say the World-Skin was shed once, and that what was shed still swims.'),
    giver: () => t('ql.line.oldCoil.giver', 'Hamid al-Rasheen, a packet captain of Sentinel'),
    opens: { level: 8, online: true, account: true },
    steps: [
      { quest: 'QLOC01', title: () => t('ql.step.QLOC01', 'The Sailors’ Tale') },
      { quest: 'QLOC02', title: () => t('ql.step.QLOC02', 'The Packet Lanes') },
      { quest: 'QLOC03', title: () => t('ql.step.QLOC03', 'The Shed Skin') },
    ],
  }),
  line({
    id: 'thirteenthFrostfall', group: 'festival', tier: 3,
    title: () => t('ql.line.thirteenthFrostfall', 'The Thirteenth of Frostfall'),
    lead: () => t('ql.line.thirteenthFrostfall.lead', 'At the Witches’ Festival the covens sing stars out of the sky. A witch of Glenmoril wants to know why.'),
    giver: () => t('ql.line.thirteenthFrostfall.giver', 'Morwen, a Wyrd Sister of Glenmoril'),
    opens: { level: 6, online: true, account: true, event: 'starfall' },
    steps: [
      { quest: 'QLTF01', title: () => t('ql.step.QLTF01', 'Music in the Woods'), needs: ['starfall'] },
      { quest: 'QLTF02', title: () => t('ql.step.QLTF02', 'The Coven on the Bluff') },
      { quest: 'QLTF03', title: () => t('ql.step.QLTF03', 'Three Stars'), needs: ['starfall'] },
      { quest: 'QLTF04', title: () => t('ql.step.QLTF04', 'What the Thread Is Worth') },
    ],
  }),
  line({
    id: 'introCrafts', group: 'intro', tier: 1, post: 'board',
    title: () => t('ql.line.introCrafts', 'The Court Crafter'),
    lead: () => t('ql.line.introCrafts.lead', 'A crafter who works for the court wants an apprentice who can find their own materials.'),
    giver: () => t('ql.line.introCrafts.giver', 'a court crafter'),
    opens: { level: 2, online: true, account: true },
    steps: [
      { quest: 'QLIP01', title: () => t('ql.step.QLIP01', 'Of Rod and Root') },
      { quest: 'QLIP02', title: () => t('ql.step.QLIP02', 'Ore and Timber') },
      { quest: 'QLIP03', title: () => t('ql.step.QLIP03', 'Made by Hand') },
    ],
  }),
  line({
    id: 'introGear', group: 'intro', tier: 1, post: 'board',
    title: () => t('ql.line.introGear', 'The Smith’s Secrets'),
    lead: () => t('ql.line.introGear.lead', 'An armorer offers to show you what a good piece of gear can still be made into.'),
    giver: () => t('ql.line.introGear.giver', 'an armorer'),
    opens: { level: 4 },
    steps: [
      { quest: 'QLIG01', title: () => t('ql.step.QLIG01', 'A Stone in the Setting'), needs: ['lootRarity'] },
      { quest: 'QLIG02', title: () => t('ql.step.QLIG02', 'Tempered Again'), needs: ['lootRarity'] },
    ],
  }),
  line({
    id: 'introSea', group: 'intro', tier: 2, post: 'board',
    title: () => t('ql.line.introSea', 'The Harbormaster’s Word'),
    lead: () => t('ql.line.introSea.lead', 'A harbormaster needs a captain. Any captain. Even you.'),
    giver: () => t('ql.line.introSea.giver', 'a harbormaster'),
    opens: { level: 5 },
    steps: [
      { quest: 'QLIS01', title: () => t('ql.step.QLIS01', 'Under Sail'), needs: ['naval'] },
      { quest: 'QLIS02', title: () => t('ql.step.QLIS02', 'A Hold Full'), needs: ['naval'] },
      { quest: 'QLIS03', title: () => t('ql.step.QLIS03', 'Strike Your Colors'), needs: ['naval'] },
    ],
  }),
  line({
    id: 'introRoad', group: 'intro', tier: 1, post: 'board',
    title: () => t('ql.line.introRoad', 'The Merchant’s Road'),
    lead: () => t('ql.line.introRoad.lead', 'A stable master knows a merchant yard that pays well for a wagon’s load, if someone will haul it.'),
    giver: () => t('ql.line.introRoad.giver', 'a stable master'),
    opens: { level: 3 },
    steps: [
      { quest: 'QLIR01', title: () => t('ql.step.QLIR01', 'A Wagon’s Load') },
      { quest: 'QLIR02', title: () => t('ql.step.QLIR02', 'The Long Haul') },
    ],
  }),
  line({
    id: 'introTables', group: 'intro', tier: 1, post: 'board',
    title: () => t('ql.line.introTables', 'A Seat at the Table'),
    lead: () => t('ql.line.introTables.lead', 'A tavern regular is looking for someone new to lose to. Or, better, to beat.'),
    giver: () => t('ql.line.introTables.giver', 'a tavern regular'),
    opens: { level: 2 },
    steps: [
      { quest: 'QLIT01', title: () => t('ql.step.QLIT01', 'A Hand of Cards') },
      { quest: 'QLIT02', title: () => t('ql.step.QLIT02', 'The King’s Gambit'), needs: ['kingsGambit'] },
    ],
  }),
  line({
    id: 'introArena', group: 'intro', tier: 2, post: 'board',
    title: () => t('ql.line.introArena', 'The Herald’s Call'),
    lead: () => t('ql.line.introArena.lead', 'The Arena’s Herald is calling for new blood, and pays the first purse in advance of glory.'),
    giver: () => t('ql.line.introArena.giver', 'the Arena’s Herald'),
    opens: { level: 6, online: true },
    steps: [
      { quest: 'QLIA01', title: () => t('ql.step.QLIA01', 'First Blood') },
      { quest: 'QLIA02', title: () => t('ql.step.QLIA02', 'A Name in the Sand') },
    ],
  }),
  line({
    id: 'introBay', group: 'intro', tier: 2, post: 'board',
    title: () => t('ql.line.introBay', 'The Bay’s Troubles'),
    lead: () => t('ql.line.introBay.lead', 'A captain of the watch has more trouble than soldiers: raiders on the roads, and the dead who will not lie down.'),
    giver: () => t('ql.line.introBay.giver', 'a captain of the watch'),
    opens: { level: 6, online: true },
    steps: [
      { quest: 'QLIW01', title: () => t('ql.step.QLIW01', 'Raiders at the Gate') },
      { quest: 'QLIW02', title: () => t('ql.step.QLIW02', 'The Kneeling Dead'), needs: ['renown'] },
    ],
  }),
  line({
    id: 'introFirmament', group: 'intro', tier: 1, post: 'board',
    title: () => t('ql.line.introFirmament', 'Written in the Stars'),
    lead: () => t('ql.line.introFirmament.lead', 'An astrologer insists your fortune is written on the Firmament, and that you can write the rest yourself.'),
    giver: () => t('ql.line.introFirmament.giver', 'an astrologer'),
    opens: { level: 3, online: true },
    steps: [
      { quest: 'QLIF01', title: () => t('ql.step.QLIF01', 'The First Star') },
      { quest: 'QLIF02', title: () => t('ql.step.QLIF02', 'A Constellation of Your Own') },
    ],
  }),
]);

const BY_ID = new Map(QL_LINES.map((l) => [l.id, l]));
export const lineById = (id) => BY_ID.get(id) ?? null;

const BY_QUEST = new Map(QL_LINES.flatMap((l) => l.steps.map((s, i) => [s.quest.toUpperCase(), { line: l, index: i }])));
export const lineStepOf = (questName) => BY_QUEST.get(String(questName ?? '').toUpperCase()) ?? null;

export const lineQuestNames = () => [...BY_QUEST.keys()];

export const lineServiceOf = (line) => QL_SERVICE_LINES[line?.id] ?? null;

export const witnessOf = (line, index) => lineServiceOf(line)?.witness?.[index] ?? null;

/**
 * @typedef {{ level: () => number, lineDone: (id: string) => boolean, online: () => boolean, registered?: () => boolean,
 *   need?: (need: LineNeed) => boolean }} LineProbe
 */

export const unmetNeeds = (l, index, probe) => (l.steps[index]?.needs ?? []).filter((n) => !(probe.need?.(n) ?? true));

/**
 * @param {Readonly<Line>} l
 * @param {LineProbe} probe
 */
export function lineOpens(l, probe) {
  const o = l.opens;
  if (o.online && !probe.online()) return false;
  if (o.account && !(probe.registered?.() ?? true)) return false;
  if (Number.isFinite(o.level) && probe.level() < /** @type {number} */ (o.level)) return false;
  if (o.after && !probe.lineDone(o.after)) return false;
  if (o.event && !eventHolds(l, probe)) return false;
  return unmetNeeds(l, 0, probe).length === 0;
}
export const eventHolds = (l, probe) => !l.opens.event || (probe.need?.(l.opens.event) ?? true);

const NEED_WORDS = Object.freeze({
  lootRarity: () => t('ql.line.needs.lootRarity', 'with Loot rarity on'),
  kingsGambit: () => t('ql.line.needs.kingsGambit', 'with The King\u2019s Gambit on'),
  naval: () => t('ql.line.needs.naval', 'with Naval Combat on'),
  renown: () => t('ql.line.needs.renown', 'at Renown {n}', { n: REVENANT_MIN_RENOWN }),
  starfall: () => t('ql.line.needs.starfall', 'during the Witches’ Festival'),
});

export function opensWords(l, probe, step = 0) {
  const o = l.opens;
  const parts = [];
  if (Number.isFinite(o.level) && probe.level() < /** @type {number} */ (o.level)) parts.push(t('ql.line.opensLevel', 'at level {n}', { n: o.level }));
  if (o.after && !probe.lineDone(o.after)) parts.push(t('ql.line.opensAfter', 'after {line}', { line: lineById(o.after)?.title() ?? o.after }));
  if (o.online && !probe.online()) parts.push(t('ql.line.opensOnline', 'online'));
  else if (o.account && !(probe.registered?.() ?? true)) parts.push(t('ql.line.opensAccount', 'with a registered account'));
  const needs = new Set([...(o.event && !eventHolds(l, probe) ? [o.event] : []), ...unmetNeeds(l, step, probe)]);
  for (const n of needs) parts.push(NEED_WORDS[n]());
  return parts.length ? t('ql.line.opens', 'Opens {when}.', { when: parts.join(', ') }) : null;
}
