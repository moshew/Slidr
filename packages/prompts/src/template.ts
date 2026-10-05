import type { Archetype, PlaceholderRole } from '@slidr/model';
import { entry, type Part } from './entry';

/**
 * The template module (WG7-T11a, THM-06, THM-10): how a deck session makes a template and
 * improves one. A deck session gets it when it has the drafting tool.
 *
 * What a template is made from is open-ended: a description, a logo, a picture, a web address,
 * the open deck, an HTML file. Nothing in the app knows how to read any of them (PLAN 1.1,
 * principle 8); the module tells the agent that reading the source is its job, with the tools it
 * already has, and what to take from it. What the app does know is the shape of the result, and
 * that is what the rest of the module is about.
 */

/**
 * The families the app ships (SPEC appendix B), which are the only fonts a theme may name: a
 * slide is drawn without network access. `apps/desktop/src/templates/fonts.test.ts` holds this
 * list to the app's own.
 */
export const TEMPLATE_FONTS = {
  /** Families with Hebrew and Latin letters. */
  hebrew: [
    'Heebo',
    'Rubik',
    'Assistant',
    'Noto Sans Hebrew',
    'IBM Plex Sans Hebrew',
    'Open Sans',
    'Alef',
    'Varela Round',
    'Frank Ruhl Libre',
    'David Libre',
    'Noto Serif Hebrew',
    'Secular One',
    'Suez One',
    'Karantina',
  ],
  /** Families with Latin letters only. */
  latin: [
    'Inter',
    'Poppins',
    'Montserrat',
    'Manrope',
    'DM Sans',
    'Space Grotesk',
    'Playfair Display',
    'DM Serif Display',
    'JetBrains Mono',
  ],
} as const;

type Drawn = Exclude<Archetype, 'blank'>;
type Seats = Partial<Record<PlaceholderRole, number>>;

/**
 * The roles each archetype is drawn with in the app's own templates, and how many of each
 * (ADR-039). A deck that moves from one template to another finds a place for its content where
 * both draw the same roles. This package cannot read the templates' own contract (SPEC 14.2), so
 * `apps/desktop/src/templates/roleContract.test.ts` holds these to `ROLE_CONTRACT`.
 */
export const TEMPLATE_ROLES: Record<Drawn, Seats> = {
  hero: { caption: 2, title: 1, subtitle: 1 },
  section: { number: 1, caption: 1, title: 1, subtitle: 1 },
  bigNumber: { caption: 4, title: 1, number: 4, subtitle: 1, body: 1, footer: 1 },
  quote: { quote: 1, attribution: 1, caption: 1, footer: 1 },
  textImage: { caption: 1, title: 1, image: 1, subtitle: 3, body: 3, footer: 1 },
  fullImage: { image: 1, caption: 1, title: 1, body: 1 },
  cards: { caption: 4, title: 1, subtitle: 3, body: 4, footer: 1 },
  timeline: { caption: 2, title: 1, number: 4, subtitle: 4, body: 4, footer: 1 },
  process: { caption: 6, title: 1, subtitle: 5, number: 5, body: 1, footer: 1 },
  comparison: { caption: 3, title: 1, subtitle: 2, body: 2, footer: 1 },
  chart: { caption: 2, title: 1, chart: 1, number: 2, body: 2, footer: 1 },
  table: { caption: 2, title: 1, table: 1, footer: 1 },
  team: { caption: 5, title: 1, image: 4, subtitle: 4, body: 4, footer: 1 },
  closing: { caption: 2, title: 1, body: 3 },
};

/** What a template may seat beyond `TEMPLATE_ROLES`, and when. */
export const TEMPLATE_OPTIONAL_ROLES: Partial<Record<Drawn, { seats: Seats; when: string }>> = {
  hero: { seats: { image: 1 }, when: 'when it opens with a picture' },
  cards: { seats: { image: 3 }, when: 'when the cards have pictures' },
};

function listSeats(seats: Seats): string {
  return Object.entries(seats)
    .map(([role, count]) => (count === 1 ? role : `${role} ×${count}`))
    .join(', ');
}

