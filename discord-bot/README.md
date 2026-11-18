# Bunnyfall Discord bot

## Set up from the staff website

1. Create a Discord app, enable **Message Content Intent**, and install it in your test Discord server with the **bot** and **applications.commands** scopes. Grant **View Channel**, **Send Messages**, **Embed Links**, **Attach Files**, and **Read Message History**.
2. Run the updated Bunnyfall stack with `docker compose up -d --build`. Docker installs the bot dependencies. For a local Node setup, run `npm ci --prefix discord-bot` before starting `node selfhost/start.mjs`.
3. Open `/staff.html` and sign in as the owner. Under **More → Discord bot**, enter the Discord server ID and bot token, then click **Save and start bot**. Refresh status after a few seconds. The host generates the integration key and stores the configuration in its private data directory. Protect the data directory and its backups.
4. For standard portraits, put a local copy of the ARENA2 folder at `data/arena2` on the game host, then save the setup again to restart the bot. A local Node host can also set `ARENA2_PATH` before starting Bunnyfall.
5. Try `/player` and `/leaderboard`. Use `/tavern setup channel:#tavern` to connect chat. Use `/link` to get a code, enter `/discordlink CODE` while playing, and try `/me` and `/lfg create`.

Use one bot process for the Discord application. For staff-site management, the Bunnyfall host starts the bot and stores its LFG roster in the server data directory. **Remove token and stop bot** stops it and deletes the saved token.

## Run the bot separately with environment files

1. Create a dedicated application in the Discord Developer Portal. In **Bot**, enable **Message Content Intent**. Install it in your test server with the **bot** and **applications.commands** scopes. Grant **View Channel**, **Send Messages**, **Embed Links**, **Attach Files**, and **Read Message History** for the channels it will use.
2. Generate a random integration key with `openssl rand -hex 32`. Set `BUNNYFALL_DISCORD_KEY` to that value in the game server’s environment. In Docker Compose, set it in the repository-root `.env` and recreate the server container with `docker compose up -d --build`. On a local stack, pass it in the environment when starting `node selfhost/start.mjs`. Startup applies the database migration.
3. Copy `discord-bot/.env.example` to `discord-bot/.env`. Fill in the Discord bot token, test server ID, Bunnyfall account service URL, and the same integration key. Use HTTPS when connecting to the game server over the network. For standard portraits, set `ARENA2_PATH` to your own local Daggerfall ARENA2 folder.
4. Run `cd discord-bot`, then `npm ci` and `npm start` with Node 22.13 or newer. Run one bot process and keep its `data/` directory across restarts. It holds the LFG rosters.
5. Try `/player` for an offline character, including one wearing an approved custom skin. Try `/leaderboard` for Level, Renown, and the Elite Breach choices.
6. Run `/tavern setup channel:#tavern` with Manage Server permission. Choose a Discord channel whose messages can be shared with signed-in Bunnyfall players. Type a line on each side and check that it arrives once on the other. The game checks for messages every five seconds. Use `/tavern disable` to pause both directions.
7. In Discord, run `/link`. Enter the private code using `/discordlink CODE` in chat while playing the character you want to link. Check `/me`, then create an `/lfg` listing and try its buttons from a second Discord account. Use `/unlink` to remove the connection.

Standard paperdolls use saved body and face details. Custom paperdolls use the approved front art currently worn by the account. Tavern forwards plain text and suppresses Discord notifications. Tavern messages are available for up to 24 hours on the bridge.
