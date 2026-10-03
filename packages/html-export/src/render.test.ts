// @vitest-environment happy-dom
import { createElement, createSlide, richText, type Slide } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { markHeadings, persistMediaState } from './render';

// What an export does to the slides after the renderer drew them. Drawing itself, and the size of
// pictures, need layout: those are tested in a browser (apps/desktop/e2e/runtime-export.spec.ts).

function host(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('markHeadings', () => {
  const slide: Slide = createSlide({
    id: 's1',
    elements: [
      createElement.text({
        id: 'title',
        frame: { x: 0, y: 0, w: 100, h: 100 },
        content: richText('Title', { styleRef: 'title' }),
      }),
      createElement.text({
        id: 'body',
        frame: { x: 0, y: 0, w: 100, h: 100 },
        content: {
          paragraphs: [
            { dir: 'ltr', align: 'start', styleRef: 'heading', runs: [{ text: 'Section' }] },
            { dir: 'ltr', align: 'start', runs: [{ text: 'Plain' }] },
            {
              dir: 'ltr',
              align: 'start',
              styleRef: 'heading',
              list: { kind: 'bullet', level: 0 },
              runs: [{ text: 'Item' }],
            },
          ],
        },
      }),
    ],
  });

  const drawn = () =>
    host(`<section>
      <div data-element-id="title"><div data-slidr-text>
        <p dir="rtl" style="font-size: 72px">Tit<span style="color: red">le</span></p>
      </div></div>
      <div data-element-id="body"><div data-slidr-text>
        <p>Section</p><p>Plain</p><ul><li>Item</li></ul>
      </div></div>
    </section>`);

  it('turns title and heading paragraphs into h1 and h2, and keeps everything on them', () => {
    const el = drawn();
    markHeadings(el, [slide]);
    const h1 = el.querySelector('h1');
    expect(h1?.outerHTML).toBe(
      '<h1 dir="rtl" style="font-size: 72px">Tit<span style="color: red">le</span></h1>',
    );
    expect(el.querySelector('h2')?.textContent).toBe('Section');
  });

  it('leaves body text and list items as they are', () => {
    const el = drawn();
    markHeadings(el, [slide]);
    expect(el.querySelectorAll('p')).toHaveLength(1);
    expect(el.querySelector('li')?.textContent).toBe('Item');
    expect(el.querySelectorAll('h1, h2')).toHaveLength(2);
  });
});

describe('persistMediaState', () => {
  it('writes muted and the volume as attributes, which markup can carry', () => {
    const el = host('<video></video><audio></audio>');
    const video = el.querySelector('video') as HTMLVideoElement;
    video.muted = true;
    video.volume = 0.4;
    persistMediaState(el);
    expect(video.hasAttribute('muted')).toBe(true);
    expect(video.getAttribute('data-volume')).toBe('0.4');
    expect(el.querySelector('audio')?.attributes).toHaveLength(0);
  });
});
