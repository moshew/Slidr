import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { createDeck, createSlide, slideFromLayout, type Deck } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { deckFromTemplate, type Template } from '@slidr/templates';
import { Button, cx, EmptyState, Icon, ScrollArea, Tooltip } from '@slidr/ui';
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  FolderOpen,
  LayoutTemplate,
  Sparkles,
} from '@slidr/ui/icons';
import type { RecentFile } from '../document/storage';
import { currentLanguage } from '../i18n';
import { library } from '../templates/app';
import { useOpening } from '../templates/openings';
import type { LibraryEntry } from '../templates/library';
import { templateName, templateTagline } from '../templates/names';
import { useLaidOutSize } from '../templates/PreviewGrid';
import { TemplateShowroom } from '../templates/TemplateShowroom';
import { useTemplatesIn } from '../templates/written';
import { useEditor, useFile, type Editor } from './editor';
import { loadFile, newDocument, openDocument, recentFiles } from './fileActions';
import { modalOpen, overlayOf } from './overlay';
import { PanelId, useAction, useImporters } from './registry';
import { openPanel, setWelcome, useShell } from './store';

/*
 * The welcome screen (DOC-05): what the app opens on, in place of the editor. At its top a new
 * deck starts, in a row of cards: an empty deck, or one of the first templates. Every template,
 * with all its slides, opens under the row (`TemplateShowroom`), from "All templates" or from the
 * cover of one of them, as large as the screen: the page scrolls down to it, and once it stopped
 * the rest of the page is folded away, so there is nothing to scroll back to. The showroom's own
 * button, or Esc, closes it and brings the page back. Under the row, the files: the recent ones,
 * and beside their heading the way to any other, where a Slidr file is opened and an HTML page is
 * imported. The AI is not a way of its own: a new deck opens with the AI chat ready for typing,
 * and an import is a conversation of that chat. Every way out of the screen ends in the editor
 * with a document, so the editor behind it never needs to know it was there.
 *
 * Opened from the File menu, the screen stands over a document the user was working on. It then
 * has one more way out, which is the only one that keeps that document: back to it, by a button
 * at the top and by Esc. Esc closes the templates first, when they are open.
 */

/** How many templates the row shows beside the empty deck. */
const ROW_TEMPLATES = 3;

/** How many recent files the list shows. */
const RECENT_FILES = 8;

/** The space the page keeps around the templates when they fill the screen, in px: `px-8`. */
const SHEET_MARGIN = 32;

/** The least height of the templates, in px, on a screen too low for them. */
const SHEET_MIN = 360;

/** The longest the page waits for its scroll down to the templates to end, in ms. */
const SCROLL_WAIT = 1500;

/** A deck that starts on a template: its opening layout as the first slide (THM-08). */
function deckOn(template: Template, lang: string): Deck {
  const deck = deckFromTemplate(template, { lang });
  const first = deck.layouts[0];
  deck.slides = [first ? slideFromLayout(deck, first.id).slide : createSlide()];
  return deck;
}

/** The deck the app started with has not been touched: there is nothing to ask about. */
function pristine(editor: Editor): boolean {
  const { path, dirty } = editor.file.getState();
  return !path && !dirty;
}

/** The longest the caret waits for the chat's field, in ms: the chat reads its conversations first. */
const CHAT_WAIT = 2000;

/**
 * Puts the caret in the AI chat, once the editor and the chat's field are on the screen. What
 * the user put the focus on in the meantime keeps it.
 */
