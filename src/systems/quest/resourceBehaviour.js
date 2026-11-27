// The host drives this plain object. Kept C# quirks: injury returns for the tick, the spell gate is exact zero
// health, the individual click broadcast overwrites the direct click, and restraintApplied is not saved.

import { isShelved } from './quest.js';

export class QuestResourceBehaviour {
  constructor(machine, host = null) {
    this.machine = machine;
    this.host = host;
    machine?._registerBehaviour?.(this);
    this.questUID = 0;
    this.targetSymbol = null;
    this.isFoeDead = false;
    this.foeSpellQueuePosition = 0;
    this.foeItemQueuePosition = 0;
    // Defaults to false, which keeps a quest enemy untargetable by other AI until a quest changes it.
    this.isAttackableByAI = false;
    this.restraintApplied = false;
    this.targetQuest = null;
    this.targetResource = null;
    this.enemy = null;
    this.individualHome = false;
    this.questorHost = false;
    // The object outlives its destroy event (JS has no fake-null), so the destroyed state is explicit.
    this.isComponentDestroyed = false;
    this._destroyHandlers = [];
    this.beat = machine?.beat ?? 0;
  }

  bindHost(host) {
    this.host = host;
    if (this.targetResource?.isFoe) this.enemy = host?.enemy ?? null;
  }

  assignResource(questResource) {
    if (questResource != null) {
      this.questUID = questResource.parentQuest.uid;
      this.targetSymbol = questResource.symbol;
    }
  }

  // The scene mount matches a behavior to its resource by symbol object, so a stale symbol would mount it twice.
  relinkToLiveQuest() {
    if (this.targetQuest == null) {
      const r = this.machine.getQuest(this.questUID)?.getResource?.(this.targetSymbol);
      if (!r?.symbol || r.symbol === this.targetSymbol) return false;
      this.targetSymbol = r.symbol;
      return true;
    }
    if (this.machine.getQuest(this.questUID) === this.targetQuest && this.targetQuest.getResource(this.targetSymbol) === this.targetResource) {
      const own = this.targetResource?.symbol;
      if (!own || own === this.targetSymbol) return false;
      this.targetSymbol = own;
      return true;
    }
    this.targetResource?.uncoupleBehaviour(this);
    this.targetQuest = null; this.targetResource = null;
    this.cacheTarget();
    if (this.targetResource?.symbol) this.targetSymbol = this.targetResource.symbol;
    if (this.targetResource && !this.targetResource.questResourceBehaviour) this.targetResource.questResourceBehaviour = this;
    return true;
  }

  start() { return this.cacheTarget(); }

  update() {
    if (this.isComponentDestroyed) return;
    this.beat = this.machine?.beat ?? this.beat;
    // A shared-quest resync rebuilds the quest's resources, so each update relinks to the live resource first.
    this.relinkToLiveQuest();
    // A shelved quest hides its people and items but keeps its questor, its enemies, and a named NPC's home copy.
    if (isShelved(this.targetQuest) && !this.enemy) {
      if (!this.individualHome) this.setGameObjectActive(!!this.targetResource?.isQuestor);
      return;
    }
    if (this.targetQuest?.questComplete && !this.enemy) {
      if (!this.individualHome && !this.targetResource?.isQuestor) this.setGameObjectActive(false);
      return;
    }
    if (this.questUID != null && this.machine?.getQuest && !this.machine.getQuest(this.questUID) && !this.enemy) {
      if (!this.individualHome && !this.questorHost) this.setGameObjectActive(false);
      return;
    }
    if (this.targetResource != null) {
      if (!this.targetResource.questResourceBehaviour) this.targetResource.questResourceBehaviour = this;
    }

    if (this.targetResource?.isPerson && this.targetResource.questResourceBehaviour) {
      if (this.targetResource.isHidden || this.targetResource.isDestroyed) {
        this.targetResource.questResourceBehaviour.setGameObjectActive(false);
      }
    }

    if (this.enemy) {
      const foe = this.targetResource;
      if (!foe) return;

      if (foe.isHidden) {
        this.destroyGameObject();
        return;
      }

      this.castSpellQueue(foe, this.enemy);
      this.addItemQueue(foe, this.enemy);

      if (foe.isRestrained && !this.restraintApplied) {
        this.enemy.setNonHostile?.();
        this.restraintApplied = true;
      }

      // The injured check runs before death checks and returns, or injured triggers would never fire.
      if (this.enemy.currentHealth < this.enemy.maxHealth && !foe.injuredTrigger) {
        foe.setInjured();
        return;
      }

      if (this.isFoeDead && this.enemy.currentHealth > 0 && foe.killCount < foe.spawnCount) this.isFoeDead = false;

      if (!this.isFoeDead && foe.deathTrigger) this.enemy.setCurrentHealth(0);

      if (this.enemy.currentHealth <= 0 && !this.isFoeDead) {
        foe.incrementKills();
        this.isFoeDead = true;
      }
    }
  }

