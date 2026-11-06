using ChebsNecromancyMod;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.MagicAndEffects;


namespace ChebsNecromancy.Scripts.Spells
{
    public class NoviceRecall
    {
        public static EffectBundleSettings Create()
        {
            // Create a basic recall spell so that they can recall their stuck minions
            var effectBroker = GameManager.Instance.EntityEffectBroker;
            if (!effectBroker.HasEffectTemplate(RecallMinionsEffect.EffectKey))
            {
                ChebsNecromancyMod.ChebsNecromancy.ChebError("NoviceRecall.Create: Failed to get template from effect broker");
                return new EffectBundleSettings();
            }

            var template = effectBroker.GetEffectTemplate(RecallMinionsEffect.EffectKey);
            var templateSettings = new EffectSettings()
            {
                ChanceBase = 25,
                ChancePerLevel = 5,
                ChancePlus = 1,
            };
            var effectEntry = new EffectEntry()
            {
                Key = template.Properties.Key,
                Settings = templateSettings,
            };
            var noviceRecall = new EffectBundleSettings()
            {
                Version = 1,
                BundleType = BundleTypes.Spell,
                TargetType = TargetTypes.CasterOnly,
                ElementType = ElementTypes.Magic,
                Name = "Novice Recall",
                IconIndex = 12,
                Effects = new EffectEntry[] { effectEntry },
            };
            // add it to stores so it can be purchased
            var offer = new EntityEffectBroker.CustomSpellBundleOffer()
            {
                Key = "NoviceRecall-CustomOffer",
                Usage = EntityEffectBroker.CustomSpellBundleOfferUsage.SpellsForSale,
                BundleSetttings = noviceRecall,
            };
            effectBroker.RegisterCustomSpellBundleOffer(offer);

            return offer.BundleSetttings;
        }
    }
}