import { useTranslation } from 'react-i18next';
import { findElement, findSlide, plainText, type Element } from '@slidr/model';
import {
  Layers,
  RectangleHorizontal,
  SquareDashedMousePointer,
  TextCursorInput,
  type LucideIcon,
} from '@slidr/ui/icons';
import { cx, Icon } from '@slidr/ui';
import { elementDisplayKind, useDeck, useEditor } from '../shell';
import { navigateTo } from './runtime';
import type { Focus } from './focus';

/*
 * What the next message is about (ADR-072), beside the composer: the words selected in a text,
 * the selected elements, or the slide on the Stage. It follows the selection; a click brings what
 * it names into view. Nothing here is sent: the chat reads the same selection when it sends.
 */

interface View {
  icon: LucideIcon;
  label: string;
  detail?: string;
  onClick?: () => void;
}

/** How long a quote of the selected words or of a text box may be in the chip. */
const QUOTE = 48;

function quote(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const chars = [...line];
  return chars.length > QUOTE ? `${chars.slice(0, QUOTE).join('')}…` : line;
}

function elementLabel(element: Element): string | undefined {
  if (element.name) return element.name;
  if (element.type === 'text') return quote(plainText(element.content)) || undefined;
  return undefined;
}

export function FocusChip({ focus }: { focus: Focus }) {
  const { t } = useTranslation('ai');
  const { t: ts } = useTranslation();
  const editor = useEditor();
  const slide = useDeck((s) => (focus.slideId ? findSlide(s.deck, focus.slideId) : undefined));
  const one =
    slide && focus.elementIds.length === 1
      ? findElement(slide, focus.elementIds[0] ?? '')
      : undefined;

  let view: View;
  if (focus.text) {
    view = { icon: TextCursorInput, label: t('focus.text'), detail: `“${quote(focus.text.text)}”` };
  } else if (one) {
    view = {
      icon: SquareDashedMousePointer,
      label: ts(`selection.${elementDisplayKind(one)}`),
      detail: elementLabel(one),
      onClick: () => navigateTo(editor, { slideId: slide?.id, elementIds: [one.id] }),
    };
  } else if (slide && focus.elementIds.length > 1) {
    const ids = [...focus.elementIds];
    view = {
      icon: SquareDashedMousePointer,
      label: ts('selection.multiple', { n: ids.length }),
      onClick: () => navigateTo(editor, { slideId: slide.id, elementIds: ids }),
    };
  } else if (slide) {
    view = {
      icon: RectangleHorizontal,
      label: t('focus.slide', { n: focus.slideNumber }),
      detail: slide.name,
      onClick: () => navigateTo(editor, { slideId: slide.id }),
    };
  } else {
    view = { icon: Layers, label: t('focus.deck') };
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-ui-fg-muted">
      <span className="shrink-0">{t('focus.label')}</span>
      <button
        type="button"
        data-testid="focus-chip"
        data-focus={
          focus.text ? 'text' : focus.elementIds.length > 0 ? 'object' : slide ? 'slide' : 'deck'
        }
        disabled={!view.onClick}
        title={view.onClick ? t('focus.show') : undefined}
        onClick={view.onClick}
        className={cx(
          'inline-flex h-6 min-w-0 cursor-default items-center gap-1.5 rounded-full px-2 font-medium transition-colors',
          'bg-ui-accent-soft text-ui-accent-fg enabled:hover:bg-ui-accent-soft-hover',
        )}
      >
        <Icon icon={view.icon} className="-ms-0.5 shrink-0" />
        <span className="shrink-0">{view.label}</span>
        {view.detail && (
          <span dir="auto" className="min-w-0 truncate font-normal">
            · {view.detail}
          </span>
        )}
      </button>
    </div>
  );
}
