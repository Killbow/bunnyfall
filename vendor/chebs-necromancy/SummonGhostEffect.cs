using ChebsNecromancyMod.MinionSpawners;
using DaggerfallConnect;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.Items;
using DaggerfallWorkshop.Game.MagicAndEffects;
using DaggerfallWorkshop.Game.Utility.ModSupport.ModSettings;
using UnityEngine;

namespace ChebsNecromancyMod
{
    public class SummonGhostEffect : ChebEffect
    {
        public const string EffectKey = "Summon Ghost";
        protected override string effectKey => EffectKey;
        protected override string effectDescription => "Summons a ghost to follow and guard you.";

        public override void SetProperties()
        {
            base.SetProperties();

            // if we wanna make stuff harder, we can add durations to the spell etc. but we all know Cheb hates that
            // stuff.
            properties.SupportChance = true;
            properties.SupportDuration = false;
            properties.SupportMagnitude = true;
        }

        public override void LoadModSettings(ModSettings modSettings)
        {
            base.LoadModSettings(modSettings);

            var chanceCostA = modSettings.GetValue<int>(effectKey, "Chance Cost A");
            var chanceCostB = modSettings.GetValue<int>(effectKey, "Chance Cost B");
            var chanceCostOffset = modSettings.GetValue<int>(effectKey, "Chance Cost Offset");
            var chanceCosts = new EffectCosts
            {
                CostA = chanceCostA,
                CostB = chanceCostB,
                OffsetGold = chanceCostOffset
            };

            var magnitudeCostA = modSettings.GetValue<int>(effectKey, "Magnitude Cost A");
            var magnitudeCostB = modSettings.GetValue<int>(effectKey, "Magnitude Cost B");
            var magnitudeCostOffset = modSettings.GetValue<int>(effectKey, "Magnitude Cost Offset");
            var magnitudeCosts = new EffectCosts
            {
                CostA = magnitudeCostA,
                CostB = magnitudeCostB,
                OffsetGold = magnitudeCostOffset
            };

            properties.ChanceCosts = chanceCosts;
            properties.MagnitudeCosts = magnitudeCosts;
        }

        public override bool ChanceSuccess => base.ChanceSuccess && (!ChebsNecromancy.CorpseItemEnabled || HasReagents());

        protected bool HasReagents()
        {
            if (caster == null)
            {
                ChebsNecromancy.ChebError("HasReagents: caster is null");
                return false;
            }

            var corpseItem = caster.Entity.Items
                .GetItem(CustomCorpseItem.TemplateItemGroup, CustomCorpseItem.CustomTemplateIndex);
            if (corpseItem == null)
            {
                DaggerfallUI.AddHUDText("No corpse item available.");
                return false;
            }

            var ectoplasmItem = caster.Entity.Items
                .GetItem(ItemGroups.CreatureIngredients1, (int)CreatureIngredients1.Ectoplasm);
            if (ectoplasmItem == null)
            {
                DaggerfallUI.AddHUDText("Ectoplasm required.");
                return false;
            }

            return true;
        }

        protected void ConsumeReagents()
        {
            if (caster == null)
            {
                ChebsNecromancy.ChebError("ConsumeReagents: caster is null");
                return;
            }

            var corpseItem = caster.Entity.Items
                .GetItem(CustomCorpseItem.TemplateItemGroup, CustomCorpseItem.CustomTemplateIndex);
            if (corpseItem == null)
            {
                ChebsNecromancy.ChebError("Failed to consume reagents: corpseItem is null");
                return;
            }
            caster.Entity.Items.RemoveOne(corpseItem);

            var ectoplasmItem = caster.Entity.Items
                .GetItem(ItemGroups.CreatureIngredients1, (int)CreatureIngredients1.Ectoplasm);
            if (ectoplasmItem == null)
            {
                ChebsNecromancy.ChebError("Failed to consume reagents: ectoplasm is null");
                return;
            }
            caster.Entity.Items.RemoveOne(ectoplasmItem);
        }

        protected override void DoEffect()
        {
            base.DoEffect();

            Spawn(GetMagnitude(), caster.Entity.Skills.GetLiveSkillValue(DFCareer.Skills.Mysticism),
                caster.Entity.Stats.LiveIntelligence, caster.Entity.Stats.LiveWillpower, true);

            ConsumeReagents();
        }

        public static void Spawn(int magnitude, int mysticismLevel, int intelligence, int willpower, bool showHUDMessage)
        {
            var spawner = new GameObject("MinionSpawner");
            spawner.SetActive(false);
            var minionSpawner = spawner.AddComponent<GhostSpawner>();
            minionSpawner.showHUDMessage = showHUDMessage;
            minionSpawner.magnitude = magnitude;
            minionSpawner.mysticismLevel = mysticismLevel;
            minionSpawner.intelligence = intelligence;
            minionSpawner.willpower = willpower;
            spawner.SetActive(true);
        }
    }
}