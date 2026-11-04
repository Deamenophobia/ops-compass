import { act, renderHook } from '@testing-library/react';
import { evaluateSnapshot } from '@ops-compass/operations-common';
import { useDependencyEvidence } from './useDependencyEvidence';

let mockApi = jest.fn();
jest.mock('../useOperationsApi', () => ({ useOperationsApi: () => mockApi }));
const overview = () =>
  evaluateSnapshot(
    { schemaVersion: 1, source: 'demo', observations: [] },
    'demo',
    5,
  );
beforeEach(() => {
  jest.useFakeTimers();
  mockApi = jest.fn();
});
afterEach(() => jest.useRealTimers());
async function flush(action: () => void = () => {}) {
  await act(async () => {
    action();
  });
}

it('clears rejected health and ignores an old workspace response', async () => {
  mockApi.mockResolvedValueOnce(overview());
  const { result, rerender } = renderHook(useDependencyEvidence);
  await flush();
  expect(result.current.overview).toBeDefined();
  mockApi.mockRejectedValueOnce(new Error('403'));
  await flush(() => {
    void result.current.refresh();
  });
  expect(result.current.overview).toBeUndefined();
  expect(result.current.error).toBeDefined();
  let resolveOld!: (value: unknown) => void;
  mockApi.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        resolveOld = resolve;
      }),
  );
  await flush(() => {
    void result.current.refresh();
  });
  mockApi = jest
    .fn()
    .mockResolvedValue({ ...overview(), source: 'none', mode: 'unconfigured' });
  rerender();
  expect(result.current.overview).toBeUndefined();
  await flush();
  await flush(() => resolveOld(overview()));
  expect(result.current.overview?.source).toBe('none');
});
