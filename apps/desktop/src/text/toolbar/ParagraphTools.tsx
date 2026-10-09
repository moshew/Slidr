import type { Direction, Paragraph } from '@slidr/model';
import {
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioIconItem,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Input,
  NumberField,
  type LucideIcon,
} from '@slidr/ui';
import {
  ChevronDown,
  List,
  ListChevronsUpDown,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  PilcrowLeft,
  PilcrowRight,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
} from '@slidr/ui/icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorField, useGestureTx } from '../../controls';
import type { ContextToolProps } from '../../shell';
import { changeParagraphs } from '../actions';
import {
  isMixed,
  levelChange,
  listChange,
  listStyleChange,
  orNull,
  patchParagraph,
  type ParagraphChange,
  type ParagraphPatch,
} from '../format';
import {
  closeToText,
  inSeveralRow,
  keepFocus,
  PopoverTool,
  Row,
  TextToggle,
  useBurstTx,
  useCompact,
  useText,
  type Text,
} from './shared';

/* Row B for text, the paragraph tools (WG4-T04): alignment, direction, lists, spacing. */

type Align = Paragraph['align'];

/** Changes paragraphs of the target, as one undo step named "Format paragraph". */
function useChange(text: Text | null): (change: ParagraphChange, txId?: string) => void {
  const { t } = useTranslation('text');
  return (change, txId) => {
    if (text) changeParagraphs(text.target, change, { txId, label: t('step.paragraph') });
  };
}

function useSetParagraph(text: Text | null): (patch: ParagraphPatch, txId?: string) => void {
  const change = useChange(text);
  return (patch, txId) => change(patchParagraph(patch), txId);
}

/* ---------------------------------------------------------------- alignment */

const ALIGNS: readonly Align[] = ['start', 'center', 'end', 'justify'];

/**
 * Alignment is logical in the model: `start` is the right in a paragraph that reads right to left.
 * The buttons say which physical side that is for the paragraph at hand: the icon is the side's,
 * and so is the name.
 */
function alignSide(align: Align, direction: Direction): 'left' | 'center' | 'right' | 'justify' {
  if (align === 'center' || align === 'justify') return align;
  return (align === 'start') === (direction === 'ltr') ? 'left' : 'right';
}

const SIDE_ICONS: Record<ReturnType<typeof alignSide>, LucideIcon> = {
  left: TextAlignStart,
  center: TextAlignCenter,
  right: TextAlignEnd,
  justify: TextAlignJustify,
};

/**
 * The names of the alignments. In the row of several elements they stand beside the arrange
 * tools, which align the elements themselves ("align left"): there they say that it is the text
 * they align. So they do in the row of a group, where what is selected is an object and the
 * text is what is inside it.
 */
const alignNames = (kind: ContextToolProps['kind'] | undefined) =>
  inSeveralRow(kind) ? 'alignText' : 'align';

/** The current alignment opens all four choices. Compact text rows include direction here too. */
export function AlignTool({ kind }: Partial<ContextToolProps>) {
  const { t } = useTranslation('text');
  const compact = useCompact();
  const text = useText();
  const setParagraph = useSetParagraph(text);
  if (!text) return null;
  const names = alignNames(kind);
  const { align, direction } = text.format;
  const current = isMixed(align) ? 'start' : align;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          size="sm"
          icon={SIDE_ICONS[alignSide(current, direction)]}
          label={t(`${names}.label`)}
          data-align={isMixed(align) ? 'mixed' : align}
          data-testid="text-align-menu"
          className="data-[state=open]:bg-ui-hover"
          onMouseDown={keepFocus}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cx('rounded-inset!', !(compact && kind === 'text') && 'min-w-0!')}
        onCloseAutoFocus={closeToText}
      >
        <DropdownMenuRadioGroup
          className="flex flex-col items-center"
          value={orNull(align) ?? ''}
          onValueChange={(next) => setParagraph({ align: next as Align })}
        >
          {ALIGNS.map((value) => {
            const side = alignSide(value, direction);
            return (
              <DropdownMenuRadioIconItem
                key={value}
                value={value}
                icon={SIDE_ICONS[side]}
                label={t(`${names}.${side}`)}
                data-align={value}
              />
            );
          })}
        </DropdownMenuRadioGroup>
        {compact && kind === 'text' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('direction.label')}</DropdownMenuLabel>
            <DirectionChoices text={text} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------- direction */

