import { useCallback, useEffect, useRef, useState } from 'react';
import { Overview, overviewSchema } from '@ops-compass/operations-common';
import { useOperationsApi } from '../useOperationsApi';

export function useDependencyEvidence() {
  const api = useOperationsApi();
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<{
    api: typeof api;
    overview?: Overview;
    startedAt: number;
    error?: string;
  }>();
  const [now, setNow] = useState(Date.now);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const startedAt = Date.now();
    try {
      const overview = overviewSchema.parse(await api('/overview'));
      if (generation.current === request) {
        setSnapshot({ api, overview, startedAt });
        setNow(Date.now());
      }
    } catch {
      // Clear old health after any failure, including revoked membership.
      if (generation.current === request)
        setSnapshot({
          api,
          startedAt,
          error:
            'Health observations unavailable. Relationships remain catalog declarations; current health is unknown.',
        });
    }
  }, [api]);
  useEffect(() => {
    const requests = generation;
    void refresh();
    const poll = window.setInterval(refresh, 30000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      requests.current++;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);
  const current = snapshot?.api === api ? snapshot : undefined;
  return {
    overview: current?.overview,
    error: current?.error,
    elapsed: current ? Math.max(0, now - current.startedAt) : 0,
    refresh,
  };
}
