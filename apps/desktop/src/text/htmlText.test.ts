// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { copyText, elementCount, fragmentMarkup, keepsStructure, type Caret } from './htmlText';

/*
 * The rendered content and its source, as the renderer makes them: the markup parsed twice into
 * trees of one shape and paired node by node, and then the content cleaned (here: scripts taken
 * out), which is why the two differ.
 */
function content(markup: string) {
  const parse = () => {
    const template = document.createElement('template');
    template.innerHTML = markup;
    return template.content;
  };
  const rendered = parse();
  const source = parse();
  const pairs = new WeakMap<Node, Node>();
  const pair = (a: Node, b: Node) => {
    pairs.set(a, b);
    a.childNodes.forEach((child, i) => pair(child, b.childNodes[i] as Node));
  };
  pair(rendered, source);
  for (const script of Array.from(rendered.querySelectorAll('script'))) script.remove();
  return { rendered, source, sourceOf: (node: Node) => pairs.get(node) };
}

const text = (node: Node | null | undefined) => node as Text;

describe('copyText', () => {
  it('copies changed text to the same place of the source, and leaves the rest', () => {
    const { rendered, source, sourceOf } = content(
      '<h2>Quarterly <b>results</b> are in</h2><p>Revenue &amp; costs</p>',
    );
    text(rendered.querySelector('b')!.firstChild).data = 'numbers';
    text(rendered.querySelector('h2')!.lastChild).data = ' are here';
    expect(copyText(rendered, source, sourceOf)).toBe(true);
    expect(fragmentMarkup(source)).toBe(
      '<h2>Quarterly <b>numbers</b> are here</h2><p>Revenue &amp; costs</p>',
    );
  });

  it('keeps what the cleaning took out of the content: the script stays in the markup', () => {
    const markup = '<div><p>One</p><script>run()</script><p>Two</p> tail</div>';
    const { rendered, source, sourceOf } = content(markup);
    expect(rendered.querySelector('script')).toBeNull();
    text(rendered.querySelectorAll('p')[1]!.firstChild).data = 'Second';
    text(rendered.querySelector('div')!.lastChild).data = ' end';
    expect(copyText(rendered, source, sourceOf)).toBe(true);
    expect(fragmentMarkup(source)).toBe(
      '<div><p>One</p><script>run()</script><p>Second</p> end</div>',
    );
  });

  it('reads text the browser split into several nodes, or typed where there was none', () => {
    const { rendered, source, sourceOf } = content('<p><b>Bold</b></p><p>Plain</p>');
    const [first, second] = Array.from(rendered.querySelectorAll('p'));
    // Typed after the <b>, where the paragraph had no text of its own.
    first!.append(' and more');
    // The browser split a text node in two while typing in the middle of it.
    second!.firstChild!.remove();
    second!.append('Pla', 'in text');
    expect(copyText(rendered, source, sourceOf)).toBe(true);
    expect(fragmentMarkup(source)).toBe('<p><b>Bold</b> and more</p><p>Plain text</p>');
  });

  it('keeps Hebrew and the order of mixed text as it was typed', () => {
    const { rendered, source, sourceOf } = content('<li>פריט <b>שני</b></li>');
    rendered.querySelector('li')!.append(' ועוד API אחד (2026)');
    expect(copyText(rendered, source, sourceOf)).toBe(true);
    expect(fragmentMarkup(source)).toBe('<li>פריט <b>שני</b> ועוד API אחד (2026)</li>');
  });

  it('turns down content that has an element the markup does not have', () => {
    const { rendered, source, sourceOf } = content('<p>One</p>');
    rendered.querySelector('p')!.append(document.createElement('br'));
    expect(copyText(rendered, source, sourceOf)).toBe(false);
    // The count of elements tells the other way round: an element that went missing.
    const lost = content('<p>One <b>two</b></p>');
    const before = elementCount(lost.rendered);
    lost.rendered.querySelector('b')!.remove();
    expect(elementCount(lost.rendered)).toBe(before - 1);
  });

  it('turns down content whose elements changed places', () => {
    const { rendered, source, sourceOf } = content('<p><b>a</b><i>b</i></p>');
    const p = rendered.querySelector('p')!;
    p.append(p.querySelector('b')!);
    expect(copyText(rendered, source, sourceOf)).toBe(false);
  });

  it("passes over the renderer's own nodes in the content", () => {
    const { rendered, source, sourceOf } = content('<p>One</p>');
    const sheet = document.createElement('style');
    rendered.prepend(sheet);
    text(rendered.querySelector('p')!.firstChild).data = 'Two';
    expect(copyText(rendered, source, sourceOf)).toBe(false);
    expect(copyText(rendered, source, sourceOf, (node) => node === sheet)).toBe(true);
    expect(fragmentMarkup(source)).toBe('<p>Two</p>');
  });

  it('leaves the fragment whole when it writes it as markup', () => {
    const { source } = content('<p title="a &quot;b&quot;">x &lt; y</p>');
    expect(fragmentMarkup(source)).toBe('<p title="a &quot;b&quot;">x &lt; y</p>');
    expect(source.childNodes).toHaveLength(1);
  });
});

