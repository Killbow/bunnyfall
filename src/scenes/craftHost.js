// BUNNYFALL CRAFTING REWORK: the crafting window's pack-side acts, wired by the host (scenes/world.js) into the
// professions provider (ui/professions/profPages.js setProfessionsPages). Kept out of the host so it does not grow
// (bible/01-Overview/Host-Split.md): the material upgrade and the salvage, both needing the pack and the purse.
import { upgradeRecipeOf, upgradeRefusal, metalUpgradeCost, upgradeGold } from '../net/upgradeLaw.js';
import { upgradeMaterialItem } from '../systems/smithItems.js';
import { salvagesToMaterials, anySalvageRefusal, salvageForMaterials, yieldsText } from '../ui/salvageMaterials.js';
import { shardsText } from '../systems/reforge.js';
import { accountRefusalText } from '../net/accountClient.js';

/**
 * @param {{ player: () => any, forge: () => ({ fee: number }|null), book: () => any, saved: () => void,
 *   nameOf: (item: any) => string, worn: (item: any) => boolean, gold: () => number, pay: (n: number) => void }} deps
 */
export function createCraftHost(deps) {
  const pack = () => deps.player()?.items ?? [];
  return {
    /** The pack's pieces a material upgrade takes: found metal pieces, not worn, below Daedric. */
    upgradable() {
      return pack().filter((it) => it && !deps.worn(it) && !upgradeRefusal(it)).map((it) => {
        const next = upgradeRecipeOf(it);
        return { item: it, name: deps.nameOf(it), next, cost: metalUpgradeCost(next), gold: upgradeGold(next) };
      });
    },
    /** A material upgrade: the gold and the fee checked, the service asked, the piece re-metalled on its answer. */
    async upgrade(offer) {
      const f = deps.forge();
      if (!f) return { ok: false, text: 'You are not at an anvil.' };
      const due = (f.fee > 0 ? f.fee : 0) + offer.gold;
      if (deps.gold() < due) return { ok: false, text: `The smith asks ${due} gold for that.` };
      const it = offer.item;
      if (!pack().includes(it) || deps.worn(it) || upgradeRecipeOf(it)?.id !== offer.next.id) return { ok: false, text: 'That piece has changed. Look again.' };
      const name = deps.nameOf(it);
      const r = await deps.book().upgrade(offer.next.id, `${it.templateIndex}:${it.material}:${pack().indexOf(it)}`);
      if (!r?.ok) return { ok: false, text: accountRefusalText(r?.error) };
      deps.pay(Math.min(due, deps.gold()));
      const took = pack().includes(it) && upgradeMaterialItem(it, offer.next);
      deps.saved();
      if (!took) return { ok: false, text: 'The upgrade was paid for, but the piece left your pack before it could be reworked.' };
      return { ok: true, text: `${name} is now ${deps.nameOf(it)} (+${r.data?.xp ?? 0} Smithing experience), for ${due} gold.` };
    },
    /** The pack's pieces that salvage now, into materials or shards. */
    salvageable() {
      return pack().filter((it) => it && !anySalvageRefusal(it)).map((it) => ({ item: it, name: deps.nameOf(it), materials: salvagesToMaterials(it) }));
    },
    /** A salvage of the chosen pieces. */
    async salvage(items) {
      const r = await salvageForMaterials(items, { items: pack() });
      if (!r.ok) return { ok: false, text: r.error === 'offline' ? 'Salvage into materials needs the server.' : accountRefusalText(r.error) };
      deps.saved();
      const got = [r.data ? yieldsText(r.data) : '', r.shards > 0 ? shardsText(r.shards) : ''].filter(Boolean).join(' and ');
      return { ok: true, text: `Salvaged ${r.count} ${r.count === 1 ? 'piece' : 'pieces'}${got ? ` for ${got}` : ''}.` };
    },
  };
}
