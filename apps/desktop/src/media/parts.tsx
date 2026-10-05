import type { ReactNode } from 'react';
import type { AssetMeta } from '@slidr/model';
import { useTranslation } from 'react-i18next';
import { cx, Icon, IconButton, Tooltip } from '@slidr/ui';
import { Replace, Trash2 } from '@slidr/ui/icons';
import { useEditor } from '../shell';
import { startAssetDrag } from './drag';

/* The pieces the tabs of the media panel share: a tab's frame, a titled group, a picture tile. */

/** The body of a tab: one column with the panel's gutter. */
export function TabBody({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="flex flex-col gap-4 px-4 pt-3 pb-6" data-testid={testId}>
      {children}
    </div>
  );
}

/** A titled group inside a tab. */
export function Group({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  /** A button at the end of the title's row. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-control-sm items-center gap-2">
        <h3 className="min-w-0 flex-1 text-xs font-medium text-ui-fg-muted">{title}</h3>
        {action}
      </div>
      {hint && <p className="text-xs text-ui-fg-muted">{hint}</p>}
      {children}
    </section>
  );
}

/** Taking a picture out of the deck, from its tile. */
export interface TileRemoval {
  /** The accessible name of the button, and its tooltip. */
  label: string;
  onRemove: () => void;
}

/** Putting a tile's picture in place of the picture selected on the Stage. */
export interface TileReplacement {
  /** The accessible name of the button, and its tooltip. */
  label: string;
  onReplace: () => void;
}

/**
 * The button in the corner of a tile that puts its picture in place of the selected one. It is
 * drawn only while a picture is selected on the Stage, so it is seen without hovering: it is
 * what the tile offers then, beside adding its picture to the slide.
 */
export function ReplaceButton({
  replace,
  id,
}: {
  replace: TileReplacement;
  /** What the tile shows: an asset's id, or a found photo's. */
  id: string;
}) {
  return (
    <IconButton
      icon={Replace}
      size="sm"
      variant="secondary"
      label={replace.label}
      data-replace-with={id}
      onClick={replace.onReplace}
      className="absolute start-1 top-1 bg-ui-raised shadow-raised"
    />
  );
}

/**
 * What the buttons in the corners of the tiles are for, said at the top of a tab while a picture
 * is selected on the Stage: they are there only then.
 */
export function ReplaceHint({ shown }: { shown: boolean }) {
  const { t } = useTranslation('media');
  if (!shown) return null;
  return (
    <p
      role="status"
      data-testid="media-replace-hint"
      className="flex items-start gap-2 rounded-control bg-ui-field px-3 py-2 text-xs text-ui-fg"
    >
      <Icon icon={Replace} className="mt-0.5" />
      <span className="min-w-0 flex-1">{t('replaceHint')}</span>
    </p>
  );
}

/**
 * A picture of the deck as a square tile that adds it to the slide. With `remove` it has a
 * button in its corner that takes the picture out of the deck, shown on hover and on focus, and
 * Delete on the tile does the same. With `replace` it has one in the other corner that puts
 * the picture in place of the one selected on the Stage.
 */
export function AssetTile({
  asset,
  label,
  onPick,
  remove,
  replace,
}: {
  asset: AssetMeta;
  /** The accessible name, and the tooltip. */
  label: string;
  onPick: () => void;
  remove?: TileRemoval;
  replace?: TileReplacement | undefined;
}) {
  const { assets } = useEditor();
  const url = assets.url(asset);
  const tile = (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        data-asset={asset.id}
        onClick={onPick}
        onKeyDown={(event) => {
          if (!remove) return;
          if (event.key !== 'Delete' && event.key !== 'Backspace') return;
          event.preventDefault();
          remove.onRemove();
        }}
        // The tile can also be dragged onto the slide, to land where it is dropped.
        draggable
        onDragStart={(event) => startAssetDrag(event, asset.id)}
        className={cx(
          'aspect-square w-full cursor-default overflow-hidden rounded-control border border-ui-line bg-ui-field transition-colors',
          'hover:border-ui-accent focus-visible:-outline-offset-2',
        )}
      >
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            loading="lazy"
            className={cx(
              'size-full',
              asset.kind === 'svg' ? 'object-contain p-2' : 'object-cover',
            )}
          />
        )}
      </button>
    </Tooltip>
  );
  if (!remove && !replace) return tile;
  return (
    <div className="group/tile relative">
      {tile}
      {replace && <ReplaceButton replace={replace} id={asset.id} />}
      {remove && (
        <IconButton
          icon={Trash2}
          size="sm"
          variant="secondary"
          label={remove.label}
          data-remove-asset={asset.id}
          onClick={remove.onRemove}
          className="absolute end-1 top-1 bg-ui-raised opacity-0 shadow-raised group-focus-within/tile:opacity-100 group-hover/tile:opacity-100"
        />
      )}
    </div>
  );
}

/** The grid picture tiles sit in. */
export function TileGrid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
      {children}
    </div>
  );
}
