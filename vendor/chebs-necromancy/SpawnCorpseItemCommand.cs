using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.Items;

namespace ChebsNecromancyMod
{
    public static class SpawnCorpseItemCommand
    {
        public static readonly string name = "sci";
        public static readonly string description = "Spawn some corpse items & other ingredients and add them to your inventory.";
        public static readonly string usage = "sci <amount=1> eg. sci for 1 corpse, sci 5 for 5 corpses";

        public static string Execute(params string[] args)
        {
            var amount = 1;
            if (args.Length > 1)
            {
                if (!int.TryParse(args[0], out amount)) return "Invalid argument.";
            }

            for (var i=0; i<amount; i++)
                GameManager.Instance.PlayerEntity.Items.AddItem(CustomCorpseItem.Create());

            GameManager.Instance.PlayerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.PlantIngredients1, (int)PlantIngredients1.Yellow_rose));
            GameManager.Instance.PlayerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.PlantIngredients1, (int)PlantIngredients1.Red_rose));
            GameManager.Instance.PlayerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.PlantIngredients2, (int)PlantIngredients2.White_rose));
            GameManager.Instance.PlayerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.PlantIngredients2, (int)PlantIngredients2.Black_rose));
            GameManager.Instance.PlayerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.UselessItems2, (int)UselessItems2.Bandage));
            GameManager.Instance.PlayerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.UselessItems2, (int)UselessItems2.Oil));
            GameManager.Instance.PlayerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.CreatureIngredients1, (int)CreatureIngredients1.Lich_dust));
            GameManager.Instance.PlayerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.CreatureIngredients1, (int)CreatureIngredients1.Ectoplasm));

            return "";
        }
    }
}


