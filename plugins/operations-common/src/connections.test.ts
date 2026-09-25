import { prepareConnection } from './connections';

const aws = {
  kind: 'aws',
  expectedAccountId: '000000000000',
  regions: ['eu-west-1', 'us-east-1'],
  profile: '',
  snapshotDirectory: 'C:\\portal\\private',
};
const target = {
  id: 'web',
  sshAlias: 'my-host',
  label: 'My server',
  entityRef: 'resource:default/web',
  region: 'my-location',
  environment: 'development',
  checkDocker: false,
  minimumRunning: 1,
};

it('exports CLI-compatible inventory and an absolute backend snapshot path without inventing credentials', () => {
  const setup = prepareConnection(aws);
  expect(JSON.parse(setup.collectorJson)).toEqual({
    expectedAccountId: '000000000000',
    regions: ['eu-west-1', 'us-east-1'],
    serviceMappings: {},
  });
  expect(JSON.parse(setup.portalJson)).toEqual({
    opsCompass: {
      mode: 'unconfigured',
      inventory: {
        file: 'C:/portal/private/inventory.local.json',
        maxAgeSeconds: 300,
      },
    },
  });
  expect(
    prepareConnection({ ...aws, profile: 'my-sso' }).collectorJson,
  ).toContain('my-sso');
});

it('exports multiple SSH targets and treats labels as data, never shell commands', () => {
  const setup = prepareConnection({
    kind: 'ssh',
    snapshotDirectory: '/srv/portal/private/',
    targets: [
      target,
      {
        ...target,
        id: 'worker',
        sshAlias: 'worker-host',
        label: 'Worker "two"; $(whoami)',
      },
    ],
  });
  expect(JSON.parse(setup.collectorJson).targets).toHaveLength(2);
  expect(JSON.parse(setup.portalJson).opsCompass.snapshotFile).toBe(
    '/srv/portal/private/observations.local.json',
  );
  expect(setup.command).toBe(
    'python scripts/collect-ssh.py --config private/hosts.local.json --output private/observations.local.json',
  );
});

it.each([
  { ...aws, expectedAccountId: '' },
  { ...aws, regions: ['eu-west-1', 'eu-west-1'] },
  { ...aws, regions: ['not-a-region'] },
  { ...aws, snapshotDirectory: '../private' },
  { ...aws, snapshotDirectory: '/srv/${SECRET}/private' },
  { ...aws, profile: '--endpoint-url=https://example.invalid' },
  {
    kind: 'ssh',
    snapshotDirectory: '/private',
    targets: [{ ...target, sshAlias: '-oProxyCommand=bad' }],
  },
  {
    kind: 'ssh',
    snapshotDirectory: '/private',
    targets: [target, { ...target, id: 'WEB', sshAlias: 'second-host' }],
  },
  {
    kind: 'ssh',
    snapshotDirectory: '/private',
    targets: [target, { ...target, id: 'worker' }],
  },
])('refuses an ambiguous or unsafe connection draft %#', draft => {
  expect(() => prepareConnection(draft)).toThrow();
});
