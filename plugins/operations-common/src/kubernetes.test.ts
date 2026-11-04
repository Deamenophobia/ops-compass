import { evaluateKubernetes, kubernetesSnapshotSchema } from './kubernetes';
import { featureFlagsSchema, featurePreset } from './features';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../examples/kubernetes-snapshot.example.json'),
    'utf8',
  ),
);

const snapshot = () => kubernetesSnapshotSchema.parse(fixture);
const now = Date.parse(fixture.collectedAt);
it('distinguishes readiness, rollout progress, completion, scale-to-zero and stale evidence', () => {
  const data = snapshot();
  const target = data.targets[0];
  expect(
    evaluateKubernetes(data, 300, now).targets[0].deployments[0].status,
  ).toBe('progressing');
  expect(
    evaluateKubernetes(data, 300, now).targets[0].pods.map(p => p.status),
  ).toEqual(['ready', 'not-ready']);
  target.deployments[0].ready = target.deployments[0].available = 2;
  expect(
    evaluateKubernetes(data, 300, now).targets[0].deployments[0].status,
  ).toBe('ready');
  target.deployments[0].observedGeneration = 3;
  expect(
    evaluateKubernetes(data, 300, now).targets[0].deployments[0].status,
  ).toBe('progressing');
  target.deployments[0].observedGeneration = 4;
  target.deployments[0].desired = 0;
  target.pods[0].phase = 'Succeeded';
  expect(
    evaluateKubernetes(data, 300, now).targets[0].deployments[0].status,
  ).toBe('scaled-down');
  expect(evaluateKubernetes(data, 300, now).targets[0].pods[0].status).toBe(
    'completed',
  );
  expect(
    evaluateKubernetes(data, 300, now + 301000).targets[0].pods[1].status,
  ).toBe('unknown');
  expect(evaluateKubernetes(data, 300, now - 31000).freshness).toBe('stale');
});
it('rejects inconsistent coverage, duplicate targets and unsafe links; strips unknown fields', () => {
  const data = snapshot();
  expect(
    kubernetesSnapshotSchema.safeParse({
      ...data,
      targets: [...data.targets, ...data.targets],
    }).success,
  ).toBe(false);
  // eslint-disable-next-line no-script-url -- verify that executable dashboard URLs are rejected
  data.targets[0].dashboardUrl = 'javascript:alert(1)';
  expect(kubernetesSnapshotSchema.safeParse(data).success).toBe(false);
  delete data.targets[0].dashboardUrl;
  data.targets[0].coverage.pods = 'forbidden';
  expect(kubernetesSnapshotSchema.safeParse(data).success).toBe(false);
  expect(
    kubernetesSnapshotSchema.parse({ ...snapshot(), privateToken: 'discard' }),
  ).not.toHaveProperty('privateToken');
});
it('upgrades saved feature choices with Kubernetes off without changing other choices', () => {
  const { kubernetes: _newFlag, ...old } = featurePreset(true);
  expect(featureFlagsSchema.parse(old)).toEqual({ ...old, kubernetes: false });
});
