import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import type { SessionScope } from '@slidr/agent-tools';
import { findElement, findSlide, type Element } from '@slidr/model';
import { ACTIONS, actionMessage, type ActionId, type ActionParams } from '@slidr/prompts';
import {
  Clapperboard,
  Expand,
  Heading,
  ImagePlus,
  Images,
  Languages,
  LayoutTemplate,
  List,
  Megaphone,
  NotebookPen,
  PenLine,
  ScanEye,
  Shapes,
  Shrink,
  SpellCheck,
  Split,
  SquareDashedMousePointer,
  WandSparkles,
  Zap,
  type LucideIcon,
} from '@slidr/ui/icons';
import { Button, EmptyState, Icon, SegmentedControl, Select, Textarea } from '@slidr/ui';
import { TransitionTool } from '../animations/TransitionTool';
import type { ImageProviderState } from '../images/images';
import { BackgroundTool } from '../objects/BackgroundTool';
import { openPanel, PanelId, setAiTab, useDeck, useEditor } from '../shell';
import { actionLabel, LANGUAGES, TONES, type LanguageName, type ToneName } from './actionLabels';
import { useThread } from './Chat';
import { switchLayoutCommands } from './layout';
import { aiOf } from './runtime';
import { useObjectScope, useSlideScope } from './scopes';

/*
 * The Actions tab of the three AI tools (SPEC 4.3; AID-05, AIS-02, AIS-04, AIO-02, AIO-03). An AI
 * action is a template of `@slidr/prompts`, sent to the tool's chat in place of a typed message,
 * so it is part of the conversation; a deterministic control acts at once.
 */

const DECK: SessionScope = { kind: 'deck' };

/* ---------------------------------------------------------------- sending an action */

interface Runner {
  /** Sends an action to its chat and shows the chat. */
  run: (id: ActionId, params?: ActionParams) => void;
  /** The action cannot be sent now: its chat is in a turn, or its session lacks a tool. */
  off: (id: ActionId) => boolean;
  /** The panel's own chat is in a turn. */
  busy: boolean;
}

/** The actions of a panel on `scope`. One that belongs to another scope goes to the deck chat. */
function useRunner(scope: SessionScope): Runner {
  const { t, i18n } = useTranslation('ai');
  const editor = useEditor();
  const ai = aiOf(editor);
  const own = useThread(scope);
  const deck = useMemo(() => ai.sessions.thread(DECK), [ai]);
  const busy = useStore(own.store, (s) => s.busy);
  const deckBusy = useStore(deck.store, (s) => s.busy);
  const elsewhere = (id: ActionId) => ACTIONS[id].scope !== scope.kind;
  return {
    busy,
    off: (id) =>
      (elsewhere(id) ? deckBusy : busy) ||
      !ACTIONS[id].needs.every((tool) => ai.tools(ACTIONS[id].scope).has(tool)),
    run: (id, params = {}) => {
      const action = {
        id,
        params: Object.fromEntries(
          Object.entries(params).filter(([, value]) => value !== undefined),
        ) as Record<string, string | number>,
      };
      const message = actionMessage({
        action: id,
        params,
        replyIn: i18n.language === 'he' ? 'Hebrew' : 'English',
      });
      void (elsewhere(id) ? deck : own).send(message, { action, label: actionLabel(t, action) });
      if (elsewhere(id)) openPanel(PanelId.aiDeck, 'chat');
      else setAiTab('chat');
    },
  };
}

/* ---------------------------------------------------------------- the pieces of a tab */

