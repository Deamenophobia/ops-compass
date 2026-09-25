import { useCallback } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';

export function useOperationsApi() {
  const discovery = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  return useCallback(
    async <T>(path: string, body?: unknown): Promise<T> => {
      const base = await discovery.getBaseUrl('operations');
      const response = await fetchApi.fetch(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        ...(body !== undefined && {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          typeof error.error === 'string'
            ? error.error
            : 'Request failed. Check the source and your access.',
        );
      }
      return response.json();
    },
    [discovery, fetchApi],
  );
}
