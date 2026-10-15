import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { createDeck, createSlide, slideFromLayout, type Deck } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { deckFromTemplate, type Template } from '@slidr/templates';
import { Button, cx, EmptyState, Icon, ScrollArea, type LucideIcon } from '@slidr/ui';
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  CodeXml,
  FilePlus,
  FolderOpen,
  LayoutTemplate,
  Sparkles,
} from '@slidr/ui/icons';
import type { RecentFile } from '../document/storage';
import { currentLanguage } from '../i18n';
import { library } from '../templates/app';
import { coverAsset, coverOf } from '../templates/covers';
import type { LibraryEntry } from '../templates/library';
import { TemplateShowroom } from '../templates/TemplateShowroom';
import { useEditor, useFile, type Editor } from './editor';
import { loadFile, newDocument, openDocument, recentFiles } from './fileActions';
import { modalOpen, overlayOf } from './overlay';
import { PanelId, useAction, useImporters } from './registry';
import { SlidrMark } from './SlidrMark';
import { openPanel, setWelcome, useShell } from './store';

/*
 * The welcome screen (DOC-05): what the app opens on, in place of the editor. Three ways to a
 * deck: an empty one; a file, where a Slidr file is opened and an HTML page is imported; or a
 * template, whose covers and slides are shown only once that way was chosen
 * (`TemplateShowroom`). Under them, the recent files. The AI is not a way of its own: a new deck
 * opens with the AI chat ready for typing, and an import is a conversation of that chat. Every
 * way out of the screen ends in the editor with a document, so the editor behind it never needs
 * to know it was there.
 *
 * Opened from the File menu, the screen stands over a document the user was working on. It then
 * has one more way out, which is the only one that keeps that document: back to it, by a button
 * at the top and by Esc. Esc closes the templates first, when they are open.
 */

/** The width of each cover in the fan of the "from template" way, in screen pixels. */
const FAN_WIDTH = 144;

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

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-medium text-ui-fg-muted">{children}</h2>;
}

/* ---------------------------------------------------------------- the pictures of the ways */

