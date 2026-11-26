// @ts-check
// Quest actions for the vampire questline. They read the curse through vitae.js and never the questline layer, so
// the quests run with the Questlines switch on or off.

import { ActionTemplate } from '../quest/actions.js';
import { isDayFromMinutes } from '../../world/gameDate.js';
import { skyMinutes, ownMinutes } from '../../world/worldTick.js';
import { awakenVampire, deedCount } from './vitae.js';
import { penanceDone, courtWorkDone } from './masquerade.js';

export class VampNight extends ActionTemplate {
  static typeName = 'VampNight';
  constructor(parentQuest) {
    super(parentQuest);
    this.isTriggerCondition = true;
    // Re-read every tick, so `when _clicked_ and _night_` checks both conditions at once.
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

// The bridge registers these after the classic and questline templates; no other pattern claims a `vamp ` line.
export const vampireActionTemplates = () => [new VampNight(null), new VampClouded(null), new VampAwaken(null), new VampPenance(null), new VampCourtWork(null)];

export class VampPenance extends ActionTemplate {
  static typeName = 'VampPenance';
  get pattern() { return /^\s*vamp penance\s*$/; }
  createNew(source, parentQuest) { return this.test(source) ? new VampPenance(parentQuest) : null; }
  update(_caller) { penanceDone(); this.setComplete(); }
}
export class VampCourtWork extends ActionTemplate {
  static typeName = 'VampCourtWork';
  get pattern() { return /^\s*vamp courtwork\s*$/; }
  createNew(source, parentQuest) { return this.test(source) ? new VampCourtWork(parentQuest) : null; }
  update(_caller) { courtWorkDone(); this.setComplete(); }
}
