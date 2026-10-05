import { Type } from '@slidr/ui/icons';
import { useRef, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextToolProps } from '../../shell';
import {
  BoldTool,
  ColorTool,
  FontTool,
  HighlightTool,
  ItalicTool,
  MoreTool,
  SizeTool,
  UnderlineTool,
} from './CharacterTools';
import { AlignTool } from './ParagraphTools';
import { InFold, PopoverTool, useFolded, useMeasuredDensity, useText } from './shared';
import { StyleTool } from './StyleTools';

/*
 * Row B for several selected elements whose text is formatted together: the text tools of the
 * row, and the one button they fold into when the row, which holds the arrange tools too, has no
 * room for them (1366).
 */

/**
 * A text tool in the row of several elements. It draws nothing unless every selected element has
 * text (its group then takes no room), and nothing while the tools are folded into one button.
 */
export function forSeveral(Tool: ComponentType<ContextToolProps>) {
  return function SeveralTool(props: ContextToolProps) {
    const folded = useFolded();
    return useText() && !folded ? <Tool {...props} /> : null;
  };
}

function Line({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

/**
 * The text tools as one button: its popover holds them as a roomy row does. It also measures the
 * row for the layout, in every layout: when the tools are folded, none of them is in the row to
 * do it.
 */
export function SeveralTextTool({ kind }: ContextToolProps) {
  const { t } = useTranslation('text');
  const anchor = useRef<HTMLSpanElement>(null);
  useMeasuredDensity(anchor);
  const folded = useFolded();
  const text = useText();
  if (!text) return null;
  return (
    <span ref={anchor} className="inline-flex" data-testid="text-fold">
      {folded && (
        <PopoverTool label={t('several.label')} icon={Type}>
          <InFold value>
            <Line>
              <StyleTool />
              <FontTool />
              <SizeTool />
            </Line>
            <Line>
              <BoldTool />
              <ItalicTool />
              <UnderlineTool />
              <MoreTool kind={kind} />
              <ColorTool />
              <HighlightTool />
            </Line>
            <Line>
              <AlignTool kind={kind} />
            </Line>
          </InFold>
        </PopoverTool>
      )}
    </span>
  );
}
