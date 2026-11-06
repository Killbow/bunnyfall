/*
 * This code is mostly copied from the fantastic Roleplay Realism Items Mod by Hazelnut & Ralzar.
 *
 * https://github.com/ajrb/dfunity-mods/blob/master/RoleplayRealismItems/Scripts/RoleplayRealismItemsMod.cs#L759
 *
 * I've adapted it to only care about Necromancy stuff. But it will also only activate if you choose necromancer.
 */

using System.Collections;
using DaggerfallConnect;
using DaggerfallConnect.Save;
using DaggerfallWorkshop;
using DaggerfallWorkshop.Game;
using DaggerfallWorkshop.Game.Entity;
using DaggerfallWorkshop.Game.Items;
using DaggerfallWorkshop.Game.MagicAndEffects;
using DaggerfallWorkshop.Game.Player;
using DaggerfallWorkshop.Game.Utility;
using UnityEngine;

namespace ChebsNecromancyMod.RoleplayRealismItemsMod
{
    public class StartingEquipmentStuff
    {
        static void AddOrEquipWornItem(DaggerfallEntity entity, DaggerfallUnityItem item, bool equip = false)
        {
            entity.Items.AddItem(item);
            if (item.ItemGroup == ItemGroups.Armor || item.ItemGroup == ItemGroups.Weapons ||
                item.ItemGroup == ItemGroups.MensClothing || item.ItemGroup == ItemGroups.WomensClothing)
            {
                item.currentCondition = (int)(Random.Range(0.3f, 0.75f) * item.maxCondition);
            }
            if (equip)
                entity.ItemEquipTable.EquipItem(item, true, false);
        }

        public static void AssignSkillEquipment(PlayerEntity playerEntity, CharacterDocument characterDocument)
        {
            ChebsNecromancy.ChebLog("Starting Equipment: Assigning Based on Skills");

            // Set condition of ebony dagger if player has one from char creation questions
            IList daggers = playerEntity.Items.SearchItems(ItemGroups.Weapons, (int)Weapons.Dagger);
            foreach (DaggerfallUnityItem dagger in daggers)
                if (dagger.NativeMaterialValue > (int)WeaponMaterialTypes.Steel)
                    dagger.currentCondition = (int)(dagger.maxCondition * 0.2);

            // Skill based items
            AssignSkillItems(playerEntity, playerEntity.Career.PrimarySkill1);
            AssignSkillItems(playerEntity, playerEntity.Career.PrimarySkill2);
            AssignSkillItems(playerEntity, playerEntity.Career.PrimarySkill3);

            AssignSkillItems(playerEntity, playerEntity.Career.MajorSkill1);
            AssignSkillItems(playerEntity, playerEntity.Career.MajorSkill2);
            AssignSkillItems(playerEntity, playerEntity.Career.MajorSkill3);

            // Starting clothes are gender-specific, randomise shirt dye and pants variant
            DaggerfallUnityItem shortShirt = null;
            DaggerfallUnityItem casualPants = null;
            if (playerEntity.Gender == Genders.Female)
            {
                shortShirt = ItemBuilder.CreateWomensClothing(WomensClothing.Short_shirt_closed, playerEntity.Race, 0, ItemBuilder.RandomClothingDye());
                casualPants = ItemBuilder.CreateWomensClothing(WomensClothing.Casual_pants, playerEntity.Race);
            }
            else
            {
                shortShirt = ItemBuilder.CreateMensClothing(MensClothing.Short_shirt, playerEntity.Race, 0, ItemBuilder.RandomClothingDye());
                casualPants = ItemBuilder.CreateMensClothing(MensClothing.Casual_pants, playerEntity.Race);
            }
            ItemBuilder.RandomizeClothingVariant(casualPants);
            AddOrEquipWornItem(playerEntity, shortShirt, true);
            AddOrEquipWornItem(playerEntity, casualPants, true);

            // Add spellbook, all players start with one - also a little gold and a crappy iron dagger for those with no weapon skills.
            playerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.MiscItems, (int)MiscItems.Spellbook));
            playerEntity.GoldPieces += Random.Range(5, playerEntity.Career.Luck);
            playerEntity.Items.AddItem(ItemBuilder.CreateWeapon(Weapons.Dagger, WeaponMaterialTypes.Iron));

