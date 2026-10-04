import type { Color, SvgElement } from '@slidr/model';
import { Button, ColorSwatch, Icon } from '@slidr/ui';
import { MoveRight, Palette, RotateCcw, Shapes } from '@slidr/ui/icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorField, useGestureTx } from '../controls';
import { tell, useDeck, useEditor } from '../shell';
import { PopoverTool } from './parts';
import { cleanSvg, svgColors } from './svgImport';
import type { Target } from './target';

/*
 * The colours of an SVG in row B (SHP-06): each colour the drawing uses, and what it is drawn in
 * instead. A replacement picked from the theme is stored as its token, so the drawing follows
 * the theme. The markup itself is never changed: the replacements are a field of the element.
 */

/** The colours listed at once; a drawing with more shows the most used. */
const MAX_LISTED = 12;

/** The key of the colour of an icon that draws in `currentColor`, as the renderer compares it. */
const CURRENT = 'currentcolor';

/** The override a source colour has, by the key it was stored under. */
function overrideOf(element: SvgElement, colour: string): Color | undefined {
  const overrides = element.colorOverrides ?? {};
  const key = Object.keys(overrides).find((k) => k.trim().toLowerCase() === colour);
  return key ? overrides[key] : undefined;
}

function ColourRow({ target, colour }: { target: Target<SvgElement>; colour: string }) {
  const { t } = useTranslation('objects');
  const tx = useGestureTx();
  const { element } = target;
  const current = colour === CURRENT;
  const name = current ? t('svg.current') : colour.toUpperCase();
  const override = overrideOf(element, colour);
  return (
    <div data-colour={colour} className="flex items-center gap-2">
      {/* What the file says: a swatch, or for `currentColor` the words for it. */}
      {!current && <ColorSwatch color={colour} className="size-5" />}
      <span dir={current ? undefined : 'ltr'} className="min-w-0 flex-1 truncate text-xs">
        {name}
      </span>
      <Icon icon={MoveRight} mirror className="shrink-0 text-ui-fg-subtle" />
      <ColorField
        value={override ?? (current ? null : { value: colour })}
        label={t('svg.replace', { color: name })}
        size="sm"
        onChange={(color) => {
          if (!color) return;
          // Under the key the renderer finds it by, whatever case an older key was written in.
          const rest = Object.fromEntries(
            Object.entries(element.colorOverrides ?? {}).filter(
              ([key]) => key.trim().toLowerCase() !== colour,
            ),
          );
          target.update(
            { colorOverrides: { ...rest, [current ? 'currentColor' : colour]: color } },
            { txId: tx.id(), label: t('history.svgColor') },
          );
        }}
        onGestureEnd={tx.end}
      />
    </div>
  );
}

/** An SVG that is still a file: its colours can be edited once its markup is in the element. */
function MakeEditable({ target }: { target: Target<SvgElement> }) {
  const { t } = useTranslation('objects');
  const { assets } = useEditor();
  const asset = useDeck((s) =>
    target.element.assetId ? s.deck.assets[target.element.assetId] : undefined,
  );
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const url = asset ? assets.url(asset) : undefined;
    if (!url) return;
    setBusy(true);
    try {
      const markup = cleanSvg(await (await fetch(url)).text());
      if (!markup) return await tell(t('svg.notEditable'));
      target.update({ markup, assetId: null }, { label: t('history.svgInline') });
    } catch {
      await tell(t('svg.notEditable'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ui-fg-muted">{t('svg.fileHint')}</p>
      <Button
        icon={Shapes}
        className="self-start"
        loading={busy}
        disabled={!asset}
        data-testid="svg-make-editable"
        onClick={() => void run()}
      >
        {t('svg.makeEditable')}
      </Button>
    </div>
  );
}

/**
 * Row B for an SVG: its colours. An icon of the library, which has one colour of its own, keeps
 * the single colour button it has (`media/IconColorTool`); this is for drawings with colours.
 */
export function SvgColorsTool({ target }: { target: Target<SvgElement> }) {
  const { t } = useTranslation('objects');
  const { element } = target;
  const colours = useMemo(
    () => (element.markup ? svgColors(element.markup) : []),
    [element.markup],
  );
  if (element.markup && colours.every((colour) => colour === CURRENT)) return null;
  const listed = colours.slice(0, MAX_LISTED);
  const replaced = Object.keys(element.colorOverrides ?? {}).length > 0;
  return (
    <PopoverTool label={t('svg.colors')} icon={Palette}>
      {element.markup ? (
        <div data-testid="svg-colours" className="flex flex-col gap-2">
          {listed.map((colour) => (
            <ColourRow key={colour} target={target} colour={colour} />
          ))}
          {colours.length > listed.length && (
            <p className="text-xs text-ui-fg-muted">
              {t('svg.more', { n: colours.length - listed.length })}
            </p>
          )}
          <p className="text-xs text-ui-fg-muted">{t('svg.hint')}</p>
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            className="self-start"
            disabled={!replaced}
            onClick={() =>
              target.update({ colorOverrides: null }, { label: t('history.svgColor') })
            }
          >
            {t('svg.reset')}
          </Button>
        </div>
      ) : (
        <MakeEditable target={target} />
      )}
    </PopoverTool>
  );
}
