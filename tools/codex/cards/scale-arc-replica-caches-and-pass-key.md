---
slug: scale-arc-replica-caches-and-pass-key
title: "Replica Route Caches, Replica Constraint, and the Session Pass Key"
domain: account
kind: subcard
parent: scale-arc-d1-replicas-and-shedding
files:
  - server-account/src/service.js
  - server-account/src/metrics.js
  - server-account/src/sessionPass.js
routes:
  - /v1/auth/token
tables: []
related:
  - scale-arc-d1-replicas-and-shedding
  - account-routes-and-gate-wall
invariants:
  - "`REPLICA_CONSTRAINT` is `'first-primary'`, not `'first-unconstrained'`, because a replica that has not yet seen a newly minted session rejects it with `auth`, and the client treats that rejection as final."
  - "A sign-out, ban, or mute reaches hot-route reads only when the session pass renews, up to `PASS_TTL_S - PASS_RENEW_S` seconds after the pass was minted."
traps:
  - "A route in `REPLICA_ROUTES` must not keep a per-isolate cache, because a replica's answer to one caller would then be served to other callers; routes with such caches (the yards, the layouts, and the seats list) stay on the binding."
  - "Per-isolate caches key on `db[DB_ROOT] ?? db`, because `countedDb` in `server-account/src/metrics.js` and `replicaDb` wrap the binding in a new Proxy per request and return the underlying binding for `DB_ROOT`."
  - "The session pass key outlives a deploy, so any change to the claims a pass carries must also change `PASS_INFO`, which makes every older pass fail verification."
dfu: []
tags:
  - account
  - d1
  - replicas
  - caches
  - session-pass
---

# Replica Route Caches, Replica Constraint, and the Session Pass Key

Routes in `REPLICA_ROUTES` (`server-account/src/service.js`) read through a D1 Sessions API handle that a read replica may serve. Each request gets its own Proxy over the binding, so any cache an isolate shares must key on the binding itself through `DB_ROOT`, and a route that keeps such a cache stays off the replica list.

Session passes (`server-account/src/sessionPass.js`) are HMAC-signed under a key that HKDF derives with `PASS_INFO` as its info string. The key does not change between deploys, so changing `PASS_INFO` retires every old pass without rotating `IDENTITY_PRIVATE_KEY`.
