import { useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  ChevronDown,
  Copy as CopyIcon,
  FilePlus,
  FolderOpen,
  History,
  ImagePlus,
  Images,
  Italic,
  Link,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Underline,
  Undo2,
  WifiOff,
} from '@slidr/ui/icons';
import {
  Button,
  Checkbox,
  ColorPicker,
  ColorSwatch,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  cx,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  FontPicker,
  IconButton,
  Input,
  Kbd,
  NumberField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  SegmentedControl,
  Select,
  Separator,
  Skeleton,
  Slider,
  Spinner,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TextField,
  Toggle,
  Tooltip,
  UiProvider,
  type ButtonVariant,
  type Dir,
} from '@slidr/ui';
import { builtinFamilies } from '../../fonts';
import { copy, type Copy } from './copy';

/*
 * The component gallery (DSN-06): every component of @slidr/ui in every state, in both themes
 * and both directions. `?theme=dark&dir=ltr` shows a single combination.
 */

export interface Cell {
  theme: 'light' | 'dark';
  dir: Dir;
}

export function Gallery({ cells }: { cells: Cell[] }) {
  return (
    <div className="flex min-h-full flex-col gap-6 bg-ui-canvas p-6">
      <header className="flex items-baseline gap-3 px-1">
        <h1 className="text-xl font-semibold">Slidr design system</h1>
        <p className="text-sm text-ui-fg-muted">
          packages/ui · ?theme=light|dark&amp;dir=rtl|ltr shows one combination
        </p>
      </header>
      <div className={cx('grid gap-6', cells.length > 1 && 'grid-cols-2')}>
        {cells.map((cell) => (
          <GalleryCell key={`${cell.theme}-${cell.dir}`} {...cell} />
        ))}
      </div>
    </div>
  );
}

function GalleryCell({ theme, dir }: Cell) {
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const c = copy[dir];
  return (
    <div
      data-theme={theme}
      dir={dir}
      lang={c.lang}
      data-testid={`gallery-${theme}-${dir}`}
      className="rounded-panel border border-ui-line bg-ui-chrome p-5"
    >
      <UiProvider dir={dir} portalContainer={portal}>
        <p className="mb-4 text-xs font-semibold text-ui-fg-muted">
          {theme === 'light' ? 'Light' : 'Dark'} · {dir.toUpperCase()}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Tokens c={c} />
          <Buttons c={c} />
          <IconButtons c={c} />
          <Segmented c={c} />
          <Options c={c} />
          <TabsDemo c={c} />
          <FieldDemo c={c} />
          <Fields c={c} />
          <Values c={c} />
          <ColorDemo c={c} />
          <FontDemo c={c} />
          <Menus c={c} dir={dir} />
          <Overlays c={c} dir={dir} />
          <DialogDemo c={c} dir={dir} />
          <Feedback c={c} />
          <ScrollDemo c={c} />
        </div>
      </UiProvider>
      <div ref={setPortal} />
    </div>
  );
}

