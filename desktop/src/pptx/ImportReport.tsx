import type { ImportWarning } from '@slidr/pptx';
import { Button, Dialog, DialogContent, Field, ScrollArea } from '@slidr/ui';
import { useTranslation } from 'react-i18next';
import { ltr } from '../export/exportDeck';
import { WarningList } from './WarningList';

/** What a PowerPoint import brought (ADR-108): how many slides, and what came in otherwise. */
export function ImportReport({
  name,
  slides,
  warnings,
  onClose,
}: {
  name: string;
  slides: number;
  warnings: ImportWarning[];
  onClose: () => void;
}) {
  const { t } = useTranslation('pptx');
  const { t: te } = useTranslation('export');
  const summary =
    // A file name reads left to right in a sentence of any direction.
    slides === 1
      ? t('import.summaryOne', { name: ltr(name) })
      : t('import.summaryMany', { n: slides, name: ltr(name) });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={t('import.title')}
        description={summary}
        closeLabel={te('close')}
        data-testid="pptx-import-report"
        footer={
          <Button variant="primary" onClick={onClose}>
            {te('close')}
          </Button>
        }
      >
        {warnings.length > 0 && (
          <ScrollArea viewportClassName="max-h-72">
            <div className="pe-3">
              <Field label={te('done.warnings')}>
                <WarningList warnings={warnings} group="imported" testId="pptx-import-warnings" />
              </Field>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
