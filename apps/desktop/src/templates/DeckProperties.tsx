import { LANGUAGE_NAMES, type ContentLanguage } from '@slidr/model';
import { FittedSlide } from '@slidr/renderer';
import {
  Button,
  Dialog,
  DialogContent,
  Field,
  ScrollArea,
  SegmentedControl,
  Tabs,
  TabsContent,
  TabsSideItem,
  TabsSideList,
  TextField,
  type LucideIcon,
} from '@slidr/ui';
import {
  ALargeSmall,
  BookmarkPlus,
  FileCog,
  Hash,
  Palette,
  SquareRoundCorner,
  Stamp,
  Type,
  Wallpaper,
} from '@slidr/ui/icons';
import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssetResolver, useDeck, useEditor, useSelection } from '../shell';
import { turnDeck } from './actions';
import { library } from './app';
import {
  Logo,
  Master,
  SaveAsTemplate,
  ThemeColors,
  ThemeFonts,
  ThemeTextStyles,
} from './DeckDesign';
import { BackgroundFields, ShapeFields } from './ThemeLook';

/*
 * The properties of the open deck, from the File menu: what the deck is, its title, language and
 * direction, and how it looks, its colours, fonts and the rest of its design, a page each. The
 * slide on the Stage is behind the dialog, so the current slide is drawn beside the pages and
 * shows every change as it is made. Every change is a step of the deck's undo, made the moment
 * it is made: the dialog has nothing to apply or cancel.
 */

/** The colours of a page's mark: those of the creation tools. */
const TONES = {
  violet: 'bg-ui-tool-violet text-ui-tool-violet-fg',
  blue: 'bg-ui-tool-blue text-ui-tool-blue-fg',
  pink: 'bg-ui-tool-pink text-ui-tool-pink-fg',
  teal: 'bg-ui-tool-teal text-ui-tool-teal-fg',
  green: 'bg-ui-tool-green text-ui-tool-green-fg',
  orange: 'bg-ui-tool-orange text-ui-tool-orange-fg',
  rose: 'bg-ui-tool-rose text-ui-tool-rose-fg',
  /** The one page that is an action and not a setting. */
  accent: 'bg-ui-accent text-ui-on-accent',
};

interface Page {
  id: string;
  /** Its name, a key of the templates' strings. */
  title: string;
  icon: LucideIcon;
  tone: keyof typeof TONES;
  content: ComponentType;
}

const PAGES: readonly Page[] = [
  { id: 'general', title: 'properties.general', icon: FileCog, tone: 'teal', content: General },
  { id: 'colors', title: 'colors.title', icon: Palette, tone: 'pink', content: ThemeColors },
  { id: 'fonts', title: 'fonts.title', icon: Type, tone: 'violet', content: ThemeFonts },
  {
    id: 'styles',
    title: 'styles.title',
    icon: ALargeSmall,
    tone: 'blue',
    content: ThemeTextStyles,
  },
  {
    id: 'shape',
    title: 'shape.title',
    icon: SquareRoundCorner,
    tone: 'green',
    content: ShapeFields,
  },
  {
    id: 'backgrounds',
    title: 'backgrounds.title',
    icon: Wallpaper,
    tone: 'teal',
    content: BackgroundFields,
  },
  { id: 'master', title: 'master.title', icon: Hash, tone: 'orange', content: Master },
  { id: 'logo', title: 'logo.title', icon: Stamp, tone: 'rose', content: Logo },
  { id: 'save', title: 'save.title', icon: BookmarkPlus, tone: 'accent', content: SaveAsTemplate },
];

export function DeckProperties({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('templates');
  const [page, setPage] = useState('general');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={t('properties.title')}
        closeLabel={t('properties.close')}
        size="wide"
        footer={
          <Button variant="primary" onClick={onClose}>
            {t('properties.close')}
          </Button>
        }
        data-testid="deck-properties"
      >
        <Tabs
          value={page}
          onValueChange={setPage}
          orientation="vertical"
          className="flex h-dialog-body gap-5"
        >
          <div className="flex w-60 shrink-0 flex-col gap-4">
            <CurrentSlide />
            <TabsSideList aria-label={t('properties.title')}>
              {PAGES.map(({ id, title, icon, tone }) => (
                <TabsSideItem
                  key={id}
                  value={id}
                  icon={icon}
                  iconClassName={TONES[tone]}
                  label={t(title)}
                  data-properties-tab={id}
                />
              ))}
            </TabsSideList>
          </div>
          {PAGES.map(({ id, title, content: Content }) => (
            <TabsContent
              key={id}
              value={id}
              className="min-w-0 flex-1 data-[state=inactive]:hidden"
              data-properties-page={id}
            >
              <ScrollArea className="h-full">
                {/* A container: a page lays its fields out by its own width. */}
                <div className="@container flex flex-col gap-4 pe-3 pb-1">
                  <h3 className="text-md font-semibold text-ui-fg">{t(title)}</h3>
                  <Content />
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** The slide the user is on, as the Stage behind the dialog has it. */
function CurrentSlide() {
  const deck = useDeck((s) => s.deck);
  const current = useSelection((s) => s.currentSlideId);
  const resolveAsset = useAssetResolver();
  const slide = deck.slides.find((each) => each.id === current) ?? deck.slides[0];
  if (!slide) return null;
  return (
    <div
      aria-hidden
      data-testid="properties-slide"
      className="overflow-hidden rounded-inset border border-ui-line shadow-slide"
    >
      <FittedSlide deck={deck} slide={slide} mode="thumbnail" resolveAsset={resolveAsset} />
    </div>
  );
}

/** What the deck is: its title, its language and its direction. */
function General() {
  return (
    <>
      <TitleField />
      <LanguageLine />
      <DirectionField />
    </>
  );
}

/** The deck's title: a field that is saved when it is left, or on Enter. */
function TitleField() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const stored = useDeck((s) => s.deck.meta.title);
  const [draft, setDraft] = useState(stored);
  // An undo while the dialog is open: what is stored replaces a draft that was not being edited.
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setDraft(stored);
  }

  const commit = () => {
    const next = draft.trim();
    if (next === stored) return;
    editor.bus.dispatch(
      { type: 'deck.setMeta', patch: { title: next } },
      { label: t('undo.title') },
    );
  };

  return (
    <TextField
      label={t('properties.name')}
      hint={t('properties.nameHint')}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
      placeholder={t('app.untitled', { ns: 'shell' })}
      dir="auto"
      data-testid="deck-title"
    />
  );
}

/**
 * The deck's language, shown and not changed here: a deck in another language needs its text
 * translated and its fonts and template version swapped, which the agent does.
 */
function LanguageLine() {
  const { t } = useTranslation('templates');
  const lang = useDeck((s) => s.deck.meta.lang);
  const name = LANGUAGE_NAMES[lang as ContentLanguage]?.native ?? lang;
  return (
    <Field label={t('properties.language')} hint={t('properties.languageHint')}>
      <p className="text-md text-ui-fg" lang={lang} data-testid="deck-language">
        {name}
      </p>
    </Field>
  );
}

function DirectionField() {
  const { t } = useTranslation('templates');
  const editor = useEditor();
  const dir = useDeck((s) => s.deck.meta.dir);
  return (
    <Field label={t('direction.title')} hint={t('direction.hint')}>
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
    </Field>
  );
}
