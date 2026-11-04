import { Entity } from '@backstage/catalog-model';
import {
  evaluateSnapshot,
  featureFlagsSchema,
  featurePreset,
} from '@ops-compass/operations-common';
import { canonicalRef, entityEvidence, relatedRefs } from './model';

const now = new Date('2026-11-04T00:00:00Z');
const api = 'component:default/api';
const db = 'resource:default/database';
const snapshot = evaluateSnapshot(
  {
    schemaVersion: 1,
    source: 'demo',
    observations: [
      {
        id: 'api',
        entityRef: api,
        label: 'API',
        environment: 'demo',
        region: 'local',
        state: 'healthy',
        observedAt: now.toISOString(),
        summary: 'Synthetic ready check',
      },
      {
        id: 'database',
        entityRef: db,
        label: 'Database',
        environment: 'demo',
        region: 'local',
        state: 'critical',
        observedAt: now.toISOString(),
        summary: 'Synthetic database failure',
      },
    ],
  },
  'demo',
  10,
  now,
);

it('uses catalog relation direction, deduplicates cycles and ignores unrelated/invalid references', () => {
  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'api' },
    relations: [
      { type: 'dependsOn', targetRef: db },
      { type: 'dependsOn', targetRef: db },
      { type: 'dependsOn', targetRef: api },
      { type: 'dependencyOf', targetRef: 'component:default/worker' },
      { type: 'ownedBy', targetRef: 'group:default/team' },
      { type: 'dependsOn', targetRef: 'https://invalid.test' },
    ],
  };
  expect(relatedRefs(entity)).toEqual({
    dependencies: [db],
    dependents: ['component:default/worker'],
  });
  expect(canonicalRef('RESOURCE:default/Database')).toBe(db);
});
it('never propagates a database failure into its consumers and expires evidence without another poll', () => {
  expect(entityEvidence(db, snapshot).state).toBe('critical');
  expect(entityEvidence(api, snapshot).state).toBe('healthy');
  expect(entityEvidence(api, snapshot, 11000).state).toBe('unknown');
  expect(entityEvidence(api).state).toBe('unknown');
  expect(entityEvidence('resource:default/unmonitored', snapshot).state).toBe(
    'unknown',
  );
});
it('does not promote partial or future observations to healthy', () => {
  const partial = {
    ...snapshot,
    observations: [
      ...snapshot.observations,
      { ...snapshot.observations[0], id: 'unknown', state: 'unknown' as const },
    ],
  };
  expect(entityEvidence(api, partial).state).toBe('unknown');
  const future = {
    ...snapshot,
    observations: [
      { ...snapshot.observations[0], freshness: 'future' as const },
    ],
  };
  expect(entityEvidence(api, future, 1000).state).toBe('unknown');
});
it('preserves saved feature choices with dependencies disabled on upgrade', () => {
  const { dependencies: _new, ...existing } = featurePreset(true);
  expect(featureFlagsSchema.parse(existing)).toEqual({
    ...existing,
    dependencies: false,
  });
});
