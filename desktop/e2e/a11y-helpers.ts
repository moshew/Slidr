import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';

/*
 * The accessibility audit (WG13-T06, UI-06, DSN-08): axe-core, run in the page a spec has open.
 *
 * axe-core is a development dependency and never part of the app: its source is read here, in
 * the test process, and evaluated in the page through the browser's debugging protocol. No script
 * tag is added, so the app's content policy stays as strict as it is, and nothing reaches the
 * bundle.
 */

const require = createRequire(import.meta.url);
let source: string | undefined;

/** The source of axe-core, read once for the run. */
function axeSource(): string {
  source ??= readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  return source;
}

/** One element a rule found fault with. */
export interface Fault {
  /** The rule of axe-core, such as `color-contrast`. */
  rule: string;
  impact: string;
  /** What the rule asks for, in a sentence. */
  help: string;
  /** A selector of the element, and the start of its markup. */
  target: string;
  html: string;
  /** Why this element fails the rule. */
  why: string;
}

/** The impacts the audit holds the app to (the task: no serious or critical violation). */
const HELD = new Set(['serious', 'critical']);

export interface AuditOptions {
  /** Audit only what is under this selector: an open dialog, a popover. Default: the page. */
  within?: string;
  /**
   * Rules left out, each with its reason. A reason is part of the spec: an exclusion without
   * one is a fault that was hidden.
   */
  except?: Record<string, string>;
}

/**
 * Runs axe-core on the page as it is now and returns the faults of serious and critical impact,
 * one per element.
 */
export async function audit(page: Page, options: AuditOptions = {}): Promise<Fault[]> {
  const loaded = await page.evaluate(() => 'axe' in window);
  if (!loaded) await page.evaluate(axeSource());
  const except = Object.keys(options.except ?? {});
  const violations = await page.evaluate(
    async ({ within, except }) => {
      const axe = (window as unknown as { axe: AxeLike }).axe;
      const rules = Object.fromEntries(except.map((id) => [id, { enabled: false }]));
      const results = await axe.run(within ?? document, { resultTypes: ['violations'], rules });
      return results.violations;

      interface AxeCheck {
        message: string;
      }
      interface AxeNode {
        target: unknown[];
        html: string;
        any: AxeCheck[];
        all: AxeCheck[];
        none: AxeCheck[];
      }
      interface AxeLike {
        run(
          context: unknown,
          options: unknown,
        ): Promise<{
          violations: { id: string; impact: string | null; help: string; nodes: AxeNode[] }[];
        }>;
      }
    },
    { within: options.within, except },
  );
  return violations
    .filter((violation) => HELD.has(violation.impact ?? ''))
    .flatMap((violation) =>
      violation.nodes.map((node) => ({
        rule: violation.id,
        impact: violation.impact ?? '',
        help: violation.help,
        target: node.target.map(String).join(' '),
        html: node.html.replace(/\s+/g, ' ').slice(0, 160),
        why: [...node.any, ...node.all, ...node.none]
          .map((check) => check.message)
          .slice(0, 2)
          .join(' / '),
      })),
    );
}

/** A fault as a line a person can act on, for the failure message. */
const line = (fault: Fault) =>
  `[${fault.impact}] ${fault.rule}: ${fault.help}\n    ${fault.target}\n    ${fault.html}\n    ${fault.why}`;

/** Holds the page, or a part of it, to no fault of serious or critical impact. */
export async function expectNoFaults(page: Page, options: AuditOptions = {}): Promise<void> {
  const faults = await audit(page, options);
  expect(faults.map(line).join('\n\n'), 'accessibility faults (axe-core)').toBe('');
}

/* ---------------------------------------------------------------- beyond axe-core */

