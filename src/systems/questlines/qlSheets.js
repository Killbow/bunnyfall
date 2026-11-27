// @ts-check
import { QL_FAMILY_NAMES } from './qlFamilies.js';
import FIGHTERS_GUILD from './sheets/fightersGuild.json' with { type: 'json' };
import KNIGHTLY_ORDERS from './sheets/knightlyOrders.json' with { type: 'json' };
import MAGES_GUILD from './sheets/magesGuild.json' with { type: 'json' };
import THIEVES_GUILD from './sheets/thievesGuild.json' with { type: 'json' };
import DARK_BROTHERHOOD from './sheets/darkBrotherhood.json' with { type: 'json' };
import HOLY_ORDERS from './sheets/holyOrders.json' with { type: 'json' };
import NOBILITY from './sheets/nobility.json' with { type: 'json' };
import MERCHANTS from './sheets/merchants.json' with { type: 'json' };
import COMMONERS from './sheets/commoners.json' with { type: 'json' };
import WITCHES from './sheets/witches.json' with { type: 'json' };
import VAMPIRES from './sheets/vampires.json' with { type: 'json' };
import DAEDRA from './sheets/daedra.json' with { type: 'json' };
import MAIN_QUEST from './sheets/mainQuest.json' with { type: 'json' };
import MODS from './sheets/mods.json' with { type: 'json' };
import QUESTLINES from './sheets/questlines.json' with { type: 'json' };

export const SHEET_FAMILIES = Object.freeze([FIGHTERS_GUILD, KNIGHTLY_ORDERS, MAGES_GUILD, THIEVES_GUILD, DARK_BROTHERHOOD, HOLY_ORDERS, NOBILITY, MERCHANTS, COMMONERS, WITCHES, VAMPIRES, DAEDRA, MAIN_QUEST, MODS, QUESTLINES]);
if (SHEET_FAMILIES.map((f) => f.family).join() !== QL_FAMILY_NAMES.join()) throw new Error('qlSheets: the families\' files and QL_FAMILY_NAMES disagree');

// Mirrors PAY_PROFILES in qlRewards.js, so the sheet check never imports the reward makers.
export const PAY_NAMES = Object.freeze(['standard', 'lesser', 'greater', 'double', 'betrayal', 'own', 'none']);

export const SHEETS = (() => {
  const map = new Map();
  for (const fam of SHEET_FAMILIES) {
    for (const s of fam.sheets ?? []) {
      const key = String(s.quest ?? '').toUpperCase();
      if (!key || map.has(key)) continue;
      map.set(key, Object.freeze({ ...s, family: fam.family }));
    }
  }
  return map;
})();

export const sheetFor = (questName) => SHEETS.get(String(questName ?? '').toUpperCase()) ?? null;
