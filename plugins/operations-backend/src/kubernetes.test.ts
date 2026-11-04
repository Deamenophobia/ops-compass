import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigReader } from '@backstage/config';
import { createKubernetesRouter, readKubernetes } from './kubernetes';
import { readFileSync } from 'node:fs';
import express from 'express';
import request from 'supertest';

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../../examples/kubernetes-snapshot.example.json'),
    'utf8',
  ),
);

it('isolates workspace snapshot paths, reports stale live data and refuses mismatched/invalid files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ops-k8s-'));
  const file = join(dir, 'snapshot.json');
  const config = (mode: string) =>
    new ConfigReader({ opsCompass: { mode, kubernetes: { file } } });
  try {
    expect(
      await readKubernetes(
        new ConfigReader({ opsCompass: { mode: 'unconfigured' } }),
      ),
    ).toMatchObject({ source: 'none', targets: [] });
    await writeFile(file, JSON.stringify(fixture));
    expect(await readKubernetes(config('demo'))).toMatchObject({
      source: 'demo',
      freshness: 'fresh',
    });
    await expect(readKubernetes(config('unconfigured'))).rejects.toThrow(
      'mode mismatch',
    );
    await writeFile(
      file,
      JSON.stringify({
        ...fixture,
        source: 'kubernetes-api',
        collectedAt: '2000-01-01T00:00:00Z',
      }),
    );
    expect(await readKubernetes(config('unconfigured'))).toMatchObject({
      freshness: 'stale',
      targets: [{ pods: [{ status: 'unknown' }, { status: 'unknown' }] }],
    });
    await expect(readKubernetes(config('demo'))).rejects.toThrow(
      'mode mismatch',
    );
    await writeFile(file, '{bad');
    await expect(readKubernetes(config('unconfigured'))).rejects.toThrow();
    await writeFile(file, Buffer.alloc(4 * 1024 * 1024 + 1));
    await expect(readKubernetes(config('unconfigured'))).rejects.toThrow(
      'too large',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('returns actionable diagnostics without exposing file paths or invalid content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ops-k8s-error-'));
  const file = join(dir, 'private-canary.json');
  const app = express().use(
    createKubernetesRouter(
      new ConfigReader({
        opsCompass: { mode: 'unconfigured', kubernetes: { file } },
      }),
    ),
  );
  try {
    const missing = await request(app).get('/kubernetes');
    expect(missing.status).toBe(503);
    expect(missing.body.code).toBe('SNAPSHOT_MISSING');
    expect(JSON.stringify(missing.body)).not.toContain('private-canary');
    await writeFile(file, '{private-canary');
    const invalid = await request(app).get('/kubernetes');
    expect(invalid.body.code).toBe('SNAPSHOT_INVALID');
    expect(JSON.stringify(invalid.body)).not.toContain('private-canary');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