function Card({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section
      className={cx(
        'flex flex-col gap-4 rounded-panel border border-ui-line bg-ui-panel p-5',
        wide && 'col-span-2',
      )}
    >
      <h2 className="text-xs font-semibold text-ui-fg-muted">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Floating layers shown open, in place: the box is a containing block (a transform), so their
 * fixed positioning is relative to it and they scroll with the page.
 */
function OverlayBox({
  dir,
  className,
  children,
}: {
  dir: Dir;
  className: string;
  children: ReactNode;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setBox} className={cx('relative transform-gpu', className)}>
      {box && (
        <UiProvider dir={dir} portalContainer={box}>
          {children}
        </UiProvider>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- tokens */

const swatches = [
  ['ui-chrome', 'bg-ui-chrome'],
  ['ui-panel', 'bg-ui-panel'],
  ['ui-canvas', 'bg-ui-canvas'],
  ['ui-raised', 'bg-ui-raised'],
  ['ui-field', 'bg-ui-field'],
  ['ui-fg', 'bg-ui-fg'],
  ['ui-fg-muted', 'bg-ui-fg-muted'],
  ['ui-fg-subtle', 'bg-ui-fg-subtle'],
  ['ui-line', 'bg-ui-line'],
  ['ui-line-strong', 'bg-ui-line-strong'],
  ['ui-accent', 'bg-ui-accent'],
  ['ui-accent-soft', 'bg-ui-accent-soft'],
  ['ui-accent-fg', 'bg-ui-accent-fg'],
  ['ui-danger', 'bg-ui-danger'],
  ['ui-danger-soft', 'bg-ui-danger-soft'],
  ['ui-success-fg', 'bg-ui-success-fg'],
  ['ui-warning-fg', 'bg-ui-warning-fg'],
  ['ui-tooltip', 'bg-ui-tooltip'],
] as const;

const typeScale = [
  'text-xl font-semibold',
  'text-lg font-semibold',
  'text-md font-medium',
  'text-sm',
  'text-xs text-ui-fg-muted',
] as const;

/** Columns that line up are what the fixed-width font is for: 0 and O, 1 and l, i and W. */
const monoSample = 'slide_update({ id: "s_0O1l", width: 1920 })';

function Tokens({ c }: { c: Copy }) {
  return (
    <Card title={c.tokens} wide>
      <div className="grid grid-cols-9 gap-x-3 gap-y-4">
        {swatches.map(([name, bg]) => (
          <div key={name} className="flex min-w-0 flex-col gap-1.5">
            <span className={cx('h-10 rounded-control border border-ui-line', bg)} />
            <span dir="ltr" className="truncate text-xs text-ui-fg-muted">
              {name}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          {c.type.map((sample, i) => (
            <p key={sample} className={typeScale[i]}>
              {sample}
            </p>
          ))}
          <p className="flex items-baseline gap-3 text-xs text-ui-fg-muted">
            {c.mono}
            <span dir="ltr" className="font-mono text-sm text-ui-fg">
              {monoSample}
            </span>
          </p>
        </div>
        <div className="flex items-end gap-4 text-xs text-ui-fg-muted">
          <div className="flex flex-col items-center gap-1.5">
            <span className="size-12 rounded-control border border-ui-line-strong bg-ui-field" />8
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="size-12 rounded-panel border border-ui-line-strong bg-ui-field" />
            12
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="size-12 rounded-control bg-ui-raised shadow-raised" />
            raised
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="size-12 rounded-panel bg-ui-raised shadow-overlay" />
            overlay
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- buttons */

const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'soft', 'danger'];
const previews = [undefined, 'hover', 'active', 'focus', 'disabled', 'loading'] as const;

function Buttons({ c }: { c: Copy }) {
  return (
    <Card title={c.buttons} wide>
      <div className="grid grid-cols-[auto_repeat(6,1fr)] items-center gap-x-4 gap-y-3">
        <span />
        {c.states.map((state) => (
          <span key={state} className="text-xs text-ui-fg-muted">
            {state}
          </span>
        ))}
        {variants.map((variant, v) => (
          <ButtonRow key={variant} variant={variant} name={c.variants[v] ?? variant} c={c} />
        ))}
      </div>
    </Card>
  );
}

function ButtonRow({ variant, name, c }: { variant: ButtonVariant; name: string; c: Copy }) {
  return (
    <>
      <span className="text-xs text-ui-fg-muted">{name}</span>
      {previews.map((preview) => (
        <span key={preview ?? 'rest'}>
          <Button
            variant={variant}
            icon={variant === 'soft' ? Sparkles : undefined}
            data-preview={preview === 'disabled' || preview === 'loading' ? undefined : preview}
            disabled={preview === 'disabled'}
            loading={preview === 'loading'}
          >
            {c.buttonLabel}
          </Button>
        </span>
      ))}
    </>
  );
}

function IconButtons({ c }: { c: Copy }) {
  return (
    <Card title={c.iconButtons}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {previews.map((preview) => (
            <IconButton
              key={preview ?? 'rest'}
              icon={Undo2}
              mirror
              label={c.undo}
              shortcut="Ctrl+Z"
              data-preview={preview === 'disabled' || preview === 'loading' ? undefined : preview}
              disabled={preview === 'disabled'}
              loading={preview === 'loading'}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <IconButton icon={Plus} label={c.buttonLabel} variant="secondary" />
          <IconButton icon={Plus} label={c.buttonLabel} variant="primary" />
          <IconButton icon={Sparkles} label={c.buttonLabel} variant="soft" />
          <IconButton icon={Trash2} label={c.buttonLabel} variant="danger" />
          <IconButton icon={Plus} label={c.buttonLabel} size="sm" variant="secondary" />
        </div>
        <div className="flex items-center gap-1">
          <Toggle icon={Bold} label={c.bold} shortcut="Ctrl+B" defaultPressed />
          <Toggle icon={Italic} label={c.italic} />
          <Toggle icon={Underline} label={c.underline} data-preview="hover" />
          <Toggle icon={Underline} label={c.underline} data-preview="focus" />
          <Toggle icon={Bold} label={c.bold} disabled />
          <Toggle icon={Bold} label={c.bold} defaultPressed disabled />
        </div>
      </div>
    </Card>
  );
}

function Segmented({ c }: { c: Copy }) {
  const [scope, setScope] = useState('slide');
  const [align, setAlign] = useState('center');
  const [theme, setTheme] = useState('light');
  const [from, setFrom] = useState<(typeof arrowValues)[number]>('left');
  return (
    <Card title={c.segmented}>
      <SegmentedControl
        aria-label={c.segmented}
        value={scope}
        onValueChange={setScope}
        options={[
          { value: 'slide', label: c.segments[0] },
          { value: 'deck', label: c.segments[1] },
          { value: 'object', label: c.segments[2] },
        ]}
      />
      <div className="flex items-center gap-3">
        <SegmentedControl
          aria-label={c.segmented}
          value={align}
          onValueChange={setAlign}
          options={[
            { value: 'left', label: c.align[0], icon: AlignLeft, iconOnly: true },
            { value: 'center', label: c.align[1], icon: AlignCenter, iconOnly: true },
            { value: 'right', label: c.align[2], icon: AlignRight, iconOnly: true },
          ]}
        />
        <SegmentedControl
          aria-label={c.segmented}
          size="sm"
          value={align}
          onValueChange={setAlign}
          options={[
            { value: 'left', label: c.align[0], icon: AlignLeft, iconOnly: true },
            { value: 'center', label: c.align[1], icon: AlignCenter, iconOnly: true },
            { value: 'right', label: c.align[2], icon: AlignRight, iconOnly: true },
          ]}
        />
      </div>
      <SegmentedControl
        aria-label={c.segmented}
        fill
        value={theme}
        onValueChange={setTheme}
        options={[
          { value: 'light', label: c.segments[0] },
          { value: 'dark', label: c.segments[1] },
        ]}
      />
      <SegmentedControl
        aria-label={c.segmented}
        disabled
        value="slide"
        onValueChange={() => {}}
        options={[
          { value: 'slide', label: c.segments[0] },
          { value: 'deck', label: c.segments[1] },
        ]}
      />
      {/* Physical segments: `dir` keeps the left arrow on the left in a right-to-left UI too. */}
      <SegmentedControl
        aria-label={c.direction}
        dir="ltr"
        className="self-start"
        value={from}
        onValueChange={setFrom}
        options={arrowIcons.map((icon, i) => ({
          value: arrowValues[i] ?? 'left',
          label: c.arrows[i] ?? '',
          icon,
          iconOnly: true,
        }))}
      />
    </Card>
  );
}

const arrowValues = ['left', 'up', 'down', 'right'] as const;
const arrowIcons = [ArrowLeft, ArrowUp, ArrowDown, ArrowRight];

/* ---------------------------------------------------------------- checkbox and switch */

const optionPreviews = [undefined, 'hover', 'active', 'focus', 'disabled'] as const;

function Options({ c }: { c: Copy }) {
  const [asDefault, setAsDefault] = useState(true);
  const [animations, setAnimations] = useState(false);
  const [parts, setParts] = useState([true, false, true]);
  // A row of the grid: one control in each state of DSN-05.
  const states = (name: string, control: (state: StateProps) => ReactNode) => (
    <>
      <span className="text-xs text-ui-fg-muted">{name}</span>
      {optionPreviews.map((preview) => (
        <span key={preview ?? 'rest'}>
          {control({
            'data-preview': preview === 'disabled' ? undefined : preview,
            disabled: preview === 'disabled',
          })}
        </span>
      ))}
    </>
  );
  const still = () => {};
  return (
    <Card title={c.options} wide>
      <div className="grid grid-cols-[auto_repeat(5,1fr)] items-center gap-x-4 gap-y-3">
        <span />
        {c.optionStates.map((state) => (
          <span key={state} className="text-xs text-ui-fg-muted">
            {state}
          </span>
        ))}
        {states(c.optionRows[0], (state) => (
          <Checkbox checked={false} onCheckedChange={still} label={c.optionLabel} {...state} />
        ))}
        {states(c.optionRows[1], (state) => (
          <Checkbox checked onCheckedChange={still} label={c.optionLabel} {...state} />
        ))}
        {states(c.optionRows[2], (state) => (
          <Checkbox checked="mixed" onCheckedChange={still} label={c.optionLabel} {...state} />
        ))}
        {states(c.optionRows[3], (state) => (
          <Switch checked={false} onCheckedChange={still} label={c.optionLabel} {...state} />
        ))}
        {states(c.optionRows[4], (state) => (
          <Switch checked onCheckedChange={still} label={c.optionLabel} {...state} />
        ))}
      </div>
      <Separator />
      <div className="grid grid-cols-2 items-start gap-8">
        <div className="flex flex-col items-start gap-3">
          <Checkbox
            checked={asDefault}
            onCheckedChange={setAsDefault}
            label={c.asDefault}
            hint={c.asDefaultHint}
          />
          <Switch
            checked={animations}
            onCheckedChange={setAnimations}
            label={c.animations}
            hint={c.animationsHint}
          />
        </div>
        {/* A row of settings: the label at the start, the switch at the far end. */}
        <div className="flex flex-col gap-2">
          {c.tableParts.map((part, i) => (
            <Switch
              key={part}
              side="end"
              checked={parts[i] ?? false}
              onCheckedChange={(on) => setParts(parts.map((was, at) => (at === i ? on : was)))}
              label={part}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

interface StateProps {
  'data-preview': string | undefined;
  disabled: boolean;
}

function TabsDemo({ c }: { c: Copy }) {
  return (
    <Card title={c.tabs}>
      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat">{c.tabNames[0]}</TabsTrigger>
          <TabsTrigger value="actions" data-preview="focus">
            {c.tabNames[1]}
          </TabsTrigger>
          <TabsTrigger value="history" disabled>
            {c.tabNames[2]}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex flex-col gap-2 pt-4">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function FieldDemo({ c }: { c: Copy }) {
  const [from, setFrom] = useState<(typeof arrowValues)[number]>('up');
  const [seconds, setSeconds] = useState(0.5);
  const [opacity, setOpacity] = useState(80);
  return (
    <Card title={c.field}>
      <Field label={c.direction} hint={c.directionHint}>
        <SegmentedControl
          aria-label={c.direction}
          dir="ltr"
          className="self-start"
          value={from}
          onValueChange={setFrom}
          options={arrowIcons.map((icon, i) => ({
            value: arrowValues[i] ?? 'left',
            label: c.arrows[i] ?? '',
            icon,
            iconOnly: true,
          }))}
        />
      </Field>
      <Field label={c.duration} error={seconds > 60 ? c.durationError : undefined}>
        <NumberField
          aria-label={c.duration}
          className="w-24"
          value={seconds}
          onValueChange={setSeconds}
          min={0}
          precision={1}
          step={0.1}
          unit={c.secondsUnit}
        />
      </Field>
      <Field label={c.duration} error={c.durationError}>
        <NumberField
          aria-label={c.duration}
          className="w-24"
          value={75}
          onValueChange={() => {}}
          unit={c.secondsUnit}
        />
      </Field>
      <Field label={c.opacity}>
        <Slider aria-label={c.opacity} value={opacity} onValueChange={setOpacity} />
      </Field>
    </Card>
  );
}

function Fields({ c }: { c: Copy }) {
  return (
    <Card title={c.fields}>
      <TextField label={c.fieldLabel} placeholder={c.fieldPlaceholder} hint={c.fieldHint} />
      <Input icon={Search} placeholder={c.search} end={<Kbd keys="Ctrl+K" />} />
      <Input defaultValue={c.fieldPlaceholder} data-preview="focus" />
      <TextField
        label={c.fieldLabel}
        defaultValue={c.fieldPlaceholder.repeat(3)}
        error={c.fieldError}
      />
      <Input defaultValue={c.fieldPlaceholder} disabled />
      <Textarea aria-label={c.fieldLabel} placeholder={c.fieldPlaceholder} />
      <Textarea
        aria-label={c.fieldLabel}
        defaultValue={`${c.fieldPlaceholder}\n${c.fieldHint}\n${c.fieldPlaceholder}`}
        footer={
          <div className="flex justify-end">
            <Button variant="primary" size="sm">
              {c.send}
            </Button>
          </div>
        }
      />
      <Textarea aria-label={c.fieldLabel} defaultValue={c.fieldPlaceholder} invalid />
      <Textarea aria-label={c.fieldLabel} defaultValue={c.fieldPlaceholder} disabled />
    </Card>
  );
}

/* ---------------------------------------------------------------- values and pickers */

const weightValues = ['300', '400', '500', '700'] as const;

function Values({ c }: { c: Copy }) {
  const [size, setSize] = useState(32);
  const [angle, setAngle] = useState(12.5);
  const [opacity, setOpacity] = useState(80);
  const [weight, setWeight] = useState<(typeof weightValues)[number]>('500');
  const weights = weightValues.map((value, i) => ({ value, label: c.weights[i] ?? value }));
  return (
    <Card title={c.values}>
      <div className="flex items-center gap-2">
        <NumberField
          aria-label={c.size}
          className="w-20"
          value={size}
          onValueChange={setSize}
          min={1}
          max={999}
        />
        <NumberField
          aria-label={c.rotation}
          className="w-24"
          value={angle}
          onValueChange={setAngle}
          precision={1}
          unit="°"
        />
        <NumberField
          aria-label={c.size}
          className="w-20"
          size="sm"
          value={null}
          placeholder={c.mixed}
          onValueChange={setSize}
        />
        <NumberField
          aria-label={c.size}
          className="w-20"
          value={size}
          onValueChange={setSize}
          disabled
        />
      </div>
      <div className="flex items-center gap-2">
        <Select
          aria-label={c.weight}
          className="w-32"
          options={weights}
          value={weight}
          onValueChange={setWeight}
        />
        <Select
          aria-label={c.weight}
          variant="ghost"
          size="sm"
          options={weights}
          value={weight}
          onValueChange={setWeight}
        />
        <Select
          aria-label={c.weight}
          className="w-32"
          options={weights}
          value={null}
          placeholder={c.mixed}
          onValueChange={setWeight}
        />
      </div>
      <div className="flex items-center gap-3">
        <Slider aria-label={c.opacity} value={opacity} onValueChange={setOpacity} />
        <NumberField
          aria-label={c.opacity}
          className="w-20 shrink-0"
          value={opacity}
          onValueChange={setOpacity}
          min={0}
          max={100}
          unit="%"
        />
      </div>
      <Slider aria-label={c.opacity} value={40} onValueChange={() => {}} disabled />
    </Card>
  );
}

// A deck theme for the demo; the gallery is a dev page, so literal colours are fine here.
const themeSwatches = ['#ffffff', '#f3f4f6', '#15171a', '#5f6672', '#2f5bea', '#0f9d8a', '#f59e0b'];

function ColorDemo({ c }: { c: Copy }) {
  const [value, setValue] = useState<string | null>('#2f5bea');
  const [choice, setChoice] = useState<string | null>('4');
  const choices = themeSwatches.map((color, i) => ({
    id: String(i),
    label: c.themeNames[i] ?? color,
    color,
  }));
  return (
    <Card title={c.colorPicker}>
      <div className="flex items-center gap-2 text-sm text-ui-fg-muted">
        <ColorSwatch color={value} className="size-5" />
        <span dir="ltr">{value ?? c.color.none}</span>
      </div>
      <ColorPicker
        className="w-64"
        value={value}
        choiceId={choice}
        onChange={(hex) => {
          setValue(hex);
          setChoice(null);
        }}
        onChoice={(id) => {
          setChoice(id);
          setValue(themeSwatches[Number(id)] ?? null);
        }}
        onNone={() => setValue(null)}
        groups={[{ label: c.themeColors, choices }]}
        recent={['#e5484d', '#8e4ec6', '#15171a80']}
        alpha
        labels={c.color}
      />
    </Card>
  );
}

const galleryFonts = builtinFamilies.map(({ family, scripts }) => ({
  family,
  hebrew: (scripts as readonly string[]).includes('he'),
}));

/** A few of the fonts Windows ships, as the app would list the installed ones. */
const installedFonts = [
  { family: 'Arial', hebrew: true },
  { family: 'Courier New', hebrew: true },
  { family: 'David', hebrew: true },
  { family: 'Georgia' },
  { family: 'Segoe UI', hebrew: true },
  { family: 'Times New Roman', hebrew: true },
  { family: 'Wingdings', symbol: true },
];

function FontDemo({ c }: { c: Copy }) {
  const [family, setFamily] = useState('Heebo');
  return (
    <Card title={c.fontPicker}>
      <FontPicker
        groups={[
          { label: c.font.library, fonts: galleryFonts },
          { label: c.font.system, fonts: installedFonts },
        ]}
        recent={['Rubik', 'Inter']}
        value={family}
        onValueChange={setFamily}
        autoFocus={false}
        labels={c.font}
      />
    </Card>
  );
}

/* ---------------------------------------------------------------- overlays */

const keepFocus = (event: Event) => event.preventDefault();

function Menus({ c, dir }: { c: Copy; dir: Dir }) {
  const [grid, setGrid] = useState(true);
  const [zoom, setZoom] = useState('fit');
  return (
    <Card title={c.menus}>
      <OverlayBox dir={dir} className="h-96">
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" iconEnd={ChevronDown}>
              {c.buttonLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent avoidCollisions={false} onCloseAutoFocus={keepFocus}>
            <DropdownMenuItem icon={FilePlus} shortcut="Ctrl+N">
              {c.menu.new}
            </DropdownMenuItem>
            <DropdownMenuItem icon={FolderOpen} shortcut="Ctrl+O">
              {c.menu.open}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger icon={History}>{c.menu.recent}</DropdownMenuSubTrigger>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{c.menu.label}</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={grid} onCheckedChange={setGrid}>
              {c.menu.grid}
            </DropdownMenuCheckboxItem>
            <DropdownMenuRadioGroup value={zoom} onValueChange={setZoom}>
              <DropdownMenuRadioItem value="fit" shortcut="Ctrl+0">
                {c.menu.fit}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="100">{c.menu.actual}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>{c.menu.disabled}</DropdownMenuItem>
            <DropdownMenuItem icon={Trash2} tone="danger" shortcut="Del">
              {c.menu.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </OverlayBox>
      <ContextMenu>
        <ContextMenuTrigger className="flex h-16 items-center justify-center rounded-control border border-dashed border-ui-line-strong text-sm text-ui-fg-muted">
          {c.menu.contextHint}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem icon={CopyIcon} shortcut="Ctrl+D">
            {c.menu.new}
          </ContextMenuItem>
          <ContextMenuItem icon={Sparkles}>AI</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem icon={Trash2} tone="danger" shortcut="Del">
            {c.menu.delete}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </Card>
  );
}

function Overlays({ c, dir }: { c: Copy; dir: Dir }) {
  return (
    <Card title={c.overlays}>
      <OverlayBox dir={dir} className="h-60">
        <Popover open modal={false}>
          <PopoverTrigger asChild>
            <Button icon={Link}>{c.popoverTitle}</Button>
          </PopoverTrigger>
          <PopoverContent
            avoidCollisions={false}
            onOpenAutoFocus={keepFocus}
            className="flex flex-col gap-3"
          >
            <TextField label={c.popoverField} defaultValue="slidr.dev" dir="ltr" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm">
                {c.cancel}
              </Button>
              <Button variant="primary" size="sm">
                {c.apply}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </OverlayBox>
      <OverlayBox dir={dir} className="flex h-20 items-end">
        <Tooltip open content={c.undo} shortcut="Ctrl+Z" side="top">
          <IconButton icon={Undo2} mirror label={c.undo} noTooltip variant="secondary" />
        </Tooltip>
      </OverlayBox>
    </Card>
  );
}

function DialogDemo({ c, dir }: { c: Copy; dir: Dir }) {
  return (
    <Card title={c.dialog} wide>
      <OverlayBox dir={dir} className="h-64 overflow-hidden rounded-control bg-ui-canvas">
        <div className="absolute inset-0 bg-ui-scrim" />
        <Dialog open modal={false}>
          <DialogContent
            title={c.dialogTitle}
            description={c.dialogBody}
            closeLabel={c.close}
            onOpenAutoFocus={keepFocus}
            onInteractOutside={keepFocus}
            footer={
              <>
                <Button variant="ghost">{c.cancel}</Button>
                <Button>{c.dontSave}</Button>
                <Button variant="primary">{c.buttonLabel}</Button>
              </>
            }
          />
        </Dialog>
      </OverlayBox>
    </Card>
  );
}

/* ---------------------------------------------------------------- feedback */

function Feedback({ c }: { c: Copy }) {
  return (
    <Card title={c.feedback} wide>
      <div className="flex items-center gap-4">
        <Kbd keys="Ctrl+Z" />
        <Kbd keys="Ctrl+Shift+S" />
        <Kbd keys="F5" />
        <Separator orientation="vertical" className="h-5 self-center" />
        <Spinner />
        <span className="text-sm text-ui-fg-muted">{c.buttonLabel}…</span>
      </div>
      <Separator />
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-3 rounded-control border border-ui-line p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-24 w-full rounded-control" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="rounded-control border border-ui-line">
          <EmptyState
            icon={Images}
            title={c.emptyTitle}
            description={c.emptyBody}
            action={
              <Button size="sm" icon={ImagePlus}>
                {c.emptyAction}
              </Button>
            }
          />
        </div>
        <div className="rounded-control border border-ui-line">
          <EmptyState
            tone="error"
            icon={WifiOff}
            title={c.errorTitle}
            description={c.errorBody}
            action={
              <Button size="sm" variant="secondary">
                {c.retry}
              </Button>
            }
          />
        </div>
      </div>
    </Card>
  );
}

function ScrollDemo({ c }: { c: Copy }) {
  return (
    <Card title={c.scroll} wide>
      <div className="grid grid-cols-2 gap-4">
        <ScrollArea type="always" className="h-48 rounded-control border border-ui-line">
          <ul className="flex flex-col p-1">
            {Array.from({ length: 24 }, (_, i) => (
              <li
                key={i}
                className="flex h-8 items-center gap-2 rounded-control px-2 text-sm hover:bg-ui-hover"
              >
                <span className="w-6 text-xs text-ui-fg-muted tabular-nums">{i + 1}</span>
                {c.slide} {i + 1}
              </li>
            ))}
          </ul>
        </ScrollArea>
        <ScrollArea
          type="always"
          orientation="horizontal"
          className="h-48 rounded-control border border-ui-line"
        >
          <div className="flex h-44 items-center gap-3 px-3">
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className="h-28 w-48 shrink-0 rounded-small bg-ui-field ring-1 ring-ui-line"
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}
