import { TextStyleRef, type ColorToken, type FontPair, type TextStyle } from '@slidr/model';
import { fontStack } from '@slidr/renderer';
import { deckFooter, footerLayouts, slideNumberHidden, slideNumberLayouts } from '@slidr/templates';
import {
  Button,
  Checkbox,
  ColorPicker,
  cx,
  Field,
  Icon,
  IconButton,
  Input,
  NumberField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  Tooltip,
} from '@slidr/ui';
import { ChevronDown, Eye, EyeOff, ImageUp } from '@slidr/ui/icons';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontField, useGestureTx } from '../controls';
import { IMAGE_FILES, pickFiles } from '../objects/insert';
import { useAssetResolver, useDeck, useEditor } from '../shell';
import {
  logoAsset,
  logoHidden,
  logoLayouts,
  saveAsTemplate,
  setFooter,
  setLogo,
  setThemeFont,
  showLogo,
  showNumber,
} from './actions';
import { library } from './app';
import { ChartPalette } from './ThemeLook';

/*
 * The design of the open deck (THM-04, THM-05), each part a page of the deck's properties
 * (`./DeckProperties`): the theme's colours and chart palette, its fonts and text styles, the
 * slide's number and footer, the logo of its layouts, and saving all of it as a personal
 * template. Every edit is a command of the catalogue on the open deck, so undo works as
 * everywhere, and the slide beside the pages shows it.
 */

const COLOR_TOKENS: readonly ColorToken[] = [
  'bg',
  'surface',
  'text',
  'muted',
  'primary',
  'secondary',
  'accent',
];
const WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'] as const;

