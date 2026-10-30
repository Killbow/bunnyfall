-- BUNNY-GUILDS (Phase 0c): Bunnyfall's seven guilds (factions 2001-2007, src/net/bunnyGuildLaw.js) join the Roll.
-- A character seeded before them has a row for each of the old twenty-two alone, and a claim credits only the rows a
-- character holds, so each gets the seven at a reputation of 0, no member - what a new seed writes for them.
INSERT OR IGNORE INTO npc_roll (char_id, faction_id, player)
  SELECT h.char_id, f.column1, h.player
  FROM npc_roll_heads h CROSS JOIN (VALUES (2001), (2002), (2003), (2004), (2005), (2006), (2007)) f;
