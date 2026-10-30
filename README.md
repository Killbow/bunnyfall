# Bunnyfall

**Bunnyfall** is Daggerfall online with friends, in the browser. It runs on its own private server at
**https://dagg.campfirerp.com/play/**.

Each player needs their own copy of The Elder Scrolls II: Daggerfall (free from Steam, GOG or the
DaggerfallGameFiles.zip). The game files stay on the player's device and are never uploaded.

## Running the server

Everything about hosting (Linux with Docker, plus a local test on Windows) is in
[`selfhost/README.md`](selfhost/README.md). Short version:

```sh
docker compose up -d --build
```

## Development

Node 20.19+ or 22.12+.

- `npm run dev`: the game with hot reload. Start `node selfhost/start.mjs` beside it for the servers.
- `npm run build`: production build into `dist/`
- `npm run lint`: eslint

Game data (ARENA2) is never committed. Point tests at it with `ARENA2_PATH`.

[`docs/GUIDE.md`](docs/GUIDE.md) is the short guide to the code. The `bible/` folder holds the original project's design docs, kept as reference.

## Credits

Bunnyfall is a fork of [DFO Online](https://github.com/Lattymoy/daggerfall-js-source) by Lattymoy and contributors
(MIT), which grew out of [Daggerfall Unity](https://github.com/Interkarma/daggerfall-unity) by Interkarma and
contributors (MIT). Both notices are in [`LICENSE`](LICENSE). Mods and art bundled in `vendor/` keep their own
authors and terms, listed in the game's credits.

Bunnyfall is an unofficial fan project, not affiliated with or endorsed by Bethesda Softworks or ZeniMax Media.
The Elder Scrolls and Daggerfall are trademarks of ZeniMax Media Inc.