const ROLE_CONTRACT = Object.entries(TEMPLATE_ROLES)
  .map(([archetype, seats]) => {
    const optional = TEMPLATE_OPTIONAL_ROLES[archetype as Drawn];
    const extra = optional ? ` (${listSeats(optional.seats)} ${optional.when})` : '';
    return `${archetype}: ${listSeats(seats)}${extra}`;
  })
  .join('; ');

export const TEMPLATE_GUIDE: readonly Part[] = [
  '## Making a template',
  '',
  "A template is a theme and a set of layouts: what the user's decks take their look from. They keep templates in a library, open new decks on one, and switch a deck from one to another. Making one is not laying out content: it is deciding how their decks will look, and leaving the right empty places.",
  '',
  entry`- **Read the sources first.** A request says what to make the template from, and you read each source with the tools you have: the app extracts nothing for you. A description is the brief. A logo or picture attached to the message is in front of you, and the message gives its asset id in the deck. A web address is read with web fetch: the page, and its stylesheet when the page alone does not show its colours and fonts. The open deck is read with ${'deck_get_theme'} and a look at its slides. An HTML file is in your working directory. Take from a source what makes it recognisable: which colour is the ground and which the one accent, the character of its type, shapes sharp or round, flat or shadowed, how dense it is. Say what you could not read; do not make up a brand.`,
  `- **The theme.** Seven colour tokens (bg, surface, text, muted, primary, secondary, accent) and a chart palette; a font pair for headings and one for body text, each a Hebrew family and a Latin one; the five text styles; radius, shadow, background. \`text\` and \`muted\` must pass contrast on \`bg\` and on \`surface\`: every placeholder is set in them. Only fonts the app ships can be named, since slides are drawn without the network. Hebrew and Latin: ${TEMPLATE_FONTS.hebrew.join(', ')}. Latin only: ${TEMPLATE_FONTS.latin.join(', ')}. Take the nearest in character to the source's font, and say which.`,
  entry`- **The layouts.** ${'template_create'} takes each layout as one slide in HTML, by the conventions above, in the deck's direction, with sample text in the deck's language at a realistic length. Draw one for each archetype the template covers: all fourteen for a full template, and at least hero, section, textImage, cards, bigNumber, quote, comparison and closing unless the user asks for less. One family, and still different from each other.`,
  "- **Placeholders.** `data-role` marks each part a deck fills in. A placeholder keeps its frame, its alignment and the name of one of the five text styles; colour, size and weight are the style's. So draw placeholder text exactly in a style, and when the design wants a size the styles lack, change the style in the theme, not the text. Give every placeholder a box of definite width and height, sized for the longest content it should take (a title of two lines, a body of four), inside the safe margins, and the whole box on one ground its style is readable on: text of another length lands elsewhere in the box. A role that repeats (three cards) is several placeholders of that role, in reading order.",
  `- **The roles of each archetype.** A deck that switches template keeps its content only where the new layout has a placeholder of the same role. The app's own templates draw these, and yours should unless the design has a reason not to: ${ROLE_CONTRACT}.`,
  '- **What the layout draws itself.** Everything without a role is drawn by the layout, under the content of every slide made from it: cards, rules, colour fields, a drawing, the logo, marked `data-role="logo"` so the user can replace it, and the slide number, a text marked `data-role="slideNumber"` in which each slide shows its own. Nothing of a layout can sit over a placeholder, so a picture with a scrim and text across it cannot be a layout: give picture and text frames of their own.',
  entry`- **Check the draft.** The result lists each layout with its placeholders, the \`findings\` of the design lint on it (filled with its sample, as drawn and mirrored for the other direction, and with other short text in Hebrew and in English), notes on what it could not keep, and one sheet of all the layouts. Look at the sheet as at a deck: do they belong together, is the hierarchy clear, is anything empty or crowded? Fix what is wrong with another ${'template_create'} that names the draft in \`basedOn\` and carries only what changes.`,
  entry`- **The user decides.** A draft is not saved. The app shows it to the user with every layout drawn; they save it there, or ask you for changes. End the turn with a line on what the template is built from and what you chose, and call ${'template_save'} only when the user asks in words. Improving a template that exists (a warmer palette, one more layout) is a draft \`basedOn\` its id; a change to the look of the open deck alone is a change to its theme.`,
];
