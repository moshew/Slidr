import { TextStyleRef, type ColorToken, type FontPair, type TextStyle } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { deckFooter, footerLayouts, slideNumberHidden, slideNumberLayouts } from '@slidr/templates';
import {
  Button,
  ColorPicker,
  ColorSwatch,
  cx,
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
} from '@slidr/ui';
import { Check, Eye, EyeOff, ImageUp, Star, Trash2 } from '@slidr/ui/icons';
import { useMemo, useRef, useState, type ReactNode } from 'react';
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
  saveAsTemplate,
  setFooter,
  setLogo,
  showLogo,
  showNumber,
  turnDeck,
} from './actions';
import { library } from './app';
import { coverAsset, coverOf } from './covers';
import type { LibraryEntry } from './library';

/*
 * The Templates panel (WG7-T09 and the wiring of T04; THM-04, THM-05, THM-08): the library with
 * the default for new decks, and the design of the open deck: its direction, the theme's
 * colours, fonts and text styles, the logo of its layouts, and saving all of it as a personal
 * template. Every edit is a command of the catalogue on the open deck, so the slides on the
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-ui-fg-muted">{title}</h3>
      {children}
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

  return (
    <article
      data-template={theme.id}
      data-current={current || undefined}
      className={cx(
        'flex min-w-0 flex-col gap-2 rounded-panel border p-2',
        current ? 'border-ui-accent bg-ui-accent-soft' : 'border-ui-line',
      )}
    >
      <div className="overflow-hidden rounded-inset">
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
          <span className="truncate text-sm font-medium text-ui-fg" dir="auto">
            {theme.name}
          </span>
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
        {personal && (
          <IconButton
            icon={Trash2}
            size="sm"
            label={t('panel.remove')}
            onClick={() => void remove()}
          />
        )}
      </div>
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
    <Section title={t('direction.title')}>
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
    </Section>
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
            className="flex min-w-0 cursor-default items-center gap-2 rounded-control p-1.5 text-start text-sm text-ui-fg transition-colors hover:bg-ui-hover data-[state=open]:bg-ui-hover"
          >
            <ColorSwatch color={value} className="size-6 shrink-0" />
            <span className="truncate">{label}</span>
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
    <Section title={t('colors.title')}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {COLOR_TOKENS.map((token) => (
          <ThemeColor key={token} token={token} />
        ))}
      </div>
    </Section>
  );
}

function ThemeFonts() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const fonts = useDeck((s) => s.deck.theme.fonts);
  const set = (role: 'heading' | 'body', pair: FontPair) =>
    editor.bus.dispatch(
      { type: 'theme.update', patch: { fonts: { [role]: pair } } },
      { label: t('undo.font') },
    );
  return (
    <Section title={t('fonts.title')}>
      {(['heading', 'body'] as const).map((role) => (
        <div key={role} className="flex flex-col gap-1.5">
          <span className="text-sm text-ui-fg">{t(`fonts.${role}`)}</span>
          <div className="grid grid-cols-2 gap-3">
            {(['he', 'latin'] as const).map((script) => (
              <div key={script} className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-ui-fg-muted">{t(`fonts.${script}`)}</span>
                <FontField
                  label={t(`fonts.${role}${script === 'he' ? 'He' : 'Latin'}`)}
                  value={fonts[role][script]}
                  className="w-full border border-ui-line"
                  onChange={(family) => set(role, { ...fonts[role], [script]: family })}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Section>
  );
}

function ThemeTextStyles() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const styles = useDeck((s) => s.deck.theme.textStyles);
  const set = (ref: TextStyleRef, patch: Partial<TextStyle>) =>
    editor.bus.dispatch(
      { type: 'theme.update', patch: { textStyles: { [ref]: { ...styles[ref], ...patch } } } },
      { label: t('undo.style') },
    );
  return (
    <Section title={t('styles.title')}>
      <div className="flex flex-col gap-2">
        {TextStyleRef.options.map((ref) => {
          // `title` is also the key of the section's own heading.
          const name = t(ref === 'title' ? 'styles.title_' : `styles.${ref}`);
          const style = styles[ref];
          const weight = String(Math.round(style.weight / 100) * 100);
          return (
            <div key={ref} className="flex items-center gap-2" data-text-style={ref}>
              <span className="min-w-0 flex-1 truncate text-sm text-ui-fg">{name}</span>
              <NumberField
                aria-label={t('styles.size', { style: name })}
                size="sm"
                className="w-20"
                value={style.size}
                min={12}
                max={400}
                step={1}
                onValueChange={(size) => set(ref, { size })}
              />
              <Select
                aria-label={t('styles.weight', { style: name })}
                size="sm"
                className="w-36"
                value={WEIGHTS.find((w) => w === weight) ?? null}
                onValueChange={(next) => set(ref, { weight: Number(next) })}
                options={WEIGHTS.map((w) => ({ value: w, label: t(`styles.weight${w}`) }))}
              />
            </div>
          );
        })}
      </div>
    </Section>
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
    <Section title={t('master.title')}>
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
        {/* Keyed by the deck's footer, so the field follows an undo or a switch of template. */}
        <FooterField key={footer} footer={footer} disabled={seats === 0} />
        <p className="text-xs text-ui-fg-muted">
          {t(seats === 0 ? 'master.footerNone' : 'master.footerHint')}
        </p>
      </div>
    </Section>
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
      <Section title={t('logo.title')}>
        <p className="text-xs text-ui-fg-muted">{t('logo.none')}</p>
      </Section>
    );
  }
  return (
    <Section title={t('logo.title')}>
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
    </Section>
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
    <Section title={t('save.title')}>
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
        <Toggle
          icon={Star}
          label={t('save.asDefault')}
          pressed={asDefault}
          onPressedChange={setAsDefault}
        />
        <Button variant="primary" disabled={!trimmed} loading={busy} onClick={() => void save()}>
          {t('save.button')}
        </Button>
      </div>
      <p
        role={message?.error ? 'alert' : 'status'}
        className={cx('text-xs', message?.error ? 'text-ui-danger-fg' : 'text-ui-fg-muted')}
      >
        {message?.text ?? t('save.hint')}
      </p>
    </Section>
  );
}

export function TemplatesPanel() {
  const { t } = useTranslation('templates');
  return (
    <div className="flex flex-col gap-6 px-4 pt-1 pb-6" data-testid="templates-panel">
      <Library />
      <Separator />
      <h2 className="text-sm font-medium text-ui-fg">{t('panel.thisDeck')}</h2>
      <DirectionField />
      <ThemeColors />
      <ThemeFonts />
      <ThemeTextStyles />
      <Master />
      <Logo />
      <SaveAsTemplate />
    </div>
  );
}