/** An empty slide, with the caret in its title and the AI's spark at its corner. */
function BlankArt() {
  return (
    <span className="welcome-art-blank">
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

/** The two kinds of file the way takes: a page of HTML behind a Slidr file. */
function FileArt() {
  return (
    <span className="welcome-art-files">
      <span className="welcome-file" data-kind="html">
        <Icon icon={CodeXml} size="lg" />
        <span className="welcome-file-tag" dir="ltr">
          HTML
        </span>
      </span>
      <span className="welcome-file" data-kind="slidr">
        <span className="welcome-file-mark editor-header">
          <SlidrMark className="size-7" />
        </span>
        <span className="welcome-file-tag" dir="ltr">
          .slidr
        </span>
      </span>
    </span>
  );
}

function FanCover({ entry, like }: { entry: LibraryEntry; like: Deck }) {
  const { template } = entry;
  const cover = useMemo(
    () => coverOf(library.forDeck(template.theme.id, like.meta.lang) ?? template, like),
    [template, like],
  );
  return (
    <ScaledSlide
      deck={cover.deck}
      slide={cover.slide}
      mode="thumbnail"
      width={FAN_WIDTH}
      resolveAsset={coverAsset}
    />
  );
}

/** The covers of the first templates, fanned out; empty cards while there are none. */
function TemplatesArt({ entries, like }: { entries: readonly LibraryEntry[]; like: Deck }) {
  // The first template in front, the next two behind it at either side.
  const fan = [entries[1], entries[2], entries[0]];
  return (
    <span className="welcome-art-fan">
      {fan.map((entry, index) => (
        <span key={index} className="welcome-fan-card" data-at={index}>
          {entry && <FanCover entry={entry} like={like} />}
        </span>
      ))}
    </span>
  );
}

/* ---------------------------------------------------------------- the ways */

function Way({
  art,
  icon,
  title,
  body,
  testId,
  onClick,
  disabled = false,
  expanded,
  ref,
}: {
  art: ReactNode;
  icon: LucideIcon;
  title: string;
  body: string;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  /** For the way that opens what is under it: whether that is open. */
  expanded?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-testid={testId}
      disabled={disabled}
      aria-expanded={disabled ? undefined : expanded}
      onClick={onClick}
      className={cx(
        'welcome-way group flex min-w-0 cursor-default flex-col overflow-hidden rounded-panel border bg-ui-panel text-start transition-[border-color,box-shadow,translate]',
        'disabled:pointer-events-none',
        expanded
          ? 'border-ui-accent shadow-floating ring-1 ring-ui-accent'
          : 'border-ui-line hover:-translate-y-0.5 hover:border-ui-line-strong hover:shadow-floating',
      )}
    >
      <span
        aria-hidden
        className="welcome-art relative block h-36 overflow-hidden border-b border-ui-line"
      >
        {art}
      </span>
      <span className="flex flex-col gap-1 px-4 pt-3.5 pb-4">
        <span className="flex items-center gap-2">
          <Icon
            icon={icon}
            size="md"
            className={disabled ? 'text-ui-fg-subtle' : 'text-ui-accent-fg'}
          />
          <span
            className={cx(
              'min-w-0 flex-1 text-md font-semibold',
              disabled ? 'text-ui-fg-subtle' : 'text-ui-fg',
            )}
          >
            {title}
          </span>
          {expanded !== undefined && !disabled && (
            <Icon
              icon={ChevronDown}
              className={cx('text-ui-fg-muted transition-transform', expanded && 'rotate-180')}
            />
          )}
        </span>
        <span className="text-sm text-ui-fg-muted">{body}</span>
      </span>
    </button>
  );
}

function Recent({ files, onOpen }: { files: RecentFile[]; onOpen: (path: string) => void }) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col">
      {files.slice(0, 8).map((file) => {
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
  const entries = useMemo(() => library.entries(), [personal]);
  // The deck a new one will be like: in the language of the UI, whatever document is behind.
  const lang = currentLanguage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const like = useMemo(() => createDeck({ lang }), [lang, i18n.language]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const showroom = useRef<HTMLElement>(null);
  const templateWay = useRef<HTMLButtonElement>(null);
  const [recent, setRecent] = useState<RecentFile[] | null>(hasStorage ? null : []);
  const back = useShell((s) => s.welcomeBack);

  useEffect(() => {
    if (!back && !templatesOpen) return;
    // Esc closes the templates, else goes back to the document, unless it is the key of a
    // dialog or a menu that is open.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (modalOpen() || overlayOf(event.target)) return;
      event.preventDefault();
      if (templatesOpen) {
        setTemplatesOpen(false);
        templateWay.current?.focus();
      } else setWelcome(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [back, templatesOpen]);

  // The templates come into sight as they open, with the focus on the one that is picked.
  useEffect(() => {
    const opened = showroom.current;
    if (!templatesOpen || !opened) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    opened.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
    opened.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, [templatesOpen]);

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

  return (
    <main
      data-testid="welcome"
      aria-busy={busy !== null || undefined}
      className="flex min-h-0 flex-1 flex-col bg-ui-canvas"
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="welcome-page relative">
          <div className="relative mx-auto flex w-full max-w-screen-2xl flex-col gap-8 px-8 pt-10 pb-12">
            <header className="flex flex-col gap-1">
              {back && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="welcome-back"
                  className="-ms-2.5 mb-3 self-start"
                  onClick={() => setWelcome(false)}
                >
                  <Icon icon={ArrowLeft} mirror />
                  {t('welcome.back')}
                </Button>
              )}
              <h1 className="text-xl font-semibold text-ui-fg">{t('welcome.title')}</h1>
              <p className="flex items-center gap-1.5 text-md text-ui-fg-muted">
                <Icon icon={Sparkles} className="shrink-0 text-ui-accent-fg" />
                {t('welcome.subtitle')}
              </p>
            </header>

            <section className="flex flex-col gap-3">
              <Heading>{t('welcome.start')}</Heading>
              <div className="grid grid-cols-3 gap-4">
                <Way
                  icon={FilePlus}
                  art={<BlankArt />}
                  testId="welcome-blank"
                  title={t('welcome.blank')}
                  body={t('welcome.blankBody')}
                  onClick={() => void blank()}
                />
                <Way
                  icon={FolderOpen}
                  art={<FileArt />}
                  testId="welcome-load"
                  title={t('welcome.load')}
                  body={t('welcome.loadBody')}
                  disabled={!hasStorage && !runImport}
                  onClick={load}
                />
                {/* Without the media library and without templates of the user's own, nothing
                    to offer: the way stays, and says so. */}
                <Way
                  ref={templateWay}
                  icon={LayoutTemplate}
                  art={<TemplatesArt entries={entries} like={like} />}
                  testId="welcome-template"
                  title={t('welcome.template')}
                  body={t(entries.length > 0 ? 'welcome.templateBody' : 'welcome.noTemplates')}
                  disabled={entries.length === 0}
                  expanded={templatesOpen}
                  onClick={() => setTemplatesOpen((open) => !open)}
                />
              </div>
            </section>

            {templatesOpen && entries.length > 0 && (
              <TemplateShowroom
                ref={showroom}
                entries={entries}
                like={like}
                initial={defaultId}
                onCreate={fromTemplate}
              />
            )}

            <section className="flex flex-col gap-3">
              <Heading>{t('welcome.recent')}</Heading>
              {recent === null ? null : recent.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title={t('welcome.noRecentTitle')}
                  description={t(hasStorage ? 'welcome.noRecentBody' : 'welcome.noStorage')}
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
