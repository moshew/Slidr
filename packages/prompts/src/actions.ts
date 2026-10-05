import type { ScopeKind } from '@slidr/agent-tools';
import { json } from './context';

/**
 * The action templates (SPEC 4.3, 11.7; WG11-T09): what the app sends to a chat when the user
 * presses a button of an AI tool instead of typing. Every action is a template and a scope: the
 * session it is sent to (the deck, slide or object chat), the tools it cannot do without, and
 * the words that ask for it.
 *
 * An action goes out as the turn's message, inside a `<slidr_action>` tag. The system prompt
 * teaches that text in `<slidr_…>` tags is the app's and is written in English whatever the
 * user speaks; the block says for itself that it stands for the user's message, and names the
 * language to answer in, since there is no typed text to take it from.
 *
 * The templates say what is wanted and what a good result is, and leave the how to the agent
 * and to the scope module of its session, which already knows the tools.
 */

/** The tag an action of the app's panels speaks in. */
export const ACTION_TAG = 'slidr_action';

/** What an action can be given. Every value is the user's choice in a form, or their text. */
export interface ActionParams {
  /** How many options to offer. */
  count?: number;
  /** A language by its English name: "Hebrew", "English". */
  language?: string;
  /** A tone of voice: "formal", "friendly", "confident", "plain". */
  tone?: string;
  /** What the user typed into the action's field, e.g. what a new image should show. */
  description?: string;
  /** For an action about one slide that the deck chat carries out: the slide's number. */
  slideNumber?: number;
  /** The same slide, by id. */
  slideId?: string;
  /** A web address the user gave as a source, e.g. the site a template should look like. */
  url?: string;
  /** The open deck itself is a source: a template is to be made from how it looks. */
  fromDeck?: boolean;
  /** An image asset the user painted: its transparent area is where an edit may happen. */
  maskAssetId?: string;
  /** For an action about one element that the slide chat carries out: the element's id. */
  elementId?: string;
  /** The outline the user approves, as its card holds it when they press the button (AID-03). */
  outline?: readonly OutlineSlide[];
  /** The user changed the outline in its card before approving it. */
  edited?: boolean;
}

/** A slide of an outline: what `outline_propose` takes for one, and what its card shows. */
export interface OutlineSlide {
  title: string;
  /** Absent for a slide the user added in the card: what it shows is the agent's to decide. */
  archetype?: string;
  note?: string;
}

export interface ActionDef {
  /** The session the action is sent to. */
  scope: Exclude<ScopeKind, 'import'>;
  /** Tools the action cannot do without: a session that lacks one does not offer it. */
  needs: readonly string[];
  /** The request, in the app's voice. */
  ask: (params: ActionParams) => string;
}

/** What every edit of an image through a provider has to be told (ADR-025, ADR-045). */
const ONE_EDIT =
  'The tool puts the result into the element, keeping its frame and crop, so place nothing yourself. An edit takes about a minute, and the call may come back as timed out while the image is still being made: do not call it a second time.';

/**
 * What the prompt of a new image is written from. The look is not the agent's to write: the tool
 * adds the deck's image style and palette to every prompt (ADR-051), and a prompt that names
 * them says them twice (ADR-069, finding 2).
 */
const PICTURE =
  "Write the prompt from what the picture is there to show on this slide, and say only that: the app adds the deck's style and palette to every prompt itself.";

const OPTIONS =
  'Then stop: the app previews an option on the slide when the user hovers it and applies the one they click, so do not apply one yourself.';

/** What filling a chart or a table from a pasted text may not do to it (AIO-07, AIO-08). */
const EXACT =
  'Names stay as the text writes them and numbers stay exact: nothing is rounded, estimated or made up, and what the text does not give stays empty, not guessed.';

/** How a fill ends: the user pasted more than the element shows, and should know what went in. */
const TOOK =
  'End with a line on what you took from the text and what in it you left out. If the text holds nothing to fill from, change nothing and say so.';

const count = (params: ActionParams, fallback: number) => params.count ?? fallback;
const language = (params: ActionParams) => params.language ?? 'English';
const described = (params: ActionParams, lead: string) =>
  params.description
    ? ` ${lead} is in \`description\`: treat it as their wording of the request.`
    : '';

