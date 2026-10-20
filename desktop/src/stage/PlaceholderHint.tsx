import type { Direction, TextElement, Theme } from '@slidr/model';
import { colorCss, paragraphStyle, runStyle } from '@slidr/renderer';

/**
 * What an empty placeholder says on the Stage (ADR-040): the words of its role, drawn as its
 * text would be drawn, in the text style, the colour, the alignment and the place of the
 * placeholder, and faint. It stands where the text will: the Stage hands it to the renderer as the box's content,
 * so it is on the Stage only, never in a thumbnail, a capture, the show or an exported file.
 */
export function PlaceholderHint({
  element,
  theme,
  dir,
  text,
}: {
  element: TextElement;
  theme: Theme;
  /** The direction of the deck: an empty paragraph has no letters to take one from. */
  dir: Direction;
  text: string;
}) {
  const paragraph = element.content.paragraphs[0] ?? {
    dir: 'auto' as const,
    align: 'start' as const,
    runs: [],
  };
  const style = paragraphStyle(paragraph, theme, {
    styleRef: 'body',
    wrap: element.wrap ?? true,
    ...(element.color ? { color: colorCss(element.color) } : {}),
  });
  const font = theme.textStyles[paragraph.styleRef ?? 'body'].font;
  return (
    <p
      data-placeholder-hint={element.role}
      dir={paragraph.dir === 'auto' ? dir : paragraph.dir}
      style={{ ...style, opacity: 0.4 }}
    >
      {/* An empty line keeps the marks its text will be typed in. */}
      <span style={runStyle(paragraph.runs[0]?.marks, font)}>{text}</span>
    </p>
  );
}