function focusChat(): void {
  openPanel(PanelId.ai);
  const until = performance.now() + CHAT_WAIT;
  const attempt = () => {
    if (document.activeElement && document.activeElement !== document.body) return;
    const field = document.querySelector<HTMLElement>('[data-testid="chat-input"]');
    if (field) field.focus();
    else if (performance.now() < until) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

/** The templates of the row: the default one first, when there is one, then the library's order. */
function rowTemplates(entries: readonly LibraryEntry[], defaultId: string | null): LibraryEntry[] {
  const first = entries.find((entry) => entry.template.theme.id === defaultId);
  const rest = entries.filter((entry) => entry !== first);
  return (first ? [first, ...rest] : rest).slice(0, ROW_TEMPLATES);
}

/* ---------------------------------------------------------------- the row of slides */

/**
 * A card of the row: a picture of 16:9 over its name, and under the name the sentence that says
 * what it is, in a frame of its own.
 */
function Tile({
  name,
  description,
  testId,
  onClick,
  children,
}: {
  name: string;
  description?: string;
  testId?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="welcome-tile group flex min-w-0 cursor-default flex-col gap-2 text-start"
    >
      <span aria-hidden className="welcome-tile-art">
        {children}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-3">
        <span dir="auto" className="truncate text-sm font-medium text-ui-fg">
          {name}
        </span>
        {description && (
          <span dir="auto" className="line-clamp-2 text-xs text-ui-fg-muted">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}

/** An empty slide, with the caret in its title and the AI's spark at its corner. */
function BlankArt() {
  return (
    <span className="welcome-blank">
      <span className="welcome-sheet">
        <span className="welcome-sheet-title">
          <span className="welcome-caret" />
        </span>
        <span className="welcome-sheet-line" />
        <span className="welcome-sheet-line" data-short />
        <span className="welcome-spark">
          <Icon icon={Sparkles} size="sm" />
        </span>
      </span>
    </span>
  );
}

/** The cover of a template, as wide as its tile. */
function CoverArt({ entry, like }: { entry: LibraryEntry; like: Deck }) {
  const box = useRef<HTMLSpanElement>(null);
  const { width } = useLaidOutSize(box);
  const cover = useOpening(entry, like);
  return (
    <span ref={box} className="absolute inset-0 bg-ui-field">
      {width > 0 && cover && (
        <ScaledSlide
          deck={cover.deck}
          slide={cover.slide}
          mode="thumbnail"
          width={width}
          resolveAsset={cover.resolveAsset}
        />
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- the recent files */

function Recent({ files, onOpen }: { files: RecentFile[]; onOpen: (path: string) => void }) {
  const { t } = useTranslation();
  return (
    <ul className="-mx-2 flex flex-col">
      {files.slice(0, RECENT_FILES).map((file) => {
        const name = file.title || file.path.split(/[\\/]/).at(-1);
        return (
          <li key={file.path}>
            <button
              type="button"
              disabled={!file.exists}
              data-welcome-recent={file.path}
              onClick={() => onOpen(file.path)}
              className="flex h-control w-full min-w-0 cursor-default items-center gap-3 rounded-control px-2 text-start hover:bg-ui-hover disabled:pointer-events-none disabled:text-ui-fg-subtle"
            >
              <span className="shrink-0 truncate text-sm font-medium" dir="auto">
                {name}
              </span>
              {/* A path reads left to right in every language. */}
              <span className="min-w-0 flex-1 truncate text-xs text-ui-fg-muted" dir="ltr">
                {file.exists ? file.path : t('file.missing')}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- the screen */

export function Welcome() {
  const { t, i18n } = useTranslation();
  const editor = useEditor();
  const busy = useFile((s) => s.busy);
  const hasStorage = editor.document !== null;
  const runImport = useAction('import');
  const importers = useImporters();
  // Built-in templates first, then the user's own; drawn again when the personal ones are read.
  const personal = useStore(library.state, (s) => s.personal);
  const defaultId = useStore(library.state, (s) => s.defaultId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => library.entries(), [personal]);
  // The deck a new one will be like: in the language of the UI, whatever document is behind.
  const lang = currentLanguage();
  // Only the templates written in that language.
  const { entries } = useTemplatesIn(all, lang);
  const row = useMemo(() => rowTemplates(entries, defaultId), [entries, defaultId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const like = useMemo(() => createDeck({ lang }), [lang, i18n.language]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // The template picked as the templates open: the one whose cover was chosen in the row.
  const [picked, setPicked] = useState<string | null>(null);
  const showroom = useRef<HTMLElement>(null);
  const allTemplates = useRef<HTMLButtonElement>(null);
  // The scrolling page, and the screen it is seen in.
  const viewport = useRef<HTMLDivElement>(null);
  const screen = useLaidOutSize(viewport);
  // The templates fill the screen: the page scrolled down to them and stopped.
  const [filled, setFilled] = useState(false);
  // The page was folded away under the templates, and comes into sight again as they close.
  const [folded, setFolded] = useState(false);
  const [recent, setRecent] = useState<RecentFile[] | null>(hasStorage ? null : []);
  const back = useShell((s) => s.welcomeBack);
  const showing = templatesOpen && entries.length > 0;
  const fills = filled && showing;

  /**
   * Back from the templates to the top of the page. From the keyboard, the focus goes back to the
   * way to them; after a click it is not put there, where it would open the way's tooltip.
   */
  const closeTemplates = useCallback((refocus: boolean) => {
    // The button is hidden until the page is drawn again.
    flushSync(() => {
      setTemplatesOpen(false);
      setFilled(false);
    });
    viewport.current?.scrollTo({ top: 0 });
    if (refocus) allTemplates.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!back && !templatesOpen) return;
    // Esc closes the templates, else goes back to the document, unless it is the key of a
    // dialog or a menu that is open.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (modalOpen() || overlayOf(event.target)) return;
      event.preventDefault();
      if (templatesOpen) closeTemplates(true);
      else setWelcome(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [back, templatesOpen, closeTemplates]);

  // The templates open with the focus on the one that is picked, and the page scrolls down until
  // they fill the screen. Once it stopped the rest of the page is folded away: no scroll leads
  // back to it, only the way out of the templates.
  useLayoutEffect(() => {
    const opened = showroom.current;
    const scroller = viewport.current;
    if (!templatesOpen || !opened || !scroller) return;
    opened.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    const fill = () => {
      setFilled(true);
      setFolded(true);
    };
    // Where they stand in the page, not on the screen, which their opening still moves.
    const top = Math.max(0, opened.offsetTop - SHEET_MARGIN);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || Math.abs(scroller.scrollTop - top) < 1) {
      fill();
      return;
    }
    // A scroll that is cut short, by the wheel or by a key, ends in place all the same.
    const timer = setTimeout(fill, SCROLL_WAIT);
    scroller.addEventListener('scrollend', fill, { once: true });
    scroller.scrollTo({ top, behavior: 'smooth' });
    return () => {
      clearTimeout(timer);
      scroller.removeEventListener('scrollend', fill);
    };
  }, [templatesOpen, picked]);

  useEffect(() => {
    if (!hasStorage) return;
    let current = true;
    void recentFiles(editor).then((files) => current && setRecent(files));
    return () => {
      current = false;
    };
  }, [editor, hasStorage]);

  /** A new document, unless the one the app started with is still untouched and will do. */
  const start = async (deck?: Deck): Promise<boolean> => {
    if (!deck && pristine(editor)) return true;
    return newDocument(editor, deck);
  };
  const blank = async () => {
    if (!(await start())) return;
    setWelcome(false);
    focusChat();
  };
  const fromTemplate = async ({ template }: LibraryEntry) => {
    const deck = deckOn(library.forDeck(template.theme.id, lang) ?? template, lang);
    if (!(await start(deck))) return;
    setWelcome(false);
    focusChat();
  };
  // In a plain browser there are no files of the app's own: the HTML import alone, by its dialog.
  const load = () => {
    if (hasStorage) void loadFile(editor, importers);
    else runImport?.();
  };
  const open = async (path: string) => {
    if (await openDocument(editor, path)) setWelcome(false);
  };
  const toggleTemplates = () => {
    if (templatesOpen) return closeTemplates(false);
    setPicked(null);
    setTemplatesOpen(true);
  };
  const showTemplate = (id: string) => {
    setPicked(id);
    setTemplatesOpen(true);
  };

  return (
    <main
      data-testid="welcome"
      aria-busy={busy !== null || undefined}
      className="flex min-h-0 flex-1 flex-col bg-ui-canvas"
    >
      <ScrollArea className="min-h-0 flex-1" viewportRef={viewport}>
        <div
          className="welcome-page"
          data-filled={fills || undefined}
          data-folded={folded || undefined}
        >
          <div
            className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-8 pt-10 pb-12"
            // Filled, the page is the templates alone, as tall as the screen.
            style={fills ? { paddingBlock: SHEET_MARGIN } : undefined}
          >
            <header hidden={fills} className="welcome-fold flex flex-col gap-2">
              {back && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="welcome-back"
                  className="-ms-2.5 mb-2 self-start"
                  onClick={() => setWelcome(false)}
                >
                  <Icon icon={ArrowLeft} mirror />
                  {t('welcome.back')}
                </Button>
              )}
              <h1 className="welcome-title text-ui-fg">{t('welcome.title')}</h1>
              <p className="flex items-center gap-2 text-md text-ui-fg-muted">
                <Icon icon={Sparkles} className="shrink-0 text-ui-accent-fg" />
                {t('welcome.subtitle')}
              </p>
            </header>

            <section
              hidden={fills}
              aria-labelledby="welcome-start-title"
              className="welcome-fold flex flex-col gap-4"
            >
              <div className="flex min-h-control-sm items-center gap-3">
                <h2 id="welcome-start-title" className="flex-1 text-md font-semibold text-ui-fg">
                  {t('welcome.start')}
                </h2>
                {/* Without the media library and without templates of the user's own, there is
                    nothing to show: the row says so where the way to them would be. */}
                {entries.length === 0 ? (
                  <span className="text-sm text-ui-fg-muted">{t('welcome.noTemplates')}</span>
                ) : (
                  <Tooltip content={t('welcome.templateBody')} side="bottom">
                    <Button
                      ref={allTemplates}
                      variant="ghost"
                      size="sm"
                      data-testid="welcome-template"
                      aria-expanded={templatesOpen}
                      className="-me-2.5"
                      onClick={toggleTemplates}
                    >
                      <Icon icon={LayoutTemplate} className="text-ui-accent-fg" />
                      {t('welcome.allTemplates')}
                      <span className="rounded-full bg-ui-field px-1.5 text-xs leading-5 tabular-nums text-ui-fg-muted">
                        {entries.length}
                      </span>
                      <Icon
                        icon={ChevronDown}
                        className={cx('transition-transform', templatesOpen && 'rotate-180')}
                      />
                    </Button>
                  </Tooltip>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Tile
                  testId="welcome-blank"
                  name={t('welcome.blank')}
                  description={t('welcome.blankBody')}
                  onClick={() => void blank()}
                >
                  <BlankArt />
                </Tile>
                {row.map((entry) => {
                  const { theme } = entry.template;
                  return (
                    <Tile
                      key={theme.id}
                      name={templateName(theme, i18n.language)}
                      description={templateTagline(theme, i18n.language)}
                      onClick={() => showTemplate(theme.id)}
                    >
                      <CoverArt entry={entry} like={like} />
                    </Tile>
                  );
                })}
              </div>
            </section>

            {showing && (
              <TemplateShowroom
                key={picked ?? ''}
                ref={showroom}
                entries={entries}
                like={like}
                initial={picked ?? defaultId}
                onCreate={fromTemplate}
                onBack={closeTemplates}
                // As large as the screen inside the page's margin: wider than the page's column
                // on a wide screen, by as much on its two sides.
                style={{
                  width: Math.max(0, screen.width - 2 * SHEET_MARGIN),
                  height: Math.max(SHEET_MIN, screen.height - 2 * SHEET_MARGIN),
                  alignSelf: 'center',
                }}
              />
            )}

            <section
              hidden={fills}
              aria-labelledby="welcome-recent-title"
              className="welcome-fold flex flex-col gap-4"
            >
              <div className="flex min-h-control-sm items-center gap-3">
                <h2 id="welcome-recent-title" className="flex-1 text-md font-semibold text-ui-fg">
                  {t('welcome.recent')}
                </h2>
                <Tooltip content={t('welcome.loadBody')} side="bottom">
                  <Button
                    size="sm"
                    icon={FolderOpen}
                    data-testid="welcome-load"
                    disabled={!hasStorage && !runImport}
                    onClick={load}
                  >
                    {t('welcome.load')}
                  </Button>
                </Tooltip>
              </div>
              {recent === null ? null : recent.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title={t('welcome.noRecentTitle')}
                  description={t(hasStorage ? 'welcome.noRecentBody' : 'welcome.noStorage')}
                  className="rounded-panel border border-dashed border-ui-line-strong py-8"
                />
              ) : (
                <Recent files={recent} onOpen={(path) => void open(path)} />
              )}
            </section>
          </div>
        </div>
      </ScrollArea>
    </main>
  );
}
