import { Icon } from '@slidr/ui';
import { CircleAlert, TriangleAlert } from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { useEditor } from '../shell';
import { checkOf } from './app';

/**
 * The design check's mark on a thumbnail of the Filmstrip (FLM-04): a slide with errors gets the
 * red mark, one with warnings the amber one; notes are information and get none, as in the
 * status bar. A screen reader hears the count as the thumbnail's description.
 */
export function SlideFindingsMark({ slideId }: { slideId: string }) {
  const { t } = useTranslation('lint');
  // As one string, so the thumbnail draws again only when its own counts change.
  const counts = useStore(checkOf(useEditor()).state, ({ findings }) => {
    let errors = 0;
    let warnings = 0;
    for (const finding of findings) {
      if (finding.slideId !== slideId) continue;
      if (finding.severity === 'error') errors++;
      else if (finding.severity === 'warning') warnings++;
    }
    return `${errors} ${warnings}`;
  });
  const [errors = 0, warnings = 0] = counts.split(' ').map(Number);
  if (errors + warnings === 0) return null;
  const error = errors > 0;
  const label = error
    ? errors === 1
      ? t('status.error')
      : t('status.errors', { count: errors })
    : warnings === 1
      ? t('status.finding')
      : t('status.findings', { count: warnings });
  return (
    <span
      data-testid="slide-findings-mark"
      data-severity={error ? 'error' : 'warning'}
      className="inline-flex items-center"
    >
      <Icon
        icon={error ? CircleAlert : TriangleAlert}
        className={error ? 'text-ui-danger-fg' : 'text-ui-warning-fg'}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