            // Add some torches and candles if player torch is from items setting enabled
            if (DaggerfallUnity.Settings.PlayerTorchFromItems)
            {
                for (int i = 0; i < 6; i++)
                    playerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.UselessItems2, (int)UselessItems2.Torch));
                for (int i = 0; i < 4; i++)
                    playerEntity.Items.AddItem(ItemBuilder.CreateItem(ItemGroups.UselessItems2, (int)UselessItems2.Candle));
            }

            ChebsNecromancy.ChebLog("Starting Equipment: Assigning Finished");
        }

        static void AssignSkillItems(PlayerEntity playerEntity, DFCareer.Skills skill)
        {
            ItemCollection items = playerEntity.Items;
            Genders gender = playerEntity.Gender;
            Races race = playerEntity.Race;

            bool upgrade = Dice100.SuccessRoll(playerEntity.Career.Luck / (playerEntity.Career.Luck < 56 ? 2 : 1));
            WeaponMaterialTypes weaponMaterial = WeaponMaterialTypes.Iron;
            if ((upgrade && !playerEntity.Career.IsMaterialForbidden(DFCareer.MaterialFlags.Steel)) || playerEntity.Career.IsMaterialForbidden(DFCareer.MaterialFlags.Iron))
            {
                weaponMaterial = WeaponMaterialTypes.Steel;
            }
            ArmorMaterialTypes armorMaterial = ArmorMaterialTypes.Leather;
            if ((upgrade && !playerEntity.Career.IsArmorForbidden(DFCareer.ArmorFlags.Chain)) || playerEntity.Career.IsArmorForbidden(DFCareer.ArmorFlags.Leather))
            {
                armorMaterial = ArmorMaterialTypes.Chain;
            }

            switch (skill)
            {
                case DFCareer.Skills.Archery:
                    AddOrEquipWornItem(playerEntity, ItemBuilder.CreateWeapon(Weapons.Short_Bow, weaponMaterial));
                    DaggerfallUnityItem arrowPile = ItemBuilder.CreateWeapon(Weapons.Arrow, WeaponMaterialTypes.Iron);
                    arrowPile.stackCount = 30;
                    items.AddItem(arrowPile);
                    return;
                // case DFCareer.Skills.Axe:
                //     AddOrEquipWornItem(playerEntity, CreateWeapon(RandomAxe(), weaponMaterial)); return;
                case DFCareer.Skills.Backstabbing:
                    AddOrEquipWornItem(playerEntity, ItemBuilder.CreateArmor(gender, race, Armor.Right_Pauldron, armorMaterial)); return;
                // case DFCareer.Skills.BluntWeapon:
                //     AddOrEquipWornItem(playerEntity, CreateWeapon(RandomBlunt(), weaponMaterial)); return;
                case DFCareer.Skills.Climbing:
                    AddOrEquipWornItem(playerEntity, ItemBuilder.CreateArmor(gender, race, Armor.Helm, armorMaterial, -1)); return;
                case DFCareer.Skills.CriticalStrike:
                    AddOrEquipWornItem(playerEntity, ItemBuilder.CreateArmor(gender, race, Armor.Greaves, armorMaterial)); return;
                case DFCareer.Skills.Dodging:
                    AddOrEquipWornItem(playerEntity, (gender == Genders.Male) ? ItemBuilder.CreateMensClothing(MensClothing.Casual_cloak, race) : ItemBuilder.CreateWomensClothing(WomensClothing.Casual_cloak, race)); return;
                case DFCareer.Skills.Etiquette:
                    AddOrEquipWornItem(playerEntity, (gender == Genders.Male) ? ItemBuilder.CreateMensClothing(MensClothing.Formal_tunic, race) : ItemBuilder.CreateWomensClothing(WomensClothing.Evening_gown, race)); return;
                case DFCareer.Skills.HandToHand:
                    AddOrEquipWornItem(playerEntity, ItemBuilder.CreateArmor(gender, race, Armor.Gauntlets, armorMaterial)); return;
                case DFCareer.Skills.Jumping:
                    AddOrEquipWornItem(playerEntity, ItemBuilder.CreateArmor(gender, race, Armor.Boots, armorMaterial)); return;
                case DFCareer.Skills.Lockpicking:
                    items.AddItem(ItemBuilder.CreateRandomPotion()); return;
                case DFCareer.Skills.LongBlade:
                    AddOrEquipWornItem(playerEntity, ItemBuilder.CreateWeapon(Dice100.SuccessRoll(50) ? Weapons.Saber : Weapons.Broadsword, weaponMaterial)); return;
                case DFCareer.Skills.Medical:
                    DaggerfallUnityItem bandages = ItemBuilder.CreateItem(ItemGroups.UselessItems2, (int)UselessItems2.Bandage);
                    bandages.stackCount = 4;
                    items.AddItem(bandages);
                    return;
                case DFCareer.Skills.Mercantile:
                    playerEntity.GoldPieces += Random.Range(playerEntity.Career.Luck, playerEntity.Career.Luck * 4); return;
                case DFCareer.Skills.Pickpocket:
                    items.AddItem(ItemBuilder.CreateRandomGem()); return;
                case DFCareer.Skills.Running:
                    AddOrEquipWornItem(playerEntity, (gender == Genders.Male) ? ItemBuilder.CreateMensClothing(MensClothing.Shoes, race) : ItemBuilder.CreateWomensClothing(WomensClothing.Shoes, race)); return;
                case DFCareer.Skills.ShortBlade:
                    AddOrEquipWornItem(playerEntity, ItemBuilder.CreateWeapon(Dice100.SuccessRoll(50) ? Weapons.Shortsword : Weapons.Tanto, weaponMaterial)); return;
                case DFCareer.Skills.Stealth:
                    AddOrEquipWornItem(playerEntity, (gender == Genders.Male) ? ItemBuilder.CreateMensClothing(MensClothing.Khajiit_suit, race) : ItemBuilder.CreateWomensClothing(WomensClothing.Khajiit_suit, race)); return;
                case DFCareer.Skills.Streetwise:
                    AddOrEquipWornItem(playerEntity, ItemBuilder.CreateArmor(gender, race, Armor.Cuirass, armorMaterial)); return;
                case DFCareer.Skills.Swimming:
                    items.AddItem((gender == Genders.Male) ? ItemBuilder.CreateMensClothing(MensClothing.Loincloth, race) : ItemBuilder.CreateWomensClothing(WomensClothing.Loincloth, race)); return;

                case DFCareer.Skills.Daedric:
                case DFCareer.Skills.Dragonish:
                case DFCareer.Skills.Giantish:
                case DFCareer.Skills.Harpy:
                case DFCareer.Skills.Impish:
                case DFCareer.Skills.Orcish:
                    items.AddItem(ItemBuilder.CreateRandomBook());
                    for (int i = 0; i < 4; i++)
                        items.AddItem(ItemBuilder.CreateRandomIngredient(ItemGroups.CreatureIngredients1));
                    return;
                case DFCareer.Skills.Centaurian:
                case DFCareer.Skills.Nymph:
                case DFCareer.Skills.Spriggan:
                    items.AddItem(ItemBuilder.CreateRandomBook());
                    for (int i = 0; i < 4; i++)
                        items.AddItem(ItemBuilder.CreateRandomIngredient(ItemGroups.PlantIngredients1));
                    return;
            }
        }

        public static EffectBundleSettings GetClassicSpell(int spellId)
        {
            SpellRecord.SpellRecordData spellData;
            GameManager.Instance.EntityEffectBroker.GetClassicSpellRecord(spellId, out spellData);
            EffectBundleSettings bundle;
            GameManager.Instance.EntityEffectBroker.ClassicSpellRecordDataToEffectBundleSettings(spellData, BundleTypes.Spell, out bundle);
            return bundle;
        }
    }
}