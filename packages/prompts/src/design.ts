import type { Archetype } from '@slidr/model';

/**
 * What each archetype of the model is (SPEC 9.1). The keys are the values the agent writes in
 * `data-archetype` and reads in the outline; an archetype added to the model does not compile
 * until it is described here.
 */
export const ARCHETYPES: Record<Archetype, string> = {
  hero: 'the opening slide: a display title, a line under it, a strong image or background',
  section: 'a section divider: a few words that open a new part of the deck',
  bigNumber: 'one big number or statistic, with a short line that says what it means',
  quote: 'a quotation and who said it',
  textImage: 'text beside an image, in two columns',
  fullImage: 'a full-bleed image with a short text over it',
  cards: 'a grid of 3, 4 or 6 cards',
  timeline: 'events along a time axis',
  process: 'the steps of a process, in order',
  comparison: 'two or three things side by side',
  chart: 'a chart as the focus of the slide',
  table: 'a table',
  team: 'people: pictures, names, roles',
  closing: 'the closing slide, or a call to action',
  blank: 'a free composition that is none of the others; rarely the right choice',
};

const archetypeList = Object.entries(ARCHETYPES)
  .map(([name, what]) => `- \`${name}\`: ${what}`)
  .join('\n');

/**
 * Module 2 (SPEC 11.6): the design guidelines of SPEC 9.1 in full, and the per-slide checklist
 * of SPEC 9.4. The same text in every session. The numbers are the SPEC's; the reasons were
 * added so the agent can judge the cases the numbers do not settle. WG7-T06 tunes this text
 * against the evaluation set.
 */
export const DESIGN = `## Design guidelines

A slide is read in a few seconds, from a distance, by someone who is also listening to a speaker. The guidelines below follow from that, and they hold for every slide you make or redesign. A title and a list of bullets on an empty background is not an acceptable result: every slide you hand over should look designed and use its surface.

**Canvas and grid**
- The canvas is 1920×1080. Text stays inside the safe margins, 96px at the sides and 80px at the top and bottom, which leaves a content area of 1728×920: projectors and video calls crop edges, and text against an edge looks like a mistake.
- Lay content out on a 12-column grid with 24px gutters. The base spacing unit is 8px and every gap is a multiple of it. Regular spacing is most of what makes a slide look deliberate.
- Backgrounds, images and decorative elements may run past the margins to the edge of the slide (full-bleed), and are better for it. Text may not.

**Using the surface**
- Content fills the content area: the bounding box of all the meaningful elements covers at least 70% of it.
- No dead zone. An empty quarter of the slide with no design intent behind it is a flaw: white space is a decision, not a remainder.
- Fill by composing, not by stretching. A card taller than what it holds, its lower half empty, is a dead zone with a border around it; so is content pushed up under the title with a third of the slide bare below it. Give each block the height its content needs, then use the room that is left: larger type and numbers, a second row, a supporting visual, or the whole block centred in the space under the title. A quick test: under a title at the top, the content should end within about 100px of the bottom margin (near y 900 to 1000), or sit centred in that space on purpose.
- Balance: the visual centre of gravity is near the centre of the slide, unless the layout is asymmetric on purpose and a counterweight balances it.
- Images fill their frames (cover). They do not sit small in the middle of empty space.

**Typography** (pixels on the 1920×1080 canvas)

| style | size | use |
|---|---|---|
| display | 120–160 | opening slide, a big number |
| title | 72–96 | slide title |
| heading | 44–64 | subtitle, card title |
| body | 28–36 | body text |
| caption | 20–24 | notes, sources, labels |

- 24px is the absolute minimum for text that is meant to be read. At most two font families in a deck.
- One idea per slide. Up to about 40 words and 5 bullets; longer text is split over two slides or turned into a visual.
- A clear hierarchy: a size ratio of at least 1.5 between one level and the next, and one focal point per slide.

**A modern visual language**
- Big, bold titles. Big images, preferably full-bleed, with a darkening overlay that keeps the text on them readable.
- Colour discipline, 60/30/10: background, surfaces, accent. One accent colour, used sparingly, so that it still means something where it appears.
- Depth: cards with one consistent radius and a soft shadow, subtle gradients, decorative shapes at low opacity.
- One style of icons and one style of images for the whole deck (the deck's \`image_style\`).
- Variety: no more than two consecutive slides of the same archetype.

**Archetypes.** Every slide is one of these. Choosing one before you build is what keeps a slide from drifting back into a title and bullets.
${archetypeList}

A slide may go without a visual element (an image, a chart, an icon, a meaningful shape, a table) only when it is a \`quote\` or a \`section\`.

**Right-to-left decks**
- In a Hebrew deck the layout is mirrored: text on the right, image on the left; a timeline or a process runs from right to left.
- Align to \`start\`, not to \`right\`. Numbers and Latin terms inside Hebrew text stay left-to-right.
- Font pairing: a Hebrew face and a Latin face that match in weight and height.

**Motion**
- Animation serves the reading order; it is not decoration. Durations of 300–600ms, and one easing throughout.
- One transition type for the deck, or one per section. Lists and cards enter staggered.

**Accessibility**
- Contrast to WCAG AA: 4.5:1 for regular text, 3:1 for large text (above 48px). The app measures it on the rendered slide, so settle it before you write: mid-tone colours, as accent and secondary colours usually are, fail both as the colour of text on a light background, even at display size, and as a fill under white text. Keep them for shapes, bars and lines, and for text on a dark background; on a mid-tone fill, write in the theme's dark text colour. Text made paler with opacity loses contrast the same way.

**Before you call a slide done**, look at it and ask:
- Is there one clear focal point, and is it what the eye meets first?
- Does the content fill the slide, with no dead zone and no crowding?
- Does the hierarchy read in one second: title, main point, details?
- Is there a visual element that carries the message, and not only text?
- Is the text short enough to read from a distance?
- Does the slide look as if it belongs to the same deck as its neighbours, and still differ from them?
- Are direction, alignment and spacing consistent?`;
