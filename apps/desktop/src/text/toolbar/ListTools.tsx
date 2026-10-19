import type { Color, ListFormat } from '@slidr/model';
import { listNumber } from '@slidr/renderer';
import {
  Button,
  cx,
  Dialog,
  DialogContent,
  IconButton,
  Input,
  NumberField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from '@slidr/ui';
import { ChevronDown, List, ListOrdered } from '@slidr/ui/icons';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ColorField } from '../../controls';
import { changeParagraphs } from '../actions';
import { isMixed, listChange, listStyleChange, orNull, type ParagraphChange } from '../format';
import { closeToText, keepFocus, openOnPopover, TextToggle, useText, type Text } from './shared';

/*
 * Lists as PowerPoint has them: a split button for bullets and one for numbering. The button
 * turns its list on and off; the arrow beside it opens a gallery of styles, and under it
 * "Bullets and Numbering…", a dialog of the size, the colour and the number to start at.
 */

type ListKind = 'bullet' | 'number';

/** The bullets of the gallery, PowerPoint's seven. The first is the standard bullet. */
const BULLETS = [
  { key: 'filledRound', glyph: null, shown: '•' },
  { key: 'hollowRound', glyph: '○', shown: '○' },
  { key: 'filledSquare', glyph: '■', shown: '■' },
  { key: 'hollowSquare', glyph: '□', shown: '□' },
  { key: 'star', glyph: '❖', shown: '❖' },
  { key: 'arrow', glyph: '➢', shown: '➢' },
  { key: 'check', glyph: '✓', shown: '✓' },
] as const;

/** The numbering styles of the gallery, PowerPoint's seven and the Hebrew letters. */
const FORMATS: readonly ListFormat[] = [
  'decimal',
  'decimal-paren',
  'upper-roman',
  'upper-alpha',
  'lower-alpha-paren',
  'lower-alpha',
  'lower-roman',
  'hebrew',
];

/** What the gallery and the dialog choose: no list, or a list in one style. */
type Choice =
  | { kind: null }
  | { kind: 'bullet'; glyph: string | null }
  | { kind: 'number'; format: ListFormat };

/** Changes paragraphs of the target, as one undo step named "Format paragraph". */
function useChange(text: Text): (change: ParagraphChange) => void {
  const { t } = useTranslation('text');
  return (change) => changeParagraphs(text.target, change, { label: t('step.paragraph') });
}

/** The change that makes a choice, with the marker's look on top of it. */
function choose(
  choice: Choice,
  look: { color?: Color | null; size?: number | null; start?: number | null } = {},
): ParagraphChange {
  if (choice.kind === null) return listChange('bullet', false);
  const on = listChange(choice.kind, true);
  const style = listStyleChange(
    choice.kind === 'bullet'
      ? { glyph: choice.glyph, format: null, start: null, ...look }
      : { glyph: null, format: choice.format, ...look },
  );
  return (paragraph) => style(on(paragraph));
}

/** The style of the target's list: the choice its tile stands for, or nothing when they differ. */
function currentChoice(text: Text): Choice | 'mixed' {
  const { list, glyph, listFormat } = text.format;
  if (isMixed(list)) return 'mixed';
  if (list === null) return { kind: null };
  if (list === 'bullet') return isMixed(glyph) ? 'mixed' : { kind: 'bullet', glyph };
  // A numbered item imported with its number written out (`glyph`) has no style of the gallery.
  if (isMixed(listFormat) || orNull(text.format.glyph)) return 'mixed';
  return { kind: 'number', format: listFormat ?? 'decimal' };
}

function same(a: Choice | 'mixed', b: Choice): boolean {
  if (a === 'mixed' || a.kind !== b.kind) return false;
  if (a.kind === 'bullet' && b.kind === 'bullet') return a.glyph === b.glyph;
  if (a.kind === 'number' && b.kind === 'number') return a.format === b.format;
  return true;
}

/* ---------------------------------------------------------------- the gallery */

/** A tile of the gallery: three lines of a list in the style, as PowerPoint draws them. */
function Tile({
  label,
  selected,
  onSelect,
  markers,
  large,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  /** The markers of the three lines; none for the tile of no list. */
  markers?: readonly string[];
  large?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onMouseDown={keepFocus}
        onClick={onSelect}
        className={cx(
          'flex shrink-0 cursor-default flex-col justify-center rounded-small border bg-ui-field text-ui-fg transition-colors select-none',
          large ? 'size-18 gap-2.5 px-2' : 'size-16 gap-2 px-2',
          'hover:border-ui-accent hover:bg-ui-hover',
          selected ? 'border-ui-accent ring-1 ring-ui-accent' : 'border-ui-line-strong',
        )}
      >
        {markers ? (
          markers.map((marker, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="min-w-4 text-start text-xs leading-none font-medium">{marker}</span>
              <span className="h-px flex-1 bg-ui-line-strong" />
            </span>
          ))
        ) : (
          <span className="text-center text-xs text-ui-fg-muted">{label}</span>
        )}
      </button>
    </Tooltip>
  );
}

