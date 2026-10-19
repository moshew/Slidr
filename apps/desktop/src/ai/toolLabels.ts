import type { TFunction } from 'i18next';
import type { Deck, Element, Slide } from '@slidr/model';
import {
  BookOpen,
  Eye,
  FileText,
  Globe,
  Image,
  LayoutGrid,
  Palette,
  Pencil,
  Plus,
  ScanEye,
  Trash2,
  WandSparkles,
  Wrench,
  type LucideIcon,
} from '@slidr/ui/icons';
import type { ToolSource } from '../agent/agent';
import type { Activity } from '../agent/agentService';
import type { ToolTarget } from '../agent/transcript';
import { he } from './messages';

/*
 * A tool call in the user's words (CHT-U02): "Updating text · slide 3", not `text_set`. The
 * names of the app's tools are the Deck API's. A harness's own tools are not known here by
 * name, only by what their names give away, so any harness's web search reads as a web search.
 */

interface Call {
  name: string;
  source: ToolSource;
  target?: ToolTarget;
}

/*
 * Every chip of a chat asks for the number of its slide after every change to the deck, and each
 * one walking the slides, and the elements of each, was a walk for every chip of a long chat. What
 * they ask is found once: where each slide is, for each deck, and which elements a slide holds, for
 * each slide, which a change to another slide leaves the object it was (ADR-007).
 */
const slidePlaces = new WeakMap<Deck, Map<string, number>>();
const slideElements = new WeakMap<Slide, Set<string>>();

function placeOf(deck: Deck, slideId: string): number {
  let places = slidePlaces.get(deck);
  if (!places) {
    places = new Map(deck.slides.map((slide, i) => [slide.id, i]));
    slidePlaces.set(deck, places);
  }
  return places.get(slideId) ?? -1;
}

/** The ids of the elements of a slide, the ones inside groups too. */
function elementsOf(slide: Slide): Set<string> {
  let ids = slideElements.get(slide);
  if (!ids) {
    const found = new Set<string>();
    const walk = (elements: readonly Element[]) => {
      for (const element of elements) {
        found.add(element.id);
        if (element.type === 'group') walk(element.children);
      }
    };
    walk(slide.elements);
    ids = found;
    slideElements.set(slide, ids);
  }
  return ids;
}

/** The number of the slide a call points at, from 1; 0 when it points at none that exists. */
export function targetSlideNumber(deck: Deck, target: ToolTarget | undefined): number {
  if (!target) return 0;
  if (target.slideId) return placeOf(deck, target.slideId) + 1;
  const ids = target.elementIds ?? [];
  if (ids.length === 0) return 0;
  return deck.slides.findIndex((slide) => ids.some((id) => elementsOf(slide).has(id))) + 1;
}

function isAppTool(name: string): name is keyof typeof he.tool {
  return Object.hasOwn(he.tool, name);
}

/** What a harness's own tool does, as far as its name says. */
function harnessKind(name: string): 'search' | 'fetch' | 'file' | 'other' {
  if (/search/i.test(name)) return 'search';
  if (/fetch|browse|url/i.test(name)) return 'fetch';
  if (/read|grep|glob|file/i.test(name)) return 'file';
  return 'other';
}

/** Tools whose label is about a slide already, so the slide's number is not said twice. */
const NO_SLIDE_SUFFIX = new Set([
  'deck_get_outline',
  'deck_get_theme',
  'deck_lint',
  'theme_update',
]);

export function toolLabel(t: TFunction<'ai'>, call: Call, slideNumber: number): string {
  if (call.source === 'harness') {
    return t(`harnessTool.${harnessKind(call.name)}`, { name: call.name });
  }
  if (!isAppTool(call.name)) return t('toolOther', { name: call.name });
  const label = t(`tool.${call.name}`);
  return slideNumber > 0 && !NO_SLIDE_SUFFIX.has(call.name)
    ? t('toolOnSlide', { label, n: slideNumber })
    : label;
}

export function toolIcon(call: Call): LucideIcon {
  const { name } = call;
  if (call.source === 'harness') {
    const kind = harnessKind(name);
    return kind === 'file' ? FileText : kind === 'other' ? Wrench : Globe;
  }
  if (/render/.test(name)) return Eye;
  if (/present_options/.test(name)) return LayoutGrid;
  if (/lint/.test(name)) return ScanEye;
  if (/^(image|stock|icon)_/.test(name)) return Image;
  if (/^(theme|template)_/.test(name)) return Palette;
  if (/replace|convert/.test(name)) return WandSparkles;
  if (/create|_add$|duplicate/.test(name)) return Plus;
  if (/delete/.test(name)) return Trash2;
  if (/_get/.test(name)) return BookOpen;
  if (/update|_set$|arrange|reorder|apply/.test(name)) return Pencil;
  return Wrench;
}

/** What the agent is doing right now, in the user's words (CHT-U03). */
export function activityLabel(
  t: TFunction<'ai'>,
  activity: Activity | null,
  slideNumber: number,
): string {
  if (!activity) return t('activity.thinking');
  if (activity.kind === 'tool') return `${toolLabel(t, activity, slideNumber)}…`;
  return t(`activity.${activity.kind}`);
}
