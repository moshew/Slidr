import { ScaledSlide } from '@slidr/renderer';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { focusStage, tell, useDeck, useEditor, useElementSize } from '../shell';
import { designAssetFile } from './designAssets';
import { DESIGN_IDS, designPreview, insertDesign } from './designs';

/** Ready compositions: a click adds a new slide after the current one, in one undo step. */
export function DesignsCollection() {
  const { t } = useTranslation('elements');
  const editor = useEditor();
  const [busy, setBusy] = useState(false);
  const lang = useDeck((state) => state.deck.meta.lang);
  const previews = useMemo(
    () => DESIGN_IDS.map((id) => ({ id, ...designPreview(id, lang) })),
    [lang],
  );
  const list = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(list);
  const pictureWidth = Math.max(0, Math.floor(width - 24));

  return (
    <div ref={list} className="flex flex-col gap-3" data-testid="elements-designs">
      <p className="text-xs leading-relaxed text-ui-fg-muted">{t('designs.hint')}</p>
      {previews.map(({ id, deck, slide, resolveAsset }) => (
        <button
          key={id}
          type="button"
          data-design={id}
          aria-label={t('designs.insert', { name: t(`designs.name.${id}`) })}
          disabled={busy}
          className="group flex cursor-default flex-col gap-2 rounded-panel border border-ui-line bg-ui-field p-2 text-start transition-[background-color,border-color,box-shadow] hover:border-ui-accent hover:bg-ui-hover hover:shadow-floating focus-visible:outline-2 focus-visible:outline-ui-accent"
          onClick={() => {
            setBusy(true);
            void (async () => {
              try {
                const asset = await editor.assets.import(await designAssetFile(id), 'import');
                insertDesign(
                  editor.bus,
                  editor.selection,
                  id,
                  t(`designs.name.${id}`),
                  t('designs.history'),
                  asset,
                );
                focusStage();
              } catch {
                void tell(t('loadFailed'));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <span
            aria-hidden
            className="block overflow-hidden rounded-inset border border-ui-line shadow-sm"
          >
            {pictureWidth > 0 && (
              <ScaledSlide
                deck={deck}
                slide={slide}
                width={pictureWidth}
                mode="thumbnail"
                resolveAsset={resolveAsset}
              />
            )}
          </span>
          <span className="px-1 pb-0.5 text-sm font-semibold text-ui-fg">
            {t(`designs.name.${id}`)}
          </span>
        </button>
      ))}
    </div>
  );
}
