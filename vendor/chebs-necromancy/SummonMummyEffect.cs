using ChebsNecromancyMod.MinionSpawners;
using DaggerfallConnect;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.Items;
using DaggerfallWorkshop.Game.MagicAndEffects;
using DaggerfallWorkshop.Game.Utility.ModSupport.ModSettings;
using UnityEngine;

namespace ChebsNecromancyMod
{
    public class SummonMummyEffect : ChebEffect
    {
        public const string EffectKey = "Summon Mummy";
        protected override string effectKey => EffectKey;
        protected override string effectDescription => "Summons a mummy to follow and guard you.";

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
                ChebsNecromancy.ChebError("SummonMummyEffect.HasReagents: caster is null");
                return false;
            }

            var corpseItem = caster.Entity.Items
                .GetItem(CustomCorpseItem.TemplateItemGroup, CustomCorpseItem.CustomTemplateIndex);
            if (corpseItem == null)
            {
                DaggerfallUI.AddHUDText("No corpse item available.");
                return false;
            }

            var bandage = caster.Entity.Items
                .GetItem(ItemGroups.UselessItems2, (int)UselessItems2.Bandage);
            var oil = caster.Entity.Items
                .GetItem(ItemGroups.UselessItems2, (int)UselessItems2.Oil);
            if (oil == null && bandage == null)
            {
                DaggerfallUI.AddHUDText("Bandages or oil required.");
                return false;
            }

            return true;
        }

        protected void ConsumeReagents()
        {
            if (caster == null)
            {
                ChebsNecromancy.ChebError("SummonMummyEffect.ConsumeReagents: caster is null");
                return;
            }

            var foundCorpseItem =
                caster.Entity.Items.GetItem(CustomCorpseItem.TemplateItemGroup, CustomCorpseItem.CustomTemplateIndex);
            if (foundCorpseItem == null)
            {
                ChebsNecromancy.ChebError("Failed to consume reagents: foundCorpseItem is null");
                return;
            }

            // consume oil before bandages (oil seems more useless)
            var bandage = caster.Entity.Items
                .GetItem(ItemGroups.UselessItems2, (int)UselessItems2.Bandage);
            var oil = caster.Entity.Items
                .GetItem(ItemGroups.UselessItems2, (int)UselessItems2.Oil);
            if (oil == null && bandage == null)
            {
                ChebsNecromancy.ChebError("Failed to consume reagents: oil and bandages is null");
                return;
            }

            if (oil != null)
            {
                ChebsNecromancy.ChebLog("Consuming oil");
                caster.Entity.Items.RemoveOne(oil);
            }
            else
            {
                ChebsNecromancy.ChebLog("Consuming bandage");
                caster.Entity.Items.RemoveItem(bandage);
            }

            caster.Entity.Items.RemoveOne(foundCorpseItem);
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
            var minionSpawner = spawner.AddComponent<MummySpawner>();
            minionSpawner.showHUDMessage = showHUDMessage;
            minionSpawner.magnitude = magnitude;
            minionSpawner.mysticismLevel = mysticismLevel;
            minionSpawner.intelligence = intelligence;
            minionSpawner.willpower = willpower;
            spawner.SetActive(true);
        }
    }
}