describe('keepsStructure', () => {
  const p = document.createElement('p');
  p.innerHTML = 'Hello <b>world</b>!';
  const hello = p.firstChild as Text;
  const world = p.querySelector('b')!.firstChild as Text;
  const caret = (node: Node, offset: number, focus: Node = node): Caret => ({
    anchorNode: node,
    anchorOffset: offset,
    focusNode: focus,
    isCollapsed: node === focus && focus !== p,
  });
  const at = (node: Node, offset: number): Caret => ({
    anchorNode: node,
    anchorOffset: offset,
    focusNode: node,
    isCollapsed: true,
  });
  const selected = (node: Node, focus: Node): Caret => ({
    ...caret(node, 0, focus),
    isCollapsed: false,
  });

  it('lets text be typed where the caret is', () => {
    expect(keepsStructure('insertText', at(hello, 3))).toBe(true);
    expect(keepsStructure('insertCompositionText', at(hello, 3))).toBe(true);
    // Also where there is no text node yet.
    expect(keepsStructure('insertText', at(p, 1))).toBe(true);
  });

  it('turns down line breaks, the history of the browser and formatting', () => {
    expect(keepsStructure('insertParagraph', at(hello, 3))).toBe(false);
    expect(keepsStructure('insertLineBreak', at(hello, 3))).toBe(false);
    expect(keepsStructure('historyUndo', at(hello, 3))).toBe(false);
    expect(keepsStructure('formatBold', selected(hello, hello))).toBe(false);
  });

  it('lets a selection inside one text node be replaced or deleted, and no other', () => {
    expect(keepsStructure('insertText', selected(hello, hello))).toBe(true);
    expect(keepsStructure('deleteContentBackward', selected(world, world))).toBe(true);
    expect(keepsStructure('insertText', selected(hello, world))).toBe(false);
    expect(keepsStructure('deleteByCut', selected(hello, world))).toBe(false);
    expect(keepsStructure('insertText', selected(p, p))).toBe(false);
  });

  it('lets a deletion stay inside its text node, and stops it at the edge', () => {
    expect(keepsStructure('deleteContentBackward', at(hello, 3))).toBe(true);
    expect(keepsStructure('deleteContentBackward', at(hello, 0))).toBe(false);
    expect(keepsStructure('deleteWordBackward', at(world, 0))).toBe(false);
    expect(keepsStructure('deleteContentForward', at(world, 2))).toBe(true);
    expect(keepsStructure('deleteContentForward', at(world, world.data.length))).toBe(false);
    // Between two elements there is no text to delete.
    expect(keepsStructure('deleteContentBackward', at(p, 1))).toBe(false);
  });

  it('turns everything down without a selection', () => {
    const none: Caret = { anchorNode: null, anchorOffset: 0, focusNode: null, isCollapsed: true };
    expect(keepsStructure('insertText', none)).toBe(false);
  });
});
