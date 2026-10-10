# ADR-084 — Expand graphics and add a sketch style

Status: Implemented in the 2026-10-09 working tree.

The Elements graphics collection now offers four visual styles. The three existing styles retain every previous catalogue ID and gain 150 drawings each: glossy has 599, illustrated has 533, and outlined has 1,178. Sketch is a new fourth style with 986 freehand drawings. The collection contains 3,296 graphics in total.

The sketch direction takes inspiration from the hand-drawn, tactile visual language described in [Canva's 2026 design trends](https://www.canva.com/design-trends/); no Canva artwork is used. The vector drawings come from the Microsoft, Google and Streamline sets named in the catalogue's generated notices. The generator copies only chosen drawings into the app, stores their attribution beside each copied set, and mixes subjects so the first rows show variety. All graphics remain self-contained SVG elements when placed on a slide and work offline.

The generator keeps the original 250 supplemental drawings per existing style, adds more of those same sets, and fills the remainder from licensed sets with a compatible visual language. It removes brand logos from the sketch set and duplicate spoken names within that set. The new collection uses a short “Sketch” tab label so all five choices, including “All”, fit the narrow English panel.

Verification: all 1,436 newly offered SVGs rendered in Chromium with nonempty, appropriately sized bounds. The first rows, gallery tiles, inserted slide and filmstrip were visually reviewed in English and Hebrew. The graphics unit tests, desktop typecheck, targeted Elements end-to-end test and production Vite build passed. The build's third-party notices include the new sources.
