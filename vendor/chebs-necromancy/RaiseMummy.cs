using ChebsNecromancyMod;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.MagicAndEffects;


namespace ChebsNecromancy.Scripts.Spells
{
    public class RaiseMummy
    {
        public static EffectBundleSettings Create()
        {
            var effectKey = SummonMummyEffect.EffectKey;

            // In DFU a spell is called an effect bundle - basically a bundle of spell effects (makes sense). Here we
            // create a beginner spell for people so they have some minions to start off with if they wish.
            var effectBroker = GameManager.Instance.EntityEffectBroker;
            if (!effectBroker.HasEffectTemplate(effectKey))
            {
                ChebsNecromancyMod.ChebsNecromancy.ChebError("RaiseMummy.Create: Failed to get template from effect broker");
                return new EffectBundleSettings();
            }

            var template = effectBroker.GetEffectTemplate(effectKey);
            var templateSettings = new EffectSettings()
            {
                ChanceBase = 25,
                ChancePerLevel = 5,
                ChancePlus = 1,
                MagnitudeBaseMin = 1,
                MagnitudeBaseMax = 1,
                MagnitudePerLevel = 1,
                MagnitudePlusMax = 1,
                MagnitudePlusMin = 1
            };
            var effectEntry = new EffectEntry()
            {
                Key = template.Properties.Key,
                Settings = templateSettings,
            };
            var animateDead = new EffectBundleSettings()
            {
                Version = 1,
                BundleType = BundleTypes.Spell,
                TargetType = TargetTypes.CasterOnly,
                ElementType = ElementTypes.Magic,
                Name = "Raise Mummy",
                IconIndex = 12,
                Effects = new EffectEntry[] { effectEntry },
            };
            // add it to stores so it can be purchased
            var offer = new EntityEffectBroker.CustomSpellBundleOffer()
            {
                Key = "RaiseMummy-CustomOffer",
                Usage = EntityEffectBroker.CustomSpellBundleOfferUsage.SpellsForSale,
                BundleSetttings = animateDead,
            };
            effectBroker.RegisterCustomSpellBundleOffer(offer);

            return offer.BundleSetttings;
        }
    }
}