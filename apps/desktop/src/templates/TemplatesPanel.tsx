import { TextStyleRef, type ColorToken, type FontPair, type TextStyle } from '@slidr/model';
import { fontStack, ScaledSlide } from '@slidr/renderer';
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
  SegmentedControl,
  Select,
  Separator,
  Toggle,
  Tooltip,
  type LucideIcon,
} from '@slidr/ui';
import {
  ALargeSmall,
  ArrowLeftRight,
  BookmarkPlus,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Hash,
  ImageUp,
  Palette,
  Pencil,
  RefreshCw,
  SquareRoundCorner,
  Stamp,
  Star,
  Trash2,
  Type,
  Wallpaper,
} from '@slidr/ui/icons';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { FontField, useGestureTx } from '../controls';
import { IMAGE_FILES, pickFiles } from '../objects/insert';
import { ask, useAssetResolver, useDeck, useEditor, useElementSize } from '../shell';
import {
  applyLibraryTemplate,
  logoAsset,
  logoHidden,
  logoLayouts,
  renameTemplate,
  saveAsTemplate,
  setFooter,
  setLogo,
  setThemeFont,
  showLogo,
  showNumber,
  turnDeck,
  updateTemplate,
} from './actions';
import { library } from './app';
import { coverAsset, coverOf } from './covers';
import type { LibraryEntry } from './library';
import { BackgroundFields, ChartPalette, ShapeFields } from './ThemeLook';

/*
 * The Templates panel (WG7-T09 and the wiring of T04; THM-04, THM-05, THM-08): the library with
 * the default for new decks, and the design of the open deck: its direction, the theme's
 * colours and chart palette, fonts, text styles, corners, shadow and backgrounds, the logo of its
 * layouts, and saving all of it as a personal template. Every edit is a command of the catalogue on the open deck, so the slides on the
 * Stage are the preview and undo works as everywhere.
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
/** Space between the two columns of template cards, in px: `gap-3`. */
const CARD_GAP = 12;

/** The library: a heading over the cards of the templates. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ui-fg">{title}</h3>
      {children}
    </section>
  );
}

type Tone = 'violet' | 'blue' | 'pink' | 'teal' | 'green' | 'orange' | 'rose';

/** The colours of a part's mark: those of the creation tools. */
const TONES: Record<Tone, string> = {
  violet: 'bg-ui-tool-violet text-ui-tool-violet-fg',
  blue: 'bg-ui-tool-blue text-ui-tool-blue-fg',
  pink: 'bg-ui-tool-pink text-ui-tool-pink-fg',
  teal: 'bg-ui-tool-teal text-ui-tool-teal-fg',
  green: 'bg-ui-tool-green text-ui-tool-green-fg',
  orange: 'bg-ui-tool-orange text-ui-tool-orange-fg',
  rose: 'bg-ui-tool-rose text-ui-tool-rose-fg',
};

/**
 * One part of the deck's design: a card under its name and a mark in the part's own colour.
 * `flush` leaves the sides to the content, for rows that reach the card's edges; `accent` is
 * for the one part that is an action and not a setting.
 */
function Part({
  title,
  icon,
  tone = 'violet',
  flush = false,
  accent = false,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone?: Tone;
  flush?: boolean;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cx(
        'flex flex-col overflow-hidden rounded-panel border',
        accent ? 'border-transparent bg-ui-accent-soft' : 'border-ui-line',
      )}
    >
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <span
          aria-hidden
          className={cx(
            'flex size-control-sm shrink-0 items-center justify-center rounded-inset',
            accent ? 'bg-ui-accent text-ui-on-accent' : TONES[tone],
          )}
        >
          <Icon icon={icon} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-ui-fg">{title}</h3>
      </div>
      <div className={cx('flex flex-col gap-3', !flush && 'px-4 pb-4')}>{children}</div>
    </section>
  );
}