/**
 * What axe-core does not judge, read from the same page (WG13-T06). The first five are held: a
 * surface has none of them, or the audit says why the one it has is no fault.
 *
 *   - `pointer`: something that answers the pointer and that the keyboard cannot be on. It has a
 *     handler of a press, and is no control, is in none, and has none in it.
 *   - `unreached`: a control that Tab does not stop at, and that is not part of a widget the
 *     arrows walk (a list, a tree, a menu, a row of tabs or of tools).
 *   - `keyless`: something that says it is a control (a role of one), answers a press, is not
 *     the browser's own control, and has no handler of a key, in itself or around it.
 *   - `picture`: a control that takes its name from a picture of a slide, with every word the
 *     slide holds, or whose name runs on longer than a name is.
 *   - `mute`: a name on an element that has no role to carry it (`aria-label` on a `span`): it is
 *     not read.
 *
 * And two that are kept to be read by a person, not held:
 *
 *   - `around`: what answers a press and has controls inside it. Mostly a list or a frame that
 *     listens for its children; now and then a thing that only a drag does.
 *   - `live`: the regions that announce a change by themselves.
 */
export interface Beyond {
  kind: 'pointer' | 'unreached' | 'keyless' | 'picture' | 'mute' | 'around' | 'live';
  /** What it is, as short as tells it apart: tag, role, test id, label, the start of its text. */
  what: string;
  /** The handlers, the length of the name, or how the region announces. */
  detail: string;
}

/** The kinds a surface is held to. */
export const HELD_BEYOND: readonly Beyond['kind'][] = [
  'pointer',
  'unreached',
  'keyless',
  'picture',
  'mute',
];

/** A name longer than this is not a name. */
const LONG_NAME = 120;

