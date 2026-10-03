/**
 * `data-icon` in a slide written as HTML (SPEC 11.5, WG5-T11): the conversion engine asks its
 * host for the icon, and the app's host answers from the built-in library. What is checked here
 * is the whole path an agent's HTML takes, with the real engine and the real icon sets: the
 * attribute becomes an `svg` element that draws the icon, in the colour the HTML gave it.
 */
import { createDeckApi, startTurn } from '@slidr/agent-tools';
import { createConversionService } from '@slidr/html-import';
import { testHost } from '@slidr/html-import/testing';
import { CommandBus, createDeck, findSlide, walkElements, type SvgElement } from '@slidr/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { iconService } from '../services';
import { iconMarkup } from './library';

const HTML = `<div data-archetype="cards" dir="rtl" lang="he" style="position:relative;width:1920px;height:1080px;background:var(--color-bg);font-family:var(--font-body)">
  <h1 data-role="title" style="position:absolute;right:160px;top:120px;width:1600px;margin:0;font-size:72px;color:var(--color-text)">שלושה יעדים</h1>
  <i data-icon="lucide:rocket" style="position:absolute;right:160px;top:360px;font-size:120px;color:var(--color-primary)"></i>
  <i data-icon="tabler:target" style="position:absolute;right:760px;top:360px;font-size:120px;color:#E4572E"></i>
  <i data-icon="lucide:no-such-icon" style="position:absolute;right:1360px;top:360px;font-size:120px;color:var(--color-accent)"></i>
</div>`;

function session() {
  const bus = new CommandBus(createDeck({ lang: 'he', dir: 'rtl' }), { validate: true });
  const api = createDeckApi(bus, {
    conversion: createConversionService({ ...testHost(), icon: iconMarkup }),
    icons: iconService,
  });
  const turn = startTurn('sess', { kind: 'deck' });
  return { bus, call: (name: string, input: unknown) => api.call(turn, name, input) };
}

beforeAll(async () => {
  await page.viewport(1920, 1080);
});

describe('data-icon in HTML the agent writes', () => {
  it('becomes a real icon of the library, in the colour the HTML gave it', async () => {
    const { bus, call } = session();
    const result = await call('slide_create_from_html', { html: HTML });
    if (!result.ok) throw new Error(result.error.message);
    const data = result.data as { slideId: string; notes: string[] };
    const slide = findSlide(bus.deck, data.slideId)!;
    const icons = [...walkElements(slide.elements)].filter(
      (element): element is SvgElement => element.type === 'svg',
    );
    expect(icons.map((icon) => icon.name)).toEqual(['lucide:rocket', 'tabler:target']);

    const [rocket, target] = icons;
    // The library's own paths, and the size the HTML asked for.
    expect(rocket?.markup).toContain('M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5');
    expect(rocket?.frame.w).toBeCloseTo(120, 0);
    expect(rocket?.frame.h).toBeCloseTo(120, 0);
    // A theme variable stays a token, so the icon follows the theme; a literal stays a literal.
    expect(rocket?.colorOverrides).toEqual({ currentColor: { token: 'primary' } });
    expect(target?.colorOverrides?.currentColor).toHaveProperty('value');

    // An id the library does not have draws nothing, and the result says so.
    expect(data.notes.join('\n')).toContain('data-icon="lucide:no-such-icon" is not an icon');
  });

  it('is found by the icon search the same session has, in Hebrew', async () => {
    const { call } = session();
    const result = await call('icon_search', { query: 'רקטה', count: 2 });
    if (!result.ok) throw new Error(result.error.message);
    const icons = (result.data as { icons: { id: string; svg: string }[] }).icons;
    expect(icons.map((icon) => icon.id)).toEqual(['lucide:rocket', 'tabler:rocket']);
    expect(icons[0]?.svg).toBe(await iconMarkup('lucide:rocket'));
  });
});
