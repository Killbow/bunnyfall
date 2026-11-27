// A click on a live quest's Person ticks the machine at once, because the talk window pauses the world.
// When that tick opens a window in the building slot, the NPC's own window waits until the slot is empty.

export function clickHeardByQuest(machine) {
  for (const quest of machine?.quests?.values?.() ?? []) {
    if (quest?.questComplete) continue;
    for (const r of quest?.resources?.values?.() ?? []) if (r?.isPerson && r.hasPlayerClicked) return true;
  }
  return false;
}

export function createQuestClickFirst({ tick, top, heard }) {
  let waiting = null;
  return {
    hold(open) {
      if (!heard?.()) return false;
      const before = top?.() ?? null;
      try { tick?.(); } catch (e) { console.error('[quest] the click\'s tick failed:', e?.message ?? e); return false; }
      const after = top?.() ?? null;
      if (!after || after === before) return false;
      waiting = open;
      return true;
    },
    settled(w) {
      if (w || !waiting) return;
      const open = waiting;
      waiting = null;
      open();
    },
    drop() { waiting = null; },
    get waiting() { return !!waiting; },
  };
}
