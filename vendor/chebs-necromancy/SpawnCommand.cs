using System.Collections.Generic;
using DaggerfallWorkshop;
using UnityEngine;

namespace ChebsNecromancyMod
{
    public static class SpawnCommand
    {
        private static Dictionary<string, MobileTypes> spawnOptions = new Dictionary<string, MobileTypes>()
        {
            { "ancientlich", MobileTypes.AncientLich },
            { "ancientvampire", MobileTypes.VampireAncient },
            { "ghost", MobileTypes.Ghost },
            { "lich", MobileTypes.Lich },
            { "mummy", MobileTypes.Mummy },
            { "skeleton", MobileTypes.SkeletalWarrior },
            { "vampire", MobileTypes.Vampire },
            { "zombie", MobileTypes.Zombie }
        };

        public static readonly string name = "spawn";
        public static readonly string description = "Spawn an ally from the provided type (case insensitive).";
        public static readonly string usage = "spawn <type> eg. spawn skeleton\nPossible types: AncientLich, AncientVampire, Ghost, Lich, Mummy, Skeleton, Vampire, Zombie";

        public static string Execute(params string[] args)
        {
            if (args.Length < 1)
            {
                return "Provide at least one argument eg. Skeleton";
            }

            var spawnOption = args[0].ToLower();

            var spawner = new GameObject("SkeletonSpawner");
            spawner.SetActive(false);
            var minionSpawner = spawner.AddComponent<MinionSpawner>();
            minionSpawner.foeType = spawnOptions[spawnOption];
            spawner.SetActive(true);
            return "";
        }
    }
}


