---
slug: sky-ketch-receipts-spoils-and-claims
title: "Sky-Ketch Receipts, Spoils, and Voyage Claims"
domain: multiplayer
kind: subcard
parent: sky-ketch-raid-overview
files:
  - src/net/ketch/ketchReceipt.js
  - src/net/ketch/ketchClaims.js
  - src/systems/ketch/ketchSpoils.js
  - src/systems/ketch/ketchShares.js
  - src/systems/ketch/ketchClient.js
  - src/items/gilded.js
  - server/src/index.js
  - server-account/src/ketch.js
  - server-account/src/lostSpoils.js
  - server-account/src/index.js
routes:
  - /v1/ketch/claim
  - /internal/ketch/rc
tables:
  - ketch_voyages
replacesBible:
  - "11-Multiplayer/Sky-Ketch.md#receipts"
  - "11-Multiplayer/Sky-Ketch.md#spoils"
related:
  - sky-ketch-raid-overview
  - tonal-warden-fight-and-downed-crew
  - world-events-and-signed-receipts
  - economy-ledger-and-item-judge
invariants:
  - "When the Tonal Warden falls, the relay mints one Ed25519-signed `y1` receipt per eligible earner (`x` set to `'dealt'` or `'stood'`), valid for `KT_RECEIPT_TTL_S` (`7 days`) and capped at `KT_RECEIPT_MAX` (`560` chars)."
  - "The relay forwards receipts to the hub over `/internal/ketch/rc`, and the hub pushes each account's latest unspent receipt on active sockets and subsequent hello handshakes until claimed or expired."
  - "`claimKetch` (`server-account/src/ketch.js`) inserts one `ketch_voyages` row per `(voyage, account)` primary key: the first claim returns `share: true`, repeating the same ship returns `'claimed'` (granting `share` only to the matching `cid`), and presenting another ship's receipt for the same voyage returns `'taken'`."
  - "Client spoils use `seededRng(receiptSeed)` and `spoilsLevel` (combining current character and receipt levels), paying `'dealt'` and `'stood'` earners identically."
traps:
  - "`rollKetchSpoils` (`src/systems/ketch/ketchSpoils.js`) executes three reserved `rolls()` draws between `lastPass` and `socketPass`; removing them would shift the RNG stream for sockets and weapon techniques on existing receipts."
  - "If the relay lacks a gate signing key, the client still caches the unsigned receipt in `kt.ketchClaims`, but `/v1/ketch/claim` returns `no-gate-key` and awards nothing."
  - "`lostLeftBy` in `server-account/src/lostSpoils.js` accepts un-gilded items or the event's own `LOST_GILDED` entry (`gate`: `DRAGONFIRE_OATH.id`, `sd`: `HOURLOCK.id`, `eg`: `null`) and rejects foreign Gilded items."
tags:
  - multiplayer
  - sky-ketch
  - receipts
  - ed25519
  - spoils
  - d1
---

When the Warden is defeated, `src/net/ketch/ketchReceipt.js` signs a `y1` receipt per earner containing voyage `d`, boss `b` (`'warden'`), ship digest `o`, account `s`, seed `c`, participation `x` (`'dealt'` or `'stood'`), level `l` (`1–999`), and optional `m`, `i`, and `e` fields (`KT_RECEIPT_TTL_S = 7 days`, `KT_RECEIPT_MAX = 560`). The relay posts receipts to `/internal/ketch/rc`, and clients persist pending claims locally under `'kt.ketchClaims'` (`src/net/ketch/ketchClaims.js`) with a 16-hex `cid` (`KT_CLAIMS_MAX = 8` per account, `KT_CLAIMS_ALL_MAX = 64` total, retrying every `KT_CLAIM_RETRY_MS = 10 min`).

## Account Redemption and Spoils

Redeeming via `/v1/ketch/claim` calls `claimKetch` (`server-account/src/ketch.js`), writing to `ketch_voyages` (primary key `(voyage, account)`, storing `owner`, `earned`, `lv`, `nonce`, `at`, `body`, and `cid`, with spoils budget replenishment in the same D1 batch). Only one ship per voyage can be claimed per account; a duplicate claim from the same ship returns `'claimed'` (honoring `share` only if `cid` matches the winning write), while another ship's receipt returns `'taken'`.

In `src/systems/ketch/ketchSpoils.js`, `rollKetchSpoils` pays `450 * level * (0.8 to 1.2)` gold, one gear piece (25% legendary, 75% rare), and a second `rareOrBetter` piece (`KT_SPOILS_SOURCE = { boss: true, tier: 22, luck: 65 }`), advancing three reserved `rolls()` draws before `socketPass`, `weaponSocketPass`, and `techniquePass`. `GILDED_RECORDS` in `src/items/gilded.js` holds `HOURLOCK`, `DRAGONFIRE_OATH`, and `SUNKEN_SOVEREIGN` (with no Sky-Ketch Gilded drop). In stage `'vault'` (`src/systems/ketch/ketchShares.js`), shares spill from `KT_CHEST_MOUTH` (`1 m` out, `1.2 m` up) into `KT_SPOILS_KEEP` and auto-collect into the player's pack on departure.
