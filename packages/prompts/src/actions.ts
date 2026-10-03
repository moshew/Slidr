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
}

export interface ActionDef {
  /** The session the action is sent to. */
  scope: Exclude<ScopeKind, 'import'>;
  /** Tools the action cannot do without: a session that lacks one does not offer it. */
  needs: readonly string[];
  /** The request, in the app's voice. */
  ask: (params: ActionParams) => string;
}

const OPTIONS =
  'Then stop: the app previews an option on the slide when the user hovers it and applies the one they click, so do not apply one yourself.';

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
      `Add an image to this slide: one that carries its message, not decoration.${described(p, 'What the user wants to see')} Write the prompt from the slide's point, the deck's image style and its palette, generate it, and place it so that text and image do not compete, rearranging the slide if it needs it. Look at the slide when you are done.`,
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
      `Generate ${count(p, 4)} alternatives for this image, in one image_generate call with that count and without an element id, at the aspect closest to the element's frame.${described(p, 'What the user wants to see')} Write the prompt from what the image is there to show on this slide, the deck's image style and its palette. The app shows each image to the user as it arrives, and replaces the element's image with the one they pick, keeping its frame and crop: so do not place one yourself. Images take about a minute each, and the call may come back as timed out while they are still being made. If it does, or if it fails some other way, do not call it again: what was started keeps arriving in the app, and a second call would make every image twice. Say in a line that the images are on their way. When the call returns the images, and the session can present options, show them with ui_present_options, kind "image", each with a label of two or three words.`,
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

/**
 * The message of an action: one `<slidr_action>` block, sent as the turn's text in place of
 * typed words. Like the context block, every value is JSON on one line, so what the user typed
 * into an action's field stays data.
 */
export function actionMessage({ action, params = {}, replyIn }: ActionMessageInput): string {
  const lines = [`action: ${json(action)}`];
  if (params.slideId !== undefined) lines.push(`slideId: ${json(params.slideId)}`);
  if (params.description !== undefined) {
    // The limit of a bare string is asked for under the empty key.
    lines.push(`description: ${json(params.description, { '': MAX_DESCRIPTION })}`);
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
