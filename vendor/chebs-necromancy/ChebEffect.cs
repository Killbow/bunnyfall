using DaggerfallConnect;
using DaggerfallConnect.Arena2;
using DaggerfallWorkshop;
using DaggerfallWorkshop.Game.MagicAndEffects;
using DaggerfallWorkshop.Game.Utility.ModSupport.ModSettings;

namespace ChebsNecromancyMod
{
    public class ChebEffect : BaseEntityEffect
    {
        public static DFCareer.Skills Skill = DFCareer.Skills.Mysticism;
        protected virtual string effectKey => "Recall Minions";
        protected virtual string effectDescription => "Recall all minions to your location.";

        public override void SetProperties()
        {
            properties.Key = effectKey;
            properties.ShowSpellIcon = false;
            properties.AllowedTargets = TargetTypes.CasterOnly;
            properties.AllowedElements = EntityEffectBroker.ElementFlags_MagicOnly;
            properties.AllowedCraftingStations = MagicCraftingStations.SpellMaker;

            // Casting DFCareer.Skills to DFCareer.MagicSkills should work, as the values are the same, but if people
            // decide to use skills that are not part of MagicSkills it may result in unintended consequences.
            properties.MagicSkill = (DFCareer.MagicSkills)Skill;

            properties.DisableReflectiveEnumeration = true;

            ChebsNecromancy.ChebLog($"Using {Skill} for {effectKey}");
        }

        public virtual void LoadModSettings(ModSettings modSettings)
        {
            Skill = ChebsNecromancy.SkillsMap[modSettings.GetInt("Necromancy Effects", "Skill")];

            // Throw a warning if people have chosen a skill that is NOT part of MagicSkills because this could result
            // in unintended consequences.
            var checkSkill = (int)Skill;
            if (checkSkill != (int)DFCareer.MagicSkills.Destruction
                && checkSkill != (int)DFCareer.MagicSkills.Restoration
                && checkSkill != (int)DFCareer.MagicSkills.Illusion
                && checkSkill != (int)DFCareer.MagicSkills.Alteration
                && checkSkill != (int)DFCareer.MagicSkills.Thaumaturgy
                && checkSkill != (int)DFCareer.MagicSkills.Mysticism)
            {
                ChebsNecromancy.ChebWarning(
                    "You chose a skill for necromancy effects that is not part of the DFCareer.MagicSkills " +
                    "enumeration and therefore may result in unintended consequences. It's recommended that you " +
                    "choose a valid magic skill to avoid bugs, errors, etc.");
            }
        }


        #region Text

        public override string GroupName => effectKey;
        public override TextFile.Token[] SpellMakerDescription => GetSpellMakerDescription();
        public override TextFile.Token[] SpellBookDescription => GetSpellBookDescription();

        private TextFile.Token[] GetSpellMakerDescription()
        {
            return DaggerfallUnity.Instance.TextProvider.CreateTokens(
                TextFile.Formatting.JustifyCenter,
                GroupName,
                effectDescription,
                "Duration: Instantaneous.",
                "Chance: % Chance summoning will succeed.",
                "Magnitude: N/A");
        }

        private TextFile.Token[] GetSpellBookDescription()
        {
            return DaggerfallUnity.Instance.TextProvider.CreateTokens(
                TextFile.Formatting.JustifyCenter,
                GroupName,
                "Duration: Instantaneous.",
                "Chance: %bch + %ach per %clc level(s)",
                "Magnitude: N/A",
                effectDescription);
        }

        #endregion

        public override void MagicRound()
        {
            base.MagicRound();

            var entityBehaviour = GetPeeredEntityBehaviour(manager);
            if (!entityBehaviour)
                return;

            DoEffect();
        }

        protected virtual void DoEffect()
        {
            // implement in subclass
        }
    }
}