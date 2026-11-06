using ChebsNecromancyMod.MinionSpawners;
using DaggerfallConnect;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.Items;
using DaggerfallWorkshop.Game.MagicAndEffects;
using DaggerfallWorkshop.Game.Utility.ModSupport.ModSettings;
using UnityEngine;

namespace ChebsNecromancyMod
{
    public class SummonVampireEffect : ChebEffect
    {
        public const string EffectKey = "Summon Vampire";
        protected override string effectKey => EffectKey;
        protected override string effectDescription => "Summons a vampire to follow and guard you.";

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

            var redRoseItem = caster.Entity.Items
                .GetItem(ItemGroups.PlantIngredients1, (int)PlantIngredients1.Red_rose);
            var yellowRoseItem = caster.Entity.Items
                .GetItem(ItemGroups.PlantIngredients1, (int)PlantIngredients1.Yellow_rose);
            if (redRoseItem == null && yellowRoseItem == null)
            {
                DaggerfallUI.AddHUDText("Red/Yellow rose required.");
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

            var redRose = caster.Entity.Items
                .GetItem(ItemGroups.PlantIngredients1, (int)PlantIngredients1.Red_rose);
            var yellowRose = caster.Entity.Items
                .GetItem(ItemGroups.PlantIngredients1, (int)PlantIngredients1.Yellow_rose);
            if (redRose == null && yellowRose == null)
            {
                ChebsNecromancy.ChebError("Failed to consume reagents: black and white rose is null");
                return;
            }

            if (redRose != null)
            {
                ChebsNecromancy.ChebLog("Consuming red rose");
                caster.Entity.Items.RemoveOne(redRose);
            }
            else
            {
                ChebsNecromancy.ChebLog("Consuming yellow rose");
                caster.Entity.Items.RemoveOne(yellowRose);
            }
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
            var minionSpawner = spawner.AddComponent<VampireSpawner>();
            minionSpawner.showHUDMessage = showHUDMessage;
            minionSpawner.magnitude = magnitude;
            minionSpawner.mysticismLevel = mysticismLevel;
            minionSpawner.intelligence = intelligence;
            minionSpawner.willpower = willpower;
            spawner.SetActive(true);
        }
    }
}