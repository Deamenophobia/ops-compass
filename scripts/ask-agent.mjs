import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { explain } from './agent-model.mjs';

const { values } = parseArgs({
  options: {
    connection: { type: 'string', default: 'private/agent-client.local.json' },
    intent: { type: 'string', default: 'incident' },
    observation: { type: 'string' },
    output: { type: 'string', default: 'private/agent-draft.local.json' },
    'context-only': { type: 'boolean', default: false },
  },
});
if (!['incident', 'worklog'].includes(values.intent))
  throw new Error('Use incident or worklog');
const config = JSON.parse(
  (await readFile(values.connection, 'utf8')).replace(/^\uFEFF/, ''),
);
const connection = config.mcpServers['ops-compass'];
const url = new URL(connection.url);
if (
  url.protocol !== 'https:' &&
  !(
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
)
  throw new Error('Use HTTPS or a loopback MCP endpoint');
const client = new Client({ name: 'ops-compass-ai-client', version: '1.0.0' });
try {
  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: { headers: connection.headers },
    }),
  );
  const response = await client.callTool({
    name: 'operations.prepare-context',
    arguments: {
      intent: values.intent,
      ...(values.observation ? { observationId: values.observation } : {}),
    },
  });
  if (response.isError || !response.structuredContent)
    throw new Error('Evidence unavailable; no draft saved.');
  const context = response.structuredContent;
  const result = values['context-only']
    ? context
    : await explain(context, {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
      });
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  // Never overwrite a previously reviewed draft. Choose another output to keep a new run.
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    `Saved ${
      values['context-only'] ? 'context (no model call)' : result.status
    } to the requested local output.`,
  );
} finally {
  await client.close();
}
