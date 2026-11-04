import { useWorkspaces } from '@ops-compass/plugin-core';
import { WORKSPACE_HEADER } from '@ops-compass/core';
import { useCallback } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';

export class OperationsApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OperationsApiError';
  }
}

export function useOperationsApi() {
  const { selectedId } = useWorkspaces();
  const discovery = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  return useCallback(
    async <T>(path: string, body?: unknown): Promise<T> => {
      const base = await discovery.getBaseUrl('operations');
      const response = await fetchApi.fetch(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          [WORKSPACE_HEADER]: selectedId,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        ...(body !== undefined && {
          body: JSON.stringify(body),
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new OperationsApiError(
          typeof error.error === 'string'
            ? error.error
            : 'Request failed. Check the source and your access.',
          response.status,
        );
      }
      return response.json();
    },
    [discovery, fetchApi, selectedId],
  );
}
