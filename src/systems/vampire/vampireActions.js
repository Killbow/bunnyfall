// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 1: THE ELDER'S QUEST'S OWN LINES - three a quest script may say that DFU's machine
// does not know, registered by the quest bridge beside the questlines' (scenes/quest/questBridge.js), for QLVA01 (the
// Clan Elder's summons, systems/questlines/quests/QLVA01.txt). They read the curse through vitae.js, never the layer's
// acts, so the quest runs with the Questlines switch on or off.
//
//   vamp night           a trigger re-read every tick (always-on): its task is set while the sky is night and clear by
//                        day, so `when _clicked_ and _night_` asks both at once
//   vamp clouded <n>     a trigger: true once the vampire has fed <n> more times unseen with the Kiss than when it was
//                        first asked (the count it started from is saved)
//   vamp awaken          the Elder's gift: the Beast awakened (vitae.js awakenVampire)

import { ActionTemplate } from '../quest/actions.js';
import { isDayFromMinutes } from '../gameDate.js';
import { skyMinutes, ownMinutes } from '../worldTick.js';
import { awakenVampire, deedCount } from './vitae.js';

export class VampNight extends ActionTemplate {
  static typeName = 'VampNight';
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.isAlwaysOnTriggerCondition = true;
  }
  get pattern() { return /^\s*vamp night\s*$/; }
  createNew(source, parentQuest) { return this.test(source) ? new VampNight(parentQuest) : null; }
  checkTrigger(_caller) { return !isDayFromMinutes(skyMinutes()); }
}

export class VampClouded extends ActionTemplate {
  static typeName = 'VampClouded';
  get saveShape() { return [['count'], ['from']]; }
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    this.count = 1;
    /** @type {number|null} */
    this.from = null;
  }
  get pattern() { return /^\s*vamp clouded (?<n>\d+)\s*$/; }
  createNew(source, parentQuest) {
    const match = this.test(source);
    if (!match) return null;
    const action = new VampClouded(parentQuest);
    action.count = Math.max(1, Number.parseInt(match.groups.n, 10));
    return action;
  }
  checkTrigger(_caller) {
    const entity = this.parentQuest?.hooks?.playerEntity?.();
    if (!entity) return false;
    const now = deedCount(entity, 'clouded');
    if (this.from == null) this.from = now;
    return now - this.from >= this.count;
  }
}

export class VampAwaken extends ActionTemplate {
  static typeName = 'VampAwaken';
  get pattern() { return /^\s*vamp awaken\s*$/; }
  createNew(source, parentQuest) { return this.test(source) ? new VampAwaken(parentQuest) : null; }
  update(_caller) {
    const entity = this.parentQuest?.hooks?.playerEntity?.();
    if (entity) awakenVampire(entity, Math.floor(ownMinutes()));
    this.setComplete();
  }
}

/** The templates, in the order the bridge registers them (after DFU's and the questlines'; no other pattern claims a
 *  line beginning `vamp `). */
export const vampireActionTemplates = () => [new VampNight(null), new VampClouded(null), new VampAwaken(null)];
