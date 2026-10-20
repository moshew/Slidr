import { Icon } from '@slidr/ui';
import { TriangleAlert } from '@slidr/ui/icons';
import { useTranslation } from 'react-i18next';
import { ltr } from '../export/exportDeck';
import { warningLines } from './exportPptx';

/**
 * What a conversion could not carry over as it was (ADR-108), one line for each kind of warning
 * and what it is about, with the slides it is on.
 */
export function WarningList({
  warnings,
  group,
  testId,
}: {
  warnings: readonly { code: string; slide?: number; detail?: string }[];
  group: 'exported' | 'imported';
  testId: string;
}) {
  const { t } = useTranslation('pptx');
  return (
    <ul data-testid={testId} className="flex flex-col gap-1">
      {warningLines(warnings).map((line) => {
        // What a warning is about (a file, a font, a kind of object) is named left to right.
        const text = t(`${group}.${line.code}`, { detail: line.detail ? ltr(line.detail) : '' });
        const slides =
          line.slides.length === 0
            ? ''
            : t(line.slides.length === 1 ? 'slideOne' : 'slideMany', {
                slides: line.slides.join(', '),
              });
        return (
          <li
            key={`${line.code}|${line.detail ?? ''}`}
            data-code={line.code}
            className="flex items-start gap-2"
          >
            <Icon icon={TriangleAlert} className="mt-0.5 shrink-0 text-ui-warning-fg" />
            <span className="min-w-0 break-words">
              {text}
              {slides && <span className="text-ui-fg-muted"> ({slides})</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
