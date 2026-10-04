import type { HtmlElement } from '@slidr/model';
import { ContextMenuItem } from '@slidr/ui';
import { CodeXml, ImageUp, Ungroup } from '@slidr/ui/icons';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { openPanel, useEditor, useSelection, type ContextToolProps } from '../shell';
import { CODE_PANEL } from './CodePanel';
import { decomposeBlock } from './decompose';
import { openDecomposeDialog } from './DecomposeDialog';
import { replaceImage } from './replace';
import { isTarget, useTarget } from './target';

/*
 * The tools of an image and of an `html` element in the Stage's right-click menu (STG-06), after
 * the element's own way in (crop, edit the text). Each item calls what its row B button calls.
 */

/** Nothing for a locked element, nor while it is edited in place: the menu is the text's then. */
function useUnlockedTarget() {
  const target = useTarget();
  const editingId = useSelection((s) => s.editingElementId);
  if (!target || target.element.locked || editingId === target.element.id) return undefined;
  return target;
}

/** "Replace image…", for a picture. */
export function ImageMenuItems(_: ContextToolProps) {
  const { t } = useTranslation('objects');
  const editor = useEditor();
  const target = useUnlockedTarget();
  if (!isTarget(target, 'image')) return null;
  const replace = () =>
    replaceImage(editor, target, { history: t('history.replace'), failed: t('insert.failed') });
  return (
    <ContextMenuItem icon={ImageUp} onSelect={() => void replace()}>
      {t('image.replace')}
    </ContextMenuItem>
  );
}

/** "Edit the code" and "Decompose into objects", for an `html` element. */
export function HtmlMenuItems(_: ContextToolProps) {
  const { t } = useTranslation('objects');
  const editor = useEditor();
  const target = useUnlockedTarget();
  const reasonId = useId();
  if (!isTarget(target, 'html')) return null;
  const { element, slideId }: { element: HtmlElement; slideId: string } = target;
  const block = decomposeBlock(element);
  return (
    <>
      <ContextMenuItem icon={CodeXml} onSelect={() => openPanel(CODE_PANEL)}>
        {t('code.open')}
      </ContextMenuItem>
      <ContextMenuItem
        icon={Ungroup}
        disabled={Boolean(block)}
        aria-describedby={block ? reasonId : undefined}
        onSelect={() => openDecomposeDialog(editor, slideId, element.id)}
      >
        {t('decompose.action')}
      </ContextMenuItem>
      {/* Why it cannot be decomposed, as row B's tooltip says it: an item that is just grey says nothing. */}
      {block && (
        <p id={reasonId} className="max-w-72 ps-8 pe-2 pb-1 text-xs text-ui-fg-muted">
          {t(`decompose.blocked.${block}`)}
        </p>
      )}
    </>
  );
}