function Tab({ busy, children }: { busy: boolean; children: ReactNode }) {
  const { t } = useTranslation('ai');
  return (
    <div data-testid="ai-actions" className="flex flex-col gap-5 px-2 pt-3 pb-4">
      {busy && (
        <p role="status" className="px-2 text-sm text-ui-fg-muted">
          {t('actions.busy')}
        </p>
      )}
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-0.5">
      <h3 className="px-2 pb-1 text-xs font-medium text-ui-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

/** One action: a button over the row, and beside it the choice the action takes, if any. */
function Row({
  id,
  icon,
  label,
  runner,
  params,
  children,
}: {
  id: ActionId;
  icon: LucideIcon;
  label: string;
  runner: Runner;
  params?: ActionParams;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        icon={icon}
        disabled={runner.off(id)}
        data-action={id}
        className="min-w-0 flex-1 justify-start"
        onClick={() => runner.run(id, params)}
      >
        <span className="truncate">{label}</span>
      </Button>
      {children}
    </div>
  );
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: LanguageName;
  onChange: (value: LanguageName) => void;
}) {
  const { t } = useTranslation('ai');
  return (
    <Select
      aria-label={t('actions.language')}
      size="sm"
      className="w-28 shrink-0"
      options={LANGUAGES.map((name) => ({ value: name, label: t(`actions.languages.${name}`) }))}
      value={value}
      onValueChange={onChange}
    />
  );
}

/** The language a translation goes to unless the user says otherwise: not the deck's own. */
function useTargetLanguage() {
  const lang = useDeck((s) => s.deck.meta.lang);
  return useState<LanguageName>(lang.startsWith('he') ? 'English' : 'Hebrew');
}

function CountControl({
  value,
  choices,
  onChange,
}: {
  value: number;
  choices: readonly number[];
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation('ai');
  return (
    <SegmentedControl
      aria-label={t('actions.count')}
      size="sm"
      className="shrink-0"
      options={choices.map((n) => ({ value: String(n), label: String(n) }))}
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
    />
  );
}

/** Whether images can be generated: asked before the tool offers it (ADR-025). */
function useImageProvider(): 'checking' | ImageProviderState {
  const { images } = aiOf(useEditor());
  const [state, setState] = useState<'checking' | ImageProviderState>('checking');
  useEffect(() => {
    let current = true;
    images.client
      .defaultProvider()
      .then((id) => images.client.probe(id))
      .then(
        (status) => current && setState(status.state),
        () => current && setState('unavailable'),
      );
    return () => {
      current = false;
    };
  }, [images]);
  return state;
}

/* ---------------------------------------------------------------- the deck tool (AID-05) */

export function DeckActions() {
  const { t } = useTranslation('ai');
  const runner = useRunner(DECK);
  const [language, setLanguage] = useTargetLanguage();
  return (
    <Tab busy={runner.busy}>
      <Section title={t('actions.content')}>
        <Row
          id="deck.translate"
          icon={Languages}
          label={t('actions.translate')}
          runner={runner}
          params={{ language }}
        >
          <LanguageSelect value={language} onChange={setLanguage} />
        </Row>
        <Row id="deck.shorten" icon={Shrink} label={t('actions.shortenDeck')} runner={runner} />
        <Row id="deck.notes" icon={NotebookPen} label={t('actions.notes')} runner={runner} />
      </Section>
      <Section title={t('actions.design')}>
        <Row id="deck.improve" icon={WandSparkles} label={t('actions.improve')} runner={runner} />
        <Row id="deck.fix" icon={ScanEye} label={t('actions.fixFindings')} runner={runner} />
      </Section>
      {/* The place of the template gallery, the palette and the font pair (WG7). */}
      <Section title={t('actions.templates.title')}>
        <p className="flex items-start gap-2 px-2 text-sm text-ui-fg-muted">
          <Icon icon={LayoutTemplate} className="mt-0.5" />
          {t('actions.templates.body')}
        </p>
      </Section>
    </Tab>
  );
}

/* ---------------------------------------------------------------- the slide tool (AIS-02, AIS-04) */

/** The slide's layout, among the layouts of its deck (AIS-04). */
function LayoutControl({ slideId }: { slideId: string }) {
  const { t } = useTranslation('ai');
  const { bus } = useEditor();
  const deck = useDeck((s) => s.deck);
  const layoutId = findSlide(deck, slideId)?.layoutId;
  const current = deck.layouts.find((layout) => layout.id === layoutId);
  if (!current || deck.layouts.length < 2) {
    return <p className="px-2 text-sm text-ui-fg-muted">{t('actions.layoutNone')}</p>;
  }
  return (
    <div className="flex items-center gap-2 px-2">
      <Icon icon={LayoutTemplate} className="text-ui-fg-muted" />
      <span className="min-w-0 flex-1 truncate text-sm">{t('actions.layout')}</span>
      <Select
        aria-label={t('actions.layoutLabel')}
        size="sm"
        className="w-40 shrink-0"
        options={deck.layouts.map((layout) => ({ value: layout.id, label: layout.name }))}
        value={current.id}
        onValueChange={(next) =>
          bus.batch(switchLayoutCommands(bus.deck, slideId, next), { label: t('actions.layout') })
        }
      />
    </div>
  );
}

function SlideActionsOn({ scope }: { scope: SessionScope & { kind: 'slide' } }) {
  const { t } = useTranslation('ai');
  const runner = useRunner(scope);
  const provider = useImageProvider();
  const [language, setLanguage] = useTargetLanguage();
  const number = useDeck((s) => s.deck.slides.findIndex((slide) => slide.id === scope.slideId) + 1);
  return (
    <Tab busy={runner.busy}>
      <Section title={t('actions.design')}>
        <Row
          id="slide.redesign"
          icon={WandSparkles}
          label={t('actions.redesign')}
          runner={runner}
          params={{ count: 3 }}
        />
        <Row id="slide.visual" icon={Shapes} label={t('actions.visual')} runner={runner} />
        {provider === 'ready' && (
          <Row id="slide.image" icon={ImagePlus} label={t('actions.addImage')} runner={runner} />
        )}
        <Row id="slide.animate" icon={Clapperboard} label={t('actions.animate')} runner={runner} />
        <Row id="slide.fix" icon={ScanEye} label={t('actions.fixFindings')} runner={runner} />
      </Section>
      <Section title={t('actions.content')}>
        <Row id="slide.shorten" icon={Shrink} label={t('actions.shortenSlide')} runner={runner} />
        <Row
          id="slide.split"
          icon={Split}
          label={t('actions.split')}
          runner={runner}
          params={{ slideId: scope.slideId, slideNumber: number }}
        />
        <Row id="slide.notes" icon={NotebookPen} label={t('actions.notes')} runner={runner} />
        <Row
          id="slide.translate"
          icon={Languages}
          label={t('actions.translate')}
          runner={runner}
          params={{ language }}
        >
          <LanguageSelect value={language} onChange={setLanguage} />
        </Row>
      </Section>
      {/* The controls that are not AI (AIS-04): the same ones row B has for a slide. */}
      <Section title={t('actions.slideSettings')}>
        <LayoutControl slideId={scope.slideId} />
        <div className="flex flex-wrap items-center gap-1">
          <BackgroundTool />
          <TransitionTool />
        </div>
      </Section>
    </Tab>
  );
}

export function SlideActions() {
  const { t } = useTranslation('ai');
  const scope = useSlideScope();
  if (!scope) {
    return (
      <EmptyState
        icon={Zap}
        title={t('noSlide.title')}
        description={t('noSlide.body')}
        className="min-h-64"
      />
    );
  }
  return <SlideActionsOn key={scope.slideId} scope={scope} />;
}

/* ---------------------------------------------------------------- the object tool (AIO-02, AIO-03) */

function TextActions({ runner }: { runner: Runner }) {
  const { t } = useTranslation('ai');
  const [count, setCount] = useState(4);
  const [tone, setTone] = useState<ToneName>('formal');
  const [language, setLanguage] = useTargetLanguage();
  return (
    <>
      <Section title={t('actions.wording')}>
        <Row
          id="text.variations"
          icon={PenLine}
          label={t('actions.variations')}
          runner={runner}
          params={{ count }}
        >
          <CountControl value={count} choices={[3, 4, 6]} onChange={setCount} />
        </Row>
        <Row
          id="text.title"
          icon={Heading}
          label={t('actions.titles')}
          runner={runner}
          params={{ count }}
        />
      </Section>
      <Section title={t('actions.edit')}>
        <Row id="text.shorten" icon={Shrink} label={t('actions.shorten')} runner={runner} />
        <Row id="text.expand" icon={Expand} label={t('actions.expand')} runner={runner} />
        <Row id="text.fix" icon={SpellCheck} label={t('actions.fix')} runner={runner} />
        <Row id="text.bullets" icon={List} label={t('actions.bullets')} runner={runner} />
        <Row
          id="text.tone"
          icon={Megaphone}
          label={t('actions.tone')}
          runner={runner}
          params={{ tone }}
        >
          <Select
            aria-label={t('actions.toneChoice')}
            size="sm"
            className="w-28 shrink-0"
            options={TONES.map((name) => ({ value: name, label: t(`actions.tones.${name}`) }))}
            value={tone}
            onValueChange={setTone}
          />
        </Row>
        <Row
          id="text.translate"
          icon={Languages}
          label={t('actions.translate')}
          runner={runner}
          params={{ language }}
        >
          <LanguageSelect value={language} onChange={setLanguage} />
        </Row>
      </Section>
    </>
  );
}

function ImageActions({ runner }: { runner: Runner }) {
  const { t } = useTranslation('ai');
  const provider = useImageProvider();
  const [count, setCount] = useState(4);
  const [description, setDescription] = useState('');
  const wanted = description.trim();
  return (
    <Section title={t('actions.image')}>
      <div className="flex flex-col gap-1.5 px-2 pb-2">
        <Textarea
          dir={description ? 'auto' : undefined}
          value={description}
          aria-label={t('actions.imagePrompt')}
          placeholder={t('actions.imagePrompt')}
          disabled={provider !== 'ready'}
          data-testid="image-prompt"
          onChange={(event) => setDescription(event.target.value)}
        />
        <p className="text-xs text-ui-fg-muted">{t('actions.imagePromptHint')}</p>
      </div>
      {provider === 'ready' ? (
        <Row
          id="image.alternatives"
          icon={Images}
          label={t('actions.alternatives')}
          runner={runner}
          params={{ count, ...(wanted ? { description: wanted } : {}) }}
        >
          <CountControl value={count} choices={[2, 4]} onChange={setCount} />
        </Row>
      ) : null}
      <p
        role="status"
        data-testid="image-provider"
        data-state={provider}
        className="px-2 pt-1 text-xs text-ui-fg-muted"
      >
        {t(`actions.provider.${provider}`)}
      </p>
    </Section>
  );
}

/** Text is what a text box holds, and a shape that has some. */
function actionsFor(element: Element | undefined): 'text' | 'image' | 'none' {
  if (element?.type === 'text') return 'text';
  if (element?.type === 'shape' && element.content) return 'text';
  if (element?.type === 'image') return 'image';
  return 'none';
}

function ObjectActionsOn({ scope }: { scope: SessionScope & { kind: 'object' } }) {
  const { t } = useTranslation('ai');
  const runner = useRunner(scope);
  // The actions are for one element; a chat is for any selection.
  const kind = useDeck((s) => {
    const slide = findSlide(s.deck, scope.slideId);
    const only = scope.elementIds.length === 1 ? scope.elementIds[0] : undefined;
    return actionsFor(slide && only ? findElement(slide, only) : undefined);
  });
  return (
    <Tab busy={runner.busy}>
      {kind === 'text' ? (
        <TextActions runner={runner} />
      ) : kind === 'image' ? (
        <ImageActions runner={runner} />
      ) : (
        <EmptyState
          icon={Zap}
          title={t('actions.noActions.title')}
          description={t('actions.noActions.body')}
          className="min-h-64"
        />
      )}
    </Tab>
  );
}

export function ObjectActions() {
  const { t } = useTranslation('ai');
  const scope = useObjectScope();
  if (!scope) {
    return (
      <EmptyState
        icon={SquareDashedMousePointer}
        title={t('noSelection.title')}
        description={t('noSelection.body')}
        className="min-h-64"
      />
    );
  }
  return <ObjectActionsOn key={scope.elementIds.join(' ')} scope={scope} />;
}
