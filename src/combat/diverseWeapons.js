import { modSetting, flattenModPreset } from '../mods/modSettings.js';
import { WEAPONS } from '../characters/weapons.js';
import { isEnchanted } from '../items/inventory.js';
import { hasArtifactEffect, hasArtifactSubtype, ARTIFACTS } from '../items/artifactEffects.js';
import { ENCHANTMENT_TYPES } from '../magic/enchantments.js';
import { isLookCopy } from '../net/appearanceLaw.js';

export const moddedWeaponHUDAnimsEnabled = () => modSetting('diverse-weapons', 'Enabled') === true;

// Matches Daggerfall Unity's per-template name tables; an empty name falls back to the classic CIF.
export function moddedWeaponFilename(weapon, enchanted = isEnchanted(weapon)) {
  if (!weapon) return '';
  const W = WEAPONS;
  if (enchanted) {
    if (isArtifact(weapon)) {
      switch (weapon.templateIndex) {
        case W.Dagger: return 'MEHRUNESRAZOR.CIF';
        case W.Staff:
          // As in Daggerfall Unity, the first matching enchantment decides: a Wabbajack effect gives the Wabbajack,
          // and any non-artifact enchantment gives the Staff of Magnus.
          for (const e of (Array.isArray(weapon.enchantments) ? weapon.enchantments : [])) {
            if (e?.type === ENCHANTMENT_TYPES.SpecialArtifactEffect) {
              if (e.param === ARTIFACTS.Wabbajack) return 'WABBAJACK.CIF';
            } else {
              return 'STAFFOFMAGNUS.CIF';
            }
          }
          return '';
        case W.Katana: return 'EBONYBLADE.CIF';
        case W.Claymore: return 'CHRYSAMERE.CIF';
        case W.Mace: return 'MACEOFMOLAGBAL.CIF';
        case W.Warhammer: return 'VOLENDRUNG.CIF';
        case W.Long_Bow: return 'AURIELSBOW.CIF';
        default: return '';
      }
    }
    switch (weapon.templateIndex) {
      case W.Dagger: return 'DAGGERMAGIC.CIF';
      case W.Tanto: return 'TANTOMAGIC.CIF';
      case W.Staff: return 'STAFFMAGIC.CIF';
      case W.Shortsword: return 'SHORTSWORDMAGIC.CIF';
      case W.Wakazashi: return 'WAKAZASHIMAGIC.CIF';
      case W.Broadsword: return 'BROADSWORDMAGIC.CIF';
      case W.Saber: return 'SABERMAGIC.CIF';
      case W.Longsword: return 'LONGSWORDMAGIC.CIF';
      case W.Katana: return 'KATANAMAGIC.CIF';
      case W.Claymore: return 'CLAYMOREMAGIC.CIF';
      case W.Dai_Katana: return 'DAIKATANAMAGIC.CIF';
      case W.Mace: return 'MACEMAGIC.CIF';
      case W.Flail: return 'FLAILMAGIC.CIF';
      case W.Warhammer: return 'WARHAMMERMAGIC.CIF';
      case W.Battle_Axe: return 'BATTLEAXEMAGIC.CIF';
      case W.War_Axe: return 'WARAXEMAGIC.CIF';
      case W.Short_Bow: return 'SHORTBOWMAGIC.CIF';
      case W.Long_Bow: return 'LONGBOWMAGIC.CIF';
      case W.Arrow: return 'ARROWMAGIC.CIF';
      default: return '';
    }
  }
  switch (weapon.templateIndex) {
    case W.Dagger: return 'DAGGER.CIF';
    case W.Tanto: return 'TANTO.CIF';
    case W.Staff: return 'STAFF.CIF';
    case W.Shortsword: return 'SHORTSWORD.CIF';
    case W.Wakazashi: return 'WAKAZASHI.CIF';
    case W.Broadsword: return 'BROADSWORD.CIF';
    case W.Saber: return 'SABER.CIF';
    case W.Longsword: return 'LONGSWORD.CIF';
    case W.Katana: return 'KATANA.CIF';
    case W.Claymore: return 'CLAYMORE.CIF';
    case W.Dai_Katana: return 'DAIKATANA.CIF';
    case W.Mace: return 'MACE.CIF';
    case W.Flail: return 'FLAIL.CIF';
    case W.Warhammer: return 'WARHAMMER.CIF';
    case W.Battle_Axe: return 'BATTLEAXE.CIF';
    case W.War_Axe: return 'WARAXE.CIF';
    case W.Short_Bow: return 'SHORTBOW.CIF';
    case W.Long_Bow: return 'LONGBOW.CIF';
    case W.Arrow: return 'ARROW.CIF';
    default: return '';
  }
}

const isArtifact = (item) => !isLookCopy(item) && (item?.artifact === true || hasArtifactEffect(item));

export function atlasFileName(item, classic, enabled = moddedWeaponHUDAnimsEnabled(), enchanted = undefined) {
  if (!enabled || !item) return classic;
  return moddedWeaponFilename(item, enchanted) || classic;
}

// A missed w_ ask falls through to the plain name so the double-scale preset keeps the mod's strike frames.
export function customTextureNames(file, record, frame, metalName, doubleScale) {
  const plain = `${file}_${record}-${frame}${metalName ? `_${metalName}` : ''}`;
  return doubleScale ? [`w_${plain}`, plain] : [plain];
}

// Mirrors vendor/diverse-weapons/weapon-widget-preset.json in the store's keys; keep the two in sync.
export const DIVERSE_WEAPONS_WIDGET_PRESET = Object.freeze({
  Modules: { Swings: 'True', Ambidexterity: 'True', Offset: 'True', Bob: 'True', Inertia: 'True', Step: 'True', DoubleScaleTextures: 'True', TrueTextureSize: 'True', Recoil: 'True' },
  Swings: { Speed: '1', Windup: '1', Recovery: '0', VanillaAlignmentOverride: 'True', VanillaRecoveryOverride: 'False', NoDaggerMirroredStrikes: 'True' },
  Offset: { Speed: '1' },
  Bob: { Length: '142', Offset: '0', SizeX: '1', SizeY: '1', SpeedMove: '1', SpeedState: '1', Shape: '0', BobWhileIdle: 'True' },
  Step: { Length: '1', Condition: '0' },
  Inertia: { Scale: '1', Speed: '1', ForwardDepth: '1', ForwardSpeed: '1' },
  TrueTextureSize: { TextureScaleFactor: '1' },
  Recoil: { Condition: '0', Chance: '100', PlayEntityMissEffects: 'True', DetectEnvironment: 'True', PlayEnvironmentMissEffects: 'True', MissEffectPlacement: '0' },
  Miscellaneous: { MirrorBows: 'False' },
});

let _flat = null;
export const diverseWeaponsWidgetPreset = () => (_flat ??= flattenModPreset('weapon-widget', DIVERSE_WEAPONS_WIDGET_PRESET));

export const diverseWeaponsPresetOn = () =>
  moddedWeaponHUDAnimsEnabled() && modSetting('diverse-weapons', 'WeaponWidgetPreset') === true;

export function withDiverseWeaponsPreset(settings, on = diverseWeaponsPresetOn()) {
  if (!on) return settings;
  return { ...settings, ...diverseWeaponsWidgetPreset() };
}