function ThemeColor({ token }: { token: ColorToken }) {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const value = useDeck((s) => s.deck.theme.colors[token]);
  const tx = useGestureTx();
  const label = t(`colors.${token}`);
  return (
    <Popover>
      <Tooltip content={label}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-theme-color={token}
            className="flex min-w-0 cursor-default flex-col gap-1.5 rounded-control p-1 text-xs text-ui-fg-muted transition-colors hover:bg-ui-hover hover:text-ui-fg data-[state=open]:bg-ui-hover data-[state=open]:text-ui-fg"
          >
            {/* The deck's own colour, as it is on a slide. */}
            <span
              aria-hidden
              style={{ background: value }}
              className="block h-10 w-full rounded-inset border border-ui-line-strong"
            />
            <span className="w-full truncate text-center">{label}</span>
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        <ColorPicker
          value={value}
          labels={{
            area: t('colors.area'),
            hue: t('colors.hue'),
            alpha: t('colors.alpha'),
            hex: t('colors.hex'),
            eyedropper: t('colors.eyedropper'),
            none: t('colors.none'),
            recent: t('colors.recent'),
          }}
          onChange={(hex) =>
            editor.bus.dispatch(
              { type: 'theme.update', patch: { colors: { [token]: hex } } },
              { txId: tx.id(), label: t('undo.color') },
            )
          }
          onGestureEnd={tx.end}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The theme's colours, each beside its name, and the palette of its charts. */
export function ThemeColors() {
  return (
    <>
      <div className="-mx-1 grid grid-cols-4 gap-x-1 gap-y-2">
        {COLOR_TOKENS.map((token) => (
          <ThemeColor key={token} token={token} />
        ))}
      </div>
      <ChartPalette />
    </>
  );
}

/** The size the sample of a font pair is written in, in px. */
const FONT_SAMPLE = 26;

/** The fonts of the titles and of the body, each in Hebrew and in Latin letters. */
export function ThemeFonts() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const fonts = useDeck((s) => s.deck.theme.fonts);
  const styles = useDeck((s) => s.deck.theme.textStyles);
  const set = (role: 'heading' | 'body', pair: FontPair) =>
    setThemeFont(editor, role, pair, t('undo.font'));
  // Each pair in the weight of the style that is read most in it.
  const weights = { heading: styles.title.weight, body: styles.body.weight };
  return (
    <>
      {(['heading', 'body'] as const).map((role) => (
        <div key={role} className="flex flex-col gap-2.5 rounded-control bg-ui-field p-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-medium text-ui-fg-muted">{t(`fonts.${role}`)}</span>
            <span
              aria-hidden
              style={{
                fontFamily: fontStack(fonts[role]),
                fontWeight: weights[role],
                fontSize: FONT_SAMPLE,
              }}
              className="truncate leading-snug text-ui-fg"
            >
              {t('fonts.sample')}
            </span>
          </div>
          {/* Side by side where a family's whole name fits in half the width. */}
          <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
            {(['he', 'latin'] as const).map((script) => (
              <div key={script} className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-ui-fg-muted">{t(`fonts.${script}`)}</span>
                <FontField
                  label={t(`fonts.${role}${script === 'he' ? 'He' : 'Latin'}`)}
                  value={fonts[role][script]}
                  className="w-full border border-ui-line-strong bg-ui-panel"
                  onChange={(family) => set(role, { ...fonts[role], [script]: family })}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** The sizes a style's name is written in, in px: the smallest, the largest, and the slope between. */
const SPECIMEN = { min: 13, max: 30, base: 12, perSlidePixel: 0.16 };

/** A size on the slide as the size of its specimen: 22 to 112 slide pixels are 14 to 28 here. */
function specimenSize(size: number): number {
  const { min, max, base, perSlidePixel } = SPECIMEN;
  return Math.round(Math.min(max, Math.max(min, base + (size - base) * perSlidePixel)));
}

/** The text styles of the theme, a row each, which opens on the fields that change it. */
export function ThemeTextStyles() {
  /** The style whose fields are open. */
  const [open, setOpen] = useState<TextStyleRef | null>(null);
  return (
    <div className="flex flex-col overflow-hidden rounded-panel border border-ui-line">
      {TextStyleRef.options.map((ref) => (
        <TextStyleRow
          key={ref}
          styleRef={ref}
          open={open === ref}
          onToggle={() => setOpen(open === ref ? null : ref)}
        />
      ))}
    </div>
  );
}

/**
 * One text style: its name written in the style's own font and weight, with its size beside it,
 * and under it, once opened, the fields that change it.
 */
function TextStyleRow({
  styleRef: ref,
  open,
  onToggle,
}: {
  styleRef: TextStyleRef;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const style = useDeck((s) => s.deck.theme.textStyles[ref]);
  const family = useDeck((s) => fontStack(s.deck.theme.fonts[style.font]));
  const fields = useId();
  const set = (patch: Partial<TextStyle>) => {
    const next = { ...style, ...patch };
    // No spacing is stored as none, as the templates have it.
    if (!next.letterSpacing) delete next.letterSpacing;
    editor.bus.dispatch(
      { type: 'theme.update', patch: { textStyles: { [ref]: next } } },
      { label: t('undo.style') },
    );
  };
  // `title` is also the key of the section's own heading.
  const name = t(ref === 'title' ? 'styles.title_' : `styles.${ref}`);
  const weight = WEIGHTS.find((w) => w === String(Math.round(style.weight / 100) * 100)) ?? null;
  return (
    <div
      data-text-style={ref}
      className={cx('border-t border-ui-line first:border-t-0', open && 'bg-ui-chrome')}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? fields : undefined}
        onClick={onToggle}
        className="flex h-14 w-full cursor-default items-center gap-3 px-4 text-start transition-colors hover:bg-ui-hover active:bg-ui-pressed focus-visible:-outline-offset-2"
      >
        <span
          style={{
            fontFamily: family,
            fontWeight: style.weight,
            fontSize: specimenSize(style.size),
          }}
          // The name, drawn in the style, is the sample: it keeps its width, and where a
          // translation leaves too little room the size and weight beside it give way.
          className="flex-none leading-snug text-ui-fg"
        >
          {name}
        </span>
        <span className="min-w-0 flex-1 truncate text-end text-xs text-ui-fg-muted tabular-nums">
          {style.size} · {weight ? t(`styles.weight${weight}`) : style.weight}
        </span>
        <Icon
          icon={ChevronDown}
          className={cx('text-ui-fg-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        // Two by two in a narrow panel; in a wide one a single row, where the weight, the one
        // field that holds words, takes what the numbers leave.
        <div id={fields} className="grid grid-cols-2 gap-3 px-4 pt-1 pb-4 @lg:flex">
          <Field label={t('styles.sizeShort')} className="@lg:w-20">
            <NumberField
              aria-label={t('styles.size', { style: name })}
              size="sm"
              value={style.size}
              min={12}
              max={400}
              step={1}
              onValueChange={(size) => set({ size })}
            />
          </Field>
          <Field label={t('styles.weightShort')} className="@lg:flex-1">
            <Select
              aria-label={t('styles.weight', { style: name })}
              size="sm"
              className="w-full"
              value={weight}
              onValueChange={(next) => set({ weight: Number(next) })}
              options={WEIGHTS.map((w) => ({ value: w, label: t(`styles.weight${w}`) }))}
            />
          </Field>
          <Field label={t('styles.lineHeightShort')} className="@lg:w-20">
            <NumberField
              aria-label={t('styles.lineHeight', { style: name })}
              size="sm"
              value={style.lineHeight}
              min={0.8}
              max={3}
              step={0.05}
              precision={2}
              onValueChange={(lineHeight) => set({ lineHeight })}
            />
          </Field>
          <Field label={t('styles.letterSpacingShort')} className="@lg:w-24">
            <NumberField
              aria-label={t('styles.letterSpacing', { style: name })}
              size="sm"
              unit="px"
              value={style.letterSpacing ?? 0}
              min={-20}
              max={50}
              step={0.5}
              precision={1}
              onValueChange={(letterSpacing) => set({ letterSpacing })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/**
 * The master components beside the logo (SLD-04): the slide's number, which the layouts draw,
 * and the footer every slide shows. Both are of the open deck, like the rest of these pages.
 */
export function Master() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  const numbers = slideNumberLayouts(deck).length;
  const hidden = slideNumberHidden(deck);
  const seats = footerLayouts(deck).length;
  const footer = deckFooter(deck);
  return (
    <>
      <div className="flex items-center gap-2" data-testid="master-number">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm text-ui-fg">{t('master.number')}</span>
          <span className="text-xs text-ui-fg-muted">
            {numbers === 0
              ? t('master.numberNone')
              : t(hidden ? 'master.numberHidden' : 'master.numberShown')}
          </span>
        </div>
        {numbers > 0 && (
          <IconButton
            size="sm"
            icon={hidden ? Eye : EyeOff}
            label={t(hidden ? 'master.showNumber' : 'master.hideNumber')}
            onClick={() => showNumber(editor, hidden, t('undo.number'))}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-ui-fg">{t('master.footer')}</span>
        {/* Keyed by the deck's footer, so the field follows an undo or a switch of template. */}
        <FooterField key={footer} footer={footer} disabled={seats === 0} />
        <p className="text-xs text-ui-fg-muted">
          {t(seats === 0 ? 'master.footerNone' : 'master.footerHint')}
        </p>
      </div>
    </>
  );
}

/** The footer as it is typed; it goes to the deck when the field is left, or on Enter. */
function FooterField({ footer, disabled }: { footer: string; disabled: boolean }) {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const [draft, setDraft] = useState(footer);
  const commit = () => setFooter(editor, draft, t('undo.footer'));
  return (
    <Input
      aria-label={t('master.footer')}
      placeholder={t('master.footerPlaceholder')}
      value={draft}
      dir="auto"
      disabled={disabled}
      data-testid="master-footer"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

export function Logo() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  const resolveAsset = useAssetResolver();
  const [error, setError] = useState(false);
  const places = logoLayouts(deck).length;
  const asset = logoAsset(deck);
  const hidden = logoHidden(deck);
  const url = asset ? resolveAsset(asset) : undefined;

  const choose = async () => {
    const [file] = await pickFiles(IMAGE_FILES);
    if (!file) return;
    setError(false);
    try {
      await setLogo(editor, file, t('undo.logo'));
    } catch (failure) {
      console.error('The logo could not be stored', failure);
      setError(true);
    }
  };

  if (places === 0) {
    return <p className="text-xs text-ui-fg-muted">{t('logo.none')}</p>;
  }
  return (
    <>
      <div className="flex items-center gap-3">
        <div
          data-testid="logo-preview"
          className="flex h-12 w-24 shrink-0 items-center justify-center rounded-control border border-ui-line bg-ui-field p-1.5"
        >
          {url && !hidden ? (
            <img src={url} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-ui-fg-muted">
              {t(hidden ? 'logo.hidden' : 'logo.mark')}
            </span>
          )}
        </div>
        <Button size="sm" icon={ImageUp} onClick={() => void choose()} data-testid="logo-choose">
          {t(asset ? 'logo.replace' : 'logo.choose')}
        </Button>
        <IconButton
          size="sm"
          icon={hidden ? Eye : EyeOff}
          label={t(hidden ? 'logo.show' : 'logo.hide')}
          onClick={() => showLogo(editor, hidden, t('undo.logo'))}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-ui-danger-fg">
          {t('logo.failed')}
        </p>
      )}
    </>
  );
}

export function SaveAsTemplate() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const [name, setName] = useState('');
  const [asDefault, setAsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const trimmed = name.trim();

  const save = async () => {
    if (!trimmed) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveAsTemplate(editor, library, trimmed, {
        setDefault: asDefault,
        label: t('undo.save'),
      });
      setMessage({ text: t('save.saved', { name: trimmed }), error: false });
      setName('');
    } catch (failure) {
      console.error('The template could not be saved', failure);
      setMessage({ text: t('save.failed'), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          aria-label={t('save.name')}
          placeholder={t('save.placeholder')}
          value={name}
          className="min-w-0 flex-1"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
          }}
        />
        <Button variant="primary" disabled={!trimmed} loading={busy} onClick={() => void save()}>
          {t('save.button')}
        </Button>
      </div>
      <Checkbox label={t('save.asDefault')} checked={asDefault} onCheckedChange={setAsDefault} />
      <p
        role={message?.error ? 'alert' : 'status'}
        className={cx('text-xs', message?.error ? 'text-ui-danger-fg' : 'text-ui-fg-muted')}
      >
        {message?.text ?? t('save.hint')}
      </p>
    </>
  );
}
