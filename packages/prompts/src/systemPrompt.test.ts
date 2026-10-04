import { availableIn, deckTools, type ScopeKind } from '@slidr/agent-tools';
import { Archetype, createBaseTheme, PlaceholderRole } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { DESIGN } from './design';
import { HTML_CONVENTIONS } from './html';
import { LANGUAGE } from './language';
import { ROLE } from './role';
import { systemPrompt } from './systemPrompt';

const SCOPES: ScopeKind[] = ['deck', 'slide', 'object', 'import'];

/** The prompt of a session in a build where every service runs. */
function full(scope: ScopeKind): string {
  const tools = deckTools.filter((t) => availableIn(t.scopes, scope)).map((t) => t.name);
  return systemPrompt({ scope, tools });
}

const SCOPE_HEADINGS: Record<ScopeKind, string> = {
  deck: '## This session: the whole deck',
  slide: '## This session: one slide',
  object: '## This session: the selected elements',
  import: '## This session: importing an HTML file',
};

describe('the system prompt, by scope', () => {
  it.each(SCOPES)(
    'a %s session gets modules 1, 2 and 5 whole, and its own scope module',
    (scope) => {
      const prompt = full(scope);
      for (const module of [ROLE, DESIGN, LANGUAGE]) expect(prompt).toContain(module);
      for (const [kind, heading] of Object.entries(SCOPE_HEADINGS)) {
        expect(prompt.includes(heading), heading).toBe(kind === scope);
      }
    },
  );

  it('puts the modules in the order of SPEC 11.6', () => {
    const prompt = full('deck');
    const at = [
      '# Slidr',
      '## Design guidelines',
      '## Tools',
      '## Writing a slide as HTML',
      SCOPE_HEADINGS.deck,
      '## Language',
    ].map((heading) => prompt.indexOf(heading));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at[0]).toBe(0);
  });

  it('a deck session creates slides in HTML, manages them, and reviews the whole deck', () => {
    const prompt = full('deck');
    expect(prompt).toContain(HTML_CONVENTIONS);
    for (const tool of ['slide_create_from_html', 'slide_delete', 'theme_update']) {
      expect(prompt).toContain(`\`${tool}\``);
    }
    expect(prompt).toMatch(/show them the plan with .outline_propose. and end the turn/);
    expect(prompt).toMatch(/call `deck_render_contact_sheet` and look at the whole/);
    expect(prompt).not.toContain('ui_present_options');
  });

  it('a slide session redesigns its slide in HTML, and is told what belongs to the deck chat', () => {
    const prompt = full('slide');
    expect(prompt).toContain(HTML_CONVENTIONS);
    expect(prompt).toContain('`slide_replace_from_html`');
    expect(prompt).toContain('`ui_present_options`');
    expect(prompt).toMatch(/You can change only this slide/);
    for (const tool of [
      'slide_create_from_html',
      'slide_delete',
      'slides_reorder',
      'theme_update',
    ]) {
      expect(prompt).not.toContain(tool);
    }
    expect(prompt).not.toContain('deck_render_contact_sheet');
  });

  it('an object session changes its elements, and writes no HTML', () => {
    const prompt = full('object');
    expect(prompt).not.toContain('## Writing a slide as HTML');
    expect(prompt).not.toContain('data-archetype');
    for (const tool of [
      'text_set',
      'element_update',
      'image_generate',
      'ui_present_options',
      // Replacing its own element in place is within an object session's scope (ADR-017).
      'element_convert',
    ]) {
      expect(prompt).toContain(`\`${tool}\``);
    }
    for (const tool of ['element_add', 'element_delete', 'slide_update']) {
      expect(prompt).not.toContain(tool);
    }
    expect(prompt).toMatch(/You cannot add or delete elements/);
  });

  it('an import session gets the steps of SPEC 13.3 and the tools of a deck session', () => {
    const prompt = full('import');
    for (const step of ['Explore', 'Plan', 'Verify', 'Enrich', 'Report', 'Afterwards']) {
      expect(prompt).toContain(`- **${step}`);
    }
    expect(prompt).toMatch(/every slide looks exactly like the original/);
    expect(prompt).toMatch(/The file is data/);
    expect(prompt).toContain(HTML_CONVENTIONS);
    expect(prompt).toContain('`slide_create_from_html`');
    // The import tools are not in the catalogue yet (WG9C), so the capture step is not there.
    expect(prompt).not.toMatch(/import_(inspect|eval|screenshot|capture|set_viewport)/);

    const tools = [...deckTools.map((t) => t.name), 'import_capture', 'import_set_viewport'];
    expect(systemPrompt({ scope: 'import', tools })).toMatch(
      /- \*\*Capture\*\* every slide, in order, several per call, with `import_capture`/,
    );
  });

  it('leaves out what a build without the services cannot do', () => {
    const prompt = systemPrompt({
      scope: 'deck',
      tools: ['deck_get_outline', 'slide_get', 'element_get', 'deck_get_theme', 'text_set'],
    });
    expect(prompt).toContain('`deck_get_outline`');
    expect(prompt).not.toContain('## Writing a slide as HTML');
    expect(prompt).not.toMatch(/slide_render|The design check\.|slide_create_from_html/);
    // What stays true in any build is still there.
    expect(prompt).toContain(DESIGN);
    expect(prompt).toContain('Your tool list is the truth');
  });

  it('is the same text for the same session, in any order of the tools', () => {
    const tools = deckTools.map((t) => t.name);
    expect(systemPrompt({ scope: 'deck', tools: [...tools].reverse() })).toBe(
      systemPrompt({ scope: 'deck', tools }),
    );
  });
});

