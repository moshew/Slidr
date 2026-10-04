import { CommandBus } from '@slidr/model';
import { ScaledSlide } from '@slidr/renderer';
import { applyTemplate } from '@slidr/templates';
import { Button, Checkbox, cx, Icon, IconButton, Input, ScrollArea } from '@slidr/ui';
import { Check, LayoutTemplate, TriangleAlert, X } from '@slidr/ui/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { useAssetResolver, useDeck, useEditor } from '../shell';
import { showPreview } from '../stage/preview';
import { applyLibraryTemplate, saveDraft } from './actions';
import { drafts, library } from './app';
import type { TemplateDraft } from './drafts';

/*
 * The preview of a template the agent drafted, before anything is saved (THM-06, WG7-T11a). It
 * sits where the chat shows what the agent offers: every layout of the draft drawn with its
 * sample, a name, and the two things the user can do with it, which are keeping it in the
 * library and, once kept, putting the open deck on it. Hovering that last button shows the deck
 * on the template without changing it.
 */

/** Width of a layout's picture in the strip, in px. */
const THUMB = 208;

function Layouts({ draft }: { draft: TemplateDraft }) {
  const { t } = useTranslation('templates');
  const resolveAsset = useAssetResolver();
  return (
    <ScrollArea orientation="horizontal">
      <ul aria-label={t('draft.strip')} className="flex gap-2 px-4 pb-2">
        {draft.sample.slides.map((slide) => (
          <li key={slide.id} data-testid="draft-layout" className="flex shrink-0 flex-col gap-1">
            <div className="overflow-hidden rounded-small border border-ui-line">
              <ScaledSlide
                deck={draft.sample}
                slide={slide}
                width={THUMB}
                mode="thumbnail"
                resolveAsset={resolveAsset}
              />
            </div>
            <span dir="auto" className="truncate text-start text-xs text-ui-fg-muted">
              {slide.name}
            </span>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}

function DraftOf({ draft }: { draft: TemplateDraft }) {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const onDeck = useDeck((s) => s.deck.theme.id);
  const [name, setName] = useState(draft.template.theme.name);
  const [asDefault, setAsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const trimmed = name.trim();
  const errors = draft.findings.filter((finding) => finding.severity === 'error').length;
  const applied = draft.savedAs !== undefined && draft.savedAs === onDeck;

  // A preview does not outlive the card it was shown from.
  useEffect(() => () => showPreview(null), []);

  const save = async () => {
    if (!trimmed) return;
    setBusy(true);
    setFailed(false);
    try {
      await saveDraft(editor, library, drafts, draft.id, { name: trimmed, setDefault: asDefault });
    } catch (failure) {
      console.error('The drafted template could not be saved', failure);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  /** The open deck as it would be on the saved template, on the Stage only. */
  const tryOn = () => {
    const template = draft.savedAs && library.forDeck(draft.savedAs, editor.bus.deck.meta.lang);
    if (!template || applied) return;
    try {
      const scratch = new CommandBus(editor.bus.deck);
      scratch.batch(applyTemplate(editor.bus.deck, template));
      showPreview(scratch.deck);
    } catch {
      showPreview(null);
    }
  };
  const apply = async () => {
    showPreview(null);
    if (!draft.savedAs) return;
    setBusy(true);
    try {
      await applyLibraryTemplate(editor, library, draft.savedAs, t('undo.apply'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={t('draft.title')}
      data-testid="template-draft"
      data-saved={draft.savedAs ?? undefined}
      className="flex shrink-0 flex-col gap-2 border-t border-ui-line pt-2"
    >
      <div className="flex items-start gap-2 ps-4 pe-2">
        <Icon icon={LayoutTemplate} className="mt-0.5 text-ui-fg-muted" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p dir="auto" className="truncate text-start text-sm font-medium text-ui-fg">
            {t('draft.title')}: {draft.template.theme.name}
          </p>
          <p className="truncate text-xs text-ui-fg-muted">
            {t('draft.layouts', { count: draft.template.layouts.length })}
          </p>
        </div>
        <IconButton
          icon={X}
          size="sm"
          label={t('draft.dismiss')}
          data-testid="draft-close"
          onClick={() => drafts.dismiss()}
        />
      </div>
      <Layouts draft={draft} />
      {errors > 0 && (
        <p
          data-testid="draft-findings"
          className="flex items-start gap-1.5 px-4 text-xs text-ui-fg-muted"
        >
          <Icon icon={TriangleAlert} className="mt-0.5 text-ui-warning-fg" />
          <span>
            {t('draft.errors', { count: errors })}. {t('draft.errorsHint')}
          </span>
        </p>
      )}
      {draft.savedAs ? (
        <div className="flex items-center gap-2 px-4">
          <p role="status" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-ui-fg">
            <Icon icon={Check} className="text-ui-success-fg" />
            <span className="truncate">{t(applied ? 'draft.applied' : 'draft.saved')}</span>
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={applied}
            loading={busy}
            data-testid="draft-apply"
            onPointerEnter={tryOn}
            onPointerLeave={() => showPreview(null)}
            onFocus={tryOn}
            onBlur={() => showPreview(null)}
            onClick={() => void apply()}
          >
            {t('draft.apply')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4">
          <Input
            aria-label={t('draft.name')}
            value={name}
            dir="auto"
            className="min-w-0 flex-1"
            data-testid="draft-name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
            }}
          />
          <Button
            variant="primary"
            disabled={!trimmed}
            loading={busy}
            data-testid="draft-save"
            onClick={() => void save()}
          >
            {t('draft.save')}
          </Button>
        </div>
      )}
      {!draft.savedAs && (
        <Checkbox
          label={t('draft.asDefault')}
          checked={asDefault}
          className="mx-4"
          onCheckedChange={setAsDefault}
        />
      )}
      <p
        role={failed ? 'alert' : undefined}
        className={cx('px-4 text-xs', failed ? 'text-ui-danger-fg' : 'text-ui-fg-muted')}
      >
        {failed ? t('draft.failed') : draft.savedAs ? null : t('draft.hint')}
      </p>
    </section>
  );
}

/** The draft the agent made last, above the composer of the deck chat; nothing when there is none. */
export function TemplateDraftCard() {
  const draft = useStore(drafts.state, (s) => s.drafts.find((d) => d.id === s.shown));
  return draft ? <DraftOf key={draft.id} draft={draft} /> : null;
}
