import type { Page } from '@playwright/test';

/*
 * Shared by the security suites (WG13-T04, ADR-066): the one on the dev server's page, and the
 * one on the packaged app (`packaged/security.spec.ts`).
 */

/** What a script inside an `html` object found when it tried to get out of its frame. */
export interface FrameReport {
  /** The script ran at all. */
  ran: true;
  /** `typeof` of what the app's own page calls the core with. */
  internals: string;
  ipc: string;
  webview: string;
  /** The frame's origin: `null` for a sandbox that is never same-origin. */
  origin: string;
  /** Reading the page around the frame. */
  parent: 'readable' | 'blocked';
  /** The page's storage: the language, the agent's settings. */
  storage: 'readable' | 'blocked';
  /** A command of the core, sent the way the app's page sends one. */
  command: string;
  /** A server outside the app. */
  outside: 'answered' | 'refused';
  /** An inline event handler of the object's markup. */
  handler: boolean;
}

/**
 * The markup of an `html` object whose script tries every way out and tells the page what it
 * found, in a message: the one channel a sandboxed frame has to the page around it.
 * `outside` is an address that answers, on an origin that is not the app's.
 */
export function probeMarkup(outside: string): string {
  return `<button id="b" onclick="window.__clicked = true">probe</button>
<script>
(async () => {
  const report = { ran: true };
  report.internals = typeof window.__TAURI_INTERNALS__;
  report.ipc = typeof window.ipc;
  report.webview = typeof (window.chrome && window.chrome.webview);
  report.origin = String(window.origin);
  try { void parent.document.title; report.parent = 'readable'; } catch { report.parent = 'blocked'; }
  try { localStorage.getItem('slidr.agent'); report.storage = 'readable'; } catch { report.storage = 'blocked'; }
  try {
    const response = await fetch('http://ipc.localhost/storage_new', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json', 'Tauri-Callback': '1', 'Tauri-Error': '2' },
    });
    report.command = 'answered ' + response.status;
  } catch { report.command = 'refused'; }
  try { await fetch(${JSON.stringify(outside)}, { mode: 'no-cors' }); report.outside = 'answered'; } catch { report.outside = 'refused'; }
  document.getElementById('b').click();
  report.handler = window.__clicked === true;
  parent.postMessage({ slidrProbe: report }, '*');
})();
</script>`;
}

/** Starts listening, in the page, for the report of a probe that is about to be drawn. */
export async function listenForProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __probes?: unknown[] };
    if (w.__probes) return;
    const probes: unknown[] = [];
    w.__probes = probes;
    window.addEventListener('message', (event) => {
      const data = event.data as { slidrProbe?: unknown } | null;
      if (data && typeof data === 'object' && data.slidrProbe) probes.push(data.slidrProbe);
    });
  });
}

/** The reports that have arrived: one per frame that drew the probe and ran its script. */
export function probeReports(page: Page): Promise<FrameReport[]> {
  return page.evaluate(() => (window as unknown as { __probes?: FrameReport[] }).__probes ?? []);
}

/** What the page's content policy refused since `watchViolations`, as `directive blocked-uri`. */
export async function watchViolations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __violations?: string[] };
    if (w.__violations) return;
    const seen: string[] = [];
    w.__violations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
}

export function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __violations?: string[] }).__violations ?? []);
}

/**
 * What markup that reaches the page's own document could do if it were not cleaned, tried
 * directly: a handler attribute, a script address, a frame with a script, a script element,
 * text compiled as code. Returns the names of the ones that ran: none, under the policy.
 */
export async function injectIntoPage(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const ran = new Set<string>();
    (window as unknown as { __ran: (name: string) => void }).__ran = (name) => ran.add(name);
    const host = document.createElement('div');
    document.body.append(host);
    // As markup: a handler on a picture that fails to load, a link that is a script, and a
    // frame of the page's own origin with a script in it.
    host.innerHTML =
      '<img src="data:image/png;base64,AAAA" onerror="__ran(\'handler\')">' +
      '<a id="hardening-link" href="javascript:void(__ran(\'address\'))">x</a>' +
      "<iframe srcdoc=\"<script>parent.__ran('frame')</scr" +
      'ipt>"></iframe>';
    host.querySelector<HTMLAnchorElement>('#hardening-link')?.click();
    // As a script element made by code that got in some other way.
    const script = document.createElement('script');
    script.textContent = "__ran('element')";
    host.append(script);
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      // Text turned into code. After the wait: what a debugger evaluates is allowed to compile,
      // and this function begins as one such evaluation; past an `await` it is the page's own.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const compiled = new Function("__ran('compiled')") as () => void;
      compiled();
    } catch {
      // Refused, as it should be.
    }
    host.remove();
    return [...ran];
  });
}
