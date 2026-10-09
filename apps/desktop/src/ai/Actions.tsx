import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import type { ImageAspect, ImageProviderInfo } from '@slidr/agent-tools';
import { findElement, findSlide, type Element } from '@slidr/model';
import { ACTIONS, actionMessage, type ActionId, type ActionParams } from '@slidr/prompts';
import { shapePresets } from '@slidr/renderer';
import {
  Brush,
  ChartColumn,
  Clapperboard,
  ClipboardPaste,
  Crop,
  Expand,
  Heading,
  ImagePlus,
  Images,
  Languages,
  LayoutTemplate,
  Lightbulb,
  List,
  Megaphone,
  NotebookPen,
  Palette,
  PenLine,
  Replace,
  ScanEye,
  Shapes,
  Shrink,
  SpellCheck,
  Split,
  WandSparkles,
  type LucideIcon,
} from '@slidr/ui/icons';
import { Button, Icon, IconButton, SegmentedControl, Select, Textarea, Toggle } from '@slidr/ui';
import type { Attachment } from '../agent/agentService';
import { TransitionTool } from '../animations/TransitionTool';
import { expandImage, useExpandWorking } from '../images/expand';
import type { ImageProviderState } from '../images/images';
import { paintMask } from '../images/MaskPainter';
import { UpscaleTool } from '../images/UpscaleTool';
import { BackgroundTool } from '../objects/BackgroundTool';
import {
  AdjustTool,
  AsBackgroundTool,
  CutoutTool,
  FilterTool,
  MaskTool,
} from '../objects/imageTools';
import { isTarget, useTarget } from '../objects/target';
import { focusStage, setAiTab, tell, useDeck, useEditor } from '../shell';
import { actionLabel, LANGUAGES, TONES, type LanguageName, type ToneName } from './actionLabels';
import { useThread } from './Chat';
import { DeckLook } from './DeckLook';
import { useKept } from './kept';
import { TemplateForm } from './TemplateForm';
import { switchLayoutCommands } from './layout';
import { aiOf } from './runtime';
import { DECK } from './sessions';
import { useFocus } from './focus';

/*
 * The Actions tab of the AI tool (SPEC 4.3; AID-05, AIS-02, AIS-04, AIO-02 to AIO-08; ADR-072):
 * what the user has selected first, then the slide on the Stage, then the whole deck. An AI action
 * is a template of `@slidr/prompts`, sent to the one chat in place of a typed message, with the
 * slide or the element it is about; a deterministic control acts at once.
 */

/* ---------------------------------------------------------------- sending an action */

export interface Runner {
  /** Sends an action to the chat, with the files its form took, and shows the chat. */
  run: (id: ActionId, params?: ActionParams, attachments?: readonly Attachment[]) => void;
  /** The action cannot be sent now: the chat is in a turn, or its session lacks a tool. */
  off: (id: ActionId) => boolean;
  /** The chat is in a turn. */
  busy: boolean;
}

/** Longest text of a form that is kept with the chat's entry: a pasted page is in the message. */
const MAX_KEPT = 600;

/** What the actions of a group are about: nothing (the deck), a slide, or an element on it. */
interface About {
  slideId?: string;
  slideNumber?: number;
  elementId?: string;
}

