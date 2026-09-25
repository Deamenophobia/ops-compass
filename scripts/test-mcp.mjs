// End-to-end protocol test against the local empty/demo preview. Never logs tokens.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const config = JSON.parse(
  (
    await readFile(
      new URL('../private/agent-client.local.json', import.meta.url),
      'utf8',
    )
  ).replace(/^\uFEFF/, ''),
);
const connection = config.mcpServers['ops-compass'];
const endpoint = new URL(connection.url);
assert.equal(
  endpoint.origin,
  'http://localhost:7007',
  'This verification targets the local preview only',
);
const headers = connection.headers;
for (const path of [
  '/api/operations/features',
  '/api/operations/connections',
  '/api/operations/connections/00000000-0000-4000-8000-000000000000/test',
  '/api/operations/budget-preference',
  '/api/operations/notifications/test',
  '/api/operations/notifications/00000000-0000-4000-8000-000000000000/cancel',
]) {
  const response = await fetch(new URL(path, endpoint), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(
    response.status,
    403,
    'Agent credentials must never grant workspace writes',
  );
}
const body = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
});
for (const authorization of [undefined, 'Bearer invalid-test-token']) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(authorization && { Authorization: authorization }),
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(
    response.status,
    401,
    'MCP must reject missing or invalid credentials',
  );
}
const denied = await fetch(new URL('/api/catalog/entities', endpoint), {
  headers,
  signal: AbortSignal.timeout(10000),
});
assert.equal(
  denied.status,
  403,
  'Agent credential must not grant catalog API access',
);
const client = new Client({
  name: 'ops-compass-verification',
  version: '1.0.0',
});
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers },
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), [
    'operations.get-overview',
    'operations.get-runbook',
    'operations.prepare-context',
  ]);
  assert.ok(
    tools.every(
      t =>
        t.annotations?.readOnlyHint === true &&
        t.annotations?.destructiveHint === false,
    ),
  );
  const overview = await client.callTool({
    name: 'operations.get-overview',
    arguments: {},
  });
  if (process.argv.includes('--disabled')) {
    assert.equal(overview.isError, true);
    for (const request of [
      { name: 'operations.prepare-context', arguments: { intent: 'worklog' } },
      { name: 'operations.get-runbook', arguments: { id: 'health' } },
    ])
      assert.equal((await client.callTool(request)).isError, true);
    console.log(
      'MCP verification passed: disabled agent module rejects all three actions; owner-only writes remain blocked.',
    );
  } else {
    assert.ok(!overview.isError);
    const expectedMode = process.argv.includes('--demo')
      ? 'demo'
      : 'unconfigured';
    assert.equal(overview.structuredContent.overview.mode, expectedMode);
    if (expectedMode === 'demo') {
      assert.equal(overview.structuredContent.overview.counts.unknown, 1);
    } else {
      assert.equal(overview.structuredContent.overview.source, 'none');
      assert.equal(overview.structuredContent.overview.overall, 'unknown');
      assert.deepEqual(overview.structuredContent.overview.observations, []);
    }
    const context = await client.callTool({
      name: 'operations.prepare-context',
      arguments: { intent: 'worklog' },
    });
    assert.ok(!context.isError);
    assert.equal(context.structuredContent.kind, 'evidence-context');
    assert.equal(
      context.structuredContent.citations.some(c =>
        c.id.startsWith('observation:'),
      ),
      expectedMode === 'demo',
    );
    const runbook = await client.callTool({
      name: 'operations.get-runbook',
      arguments: { id: 'email-alerts' },
    });
    assert.ok(!runbook.isError);
    assert.match(runbook.structuredContent.runbook.status, /unverified/);
    for (const call of [
      { name: 'operations.prepare-context', arguments: { intent: 'execute' } },
      {
        name: 'operations.prepare-context',
        arguments: { intent: 'incident', observationId: 'missing' },
      },
      { name: 'operations.get-runbook', arguments: { id: '../../private' } },
      { name: 'operations.get-overview', arguments: { command: 'reboot' } },
      { name: 'catalog.remove-entity', arguments: {} },
    ]) {
      assert.equal(
        (await client.callTool(call)).isError,
        true,
        `Unexpected success: ${call.name}`,
      );
    }
    console.log(
      'MCP verification passed: real SDK connection, exact read-only tool allowlist, three tool calls, scoped authentication and five rejected requests.',
    );
  }
} finally {
  await client.close();
}