export function beyond(page: Page, within?: string): Promise<Beyond[]> {
  return page.evaluate(
    ({ within, longName }) => {
      const root = (within ? document.querySelector(within) : document.body) ?? document.body;
      const PRESS = [
        'onClick',
        'onDoubleClick',
        'onPointerDown',
        'onMouseDown',
        'onContextMenu',
        'onDrop',
        'onDragStart',
      ];
      const KEYS = ['onKeyDown', 'onKeyUp', 'onKeyPress', 'onKeyDownCapture'];
      const NATIVE = 'a[href], button, input, select, textarea, summary';
      const CONTROL = `${NATIVE}, [tabindex], [contenteditable=""], [contenteditable="true"]`;
      /** Roles of a control: something a person presses, sets or picks. */
      const ACTS = new Set([
        'button',
        'link',
        'option',
        'menuitem',
        'menuitemradio',
        'menuitemcheckbox',
        'tab',
        'radio',
        'checkbox',
        'switch',
        'treeitem',
        'slider',
        'spinbutton',
        'combobox',
        'textbox',
        'gridcell',
      ]);
      /** Widgets whose parts the arrows walk: Tab stops at the widget once. */
      const WALKED =
        '[role="listbox"], [role="tree"], [role="menu"], [role="menubar"], [role="tablist"], [role="radiogroup"], [role="toolbar"], [role="grid"], [aria-activedescendant]';
      const out: { kind: string; what: string; detail: string }[] = [];
      const describe = (el: Element) => {
        const role = el.getAttribute('role');
        const id = el.getAttribute('data-testid');
        const label = el.getAttribute('aria-label');
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
        return [
          el.tagName.toLowerCase() + (role ? `[${role}]` : ''),
          id ? `#${id}` : '',
          label ? `"${label.slice(0, 40)}"` : '',
          !label && text ? `'${text}'` : '',
          !id && !label ? `.${String(el.getAttribute('class') ?? '').slice(0, 50)}` : '',
        ]
          .filter(Boolean)
          .join(' ');
      };
      const hidden = (el: Element) =>
        el.closest('[aria-hidden="true"], [inert]') !== null || el.getClientRects().length === 0;
      const handlers = (el: Element, names: string[]) => {
        const key = Object.keys(el).find((name) => name.startsWith('__reactProps$'));
        const props = key
          ? ((el as unknown as Record<string, Record<string, unknown>>)[key] ?? {})
          : {};
        return names.filter((name) => typeof props[name] === 'function');
      };
      const off = (el: Element) =>
        el.matches(':disabled, [aria-disabled="true"], [data-disabled]') ||
        el.closest('[aria-disabled="true"], [data-disabled]') !== null;
      /** Whether a key pressed on the element is heard by it, or by something around it. */
      const keysHeard = (el: Element) => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          if (handlers(node, KEYS).length > 0) return true;
        }
        return false;
      };

      for (const el of root.querySelectorAll<HTMLElement>('*')) {
        // The slide itself is content, not the app's surface.
        if (el.closest('.slidr-slide')) continue;
        if (hidden(el)) continue;
        const role = el.getAttribute('role');
        const native = el.matches(NATIVE);
        const acts = native || (role !== null && ACTS.has(role));

        // A name with no role to carry it.
        const generic = (el.tagName === 'SPAN' || el.tagName === 'DIV') && !role;
        if (generic && (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby'))) {
          if (!el.hasAttribute('tabindex') && !el.hasAttribute('contenteditable'))
            out.push({ kind: 'mute', what: describe(el), detail: '' });
        }

        // A region that announces itself.
        const live = el.getAttribute('aria-live');
        if (live || role === 'status' || role === 'alert' || role === 'log') {
          out.push({ kind: 'live', what: describe(el), detail: live ?? role ?? '' });
        }

        // A control named by a picture of a slide, or by more words than a name has.
        if (acts && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
          const drawn = [...el.querySelectorAll('.slidr-slide')].some(
            (slide) => !slide.closest('[aria-hidden="true"]'),
          );
          const length = el.innerText.replace(/\s+/g, ' ').trim().length;
          const typed = el.matches('input, textarea, select, [role="textbox"], [role="combobox"]');
          if (drawn) out.push({ kind: 'picture', what: describe(el), detail: 'a slide' });
          else if (length > longName && !typed)
            out.push({ kind: 'picture', what: describe(el), detail: `${length} characters` });
        }

        // A control Tab does not stop at, outside any widget the arrows walk.
        // (Text that is edited in place is a stop of Tab though it says -1.)
        const stop = el.tabIndex >= 0 || (el.isContentEditable && !el.hasAttribute('tabindex'));
        if (acts && !off(el) && !stop) {
          const widget = el.closest<HTMLElement>(WALKED);
          // A menu or a list that floats by its button is given the keyboard as it opens.
          const floating = el.closest('[data-radix-popper-content-wrapper]');
          const walked =
            widget !== null &&
            (floating?.contains(widget) ||
              widget.hasAttribute('aria-activedescendant') ||
              widget.tabIndex >= 0 ||
              [...widget.querySelectorAll<HTMLElement>('*')].some((part) => part.tabIndex >= 0));
          if (!walked) out.push({ kind: 'unreached', what: describe(el), detail: 'tabindex -1' });
        }

        // Something with the role of a control that hears a press and no key.
        const presses = handlers(el, PRESS);
        if (acts && !native && presses.length > 0 && !keysHeard(el)) {
          out.push({ kind: 'keyless', what: describe(el), detail: presses.join(' ') });
        }

        // Something that answers a press and that the keyboard cannot be on.
        if (presses.length === 0) continue;
        if (el.closest(CONTROL)) continue;
        if (el.tagName === 'LABEL') continue;
        out.push({
          kind: el.querySelector(CONTROL) ? 'around' : 'pointer',
          what: describe(el),
          detail: presses.join(' '),
        });
      }
      return out as never;
    },
    { within, longName: LONG_NAME },
  );
}

/* ---------------------------------------------------------------- many surfaces in one page */

/** A fault, and the surface of the app it was found on. */
export interface Found extends Fault {
  surface: string;
}

/** Something beyond axe-core's judgement, and the first surface it was seen on. */
export interface Seen extends Beyond {
  surface: string;
}

export type Language = 'he' | 'en';
export type Scheme = 'light' | 'dark';

/** The app's own module of the UI language, as the page imports it from the dev server. */
const I18N = '/src/i18n/index.ts';