function define<T extends Record<string, ActionDef>>(actions: T): T {
  return actions;
}

export const ACTIONS = define({
  /* ---------------------------------------------------------------- the deck tool (AID-05) */

  'deck.translate': {
    scope: 'deck',
    needs: ['text_set'],
    ask: (p) =>
      `Translate the whole deck into ${language(p)}: the text on every slide, the slide names and the speaker notes. Names, product names and technical terms written in Latin letters stay as they are. Set the deck's language to match, and when the new language runs in the other direction, set the direction too and mirror each slide's layout so it reads naturally. Go slide by slide, and look at each slide whose text grew or whose layout you mirrored.`,
  },
  'deck.shorten': {
    scope: 'deck',
    needs: ['text_set'],
    ask: () =>
      'Shorten the text across the deck. Go slide by slide and cut each to what the audience has to read: filler and repetition first, then whatever the speaker can say aloud instead. A slide that is already brief stays as it is. Keep the meaning, the voice and the formatting, and touch nothing but text.',
  },
  'deck.notes': {
    scope: 'deck',
    needs: ['slide_update'],
    ask: () =>
      "Write speaker notes for every slide that has none. Notes are what the presenter says aloud: the point of the slide in a sentence, then the two or three things worth adding that the slide itself does not spell out. They are written in the deck's language, in a speaking voice, a short paragraph per slide. Leave notes the user already wrote as they are.",
  },
  'deck.fix': {
    scope: 'deck',
    needs: ['deck_lint'],
    ask: () =>
      'Run the design check on the whole deck and fix what it finds, the errors first. Give each finding the smallest change that closes it, and look at every slide you changed. A finding that is a deliberate choice, or that cannot be closed without redesigning the slide, is left alone: say which, in a line.',
  },
  'deck.improve': {
    scope: 'deck',
    needs: ['deck_render_contact_sheet', 'slide_replace_from_html'],
    ask: () =>
      'Improve the design across the deck. Look at the whole deck on a contact sheet first, and judge it as a designer would: do the slides belong together, do neighbours differ, which slides are the weakest (text on an empty background, three slides of one kind in a row, a slide with no visual element)? Then redesign the few slides that would gain the most, keeping what each one says, and leave the good ones untouched. End with a line on what you changed and why.',
  },

  'template.create': {
    scope: 'deck',
    needs: ['template_create'],
    ask: (p) => {
      // The sources of THM-06, as the form gave them. Reading each is the agent's work.
      const sources = [
        ...(p.description ? ['the description in `description`'] : []),
        ...(p.url ? ['the site at the address in `url`, which you read with your web tools'] : []),
        ...(p.fromDeck ? ['the open deck: its theme, and how its slides look'] : []),
      ];
      return `Make a template${sources.length > 0 ? ` from ${sources.join('; ')}` : ''}. Files the user attached are listed with this message: one marked as the logo is the template's logo, to be drawn by the layouts; a picture is a reference for the look; an HTML file is a deck or a page whose design the template should follow. Read every source before you draw anything, then draft the template as the section on making a template describes, look at the sheet that comes back and fix what the design lint found. Nothing is saved: the app shows the draft to the user, who saves it or asks for changes. End with two or three lines, in the language of \`reply_in\` whatever language the sources are in, on what you took from each source and what you chose where the sources were silent.`;
    },
  },
  'outline.approve': {
    scope: 'deck',
    needs: ['slide_create_from_html'],
    // The outline rides with the approval: a session that could not be resumed was never told
    // it, and the user may have changed it in its card (AID-03).
    ask: (p) =>
      !p.outline
        ? 'The user approved the outline you proposed. Build the deck from it now, slide by slide, as it stands.'
        : p.edited
          ? "The user changed the outline you proposed, in its card, and approved it: `outline` is the outline as they left it. Build the deck from `outline` now, slide by slide, and from nothing else. Which slides there are, their order and their titles are the user's decision: a slide that is not in `outline` is not built, and a title is written as it stands there. The archetype and the note of a slide are still yours from the proposal: where the user reworded a title and they no longer fit it, go by the title. A slide with no archetype is one the user added: decide what it shows from its title and its neighbours."
          : 'The user approved the outline you proposed: it is in `outline`, as its card showed it. Build the deck from it now, slide by slide, as it stands.',
  },

  /* ---------------------------------------------------------------- the slide tool (AIS-02) */

  'slide.redesign': {
    scope: 'slide',
    needs: ['ui_present_options'],
    ask: (p) =>
      `Offer ${count(p, 3)} redesigns of this slide. The content stays; each option arranges it differently: another archetype or composition, not another colour.${described(p, 'What the user wants from the redesign')} Show them with ui_present_options, kind "layout": each option is a complete slide in HTML, as you would write it for a redesign, with a label of two or three words that names the idea. ${OPTIONS}`,
  },
  'slide.shorten': {
    scope: 'slide',
    needs: ['text_set'],
    ask: () =>
      'Shorten the text on this slide to what the audience has to read: cut filler and repetition first, then what the speaker can say aloud. Keep the meaning, the voice and the formatting of each text, and change nothing but text.',
  },
  'slide.split': {
    // A slide session cannot add a slide (SPEC 11.4, the scope guard), so the deck chat does it.
    scope: 'deck',
    needs: ['slide_create_from_html'],
    ask: (p) =>
      `Split slide ${p.slideNumber ?? ''} (\`slideId\`) into two slides. Find where its content divides into two ideas, keep the first on this slide and build the second right after it, each with room to breathe and a title of its own. The two should look like siblings without being the same layout. Look at both when you are done.`,
  },
  'slide.visual': {
    scope: 'slide',
    needs: ['element_add'],
    ask: () =>
      'Give this slide the visual element it lacks. Decide what would carry its message best (a big number, a chart, a diagram, a set of cards, an image, a strong shape) and add it, moving and resizing what is there so the two work together. The words stay as they are. Look at the slide when you are done.',
  },
  'slide.image': {
    scope: 'slide',
    needs: ['image_generate'],
    ask: (p) =>
      `Add an image to this slide: one that carries its message, not decoration.${described(p, 'What the user wants to see')} ${PICTURE} Generate it, and place it so that text and image do not compete, rearranging the slide if it needs it. Look at the slide when you are done.`,
  },
  'slide.animate': {
    scope: 'slide',
    needs: ['animation_set'],
    ask: () =>
      'Animate this slide with restraint: the elements enter in the order they are read, on click where the speaker reveals a point and together where they belong together, with one quiet effect for the whole slide. A title that is simply there needs no animation. Replace the animation the slide already has.',
  },
  'slide.notes': {
    scope: 'slide',
    needs: ['slide_update'],
    ask: () =>
      "Write speaker notes for this slide: what the presenter says aloud. Open with the point of the slide in a sentence, then the two or three things worth adding that the slide does not spell out. A short paragraph, in the deck's language, in a speaking voice. If the slide already has notes, improve them instead of replacing what the user wrote.",
  },
  'slide.fix': {
    scope: 'slide',
    needs: ['slide_lint'],
    ask: () =>
      'Run the design check on this slide and fix what it finds, the errors first, each with the smallest change that closes it. Look at the slide afterwards. A finding that is a deliberate choice is left alone: say which, in a line.',
  },
  'slide.translate': {
    scope: 'slide',
    needs: ['text_set'],
    ask: (p) =>
      `Translate the text on this slide into ${language(p)}, and its speaker notes with it. Names, product names and technical terms written in Latin letters stay as they are. Each paragraph takes the direction of its new language. Look at the slide afterwards: translated text is often longer.`,
  },

  /* ---------------------------------------------------------------- the object tool: text (AIO-02) */

  'text.variations': {
    scope: 'object',
    needs: ['ui_present_options'],
    ask: (p) =>
      `Offer ${count(p, 4)} other wordings of this text: the same message, in the same language and at about the same length, each different in angle or tone and not in a word or two. Show them with ui_present_options, kind "text": each option is the complete text of the element in Markdown, with a label of two or three words that says what sets it apart. ${OPTIONS}`,
  },
  'text.title': {
    scope: 'object',
    needs: ['ui_present_options'],
    ask: (p) =>
      `Offer ${count(p, 4)} alternative titles in place of this text. A title states the point of its slide in a few words: read the slide first, and let each option take a different way in (the claim, the question, the number, the benefit). Show them with ui_present_options, kind "text", each with a label of two or three words. ${OPTIONS}`,
  },
  'text.shorten': {
    scope: 'object',
    needs: ['text_set'],
    ask: () =>
      'Shorten this text to about half its length. Keep what it says and its voice; cut filler and repetition first.',
  },
  'text.expand': {
    scope: 'object',
    needs: ['text_set'],
    ask: () =>
      'Expand this text with the detail or the example that makes it concrete, to twice its length at most. Then look at the slide: the longer text has to fit its box, and if it does not, say so instead of shrinking the font.',
  },
  'text.tone': {
    scope: 'object',
    needs: ['text_set'],
    ask: (p) =>
      `Rewrite this text in a ${p.tone ?? 'plain'} tone. What it says and how long it is stay as they are; only the voice changes.`,
  },
  'text.fix': {
    scope: 'object',
    needs: ['text_set'],
    ask: () =>
      "Fix the spelling, grammar and punctuation of this text, and nothing else: the wording stays the user's. If there is nothing to fix, say so and change nothing.",
  },
  'text.translate': {
    scope: 'object',
    needs: ['text_set'],
    ask: (p) =>
      `Translate this text into ${language(p)}. Names, product names and technical terms written in Latin letters stay as they are, and each paragraph takes the direction of its new language.`,
  },
  'text.bullets': {
    scope: 'object',
    needs: ['text_set'],
    ask: () =>
      'Turn this text into a short bulleted list: one idea to a bullet, a few words each, all built the same way. Nothing is added and nothing important is dropped.',
  },

  /* ---------------------------------------------------------------- the object tool: image (AIO-03) */

  'image.alternatives': {
    scope: 'object',
    needs: ['image_generate'],
    ask: (p) =>
      `Generate ${count(p, 4)} alternatives for this image, in one image_generate call with that count and without an element id, at the aspect closest to the element's frame.${described(p, 'What the user wants to see')} ${PICTURE} The app shows each image to the user as it arrives, and replaces the element's image with the one they pick, keeping its frame and crop: so do not place one yourself. Images take about a minute each, and the call may come back as timed out while they are still being made. If it does, or if it fails some other way, do not call it again: what was started keeps arriving in the app, and a second call would make every image twice. Say in a line that the images are on their way. When the call returns the images, and the session can present options, show them with ui_present_options, kind "image", each with a label of two or three words.`,
  },

  /* ---------------------------------------------------------------- the object tool: editing an image (AIO-04) */

  'image.edit': {
    scope: 'object',
    needs: ['image_edit'],
    ask: (p) =>
      `Change this image as the user asks: what they want is in \`description\`. Call image_edit once, with this element's id and an instruction that says what to change and what must stay as it is.${
        p.maskAssetId
          ? ' The user painted the area the change may touch: pass the id in `maskAssetId` as the mask, and word the instruction about what goes into that area.'
          : ''
      } ${ONE_EDIT} The result says what kind of edit the image provider made: when it was a redraw (\`regenerate\`), tell the user in a line that the whole image was drawn anew rather than touched up${
        p.maskAssetId ? ', and that a painted area needs a provider that edits exactly' : ''
      }.`,
  },
  'image.restyle': {
    scope: 'object',
    needs: ['image_edit'],
    ask: () =>
      `Bring this image into the deck's image style. Call image_edit once, with this element's id and an instruction that keeps the subject and the composition and restates the style: the deck's \`image_style\` from the context, and its palette. When the deck has no image style yet, take it from the deck's other images and its theme, and say in a line what you went by. ${ONE_EDIT} When the result says the edit was a redraw (\`regenerate\`), tell the user in a line that details of the image moved.`,
  },

  /* ---------------------------------------------------------------- the object tool: chart (AIO-07) */

  'chart.type': {
    scope: 'object',
    needs: ['ui_present_options'],
    ask: (p) =>
      `Suggest chart types for the data of this chart. Read the data first: what it compares (values over time, categories against each other, parts of a whole, two measures against each other), in how many series and how many points. Offer the ${count(p, 3)} types that show it best, the best first, leaving out the type the chart has now. Show them with ui_present_options, kind "chart": each option's \`set\` is the chart_set arguments that make the change, without the element id, as in {"chartType": "line"}. The data stays as it is; add to \`set\` only an option the new type cannot do without, such as a legend for several series. Each label names the type and, in two or three words, what it brings out. ${OPTIONS} If the type the chart has now is the best one for this data, say so in your reply.`,
  },
  'chart.fill': {
    scope: 'object',
    needs: ['chart_set'],
    ask: () =>
      `Fill this chart from the text in \`description\`, which the user pasted: find the numbers in it and what each one measures, and set them as the categories and series of the chart with chart_set. ${EXACT} A number written with a unit or a sign ("12%", "$1,200", "3.5M") goes in as its value, and the unit belongs in the name of its series or in the title of the axis. The chart keeps its type and its look, unless the new data cannot be shown in that type: then choose the type that fits, and say so. If the chart's title no longer fits the data, give it one that says what the data shows. Look at the slide afterwards. ${TOOK}`,
  },
  'chart.title': {
    scope: 'object',
    needs: ['ui_present_options'],
    ask: (p) =>
      `Offer ${count(p, 4)} titles for this chart. The title of a chart states what the data shows, the insight and not the subject: "Sales doubled in two years", not "Sales by year". Read the data, find what stands out in it (a trend, a gap, a peak, a turn), and let each option say it from another angle, short enough for one line above the chart. A number in a title is one the data holds, or one that follows from it exactly. Show them with ui_present_options, kind "chart": each option's \`set\` is {"title": "…"} and nothing else, with a label of two or three words that names the angle. ${OPTIONS} In your reply, give the insight itself in one full sentence, for the user to say aloud or to put on the slide.`,
  },

  /* ---------------------------------------------------------------- the object tool: table (AIO-08) */

  'table.fill': {
    scope: 'object',
    needs: ['table_set'],
    ask: () =>
      `Fill this table from the text in \`description\`, which the user pasted: find the items it lists and what it says about each, and set them as the cells of the table with table_set: a header row that names the columns, then a row for each item. A cell is short (a name, a number, a few words): a sentence of the text becomes the fact it states. ${EXACT} The table keeps its frame and its style, and takes the number of rows and columns the content asks for. Look at the slide afterwards: a table that grew has to stay readable, and if it cannot, say so instead of shrinking its text. ${TOOK}`,
  },
  'table.style': {
    scope: 'object',
    needs: ['ui_present_options'],
    ask: (p) =>
      `Offer ${count(p, 3)} looks for this table, each different from the one it has and from the others. A look is one of the named table styles with the switches that suit what this table holds: a header row when the first row names the columns, a marked first column when it names the rows, banded rows when there are many of them. Choose looks that sit well on this slide. Show them with ui_present_options, kind "table": each option's \`set\` is the table_set arguments of the look and nothing else, as in {"styleId": "lines", "headerRow": true, "bandedRows": false, "firstColumn": true}, with a label of two or three words that says what the look does for the table. ${OPTIONS}`,
  },
  'table.insight': {
    // An object session cannot add an element (SPEC 11.4, the scope guard), so the slide chat does it.
    scope: 'slide',
    needs: ['element_add'],
    ask: () =>
      'Sum up the table `elementId` in one insight, and put it on this slide. The insight is the one thing a reader should take from the table (the largest, the trend, the gap, the exception): a single sentence with the number that carries it, and every number in it is in the table or follows from it exactly. If the slide already has a line that does this job (a subtitle, a caption beside the table), reword that line. Otherwise add the sentence as one text element where the eye meets it together with the table, above it or beside it, in a text style of the theme, moving or resizing the table only as far as that takes. Nothing else on the slide changes. Look at the slide when you are done.',
  },
  'table.chart': {
    // The chart is a new element and the table goes: both are past an object session.
    scope: 'slide',
    needs: ['chart_set', 'element_delete'],
    ask: () =>
      'Turn the table `elementId` into a chart. Read its header row and its first column as the names and its numbers as the values: a number written with a unit or a sign ("12%", "$1,200") is its value, and a column that holds no numbers is not a series. Choose the chart type that fits what the table compares, and give the chart a title that says what the data shows. The chart takes the place of the table: create it with chart_set in the frame of the table, larger if a chart needs more room there, then delete the table with element_delete. Nothing else on the slide changes, unless it has to move to make room. Look at the slide when you are done. If the table holds nothing a chart can show, change nothing and say so.',
  },
});

