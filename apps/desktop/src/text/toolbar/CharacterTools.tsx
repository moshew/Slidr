import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
  IconButton,
  NumberField,
  Select,
} from '@slidr/ui';
import {
  Baseline,
  Bold,
  CaseLower,
  CaseUpper,
  ChevronDown,
  Ellipsis,
  Highlighter,
  Italic,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from '@slidr/ui/icons';
import { useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorField, FontField, useGestureTx } from '../../controls';
import { changeMarks, clearFormatting, toggleBold, toggleMark } from '../actions';
import { isMixed, orNull, patchMarks, type MarksPatch } from '../format';
import {
  CLEAR_KEYS,
  closeToText,
  keepFocus,
  PopoverTool,
  returnFocus,
  Row,
  TextToggle,
  useBurstTx,
  useCompact,
  useMeasuredDensity,
  useText,
  type Text,
} from './shared';

/* Row B for text, the character tools (WG4-T03): font, size, weight, B / I / U, more, colours. */

/** Sets marks on the target, as one undo step named "Format text". */
function useSetMarks(text: Text | null): (patch: MarksPatch, txId?: string) => void {
  const { t } = useTranslation('text');
  return (patch, txId) => {
    if (text) changeMarks(text.target, patchMarks(patch), { txId, label: t('step.format') });
  };
}

/* ---------------------------------------------------------------- font, size, weight */

export function FontTool() {
  const { t } = useTranslation('text');
  const anchor = useRef<HTMLSpanElement>(null);
  useMeasuredDensity(anchor);
  const compact = useCompact();
  const text = useText();
  const setMarks = useSetMarks(text);
  const font = text?.format.font;
  const family = font === undefined || isMixed(font) ? null : font;
  return (
    <span ref={anchor} className="inline-flex">
      {text && (
        <FontField
          size="sm"
          label={t('font')}
          // A font that comes from the text style is shown, but it is not a choice of this text.
          value={text.format.fontFromStyle ? null : family}
          fallback={family ?? undefined}
          mixed={font !== undefined && isMixed(font)}
          className={compact ? 'w-24' : 'w-32'}
          onChange={(next) => setMarks({ font: next })}
          onCloseAutoFocus={closeToText}
        />
      )}
    </span>
  );
}

/** Slide pixels (SPEC 5.1): the body text of the basic theme is 30. */
const SIZES = [16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 112, 144];

export function SizeTool() {
  const { t } = useTranslation('text');
  const compact = useCompact();
  const text = useText();
  const setMarks = useSetMarks(text);
  const burst = useBurstTx();
  if (!text) return null;
  const size = orNull(text.format.size);
  const setSize = (next: number) => setMarks({ size: next }, burst());

  // Enter commits the number and goes back to the text; so does Esc, without committing.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    // The key is done here: moving the focus must not hand the rest of it (the line break that
    // Enter types) to the text editor.
    event.preventDefault();
    returnFocus();
  };

  return (
    <span className="inline-flex" onKeyDown={onKeyDown}>
      <NumberField
        size="sm"
        aria-label={t('size')}
        className={compact ? 'w-16' : 'w-18'}
        value={size}
        placeholder="–"
        min={1}
        max={999}
        precision={1}
        onValueChange={setSize}
        end={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('sizePresets')}
                onMouseDown={keepFocus}
                className="-me-1 inline-flex h-6 w-4 shrink-0 cursor-default items-center justify-center rounded-small text-ui-fg-muted transition-colors hover:bg-ui-hover hover:text-ui-fg data-[state=open]:bg-ui-hover"
              >
                <Icon icon={ChevronDown} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={closeToText}>
              <DropdownMenuRadioGroup
                value={size === null ? '' : String(size)}
                onValueChange={(next) => setSize(Number(next))}
              >
                {SIZES.map((preset) => (
                  <DropdownMenuRadioItem key={preset} value={String(preset)}>
                    <span dir="ltr" className="tabular-nums">
                      {preset}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </span>
  );
}

const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;
type WeightName = (typeof WEIGHTS)[number];

/** The weight as a named choice. A weight between the names (a variable font) shows as its number. */
function WeightSelect({
  text,
  variant,
  className,
}: {
  text: Text;
  variant: 'field' | 'ghost';
  className: string;
}) {
  const { t } = useTranslation('text');
  const setMarks = useSetMarks(text);
  const weight = orNull(text.format.weight);
  const name = WEIGHTS.find((w) => Number(w) === weight) ?? null;
  return (
    <Select<WeightName>
      variant={variant}
      size="sm"
      aria-label={t('weight')}
      className={className}
      options={WEIGHTS.map((value) => ({ value, label: t(`weights.${value}`) }))}
      value={name}
      placeholder={weight === null ? t('mixed') : String(weight)}
      onValueChange={(next) => setMarks({ weight: Number(next) })}
    />
  );
}

/**
 * The select hands the focus back to its own button when it closes, and has no hook to say
 * otherwise. Focus that arrives from nowhere is that hand-back, and goes on to the text; focus
 * that arrives from another control (Tab) stays.
 */
function onSelectFocus(event: FocusEvent): void {
  if (event.relatedTarget === null && event.target.getAttribute('role') === 'combobox')
    returnFocus();
}

/** In the row when there is room; otherwise in the "more" popover. */
export function WeightTool() {
  const compact = useCompact();
  const text = useText();
  if (!text || compact) return null;
  return (
    <span className="inline-flex" onFocus={onSelectFocus}>
      <WeightSelect text={text} variant="ghost" className="w-24" />
    </span>
  );
}

/* ---------------------------------------------------------------- B, I, U, more */

export function BoldTool() {
  const { t } = useTranslation('text');
  const text = useText();
  return (
    <TextToggle
      icon={Bold}
      label={t('bold')}
      shortcut="Ctrl+B"
      disabled={!text}
      pressed={text?.format.bold ?? false}
      onPressedChange={() => text && toggleBold(text.target, text.ctx, { label: t('step.format') })}
    />
  );
}

export function ItalicTool() {
  const { t } = useTranslation('text');
  const text = useText();
  return (
    <TextToggle
      icon={Italic}
      label={t('italic')}
      shortcut="Ctrl+I"
      disabled={!text}
      pressed={text?.format.italic ?? false}
      onPressedChange={() =>
        text && toggleMark(text.target, text.ctx, 'italic', { label: t('step.format') })
      }
    />
  );
}

export function UnderlineTool() {
  const { t } = useTranslation('text');
  const text = useText();
  return (
    <TextToggle
      icon={Underline}
      label={t('underline')}
      shortcut="Ctrl+U"
      disabled={!text}
      pressed={text?.format.underline ?? false}
      onPressedChange={() =>
        text && toggleMark(text.target, text.ctx, 'underline', { label: t('step.format') })
      }
    />
  );
}

/** Strikethrough, super / subscript, case and letter spacing; and the weight when the row is tight. */
export function MoreTool() {
  const { t } = useTranslation('text');
  const compact = useCompact();
  const text = useText();
  const setMarks = useSetMarks(text);
  const burst = useBurstTx();
  if (!text) return null;
  const { format } = text;
  return (
    <PopoverTool label={t('more')} icon={Ellipsis}>
      <div className="flex items-center gap-0.5">
        <TextToggle
          icon={Strikethrough}
          label={t('strike')}
          pressed={format.strike}
          onPressedChange={() =>
            toggleMark(text.target, text.ctx, 'strike', { label: t('step.format') })
          }
        />
        <TextToggle
          icon={Superscript}
          label={t('superscript')}
          pressed={format.script === 'sup'}
          onPressedChange={(on) => setMarks({ script: on ? 'sup' : null })}
        />
        <TextToggle
          icon={Subscript}
          label={t('subscript')}
          pressed={format.script === 'sub'}
          onPressedChange={(on) => setMarks({ script: on ? 'sub' : null })}
        />
        <TextToggle
          icon={CaseUpper}
          label={t('uppercase')}
          pressed={format.case === 'upper'}
          onPressedChange={(on) => setMarks({ case: on ? 'upper' : null })}
        />
        <TextToggle
          icon={CaseLower}
          label={t('lowercase')}
          pressed={format.case === 'lower'}
          onPressedChange={(on) => setMarks({ case: on ? 'lower' : null })}
        />
        <IconButton
          size="sm"
          icon={RemoveFormatting}
          label={t('clear')}
          shortcut={CLEAR_KEYS}
          className="ms-auto"
          onMouseDown={keepFocus}
          onClick={() => clearFormatting(text.target, { label: t('step.clear') })}
        />
      </div>
      <Row label={t('letterSpacing')}>
        <NumberField
          size="sm"
          aria-label={t('letterSpacing')}
          className="w-20"
          unit="px"
          value={orNull(format.letterSpacing)}
          placeholder="–"
          min={-50}
          max={200}
          step={0.5}
          precision={1}
          // No spacing is the text style's own: the mark goes, rather than staying as a zero.
          onValueChange={(next) => setMarks({ letterSpacing: next === 0 ? null : next }, burst())}
        />
      </Row>
      {compact && (
        <Row label={t('weight')}>
          <WeightSelect text={text} variant="field" className="w-36" />
        </Row>
      )}
    </PopoverTool>
  );
}

/* ---------------------------------------------------------------- colours */

export function ColorTool() {
  const { t } = useTranslation('text');
  const text = useText();
  const setMarks = useSetMarks(text);
  const tx = useGestureTx();
  if (!text) return null;
  const { color } = text.format;
  return (
    <ColorField
      size="sm"
      icon={Baseline}
      label={t('color')}
      value={orNull(color)}
      mixed={isMixed(color)}
      onChange={(next) => next && setMarks({ color: next }, tx.id())}
      onGestureEnd={tx.end}
      onCloseAutoFocus={(event) => {
        tx.end();
        closeToText(event);
      }}
    />
  );
}

export function HighlightTool() {
  const { t } = useTranslation('text');
  const text = useText();
  const setMarks = useSetMarks(text);
  const tx = useGestureTx();
  if (!text) return null;
  const { highlight } = text.format;
  return (
    <ColorField
      size="sm"
      icon={Highlighter}
      label={t('highlight')}
      value={orNull(highlight)}
      mixed={isMixed(highlight)}
      allowNone
      alpha
      onChange={(next) => {
        setMarks({ highlight: next }, tx.id());
        // "No colour" is a click, not a drag: the picker reports no end for it.
        if (next === null) tx.end();
      }}
      onGestureEnd={tx.end}
      onCloseAutoFocus={(event) => {
        tx.end();
        closeToText(event);
      }}
    />
  );
}
