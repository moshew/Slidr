// Spike S5: the import tools as the agent sees them (in the product: part of the Deck API in
// `packages/agent-tools`). Plain functions over ImportEnv; the transport is in mcp.mjs.

const text = (t) => ({ type: 'text', text: t });
const image = (buffer, mimeType = 'image/png') => ({ type: 'image', data: Buffer.isBuffer(buffer) ? buffer.toString('base64') : buffer, mimeType });

const target = {
  selector: { type: 'string', description: 'CSS selector of the element. Open shadow roots are searched too.' },
  js: { type: 'string', description: 'Alternative to selector: a JavaScript expression that evaluates to the Element, e.g. document.querySelectorAll("section")[3].' },
};

function slideLine(slide, index) {
  const m = slide.metrics;
  const counts = Object.entries(m.counts).filter(([, n]) => n).map(([t, n]) => `${n} ${t}`).join(', ');
  const src = slide.source;
  let line = `#${index + 1} ${slide.id}${slide.name ? ` "${slide.name}"` : ''}: ${m.faithful ? 'faithful' : 'NOT FAITHFUL'} | editable ${m.editability}% (text ${m.textEditability}%) | ${counts} | source ${Math.round(src.width)}x${Math.round(src.height)}`;
  const notes = [];
  const aspect = src.width / src.height;
  if (Math.abs(aspect - 16 / 9) > 0.12) notes.push(`aspect ratio ${aspect.toFixed(2)}:1 is not 16:9 - check that this element is the whole slide`);
  if (!m.exactComparison) notes.push(`the source shows this content scaled (stage at ${m.shownAtPercent}%), so it was compared approximately; bring the deck to 100% (its own scale setting, or import_set_viewport to the design size) for an exact check`);
  if (m.wholeSlideHtml) notes.push('kept as one HTML object (could not be matched element by element)');
  if (!m.faithful) notes.push(`differs from the source in ${m.diffPct}% of pixels after ${m.rounds} rounds - look at it with slide_render`);
  if (slide.fontsMissing?.length) notes.push(`fonts not embedded in the file: ${slide.fontsMissing.join(', ')}`);
  const html = slide.elements.filter((e) => e.type === 'html');
  if (html.length && !m.wholeSlideHtml) notes.push(`HTML objects: ${html.slice(0, 6).map((e) => `${e.name} (${e.reason.slice(0, 60)})`).join('; ')}${html.length > 6 ? ` and ${html.length - 6} more` : ''}`);
  if (notes.length) line += `\n     ${notes.join('\n     ')}`;
  return line;
}

