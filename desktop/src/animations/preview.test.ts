// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { stageSlide } from './preview';

/*
 * The preview plays on the slide the Stage draws, which it finds through the shell
 * (`stageDom.ts`), the one place that knows the Stage's DOM (ADR-060).
 */
describe('the slide a preview plays on', () => {
  afterEach(() => document.body.replaceChildren());

  const draw = (container: string, slideId: string) => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div data-testid="${container}"><div data-testid="stage-frame"><div class="slidr-slide" data-slide-id="${slideId}"></div></div></div>`,
    );
  };

  it('is the slide on the Stage, when it is the one asked for', () => {
    draw('stage-surface', 's_one');
    expect(stageSlide('s_one')?.dataset.slideId).toBe('s_one');
    expect(stageSlide('s_two')).toBeNull();
  });

  it('is not a slide drawn elsewhere', () => {
    draw('somewhere-else', 's_one');
    expect(stageSlide('s_one')).toBeNull();
  });

  it('is found by the shell, not by a selector of its own', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'preview.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/querySelector|data-testid/);
  });
});
