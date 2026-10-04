import type { TextStyleRef } from '@slidr/model';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Select,
} from '@slidr/ui';
import { Heading, PaintRoller } from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { applyStyle, updateStyle } from '../actions';
import { matchStyle, orNull } from '../format';
import { painter, pickUp, putDown } from '../painter';
import {
  closeToText,
  keepFocus,
  PICK_FORMAT_KEYS,
  Row,
  TextToggle,
  useCompact,
  useText,
  type Text,
} from './shared';

/* Row B for text: the format painter and the text styles (WG4-T08, T10; TXT-08, TXT-10). */

/**
 * The brush. A click picks up the format at the caret, or of the selected box, and the next text
 * selected or box clicked takes it; a double click keeps the brush in hand until Esc.
 */
export function PainterTool() {
  const { t } = useTranslation('text');
  const text = useText();
  const armed = useStore(painter, (s) => s.armed);
  if (!text) return null;
  return (
    <TextToggle
      icon={PaintRoller}
      label={t('painter')}
      shortcut={PICK_FORMAT_KEYS}
      pressed={armed}
      onPressedChange={(on) => (on ? pickUp(text.target) : putDown())}
      // Its second click put the brush down again; a double click means "keep it".
      onDoubleClick={() => pickUp(text.target, true)}
    />
  );
}

/* ---------------------------------------------------------------- text styles */

/** The text styles of a theme (SPEC 5.5), from the largest to the smallest. */
const STYLES: readonly TextStyleRef[] = ['display', 'title', 'heading', 'body', 'caption'];

/** The text style of the target, and the two things to do with it. */
function useStyle(text: Text) {
  const { t } = useTranslation('text');
  const { target, format, ctx } = text;
  const styleRef = orNull(format.styleRef);
  return {
    styleRef,
    options: STYLES.map((value) => ({ value, label: t(`style.${value}`) })),
    apply: (next: TextStyleRef) => applyStyle(target, next, { label: t('step.style') }),
    /** Whether the text differs from its style in anything a style holds. */
    canUpdate: styleRef !== null && matchStyle(format, ctx.theme.textStyles[styleRef]) !== null,
    update: () => {
      if (styleRef) updateStyle(target, ctx, styleRef, { label: t('step.styleUpdate') });
    },
  };
}

/**
 * The text style of the paragraphs, as a menu: it shows which style they have, gives them
 * another, and writes what the text has into the style itself. In the row when there is room;
 * otherwise in the "more" popover (`StyleRows`).
 */
export function StyleTool() {
  const compact = useCompact();
  const text = useText();
  if (!text || compact) return null;
  return <StyleMenu text={text} />;
}

function StyleMenu({ text }: { text: Text }) {
  const { t } = useTranslation('text');
  const { styleRef, options, apply, canUpdate, update } = useStyle(text);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          size="sm"
          icon={Heading}
          label={styleRef ? t('style.current', { name: t(`style.${styleRef}`) }) : t('style.label')}
          data-style={styleRef ?? 'mixed'}
          onMouseDown={keepFocus}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent onCloseAutoFocus={closeToText}>
        <DropdownMenuRadioGroup
          value={styleRef ?? ''}
          onValueChange={(next) => apply(next as TextStyleRef)}
        >
          {options.map(({ value, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canUpdate} onSelect={update} className="ps-8">
          {t('style.update')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The same, as rows of a popover: for the "more" popover of the compact layout. */
export function StyleRows({ text }: { text: Text }) {
  const { t } = useTranslation('text');
  const { styleRef, options, apply, canUpdate, update } = useStyle(text);
  return (
    <>
      <Row label={t('style.label')}>
        <Select<TextStyleRef>
          size="sm"
          aria-label={t('style.label')}
          className="w-36"
          options={options}
          value={styleRef}
          placeholder={t('mixed')}
          onValueChange={apply}
        />
      </Row>
      <Button
        variant="secondary"
        size="sm"
        disabled={!canUpdate}
        onMouseDown={keepFocus}
        onClick={update}
      >
        {t('style.update')}
      </Button>
    </>
  );
}
