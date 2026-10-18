import { FittedSlide } from '@slidr/renderer';
import { cx, Icon, IconButton, Input } from '@slidr/ui';
import { Check, Pencil, RefreshCw, Trash2 } from '@slidr/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { useLanguage } from '../i18n';
import { ask, useDeck, useEditor } from '../shell';
import { renameTemplate, updateTemplate } from './actions';
import { library } from './app';
import { coverAsset, coverOf } from './covers';
import type { LibraryEntry } from './library';
import { templateName } from './names';
import { readyPreview } from './previews';
import { useLike } from './PreviewGrid';
import { showTemplateSlides, templateSlides } from './TemplateSlides';
import { useTemplatesIn } from './written';

/*
 * The Templates panel (WG7-T09 and the wiring of T04; THM-04, THM-05, THM-08): the library with
 * the default for new decks, where pressing the picture of a template spreads the slides that
 * show it over the Stage (`./TemplateSlides`). The design of the open deck, its colours, fonts
 * and the rest, is in the deck's properties, from the File menu (`./DeckProperties`).
 */

function TemplateCard({
  entry,
  current,
  open,
  onToggle,
}: {
  entry: LibraryEntry;
  current: boolean;
  /** The slides that show the template are spread over the Stage. */
  open: boolean;
  onToggle: () => void;
}) {
  const { t, i18n } = useTranslation('templates');
  const editor = useEditor();
  // The cover is in the UI language and its direction, whatever the open deck is in, and an edit
  // of the deck does not draw the cards again.
  const like = useLike();
  const { template, personal } = entry;
  const { theme } = template;
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const name = templateName(theme, i18n.language);
  const cover = useMemo(
    () => coverOf(library.forDeck(theme.id, like.meta.lang) ?? template, like),
    [template, theme.id, like],
  );
  // The same picture while the cover stays: a card drawn again for its ring or its mark does not
  // draw its slide again. It fits the card by itself, so it is drawn with the panel ahead of time;
  // its photograph is decoded with it, so the card does not appear first without it.
  const picture = useMemo(
    () => (
      <span aria-hidden className="block">
        <FittedSlide
          deck={cover.deck}
          slide={cover.slide}
          mode="thumbnail"
          resolveAsset={coverAsset}
          decoding="sync"
        />
      </span>
    ),
    [cover],
  );

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
      className="flex min-w-0 flex-col gap-1"
    >
      {/* A picture of the cover, which opens the slides that show the template, where it is
          applied. A screen reader is told what the button does, not the words of the picture. */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('panel.preview', { name })}
        data-testid="template-cover"
        // The slides it opens are made while it is pointed at, so they are there when it is pressed.
        onPointerEnter={() => void readyPreview(entry, like)}
        onFocus={() => void readyPreview(entry, like)}
        onClick={onToggle}
        className={cx(
          'relative block cursor-default overflow-hidden rounded-inset shadow-slide transition-shadow hover:shadow-raised',
          (open || current) && 'ring-2 ring-ui-accent',
        )}
      >
        {current && (
          // The template of the open deck.
          <span
            aria-hidden
            className="absolute end-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-ui-accent text-ui-on-accent"
          >
            <Icon icon={Check} />
          </span>
        )}
        {picture}
      </button>
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
        personal && (
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
        )
      )}
    </article>
  );
}

function Library() {
  const { t } = useTranslation('templates');
  const { personal, loaded } = useStore(library.state);
  const themeId = useDeck((s) => s.deck.theme.id);
  /** The template whose slides are spread over the Stage, by id. */
  const open = useStore(templateSlides, (s) => s.id);
  // The slides are opened from here: they do not stay when the panel is gone.
  useEffect(() => () => showTemplateSlides(null), []);
  const all = useMemo(
    () => library.entries(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal],
  );
  // Only the templates written in the UI language. The slides of one the language was switched
  // away from, spread as it was switched, are closed.
  const { entries, pending } = useTemplatesIn(all, useLanguage());
  const gone = open !== null && !pending && !entries.some((e) => e.template.theme.id === open);
  useEffect(() => {
    if (gone) showTemplateSlides(null);
  }, [gone]);
  // The library is all the panel holds, so it has no heading of its own: the panel's title names it.
  return (
    <div className="flex flex-col gap-3">
      {/* Two cards to a row, each as wide as its picture. */}
      <div className="grid grid-cols-2 gap-3" data-testid="template-library">
        {entries.map((entry) => {
          const { id } = entry.template.theme;
          return (
            <TemplateCard
              key={id}
              entry={entry}
              current={id === themeId}
              open={id === open}
              onToggle={() => showTemplateSlides(id === open ? null : id)}
            />
          );
        })}
      </div>
      {!loaded && <p className="text-xs text-ui-fg-muted">{t('panel.loading')}</p>}
    </div>
  );
}

export function TemplatesPanel() {
  return (
    <div className="@container flex flex-col gap-6 px-4 pt-1 pb-6" data-testid="templates-panel">
      <Library />
    </div>
  );
}
