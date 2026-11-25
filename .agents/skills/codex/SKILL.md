---
name: codex
description: Query Bunnyfall's live module AST graph, HTTP/WebSocket/save routes, SQLite D1 schema, Daggerfall Unity C# scripts, and 798 reference cards, and validate or write updated cards. Activate before grepping large host files, adding routes or SQL migrations, checking classic Daggerfall rules, or finishing a branch.
---

# Using and Updating `codex`

`codex` indexes the live checkout automatically and serves `798` concise reference cards under `tools/codex/cards/`. Every capability works through the `codex` MCP server (`.mcp.json`) and `npm run codex -- <command>`.

## 1. Querying Before Editing

1. **Modules, exports, and callers (`codex_module` / `npm run codex -- module <path>`):**
   - Inspect exports, imports, inbound callers, and line or binding counts before reading large host files (`src/scenes/world.js`, `src/scenes/worldModes.js`, `src/scenes/dungeonContext.js`, `src/scenes/exterior.js`).
2. **HTTP routes, WebSocket frames, and save hooks (`codex_routes` / `npm run codex -- routes [filter]`):**
   - Check `/v1/*` endpoints, auth modes, room frames, and save hooks with exact `file:line` locations.
3. **SQLite D1 schema and room keys (`codex_schema` / `npm run codex -- schema [filter]`):**
   - Inspect tables, columns, primary keys, indexes, triggers, originating SQL migrations, and room storage keys.
4. **Reference cards and invariants (`codex_card` & `codex_invariants` / `npm run codex -- cards <query>`):**
   - Search or read `<= 250`-word cards covering subsystem rules and parity traps.
   - If an older code comment cites `bible/<path>`, run `codex_card` with `biblePath` (or `npm run codex -- bible <path>`) to open the replacement cards.
5. **Daggerfall Unity C# reference (`codex_dfu` / `npm run codex -- dfu-search <query>`):**
   - Run `npm run codex -- dfu-fetch` once to populate `.cache/dfu-scripts/`, then search or read classic C# formulas (`WeaponManager.cs`, `FormulaHelper.cs`, `DaggerfallMissile.cs`).

## 2. Checking Branch Impact and Updating Cards

1. **Check branch impact before finishing:**
   - Run `codex_diff` (`baseRef: "main"`) or `npm run codex -- diff main HEAD`.
   - Read every card listed in `impactedCards` and confirm none of its `invariants` or `traps` were broken.
2. **When to update or add a card:**
   - **Update an existing card** when your change alters a rule, limit, route contract, table column, or file path listed in that card.
   - **Add a new card** in `tools/codex/cards/<slug>.md` when `uncoveredFiles` introduces a new gameplay subsystem, route group, WebSocket frame group, or SQLite table.
   - Skip card edits for bug fixes, performance work, or UI polish that keep existing rules unchanged.
3. **Writing a validated card:**
   - Call `codex_card` with `action: "write"`, `slug`, and `content`, or run `npm run codex -- card <slug> --write <draft.md>`.
   - Every card must use a lowercase `kebab-case` slug, valid YAML frontmatter (`slug`, `title`, `domain`, `kind`, `files`, `routes`, `tables`, `invariants`, `traps`, `tags`), `LF` line endings, `<= 250` body words, and plain American English with the Oxford comma, no em-dashes, and no exclamation marks.
   - Every path in `files`, `/v1/*` path in `routes`, and table name in `tables` must exist in the checkout.
   - Run `npm run codex:check` before committing to verify all cards and account routes pass.
