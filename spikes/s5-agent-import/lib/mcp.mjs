// Spike S5: minimal MCP-over-HTTP transport for the import tools (plain JSON responses, the
// `initialize` handshake). The transport is not what this spike tests: spike S2 covers the real
// adapter (Rust + rmcp, per-session key and token). This one exists so that a Node prototype can
// be driven by the real Claude Code CLI.
import { createServer } from 'node:http';

export function startMcpServer(tools, onCall) {
  const server = createServer((req, res) => {
    if (req.method !== 'POST') return res.writeHead(405).end();
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        return res.writeHead(400).end();
      }
      const reply = (result) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      };
      if (message.id === undefined) return res.writeHead(202).end();
      switch (message.method) {
        case 'initialize':
          return reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'slidr', version: '0.0.0-spike' } });
        case 'tools/list':
          return reply({ tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) });
        case 'tools/call': {
          const { name, arguments: args } = message.params;
          const started = Date.now();
          let content;
          let isError = false;
          try {
            if (!tools[name]) throw new Error(`unknown tool ${name}`);
            content = await tools[name].run(args || {});
          } catch (error) {
            isError = true;
            content = [{ type: 'text', text: `Error: ${String(error.message || error).slice(0, 1500)}` }];
          }
          onCall?.({ name, args, ms: Date.now() - started, isError, content });
          return reply({ content, isError });
        }
        default:
          return reply({});
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() })));
}
