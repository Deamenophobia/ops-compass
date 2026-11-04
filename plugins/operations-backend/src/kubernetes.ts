import express from 'express';
import { Config } from '@backstage/config';
import { open } from 'node:fs/promises';
import {
  evaluateKubernetes,
  kubernetesSnapshotSchema,
} from '@ops-compass/operations-common';

class SnapshotReadError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export async function readKubernetes(config: Config) {
  const path = config.getOptionalString('opsCompass.kubernetes.file');
  if (!path) return { source: 'none', freshness: 'unconfigured', targets: [] };
  const maximum = 4 * 1024 * 1024;
  const file = await open(path, 'r');
  let bytes: Buffer;
  try {
    if ((await file.stat()).size > maximum)
      throw new SnapshotReadError(
        'SNAPSHOT_LIMIT',
        'Snapshot too large. Reduce the configured targets and collect again (maximum 4 MiB).',
      );
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length <= maximum) {
      const result = await file.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > maximum)
      throw new SnapshotReadError(
        'SNAPSHOT_LIMIT',
        'Snapshot too large. Reduce the configured targets and collect again (maximum 4 MiB).',
      );
    bytes = buffer.subarray(0, length);
  } finally {
    await file.close();
  }
  let snapshot;
  try {
    snapshot = kubernetesSnapshotSchema.parse(
      JSON.parse(bytes.toString('utf8')),
    );
  } catch {
    throw new SnapshotReadError(
      'SNAPSHOT_INVALID',
      'Invalid Kubernetes snapshot. Rerun the matching collector and check its exit status.',
    );
  }
  if (
    (config.getString('opsCompass.mode') === 'demo') !==
    (snapshot.source === 'demo')
  )
    throw new SnapshotReadError(
      'SNAPSHOT_MODE',
      'Snapshot mode mismatch. Use synthetic snapshots only in demo mode and API snapshots outside demo mode.',
    );
  const maxAge =
    config.getOptionalNumber('opsCompass.kubernetes.maxAgeSeconds') ?? 300;
  if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 86400)
    throw new SnapshotReadError(
      'SNAPSHOT_EXPIRY',
      'Invalid expiry. Set kubernetes.maxAgeSeconds to an integer from 1 to 86400.',
    );
  // Replayed time is restricted to explicitly synthetic demo input.
  if (snapshot.source === 'demo')
    snapshot.collectedAt = new Date().toISOString();
  return evaluateKubernetes(snapshot, maxAge);
}

export function createKubernetesRouter(config: Config) {
  const router = express.Router();
  // Mounted behind Backstage authentication, workspace membership, and feature admission.
  router.get('/kubernetes', async (_req, res) => {
    try {
      res.json(await readKubernetes(config));
    } catch (error) {
      let failure =
        error instanceof SnapshotReadError
          ? error
          : new SnapshotReadError(
              'SNAPSHOT_UNAVAILABLE',
              'Kubernetes snapshot unavailable. Check backend file access and collector output.',
            );
      const filesystemCode = (error as NodeJS.ErrnoException).code;
      if (filesystemCode === 'ENOENT')
        failure = new SnapshotReadError(
          'SNAPSHOT_MISSING',
          'No Kubernetes snapshot file was found. Run the collector and check the configured snapshot path.',
        );
      if (filesystemCode === 'EACCES' || filesystemCode === 'EPERM')
        failure = new SnapshotReadError(
          'SNAPSHOT_ACCESS',
          'The backend cannot read the Kubernetes snapshot. Check the snapshot file permissions.',
        );
      res.status(503).json({
        code: failure.code,
        error: failure.message,
      });
    }
  });
  return router;
}
