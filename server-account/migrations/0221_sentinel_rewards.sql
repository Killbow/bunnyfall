-- BUNNYFALL (2026-11-20): THE SENTINEL EVENT'S REWARDS (src/net/sentinelLaw.js, server-account/src/sentinel.js).
-- `sentinel_given` is the pieces of arms and armor an account has given the envoy over its life (100 earns the title and the
-- aura); `sentinel_spent` the Garrison Tokens it has spent in the event shop (tokens = given * SENTINEL_TOKENS_PER_PIECE - spent).
ALTER TABLE players ADD COLUMN sentinel_given INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN sentinel_spent INTEGER NOT NULL DEFAULT 0;