const DIRECTIONS: readonly Paragraph['dir'][] = ['rtl', 'ltr', 'auto'];

/** The three directions as the choices of a menu: the two ways, or as the text itself says. */
function DirectionChoices({ text }: { text: Text }) {
  const { t } = useTranslation('text');
  const setParagraph = useSetParagraph(text);
  return (
    <DropdownMenuRadioGroup
      value={orNull(text.format.dir) ?? ''}
      onValueChange={(next) => setParagraph({ dir: next as Paragraph['dir'] })}
    >
      {DIRECTIONS.map((value) => (
        <DropdownMenuRadioItem key={value} value={value}>
          {t(`direction.${value}`)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/**
 * The button shows which way the paragraph reads now; the menu sets it, or leaves it to the text.
 * In the row when there is room; otherwise in the alignment menu.
 */
export function DirectionTool() {
  const { t } = useTranslation('text');
  const compact = useCompact();
  const text = useText();
  if (!text || compact) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          size="sm"
          icon={text.format.direction === 'rtl' ? PilcrowLeft : PilcrowRight}
          label={t('direction.label')}
          shortcut="Ctrl+Shift+X"
          data-direction={text.format.direction}
          onMouseDown={keepFocus}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent onCloseAutoFocus={closeToText}>
        <DirectionChoices text={text} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------- lists */

/** Bullets on offer; the standard bullet follows the level (the renderer's `•`, `◦`, `▪`). */
const GLYPHS = ['•', '◦', '▪', '–', '✓', '★'];

function ListToggles({ text }: { text: Text }) {
  const { t } = useTranslation('text');
  const change = useChange(text);
  const { list } = text.format;
  return (
    <>
      <TextToggle
        icon={List}
        className="rtl:-scale-x-100"
        label={t('list.bullets')}
        pressed={list === 'bullet'}
        onPressedChange={(on) => change(listChange('bullet', on))}
      />
      <TextToggle
        icon={ListOrdered}
        className="rtl:-scale-x-100"
        label={t('list.numbers')}
        pressed={list === 'number'}
        onPressedChange={(on) => change(listChange('number', on))}
      />
    </>
  );
}

/** The level, the bullet and the marker colour of the list items in the target. */
function ListOptions({ text }: { text: Text }) {
  const { t } = useTranslation('text');
  const change = useChange(text);
  const tx = useGestureTx();
  const { list, glyph, listColor } = text.format;
  const none = list === null;
  const [custom, setCustom] = useState<string | null>(null);
  const colorSlot = useRef<HTMLSpanElement>(null);
  const glyphValue = orNull(glyph);
  const setGlyph = (next: string | null) => change(listStyleChange({ glyph: next }));

  return (
    <>
      <Row label={t('list.level')}>
        <IconButton
          size="sm"
          icon={ListIndentDecrease}
          mirror
          label={t('list.outdent')}
          shortcut="Shift+Tab"
          disabled={none}
          onClick={() => change(levelChange(-1))}
          onMouseDown={keepFocus}
        />
        <IconButton
          size="sm"
          icon={ListIndentIncrease}
          mirror
          label={t('list.indent')}
          shortcut="Tab"
          disabled={none}
          onClick={() => change(levelChange(1))}
          onMouseDown={keepFocus}
        />
      </Row>
      {list !== 'number' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ui-fg-muted">{t('list.glyph')}</span>
          <div className="flex items-center gap-0.5">
            {GLYPHS.map((choice, i) => {
              // The first choice is the standard bullet: no glyph of its own.
              const value = i === 0 ? null : choice;
              return (
                <button
                  key={choice}
                  type="button"
                  aria-label={i === 0 ? t('list.glyphDefault') : choice}
                  aria-pressed={!none && !isMixed(glyph) && glyph === value}
                  disabled={none}
                  onMouseDown={keepFocus}
                  onClick={() => setGlyph(value)}
                  className={cx(
                    'inline-flex size-control-sm shrink-0 cursor-default items-center justify-center rounded-control text-md text-ui-fg transition-colors select-none',
                    'hover:bg-ui-hover active:bg-ui-pressed disabled:pointer-events-none disabled:text-ui-fg-subtle',
                    'aria-pressed:bg-ui-accent-soft aria-pressed:text-ui-accent-fg',
                  )}
                >
                  {choice}
                </button>
              );
            })}
            <Input
              aria-label={t('list.glyphCustom')}
              placeholder={t('list.glyphOther')}
              className="ms-1.5 h-control-sm min-w-0 flex-1"
              maxLength={3}
              disabled={none}
              value={custom ?? (glyphValue && !GLYPHS.includes(glyphValue) ? glyphValue : '')}
              onChange={(event) => setCustom(event.target.value)}
              onBlur={() => {
                if (custom === null) return;
                const next = custom.trim();
                setCustom(null);
                if (next !== (glyphValue ?? '')) setGlyph(next || null);
              }}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
          </div>
        </div>
      )}
      <Row label={t('list.color')}>
        <span ref={colorSlot} className="inline-flex size-control-sm">
          {!none && (
            <ColorField
              size="sm"
              label={t('list.color')}
              value={orNull(listColor)}
              mixed={isMixed(listColor)}
              allowNone
              onChange={(next) => {
                change(listStyleChange({ color: next }), tx.id());
                if (next === null) tx.end();
              }}
              onGestureEnd={tx.end}
              onCloseAutoFocus={(event) => {
                tx.end();
                // Back to the popover this sits in, not to the swatch: a focused swatch shows its
                // tooltip, and the next Esc would close that instead of the popover.
                event.preventDefault();
                colorSlot.current?.closest<HTMLElement>('[role="dialog"]')?.focus();
              }}
            />
          )}
        </span>
      </Row>
    </>
  );
}

/** Bullets, numbers and a popover of list options; all of it in one popover when the row is tight. */
export function ListTool() {
  const { t } = useTranslation('text');
  const compact = useCompact();
  const text = useText();
  if (!text) return null;
  if (compact) {
    return (
      <PopoverTool label={t('list.label')} icon={List} mirror>
        <Row label={t('list.label')}>
          <ListToggles text={text} />
        </Row>
        <ListOptions text={text} />
      </PopoverTool>
    );
  }
  return (
    <>
      <ListToggles text={text} />
      <PopoverTool label={t('list.options')} icon={ChevronDown}>
        <ListOptions text={text} />
      </PopoverTool>
    </>
  );
}

/* ---------------------------------------------------------------- spacing */

/** Line height, space around the paragraph and the first-line indent, in a popover. */
export function SpacingTool() {
  const { t } = useTranslation('text');
  const text = useText();
  const setParagraph = useSetParagraph(text);
  const burst = useBurstTx();
  if (!text) return null;
  const { format } = text;
  return (
    <PopoverTool label={t('spacing.label')} icon={ListChevronsUpDown} mirror>
      <Row label={t('spacing.lineHeight')}>
        <NumberField
          size="sm"
          aria-label={t('spacing.lineHeight')}
          className="w-20"
          value={orNull(format.lineHeight)}
          placeholder="–"
          min={0.5}
          max={5}
          step={0.05}
          precision={2}
          onValueChange={(lineHeight) => setParagraph({ lineHeight }, burst('lineHeight'))}
        />
      </Row>
      <Row label={t('spacing.before')}>
        <NumberField
          size="sm"
          aria-label={t('spacing.before')}
          className="w-20"
          unit="px"
          value={orNull(format.spaceBefore)}
          placeholder="–"
          min={0}
          max={500}
          step={2}
          onValueChange={(next) =>
            setParagraph({ spaceBefore: next || null }, burst('spaceBefore'))
          }
        />
      </Row>
      <Row label={t('spacing.after')}>
        <NumberField
          size="sm"
          aria-label={t('spacing.after')}
          className="w-20"
          unit="px"
          value={orNull(format.spaceAfter)}
          placeholder="–"
          min={0}
          max={500}
          step={2}
          onValueChange={(next) => setParagraph({ spaceAfter: next || null }, burst('spaceAfter'))}
        />
      </Row>
      <Row label={t('spacing.indent')}>
        <NumberField
          size="sm"
          aria-label={t('spacing.indent')}
          className="w-20"
          unit="px"
          value={orNull(format.indent)}
          placeholder="–"
          min={-500}
          max={500}
          step={4}
          onValueChange={(next) => setParagraph({ indent: next || null }, burst('indent'))}
        />
      </Row>
    </PopoverTool>
  );
}