/** The tiles of a kind: no list first, then its styles. */
function Gallery({
  kind,
  current,
  onChoose,
  large,
}: {
  kind: ListKind;
  current: Choice | 'mixed';
  onChoose: (choice: Choice) => void;
  large?: boolean;
}) {
  const { t } = useTranslation('text');
  const none: Choice = { kind: null };
  const choices: { choice: Choice; label: string; markers: string[] }[] =
    kind === 'bullet'
      ? BULLETS.map(({ key, glyph, shown }) => ({
          choice: { kind: 'bullet', glyph },
          label: t(`list.bulletStyle.${key}`),
          markers: [shown, shown, shown],
        }))
      : FORMATS.map((format) => ({
          choice: { kind: 'number', format },
          label: t(`list.numberStyle.${format}`),
          markers: [1, 2, 3].map((n) => listNumber(n, format)),
        }));
  return (
    <div
      className={cx(
        'grid gap-1.5',
        // Eight tiles in two rows of four, as PowerPoint's dialog; nine (with the Hebrew letters)
        // in rows of five and four.
        !large ? 'grid-cols-3' : choices.length + 1 > 8 ? 'grid-cols-5' : 'grid-cols-4',
      )}
      data-testid={`list-gallery-${kind}`}
    >
      <Tile
        label={t('list.none')}
        selected={same(current, none)}
        onSelect={() => onChoose(none)}
        large={large}
      />
      {choices.map(({ choice, label, markers }) => (
        <Tile
          key={label}
          label={label}
          markers={markers}
          selected={same(current, choice)}
          onSelect={() => onChoose(choice)}
          large={large}
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- the dialog */

/** "Bullets and Numbering…": the style, and the marker's size, colour and first number. */
function ListDialog({ text, kind, onClose }: { text: Text; kind: ListKind; onClose: () => void }) {
  const { t } = useTranslation('text');
  const change = useChange(text);
  const { listColor, listSize, listStart } = text.format;
  const initial = currentChoice(text);
  const [tab, setTab] = useState<ListKind>(kind);
  const [choice, setChoice] = useState<Choice | 'mixed'>(() =>
    initial !== 'mixed' && initial.kind !== null && initial.kind !== kind
      ? defaultChoice(kind)
      : initial,
  );
  const [size, setSize] = useState<number>(orNull(listSize) ?? 100);
  const [color, setColor] = useState<Color | null>(orNull(listColor));
  const [start, setStart] = useState<number>(orNull(listStart) ?? 1);
  const [custom, setCustom] = useState('');

  const switchTab = (next: string) => {
    setTab(next as ListKind);
    if (choice === 'mixed' || (choice.kind !== null && choice.kind !== next))
      setChoice(defaultChoice(next as ListKind));
  };

  const apply = () => {
    const glyph = custom.trim();
    const picked: Choice | 'mixed' = tab === 'bullet' && glyph ? { kind: 'bullet', glyph } : choice;
    const marker = {
      color,
      size: size === 100 ? null : size,
      ...(tab === 'number' ? { start: start === 1 ? null : start } : {}),
    };
    // Lists of several styles keep their styles and take the rest.
    change(picked === 'mixed' ? listStyleChange(marker) : choose(picked, marker));
    onClose();
  };

  const look = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="w-24 text-xs font-medium text-ui-fg-muted">{t('list.size')}</span>
        <NumberField
          size="sm"
          aria-label={t('list.size')}
          className="w-20"
          value={size}
          min={25}
          max={400}
          step={5}
          onValueChange={(next) => setSize(next ?? 100)}
        />
        <span className="text-xs text-ui-fg-muted">{t('list.ofText')}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-24 text-xs font-medium text-ui-fg-muted">{t('list.color')}</span>
        <ColorField
          size="sm"
          label={t('list.color')}
          value={color}
          mixed={isMixed(listColor) && color === null}
          allowNone
          onChange={setColor}
        />
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={t('list.dialogTitle')}
        closeLabel={t('list.cancel')}
        data-testid="list-dialog"
        onCloseAutoFocus={closeToText}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('list.cancel')}
            </Button>
            <Button variant="primary" onClick={apply} data-testid="list-dialog-ok">
              {t('list.ok')}
            </Button>
          </>
        }
      >
        <Tabs value={tab} onValueChange={switchTab} className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="bullet">{t('list.bulletedTab')}</TabsTrigger>
            <TabsTrigger value="number">{t('list.numberedTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="bullet" className="flex flex-col gap-4">
            <Gallery
              kind="bullet"
              large
              current={custom.trim() ? 'mixed' : choice}
              onChoose={(next) => {
                setCustom('');
                setChoice(next);
              }}
            />
            {look}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs font-medium text-ui-fg-muted">
                {t('list.glyphCustom')}
              </span>
              <Input
                aria-label={t('list.glyphCustom')}
                placeholder={t('list.glyphOther')}
                className="h-control-sm w-20"
                maxLength={3}
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
              />
            </div>
          </TabsContent>
          <TabsContent value="number" className="flex flex-col gap-4">
            <Gallery kind="number" large current={choice} onChoose={setChoice} />
            {look}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs font-medium text-ui-fg-muted">{t('list.startAt')}</span>
              <NumberField
                size="sm"
                aria-label={t('list.startAt')}
                className="w-20"
                value={start}
                min={1}
                max={9999}
                step={1}
                onValueChange={(next) => setStart(next ?? 1)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function defaultChoice(kind: ListKind): Choice {
  return kind === 'bullet' ? { kind, glyph: null } : { kind, format: 'decimal' };
}

/* ---------------------------------------------------------------- the split buttons */

function ListSplit({ text, kind }: { text: Text; kind: ListKind }) {
  const { t } = useTranslation('text');
  const change = useChange(text);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(false);
  /** The menu is closing to open the dialog, which takes the focus. */
  const toDialog = useRef(false);
  const name = kind === 'bullet' ? 'bullets' : 'numbers';
  const current = currentChoice(text);
  return (
    <div className="inline-flex items-center" data-testid={`text-list-${kind}`}>
      <TextToggle
        icon={kind === 'bullet' ? List : ListOrdered}
        className="rtl:-scale-x-100"
        label={t(`list.${name}`)}
        pressed={text.format.list === kind}
        onPressedChange={(on) => change(listChange(kind, on))}
      />
      <Popover open={menu} onOpenChange={setMenu}>
        <PopoverTrigger asChild>
          <IconButton
            size="sm"
            icon={ChevronDown}
            label={t(`list.${name}Options`)}
            className="w-3.5! data-[state=open]:bg-ui-hover [&_svg]:size-3"
            onMouseDown={keepFocus}
          />
        </PopoverTrigger>
        <PopoverContent
          onOpenAutoFocus={openOnPopover}
          onCloseAutoFocus={(event) => {
            // The dialog takes the focus from here; otherwise it goes back to the text.
            if (toDialog.current) event.preventDefault();
            else closeToText(event);
            toDialog.current = false;
          }}
          className="w-auto p-2 focus-visible:outline-none"
        >
          <Gallery
            kind={kind}
            current={current}
            onChoose={(choice) => {
              change(choose(choice));
              setMenu(false);
            }}
          />
          <div className="-mx-2 my-2 h-px bg-ui-line" />
          <MenuButton
            onClick={() => {
              toDialog.current = true;
              setDialog(true);
              setMenu(false);
            }}
            icon={kind === 'bullet' ? List : ListOrdered}
          >
            {t('list.dialog')}
          </MenuButton>
        </PopoverContent>
      </Popover>
      {dialog && <ListDialog text={text} kind={kind} onClose={() => setDialog(false)} />}
    </div>
  );
}

/** A line at the foot of the gallery that reads like an item of a menu. */
function MenuButton({
  icon: IconOf,
  onClick,
  children,
}: {
  icon: typeof List;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onClick}
      className="flex h-control-sm w-full cursor-default items-center gap-2 rounded-control px-2 text-start text-sm text-ui-fg hover:bg-ui-hover"
    >
      <IconOf className="size-4 text-ui-fg-muted rtl:-scale-x-100" />
      {children}
    </button>
  );
}

/** Bullets and numbering, two split buttons, as in PowerPoint. */
export function ListTool() {
  const text = useText();
  if (!text) return null;
  return (
    <>
      <ListSplit text={text} kind="bullet" />
      <ListSplit text={text} kind="number" />
    </>
  );
}
