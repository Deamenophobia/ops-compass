import { ConfigReader } from '@backstage/config';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInventory } from './inventory';

it('starts empty and rejects a demo inventory in real mode', async () => {
  expect(
    (
      await readInventory(
        new ConfigReader({ opsCompass: { mode: 'unconfigured' } }),
      )
    ).source,
  ).toBe('none');
  const dir = await mkdtemp(join(tmpdir(), 'ops-inventory-'));
  try {
    const file = join(dir, 'inventory.json');
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        source: 'demo',
        collectedAt: '2026-01-01T00:00:00Z',
        coverage: [],
        instances: [],
      }),
    );
    await expect(
      readInventory(
        new ConfigReader({
          opsCompass: { mode: 'snapshot', inventory: { file } },
        }),
      ),
    ).rejects.toThrow('mode mismatch');
    expect(
      (
        await readInventory(
          new ConfigReader({
            opsCompass: { mode: 'demo', inventory: { file } },
          }),
        )
      ).freshness,
    ).toBe('current');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('does not reuse earlier inventory after a collection file is lost', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ops-inventory-'));
  const file = join(dir, 'inventory.json');
  try {
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        source: 'aws-api',
        collectedAt: '2026-01-01T00:00:00Z',
        coverage: [],
        instances: [],
      }),
    );
    const config = new ConfigReader({
      opsCompass: { mode: 'snapshot', inventory: { file } },
    });
    expect((await readInventory(config)).freshness).toBe('stale');
    await rm(file);
    await expect(readInventory(config)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
