// Spike S2: the webview side of the bridge. Tool definitions and executors live here
// (in the product: `packages/agent-tools`); Rust only forwards calls and returns results.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const log = (line) => {
  document.getElementById('log').textContent += line + '\n';
};

/** name -> { description, inputSchema, run(args) -> content[] } */
const tools = {
  echo_text: {
    description: 'Returns the given text together with the title of the document open in the app.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo back' } },
      required: ['text'],
    },
    run: async ({ text }) => [{ type: 'text', text: `echo: ${text} | deck title: ${document.title} | עברית תקינה` }],
  },
  render_canvas: {
    description: 'Returns a PNG image drawn by the app. Use it to check that images reach you.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 960, 540);
      gradient.addColorStop(0, '#0f172a');
      gradient.addColorStop(1, '#7c3aed');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 960, 540);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 96px Segoe UI';
      ctx.fillText('CANVAS-7391', 120, 300);
      const data = canvas.toDataURL('image/png').split(',')[1];
      return [
        { type: 'text', text: 'Rendered 960x540.' },
        { type: 'image', data, mimeType: 'image/png' },
      ];
    },
  },
  render_slide: {
    description: 'Returns a PNG screenshot of the slide currently open in the app.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      // Native capture (spike S3): the webview only says where the slide is; Rust takes the picture.
      const rect = document.getElementById('slide').getBoundingClientRect();
      const scale = 960 / (rect.width * window.devicePixelRatio);
      const data = await invoke('capture_region', {
        clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale },
      });
      return [
        { type: 'text', text: 'Slide screenshot, 960x540.' },
        { type: 'image', data, mimeType: 'image/png' },
      ];
    },
  },
};

await listen('bridge://tool-call', async ({ payload }) => {
  const { callId, sessionKey, name, arguments: args } = payload;
  const started = performance.now();
  let content;
  let isError = false;
  try {
    const tool = tools[name];
    if (!tool) throw new Error(`unknown tool: ${name}`);
    content = await tool.run(args ?? {});
  } catch (error) {
    isError = true;
    content = [{ type: 'text', text: String(error) }];
  }
  const execMs = performance.now() - started;
  log(`${sessionKey} ${name} -> ${isError ? 'error' : 'ok'} in ${execMs.toFixed(1)}ms`);
  await invoke('tool_result', { callId, content, isError, execMs });
});

// MCP-03: definitions are registered from the webview when the app starts.
await invoke('register_tools', {
  tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })),
});
log('tools registered');
