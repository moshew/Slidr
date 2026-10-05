import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { createSlide, slideFromLayout, type Deck } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { deckFromTemplate, type Template } from '@slidr/templates';
import { Button, cx, EmptyState, Icon, ScrollArea, type LucideIcon } from '@slidr/ui';
import { ArrowLeft, Clock, FilePlus, FolderOpen, Sparkles } from '@slidr/ui/icons';
import type { RecentFile } from '../document/storage';
import { currentLanguage } from '../i18n';
import { library } from '../templates/app';
import { coverAsset, coverOf } from '../templates/covers';
import { useDeck, useEditor, useFile, type Editor } from './editor';
import { newDocument, openDocument, recentFiles } from './fileActions';
import { modalOpen, overlayOf } from './overlay';
import { PanelId, usePanel } from './registry';
import { openPanel, setWelcome, useShell } from './store';

/*
 * The welcome screen (DOC-05): what the app opens on, in place of the editor. A new deck with
 * the agent, from a template or empty; a file to open; the recent files. Every way out of it
 * ends in the editor with a document, so the editor behind it never needs to know it was there.
 * "Import HTML" is one of the ways in once the import area has registered its panel.
 *
 * Opened from the File menu, the screen stands over a document the user was working on. It then
 * has one more way out, which is the only one that keeps that document: back to it, by a button
 * at the top and by Esc.
 */

/**
 * The templates of one row, under the four ways of the row above; the first row shows until the
 * user asks for all of them, so the recent files stay in sight however many templates there are.
 */
const TEMPLATE_COLUMNS = 4;
/** The width a template's cover is drawn at, in screen pixels: inside a card of that row. */
const COVER_WIDTH = 212;

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

/** Puts the caret in the chat of the deck tool, once the editor is on the screen. */
function focusChat(): void {
  openPanel(PanelId.aiDeck, 'chat');
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-testid="chat-input"]')?.focus(),
    ),
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-medium text-ui-fg-muted">{children}</h2>;
}

function Way({
  icon,
  title,
  body,
  accent = false,
  disabled = false,
  onClick,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  /** The way the app is for: drawn in the accent, as every AI entry is (SPEC 4.0). */
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex min-w-0 flex-1 cursor-default flex-col items-start gap-2 rounded-panel border p-4 text-start transition-colors',
        'disabled:pointer-events-none disabled:text-ui-fg-subtle',
        accent
          ? 'border-transparent bg-ui-accent-soft hover:bg-ui-accent-soft-hover'
          : 'border-ui-line bg-ui-panel hover:bg-ui-hover active:bg-ui-pressed',
      )}
    >
      <Icon icon={icon} size="md" className={accent ? 'text-ui-accent-fg' : 'text-ui-fg-muted'} />
      <span className={cx('text-md font-semibold', accent ? 'text-ui-accent-fg' : 'text-ui-fg')}>
        {title}
      </span>
      <span className="text-sm text-ui-fg-muted">{body}</span>
    </button>
  );
}

function TemplateCard({ template, onPick }: { template: Template; onPick: () => void }) {
  const like = useDeck((s) => s.deck);
  const { theme } = template;
  // The cover follows the language and the direction of the UI's deck, not every edit of it.
  const cover = useMemo(
    () => coverOf(library.forDeck(theme.id, like.meta.lang) ?? template, like),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, theme.id, like.meta.lang, like.meta.dir],
  );
  return (
    <button
      type="button"
      data-welcome-template={theme.id}
      onClick={onPick}
      className="group flex min-w-0 cursor-default flex-col gap-2 rounded-panel border border-ui-line bg-ui-panel p-2 text-start transition-colors hover:border-ui-line-strong hover:bg-ui-hover"
    >
      {/* The cover is a picture, with every word of its slide: the card is named by its name. */}
      <span aria-hidden className="pointer-events-none block overflow-hidden rounded-inset">
        <ScaledSlide
          deck={cover.deck}
          slide={cover.slide}
          mode="thumbnail"
          width={COVER_WIDTH}
          resolveAsset={coverAsset}
        />
      </span>
      <span className="truncate px-1 text-sm font-medium text-ui-fg" dir="auto">
        {theme.name}
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
  const { t } = useTranslation();
  const editor = useEditor();
  const busy = useFile((s) => s.busy);
  const hasStorage = editor.document !== null;
  const htmlImport = usePanel(PanelId.htmlImport);
  // Built-in templates first, then the user's own; drawn again when the personal ones are read.
  useStore(library.state, (s) => s.personal);
  const templates = library.entries();
  const [allTemplates, setAllTemplates] = useState(false);
  const [recent, setRecent] = useState<RecentFile[] | null>(hasStorage ? null : []);
  const back = useShell((s) => s.welcomeBack);

  useEffect(() => {
    if (!back) return;
    // Esc goes back to the document, unless it is the key of a dialog or a menu that is open.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (modalOpen() || overlayOf(event.target)) return;
      event.preventDefault();
      setWelcome(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [back]);

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
    if (await start()) setWelcome(false);
  };
  const withAgent = async () => {
    if (!(await start())) return;
    setWelcome(false);
    focusChat();
  };
  const onTemplate = async (template: Template) => {
    const lang = currentLanguage();
    const deck = deckOn(library.forDeck(template.theme.id, lang) ?? template, lang);
    if (await newDocument(editor, deck)) setWelcome(false);
  };
  const open = async (path?: string) => {
    if (await openDocument(editor, path)) setWelcome(false);
  };
  /** The import panel asks for the file, and about the open document if it has work in it. */
  const toImport = (panel: string) => {
    setWelcome(false);
    openPanel(panel);
  };

  return (
    <main
      data-testid="welcome"
      aria-busy={busy !== null || undefined}
      className="flex min-h-0 flex-1 flex-col bg-ui-canvas"
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 py-10">
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
            <p className="text-md text-ui-fg-muted">{t('welcome.subtitle')}</p>
          </header>

          <section className="flex flex-col gap-3">
            <Heading>{t('welcome.start')}</Heading>
            <div className="flex gap-3">
              <Way
                icon={Sparkles}
                accent
                testId="welcome-ai"
                title={t('welcome.ai')}
                body={t('welcome.aiBody')}
                onClick={() => void withAgent()}
              />
              <Way
                icon={FilePlus}
                testId="welcome-blank"
                title={t('welcome.blank')}
                body={t('welcome.blankBody')}
                onClick={() => void blank()}
              />
              <Way
                icon={FolderOpen}
                testId="welcome-open"
                title={t('welcome.open')}
                body={t('welcome.openBody')}
                disabled={!hasStorage}
                onClick={() => void open()}
              />
              {htmlImport && (
                <Way
                  icon={htmlImport.icon}
                  testId="welcome-import"
                  title={t('welcome.importHtml')}
                  body={t('welcome.importHtmlBody')}
                  onClick={() => toImport(htmlImport.id)}
                />
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex h-control-sm items-center justify-between">
              <Heading>{t('welcome.templates')}</Heading>
              {templates.length > TEMPLATE_COLUMNS && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="welcome-all-templates"
                  aria-expanded={allTemplates}
                  onClick={() => setAllTemplates((all) => !all)}
                >
                  {t(allTemplates ? 'welcome.fewerTemplates' : 'welcome.allTemplates')}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {(allTemplates ? templates : templates.slice(0, TEMPLATE_COLUMNS)).map(
                ({ template }) => (
                  <TemplateCard
                    key={template.theme.id}
                    template={template}
                    onPick={() => void onTemplate(template)}
                  />
                ),
              )}
            </div>
          </section>

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
      </ScrollArea>
    </main>
  );
}
