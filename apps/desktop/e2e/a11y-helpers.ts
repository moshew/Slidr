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
