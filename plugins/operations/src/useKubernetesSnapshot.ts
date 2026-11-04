import { useCallback, useEffect, useRef, useState } from 'react';
import { KubernetesView } from '@ops-compass/operations-common';
import { OperationsApiError, useOperationsApi } from './useOperationsApi';

type View =
  | KubernetesView
  | { source: 'none'; freshness: 'unconfigured'; targets: [] };

export function useKubernetesSnapshot(enabled = true) {
  const api = useOperationsApi();
  const [saved, setSaved] = useState<{
    api: typeof api;
    view: View;
    receivedAt: number;
  }>();
  const [failure, setFailure] = useState<{ api: typeof api; error: Error }>();
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const view = await api<View>('/kubernetes');
      if (generation.current !== request) return;
      const receivedAt = Date.now();
      setSaved({ api, view, receivedAt });
      setNow(receivedAt);
      setFailure(undefined);
    } catch (error) {
      if (generation.current !== request) return;
      // Never retain protected data after an explicit access rejection.
      if (
        error instanceof OperationsApiError &&
        [401, 403].includes(error.status)
      )
        setSaved(undefined);
      setFailure({
        api,
        error:
          error instanceof OperationsApiError
            ? error
            : new Error(
                'Unable to read Kubernetes observations. Check that the portal backend is reachable, then retry.',
              ),
      });
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, [api, enabled]);
  useEffect(() => {
    if (!enabled) {
      setSaved(undefined);
      setFailure(undefined);
      setLoading(false);
      return undefined;
    }
    const requests = generation;
    void refresh();
    const poll = window.setInterval(refresh, 30000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      requests.current++;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh, enabled]);

  // Source identity is checked during render as well as on completion. A workspace
  // change must never briefly display the previous workspace's saved snapshot.
  const error = enabled && failure?.api === api ? failure.error : undefined;
  let data = enabled && saved?.api === api ? saved.view : undefined;
  if (saved?.api === api && data && data.source !== 'none') {
    // Use the server's remaining lifetime, avoiding client/server clock skew.
    const lifetime = Date.parse(data.expiresAt) - Date.parse(data.evaluatedAt);
    const expired =
      !Number.isFinite(lifetime) ||
      now - saved.receivedAt >= Math.max(0, lifetime);
    if (error || expired || data.freshness === 'stale') {
      data = {
        ...data,
        freshness: 'stale',
        targets: data.targets.map(target => ({
          ...target,
          deployments: target.deployments.map(item => ({
            ...item,
            status: 'unknown',
          })),
          pods: target.pods.map(item => ({ ...item, status: 'unknown' })),
        })),
      };
    }
  }
  return { data, error, loading: enabled && loading, refresh };
}
