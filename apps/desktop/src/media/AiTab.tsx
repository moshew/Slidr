import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { imagePlaceholders, type ImagePlaceholder } from '@slidr/agent-tools';
import { Sparkles } from '@slidr/ui/icons';
import { Button, EmptyState, Spinner, Textarea } from '@slidr/ui';
import { imagesOf } from '../images/appImages';
import { providerStateLabel, type ProviderStateLabel } from '../images/ImageSettings';
import { loadSettings, useSettings } from '../settings';
import { openPanel, PanelId, tell, useDeck, useEditor } from '../shell';
import { insertAsset } from './insert';
import { AssetTile, Group, ReplaceHint, TabBody, TileGrid } from './parts';
import { cancelFill, fillPlaceholder, fillPlaceholders } from './placeholders';
import { offersReplace, replaceSelected, useSelectedPicture } from './replace';
import { useMedia } from './store';

/**
 * AI images (SPEC 4.2, WG5-T13, WG12-T04, T07): the deck's image style, the placeholders that
 * wait for a picture, and the images made so far.
 *
 * - The style is `meta.imageStyle` (AIO-10): a sentence or two that goes with every image made
 *   for the deck, by the user here and by the agent through its tools.
 * - A placeholder is the frame `<img data-image-prompt>` leaves on a slide. "Generate" makes its
 *   image with the provider chosen in the settings, and puts it in as one undo step.
 * - The history is every AI image among the deck's assets, each with the prompt it was made from.
 */
export function AiTab() {
  const { t } = useTranslation('media');
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  const jobs = useMedia((s) => s.jobs);
  const placeholders = useMemo(() => imagePlaceholders(deck), [deck]);
  const made = useMemo(
    () =>
      Object.values(deck.assets)
        .filter((asset) => asset.origin === 'ai' && asset.kind === 'image')
        .reverse(),
    [deck.assets],
  );
  const provider = useProviderState();
  const ready = provider === 'ready';
  const picture = useSelectedPicture();
  const slideNumber = (slideId: string) => deck.slides.findIndex((s) => s.id === slideId) + 1;
  const idle = placeholders.filter((p) => jobs[p.elementId]?.state !== 'working');
  const working = placeholders.some((p) => jobs[p.elementId]?.state === 'working');

  return (
    <TabBody testId="media-ai">
      <ImageStyle />

      {provider && !ready && provider !== 'checking' && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-control bg-ui-field px-3 py-2"
          data-testid="ai-provider-state"
        >
          <p className="min-w-0 flex-1 text-xs text-ui-fg">
            {t('ai.notReady', { state: t(`images:state.${provider}`) })}
          </p>
          <Button size="sm" onClick={() => openPanel(PanelId.settings)}>
            {t('stock.openSettings')}
          </Button>
        </div>
      )}

      {placeholders.length > 0 && (
        <Group
          title={t('ai.waiting')}
          hint={t('ai.waitingHint')}
          action={
            working ? (
              <Button size="sm" variant="ghost" onClick={() => void cancelFill(editor)}>
                {t('ai.stop')}
              </Button>
            ) : (
              placeholders.length > 1 && (
                <Button
                  size="sm"
                  variant="soft"
                  icon={Sparkles}
                  disabled={!ready}
                  onClick={() => void fillPlaceholders(editor, idle)}
                  data-testid="ai-fill-all"
                >
                  {t('ai.generateAll')}
                </Button>
              )
            )
          }
        >
          <ul className="flex flex-col gap-2" data-testid="ai-placeholders">
            {placeholders.map((placeholder) => (
              <PlaceholderRow
                key={placeholder.elementId}
                placeholder={placeholder}
                slide={slideNumber(placeholder.slideId)}
                ready={ready}
              />
            ))}
          </ul>
        </Group>
      )}

      <Group title={t('ai.history')}>
        {made.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={t('ai.emptyTitle')}
            description={t('ai.emptyBody')}
            className="min-h-48"
          />
        ) : (
          <>
            <ReplaceHint shown={picture !== undefined} />
            <TileGrid label={t('ai.history')}>
              {made.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  label={t('ai.insert', { prompt: firstLine(asset.lineage?.prompt) })}
                  onPick={() => {
                    if (!insertAsset(editor, asset)) void tell(t('noSlide'));
                  }}
                  replace={
                    offersReplace(picture, asset.id)
                      ? {
                          label: t('replace', { name: firstLine(asset.lineage?.prompt) }),
                          onReplace: () => replaceSelected(editor, picture, asset),
                        }
                      : undefined
                  }
                />
              ))}
            </TileGrid>
          </>
        )}
      </Group>
    </TabBody>
  );
}

