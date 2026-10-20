import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@slidr/ui';
import { AiTab } from './AiTab';
import { ClipsTab } from './ClipsTab';
import { StockTab } from './StockTab';
import { MEDIA_TABS, setMediaTab, useMedia, type MediaTab } from './store';
import { UploadsTab } from './UploadsTab';

/**
 * The media panel (SPEC 4.2, WG5-T13): the deck's files, stock photos and AI images.
 * Whatever a tab offers goes onto the current slide with a click,
 * as one undo step.
 */
export function MediaPanel() {
  const { t } = useTranslation('media');
  const tab = useMedia((s) => s.tab);
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setMediaTab(value as MediaTab)}
      className="flex flex-col"
      data-testid="media-panel"
    >
      {/* The tabs stay in view while a tab's content scrolls under them. */}
      <TabsList
        aria-label={t('tabs.list')}
        className="sticky top-0 z-10 justify-between gap-1 bg-ui-panel px-3"
      >
        {MEDIA_TABS.map((value) => (
          <TabsTrigger
            key={value}
            value={value}
            data-testid={`media-tab-${value}`}
            className="min-w-0 justify-center whitespace-nowrap px-0.5 text-xs"
          >
            {t(`tabs.${value}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="uploads">
        <UploadsTab />
      </TabsContent>
      {/* Kept mounted, so a search and its results are still there after a look at another tab. */}
      <TabsContent value="stock" forceMount hidden={tab !== 'stock'}>
        <StockTab />
      </TabsContent>
      <TabsContent value="ai">
        <AiTab />
      </TabsContent>
      <TabsContent value="clips">
        <ClipsTab />
      </TabsContent>
    </Tabs>
  );
}
