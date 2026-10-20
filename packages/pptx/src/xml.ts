/*
 * The XML of the parts: a small parser that gives every element the prefix its namespace has in
 * the standard (`a:`, `p:`, `r:`, `c:`), whatever prefix the file wrote, and helpers to read and
 * write it. The parts have no DTD and no entities of their own, so this is all they need, and it
 * reads the same in the webview and in a test.
 */

export interface XmlElement {
  /** With the standard prefix of its namespace: `p:sp`, `a:t`. */
  name: string;
  /** Attribute names with the standard prefix too: `r:embed`. Unprefixed ones as they are. */
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

export class XmlError extends Error {
  override name = 'XmlError';
}

/** The standard prefix of each namespace a presentation uses, transitional and strict. */
const NAMESPACES: Record<string, string> = {
  'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
  'http://purl.oclc.org/ooxml/drawingml/main': 'a',
  'http://schemas.openxmlformats.org/presentationml/2006/main': 'p',
  'http://purl.oclc.org/ooxml/presentationml/main': 'p',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships': 'r',
  'http://purl.oclc.org/ooxml/officeDocument/relationships': 'r',
  'http://schemas.openxmlformats.org/drawingml/2006/chart': 'c',
  'http://purl.oclc.org/ooxml/drawingml/chart': 'c',
  'http://schemas.openxmlformats.org/drawingml/2006/picture': 'pic',
  'http://purl.oclc.org/ooxml/drawingml/picture': 'pic',
  'http://schemas.openxmlformats.org/drawingml/2006/diagram': 'dgm',
  'http://schemas.microsoft.com/office/drawing/2008/diagram': 'dsp',
  'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
  'http://schemas.microsoft.com/office/powerpoint/2010/main': 'p14',
  'http://schemas.microsoft.com/office/drawing/2010/main': 'a14',
  'http://schemas.microsoft.com/office/drawing/2016/SVG/main': 'asvg',
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main': 'x',
  'http://schemas.openxmlformats.org/package/2006/relationships': '',
  'http://schemas.openxmlformats.org/package/2006/content-types': '',
  'http://schemas.openxmlformats.org/package/2006/metadata/core-properties': 'cp',
  'http://purl.org/dc/elements/1.1/': 'dc',
};

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decode(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : +name.slice(1);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

type Scope = Record<string, string>;

/** The name with the standard prefix of its namespace, as the scope maps prefixes to them. */
function canonical(name: string, scope: Scope, isAttribute: boolean): string {
  const colon = name.indexOf(':');
  const prefix = colon < 0 ? '' : name.slice(0, colon);
  const local = colon < 0 ? name : name.slice(colon + 1);
  // An unprefixed attribute is in no namespace.
  if (colon < 0 && isAttribute) return name;
  const uri = scope[prefix];
  const standard = uri === undefined ? undefined : NAMESPACES[uri];
  if (standard === undefined) return name;
  return standard ? `${standard}:${local}` : local;
}

const NAME = /[^\s/>=]+/y;
const SPACE = /\s*/y;

/** Parses a document and returns its root element. Rejects with `XmlError`. */
export function parseXml(source: string): XmlElement {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const root: XmlElement = { name: '#document', attrs: {}, children: [] };
  const stack: { element: XmlElement; scope: Scope; raw: string }[] = [
    { element: root, scope: { xml: 'http://www.w3.org/XML/1998/namespace' }, raw: '' },
  ];
  let at = 0;
  const fail = (message: string): never => {
    throw new XmlError(`${message} at ${at}`);
  };
  while (at < text.length) {
    const lt = text.indexOf('<', at);
    const top = stack[stack.length - 1]!;
    if (lt < 0 || lt > at) {
      const chunk = text.slice(at, lt < 0 ? text.length : lt);
      if (top.element !== root) top.element.children.push(decode(chunk));
      if (lt < 0) break;
      at = lt;
    }
    if (text.startsWith('<!--', at)) {
      const close = text.indexOf('-->', at + 4);
      if (close < 0) fail('unclosed comment');
      at = close + 3;
    } else if (text.startsWith('<![CDATA[', at)) {
      const close = text.indexOf(']]>', at + 9);
      if (close < 0) fail('unclosed CDATA');
      top.element.children.push(text.slice(at + 9, close));
      at = close + 3;
    } else if (text.startsWith('<?', at)) {
      const close = text.indexOf('?>', at + 2);
      if (close < 0) fail('unclosed processing instruction');
      at = close + 2;
    } else if (text.startsWith('<!', at)) {
      const close = text.indexOf('>', at + 2);
      if (close < 0) fail('unclosed declaration');
      at = close + 1;
    } else if (text[at + 1] === '/') {
      const close = text.indexOf('>', at + 2);
      if (close < 0) fail('unclosed end tag');
      const name = text.slice(at + 2, close).trim();
      if (stack.length < 2 || top.raw !== name) fail(`unexpected </${name}>`);
      stack.pop();
      at = close + 1;
    } else {
      NAME.lastIndex = at + 1;
      const match = NAME.exec(text);
      if (!match) fail('bad tag');
      const raw = match![0];
      at = NAME.lastIndex;
      const rawAttrs: [string, string][] = [];
      for (;;) {
        SPACE.lastIndex = at;
        SPACE.exec(text);
        at = SPACE.lastIndex;
        const c = text[at];
        if (c === '>' || c === '/') break;
        if (c === undefined) fail('unclosed tag');
        NAME.lastIndex = at;
        const attr = NAME.exec(text);
        if (!attr) fail('bad attribute');
        at = NAME.lastIndex;
        SPACE.lastIndex = at;
        SPACE.exec(text);
        at = SPACE.lastIndex;
        if (text[at] !== '=') {
          rawAttrs.push([attr![0], '']);
          continue;
        }
        at++;
        SPACE.lastIndex = at;
        SPACE.exec(text);
        at = SPACE.lastIndex;
        const quote = text[at];
        if (quote !== '"' && quote !== "'") fail('unquoted attribute');
        const close = text.indexOf(quote!, at + 1);
        if (close < 0) fail('unclosed attribute');
        rawAttrs.push([attr![0], decode(text.slice(at + 1, close))]);
        at = close + 1;
      }
      const selfClosing = text[at] === '/';
      at += selfClosing ? 2 : 1;
      let scope = top.scope;
      for (const [name, value] of rawAttrs) {
        if (name === 'xmlns' || name.startsWith('xmlns:')) {
          if (scope === top.scope) scope = { ...scope };
          scope[name === 'xmlns' ? '' : name.slice(6)] = value;
        }
      }
      const attrs: Record<string, string> = {};
      for (const [name, value] of rawAttrs) {
        if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
        attrs[canonical(name, scope, true)] = value;
      }
      const element: XmlElement = { name: canonical(raw, scope, false), attrs, children: [] };
      top.element.children.push(element);
      if (!selfClosing) stack.push({ element, scope, raw });
    }
  }
  if (stack.length > 1) throw new XmlError(`unclosed <${stack[stack.length - 1]!.raw}>`);
  const first = root.children.find((node): node is XmlElement => typeof node !== 'string');
  if (!first) throw new XmlError('no root element');
  return first;
}

/* ---------------------------------------------------------------- reading */

/** The first child element of the name, or any of the names. */
export function child(el: XmlElement | undefined, ...names: string[]): XmlElement | undefined {
  if (!el) return undefined;
  for (const node of el.children) {
    if (typeof node !== 'string' && names.includes(node.name)) return node;
  }
  return undefined;
}

/** The child elements, all of them or those of the names. */
export function children(el: XmlElement | undefined, ...names: string[]): XmlElement[] {
  if (!el) return [];
  return el.children.filter(
    (node): node is XmlElement =>
      typeof node !== 'string' && (names.length === 0 || names.includes(node.name)),
  );
}

/** The element down a path of names: `path(sp, 'p:spPr', 'a:xfrm', 'a:off')`. */
export function path(el: XmlElement | undefined, ...names: string[]): XmlElement | undefined {
  let at = el;
  for (const name of names) at = child(at, name);
  return at;
}

/** Every descendant element of the name, in document order. */
export function descendants(el: XmlElement | undefined, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (node: XmlElement) => {
    for (const c of node.children) {
      if (typeof c === 'string') continue;
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  if (el) walk(el);
  return out;
}

/** The text inside the element and its descendants. */
export function textOf(el: XmlElement | undefined): string {
  if (!el) return '';
  return el.children.map((node) => (typeof node === 'string' ? node : textOf(node))).join('');
}

export function attr(el: XmlElement | undefined, name: string): string | undefined {
  return el?.attrs[name];
}

/** A whole-number attribute, or undefined when absent or not a number. */
export function intAttr(el: XmlElement | undefined, name: string): number | undefined {
  const value = el?.attrs[name];
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** An `xsd:boolean` attribute: `1` and `true` are true. */
export function boolAttr(el: XmlElement | undefined, name: string): boolean | undefined {
  const value = el?.attrs[name];
  if (value === undefined) return undefined;
  return value === '1' || value === 'true' || value === 'on';
}

/* ---------------------------------------------------------------- writing */

/** Text as XML: escaped, and without the characters XML 1.0 does not allow. */
export function esc(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\ufffe\uffff]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}

export type Attrs = Record<string, string | number | boolean | undefined>;

function attrsXml(attrs: Attrs | undefined): string {
  if (!attrs) return '';
  let out = '';
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    const text = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
    out += ` ${name}="${esc(text)}"`;
  }
  return out;
}

/**
 * An element as XML. Children are XML already (strings from `el`, or escaped text), and the
 * empty ones are left out; without children the element closes itself.
 */
export function el(
  name: string,
  attrs?: Attrs,
  ...content: (string | undefined | false)[]
): string {
  const inner = content.filter((part): part is string => Boolean(part)).join('');
  return inner ? `<${name}${attrsXml(attrs)}>${inner}</${name}>` : `<${name}${attrsXml(attrs)}/>`;
}

export const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
