// Spike S2 control experiment: a hand-written, stateless MCP-over-HTTP server (plain JSON
// responses, legacy `initialize` handshake). Used to tell CLI behaviour apart from rmcp behaviour,
// and to test what the CLI does when the tool list is slow.  Usage: node mini-mcp.mjs [port] [listDelayMs]
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 47831);
const listDelayMs = Number(process.argv[3] ?? 0);
const tools = [
  {
    name: 'echo_text',
    description: 'Echo text back',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
];

createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', async () => {
    if (req.method !== 'POST') return res.writeHead(405).end();
    const m = JSON.parse(body);
    process.stderr.write(`[mini-mcp] ${m.method}\n`);
    const reply = (result) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
    };
    if (m.method === 'initialize')
      reply({ protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'mini', version: '0' } });
    else if (m.method === 'tools/list') {
      await new Promise((r) => setTimeout(r, listDelayMs));
      reply({ tools });
    } else if (m.method === 'tools/call') reply({ content: [{ type: 'text', text: `echo: ${m.params.arguments.text} / MINI-9917` }] });
    else if (m.id === undefined) res.writeHead(202).end();
    else reply({});
  });
}).listen(port, '127.0.0.1');