/** The actions of a group, sent to the chat about what the group is about. */
function useRunner(about: About = {}): Runner {
  const { t, i18n } = useTranslation('ai');
  const ai = aiOf(useEditor());
  const thread = useThread(DECK);
  const busy = useStore(thread.store, (s) => s.busy);
  const tools = ai.tools('deck');
  return {
    busy,
    off: (id) => busy || !ACTIONS[id].needs.every((tool) => tools.has(tool)),
    run: (id, params = {}, attachments = []) => {
      const all: ActionParams = { ...about, ...params };
      const action = {
        id,
        // What the chat shows of the form: its numbers and its words.
        params: Object.fromEntries(
          Object.entries(all).filter(
            ([, value]) =>
              typeof value === 'number' || (typeof value === 'string' && value.length <= MAX_KEPT),
          ),
        ) as Record<string, string | number>,
      };
      const message = actionMessage({
        action: id,
        params: all,
        replyIn: i18n.language === 'he' ? 'Hebrew' : 'English',
      });
      void thread.send(message, {
        action,
        label: actionLabel(t, action),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      // The conversation the action went to: the deck's, also from the one of an import.
      ai.sessions.chat.setState('deck', true);
      setAiTab('chat');
    },
  };
}

/* ---------------------------------------------------------------- the pieces of a tab */

/** What a part of the tab is about: the selection, the slide, the deck. */
function Group({
  id,
  title,
  children,
}: {
  id: 'selection' | 'slide' | 'deck';
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-group={id}
      className="flex flex-col gap-4 border-t border-ui-line pt-3 first:border-t-0 first:pt-0"
    >
      <h3 className="px-2 text-sm font-semibold text-ui-fg">{title}</h3>
      {children}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-0.5">
      <h4 className="px-2 pb-1 text-xs font-medium text-ui-fg-muted">{title}</h4>
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

/* ---------------------------------------------------------------- the deck (AID-05) */

function DeckActions() {
  const { t } = useTranslation('ai');
  const runner = useRunner();
  const [language, setLanguage] = useTargetLanguage();
  return (
    <Group id="deck" title={t('actions.groupDeck')}>
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
      {/* The template gallery, the palettes and the font pairs: the user's own edits, not AI. */}
      <DeckLook />
      <TemplateForm runner={runner} />
    </Group>
  );
}

/* ---------------------------------------------------------------- the slide on the Stage (AIS-02, AIS-04) */

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

function SlideActions({ slideId, slideNumber }: { slideId: string; slideNumber: number }) {
  const { t } = useTranslation('ai');
  const runner = useRunner({ slideId, slideNumber });
  const provider = useImageProvider();
  const [language, setLanguage] = useTargetLanguage();
  return (
    <Group id="slide" title={t('actions.groupSlide', { n: slideNumber })}>
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
        <Row id="slide.split" icon={Split} label={t('actions.split')} runner={runner} />
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
        <LayoutControl slideId={slideId} />
        <div className="flex flex-wrap items-center gap-1">
          <BackgroundTool />
          <TransitionTool />
        </div>
      </Section>
    </Group>
  );
}

/* ---------------------------------------------------------------- the selection (AIO-02 to AIO-05) */

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

/** What the image provider in use does to an image it is asked to edit (ADR-025). */
function useEditSupport(): ImageProviderInfo | undefined {
  const { images } = aiOf(useEditor());
  const [info, setInfo] = useState<ImageProviderInfo>();
  useEffect(() => {
    let current = true;
    images.service.describe?.().then(
      (found) => current && setInfo(found),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [images]);
  return info;
}

const ASPECTS: readonly ImageAspect[] = ['16:9', '4:3', '1:1', '3:4', '9:16'];

/**
 * Extends the picture past its edges to another shape (AIO-04). Not a message to the agent: the
 * app prepares the canvas and the mask and asks the image provider itself, and the result takes
 * the picture's place as one undo step.
 */
function ExpandRow({ elementId, disabled }: { elementId: string; disabled: boolean }) {
  const { t } = useTranslation('ai');
  const editor = useEditor();
  const working = useExpandWorking(elementId);
  const [aspect, setAspect] = useState<ImageAspect>('16:9');
  const run = () => {
    expandImage(editor, elementId, aspect, t('actions.expandLabel')).then(
      (done) => !done && void tell(t('actions.expandSame')),
      (error: unknown) =>
        void tell(t('actions.expandFailed'), error instanceof Error ? error.message : undefined),
    );
  };
  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          icon={Expand}
          loading={working}
          disabled={disabled || working}
          data-testid="image-expand"
          className="min-w-0 flex-1 justify-start"
          onClick={run}
        >
          <span className="truncate">{t('actions.expandImage')}</span>
        </Button>
        <Select
          aria-label={t('actions.expandTo')}
          size="sm"
          className="w-20 shrink-0"
          options={ASPECTS.map((value) => ({ value, label: value }))}
          value={aspect}
          onValueChange={setAspect}
        />
      </div>
      <p className="px-2 text-xs text-ui-fg-muted">{t('actions.expandHint')}</p>
    </>
  );
}

function ImageActions({ runner }: { runner: Runner }) {
  const { t } = useTranslation('ai');
  const editor = useEditor();
  const provider = useImageProvider();
  const support = useEditSupport();
  const target = useTarget();
  const image = isTarget(target, 'image') ? target : undefined;
  const assetId = image?.element.assetId;
  const asset = useDeck((s) => (assetId ? s.deck.assets[assetId] : undefined));
  const [count, setCount] = useState(4);
  // The words and the painted area are kept while the panel shows the chat or another panel:
  // a prompt takes thought and an area takes work, and both were lost with a look elsewhere.
  const of = image?.element.id ?? '';
  const [description, setDescription] = useKept(`image.prompt:${of}`, '');
  /** The area the user painted for an edit, and the picture it was painted on. */
  const [mask, setMask] = useKept<{ assetId: string; of: string } | null>(`image.mask:${of}`, null);
  /** An action that is sent takes what the form holds, and the form starts over. */
  const sending: Runner = {
    ...runner,
    run: (...sent) => {
      runner.run(...sent);
      setDescription('');
      setMask(null);
    },
  };
  const wanted = description.trim();
  // A mask is of one picture: once the element shows another, it no longer applies.
  const maskId = mask && mask.of === assetId ? mask.assetId : undefined;
  const editing = provider === 'ready' && assetId !== undefined && support !== undefined;

  const paint = async () => {
    if (!asset?.width || !assetId) return;
    const painted = await paintMask(editor, asset);
    if (painted) setMask({ assetId: painted.id, of: assetId });
  };

  return (
    <>
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
            runner={sending}
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
      {/* Editing the picture that is there (AIO-04): what it is depends on the provider. */}
      {editing && (
        <Section title={t('actions.imageEdit')}>
          {support.edit !== 'none' && (
            <>
              <Row
                id="image.edit"
                icon={WandSparkles}
                label={t('actions.editImage')}
                // The change is what the user wrote: without words there is nothing to ask for.
                runner={{ ...sending, off: (id) => runner.off(id) || !wanted }}
                params={{ description: wanted, ...(maskId ? { maskAssetId: maskId } : {}) }}
              >
                {support.mask && (
                  <Toggle
                    icon={Brush}
                    size="sm"
                    label={maskId ? t('actions.maskClear') : t('actions.paintMask')}
                    pressed={Boolean(maskId)}
                    disabled={!asset?.width}
                    data-testid="image-mask"
                    onPressedChange={(on) => (on ? void paint() : setMask(null))}
                  />
                )}
              </Row>
              {maskId && (
                <p role="status" data-testid="image-mask-set" className="px-2 text-xs text-ui-fg">
                  {t('actions.maskSet')}
                </p>
              )}
              <Row id="image.restyle" icon={Palette} label={t('actions.restyle')} runner={runner} />
            </>
          )}
          {/* Extending needs an exact edit inside a mask: offered only where it can be done. */}
          {support.edit === 'exact' && support.mask && image && (
            <ExpandRow elementId={image.element.id} disabled={runner.busy || !asset?.width} />
          )}
          <p
            data-testid="image-edit-kind"
            data-kind={support.edit}
            className="px-2 pt-1 text-xs text-ui-fg-muted"
          >
            {t(`actions.editKind.${support.edit}`)}
          </p>
        </Section>
      )}
      {/* The controls that are not AI (AIO-05): the same ones row B has for an image. */}
      {image && (
        <Section title={t('actions.imageLocal')}>
          <div data-testid="image-local" className="flex flex-wrap items-center gap-0.5 px-2">
            <IconButton
              icon={Crop}
              size="sm"
              label={t('actions.crop')}
              disabled={!asset?.width}
              onClick={() => {
                editor.selection.getState().startEditing(image.element.id);
                focusStage();
              }}
            />
            <MaskTool target={image} />
            <AdjustTool target={image} />
            <FilterTool target={image} />
            <CutoutTool target={image} />
            <UpscaleTool elementId={image.element.id} assetId={image.element.assetId} />
            <AsBackgroundTool target={image} />
          </div>
        </Section>
      )}
    </>
  );
}

/**
 * The text a chart or a table is filled from (AIO-07, AIO-08): the user pastes it, and the agent
 * finds the numbers or the items in it. Without a text there is nothing to fill from.
 */
function FillFromText({
  id,
  elementId,
  label,
  placeholder,
  runner,
}: {
  id: 'chart.fill' | 'table.fill';
  /** The chart or the table: the text that was pasted for it is kept for it. */
  elementId: string;
  label: string;
  placeholder: string;
  runner: Runner;
}) {
  const { t } = useTranslation('ai');
  // Kept while the panel shows the chat or another panel, and until it is sent.
  const [source, setSource] = useKept(`${id}:${elementId}`, '');
  const pasted = source.trim();
  return (
    <Section title={t('actions.fromText')}>
      <div className="flex flex-col gap-1.5 px-2 pb-2">
        <Textarea
          dir={source ? 'auto' : undefined}
          value={source}
          aria-label={placeholder}
          placeholder={placeholder}
          data-testid="fill-source"
          onChange={(event) => setSource(event.target.value)}
        />
        <p className="text-xs text-ui-fg-muted">{t('actions.fromTextHint')}</p>
      </div>
      <Row
        id={id}
        icon={ClipboardPaste}
        label={label}
        runner={{
          ...runner,
          off: (action) => runner.off(action) || !pasted,
          run: (...sent) => {
            runner.run(...sent);
            setSource('');
          },
        }}
        params={{ description: pasted }}
      />
    </Section>
  );
}

function ChartActions({ runner, elementId }: { runner: Runner; elementId: string }) {
  const { t } = useTranslation('ai');
  const [count, setCount] = useState(4);
  return (
    <>
      <Section title={t('actions.chart')}>
        <Row
          id="chart.type"
          icon={ChartColumn}
          label={t('actions.chartType')}
          runner={runner}
          params={{ count: 3 }}
        />
        <Row
          id="chart.title"
          icon={Lightbulb}
          label={t('actions.chartTitle')}
          runner={runner}
          params={{ count }}
        >
          <CountControl value={count} choices={[3, 4, 6]} onChange={setCount} />
        </Row>
      </Section>
      <FillFromText
        id="chart.fill"
        elementId={elementId}
        label={t('actions.chartFill')}
        placeholder={t('actions.chartSource')}
        runner={runner}
      />
    </>
  );
}

function TableActions({ runner, elementId }: { runner: Runner; elementId: string }) {
  const { t } = useTranslation('ai');
  return (
    <>
      <FillFromText
        id="table.fill"
        elementId={elementId}
        label={t('actions.tableFill')}
        placeholder={t('actions.tableSource')}
        runner={runner}
      />
      <Section title={t('actions.design')}>
        <Row
          id="table.style"
          icon={Palette}
          label={t('actions.tableStyle')}
          runner={runner}
          params={{ count: 3 }}
        />
      </Section>
      {/* What changes the slide around the table, and not only the table. */}
      <Section title={t('actions.onSlide')}>
        <Row
          id="table.insight"
          icon={Lightbulb}
          label={t('actions.tableInsight')}
          runner={runner}
          params={{ elementId }}
        />
        <Row
          id="table.chart"
          icon={ChartColumn}
          label={t('actions.tableChart')}
          runner={runner}
          params={{ elementId }}
        />
        <p className="px-2 pt-1 text-xs text-ui-fg-muted">{t('actions.onSlideHint')}</p>
      </Section>
    </>
  );
}

/**
 * A shape or an icon (AIO-06). Each of its actions is a choice (another shape, another icon,
 * a colouring from the theme), so each comes back as cards.
 */
function ShapeActions({ runner, icon }: { runner: Runner; icon: boolean }) {
  const { t } = useTranslation('ai');
  return (
    <Section title={t(icon ? 'actions.icon' : 'actions.shape')}>
      {icon ? (
        <Row
          id="icon.replace"
          icon={Replace}
          label={t('actions.iconReplace')}
          runner={runner}
          params={{ count: 4 }}
        />
      ) : (
        <Row
          id="shape.suggest"
          icon={Shapes}
          label={t('actions.shapeSuggest')}
          runner={runner}
          // The shapes the renderer draws: the agent is told their names with the request.
          params={{ count: 3, shapes: shapePresets }}
        />
      )}
      <Row
        id="shape.colour"
        icon={Palette}
        label={t('actions.colourByTheme')}
        runner={runner}
        params={{ count: 3 }}
      />
    </Section>
  );
}

type ActionKind = 'text' | 'textShape' | 'image' | 'chart' | 'table' | 'shape' | 'icon' | 'none';

/** Text is what a text box holds, and a shape that has some: such a shape has both kinds. */
function actionsFor(element: Element | undefined): ActionKind {
  if (element?.type === 'text') return 'text';
  if (element?.type === 'shape') return element.content ? 'textShape' : 'shape';
  if (element?.type === 'svg') return 'icon';
  if (element?.type === 'image' || element?.type === 'chart' || element?.type === 'table') {
    return element.type;
  }
  return 'none';
}

/** The actions for what is selected: one text, image, chart, table, shape or icon. */
function SelectionActions({
  slideId,
  elementIds,
}: {
  slideId: string;
  elementIds: readonly string[];
}) {
  const { t } = useTranslation('ai');
  const only = elementIds.length === 1 ? elementIds[0] : undefined;
  // The actions are for one element; the chat is for any selection.
  const kind = useDeck((s) => {
    const slide = findSlide(s.deck, slideId);
    return actionsFor(slide && only ? findElement(slide, only) : undefined);
  });
  const runner = useRunner(only ? { slideId, elementId: only } : { slideId });
  return (
    <Group id="selection" title={t('actions.groupSelection')}>
      {kind === 'text' ? (
        <TextActions runner={runner} />
      ) : kind === 'textShape' ? (
        <>
          <TextActions runner={runner} />
          <ShapeActions runner={runner} icon={false} />
        </>
      ) : kind === 'shape' || kind === 'icon' ? (
        <ShapeActions runner={runner} icon={kind === 'icon'} />
      ) : kind === 'image' ? (
        <ImageActions runner={runner} />
      ) : kind === 'chart' ? (
        <ChartActions runner={runner} elementId={only!} />
      ) : kind === 'table' ? (
        <TableActions runner={runner} elementId={only!} />
      ) : (
        <p data-testid="no-actions" className="px-2 text-sm text-ui-fg-muted">
          {t('actions.noActions')}
        </p>
      )}
    </Group>
  );
}

/**
 * The Actions tab: the selection, the slide on the Stage and the deck, each in a group of its
 * own. A group is drawn anew for another slide or another selection, so no choice made in a
 * form (a count, a tone, a painted mask) carries over to something else.
 */
export function AiActions() {
  const { t } = useTranslation('ai');
  const focus = useFocus();
  const runner = useRunner();
  return (
    <div data-testid="ai-actions" className="flex flex-col gap-5 px-2 pt-3 pb-4">
      {runner.busy && (
        <p role="status" className="px-2 text-sm text-ui-fg-muted">
          {t('actions.busy')}
        </p>
      )}
      {focus.slideId && focus.elementIds.length > 0 && (
        <SelectionActions
          key={focus.elementIds.join(' ')}
          slideId={focus.slideId}
          elementIds={focus.elementIds}
        />
      )}
      {focus.slideId && (
        <SlideActions key={focus.slideId} slideId={focus.slideId} slideNumber={focus.slideNumber} />
      )}
      <DeckActions />
    </div>
  );
}
