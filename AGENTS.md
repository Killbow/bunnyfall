# `codex` and Repository Rules

- Query `codex` (`codex_module`, `codex_routes`, `codex_schema`, `codex_card`, `codex_invariants`, `codex_diff`, `codex_dfu`, or `npm run codex -- <cmd>`) before grepping large host or router files (`src/scenes/world.js`, `src/scenes/worldModes.js`, `src/scenes/dungeonContext.js`, `src/net/wire.js`, `server-account/src/service.js`).
- Keep large new subsystems in focused modules rather than expanding `bootWorld`, `createWorldModes`, `buildDungeonContext`, `bootExterior`, or `Room`, and verify `node tools/worldBudgetCheck.mjs` and `node tools/routesCheck.mjs`.
- Keep code comments minimal: use bare JSDoc type tags and write 1 to 2 present-tense lines only for non-obvious traps (`<= 8` consecutive comment lines per `node tools/plainText.mjs`).
- Write commit messages, UI strings (`t(key, fallback)`), documentation, and `tools/codex/cards/*.md` entries in plain modern American English with the Oxford comma, `LF` line endings, no em-dashes, and no exclamation marks.
- Run `codex_diff` (`npm run codex -- diff main HEAD`) before finishing a branch; update affected cards when invariants, routes, schemas, or file paths change, add a `<= 250`-word card for new subsystems, and run `npm run codex:check`.