/** What the image was asked to show: the first line of its prompt, the rest being the style. */
const firstLine = (prompt: string | undefined) =>
  (prompt ?? '').split('\n')[0]?.slice(0, 120) ?? '';

/** Whether the provider chosen in the settings can make an image now. */
function useProviderState(): ProviderStateLabel | null {
  const { client } = imagesOf(useEditor());
  const keys = useSettings((state) => state.keys);
  const revision = useSettings((state) => state.revision);
  const [label, setLabel] = useState<ProviderStateLabel | null>(null);

  useEffect(() => {
    let current = true;
    // The keys' state is part of the answer: a provider without its key needs one.
    void loadSettings()
      .catch(() => undefined)
      .then(() => Promise.all([client.defaultProvider(), client.providers()]))
      .then(async ([id, providers]) => {
        const provider = providers.find((p) => p.id === id);
        if (!provider || !current) return;
        const stored = provider.key ? useSettings.getState().keys[provider.key] : false;
        setLabel(providerStateLabel(provider, undefined, stored));
        const status = await client.probe(id);
        if (current) setLabel(providerStateLabel(provider, status, stored));
      })
      .catch(() => current && setLabel('unavailable'));
    return () => {
      current = false;
    };
  }, [client, keys, revision]);

  return label;
}

/** The deck's image style: a field that is saved when it is left. */
function ImageStyle() {
  const { t } = useTranslation('media');
  const editor = useEditor();
  const stored = useDeck((s) => s.deck.meta.imageStyle ?? '');
  const [draft, setDraft] = useState(stored);
  // The agent may set the style too: what is stored replaces a draft that was not being edited.
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setDraft(stored);
  }

  const commit = () => {
    const next = draft.trim();
    if (next === stored) return;
    editor.bus.dispatch(
      { type: 'deck.setMeta', patch: { imageStyle: next || null } },
      { label: t('history.style') },
    );
  };

  return (
    <Group title={t('ai.style')}>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        placeholder={t('ai.stylePlaceholder')}
        aria-label={t('ai.style')}
        rows={2}
        // A style is often written in English, by the user or by the agent.
        dir="auto"
        data-testid="image-style"
      />
      <p className="text-xs text-ui-fg-muted">{t('ai.styleHint')}</p>
    </Group>
  );
}

function PlaceholderRow({
  placeholder,
  slide,
  ready,
}: {
  placeholder: ImagePlaceholder;
  slide: number;
  ready: boolean;
}) {
  const { t } = useTranslation('media');
  const editor = useEditor();
  const job = useMedia((s) => s.jobs[placeholder.elementId]);
  const working = job?.state === 'working';
  const failed = job?.state === 'failed';

  const show = () => {
    const selection = editor.selection.getState();
    selection.setCurrentSlide(placeholder.slideId);
    selection.selectElements([placeholder.elementId]);
  };

  return (
    <li
      className="flex flex-col gap-1.5 rounded-control border border-ui-line px-3 py-2"
      data-placeholder={placeholder.elementId}
      data-state={job?.state ?? 'waiting'}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={show}
          className="flex min-w-0 flex-1 cursor-default flex-col gap-0.5 text-start"
        >
          <span className="text-xs font-medium text-ui-fg-muted">
            {t('ai.slide', { n: slide })}
          </span>
          {/* Ordered in the prompt's own direction, aligned with the panel. */}
          <span className="line-clamp-2 text-sm text-ui-fg">
            <bdi>{placeholder.prompt}</bdi>
          </span>
        </button>
        {working ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void cancelFill(editor, placeholder.elementId)}
          >
            {t('ai.stop')}
          </Button>
        ) : (
          <Button
            size="sm"
            icon={Sparkles}
            disabled={!ready}
            onClick={() => void fillPlaceholder(editor, placeholder)}
          >
            {failed ? t('ai.retry') : t('ai.generate')}
          </Button>
        )}
      </div>
      {working && (
        <p className="flex items-center gap-1.5 text-xs text-ui-fg-muted" role="status">
          <Spinner />
          {t('ai.working')}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-xs text-ui-danger-fg">
          {t('ai.failed')}
          {job.error && (
            // The provider's own words, in English: what to install, how to sign in, what failed.
            <span className="block text-ui-fg-muted">
              <bdi>{job.error}</bdi>
            </span>
          )}
        </p>
      )}
    </li>
  );
}
