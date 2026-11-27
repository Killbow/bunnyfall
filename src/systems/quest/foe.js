import { QuestResource, matchFirst } from './questResource.js';
import { Symbol as QuestSymbol } from './symbol.js';
import { parseInt as questParseInt } from './parseUtils.js';
import { foesTable } from './tables.js';
import { GENDERS, getNameBankOfRegion, fullName, monsterName } from '../../characters/nameHelper.js';
import { srand, randomRange } from '../../formats/dfRandom.js';
import { enemyDisplayName, isClassEnemyId } from '../../characters/enemyBasics.js';
import { getLocalizedEnemyName } from '../../ui/textManager.js';

const MAX_SPAWN_COUNT = 8;

export { ENEMY_NAMES, isClassEnemyId } from '../../characters/enemyBasics.js';

const DECL = [
  /(Foe|foe) (?<symbol>[a-zA-Z0-9_.-]+) is (?<count>\d+) (?<aFoe>\w+)/,
  /(Foe|foe) (?<sym2>[a-zA-Z0-9_.-]+) is (?<aFoe2>\w+)/,
];

export class Foe extends QuestResource {
  constructor(parentQuest, line = null) {
    super(parentQuest);
    this.spawnCount = 0;
    this.foeName = '';
    this.foeType = -1;
    this.injuredTrigger = false;
    this.deathTrigger = false;
    this.isRestrained = false;
    this.killCount = 0;
    this.learnedKills = new Map();
    this.humanoidGender = GENDERS.Male;
    this.displayName = '';
    this.typeName = '';
    this.namePending = true;
    if (line !== null) this.setResource(line);
  }

  get isFoe() { return true; }

  _rolls() { return this.parentQuest?.rolls ?? Math.random; }
  _range(n) { return n > 0 ? Math.floor(this._rolls()() * n) : 0; }

  get gender() { return this.humanoidGender; }

  // Macro 1 returns the type name and macro 5 the display name, the same inversion as the classic quest engine.
  // typeName stays the canonical saved name; it is localized only here.
  expandMacro(macroType) {
    this.parentQuest.lastResourceReferenced = this;
    if (macroType === 1) return getLocalizedEnemyName(this.foeType, this.typeName);
    if (macroType === 5) return this.displayName;
    return false;
  }

  setInjured() { this.injuredTrigger = true; }
  rearmInjured() { this.injuredTrigger = false; }

  setRestrained() { this.isRestrained = true; }
  clearRestrained() { this.isRestrained = false; }

  // A party kill that the owner's shared quest envelope already brought here (learnedKills, merged in machine.js)
  // is spent instead of counted, so one kill never counts twice.
  creditPartnerKill(owner = null) {
    const key = owner == null ? '' : String(owner);
    const n = this.learnedKills.get(key) ?? 0;
    if (n > 0) { this.learnedKills.set(key, n - 1); return false; }
    this.incrementKills();
    return true;
  }

  incrementKills(amount = 1) {
    this.killCount += amount;
    this.parentQuest?.hooks?.questFoeKilled?.(this.parentQuest, this, amount);
  }

  kill() { this.deathTrigger = true; }

  // The spell queue is never cleared, so later instances of this enemy receive every spell queued so far.
  queueSpell(spell) {
    if (!this.spellQueue) this.spellQueue = [];
    this.spellQueue.push(spell);
  }

  get spellQueueCount() { return this.spellQueue?.length ?? 0; }

  queueItem(dfItem) {
    if (!this.itemQueue) this.itemQueue = [];
    if (this.itemQueue.includes(dfItem)) {
      console.warn('[quest] Duplicate item added to foe item queue.');
      return;
    }
    this.itemQueue.push(dfItem);
  }

  get itemQueueCount() { return this.itemQueue?.length ?? 0; }

  getClonedItemQueue() {
    if (!this.itemQueueCount) return null;
    // Originals stay in the queue; clones of quest items carry questClone so item checks skip them.
    return this.itemQueue.map((it) => (it?.questItem ? { ...it, questClone: true } : { ...it }));
  }

  setResource(line) {
    super.setResource(line);
    const match = matchFirst(line, DECL);
    if (!match) return;
    const g = match.groups;
    this.symbol = new QuestSymbol(g.symbol ?? g.sym2);
    this.foeName = g.aFoe ?? g.aFoe2;
    const count = g.count != null ? questParseInt(g.count) : 0;

    const table = foesTable();
    if (!table.hasValue(this.foeName)) {
      throw new Error(`Foes data table does not contain an entry for ${this.foeName}`);
    }
    this.foeType = questParseInt(table.getValue('id', this.foeName));

    this.spawnCount = Math.min(Math.max(count, 1), MAX_SPAWN_COUNT);

    const world = this.parentQuest?.hooks?.world;
    if (!world) return;
    this._setFoeName(world);
    this.namePending = false;
  }

  _setFoeName(world) {
    this.typeName = enemyDisplayName(this.foeType) ?? String(this.foeType);
    if (!isClassEnemyId(this.foeType)) {
      // The monster seed adds a draw from the generator's current state, as the classic engine does.
      srand(this._range(1000) + randomRange(1, 1000000));
      this.displayName = monsterName(GENDERS.Male, this._rolls());
      return;
    }
    this.humanoidGender = this._rolls()() < 0.55 ? GENDERS.Male : GENDERS.Female;
    srand(this._range(1000));
    this.displayName = fullName(getNameBankOfRegion(world.currentRegionIndex()), this.humanoidGender);
  }

  getSaveData() {
    return {
      spawnCount: this.spawnCount,
      foeId: this.foeType,
      humanoidGender: this.humanoidGender,
      injuredTrigger: this.injuredTrigger,
      restrained: this.isRestrained,
      killCount: this.killCount,
      displayName: this.displayName,
      typeName: this.typeName,
      spellQueue: this.spellQueue ? structuredClone(this.spellQueue) : null,
      itemQueue: this.itemQueue ? structuredClone(this.itemQueue) : null,
    };
  }

  restoreSaveData(dataIn) {
    if (dataIn == null) return;
    this.spawnCount = dataIn.spawnCount;
    this.foeType = dataIn.foeId;
    this.humanoidGender = dataIn.humanoidGender;
    this.injuredTrigger = dataIn.injuredTrigger;
    this.isRestrained = dataIn.restrained;
    this.killCount = dataIn.killCount;
    this.displayName = dataIn.displayName;
    this.typeName = dataIn.typeName;
    this.spellQueue = dataIn.spellQueue ? structuredClone(dataIn.spellQueue) : null;
    this.itemQueue = dataIn.itemQueue ? structuredClone(dataIn.itemQueue) : null;
  }
}
