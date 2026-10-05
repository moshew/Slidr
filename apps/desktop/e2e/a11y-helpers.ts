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

/* ---------------------------------------------------------------- many surfaces in one page */

/** A fault, and the surface of the app it was found on. */
export interface Found extends Fault {
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
