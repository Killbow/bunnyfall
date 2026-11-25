---
slug: release-numbering-ste-notes-and-plain-text
title: "Release Numbering, STE Patch Notes, and Plain-Text Limits"
domain: overview
kind: subcard
parent: home-port-doctrine-overview
files:
  - scripts/updateNumber.mjs
  - scripts/updateLine.mjs
  - scripts/buildTag.mjs
  - scripts/steNotes.mjs
  - scripts/changelogNotes.mjs
  - tools/plainText.mjs
  - tools/plainTextBaseline.json
replacesBible:
  - "Home.md"
related:
  - home-port-doctrine-overview
  - selfhost-runtime-and-updater
  - ui-overlays-and-localization
invariants:
  - "The PATCH component of the update number is derived from first-parent commits on main since scripts/updateLine.mjs last changed and is never bumped manually."
  - "The MAJOR.MINOR update line is edited manually only in scripts/updateLine.mjs."
  - "Player strings allow at most 40 words total and 25 words per sentence, comment blocks allow at most 8 lines, and documentation paragraphs allow at most 150 words."
  - "Running tools/plainText.mjs --lower only lowers counts in tools/plainTextBaseline.json and never raises them."
traps:
  - "A shallow depth-1 CI clone cannot derive first-parent commit counts and returns null from scripts/updateNumber.mjs unless the job passes DFO_UPDATE."
  - "Never hardcode src/buildTag.js; scripts/buildTag.mjs writes it through tagSource with a fixed 12-character short commit SHA."
tags:
  - release
  - versioning
  - ste
  - plain-text
---

# Release Numbering, STE Patch Notes, and Plain-Text Limits

Release scripts and prose linters derive build identifiers automatically from git history and enforce strict length and vocabulary limits across source files and release notes.

## Derived Update Number and Build Tag

`scripts/updateNumber.mjs` computes `MAJOR.MINOR.PATCH` by pairing the manual `MAJOR.MINOR` line in `scripts/updateLine.mjs` with the count of first-parent commits on `main` since `updateLine.mjs` last changed. This game update number is distinct from the desktop installer version (`app-v0.1.<count>`). Because a shallow depth-1 CI checkout cannot walk first-parent history, `updateNumber.mjs` returns `null` there and reads `DFO_UPDATE` from the CI environment instead. `scripts/buildTag.mjs` writes `src/buildTag.js` via `tagSource` using a 12-character short SHA.

## Patch Notes and Plain-Text Ratchet

- **Release note scripts:** `scripts/steNotes.mjs` checks pull request `## Patch notes` sections against Simplified Technical English limits, flagging sentences over 25 words, instructions over 20 words, paragraphs over 6 sentences, semicolons, `-ing` verbs, and contractions. `scripts/changelogNotes.mjs` builds release notes from committed `CHANGELOG.md` entries.
- **Plain-text baseline (`tools/plainText.mjs`):** Audits `src/`, `server-account/src/`, and `server/src/` for comment block length (`<= 8` lines), player strings (`<= 40` words, `<= 25` words per sentence), doc paragraphs (`<= 150` words), and disallowed filler against `tools/plainTextBaseline.json`.
