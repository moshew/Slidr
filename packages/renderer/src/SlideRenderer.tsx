import type { Deck, Slide } from '@slidr/model';
import { useMemo, type CSSProperties } from 'react';
import {
  RenderContextValue,
  type AssetResolver,
  type CellSlot,
  type ElementSlot,
  type HtmlSlot,
  type RenderContext,
  type RenderMode,
  type TextSlot,
} from './context';
import { cssString, scopeSlideCss } from './css';
import { ElementView } from './elements';
import { BackgroundLayers } from './fill';
import { frameScriptNonce, resolveAssetUrls } from './markup';
import { opensAddress } from './text';
import { colorCss, deckFontFaces, themeVariables } from './theme';

export interface SlideRendererProps {
  /** The deck the slide belongs to: its theme, layouts, assets and direction. */
  deck: Deck;
  slide: Slide;
  /** Default `edit`. See `RenderMode`. */
  mode?: RenderMode;
  /**
   * Turns an asset into a loadable URL. Keep it stable (module-level or memoised): a new function
   * re-renders every element. Without it, assets do not load.
   */
  resolveAsset?: AssetResolver;
  /** Wraps or replaces an element's DOM. Keep it stable, as `resolveAsset`. */
  slot?: ElementSlot;
  /** Puts the host's content (the text editor) in a text box. Keep it stable. */
  textSlot?: TextSlot;
  /** Puts the host's content (the text editor) in a table cell. Keep it stable. */
  cellSlot?: CellSlot;
  /** Hands the content of an `html` element to the host, to edit its text. Keep it stable. */
  htmlSlot?: HtmlSlot;
  /**
   * The nonce the scripts of `html` elements carry in their frames. The page's own by default
   * (`setFrameScriptNonce`); an empty string draws them without one, as an export does: a file
   * has no policy to satisfy, and a nonce of this load has no business in it.
   */
  scriptNonce?: string;
  /**
   * Narrows the links the slide draws to the addresses its host follows: a host that hands only
   * some of them on (the app gives the system web addresses only) says so here, and a link to
   * any other address is drawn as what it is over, not as a link that does nothing. It cannot
   * widen them: an address no slide may open stays unopened. Keep it stable.
   */
  opensLink?: (address: string) => boolean;
  className?: string;
  /** Applied to the slide root, after the renderer's own styles. */
  style?: CSSProperties;
}

/**
 * A slide as DOM at its logical size, 1920x1080 (SPEC 7). It does not scale itself: the Stage,
 * the thumbnails and the presenter put it in a scaled container (see `ScaledSlide`).
 *
 * The output is self-contained: every style it relies on is inline, so it looks the same in the
 * editor (which has a page stylesheet), in the capture window and in an exported file (RND-01).
 * The root carries the theme as CSS variables (RND-08) and the slide's own `css`, scoped to it
 * (RND-07).
 */
