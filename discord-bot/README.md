# Bunnyfall Discord bot

## Set up from the staff website

1. Create a Discord app, enable **Message Content Intent**, and install it in your test Discord server with the **bot** and **applications.commands** scopes. Grant **View Channel**, **Send Messages**, **Embed Links**, **Attach Files**, **Read Message History**, and **Add Reactions**.
2. Run the updated Bunnyfall stack with `docker compose up -d --build`. Docker installs the bot dependencies. For a local Node setup, run `npm ci --prefix discord-bot` before starting `node selfhost/start.mjs`.
3. Open `/staff.html` and sign in as the owner. Under **More → Discord bot**, enter the Discord server ID and bot token, then click **Save and start bot**. Refresh status after a few seconds. The host generates the integration key and stores the configuration in its private data directory. Protect the data directory and its backups.
4. For standard portraits, put a local copy of the ARENA2 folder at `data/arena2` on the game host, then save the setup again to restart the bot. A local Node host can also set `ARENA2_PATH` before starting Bunnyfall.
5. Try `/player` and `/leaderboard`. Use `/tavern setup channel:#tavern` to connect chat. Use `/link` to get a code, enter `/discordlink CODE` while playing, and try `/me` and `/lfg create`.

Use one bot process for the Discord application. For staff-site management, the Bunnyfall host starts the bot and stores its LFG roster in the server data directory. **Remove token and stop bot** stops it and deletes the saved token.

## Run the bot separately with environment files

1. Create a dedicated application in the Discord Developer Portal. In **Bot**, enable **Message Content Intent**. Install it in your test server with the **bot** and **applications.commands** scopes. Grant **View Channel**, **Send Messages**, **Embed Links**, **Attach Files**, **Read Message History**, and **Add Reactions** for the channels it will use.
2. Generate a random integration key with `openssl rand -hex 32`. Set `BUNNYFALL_DISCORD_KEY` to that value in the game server’s environment. In Docker Compose, set it in the repository-root `.env` and recreate the server container with `docker compose up -d --build`. On a local stack, pass it in the environment when starting `node selfhost/start.mjs`. Startup applies the database migration.
3. Copy `discord-bot/.env.example` to `discord-bot/.env`. Fill in the Discord bot token, test server ID, Bunnyfall account service URL, and the same integration key. Use HTTPS when connecting to the game server over the network. For standard portraits, set `ARENA2_PATH` to your own local Daggerfall ARENA2 folder.
4. Run `cd discord-bot`, then `npm ci` and `npm start` with Node 22.13 or newer. Run one bot process and keep its `data/` directory across restarts. It holds the LFG rosters.
5. Try `/player` for an offline character, including one wearing an approved custom skin. Try `/leaderboard` for Level, Renown, and the Elite Breach choices.
6. Run `/tavern setup channel:#tavern` with Manage Server permission. Choose a Discord channel whose messages can be shared with signed-in Bunnyfall players. Type a line on each side and check that it arrives once on the other. The game checks for messages every five seconds. Use `/tavern disable` to pause both directions.
7. In Discord, run `/link`. Enter the private code using `/discordlink CODE` in chat while playing the character you want to link. Check `/me`, then create an `/lfg` listing and try its buttons from a second Discord account. Use `/unlink` to remove the connection.

Standard paperdolls use saved body and face details. Custom paperdolls use the approved front art currently worn by the account. Tavern forwards plain text and suppresses Discord notifications. Tavern messages are available for up to 24 hours on the bridge.

## Tavern patrons and tips

When players enter a tavern or start a shift, some patrons take the display names of people who spoke in the connected Discord channel in the past hour. A correctly served drink for one of these patrons posts an embed in that channel. Anyone can react with 🪙 to award the serving character 5 house-funded gold, once per Discord account per post, within 24 hours. Tips are paid on the next tavern service action or through **Collect Discord tips** at the innkeeper.

## Bug reports and suggestions

Run `/bugreport setup channel:#bug-reports` with **Manage Server** permission. The selected text channel gets **Report a Bug** and **Suggest a Feature** buttons. Each button opens a public thread and posts five questions tailored to the ticket type. Run setup again to move the panel.

The bot saves an opening snapshot as soon as it posts the questions. The reporter or a moderator with **Manage Threads** can click **Close Ticket** and confirm. The bot saves the complete transcript and Discord-hosted image attachments before it deletes the thread. If saving fails, the thread is kept.

- `/issue report` sends a private list of open tickets you can view and saved, closed tickets.
- `/issue export` sends a private ZIP with current transcripts and images for open tickets you can view, plus the saved archive. If it exceeds Discord's upload limit, the files are still available under `issue-exports` next to the bot's SQLite database.
- `/issue clear` requires **Manage Server** as well as access to `/issue`. Confirm to permanently delete the server's saved, closed tickets. Open threads and their opening snapshots are kept.

Report and export require **Manage Threads**. The bot needs **View Channel**, **Send Messages**, **Create Public Threads**, **Send Messages in Threads**, **Read Message History**, and **Manage Threads** in the selected channel. Players need **Send Messages in Threads** to answer. People with access to the channel can see the open threads, and moderators can export closed tickets. Keep the bot's data directory private and persistent across restarts.

For existing Discord forum posts, moderators can still run `/closeissue` inside a post to lock and archive it. Both the moderator and the bot need **Manage Threads** there.

## Server status panel

`/status setup channel:#status` (Manage Server) posts ONE embed and edits that same message every 30 s (`STATUS_INTERVAL_S`
to change, minimum 15). `/status stop` deletes it. The channel and message id are kept in the bot's `data/lfg.sqlite`, so a
restart keeps editing the same message; a deleted message is posted anew; an unreachable server shows as Offline (red).

It shows online/offline, players online with names (first 20, then "+N more"), host CPU and RAM, how long the server has been up
since the bot first saw it, host uptime, the newest `CHANGELOG.md` date and the relay build. Players come from the relay's
read-only `GET /status` (public like `/health`, cached 10 s). The bot finds the relay beside `BUNNYFALL_URL` (`:8788` becomes
`:8787`, anything else gets `/relay`); set `BUNNYFALL_RELAY_URL` to override and `BUNNYFALL_SITE_URL` to link the title.

CPU and RAM are the **host's**: inside Docker Node reads `/proc`, which is not limited to the container's `mem_limit`.
RAM counts available memory, so disk cache is not "used".

To deploy: rebuild the server (`docker compose up -d --build`; it carries the relay's new `/status`) and restart the bot
(**Save and start bot** on the staff page). The bot registers `/status` itself at start; no other step.
