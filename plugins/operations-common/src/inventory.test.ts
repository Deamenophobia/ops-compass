import { evaluateInventory } from './inventory';

const now = Date.parse('2026-09-25T12:00:00Z');
const input = {
  schemaVersion: 1,
  source: 'instance-metadata',
  collectedAt: '2026-09-25T11:00:00Z',
  coverage: [],
  instances: [
    {
      instanceId: 'i-0123456789abcdef0',
      accountId: '000000000000',
      region: 'eu-west-1',
      name: 'Example',
      instanceType: 't3.small',
      state: 'unknown',
      monitoring: 'unknown',
      observedAt: '2026-09-25T11:00:00Z',
      serviceIds: [],
    },
  ],
};
it('retains stale identity as historical evidence without inferring running health', () => {
  const result = evaluateInventory(input, 300, now);
  expect(result.freshness).toBe('stale');
  expect(result.instances[0]).toMatchObject({
    state: 'unknown',
    freshness: 'stale',
  });
});
it('rejects duplicate identities and marks future evidence', () => {
  expect(() =>
    evaluateInventory(
      { ...input, instances: [...input.instances, ...input.instances] },
      300,
      now,
    ),
  ).toThrow();
  expect(
    evaluateInventory(
      { ...input, collectedAt: '2026-09-26T12:00:00Z' },
      300,
      now,
    ).freshness,
  ).toBe('future');
});
