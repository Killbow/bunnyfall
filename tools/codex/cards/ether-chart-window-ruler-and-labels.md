---
slug: ether-chart-window-ruler-and-labels
title: "Eltheric Ocean Chart Window, Depth Ruler, and Label Placement"
domain: ui
kind: subcard
parent: eltheric-ocean-overview
files:
  - src/ui/etherChartWindow.js
  - tools/etherChartProbe.mjs
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Ether-Chart2.md"
related:
  - eltheric-ocean-overview
  - eltheric-ocean-isles-places-and-depth-bake
  - eltheric-ocean-legends-vaults-and-sea-events
  - harbour-board-ports-exchange-and-charts
invariants:
  - "Listeners attach and detach in pairs, `draw` guards once unmounted, and window height clamps to `min(92vh, 900px)` via `ETHER_CHART_CSS`."
  - "Each ruler segment selects the longest `RULER_WORDS` entry whose `width + 12` fits the segment, or omits text."
  - "Label placement prevents overlapping names and keeps a lone haunt label inside its own square or omits it."
traps:
  - "Band names, Veil labels, and scale bars do not render over chart waters; `paintScale` draws inside the key per zoom."
  - "Without a canvas, text widths fall back to `length * LABEL_CHAR_PX` with box height `LABEL_H`."
dfu: []
tags:
  - naval
  - chart
  - ui
  - ruler
  - labels
---

# Eltheric Ocean Chart Window, Depth Ruler, and Label Placement

`src/ui/etherChartWindow.js` renders the Eltheric Ocean chart window, depth ruler, scale key, and non-overlapping map labels, exporting `paintChart`, `paintRuler`, `paintScale`, `paintMark`, and `paintKey`. `tools/etherChartProbe.mjs` runs the Chromium verification probe for letter width, layout fit, font equality, and repaint timing.

## Layout and Redraw Lifecycle

`ETHER_CHART_CSS` clamps the window height to `min(92vh, 900px)`. A `ResizeObserver` watches the chart container, measuring the key before the chart stage, while event listeners attach and detach in pairs and `draw` returns early once unmounted. The window also listens for `loadingdone` on `document.fonts` and triggers a redraw so pre-font opens match fresh renders.

## Depth Ruler and Label Collision Solver

The ruler canvas sits at height `RULER_H` above the map stage. `paintRuler` labels each visible water band from west to east, centering the longest `RULER_WORDS` entry whose `width + 12` fits the segment and stroking the Abyss void world edge with `EDGE_LINE`.

Label placement precomputes isle mark boxes once per pass:
- The haunt plate selects the clear corner covering the fewest marks.
- Ship pointer words evaluate candidate spots before lesser names, choosing the first clear spot or fewest collisions.
- Isle fallback labels respect canvas bounds, and the single-line isle note truncates with an ellipsis.
