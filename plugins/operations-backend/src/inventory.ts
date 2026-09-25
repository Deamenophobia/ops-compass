import { Config } from '@backstage/config';
import { readFile, stat } from 'node:fs/promises';
import {
  evaluateInventory,
  Inventory,
  inventorySnapshotSchema,
} from '@ops-compass/operations-common';

export async function readInventory(config: Config): Promise<Inventory> {
  const path = config.getOptionalString('opsCompass.inventory.file');
  if (!path)
    return {
      source: 'none',
      evaluatedAt: new Date().toISOString(),
      freshness: 'unconfigured',
      coverage: [],
      instances: [],
    };
  if ((await stat(path)).size > 2 * 1024 * 1024)
    throw new Error('Inventory too large');
  const data = inventorySnapshotSchema.parse(
    JSON.parse(await readFile(path, 'utf8')),
  );
  const demo = config.getString('opsCompass.mode') === 'demo';
  if (demo !== (data.source === 'demo'))
    throw new Error('Inventory mode mismatch');
  // Replay demo time only; real evidence always retains the collector's timestamp.
  if (demo) {
    const now = new Date().toISOString();
    data.collectedAt = now;
    data.instances = data.instances.map(i => ({ ...i, observedAt: now }));
  }
  const age =
    config.getOptionalNumber('opsCompass.inventory.maxAgeSeconds') ?? 300;
  if (!Number.isInteger(age) || age < 1 || age > 86400)
    throw new Error('Invalid inventory expiry');
  return evaluateInventory(data, age);
}
