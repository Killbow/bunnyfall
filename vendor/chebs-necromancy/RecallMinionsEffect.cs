using DaggerfallConnect;
using DaggerfallWorkshop.Game.MagicAndEffects;
using DaggerfallWorkshop.Game.Utility.ModSupport.ModSettings;
using UnityEngine;

namespace ChebsNecromancyMod
{
    public class RecallMinionsEffect : ChebEffect
    {
        public const string EffectKey = "Recall Minions";
        protected override string effectKey => EffectKey;
        protected override string effectDescription => "Recall all minions to your location.";

        public override void SetProperties()
        {
            base.SetProperties();

            properties.SupportChance = true;
            // what purpose could duration/magnitude have on recall?
            // maybe magnitude could increase the amount of minions teleported
            properties.SupportDuration = false;
            properties.SupportMagnitude = false;
        }

        public override void LoadModSettings(ModSettings modSettings)
        {
            base.LoadModSettings(modSettings);

            var chanceCostA = modSettings.GetValue<int>(EffectKey, "Chance Cost A");
            var chanceCostB = modSettings.GetValue<int>(EffectKey, "Chance Cost B");
            var chanceCostOffset = modSettings.GetValue<int>(EffectKey, "Chance Cost Offset");
            var chanceCosts = new EffectCosts
            {
                CostA = chanceCostA,
                CostB = chanceCostB,
                OffsetGold = chanceCostOffset
            };

            properties.ChanceCosts = chanceCosts;
        }

        protected override void DoEffect()
        {
            base.DoEffect();

            RecallMinions();
        }

        public static void RecallMinions(float maxDistance = 3f)
        {
            if (Camera.main == null)
            {
                ChebsNecromancy.ChebError("RecallMinionsEffect.RecallMinions: Camera.main is null.");
                return;
            }

            var cameraTransform = Camera.main.transform;
            var center = cameraTransform.position + cameraTransform.forward * 2;

            var activeMinions = UndeadMinion.GetActiveMinions();
            activeMinions.ForEach(minion =>
            {

                var randomPos = Random.insideUnitSphere.normalized * maxDistance + center;
                randomPos.y = center.y;
                minion.transform.position = randomPos;
            });
        }
    }
}