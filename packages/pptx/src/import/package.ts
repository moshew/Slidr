import { resolveTarget, relsPathOf } from '../opc';
import { attr, children, parseXml, type XmlElement } from '../xml';
import { readZip, type ZipEntry } from '../zip';

/*
 * The parts of a file being read, parsed when they are first asked for, and their relationships.
 */

export interface Relationship {
  id: string;
  type: string;
  /** The part it points at (a path in the package), or the address of an external target. */
  target: string;
  external: boolean;
}

const safeDecode = (target: string): string => {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
};

/** The last word of a relationship type: `slide`, `image`, `slideLayout`. */
export const relKind = (type: string): string => type.slice(type.lastIndexOf('/') + 1);

export class PackageReader {
  readonly #entries: Map<string, ZipEntry>;
  readonly #xml = new Map<string, Promise<XmlElement | undefined>>();
  readonly #rels = new Map<string, Promise<Map<string, Relationship>>>();
  readonly #decoder = new TextDecoder();

  constructor(bytes: Uint8Array) {
    this.#entries = readZip(bytes);
    // Names are matched without regard to case, as Office does.
    for (const [name, entry] of [...this.#entries]) {
      const lower = name.toLowerCase();
      if (!this.#entries.has(lower)) this.#entries.set(lower, entry);
    }
  }

  #entry(path: string): ZipEntry | undefined {
    return this.#entries.get(path) ?? this.#entries.get(path.toLowerCase());
  }

  has(path: string): boolean {
    return this.#entry(path) !== undefined;
  }

  async bytes(path: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
    const entry = this.#entry(path);
    return entry ? entry.read() : undefined;
  }

  size(path: string): number | undefined {
    return this.#entry(path)?.size;
  }

  /** A part as XML, or undefined when it is not there or cannot be parsed. */
  xml(path: string): Promise<XmlElement | undefined> {
    let parsed = this.#xml.get(path);
    if (!parsed) {
      parsed = (async () => {
        const bytes = await this.bytes(path);
        if (!bytes) return undefined;
        try {
          return parseXml(this.#decoder.decode(bytes));
        } catch {
          return undefined;
        }
      })();
      this.#xml.set(path, parsed);
    }
    return parsed;
  }

  /** The relationships of a part, by id; of the package with `''`. */
  rels(path: string): Promise<Map<string, Relationship>> {
    let found = this.#rels.get(path);
    if (!found) {
      found = (async () => {
        const out = new Map<string, Relationship>();
        const xml = await this.xml(path === '' ? '_rels/.rels' : relsPathOf(path));
        for (const r of children(xml, 'Relationship')) {
          const id = attr(r, 'Id');
          const target = attr(r, 'Target');
          if (!id || target === undefined) continue;
          const external = attr(r, 'TargetMode') === 'External';
          out.set(id, {
            id,
            type: attr(r, 'Type') ?? '',
            target: external ? target : resolveTarget(path, safeDecode(target)),
            external,
          });
        }
        return out;
      })();
      this.#rels.set(path, found);
    }
    return found;
  }

  /** The first relationship of a kind: `rel(slide, 'slideLayout')`. */
  async rel(path: string, kind: string): Promise<Relationship | undefined> {
    for (const r of (await this.rels(path)).values()) if (relKind(r.type) === kind) return r;
    return undefined;
  }
}
