import { memo, useMemo, type ReactNode } from 'react';
import { cx } from '@slidr/ui';
import { parseMarkdown, type Block, type Inline } from './markdown';

/*
 * A chat reply as the chat draws it (CHT-U01). Every block finds its own direction from its
 * first strong character (`dir="auto"`), so a Hebrew paragraph and an English one in the same
 * reply each read the right way; code is always left to right.
 *
 * `dir="auto"` looks past descendants that set a direction of their own. So a list decides for
 * all of its items, and what is inside an item sets none: otherwise the list would find no
 * text, fall back to left-to-right, and put its numbers on the wrong side of Hebrew items.
 */

function inline(nodes: readonly Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.text;
      case 'break':
        return <br key={i} />;
      case 'code':
        return (
          <code key={i} dir="ltr" className="rounded-small bg-ui-field px-1 py-0.5 text-sm">
            {node.text}
          </code>
        );
      case 'strong':
        return (
          <strong key={i} className="font-semibold">
            {inline(node.children)}
          </strong>
        );
      case 'em':
        return <em key={i}>{inline(node.children)}</em>;
      case 'del':
        return <del key={i}>{inline(node.children)}</del>;
      case 'link':
        // Shown, not followed: the webview is the app, and nothing here may navigate it.
        return (
          <span key={i} className="text-ui-accent-fg underline underline-offset-2">
            {inline(node.children)}
          </span>
        );
    }
  });
}

const headingSize = { 1: 'text-lg', 2: 'text-lg', 3: 'text-md' } as const;

function block(node: Block, key: number, tight: boolean): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} dir={tight ? undefined : 'auto'} className="text-start leading-6">
          {inline(node.children)}
        </p>
      );
    case 'heading':
      return (
        <p
          key={key}
          dir={tight ? undefined : 'auto'}
          role="heading"
          aria-level={node.level + 2}
          className={cx('text-start font-semibold text-ui-fg', headingSize[node.level])}
        >
          {inline(node.children)}
        </p>
      );
    case 'code':
      return (
        <pre
          key={key}
          dir="ltr"
          className="overflow-x-auto rounded-control bg-ui-field p-3 text-start text-xs leading-5"
        >
          <code>{node.text}</code>
        </pre>
      );
    case 'list': {
      const List = node.ordered ? 'ol' : 'ul';
      return (
        <List
          key={key}
          dir={tight ? undefined : 'auto'}
          start={node.ordered ? node.start : undefined}
          className={cx(
            'flex flex-col gap-1 ps-5 text-start',
            node.ordered ? 'list-decimal' : 'list-disc',
          )}
        >
          {node.items.map((item, i) => (
            <li key={i} className="ps-1 marker:text-ui-fg-muted">
              <div className="flex flex-col gap-1">
                {item.children.map((child, j) => block(child, j, true))}
              </div>
            </li>
          ))}
        </List>
      );
    }
    case 'quote':
      return (
        <blockquote
          key={key}
          dir={tight ? undefined : 'auto'}
          className="flex flex-col gap-2 border-s-2 border-ui-line-strong ps-3 text-ui-fg-muted"
        >
          {node.children.map((child, i) => block(child, i, true))}
        </blockquote>
      );
    case 'rule':
      return <hr key={key} className="border-ui-line" />;
    case 'table':
      return (
        <div key={key} className="overflow-x-auto rounded-control border border-ui-line">
          <table
            dir={tight ? undefined : 'auto'}
            className="w-full border-collapse text-start text-sm"
          >
            <thead className="bg-ui-field">
              <tr>
                {node.head.map((cell, i) => (
                  <th key={i} className="px-2.5 py-1.5 text-start font-medium">
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, i) => (
                <tr key={i} className="border-t border-ui-line">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2.5 py-1.5 align-top">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Markdown text as chat content. Parsed again when the text grows, which streaming does. */
export const MarkdownView = memo(function MarkdownView({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="flex flex-col gap-2 text-md wrap-anywhere text-ui-fg">
      {blocks.map((node, i) => block(node, i, false))}
    </div>
  );
});