/** What opens over the page: a menu, a popover or a dialog, a list of choices. */
const LAYER = '[role="menu"], [role="dialog"], [role="listbox"]';
/** What opens one: a button that says so, or a select. */
const TRIGGER =
  ':is(button[aria-haspopup], [role="combobox"], [role="menuitem"][aria-haspopup]):not([disabled]):not([data-disabled])';
const MARK = 'data-a11y-layer';

/**
 * An audit of several surfaces of one page: each is audited where the test has brought the
 * app, and what is found is kept with the surface's name. The test compares all of it at its
 * end, so one run says everything that is wrong, not only the first thing.
 */
export class Survey {
  /** Faults of serious and critical impact, each with its surface. */
  readonly found: Found[] = [];
  /** The surfaces that were audited, in order: a test can say how many it really reached. */
  readonly surfaces: string[] = [];
  /** A layer that Esc did not close, or a trigger that opened nothing: for the keyboard's pass. */
  readonly stuck: string[] = [];
  /** What `beyond` saw, each thing once, with the first surface it was on. */
  readonly seen: Seen[] = [];
  private readonly known = new Set<string>();

  private readonly languages: readonly Language[];
  private readonly schemes: readonly Scheme[];

  /**
   * `languages` and `schemes`: what each surface is audited in. With more than one of either,
   * the page is switched where it stands (the app changes its language and follows the system's
   * scheme without a reload), so a surface is reached once and judged in every combination. The
   * first of each is what the page is in between audits, and what a surface is named in.
   */
  constructor(
    private readonly page: Page,
    options: { languages?: readonly Language[]; schemes?: readonly Scheme[] } = {},
  ) {
    this.languages = options.languages ?? [];
    this.schemes = options.schemes ?? [];
  }