export function SlideRenderer({
  deck,
  slide,
  mode = 'edit',
  resolveAsset,
  slot,
  textSlot,
  cellSlot,
  htmlSlot,
  scriptNonce: givenNonce,
  opensLink: hostOpens,
  className,
  style,
}: SlideRendererProps) {
  const { theme, assets, layouts, meta, size } = deck;
  const at = deck.slides.findIndex((s) => s.id === slide.id);
  const slideNumber = at === -1 ? undefined : at + 1;
  const scriptNonce = (givenNonce ?? frameScriptNonce()) || undefined;
  const ctx = useMemo<RenderContext>(
    () => ({
      theme,
      mode,
      dir: meta.dir,
      lang: meta.lang,
      asset: (id) => assets[id],
      assetUrl: (id) => {
        const asset = assets[id];
        return asset && resolveAsset ? resolveAsset(asset) : undefined;
      },
      slideNumber,
      slot,
      textSlot,
      cellSlot,
      htmlSlot,
      ...(scriptNonce ? { scriptNonce } : {}),
      opensLink: (address) => opensAddress(address) && (hostOpens?.(address) ?? true),
    }),
    [
      theme,
      mode,
      meta.dir,
      meta.lang,
      assets,
      resolveAsset,
      slideNumber,
      slot,
      textSlot,
      cellSlot,
      htmlSlot,
      scriptNonce,
      hostOpens,
    ],
  );
  const vars = useMemo(() => themeVariables(theme), [theme]);
  const fontFaces = useMemo(
    () => (resolveAsset ? deckFontFaces(assets, resolveAsset) : ''),
    [assets, resolveAsset],
  );
  const layout = slide.layoutId ? layouts.find((l) => l.id === slide.layoutId) : undefined;
  // A footer the layout draws is the deck's footer, the same on every slide (SLD-04). A slide
  // whose own footer says something shows that instead: the two share one place.
  const ownFooter = slide.elements.some(
    (e) =>
      e.role === 'footer' &&
      !e.hidden &&
      e.type === 'text' &&
      e.content.paragraphs.some((p) => p.runs.some((run) => run.text.trim() !== '')),
  );
  const background = slide.background ?? layout?.background ?? theme.background;
  const body = theme.textStyles.body;
  // The slide's own stylesheet can name an asset of the deck too (`url("slidr-asset:<id>")`):
  // a face of a font the deck keeps, which has no record of its own on the asset.
  const scopedCss = useMemo(
    () =>
      slide.css
        ? scopeSlideCss(
            resolveAssetUrls(slide.css, {
              assetUrl: (id) => {
                const asset = assets[id];
                return asset && resolveAsset ? resolveAsset(asset) : undefined;
              },
            }),
            `[data-slide-id=${cssString(slide.id)}]`,
          )
        : undefined,
    [slide.css, slide.id, assets, resolveAsset],
  );

  return (
    <RenderContextValue.Provider value={ctx}>
      <div
        className={className ? `slidr-slide ${className}` : 'slidr-slide'}
        data-slide-id={slide.id}
        lang={meta.lang}
        dir={meta.dir}
        style={{
          ...(vars as CSSProperties),
          position: 'relative',
          width: size.w,
          height: size.h,
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
          contain: 'layout paint',
          isolation: 'isolate',
          // The base every element inherits; HTML written for the slide sees the body text style.
          fontFamily: 'var(--font-body)',
          fontSize: body.size,
          fontWeight: 400,
          fontStyle: 'normal',
          lineHeight: body.lineHeight,
          letterSpacing: 'normal',
          wordSpacing: 'normal',
          textAlign: 'start',
          textIndent: 0,
          textTransform: 'none',
          whiteSpace: 'normal',
          color: colorCss(body.color),
          ...style,
        }}
      >
        {fontFaces ? <style data-slidr-fonts="">{fontFaces}</style> : null}
        {scopedCss ? <style>{scopedCss}</style> : null}
        <BackgroundLayers background={background} ctx={ctx} />
        {layout?.decorations.map((d) =>
          d.role === 'footer' && ownFooter ? null : (
            <ElementView key={d.id} element={d} decoration />
          ),
        )}
        {slide.elements.map((e) => (
          <ElementView key={e.id} element={e} />
        ))}
      </div>
    </RenderContextValue.Provider>
  );
}

/**
 * A slide shown at a given width, e.g. a thumbnail (FLM-01). The slide is laid out at full size
 * and scaled, so it is the same picture at every size.
 */
export function ScaledSlide({ width, ...props }: SlideRendererProps & { width: number }) {
  const { w, h } = props.deck.size;
  const scale = width / w;
  return (
    <div style={{ position: 'relative', width, height: h * scale, overflow: 'hidden' }}>
      {/* Physical left/top: in an RTL page an overflowing block would otherwise hang off the right. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `scale(${scale})`,
        }}
      >
        <SlideRenderer {...props} />
      </div>
    </div>
  );
}
