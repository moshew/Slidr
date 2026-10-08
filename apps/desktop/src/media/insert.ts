import { createElement, findSlide, type AssetMeta, type Color, type Frame } from '@slidr/model';
import { i18n } from '../i18n';
import { centredFrame } from '../objects/shapes';
import { focusStage, type Editor } from '../shell';
import { insertAssetsCommands } from '../stage/insert';
import type { FoundIcon } from './icons/library';

/*
 * What Media and Elements put on a slide: a picture of the deck, a stock photo, an icon. Each
 * insert is one change on the bus, so one undo step; it lands in the middle of the current
 * slide and ends selected, like the Insert buttons of row A.
 */

/** The side of a new icon on the slide, in slide pixels: large enough to see and to grab. */
const ICON_SIDE = 160;

/** The colour a new icon takes: a token, so the icon follows the theme. */
export const ICON_COLOR: Color = { token: 'primary' };

const takenFrames = (editor: Editor, slideId: string): Frame[] =>
  findSlide(editor.bus.deck, slideId)?.elements.map((element) => element.frame) ?? [];

/**
 * Puts a picture on the current slide. An asset the deck does not have yet (a stock photo just
 * taken in) is registered in the same change, so undo removes the element and the asset
 * together. Returns false when there is no slide to put it on.
 */
export function insertAsset(editor: Editor, asset: AssetMeta): boolean {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return false;
  const { size } = editor.bus.deck;
  const { commands, elementIds } = insertAssetsCommands(
    slideId,
    [asset],
    size,
    { x: size.w / 2, y: size.h / 2 },
    (id) => id in editor.bus.deck.assets,
  );
  if (commands.length === 0) return false;
  editor.bus.batch(commands, { label: i18n.t('media:history.insert') });
  editor.selection.getState().selectElements(elementIds);
  focusStage();
  return true;
}

/**
 * Puts an icon of the library on the current slide, as an `svg` element with the icon's markup.
 * The icons draw in `currentColor`, and the element sets it to a theme token: the icon takes
 * the theme's colour, and follows it when the theme changes.
 */
export function insertIcon(editor: Editor, icon: FoundIcon): boolean {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return false;
  const element = createElement.svg({
    frame: centredFrame(
      { w: ICON_SIDE, h: ICON_SIDE },
      editor.bus.deck.size,
      takenFrames(editor, slideId),
    ),
    markup: icon.svg,
    name: icon.id,
    colorOverrides: { currentColor: ICON_COLOR },
  });
  editor.bus.dispatch(
    { type: 'element.add', slideId, element },
    { label: i18n.t('media:history.icon') },
  );
  editor.selection.getState().selectElements([element.id]);
  focusStage();
  return true;
}