  doClick() {
    if (this.isComponentDestroyed) return false;
    let foundInActiveQuest = false;
    if (this.targetResource != null && !isShelved(this.targetQuest) && !this.targetQuest?.questComplete) {
      this.targetResource.setPlayerClicked();
      if (this.targetResource.isItem) this._transferWorldItemToPlayer();
      foundInActiveQuest = true;
    }
    const factionID = this.host?.staticNpcFactionId ?? null;
    if (factionID != null) {
      if (this.machine.isIndividualNPC(factionID)) {
        foundInActiveQuest = this._clickAllIndividualNPCs(factionID);
      }
    }
    return foundInActiveQuest;
  }

  castSpellQueue(foe, enemy) {
    if (!enemy || foe == null || foe.spellQueue == null || this.foeSpellQueuePosition === foe.spellQueue.length) return;
    if (enemy.currentHealth === 0) return;
    if (!enemy.hasEffectManager?.()) return;
    for (let i = this.foeSpellQueuePosition; i < foe.spellQueue.length; i++) {
      enemy.assignSpellBundle?.(foe.spellQueue[i]);
    }
    this.foeSpellQueuePosition = foe.spellQueue.length;
  }

  addItemQueue(foe, enemy) {
    if (!enemy || foe == null || foe.itemQueueCount === 0 || this.foeItemQueuePosition === foe.itemQueueCount) return;
    const clonedItems = foe.getClonedItemQueue();
    if (enemy.hasCorpseLootContainer?.()) enemy.addItemsToCorpse?.(clonedItems);
    else enemy.addItemsToEntity?.(clonedItems);
    this.foeItemQueuePosition = foe.itemQueueCount;
  }

  cacheTarget() {
    if (this.targetQuest != null && this.targetResource != null) return true;
    if (this.questUID === 0 || this.targetSymbol == null) return false;
    this.targetQuest = this.machine.getQuest(this.questUID);
    if (this.targetQuest == null) return false;
    this.targetResource = this.targetQuest.getResource(this.targetSymbol);
    if (this.targetResource == null) return false;
    if (this.targetResource.isFoe) this.enemy = this.host?.enemy ?? null;
    return true;
  }

  setGameObjectActive(active) { this.host?.setActive?.(active); }

  destroyGameObject() {
    this.host?.destroy?.();
    this.isComponentDestroyed = true;
    this.notifyDestroyed();
  }

  // The game object stays, so host.destroy() must not run; the host's `questBehaviour` field is cleared instead.
  destroyComponent() {
    if (this.isComponentDestroyed) return;
    this.isComponentDestroyed = true;
    if (this.host?.questBehaviour === this) this.host.questBehaviour = null;
    this.notifyDestroyed();
  }

  onDestroy(handler) { this._destroyHandlers.push(handler); }
  offDestroy(handler) {
    const i = this._destroyHandlers.indexOf(handler);
    if (i >= 0) this._destroyHandlers.splice(i, 1);
  }
  notifyDestroyed() {
    for (const handler of [...this._destroyHandlers]) handler(this);
  }

  getSaveData() {
    return {
      questUID: this.questUID,
      targetSymbol: this.targetSymbol,
      isFoeDead: this.isFoeDead,
      foeSpellQueuePosition: this.foeSpellQueuePosition,
      foeItemQueuePosition: this.foeItemQueuePosition,
      isAttackableByAI: this.isAttackableByAI,
    };
  }

  restoreSaveData(data) {
    this.questUID = data.questUID;
    this.targetSymbol = data.targetSymbol;
    this.isFoeDead = data.isFoeDead;
    this.foeSpellQueuePosition = data.foeSpellQueuePosition;
    this.foeItemQueuePosition = data.foeItemQueuePosition;
    this.isAttackableByAI = data.isAttackableByAI;
    this.cacheTarget();
  }

  _transferWorldItemToPlayer() {
    const item = this.targetResource;
    this.machine.deps.giveItemToPlayer?.(item.daggerfallUnityItem);
    // Hide the item so the player cannot pick it up again while its site link still shows it.
    item.isHidden = true;
  }

  _clickAllIndividualNPCs(factionID) {
    let matched = false;
    for (const quest of this.machine.quests.values()) {
      if (quest.questComplete || quest.questTombstoned || isShelved(quest)) continue;
      for (const resource of quest.resources.values()) {
        if (!resource.isPerson) continue;
        if (resource.isIndividualNPC && resource.factionData?.id === factionID) {
          resource.setPlayerClicked();
          matched = true;
        }
      }
    }
    return matched;
  }
}
