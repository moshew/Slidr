/**
 * Module 3, second half (SPEC 11.6): the HTML authoring conventions of SPEC 11.5.
 *
 * THIS FILE IS THE ONE PLACE WHERE THE PROMPT STATES THE CONVENTIONS. They are owned by the
 * conversion engine (`packages/html-import`, WG9A): what the engine reads, the agent must be
 * told here, and nothing more. When the engine changes an attribute or the shape of a value,
 * change this text with it. It was reconciled with the engine's list in ADR-017 ("המוסכמות
 * שהמנוע מכבד").
 *
 * What is derived, so it cannot drift:
 * - the values of `data-archetype` are the model's `Archetype` (through `ARCHETYPES`);
 * - the values of `data-role` are the model's `PlaceholderRole`;
 * - the colour variables are the colour tokens of the model's `Theme`, under the names the
 *   renderer sets on every slide root (`themeVariables` in `packages/renderer/src/theme.ts`).
 */
import { ChartType, PlaceholderRole, Theme } from '@slidr/model';
import { ARCHETYPES } from './design';

const code = (text: string) => `\`${text}\``;

const archetypes = Object.keys(ARCHETYPES).map(code).join(', ');
const roles = PlaceholderRole.options.map(code).join(', ');
const chartTypes = ChartType.options.join(', ');
/** `chart` is a list, not one colour: its variables are numbered. */
const colorVariables = Object.keys(Theme.shape.colors.shape)
  .filter((token) => token !== 'chart')
  .map((token) => code(`var(--color-${token})`))
  .join(', ');

export const HTML_CONVENTIONS = `## Writing a slide as HTML

You design best in HTML and CSS, so that is how a slide is written. The app renders your HTML, measures what the browser laid out, and builds the slide from the measurements: text becomes text elements, images become image elements, boxes become shapes. Any valid HTML and CSS is accepted, and the slide looks exactly as you wrote it. A CSS property the model has no field for is kept on its element, and a subtree that cannot be taken apart, such as a canvas, stays one \`html\` element. So nothing is unsupported, and you should design as freely as you would for a browser.

The conventions below do not change how a slide looks. They decide how editable it is afterwards: whether the user gets a text box with handles or an opaque block, and whether a change of template reaches the slide.

- **Root.** One root element of 1920×1080 pixels that carries the slide's direction and language (\`dir="rtl" lang="he"\`). Inside it any layout works (flex, grid, absolute positioning), and so do \`<style>\` blocks. Size things in px: the canvas is fixed, and \`rem\` and viewport units follow the app's window, not the slide. In a right-to-left deck write the CSS with logical properties (\`text-align: start\`, \`margin-inline-start\`, \`inset-inline-end\`) and let the direction on the root do the mirroring.
- **Archetype.** \`data-archetype\` on the root says which kind of slide this is: one of ${archetypes}. The app records it on the slide, the outline shows it, and the check for variety between neighbours reads it.
- **Theme variables.** Take colours and fonts from the theme: ${colorVariables}; \`var(--font-heading)\` and \`var(--font-body)\`. A colour or font that comes from a variable stays linked to the theme, so a new palette or template restyles the slide. A literal \`#1a73e8\` stays that blue for good, even when it happens to equal a theme colour. A tint keeps the link when it is written as \`color-mix(in srgb, var(--color-primary) 20%, transparent)\`. Use a literal only where the colour is content, such as a brand colour inside a logo. \`var(--color-chart-1)\`, \`var(--color-chart-2)\` and so on (the chart palette), \`var(--radius)\` and \`var(--shadow)\` keep the look consistent, and their values are copied into the slide as they are.
- **Text styles.** Text whose size, weight, font, line height and colour equal one of the theme's text styles (display, title, heading, body, caption) is linked to that style and follows it when the theme changes; other text keeps its own values. So start from the theme's sizes, and depart from them where the design needs it.
- **Images.** \`<img data-asset="ASSET_ID">\` places an image the deck already has; on any other element, \`data-asset\` makes the asset its background, with \`background-size: cover\` or \`contain\`. \`<img data-image-prompt="what the image shows">\` leaves a placeholder that keeps the prompt, for you or the user to generate later; it is the right choice whenever the image does not exist yet. Give every image a box of definite size, and \`object-fit: cover\`. Do not link to images, fonts or stylesheets on the web: a slide is rendered without network access, and they would not load.
- **Icons.** \`<i data-icon="lucide:rocket"></i>\` places an icon from the built-in library, by name. It takes its size from \`font-size\` and its colour from \`color\`.
- **Charts.** \`<div data-chart='{…}'>\`, with a size set in CSS and the chart as JSON, becomes a chart element the user can edit: \`{"chartType": "column", "data": {"categories": ["Q1", "Q2"], "series": [{"name": "Revenue", "values": [12, 18]}]}}\`. \`chartType\` is one of ${chartTypes}, and every series has one value per category. A chart drawn any other way (inline SVG, a canvas) looks the same but stays \`html\`.
- **Names and roles.** \`data-name\` gives an element a name, which the user sees in the editor and you see when you read the slide. \`data-role\` says what part an element plays: ${roles}. Roles are how a change of template knows where each piece of content goes, and how the outline finds a slide's title, so mark the title at least.
- **Entrance.** \`data-anim\` on an element gives it an entrance animation, by preset name (\`fade\`, \`rise\`, \`zoom\`, \`flyIn\`, \`wipe\`). Each marked element enters on its own click, in document order; on a container, everything inside enters together.
- **Keeping HTML.** \`data-keep-html\` on an element tells the app not to take it apart, even where it could. Use it for a piece whose meaning is in its structure.
- **Scripts.** A \`<script>\` anywhere makes the whole slide one \`html\` element that is neither converted nor compared, so leave scripts out unless the slide cannot exist without one.

The result of an HTML write reports \`editability\` and notes on what stayed \`html\`. When a part you expected to be editable stayed \`html\`, the notes say why, and a plainer construction of that part usually converts: a real element in place of a pseudo-element, text as text in place of text drawn in SVG.`;
