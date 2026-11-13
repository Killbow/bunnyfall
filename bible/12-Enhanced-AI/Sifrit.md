# Sifrit the Forbidden One

Bunnyfall's own enemy (kind id 3072, `src/systems/sifrit/`). Staff call her with `/spawn sifrit` or pick her as an event boss.

- **Body**: one sprite, no frames (`public/art/bunnyfall-sifrit/sifrit.png`), a Mummy row at level 30, size 170%, a purple outline.
- **Health**: four fighters' worth of the Ketch Warden law, 4 x 600 s x (5 + 30) = 84,000. A peer's puppet has no health bound row, so it is not refused.
- **Blows**: the overworld's telegraphed ones, made hers by `bossifyBlow` (ai/blowShapes.js): Death's Lane (lunge), Soul Lash (cone), Grave Ring. They hit 2.5 times harder than an elite's and show in purple.
- **Summons**: every 9 s (a quarter faster under half health) two mummies stand 4 to 9 m around her, at most 8 alive. Her fall sends them back.
- **Bar**: `ui/sifritBar.js`, the gate's boss bar in a purple theme, shown within 120 m.
- Wiring: `sifritFrame` in `scenes/world.js`; making her at the foe's stand: `makeSifrit` in `exteriorFoes.spawnFoe`.
