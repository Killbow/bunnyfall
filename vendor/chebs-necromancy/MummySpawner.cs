using DaggerfallWorkshop;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.Entity;
using UnityEngine;

namespace ChebsNecromancyMod.MinionSpawners
{
    public class MummySpawner : MinionSpawner
    {
        private void Awake()
        {
            foeType = MobileTypes.Mummy;
        }

        protected override void ScaleMinion(GameObject minion)
        {
            DaggerfallEntityBehaviour daggerfallEntityBehaviour;
            if (!minion.TryGetComponent(out daggerfallEntityBehaviour))
            {
                ChebsNecromancy.ChebError("Failed to scale minion - can't get DaggerfallEntityBehaviour");
                return;
            }

            mysticismLevel = mysticismLevel > 0 ? mysticismLevel : 1;
            magnitude = magnitude > 0 ? magnitude : 1;
            willpower = willpower > 0 ? willpower : 1;
            intelligence = intelligence > 0 ? intelligence : 1;

            // Vanilla Mummy has 17-66 HP: https://en.uesp.net/wiki/Daggerfall:Mummy
            var minionEntity = daggerfallEntityBehaviour.Entity;
            var scaledHealth =
                    mysticismLevel / 9  // +11 HP at 100 Mysticism
                    + magnitude / 3     // +33 HP at 100 magnitude
                    + intelligence / 7  // +14 HP at 100 int
                    + willpower / 7     // +14 HP at 100 wil
                ;
            minionEntity.MaxHealth = scaledHealth;
            minionEntity.CurrentHealth = scaledHealth;
            var factor = magnitude / 400
                         + mysticismLevel / 400
                         + willpower / 400
                         + intelligence / 400;
            minionEntity.Level *= factor;
            // todo: scale damage somehow
            // todo: localize
            if (showHUDMessage)
            {
                var msg = $"{foeType} created!";
                DaggerfallUI.AddHUDText(msg);
            }
        }
    }
}