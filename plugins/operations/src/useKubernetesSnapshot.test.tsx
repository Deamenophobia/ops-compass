import { act, renderHook } from '@testing-library/react';
import {
  evaluateKubernetes,
  kubernetesSnapshotSchema,
} from '@ops-compass/operations-common';
import { OperationsApiError } from './useOperationsApi';
import { useKubernetesSnapshot } from './useKubernetesSnapshot';

let mockApi = jest.fn();
jest.mock('./useOperationsApi', () => ({
  ...jest.requireActual('./useOperationsApi'),
  useOperationsApi: () => mockApi,
}));
const snapshot = () =>
  evaluateKubernetes(
    kubernetesSnapshotSchema.parse({
      schemaVersion: 1,
      source: 'kubernetes-api',
      collectedAt: new Date().toISOString(),
      targets: [
        {
          cluster: 'test',
          namespace: 'apps',
          entityRef: 'component:default/api',
          selector: 'app=api',
          coverage: {
            pods: 'available',
            deployments: 'available',
            events: 'available',
          },
          deployments: [],
          warnings: [],
          pods: [
            {
              name: 'api',
              phase: 'Running',
              ready: true,
              restarts: 0,
              terminating: false,
            },
          ],
        },
      ],
    }),
    10,
  );
async function flush(action: () => void = () => {}) {
  await act(async () => {
    action();
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  mockApi = jest.fn();
});
afterEach(() => {
  jest.useRealTimers();
});

it('does not request or expose Kubernetes evidence when the feature is disabled', async () => {
  mockApi.mockResolvedValue(snapshot());
  const { result, rerender } = renderHook(
    ({ enabled }) => useKubernetesSnapshot(enabled),
    { initialProps: { enabled: false } },
  );
  await flush();
  expect(mockApi).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await flush();
  expect(result.current.data).toBeDefined();
  rerender({ enabled: false });
  expect(result.current.data).toBeUndefined();
  mockApi.mockClear();
  await flush(() => jest.advanceTimersByTime(31000));
  expect(mockApi).not.toHaveBeenCalled();
});

it('preserves data while refreshing, expires without a new response, and recovers after failure', async () => {
  mockApi.mockResolvedValueOnce(snapshot());
  const { result } = renderHook(useKubernetesSnapshot);
  await flush();
  expect(result.current.data?.targets[0].pods[0].status).toBe('ready');
  let reject!: (error: Error) => void;
  mockApi.mockImplementationOnce(
    () =>
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
  );
  await flush(() => {
    void result.current.refresh();
  });
  expect(result.current.data?.targets).toHaveLength(1);
  expect(result.current.loading).toBe(true);
  await flush(() => jest.advanceTimersByTime(11000));
  expect(result.current.data?.targets[0].pods[0].status).toBe('unknown');
  await flush(() => reject(new Error('network')));
  expect(result.current.error).toBeDefined();
  expect(result.current.data?.targets).toHaveLength(1);
  mockApi.mockResolvedValueOnce(snapshot());
  await flush(() => {
    void result.current.refresh();
  });
  expect(result.current.error).toBeUndefined();
  expect(result.current.data?.targets[0].pods[0].status).toBe('ready');
});

it('clears observations on access rejection and ignores responses from a previous workspace', async () => {
  mockApi.mockResolvedValueOnce(snapshot());
  const { result, rerender } = renderHook(useKubernetesSnapshot);
  await flush();
  mockApi.mockRejectedValueOnce(new OperationsApiError('Access denied', 403));
  await flush(() => {
    void result.current.refresh();
  });
  expect(result.current.data).toBeUndefined();
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
  mockApi = jest.fn().mockResolvedValue({
    source: 'none',
    freshness: 'unconfigured',
    targets: [],
  });
  rerender();
  expect(result.current.data).toBeUndefined();
  await flush();
  await flush(() => resolveOld(snapshot()));
  expect(result.current.data?.source).toBe('none');
});
