// The Slidr design system (SPEC 4.0): the tokens live in `theme.css`; these are the components.
// Every app surface is built from them (PLAN 1.2). See docs/adr/ADR-008-design-system-and-shell.md.
export { cx } from './cx';
export {
  UiProvider,
  usePortalContainer,
  type Dir,
  type UiProviderProps,
} from './components/provider';
export { Icon, iconSizes, type IconProps, type IconSize, type LucideIcon } from './components/icon';
export { Spinner } from './components/spinner';
export { Kbd, type KbdProps } from './components/kbd';
export {
  Tooltip,
  usePhysicalSide,
  type TooltipProps,
  type TooltipSide,
} from './components/tooltip';
export {
  Button,
  IconButton,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
} from './components/button';
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from './components/segmented';
export { Toggle, type ToggleProps } from './components/toggle';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/tabs';
export * from './components/menu';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  type DialogContentProps,
} from './components/overlay';
export { Input, TextField, type InputProps, type TextFieldProps } from './components/input';
export {
  EmptyState,
  ScrollArea,
  Separator,
  Skeleton,
  type EmptyStateProps,
  type ScrollAreaProps,
} from './components/feedback';
