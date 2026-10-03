/*
 * The text of an `html` element, edited in place (HTM-03, IMP-13): reading what the user typed in
 * the rendered content back into the element's markup, without changing its structure.
 *
 * The rendered content is not the markup: it was cleaned (scripts and handlers are gone) and its
 * asset references became URLs. So the markup is never written from it. The renderer keeps the
 * markup as it was parsed (`source`) and knows which node of the content came from which node of
 * the source; the text of the content is copied over to the source, element by element, and the
 * source is what is written. Elements are never added, removed or moved: if the content no
 * longer has the elements of its source, in their order, the edit is turned down.
 */

type SourceOf = (node: Node) => Node | undefined;

const isText = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE;
const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;

/** The children of a node as the runs of text between its elements: text, element, text, ... */
function runs<T extends Node>(children: Iterable<Node>, isMark: (node: Node) => node is T) {
  const texts: Text[][] = [[]];
  const marks: T[] = [];
  for (const child of children) {
    if (isMark(child)) {
      marks.push(child);
      texts.push([]);
    } else if (isText(child)) (texts[texts.length - 1] as Text[]).push(child);
  }
  return { texts, marks };
}

/**
 * Copies the text of a rendered element (or of the whole content) to its source. Between each two
 * elements the text of the content replaces the text of the source at the same place. Returns
 * false, and may leave the source half changed, when the two no longer have the same elements:
 * the caller then drops the source.
 *
 * `own` names nodes of the content that are the renderer's and not the markup's (the stylesheet
 * it puts first): they are passed over.
 */
export function copyText(
  rendered: ParentNode,
  source: ParentNode,
  sourceOf: SourceOf,
  own: (node: Node) => boolean = () => false,
): boolean {
  const children = Array.from(rendered.childNodes).filter((node) => !own(node));
  // The elements of the content that the source has too; anything else among them is not ours.
  const inContent = runs(children, isElement);
  const pairs = inContent.marks.map((element) => sourceOf(element));
  if (pairs.some((pair) => !pair || pair.parentNode !== source)) return false;
  const kept = new Set<Node>(pairs as Node[]);
  // The source also holds what the cleaning took out (a script): it stays where it is, and so
  // every element of the source that the content should show has to be there.
  const inSource = runs(source.childNodes, (node): node is Node => kept.has(node));
  if (inSource.marks.length !== pairs.length) return false;
  if (inSource.marks.some((mark, i) => mark !== pairs[i])) return false;

  inContent.texts.forEach((texts, i) => {
    const text = texts.map((node) => node.data).join('');
    const [first, ...rest] = inSource.texts[i] as Text[];
    const before = [first, ...rest].map((node) => node?.data ?? '').join('');
    if (text === before) return;
    for (const node of rest) node.data = '';
    if (first) first.data = text;
    else {
      // Text where the source had none: before the element that follows, or at the end.
      const next = inSource.marks[i] ?? null;
      source.insertBefore(source.ownerDocument!.createTextNode(text), next);
    }
  });
  return inContent.marks.every((element, i) =>
    copyText(element, pairs[i] as unknown as ParentNode, sourceOf),
  );
}

/** How many elements a tree holds: what an edit of text must leave as it found it. */
export function elementCount(tree: ParentNode): number {
  return tree.querySelectorAll('*').length;
}

/** A fragment as markup. The fragment is left as it is. */
export function fragmentMarkup(fragment: DocumentFragment): string {
  const holder = (fragment.ownerDocument ?? document).createElement('div');
  holder.append(fragment.cloneNode(true));
  return holder.innerHTML;
}

/** Where the selection is, as the editing needs it. */
export interface Caret {
  anchorNode: Node | null;
  anchorOffset: number;
  focusNode: Node | null;
  isCollapsed: boolean;
}

/**
 * Whether a change the browser is about to make can keep the structure: it touches the text of
 * one text node, or puts text where the caret is. Judged by the selection, because the browser
 * gives a `beforeinput` event no target ranges inside a shadow tree.
 *
 * Turned down: line breaks; a selection that reaches from one node into another (replacing or
 * deleting it is how elements get removed or joined); a deletion at the edge of a text node,
 * which would go on into the node next to it. This is the first of two checks: what passes it and
 * still changes the elements (deleting a word that runs through a `<b>`) is caught by `copyText`.
 */
export function keepsStructure(inputType: string, caret: Caret): boolean {
  if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') return false;
  if (inputType.startsWith('history') || inputType.startsWith('format')) return false;
  const { anchorNode, focusNode } = caret;
  if (!anchorNode) return false;
  if (!caret.isCollapsed) return anchorNode === focusNode && isText(anchorNode);
  if (!inputType.startsWith('delete')) return true;
  if (!isText(anchorNode)) return false;
  return inputType.endsWith('Backward')
    ? caret.anchorOffset > 0
    : caret.anchorOffset < anchorNode.data.length;
}
