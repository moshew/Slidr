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
import { newDocument, openDocument, saveDocument, saveDocumentAs } from './fileActions';
import { NotesPanel } from './NotesPanel';
import { PanelId, registerContextTool, registerPanel, registerShortcut } from './registry';
import { SettingsPanel } from './SettingsPanel';
import { openPanel, setZoom, showShortcuts, zoomBy } from './store';
import { PanelEmpty } from './ToolPanel';

/*
 * The shell's own registrations. Settings and the speaker notes are real; the rest are
 * placeholders (SPEC 4.2, 4.4) that hold the place of panels and tools other areas will
 * register under the same ids. And the shell's own keyboard shortcuts.
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

// The speaker notes of the current slide (SPEC 4.2, panel 7).
registerPanel({
  id: 'notes',
  kind: 'tool',
  slot: 'tools',
  order: 3,
  title: 'panels.notes',
  icon: NotebookPen,
  content: NotesPanel,
});

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

/* ---------------------------------------------------------------- shortcuts (SPEC Appendix A) */

/*
 * The shell's own keys, registered like every area's, so the shortcut map lists them (UI-06).
 * The File commands and the view also answer while the caret is in text; undo and redo there
 * are the text's own (the slide's text editor passes them on to the deck itself).
 */
const file = { section: 'file', inText: true } as const;
registerShortcut({
  id: 'shell.new',
  keys: 'Ctrl+N',
  label: 'keys.new',
  ...file,
  run: (editor) => void newDocument(editor),
});
registerShortcut({
  id: 'shell.open',
  keys: 'Ctrl+O',
  label: 'keys.open',
  ...file,
  run: (editor) => void openDocument(editor),
});
registerShortcut({
  id: 'shell.save',
  keys: 'Ctrl+S',
  label: 'keys.save',
  ...file,
  run: (editor) => void saveDocument(editor),
});
registerShortcut({
  id: 'shell.saveAs',
  keys: 'Ctrl+Shift+S',
  label: 'keys.saveAs',
  ...file,
  run: (editor) => void saveDocumentAs(editor),
});
registerShortcut({
  id: 'shell.shortcuts',
  keys: 'Ctrl+/',
  label: 'keys.shortcuts',
  ...file,
  run: () => showShortcuts(),
});

const edit = { section: 'edit' } as const;
registerShortcut({
  id: 'shell.undo',
  keys: 'Ctrl+Z',
  label: 'keys.undo',
  ...edit,
  run: (editor) => void editor.bus.undo(),
});
for (const keys of ['Ctrl+Y', 'Ctrl+Shift+Z']) {
  registerShortcut({
    id: `shell.redo.${keys}`,
    keys,
    label: 'keys.redo',
    ...edit,
    run: (editor) => void editor.bus.redo(),
  });
}

const view = { section: 'view', inText: true } as const;
registerShortcut({
  id: 'shell.zoomFit',
  keys: 'Ctrl+0',
  label: 'keys.zoomFit',
  ...view,
  run: () => setZoom('fit'),
});
// "Ctrl and plus" is two keys on the row of digits: the key marked `+ =` as it is, and the same
// key with Shift, which is what makes it a plus. The plus of the number pad is read as that key
// too (`eventKeys.ts`), and its minus as the minus.
for (const [id, keys] of [
  ['shell.zoomIn', 'Ctrl+='],
  ['shell.zoomIn.shift', 'Ctrl+Shift+='],
] as const) {
  registerShortcut({
    id,
    keys,
    label: 'keys.zoomIn',
    ...view,
    run: () => zoomBy(1.25),
  });
}
registerShortcut({
  id: 'shell.zoomOut',
  keys: 'Ctrl+-',
  label: 'keys.zoomOut',
  ...view,
  run: () => zoomBy(0.8),
});

ai.forEach(({ id, shortcut }, n) =>
  registerShortcut({
    id: `shell.${id}`,
    keys: shortcut,
    label: (['keys.aiDeck', 'keys.aiSlide', 'keys.aiObject'] as const)[n],
    section: 'ai',
    inText: true,
    run: () => openPanel(id),
  }),
);