export function createTools(env) {
  return {
    import_inspect: {
      description:
        'Describe the live page. Without arguments: page facts (title, viewport, stylesheets, fonts, CSS variables, blocked network requests, console errors) and an outline of the DOM from <body>. With selector/js: the outline of that subtree only. Outline lines look like: tag#id.classes [width x height @x,y] children:n (flags) "own text".',
      inputSchema: {
        type: 'object',
        properties: { ...target, depth: { type: 'number', description: 'How many levels to show (default 4).' }, maxNodes: { type: 'number', description: 'Upper bound on outline lines (default 160).' } },
      },
      run: async (args) => [text(await env.inspect(args))],
    },
    import_eval: {
      description:
        'Run JavaScript inside the isolated page and get the result. `code` is the body of an async function: use `return` to return a JSON-serialisable value (elements are returned as short descriptions). Use it to query the DOM, read styles, and to drive the page (navigate the deck, reveal steps, hide chrome).',
      inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
      run: async ({ code }) => [text(await env.evaluate(code))],
    },
    import_screenshot: {
      description: 'Screenshot of the page viewport, or of one element when selector/js is given. Costs context: use it when you need to see, not to confirm.',
      inputSchema: { type: 'object', properties: { ...target, maxWidth: { type: 'number', description: 'Width of the returned image in px (default 1024).' } } },
      run: async (args) => {
        const shot = await env.screenshot(args);
        return [text(`${shot.width}x${shot.height}`), image(shot.data, shot.mimeType)];
      },
    },
    import_set_viewport: {
      description: 'Resize the isolated page. Decks that fit themselves to the window are shown at 100% when the window has their design size; captures are compared exactly only at 100%.',
      inputSchema: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } }, required: ['width', 'height'] },
      run: async (args) => [text(await env.setViewport(args))],
    },
    import_capture: {
      description:
        'Capture elements as slides, in the order given. For each: run `before` (optional JavaScript, same rules as import_eval), wait, then copy the element and convert it. Returns one line per slide: faithful or not, share of content that became editable objects, object counts, and warnings. Slides are appended to the deck.',
      inputSchema: {
        type: 'object',
        properties: {
          slides: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ...target,
                before: { type: 'string', description: 'JavaScript to run first: bring this slide into view in its final state.' },
                name: { type: 'string', description: 'Short slide name.' },
                notes: { type: 'string', description: 'Speaker notes for this slide, if the file has them.' },
                waitMs: { type: 'number', description: 'Wait after `before`, for transitions (default 250).' },
              },
            },
          },
        },
        required: ['slides'],
      },
      run: async ({ slides }) => {
        const lines = [];
        for (const request of slides) {
          try {
            const slide = await env.capture(request);
            lines.push(slideLine(slide, env.deck.slides.length - 1));
          } catch (error) {
            lines.push(`FAILED (${request.selector || request.js}): ${String(error.message || error).slice(0, 300)}`);
          }
        }
        env.save();
        return [text(lines.join('\n'))];
      },
    },
    slide_render: {
      description: 'Picture of a converted slide as Slidr shows it. With compare=true the source picture comes first, then the converted one.',
      inputSchema: { type: 'object', properties: { slideId: { type: 'string' }, compare: { type: 'boolean' } }, required: ['slideId'] },
      run: async ({ slideId, compare }) => {
        const { source, converted } = await env.slideImages(slideId);
        return compare ? [text('source:'), image(source), text('converted:'), image(converted)] : [image(converted)];
      },
    },
    deck_get_outline: {
      description: 'The deck so far: title, language, and one line per slide.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => [text(`title: ${env.deck.title}\nlang: ${env.deck.lang} dir: ${env.deck.dir}\n${env.deck.slides.map(slideLine).join('\n') || '(no slides yet)'}`)],
    },
    slide_update: {
      description: 'Set the name and/or speaker notes of slides.',
      inputSchema: {
        type: 'object',
        properties: {
          updates: { type: 'array', items: { type: 'object', properties: { slideId: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } }, required: ['slideId'] } },
        },
        required: ['updates'],
      },
      run: async ({ updates }) => {
        for (const u of updates) {
          const slide = env.deck.slides.find((s) => s.id === u.slideId);
          if (!slide) return [text(`no slide ${u.slideId}`)];
          if (u.name !== undefined) slide.name = u.name;
          if (u.notes !== undefined) slide.notes = u.notes;
        }
        env.save();
        return [text(`updated ${updates.length} slides`)];
      },
    },
    slide_delete: {
      description: 'Remove slides from the deck (to capture them again differently).',
      inputSchema: { type: 'object', properties: { slideIds: { type: 'array', items: { type: 'string' } } }, required: ['slideIds'] },
      run: async ({ slideIds }) => {
        env.deck.slides = env.deck.slides.filter((s) => !slideIds.includes(s.id));
        env.save();
        return [text(`deck now has ${env.deck.slides.length} slides`)];
      },
    },
    slides_reorder: {
      description: 'Set the slide order: all slide ids, in the new order.',
      inputSchema: { type: 'object', properties: { order: { type: 'array', items: { type: 'string' } } }, required: ['order'] },
      run: async ({ order }) => {
        const byId = new Map(env.deck.slides.map((s) => [s.id, s]));
        if (order.length !== byId.size || order.some((id) => !byId.has(id))) return [text('order must list every slide id exactly once')];
        env.deck.slides = order.map((id) => byId.get(id));
        env.save();
        return [text('reordered')];
      },
    },
    deck_update: {
      description: 'Set deck-level facts: title, language (e.g. "he", "en"), direction ("rtl" or "ltr"), and the theme you identified (colours and fonts as found in the file).',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          lang: { type: 'string' },
          dir: { type: 'string', enum: ['rtl', 'ltr'] },
          theme: { type: 'object', description: 'e.g. { colors: { bg, text, primary, accent }, fonts: { heading, body } }' },
        },
      },
      run: async (args) => {
        Object.assign(env.deck, args);
        env.save();
        return [text('deck updated')];
      },
    },
  };
}
