import { IconButton, Tooltip } from '@slidr/ui';
import { CodeXml, Ungroup } from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { openPanel, useEditor } from '../shell';
import { CODE_PANEL } from './CodePanel';
import { decomposeBlock } from './decompose';
import { openDecomposeDialog } from './DecomposeDialog';
import { ToolGroup } from './parts';
import { isTarget, useTarget } from './target';

/**
 * Row B for an `html` element (HTM-04, HTM-05): its code, and taking it apart into regular
 * elements. An element that cannot be taken apart keeps the button, disabled, with the reason
 * where the name would be: a button that comes and goes says nothing about why.
 */
export function HtmlRow() {
  const { t } = useTranslation('objects');
  const editor = useEditor();
  const target = useTarget();
  if (!isTarget(target, 'html')) return null;
  const { element, slideId } = target;
  const block = decomposeBlock(element);
  const decomposeButton = (
    <IconButton
      icon={Ungroup}
      size="sm"
      label={t('decompose.action')}
      noTooltip={Boolean(block)}
      disabled={Boolean(block)}
      data-testid="html-decompose"
      onClick={() => openDecomposeDialog(editor, slideId, element.id)}
    />
  );
  return (
    <ToolGroup label={t('groups.html')}>
      <IconButton
        icon={CodeXml}
        size="sm"
        label={t('code.open')}
        data-testid="html-code"
        onClick={() => openPanel(CODE_PANEL)}
      />
      {block ? (
        <Tooltip content={t(`decompose.blocked.${block}`)}>
          {/* A disabled button gets no pointer events, so the tooltip hangs on a wrapper. */}
          <span className="inline-flex">{decomposeButton}</span>
        </Tooltip>
      ) : (
        decomposeButton
      )}
    </ToolGroup>
  );
}
