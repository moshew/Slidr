import { expect, test, type Page } from '@playwright/test';
import type * as Runtime from '../src/ai/runtime';
import type * as Setup from '../src/agent/harnessSetup';
import type * as Settings from '../src/settings';
import type { AgentClient, HarnessDescriptor, HarnessStatus } from '../src/agent/agent';
import { openApp } from './arrange-helpers';

test.beforeEach(async ({ page }) => {
  // Keep the actual Vite module URL, including its HMR version, for the shared runtime.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
});

async function fixtures(page: Page) {
  await page.evaluate(async () => {
    const runtimePath =
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .findLast((name) => /\/src\/ai\/runtime\.ts(?:\?|$)/.test(name)) ?? '/src/ai/runtime.ts';
    const setupPath = '/src/agent/harnessSetup.ts';
    const settingsPath = '/src/settings/index.ts';
    const { agentOf } = (await import(/* @vite-ignore */ runtimePath)) as typeof Runtime;
    const { HarnessSetup } = (await import(/* @vite-ignore */ setupPath)) as typeof Setup;
    const { setAgentSettings } = (await import(/* @vite-ignore */ settingsPath)) as typeof Settings;
    const agent = agentOf(window.slidr!);
    const capabilities = {
      streaming: true,
      resume: true,
      interrupt: true,
      imageInput: true,
      toolEndpoint: true,
      thinking: true,
    };
    const descriptors: HarnessDescriptor[] = [
      {
        id: 'claude-code',
        name: 'Claude Code',
        capabilities,
        models: [],
        defaultModel: null,
        effortLevels: [],
      },
      {
        id: 'codex-cli',
        name: 'Codex CLI',
        capabilities,
        models: [],
        defaultModel: null,
        effortLevels: [],
      },
      {
        id: 'copilot-cli',
        name: 'GitHub Copilot CLI',
        capabilities,
        models: [],
        defaultModel: null,
        effortLevels: [],
      },
    ];
    const states: Record<string, HarnessStatus['state']> = {
      'claude-code': 'ready',
      'codex-cli': 'ready',
      'copilot-cli': 'not_installed',
    };
    const client = {
      connect: (id: string) => {
        document.body.dataset.connectedHarness = id;
        return Promise.resolve({
          status: { state: states[id]!, version: '1.2.3', account: null, detail: null },
          harness: {
            ...descriptors.find((h) => h.id === id)!,
            models: [
              { id: `${id}-reasoning`, label: 'Reasoning model', effortLevels: ['low', 'ultra'] },
              { id: `${id}-simple`, label: 'Simple model', effortLevels: [] },
            ],
          },
        });
      },
      install: (id: string) => {
        document.body.dataset.installedHarness = id;
        states[id] = 'not_logged_in';
        return Promise.resolve();
      },
      login: (id: string) => {
        document.body.dataset.loggedInHarness = id;
        states[id] = 'ready';
        return Promise.resolve();
      },
    } as AgentClient;
    agent.harnesses = () => Promise.resolve(descriptors);
    Object.assign(agent, { setup: new HarnessSetup(client, (id) => agent.harness(id)) });
    setAgentSettings({ harnessId: 'claude-code', model: undefined, effort: undefined });
  });
  await page.getByTestId('activity-bar').locator('[data-panel="settings"]').click();
  await expect(page.getByTestId('harness-connection')).toContainText(/Connected|מחובר/);
}

test('selection connects, installation needs approval, and sign-in loads models before choosing effort', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await fixtures(page);
  await page.getByRole('combobox', { name: 'Harness', exact: true }).click();
  await page.getByRole('option', { name: 'GitHub Copilot CLI', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-connected-harness', 'copilot-cli');
  await expect(page.getByTestId('harness-connection')).toContainText('not installed');
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-installed-harness');
  await page.getByRole('button', { name: 'Install…', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Windows App Installer');
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  await expect(page.locator('body')).not.toHaveAttribute('data-installed-harness');
  await page.getByRole('button', { name: 'Install…', exact: true }).click();
  await page.getByRole('button', { name: 'Approve and install', exact: true }).click();
  await expect(page.getByTestId('harness-connection')).toContainText('Sign in to your account');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toContainText(
    'Choose a model',
  );
  await page.getByRole('combobox', { name: 'Model', exact: true }).click();
  await page.getByRole('option', { name: 'Reasoning model', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Effort', exact: true })).toContainText(
    'Choose an effort',
  );
  await page.getByRole('combobox', { name: 'Effort', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(2);
  await page.getByRole('option', { name: /ultra/i }).click();
  await page.getByRole('combobox', { name: 'Model', exact: true }).click();
  await page.getByRole('option', { name: 'Simple model', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Effort', exact: true })).toHaveCount(0);
  await page.getByTestId('activity-bar').locator('[data-panel="ai"]').click();
  await expect(page.getByTestId('model-picker')).toContainText('Simple model');
  await expect(page.getByTestId('model-picker')).toHaveAttribute('data-effort', '');
});

for (const lang of ['he', 'en'] as const) {
  test(`model selection is readable in ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, { lang });
    await fixtures(page);
    const model = page.getByRole('combobox', { name: /^(Model|מודל)$/ });
    await model.click();
    await page.getByRole('option', { name: 'Reasoning model', exact: true }).click();
    const effort = page.getByRole('combobox', { name: /^(Effort|רמת מאמץ)$/ });
    await expect(effort).toBeVisible();
    await page.screenshot({ path: `test-results/harness-setup-${lang}.png` });
  });
}
