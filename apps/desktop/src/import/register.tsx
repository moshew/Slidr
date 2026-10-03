import { FileInput } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { registerPanel } from '../shell';
import { ImportPanel } from './ImportPanel';
import { en, he } from './messages';

/*
 * HTML import (SPEC ch. 13, WG9-T18): a panel of the Activity Bar. The shell's File menu has no
 * entry for it yet; that is the shell's to add. See docs/adr/ADR-036-html-import.md.
 */

registerMessages('import', { he, en });

registerPanel({
  id: 'import',
  kind: 'tool',
  slot: 'tools',
  order: 90,
  title: 'import:panel',
  icon: FileInput,
  content: ImportPanel,
});
