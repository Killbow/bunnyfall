---
slug: verification-tooling-mutation-cites-ledger
title: "Verification Tooling: Mutants, Card Checks, Ledger Sweep"
domain: overview
kind: subcard
parent: home-port-doctrine-overview
files:
  - tools/mutate.mjs
  - tools/codex/cli.mjs
  - tools/ledgerSweep.mjs
replacesBible:
  - "Home.md"
related:
  - home-port-doctrine-overview
  - host-split-overview
invariants:
  - "Committed JSON mutation lists require every mutant record to match one source site, and any unexpected survivor fails the run."
  - "A mutant marked equivalent must include a why explanation and must survive test execution; if it dies, the record is flagged as stale."
  - "Reference cards bind to repository file paths, routes, and SQLite tables validated by npm run codex:check rather than brittle line-number citations."
traps:
  - "Using line-number citations into large scene host files causes merge conflicts whenever lines shift."
  - "A mutant pattern that fails to apply is reported immediately as a failure and is never skipped silently."
tags:
  - mutation-testing
  - codex
  - ledger
  - ci
---

# Verification Tooling: Mutants, Card Checks, Ledger Sweep

Three command-line tools verify test coverage depth, reference card drift, and feature translation tracking across the repository.

## Mutation Testing (`tools/mutate.mjs`)

`node tools/mutate.mjs [--jobs N] <list.json>` evaluates committed JSON mutation specifications against the test suite. Every mutant entry must match a single site in its target file. Standard mutants must be killed by the tests, whereas entries marked `equivalent` must include a `why` rationale and survive. The runner exits with code `1` if a mutant unexpectedly survives, an equivalent mutant dies, or an entry fails to apply; code `2` if source restoration fails; and code `130` when interrupted.

## Card Validation and Feature Ledger Sweep

- **Reference card validation (`tools/codex/cli.mjs`):** `npm run codex:check` validates every card in `tools/codex/cards/*.md` against live repository files and account routes (`ROUTES`), replacing the retired `file:"quoted line"` citation-anchor scripts so routine edits never cause citation merge conflicts.
- **Ledger sweep (`tools/ledgerSweep.mjs`):** Cross-references open feature ledger rows against shipped arc headings and greps non-comment `src/` files for canonical Daggerfall Unity member names (such as `MakeHouseContainer`) to detect items completed without a matching heading. Renaming a translated member hides it from this scan.
