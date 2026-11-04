import { act, renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { WorkspacesResponse } from '@ops-compass/core';
import { WorkspaceProvider, useWorkspaces } from './WorkspaceContext';

const mockFetch = { fetch: jest.fn() };
const mockDiscovery = {
  getBaseUrl: async () => 'http://localhost/api/operations',
};
jest.mock('@backstage/core-plugin-api', () => ({
  discoveryApiRef: 'discovery',
  fetchApiRef: 'fetch',
  useApi: (ref: string) => (ref === 'discovery' ? mockDiscovery : mockFetch),
}));

const extraId = '00000000-0000-4000-8000-000000000001';
const data = (includeExtra = false): WorkspacesResponse => ({
  profile: 'team',
  userEntityRef: 'user:default/owner',
  canCreate: true,
  items: (includeExtra ? ['personal', extraId] : ['personal']).map(id => ({
    id,
    name: id,
    version: 0,
    role: 'admin',
    createdAt: '2026-09-28T00:00:00Z',
  })),
});
function pendingResponse() {
  let resolve!: (response: object) => void;
  const pending = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  mockFetch.fetch.mockReturnValueOnce(pending);
  return (body: WorkspacesResponse, ok = true) =>
    resolve({
      ok,
      json: async () => (ok ? body : { error: 'Directory unavailable' }),
    });
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <WorkspaceProvider>{children}</WorkspaceProvider>
);
async function flush(action: () => void = () => {}) {
  await act(async () => {
    action();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch.fetch.mockReset();
  localStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
});

it('does not let an older poll undo a newly created and selected workspace', async () => {
  const initial = pendingResponse();
  const { result } = renderHook(useWorkspaces, { wrapper });
  await flush(() => initial(data()));
  const oldPoll = pendingResponse();
  await flush(() => jest.advanceTimersByTime(10000));
  const newest = pendingResponse();
  let refresh!: Promise<WorkspacesResponse>;
  await flush(() => {
    refresh = result.current.refresh();
  });
  await flush(() => newest(data(true)));
  await refresh;
  await flush(() => result.current.select(extraId));
  await flush(() => oldPoll(data()));
  expect(result.current.selectedId).toBe(extraId);
  expect(result.current.data?.items).toHaveLength(2);
});

it('does not erase a newer successful refresh when an older poll fails', async () => {
  const initial = pendingResponse();
  const { result } = renderHook(useWorkspaces, { wrapper });
  await flush(() => initial(data()));
  const oldPoll = pendingResponse();
  await flush(() => jest.advanceTimersByTime(10000));
  const newest = pendingResponse();
  await flush(() => {
    void result.current.refresh();
  });
  await flush(() => newest(data(true)));
  await flush(() => oldPoll(data(), false));
  expect(result.current.data?.items).toHaveLength(2);
  expect(result.current.error).toBeUndefined();
});

it('clears a failed directory and cannot select from stale memberships', async () => {
  const initial = pendingResponse();
  const { result } = renderHook(useWorkspaces, { wrapper });
  await flush(() => initial(data(true)));
  const poll = pendingResponse();
  await flush(() => jest.advanceTimersByTime(10000));
  await flush(() => poll(data(), false));
  expect(result.current.data).toBeUndefined();
  await flush(() => result.current.select(extraId));
  expect(result.current.selectedId).toBe('personal');
});

it('ignores a directory response after its provider unmounts', async () => {
  const initial = pendingResponse();
  const { result, unmount } = renderHook(useWorkspaces, { wrapper });
  const select = result.current.select;
  unmount();
  await flush(() => initial(data(true)));
  select(extraId);
  expect(
    localStorage.getItem('ops-compass:workspace:user:default/owner'),
  ).toBeNull();
});
