import { ColorToken, type Color } from '@slidr/model';
import {
  ColorPicker,
  ColorSwatch,
  cx,
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  type LucideIcon,
} from '@slidr/ui';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeck } from '../shell';
import { colorToHex, pickedColor } from './colors';
import { rememberColor, useRecent } from './recent';

export interface ColorFieldProps {
  /** The colour; null for none. */
  value: Color | null;
  /** The selection has more than one colour; `value` is then ignored. */
  mixed?: boolean;
  /** Every change, also each step of a drag in the picker. Null is "no colour" (`allowNone`). */
  onChange: (color: Color | null) => void;
  /** A drag or an edit in the picker ended: close the undo step (see `useGestureTx`). */
  onGestureEnd?: () => void;
  /** The accessible name and the tooltip: "Text colour". */
  label: string;
  /** Drawn over a bar of the colour, as for text colour. Without it the button is a swatch. */
  icon?: LucideIcon;
  allowNone?: boolean;
  /** Offers the alpha slider. */
  alpha?: boolean;
  size?: 'sm' | 'md';
  /** Where the focus goes when the picker closes, e.g. back to the text editor. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * A colour in a toolbar or a panel: a button that opens the colour picker with the theme's
 * colours, the recent ones and the free picker (TXT-04, SHP-02). A colour picked from the theme
 * is stored as its token, so it follows the theme.
 */
export function ColorField({
  value,
  mixed = false,
  onChange,
  onGestureEnd,
  label,
  icon,
  allowNone = false,
  alpha = false,
  size = 'md',
  onCloseAutoFocus,
}: ColorFieldProps) {
  const { t } = useTranslation('controls');
  const theme = useDeck((s) => s.deck.theme);
  const recent = useRecent((s) => s.colors);
  const color = mixed ? null : value;
  const hex = color ? colorToHex(color, theme) : null;
  /** The free colour picked last in this gesture, to remember it when the gesture ends. */
  const picked = useRef<Color | null>(null);
  /**
   * The swatch's tooltip. When the picker closes the focus comes back to the swatch, and a
   * tooltip that opened on that focus took the next Esc for itself: the popover around the swatch
   * needed two (ADR-060). So it stays shut from then until the pointer or the focus moves on.
   */
  const [tip, setTip] = useState(false);
  const quiet = useRef(false);

  const groups = useMemo(
    () => [
      {
        label: t('color.theme'),
        choices: ColorToken.options.map((token) => ({
          id: token,
          label: t(`token.${token}`),
          color: theme.colors[token],
        })),
      },
    ],
    [t, theme],
  );

  return (
    <Popover>
      <Tooltip content={label} open={tip} onOpenChange={(open) => setTip(open && !quiet.current)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onPointerEnter={() => (quiet.current = false)}
            onPointerLeave={() => (quiet.current = false)}
            onBlur={() => (quiet.current = false)}
            className={cx(
              'inline-flex shrink-0 cursor-default flex-col items-center justify-center gap-0.5 rounded-control text-ui-fg-muted transition-colors select-none',
              'hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed data-[state=open]:bg-ui-hover data-[state=open]:text-ui-fg',
              size === 'md' ? 'size-control' : 'size-control-sm',
            )}
          >
            {icon ? (
              <>
                <Icon icon={icon} />
                <ColorSwatch color={hex} className="h-1.5 w-4" />
              </>
            ) : (
              <ColorSwatch color={hex} className="size-4.5" />
            )}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        onCloseAutoFocus={(event) => {
          quiet.current = true;
          onCloseAutoFocus?.(event);
        }}
        // The focus goes to the popover itself, not to its first swatch: a focused swatch shows
        // its tooltip at once, over the swatches under it. Tab still reaches everything.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <ColorPicker
          // A mixed selection has no colour to show; the picker starts from the theme's text colour.
          value={mixed ? colorToHex({ token: 'text' }, theme) : hex}
          choiceId={color && 'token' in color ? color.token : null}
          groups={groups}
          recent={recent}
          alpha={alpha}
          labels={{
            area: t('color.area'),
            hue: t('color.hue'),
            alpha: t('color.alpha'),
            hex: t('color.hex'),
            eyedropper: t('color.eyedropper'),
            none: t('color.none'),
            recent: t('color.recent'),
          }}
          onChange={(next) => {
            const nextColor = pickedColor(next, color, theme);
            picked.current = nextColor;
            onChange(nextColor);
          }}
          onChoice={(token) => {
            picked.current = null;
            onChange({ token: ColorToken.parse(token) });
          }}
          onNone={allowNone ? () => onChange(null) : undefined}
          onGestureEnd={() => {
            // Only free colours are worth remembering: the theme's are always on show.
            if (picked.current && 'value' in picked.current)
              rememberColor(colorToHex({ value: picked.current.value }, theme));
            picked.current = null;
            onGestureEnd?.();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
