using DaggerfallWorkshop;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.Entity;
using UnityEngine;

namespace ChebsNecromancyMod.MinionSpawners
{
    public class LichSpawner : MinionSpawner
    {
        private void Awake()
        {
            foeType = MobileTypes.Lich;
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

            // Vanilla Lich has 30-170 HP: https://en.uesp.net/wiki/Daggerfall:Lich
            var minionEntity = daggerfallEntityBehaviour.Entity;
            var scaledHealth =
                mysticismLevel / 3  // +30 HP at 100 Mysticism
                + magnitude         // +100 HP at 100 magnitude
                + intelligence / 10 // +10 HP at 100 int
                + willpower / 10    // +10 HP at 100 wil
                ;
            minionEntity.MaxHealth = scaledHealth;
            minionEntity.CurrentHealth = scaledHealth;
            var factor = mysticismLevel / 300
                         + willpower / 300
                         + intelligence / 300;
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