import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, SearchX, TriangleAlert } from '@slidr/ui/icons';
import { cx, EmptyState, Input, SegmentedControl, Skeleton, Tooltip } from '@slidr/ui';
import { ListEnd } from '../elements/StickerGrid';
import { tell, useEditor } from '../shell';
import { findIcons, starterIcons, type FoundIcon } from './icons/library';
import { insertIcon } from './insert';

type Style = 'line' | 'filled';

/** How many icons a search shows: a few screens of the grid. */
const COUNT = 120;
/** Keep the first paint small even though the browse list has hundreds of icons. */
const PAGE = 60;
/** How long after the last key the search runs. */
const PAUSE_MS = 150;

type View = { state: 'loading' } | { state: 'failed' } | { state: 'icons'; icons: FoundIcon[] };

/**
 * The icon collection in Elements (SHP-07, GEN-09, WG5-T11): search in Hebrew or in English,
 * and add an icon to the slide with a click. It follows the theme's colour.
 * The library's data is loaded when this tab first opens, not with the app.
 */
export function IconsTab() {
  const { t } = useTranslation('media');
  const editor = useEditor();
  const [text, setText] = useState('');
  const [style, setStyle] = useState<Style>('line');
  const [view, setView] = useState<View>({ state: 'loading' });
  const [shown, setShown] = useState(PAGE);
  const more = useCallback(() => setShown((count) => count + PAGE), []);

  useEffect(() => {
    let current = true;
    const query = text.trim();
    const timer = setTimeout(
      () => {
        // Before a query: common icons first, then the larger browse catalog.
        const found = query ? findIcons(query, { count: COUNT, style }) : starterIcons(style);
        found
          .then((icons) => current && setView({ state: 'icons', icons }))
          .catch(() => current && setView({ state: 'failed' }));
      },
      query ? PAUSE_MS : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, style]);

  return (
    <div className="flex flex-col gap-4" data-testid="elements-icons">
      <div className="flex flex-col gap-2">
        <Input
          icon={Search}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setShown(PAGE);
          }}
          placeholder={t('icons.placeholder')}
          aria-label={t('icons.search')}
          data-testid="icon-query"
        />
        <SegmentedControl<Style>
          aria-label={t('icons.style')}
          size="sm"
          fill
          value={style}
          onValueChange={(next) => {
            setStyle(next);
            setShown(PAGE);
          }}
          options={[
            { value: 'line', label: t('icons.line') },
            { value: 'filled', label: t('icons.filled') },
          ]}
        />
      </div>
      {view.state === 'loading' && (
        <div className="element-grid" data-size="icon" aria-busy>
          {Array.from({ length: 24 }, (_, i) => (
            <Skeleton key={i} className="m-1 aspect-square" />
          ))}
        </div>
      )}
      {view.state === 'failed' && (
        <EmptyState
          icon={TriangleAlert}
          tone="error"
          title={t('icons.loadFailed')}
          className="min-h-48"
        />
      )}
      {view.state === 'icons' && view.icons.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={t('icons.emptyTitle')}
          description={t('icons.emptyBody')}
          className="min-h-48"
        />
      )}
      {view.state === 'icons' && view.icons.length > 0 && (
        <>
          <div
            role="group"
            aria-label={t('icons.list')}
            className="element-grid"
            data-size="icon"
            data-testid="icon-results"
          >
            {view.icons.slice(0, shown).map((icon) => (
              <Tooltip key={icon.id} content={icon.name}>
                <button
                  type="button"
                  aria-label={t('icons.insert', { name: icon.name })}
                  data-icon={icon.id}
                  onClick={() => {
                    if (!insertIcon(editor, icon)) void tell(t('noSlide'));
                  }}
                  className={cx(
                    'flex aspect-square cursor-default items-center justify-center rounded-control text-ui-fg transition-colors',
                    'hover:bg-ui-hover active:bg-ui-pressed focus-visible:-outline-offset-2',
                    '[&>svg]:size-7',
                  )}
                  // The library's own markup: paths in `currentColor`, built in `library.ts`.
                  dangerouslySetInnerHTML={{ __html: icon.svg }}
                />
              </Tooltip>
            ))}
          </div>
          {view.icons.length > shown && <ListEnd onReach={more} at={shown} />}
          <p className="text-xs text-ui-fg-muted">{t('icons.hint')}</p>
        </>
      )}
    </div>
  );
}
