import { useTranslation } from 'react-i18next';
import {
  Blend,
  Film,
  History,
  Images,
  LayoutTemplate,
  MessagesSquare,
  NotebookPen,
  PaintBucket,
  Presentation,
  RectangleHorizontal,
  ScanEye,
  Settings,
  SquareDashedMousePointer,
  Zap,
  type LucideIcon,
} from '@slidr/ui/icons';
import { Button, Tooltip } from '@slidr/ui';
import { useSelection } from './editor';
import { PanelId, registerContextTool, registerPanel } from './registry';
import { SettingsPanel } from './SettingsPanel';
import { PanelEmpty } from './ToolPanel';

/*
 * The shell's own registrations. Settings is real; the rest are placeholders (SPEC 4.2, 4.4)
 * that hold the place of panels and tools other areas will register under the same ids.
 */

registerPanel({
  id: PanelId.settings,
  kind: 'tool',
  title: 'panels.settings',
  icon: Settings,
  slot: 'footer',
  order: 0,
  content: SettingsPanel,
});

/* ---------------------------------------------------------------- AI tools (WG11) */

function ChatPlaceholder() {
  const { t } = useTranslation();
  return (
    <PanelEmpty
      icon={MessagesSquare}
      title={t('panels.chatEmptyTitle')}
      description={t('panels.chatEmptyBody')}
    />
  );
}

function ActionsPlaceholder() {
  const { t } = useTranslation();
  return (
    <PanelEmpty
      icon={Zap}
      title={t('panels.actionsEmptyTitle')}
      description={t('panels.actionsEmptyBody')}
    />
  );
}

/** Tool 3 without a selection says what to do (SPEC 4.2). */
function ObjectChatPlaceholder() {
  const { t } = useTranslation();
  const selected = useSelection((s) => s.selectedElementIds.length > 0);
  if (selected) return <ChatPlaceholder />;
  return (
    <PanelEmpty
      icon={SquareDashedMousePointer}
      title={t('panels.objectEmptyTitle')}
      description={t('panels.objectEmptyBody')}
    />
  );
}

const ai = [
  {
    id: PanelId.aiDeck,
    title: 'panels.aiDeck',
    icon: Presentation,
    scope: 'deck',
    shortcut: 'Ctrl+1',
  },
  {
    id: PanelId.aiSlide,
    title: 'panels.aiSlide',
    icon: RectangleHorizontal,
    scope: 'slide',
    shortcut: 'Ctrl+2',
  },
  {
    id: PanelId.aiObject,
    title: 'panels.aiObject',
    icon: SquareDashedMousePointer,
    scope: 'object',
    shortcut: 'Ctrl+3',
  },
] as const;

ai.forEach((tool, order) =>
  registerPanel({
    ...tool,
    kind: 'ai',
    slot: 'ai',
    order,
    placeholder: true,
    chat: tool.scope === 'object' ? ObjectChatPlaceholder : ChatPlaceholder,
    actions: ActionsPlaceholder,
  }),
);

/* ---------------------------------------------------------------- other panels */

function soon(icon: LucideIcon, body: string) {
  return function Soon() {
    const { t } = useTranslation();
    return <PanelEmpty icon={icon} title={t('panels.soonTitle')} description={t(body)} />;
  };
}

// The order is the one of SPEC 4.2. Layers (order 2) is real: `src/arrange` registers it.
const tools = [
  { id: 'media', order: 0, title: 'panels.media', icon: Images, body: 'panels.mediaBody' },
  {
    id: 'animations',
    order: 1,
    title: 'panels.animations',
    icon: Film,
    body: 'panels.animationsBody',
  },
  { id: 'notes', order: 3, title: 'panels.notes', icon: NotebookPen, body: 'panels.notesBody' },
  { id: 'lint', order: 4, title: 'panels.lint', icon: ScanEye, body: 'panels.lintBody' },
  { id: 'history', order: 5, title: 'panels.history', icon: History, body: 'panels.historyBody' },
];

tools.forEach(({ body, ...tool }) =>
  registerPanel({
    ...tool,
    kind: 'tool',
    slot: 'tools',
    placeholder: true,
    content: soon(tool.icon, body),
  }),
);

/* ---------------------------------------------------------------- row B, no selection */

function slideTool(icon: LucideIcon, label: string) {
  return function SlideTool() {
    const { t } = useTranslation();
    return (
      <Tooltip content={t('panels.soonTitle')}>
        {/* A disabled button gets no pointer events, so the tooltip hangs on a wrapper. */}
        <span className="inline-flex">
          <Button variant="ghost" size="sm" icon={icon} disabled>
            {t(label)}
          </Button>
        </span>
      </Tooltip>
    );
  };
}

[
  { id: 'slide.background', icon: PaintBucket, label: 'tools.background' },
  { id: 'slide.layout', icon: LayoutTemplate, label: 'tools.layout' },
  { id: 'slide.transition', icon: Blend, label: 'tools.transition' },
].forEach(({ id, icon, label }, order) =>
  registerContextTool({
    id,
    kinds: ['none'],
    group: 'slide',
    order,
    placeholder: true,
    render: slideTool(icon, label),
  }),
);
