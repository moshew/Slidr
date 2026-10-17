# ADR-099 — A card is as tall as what it holds

Status: Implemented in the 2026-10-16 working tree; **not committed** at the time of this record. It adds a rule to the design lint of [ADR-018](ADR-018-design-lint.md), next to the empty band that [ADR-042](ADR-042-agent-design-quality.md) asked for, and reads cards as [ADR-073](ADR-073-cards.md) builds them.

## Request

The user showed two slides of a sample deck the agent made ("Bitcoin in the portfolio", `slides/ביטקוין בתיק ההשקעות.slidr`): the risks, three cards, and the way in, four. Under the instruction to fill the slide, the cards ran down to the bottom margin with a heading and a sentence at the top of each, and their lower part empty. They called it an empty, unfinished design, and asked that it be dealt with, and that such slides be avoided.

## Context

- The agent wrote the height into its HTML before any check ran: `height:720px` on the risk cards and `height:620px` on the steps. The design guidelines asked the content to cover 70% of the content area and to end near y 900 to 1000, and the stretched cards did both.
- The guidelines already said "fill by composing, not by stretching". Nothing measured it. The coverage rule (L07) counts a card by its box, so a stretched card passes it. The empty band (L17) is for the user's check alone, and it does not see an empty box: the box itself reaches the bottom.
- The same pattern was in every deck the agent had made in `slides/`: cards, steps, timelines, comparisons and closings with cards 20% to 46% empty.

## Decision

- **L18, a card taller than what it holds** (`packages/lint/src/rules/hollowCard.ts`). A warning, in the agent's set, and one of the findings a turn may not end with (`DEMANDED` in `qualityGate.ts`), as coverage is: the agent got its coverage by stretching, so the finding that stops that has to hold as firmly as the one that caused it.
- **What a card is.** The conversion makes a card a group whose bottom element is its box (ADR-073), so that is what is judged: a drawn rectangle at the bottom of a group, at least 90% of the group (a badge may stand out over the edge), clear of the slide's edges by 24px (a colour field that bleeds is not a card), upright, not a picture, and neither a bar nor a background panel (`isMeaningfulShape`). What it holds is the rest of the group and the box's own text, text by its glyphs.
- **What is measured.** The room above the content and below it, less a padding at each end: the smaller of the two, at most 96px. Content centred in a card twice its height leaves it as empty as content at its top. The room between the parts of the content does not count: a label at the top of a tile and a headline at its foot is a composition (Ariach's tiles, Defus's quote panel).
- **The line.** A card is reported when that room is at least 120px and at least a fifth of its height. Each finding gives the height the content needs with its padding, so the agent knows what to set, and says what to fill the freed room with: larger type, a picture or a key figure in each card, a second row, a visual beside the cards, or the row centred under the title; and that a point of a line or two may need no box.
- **Not judged.** The copies of the layout's objects (ADR-094), named `<slide>_<object>`: the template sized them for any text, and the user asked for the text slide's panel to keep its height when the text is short. Rectangles not grouped with what lies on them, which are the parts of a drawing: the bars of a waterfall, the columns of a schedule, the sheets of a paper-size chart.
- **The guidelines** (`packages/prompts/src/design.ts`). The bullet on filling by composing now says never to give cards a fixed height that reaches for the bottom margin, how tall a card of an icon, a heading and two lines stands (about 350px, half the slide left), what to fill the rest with, and that the content itself, not an empty box, should reach near y 900. The tool notes name the new finding and the turn it holds (`tools.ts`). The prompt grew by 211 characters in every scope, and its limits by 250 (`systemPrompt.test.ts`).
- **L07's message** adds that a card stretched taller than what it holds does not fill the slide.
- **The design check** names the rule in Hebrew and English (`lint/messages.ts`) and in the fourteen other languages of the interface.

## Considered and rejected

- **Counting the gaps inside a card.** The first measure took every height with no content in it. It reported the bento tiles of Ariach, the quote panel of Defus and a dozen other template slides whose label and headline stand apart on purpose.
- **Judging every rectangle with something inside it.** Seven Elements designs were reported: the bars of a waterfall chart, a quadrant chart, nested paper sizes, the week columns of a schedule, an app window. None of them is grouped as a card.
- **Counting a card by its content in L07.** It would take away the reason to stretch, but also the padding of every card that is right, and leave the agent no finding that names the card.
- **A threshold of 30%.** The risk cards of the user's own example were 28% empty by the final measure.

## Verification

- Unit tests: `hollowCard.test.ts` (stretched cards and the height they need, both limits, a composition with a label and a headline, centred content, loose rectangles, what is not a card, the layout's copies), and the lint, quality gate, prompt and translation tests. The translation test fails on `templates:name.atlas` and `templates:tagline.atlas` in every language, which another session's Atlas template adds; nothing of the lint's.
- Rendered measurements, in the browser: the four decks in `slides/`, the sample decks of all the built-in templates in Hebrew and English, the 343 Elements designs in their first two languages, and every card set. The rule reports eight slides, all of them in the agent's decks and each one cards with an empty lower part, among them the two the user showed. It reports nothing in the templates, the designs or the card sets. An older deck (`השקעה בביטקווין.slidr`) has the same slides, but its cards came from a conversion that did not group them yet, and they are not judged.
- The write path: the agent's own HTML of the two slides, through `slide_create_from_html` with the real conversion and lint, now returns L18 on the first write. The same risks written with cards as tall as their content and a takeaway band under them returns no finding at all: no L07, L17 or L18.
- The browser test `the two decks of test material have these errors` fails on L01 and L02 errors of the renderer's reference shapes, which this change does not touch; L18 is a warning and that test counts errors.