  /**
   * Waits until what a switch changed has been drawn, and its colours have arrived. A change of
   * colour is a transition, of a millisecond with motion reduced, and an inherited colour is one
   * transition under another: the child's starts when the parent's ends, a frame later, level
   * after level. So one pass is not enough (it left text in the other scheme's colour, and the
   * audit called it a contrast fault): transitions are finished frame after frame until three
   * frames in a row find none.
   */
  private settled(): Promise<void> {
    return this.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let quiet = 0;
          let frames = 0;
          const pass = () => {
            // Only transitions: an animation that never ends cannot be finished.
            const running = document
              .getAnimations()
              .filter((motion) => motion instanceof CSSTransition);
            for (const motion of running) motion.finish();
            quiet = running.length === 0 ? quiet + 1 : 0;
            if (quiet >= 3 || ++frames > 120) resolve();
            else requestAnimationFrame(pass);
          };
          requestAnimationFrame(pass);
        }),
    );
  }

  private async scheme(scheme: Scheme): Promise<void> {
    await this.page.emulateMedia({ colorScheme: scheme });
    // The app hears the system change its scheme a moment later, and says which it is in on
    // the page itself. Judging before that would be judging the other scheme's colours.
    await expect(this.page.locator('html')).toHaveAttribute('data-theme', scheme);
    await this.settled();
  }

  /** Switches the language of the UI as the settings do, by the app's own function. */
  private async language(language: Language): Promise<void> {
    await this.page.evaluate(
      async ({ path, to }) => {
        const i18n = (await import(/* @vite-ignore */ path)) as {
          setLanguage: (language: string) => Promise<void>;
        };
        await i18n.setLanguage(to);
      },
      { path: I18N, to: language },
    );
    await expect(this.page.locator('html')).toHaveAttribute('lang', language);
    // The page says its direction with its language: every reading of it starts from both.
    await expect(this.page.locator('html')).toHaveAttribute(
      'dir',
      language === 'he' ? 'rtl' : 'ltr',
    );
    await this.settled();
  }

  /**
   * Audits the page as it is now, or the part of it under `within`, as the named surface, in
   * every language and scheme the survey was given.
   */
  async audit(surface: string, options: AuditOptions = {}): Promise<void> {
    this.surfaces.push(surface);
    // What the keyboard cannot be on and what a screen reader is told does not change with the
    // language or the scheme: read once, as the surface is reached.
    for (const thing of await beyond(this.page, options.within)) {
      const key = `${thing.kind}|${thing.what}|${thing.detail}`;
      if (this.known.has(key)) continue;
      this.known.add(key);
      this.seen.push({ surface, ...thing });
    }
    const languages: readonly (Language | undefined)[] =
      this.languages.length > 1 ? this.languages : [undefined];
    const schemes: readonly (Scheme | undefined)[] =
      this.schemes.length > 1 ? this.schemes : [undefined];
    for (const language of languages) {
      if (language) await this.language(language);
      // A layer that the change of language closed is not there to judge in the other one.
      if (options.within && (await this.page.locator(options.within).count()) === 0) {
        this.stuck.push(`${surface}: closed when the language changed to ${language ?? ''}`);
        break;
      }
      for (const scheme of schemes) {
        if (scheme) await this.scheme(scheme);
        const where = [language, scheme].filter(Boolean).join(', ');
        const name = where ? `${surface} [${where}]` : surface;
        for (const fault of await audit(this.page, options)) {
          this.found.push({ surface: name, ...fault });
        }
      }
      if (schemes[0]) await this.scheme(schemes[0]);
    }
    if (languages[0]) await this.language(languages[0]);
  }

  /** The layers open now, by what they are, newest last. */
  private layers(): Promise<number> {
    return this.page.locator(LAYER).count();
  }

  /**
   * Opens everything under `scope` that opens a layer (a menu, a popover, a list of a select),
   * audits the layer as `<surface> > <name of what opened it>`, and closes it with Esc. A layer
   * may open another (a colour picker in a popover, a sub-menu): those are audited too, one
   * level in.
   */
  async popups(scope: string, surface: string, depth = 1): Promise<void> {
    const page = this.page;
    const triggers = page.locator(scope).locator(TRIGGER);
    const count = await triggers.count();
    for (let i = 0; i < count; i++) {
      const trigger = triggers.nth(i);
      // The surface may have drawn itself again since the count was taken.
      if (!(await trigger.isVisible().catch(() => false))) continue;
      const label =
        (await trigger.getAttribute('aria-label')) ??
        (await trigger.innerText().catch(() => '')).trim().split('\n')[0] ??
        '';
      const name = `${surface} > ${label || `#${i + 1}`}`;
      const before = await this.layers();
      await trigger.click();
      const opened = await expect
        .poll(() => this.layers(), { timeout: 2000 })
        .toBeGreaterThan(before)
        .then(
          () => true,
          () => false,
        );
      if (!opened) {
        this.stuck.push(`${name}: opened nothing`);
        continue;
      }
      // The newest layer is the last in the document: mark it, and audit only it.
      await page.evaluate(
        ({ selector, mark }) => {
          document.querySelectorAll(`[${mark}]`).forEach((node) => node.removeAttribute(mark));
          [...document.querySelectorAll(selector)].at(-1)?.setAttribute(mark, '');
        },
        { selector: LAYER, mark: MARK },
      );
      await this.audit(name, { within: `[${MARK}]` });
      if (depth > 0) {
        // What this layer opens in turn. Marked apart, so the inner layer's mark does not
        // move the scope while its triggers are still being walked.
        await page.evaluate((mark) => {
          document.querySelector(`[${mark}]`)?.setAttribute(`${mark}-outer`, '');
        }, MARK);
        await this.popups(`[${MARK}-outer]`, name, depth - 1);
        await page.evaluate((mark) => {
          document
            .querySelectorAll(`[${mark}-outer]`)
            .forEach((node) => node.removeAttribute(`${mark}-outer`));
        }, MARK);
      }
      // Esc closes a layer. One that does not is noted, and closed by a press beside it.
      for (let presses = 0; presses < 3 && (await this.layers()) > before; presses++) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(60);
      }
      if ((await this.layers()) > before) {
        this.stuck.push(`${name}: Esc did not close it`);
        await page.mouse.click(1, 1);
        await expect.poll(() => this.layers(), { timeout: 2000 }).toBeLessThanOrEqual(before);
      }
    }
  }
}
