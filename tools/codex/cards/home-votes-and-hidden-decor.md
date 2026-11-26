---
slug: home-votes-and-hidden-decor
title: "Home Votes and Hidden Decorations"
domain: homes
kind: subcard
parent: homes-camps-guilds-and-territories
files:
  - server-account/src/homeVotes.js
  - src/net/homeVoteLaw.js
  - server-account/migrations/0108_home_votes.sql
routes:
  - /v1/homes/vote
tables:
  - home_votes
related:
  - homes-camps-guilds-and-territories
invariants:
  - "A vote needs an account registered at least `HOME_VOTE_AGE_S` (7 days) ago and never counts on a home the voter is an insider of."
  - "Taking a vote back is not refused for age, rate, owner, or insider."
  - "The vote insert checks the owner and the insider clause in its own statement, so a home sold or a guild joined between the read and the write takes no vote."
traps:
  - "A knight deed house (`deed` not 0) takes no votes."
dfu: []
tags:
  - homes
  - votes
  - decor
---

# Home Votes and Hidden Decorations

Players vote other homes up or down through `/v1/homes/vote` (`server-account/src/homeVotes.js`). Guests cannot vote (`homes-need-account`).

- **One vote per home:** The `home_votes` primary key holds one vote per account per home, and a second vote replaces the first. Votes are limited to `HOME_VOTES_MAX` (`30`) per `HOME_VOTES_WINDOW_S` (one hour).
- **Insiders:** An account is an insider of its own home (any of its characters) and of the hall of a guild it has any character in (`INSIDER`). Insiders cannot vote on that home.
- **Hidden decorations:** A home whose score is at or below `HOME_SHUN_AT` (`-5`) has its decorations hidden from other players (`homeShunned`). Insiders and decorators still see them.