export type ActionId = keyof typeof ACTIONS;

export function isActionId(id: string): id is ActionId {
  return Object.hasOwn(ACTIONS, id);
}

export interface ActionMessageInput {
  action: ActionId;
  params?: ActionParams;
  /** The language to answer in: the UI's, as an English name. There is no typed text to go by. */
  replyIn: string;
}

/** A user's free text in an action's field: a sentence or two, not a page. */
const MAX_DESCRIPTION = 600;
/** The description of a template to make is a brief: a paragraph or three. */
const MAX_BRIEF = 2000;
/** A text to fill a chart or a table from is pasted, not typed: a page of a report, a sheet. */
const MAX_SOURCE = 6000;
const MAX_URL = 500;

/** Actions whose field takes more than a sentence, and how much. */
const DESCRIPTION_LIMITS: Partial<Record<ActionId, number>> = {
  'template.create': MAX_BRIEF,
  'chart.fill': MAX_SOURCE,
  'table.fill': MAX_SOURCE,
};

/** How long a slide's title and its note may be in an outline: a line each. */
const OUTLINE_LIMITS = { title: 200, note: 300 };
const OUTLINE_KEY = 'outline: ';

/**
 * The message of an action: one `<slidr_action>` block, sent as the turn's text in place of
 * typed words. Like the context block, every value is JSON on one line, so what the user typed
 * into an action's field stays data.
 */
