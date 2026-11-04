import { act, renderHook } from '@testing-library/react';
import { Entity } from '@backstage/catalog-model';
import { useDependencyCatalog } from './useDependencyCatalog';

const mockCatalog = {
  queryEntities: jest.fn(),
  getEntityByRef: jest.fn(),
  getEntitiesByRefs: jest.fn(),
};
jest.mock('@backstage/core-plugin-api', () => ({ useApi: () => mockCatalog }));
jest.mock('@backstage/plugin-catalog-react', () => ({ catalogApiRef: {} }));
const entity = (name: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name },
});
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCatalog.queryEntities.mockResolvedValue({ items: [], totalItems: 0 });
});
afterEach(() => jest.useRealTimers());
async function flush(action: () => void = () => {}) {
  await act(async () => {
    action();
  });
}

it('bounds relationship reads, tolerates invisible targets and discards late selection results', async () => {
  const first = entity('first');
  first.relations = Array.from({ length: 45 }, (_, index) => ({
    type: 'dependsOn',
    targetRef: `resource:default/db-${index}`,
  }));
  mockCatalog.getEntityByRef.mockResolvedValueOnce(first);
  mockCatalog.getEntitiesByRefs.mockResolvedValueOnce({ items: [undefined] });
  const { result, rerender } = renderHook(
    ({ selected }) => useDependencyCatalog('', selected, 0),
    { initialProps: { selected: 'component:default/first' } },
  );
  await flush();
  expect(
    mockCatalog.getEntitiesByRefs.mock.calls[0][0].entityRefs,
  ).toHaveLength(40);
  expect(result.current.detail?.entities?.size).toBe(0);
  let resolveOld!: (value: Entity) => void;
  mockCatalog.getEntityByRef.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        resolveOld = resolve;
      }),
  );
  rerender({ selected: 'component:default/slow' });
  expect(result.current.detail).toBeUndefined();
  await flush();
  mockCatalog.getEntityByRef.mockResolvedValueOnce(entity('new'));
  rerender({ selected: 'component:default/new' });
  await flush();
  await flush(() => resolveOld(entity('slow')));
  expect(result.current.detail?.entity?.metadata.name).toBe('new');
});

it('searches the catalog with a bounded page and exposes failures without raw error details', async () => {
  mockCatalog.queryEntities.mockRejectedValueOnce(new Error('PRIVATE-CANARY'));
  const { result } = renderHook(() => useDependencyCatalog('database', '', 0));
  await flush(() => jest.advanceTimersByTime(300));
  expect(mockCatalog.queryEntities).toHaveBeenCalledWith(
    expect.objectContaining({
      limit: 200,
      fullTextFilter: { term: 'database' },
    }),
  );
  expect(result.current.search?.error).toContain('Catalog search unavailable');
  expect(JSON.stringify(result.current)).not.toContain('PRIVATE-CANARY');
});
