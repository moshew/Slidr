import { EditorProvider, type Editor } from './shell/editor';
import { Shell } from './shell/Shell';

export function App({ editor }: { editor: Editor }) {
  return (
    <EditorProvider editor={editor}>
      <Shell />
    </EditorProvider>
  );
}