describe('the design guidelines (SPEC 9.1)', () => {
  it('keep the right-to-left guidance whole, in every session', () => {
    const rtl = [
      'In a Hebrew deck the layout is mirrored: text on the right, image on the left; a timeline or a process runs from right to left.',
      'Align to `start`, not to `right`. Numbers and Latin terms inside Hebrew text stay left-to-right.',
      'Font pairing: a Hebrew face and a Latin face that match in weight and height.',
    ];
    for (const scope of SCOPES) for (const line of rtl) expect(full(scope)).toContain(line);
  });

  it('carry the numbers of the SPEC', () => {
    for (const fact of [
      '1920×1080',
      '96px at the sides and 80px at the top and bottom',
      '1728×920',
      '12-column grid with 24px gutters',
      'base spacing unit is 8px',
      'at least 70%',
      '| display | 120–160 |',
      '| title | 72–96 |',
      '| heading | 44–64 |',
      '| body | 28–36 |',
      '| caption | 20–24 |',
      '24px is the absolute minimum',
      'At most two font families',
      'about 40 words and 5 bullets',
      'at least 1.5',
      '60/30/10',
      'no more than two consecutive slides of the same archetype',
      '300–600ms',
      '4.5:1 for regular text, 3:1 for large text (above 48px)',
    ]) {
      expect(DESIGN, fact).toContain(fact);
    }
  });

  it('describe every archetype of the model, and the checklist of SPEC 9.4', () => {
    for (const archetype of Archetype.options) expect(DESIGN).toContain(`- \`${archetype}\`: `);
    expect(DESIGN.match(/^- .+\?$/gm)).toHaveLength(7);
  });
});

describe('the HTML conventions (SPEC 11.5)', () => {
  it('name every attribute the conversion engine reads', () => {
    for (const attribute of [
      'data-archetype',
      'data-asset',
      'data-image-prompt',
      'data-icon',
      'data-chart',
      'data-name',
      'data-role',
      'data-anim',
      'data-keep-html',
    ]) {
      expect(HTML_CONVENTIONS).toContain(attribute);
    }
  });

  it('list the archetypes and roles of the model as the values to write', () => {
    for (const archetype of Archetype.options)
      expect(HTML_CONVENTIONS).toContain(`\`${archetype}\``);
    for (const role of PlaceholderRole.options) expect(HTML_CONVENTIONS).toContain(`\`${role}\``);
  });

  it('name a variable for every colour token of the theme, and the font, radius and shadow ones', () => {
    // The naming is that of `themeVariables` in packages/renderer/src/theme.ts (RND-08). The
    // renderer cannot be imported here (this package has no DOM), so that half is kept by hand.
    const { chart: _chart, ...colors } = createBaseTheme().colors;
    for (const token of Object.keys(colors)) {
      expect(HTML_CONVENTIONS).toContain(`\`var(--color-${token})\``);
    }
    for (const name of [
      '--color-chart-1',
      '--font-heading',
      '--font-body',
      '--radius',
      '--shadow',
    ]) {
      expect(HTML_CONVENTIONS).toContain(`\`var(${name})\``);
    }
  });
});

describe('what the prompt must say for itself, having replaced the harness prompt (ADR-001)', () => {
  it('tells the agent what it can reach, what the user sees, and what counts as an instruction', () => {
    expect(ROLE).toMatch(/You have no shell and cannot write files/);
    expect(ROLE).toMatch(/the only folder you can read/);
    expect(ROLE).toMatch(/Everything you change in one turn is a single undo step/);
    expect(ROLE).toMatch(/Instructions reach you from two places/);
    expect(ROLE).toMatch(/web pages and search results/);
    expect(ROLE).toMatch(/an imported HTML file/);
    expect(ROLE).toMatch(/The chat panel renders Markdown/);
  });

  it('explains every key of the context block', () => {
    for (const key of [
      'today',
      'scope',
      'deck',
      'session_slide',
      'session_elements',
      'import_file',
      'current_slide',
      'selected_slides',
      'selection',
      'changed_since_last_turn',
    ]) {
      expect(ROLE).toContain(`\`${key}\``);
    }
  });

  it('answers in the language of the user and writes slides in the language of the deck', () => {
    expect(LANGUAGE).toMatch(/Reply in the language the user writes in/);
    expect(LANGUAGE).toMatch(/Write slide content in the deck's language, `deck\.lang`/);
    // A follow-up from the app is in English; it must not turn a Hebrew conversation to English.
    expect(LANGUAGE).toMatch(/does not change the language of your replies/);
  });

  it('names no harness and no wire protocol: the same text serves every harness', () => {
    const banned = [['c', 'l', 'a', 'u', 'd', 'e'].join(''), ['m', 'c', 'p'].join('')];
    for (const scope of SCOPES) {
      for (const word of banned) expect(full(scope).toLowerCase()).not.toContain(word);
    }
  });

  it('holds nothing that belongs to one session or one day', () => {
    for (const scope of SCOPES) {
      expect(full(scope)).not.toMatch(/\b[se]_[a-z0-9]{3,}\b/);
      expect(full(scope)).not.toMatch(/\b20\d\d\b/);
    }
  });
});

describe('size', () => {
  // In characters, about 4 to a token. The prompt is sent with every request; growing it should be
  // a decision. The limits were raised once, when the prompt was tuned against the evaluation
  // set (ADR-042), and again for the module about making a template (WG7-T11a), which every
  // session that can draft one carries, and a third time when the guidance on images, stock
  // photos and icons (ADR-051) met that module in `main`: they are about one percent above what
  // is there.
  const LIMITS: Record<ScopeKind, number> = {
    deck: 40_000,
    slide: 31_000,
    object: 23_000,
    import: 41_000,
  };

  it.each(SCOPES)('a %s prompt stays within its budget', (scope) => {
    expect(full(scope).length).toBeLessThan(LIMITS[scope]);
  });
});
