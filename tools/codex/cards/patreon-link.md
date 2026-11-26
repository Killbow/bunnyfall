---
slug: patreon-link
title: "Patreon Link, Confirm Step, and Webhooks"
domain: account
kind: subcard
parent: accounts-and-cloud-saves-overview
files:
  - server-account/src/patreon.js
  - server-account/migrations/0045_patreon.sql
routes:
  - /v1/patreon/callback
  - /v1/patreon/confirm
  - /v1/patreon/unlink
  - /v1/patreon/webhook
tables:
  - players
related:
  - accounts-and-cloud-saves-overview
invariants:
  - "The authorize state is a bearer that names an account, so a link is written only at the confirm step after the patron sees which game account it joins."
  - "The confirm step asks Patreon again and writes what Patreon says then, instead of trusting the ticket."
  - "State and ticket use separate HKDF-derived AES-GCM keys, so neither opens as the other."
  - "`patreon_user` is unique, so linking a Patreon account that is already linked moves it from the other game account."
traps:
  - "Webhooks for members nobody linked are still acknowledged, because Patreon retries refused deliveries."
dfu: []
tags:
  - patreon
  - account
  - link
  - webhook
---

# Patreon Link, Confirm Step, and Webhooks

`server-account/src/patreon.js` links one Patreon account to one game account and stores `patreon_user`, `patreon_tiers`, and `patreon_status` on `players` (migration 0045).

- **Authorize:** The account read carries the authorize URL with a sealed state for the asking account, valid for `PATREON_STATE_S` (one hour).
- **Callback (`/v1/patreon/callback`):** Patreon returns a code. The state names the game account, and the code names the Patreon account. The callback writes nothing and shows a confirm page with a sealed ticket valid for `PATREON_TICKET_S` (15 minutes).
- **Confirm (`/v1/patreon/confirm`):** The one write of a link. It asks Patreon again with the access token in the ticket, so a pledge cancelled before the press links the account with no tier.
- **Webhook (`/v1/patreon/webhook`):** Patreon member updates are signed with HMAC-MD5, which WebCrypto lacks, so the service computes it. The signature is checked before the body is parsed, and one update keyed on the Patreon user applies it.
