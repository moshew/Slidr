# ADR-100 — A deck that impresses at first sight

Status: Implemented in the 2026-10-16 working tree; **not committed** at the time of this record. It raises the bar of the design guidelines tuned in [ADR-042](ADR-042-agent-design-quality.md), next to the rule on cards of [ADR-099](ADR-099-cards-as-tall-as-what-they-hold.md).

## Request

The user asked that the prompt that builds decks demand high visual quality: impressive, stunning. They attached the prompts they test the agent with: eight slides on the future of AI in a futuristic style (dark backgrounds, neon, realistic AI images, large type, geometric shapes, glass layers, infographics, a different layout on every slide in one visual identity); a ten-slide board deck on a technology company's performance (KPIs, tables, charts, risks and recommendations, clean corporate design in Hebrew, right to left); and eight slides on design trends that combine minimalism, glassmorphism, brutalism and 3D, with masks, overlapping layers, gradients, asymmetric shapes and creative type, each slide showing another capability.

## Context

- The guidelines said how a slide is laid out (grid, coverage, type sizes, contrast) and closed with a checklist asking for a publication-ready slide. Nothing said that the goal is a deck that impresses. A deck could meet every rule and every lint finding and still be a flat background with a title and boxes.
- Depth was one line: cards with a radius and a soft shadow, subtle gradients, shapes at low opacity. The techniques the test prompts name (glass, glow, masks, blend modes, perspective) were not mentioned, though the conversion keeps them on their elements (`BOX_PASSTHROUGH` in `packages/html-import/src/convert.ts`).
- A style the user names was not addressed: the agent could take "glassmorphism" as a colour scheme.

## Decision

- **The bar** (`packages/prompts/src/design.ts`), a section at the head of the guidelines, so it frames everything after it:
  - A deck should impress at first sight, art-directed and memorable, at the level of a launch keynote or a leading studio. Clean and correct is the floor; a flat background, a title and a few boxes is a wireframe even when every check passes.
  - A visual concept for the deck before the first slide, taken from its subject: a mood, a palette with one confident accent, a signature motif that returns on every slide.
  - One bold move per slide as its focal point.
  - A style the user names is carried through in full, with its signature techniques; asked for several, each slide shows its own. A business deck impresses by precision: big KPI figures, the series that matters highlighted, tables with rhythm.
  - Ambition never costs legibility: decoration stays off text and faces, contrast still passes, the hierarchy still reads in one second.
- **Depth, in layers.** The line on depth now names the three layers (a background with life in it, a middle layer, the content) and the CSS that builds them: layered gradients, `backdrop-filter`, glows, `mix-blend-mode`, `clip-path`, `mask-image`, `transform` for angle and perspective on shapes and pictures (not on text, which should stay editable), outlined or oversized type, inline SVG. Used for the concept, not as a sampler. Cards keep one radius and one soft shadow.
- **The checklist** asks first whether the slide would impress at first sight.
- **The deck session** (`packages/prompts/src/scope.ts`) plans the deck's visual concept before the slides, and the look at the contact sheet asks whether every slide stands up to the best of them, and lifts the weakest.
- The prompt grew by about 1,800 characters in every scope (the deck prompt from 44,373 to 46,275), and its limits by 1,900 (`systemPrompt.test.ts`).

## Considered and rejected

- **A list of styles with a recipe for each.** It would grow the prompt with every trend and date quickly. The agent knows what glassmorphism or brutalism look like; what it lacked was the instruction to carry a named style through, and the CSS the app keeps.
- **Superlatives alone** ("make it stunning"). An adjective without the concept, the focal move and the layers it takes gives the agent nothing to act on, and nothing to check its render against.
- **A lint rule for visual ambition.** Nothing measurable separates an impressive slide from a tidy one; the agent's look at its own render, held against the checklist, is the check.

## Verification

- The prompt tests (`packages/prompts`, 108): the bar, the wireframe sentence, the new checklist question and the deck session's visual concept are asserted, the checklist still has its seven questions, and every scope stays within its new budget.
- Not yet run: the agent against the user's three test prompts. The change is to what the agent is told; its effect shows only in the decks it builds, which should be rendered and reviewed in Hebrew and English at full size and thumbnail.