function TemplateCard({
  entry,
  width,
  current,
  isDefault,
}: {
  entry: LibraryEntry;
  width: number;
  current: boolean;
  isDefault: boolean;
}) {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const like = useDeck((s) => s.deck);
  const { template, personal } = entry;
  const { theme } = template;
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // The cover follows the deck's direction and language, not every edit of the deck.
  const cover = useMemo(
    () => coverOf(library.forDeck(theme.id, like.meta.lang) ?? template, like),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, theme.id, like.meta.lang, like.meta.dir],
  );

  const apply = async () => {
    setBusy(true);
    try {
      await applyLibraryTemplate(editor, library, theme.id, t('undo.apply'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const answer = await ask({
      title: t('panel.removeTitle', { name: theme.name }),
      body: t('panel.removeBody'),
      actions: [
        { id: 'cancel', label: t('panel.cancel'), variant: 'ghost' },
        { id: 'remove', label: t('panel.removeConfirm'), variant: 'danger' },
      ],
      cancelId: 'cancel',
    });
    if (answer === 'remove') await library.remove(theme.id);
  };
  const rename = async (name: string) => {
    setRenaming(false);
    await renameTemplate(library, theme.id, name);
  };
  const update = async () => {
    const answer = await ask({
      title: t('panel.updateTitle', { name: theme.name }),
      body: t('panel.updateBody'),
      actions: [
        { id: 'cancel', label: t('panel.cancel'), variant: 'ghost' },
        { id: 'update', label: t('panel.updateConfirm'), variant: 'primary' },
      ],
      cancelId: 'cancel',
    });
    if (answer !== 'update') return;
    setBusy(true);
    try {
      await updateTemplate(editor, library, theme.id, t('undo.save'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      data-template={theme.id}
      data-current={current || undefined}
      className={cx(
        'flex min-w-0 flex-col gap-2 rounded-panel border p-2',
        current ? 'border-ui-accent bg-ui-accent-soft' : 'border-ui-line',
      )}
    >
      {/* A picture of the cover: a screen reader is told the template's name, not its words. */}
      <div aria-hidden className="overflow-hidden rounded-inset">
        {width > 0 && (
          <ScaledSlide
            deck={cover.deck}
            slide={cover.slide}
            mode="thumbnail"
            width={width}
            resolveAsset={coverAsset}
          />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {renaming ? (
            <Input
              aria-label={t('panel.renameField')}
              defaultValue={theme.name}
              dir="auto"
              autoFocus
              onBlur={(event) => void rename(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') setRenaming(false);
              }}
            />
          ) : (
            <span className="truncate text-sm font-medium text-ui-fg" dir="auto">
              {theme.name}
            </span>
          )}
          <span className="truncate text-xs text-ui-fg-muted">
            {isDefault ? t('panel.defaultBadge') : t(personal ? 'panel.personal' : 'panel.builtIn')}
          </span>
        </div>
        <Toggle
          icon={Star}
          size="sm"
          label={t(isDefault ? 'panel.isDefault' : 'panel.makeDefault')}
          pressed={isDefault}
          onPressedChange={(pressed) => library.setDefault(pressed ? theme.id : null)}
        />
      </div>
      {personal && (
        // A personal template is the user's own: its name, what it holds, and whether it stays.
        <div className="flex items-center justify-end gap-1" data-testid="template-actions">
          <IconButton
            icon={Pencil}
            size="sm"
            label={t('panel.rename')}
            onClick={() => setRenaming(true)}
          />
          <IconButton
            icon={RefreshCw}
            size="sm"
            label={t('panel.update')}
            disabled={busy}
            onClick={() => void update()}
          />
          <IconButton
            icon={Trash2}
            size="sm"
            label={t('panel.remove')}
            onClick={() => void remove()}
          />
        </div>
      )}
      <Button
        size="sm"
        variant={current ? 'ghost' : 'secondary'}
        icon={current ? Check : undefined}
        disabled={current}
        loading={busy}
        onClick={() => void apply()}
      >
        {t(current ? 'panel.current' : 'panel.apply')}
      </Button>
    </article>
  );
}

function Library() {
  const { t } = useTranslation('templates');
  const { personal, defaultId, loaded } = useStore(library.state);
  const themeId = useDeck((s) => s.deck.theme.id);
  const grid = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(grid);
  // Two cards to a row; a card has a border and padding of 9px on each side.
  const thumb = Math.max(0, Math.floor((width - CARD_GAP) / 2) - 18);
  const entries = useMemo(
    () => library.entries(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal],
  );
  return (
    <Section title={t('panel.library')}>
      <div ref={grid} className="grid grid-cols-2 gap-3" data-testid="template-library">
        {entries.map((entry) => (
          <TemplateCard
            key={entry.template.theme.id}
            entry={entry}
            width={thumb}
            current={entry.template.theme.id === themeId}
            isDefault={entry.template.theme.id === defaultId}
          />
        ))}
      </div>
      <p className="text-xs text-ui-fg-muted">
        {loaded ? (defaultId ? null : t('panel.noDefault')) : t('panel.loading')}
      </p>
    </Section>
  );
}

function DirectionField() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const dir = useDeck((s) => s.deck.meta.dir);
  return (
    <Part title={t('direction.title')} icon={ArrowLeftRight} tone="teal">
      <SegmentedControl<'rtl' | 'ltr'>
        aria-label={t('direction.title')}
        fill
        value={dir}
        onValueChange={(next) => turnDeck(editor, library, next, t('undo.direction'))}
        options={[
          { value: 'rtl', label: t('direction.rtl') },
          { value: 'ltr', label: t('direction.ltr') },
        ]}
      />
      <p className="text-xs text-ui-fg-muted">{t('direction.hint')}</p>
    </Part>
  );
}

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

function ThemeColors() {
  const { t } = useTranslation('templates');
  return (
    <Part title={t('colors.title')} icon={Palette} tone="pink">
      <div className="-mx-1 grid grid-cols-4 gap-x-1 gap-y-2">
        {COLOR_TOKENS.map((token) => (
          <ThemeColor key={token} token={token} />
        ))}
      </div>
      <ChartPalette />
    </Part>
  );
}

/** The size the sample of a font pair is written in, in px. */
const FONT_SAMPLE = 26;

function ThemeFonts() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const fonts = useDeck((s) => s.deck.theme.fonts);
  const styles = useDeck((s) => s.deck.theme.textStyles);
  const set = (role: 'heading' | 'body', pair: FontPair) =>
    setThemeFont(editor, role, pair, t('undo.font'));
  // Each pair in the weight of the style that is read most in it.
  const weights = { heading: styles.title.weight, body: styles.body.weight };
  return (
    <Part title={t('fonts.title')} icon={Type} tone="violet">
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
    </Part>
  );
}

/** The sizes a style's name is written in, in px: the smallest, the largest, and the slope between. */
const SPECIMEN = { min: 13, max: 30, base: 12, perSlidePixel: 0.16 };

/** A size on the slide as the size of its specimen: 22 to 112 slide pixels are 14 to 28 here. */
function specimenSize(size: number): number {
  const { min, max, base, perSlidePixel } = SPECIMEN;
  return Math.round(Math.min(max, Math.max(min, base + (size - base) * perSlidePixel)));
}

function ThemeTextStyles() {
  const { t } = useTranslation('templates');
  /** The style whose fields are open. */
  const [open, setOpen] = useState<TextStyleRef | null>(null);
  return (
    <Part title={t('styles.title')} icon={ALargeSmall} tone="blue" flush>
      <div className="flex flex-col">
        {TextStyleRef.options.map((ref) => (
          <TextStyleRow
            key={ref}
            styleRef={ref}
            open={open === ref}
            onToggle={() => setOpen(open === ref ? null : ref)}
          />
        ))}
      </div>
    </Part>
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
    <div data-text-style={ref} className={cx('border-t border-ui-line', open && 'bg-ui-chrome')}>
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
          className="min-w-0 flex-1 truncate leading-snug text-ui-fg"
        >
          {name}
        </span>
        <span className="shrink-0 text-xs text-ui-fg-muted tabular-nums">
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
 * and the footer every slide shows. Both are of the open deck, like the rest of this panel.
 */
function Master() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  const numbers = slideNumberLayouts(deck).length;
  const hidden = slideNumberHidden(deck);
  const seats = footerLayouts(deck).length;
  const footer = deckFooter(deck);
  return (
    <Part title={t('master.title')} icon={Hash} tone="orange">
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
    </Part>
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

function Logo() {
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
    return (
      <Part title={t('logo.title')} icon={Stamp} tone="rose">
        <p className="text-xs text-ui-fg-muted">{t('logo.none')}</p>
      </Part>
    );
  }
  return (
    <Part title={t('logo.title')} icon={Stamp} tone="rose">
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
    </Part>
  );
}

function SaveAsTemplate() {
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
    <Part title={t('save.title')} icon={BookmarkPlus} accent>
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
    </Part>
  );
}

export function TemplatesPanel() {
  const { t } = useTranslation('templates');
  return (
    <div className="@container flex flex-col gap-6 px-4 pt-1 pb-6" data-testid="templates-panel">
      <Library />
      <Separator />
      <div className="flex flex-col gap-4">
        <h2 className="text-md font-semibold text-ui-fg">{t('panel.thisDeck')}</h2>
        <DirectionField />
        <ThemeColors />
        <ThemeFonts />
        <ThemeTextStyles />
        <Part title={t('shape.title')} icon={SquareRoundCorner} tone="green">
          <ShapeFields />
        </Part>
        <Part title={t('backgrounds.title')} icon={Wallpaper} tone="teal">
          <BackgroundFields />
        </Part>
        <Master />
        <Logo />
        <SaveAsTemplate />
      </div>
    </div>
  );
}
