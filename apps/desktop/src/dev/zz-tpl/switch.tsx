/**
 * TEMPORARY review page (not part of the app): /dev/zz-switch.html
 *
 * Sample slides of templates moved to other templates, as a deck that switches template is
 * (`applyTemplate`), judged by the real lint; and, with `show`, drawn. Reads what
 * `scripts/zz-probe-templates.mjs` wrote.
 * - `ids`: the templates (default: every one of the library). `kinds`: the archetypes of the
 *   sample slides moved (`all` for the whole sample). `pairs=a>b,...`: only these moves.
 * - `fixtures=1`: the model's test decks (and their opening slide named a hero) moved to `ids`.
 * - `show=1` with one pair and one `lang`: the moved slides drawn as thumbnails.
 * Findings are a line each in `window.__switch`.
 */
import { CommandBus, type AssetMeta, type Deck } from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { ScaledSlide } from '@slidr/renderer';
import { applyTemplate, type Template } from '@slidr/templates';
import { sampleDeck, type SampleSlide } from '@slidr/templates/builtin/kit';
import { pictures } from '@slidr/templates/builtin/pictures';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { settle } from '../../capture/settle';
import { registerBuiltinFonts } from '../../fonts';
import { createLintService } from '../../lint/deckLint';

const IDS =
  'zerem,shvil,tzuk,lavan,layla,zohar,migdal,gan,nof,defus,ariach,bolet,hod,sirtut,ziv,shidur,bina,mifgash,kod,luach,magen';

const files = import.meta.glob<string>('../../../../../../Slidr-media/images/templates/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const urls = new Map<string, string>();
for (const picture of Object.values(pictures)) {
  const path = Object.keys(files).find((file) => file.endsWith(`/${picture.name}`));
  if (path) urls.set(picture.id, files[path]!);
}
const resolveAsset = (asset: AssetMeta) => urls.get(asset.id);
const pictureAssets: Record<string, AssetMeta> = Object.fromEntries(
  Object.values(pictures).map((picture) => [picture.id, picture]),
);

interface Probe {
  template: Template;
  samples: { he: SampleSlide[]; en: SampleSlide[] };
}

registerBuiltinFonts();
const params = new URLSearchParams(location.search);
const ids = (params.get('ids') ?? IDS).split(',');
const dir = params.get('dir') ?? 'zz-probe';
const kinds = (params.get('kinds') ?? 'text').split(',');
const pairs = params.get('pairs')?.split(',');
const langs = params.get('lang') ? [params.get('lang') as 'he' | 'en'] : (['he', 'en'] as const);
const show = params.has('show');
const root = document.getElementById('root');
if (!root) throw new Error('#root is missing');

async function main(host: HTMLElement) {
  const probes = new Map<string, Probe>();
  for (const id of ids) {
    const response = await fetch(`/test-results/templates/${dir}/${id}.json?${Date.now()}`);
    if (response.ok) probes.set(id, (await response.json()) as Probe);
  }
  const whole = (probe: Probe): Template => ({
    ...probe.template,
    assets: { ...pictureAssets, ...probe.template.assets },
  });
  const kindOf = (template: Template, layoutId: string | undefined) =>
    template.layouts.find((candidate) => candidate.id === layoutId)?.archetype ?? '?';
  const service = createLintService(resolveAsset);
  const lines: string[] = [];
  const drawn: Deck[] = [];
  const judge = async (label: string, deck: Deck, to: Template) => {
    if (show) drawn.push(deck);
    const findings = await service.lint(
      deck,
      deck.slides.map((slide) => slide.id),
      'all',
    );
    for (const f of findings) {
      const slide = deck.slides.find((candidate) => candidate.id === f.slideId);
      const element = slide?.elements.find((candidate) => f.elementIds.includes(candidate.id));
      const role = element && 'role' in element ? element.role : undefined;
      lines.push(
        `${label} ${f.rule} (${f.severity}) [${kindOf(to, slide?.layoutId)} "${slide?.name ?? ''}" ${role ?? ''}]: ${f.message.slice(0, 160)}`,
      );
    }
  };
  const moved = (deck: Deck, to: Template): Deck => {
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(applyTemplate(deck, to));
    return bus.deck;
  };
  if (params.has('fixtures')) {
    for (const [toId, to] of probes) {
      for (const [name, make] of Object.entries(fixtureDecks)) {
        if (name === 'allElementsDeck' || name === 'referenceDeck') continue;
        await judge(`${name} -> ${toId}`, moved(make(), whole(to)), whole(to));
      }
      for (const make of [fixtureDecks.hebrewDeck, fixtureDecks.englishDeck]) {
        const before = make();
        before.slides[0]!.archetype = 'hero';
        const after = moved(before, whole(to));
        const opening = { ...after, slides: [after.slides[0]!] };
        await judge(`opening(${before.meta.lang}) -> ${toId}`, opening, whole(to));
      }
    }
  } else {
    for (const lang of langs) {
      for (const [toId, to] of probes) {
        for (const [fromId, from] of probes) {
          if (fromId === toId) continue;
          if (pairs && !pairs.includes(`${fromId}>${toId}`)) continue;
          const samples = from.samples[lang].filter(
            (slide) => kinds.includes('all') || kinds.includes(kindOf(from.template, slide.layout)),
          );
          if (samples.length === 0) continue;
          const deck = sampleDeck(whole(from), samples, {
            lang,
            dir: lang === 'he' ? 'rtl' : 'ltr',
          });
          await judge(`${fromId} -> ${toId} ${lang}`, moved(deck, whole(to)), whole(to));
        }
      }
    }
  }
  (window as unknown as { __switch: string[] }).__switch = lines;
  createRoot(host).render(
    <StrictMode>
      <div
        id="sheet"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 470px)',
          gap: 12,
          padding: 12,
          width: 'max-content',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {drawn.flatMap((deck, d) =>
          deck.slides.map((slide, i) => (
            <figure key={`${d}-${slide.id}`} style={{ margin: 0 }}>
              <ScaledSlide
                deck={deck}
                slide={slide}
                width={470}
                mode="thumbnail"
                resolveAsset={resolveAsset}
              />
              <figcaption style={{ fontSize: 12, lineHeight: '16px', color: '#333' }}>
                {i + 1} {slide.name}
              </figcaption>
            </figure>
          )),
        )}
        {drawn.length === 0 && <pre>{lines.join('\n') || 'no findings'}</pre>}
      </div>
    </StrictMode>,
  );
  await settle();
  document.documentElement.dataset.ready = 'true';
}

void main(root);
