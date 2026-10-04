import { findElement, findSlide, type HtmlElement } from '@slidr/model';
import { Button, EmptyState, Icon, SegmentedControl } from '@slidr/ui';
import { CodeXml, Info, Ungroup } from '@slidr/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '../shell';
import { CodeEditor } from './CodeEditor';
import { decomposeBlock } from './decompose';
import { openDecomposeDialog } from './DecomposeDialog';
import { codeOf, createCodeWriter, type CodePart } from './htmlCode';
import { isTarget, useTarget, type Target } from './target';

/** The id of the code panel in the Tool Panel. */
export const CODE_PANEL = 'code';

const PARTS: readonly CodePart[] = ['markup', 'styles'];

/**
 * The code panel (HTM-04): the HTML and the CSS of the selected `html` element, edited as text.
 * The Stage is the live preview: what is typed is written to the deck as it is typed, so the
 * slide, the Filmstrip and an agent that looks all see the same element.
 */
export function CodePanel() {
  const { t } = useTranslation('objects');
  const target = useTarget();
  if (!isTarget(target, 'html')) {
    return (
      <EmptyState
        icon={CodeXml}
        title={t('code.emptyTitle')}
        description={t('code.emptyBody')}
        className="min-h-80"
      />
    );
  }
  // Another element is another editor: its text, its caret and its undo bursts are its own.
  return <HtmlCode key={target.element.id} target={target} />;
}

function HtmlCode({ target }: { target: Target<HtmlElement> }) {
  const { t } = useTranslation('objects');
  const editor = useEditor();
  const [part, setPart] = useState<CodePart>('markup');
  const { element, slideId } = target;
  const block = decomposeBlock(element);
  return (
    <div data-testid="code-panel" className="flex flex-col gap-3 px-4 pb-4">
      <SegmentedControl
        aria-label={t('code.parts')}
        fill
        options={PARTS.map((value) => ({ value, label: t(`code.${value}`) }))}
        value={part}
        onValueChange={setPart}
      />
      <PartEditor key={part} target={target} part={part} />
      <p className="text-xs text-ui-fg-muted">
        {part === 'styles' ? `${t('code.stylesHint')} ` : ''}
        {t('code.live')}
      </p>
      {element.hasScripts && (
        <p data-testid="code-scripts" className="flex items-start gap-2 text-xs text-ui-fg-muted">
          <Icon icon={Info} className="mt-0.5 shrink-0" />
          {t('code.scripts')}
        </p>
      )}
      <Button
        icon={Ungroup}
        className="self-start"
        disabled={Boolean(block)}
        onClick={() => openDecomposeDialog(editor, slideId, element.id)}
      >
        {t('decompose.action')}
      </Button>
      {block && block !== 'scripts' && (
        <p className="text-xs text-ui-fg-muted">{t(`decompose.blocked.${block}`)}</p>
      )}
    </div>
  );
}

function PartEditor({ target, part }: { target: Target<HtmlElement>; part: CodePart }) {
  const { t } = useTranslation('objects');
  const { bus } = useEditor();
  const { slideId } = target;
  const elementId = target.element.id;
  const label = t('history.code');
  const writer = useMemo(
    () =>
      createCodeWriter({
        bus,
        slideId,
        elementId,
        part,
        label,
        element: () => {
          const slide = findSlide(bus.deck, slideId);
          const element = slide ? findElement(slide, elementId) : undefined;
          return element?.type === 'html' ? element : undefined;
        },
      }),
    [bus, slideId, elementId, part, label],
  );
  // What was typed and not yet written goes in before the editor goes away.
  useEffect(() => () => writer.flush(), [writer]);
  return (
    <CodeEditor
      language={part === 'markup' ? 'html' : 'css'}
      label={t(`code.${part}Label`)}
      value={codeOf(target.element, part)}
      own={writer.own}
      onChange={writer.type}
      onUndo={writer.undo}
      onRedo={writer.redo}
    />
  );
}