export function actionMessage({ action, params = {}, replyIn }: ActionMessageInput): string {
  const lines = [`action: ${json(action)}`];
  if (params.slideId !== undefined) lines.push(`slideId: ${json(params.slideId)}`);
  if (params.elementId !== undefined) lines.push(`elementId: ${json(params.elementId)}`);
  if (params.description !== undefined) {
    // The limit of a bare string is asked for under the empty key.
    const limit = DESCRIPTION_LIMITS[action] ?? MAX_DESCRIPTION;
    lines.push(`description: ${json(params.description, { '': limit })}`);
  }
  if (params.url !== undefined) lines.push(`url: ${json(params.url, { '': MAX_URL })}`);
  if (params.maskAssetId !== undefined) lines.push(`maskAssetId: ${json(params.maskAssetId)}`);
  if (params.outline !== undefined) {
    // Each slide by its three fields and nothing else: what a card adds for itself stays there.
    const slides = params.outline.map(({ title, archetype, note }) => ({
      title,
      ...(archetype ? { archetype } : {}),
      ...(note ? { note } : {}),
    }));
    lines.push(`${OUTLINE_KEY}${json(slides, OUTLINE_LIMITS)}`);
  }
  lines.push(`reply_in: ${json(replyIn)}`);
  return [
    `<${ACTION_TAG}>`,
    ...lines,
    'The user pressed a button in the app instead of typing: this block stands for their message, and it is about what this session works on. Answer in the language of `reply_in`.',
    ACTIONS[action].ask(params),
    `</${ACTION_TAG}>`,
  ].join('\n');
}

/**
 * The outline an approval carried, read back from the message that was sent: what the card of an
 * answered outline shows, in this window and after the deck is opened again. Null for a message
 * that carries none.
 */
export function approvedOutline(message: string): OutlineSlide[] | null {
  const line = message.split('\n').find((text) => text.startsWith(OUTLINE_KEY));
  if (!line) return null;
  try {
    const slides: unknown = JSON.parse(line.slice(OUTLINE_KEY.length));
    if (!Array.isArray(slides)) return null;
    return slides.flatMap((slide: unknown): OutlineSlide[] => {
      if (typeof slide !== 'object' || slide === null) return [];
      const { title, archetype, note } = slide as Record<string, unknown>;
      if (typeof title !== 'string') return [];
      return [
        {
          title,
          ...(typeof archetype === 'string' ? { archetype } : {}),
          ...(typeof note === 'string' ? { note } : {}),
        },
      ];
    });
  } catch {
    return null;
  }
}
