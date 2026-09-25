import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Content,
  Link,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { Typography } from '@material-ui/core';
import {
  FeatureFlags,
  FeatureId,
  FeatureResponse,
  featureResponseSchema,
  workspaceFeatures,
} from '@ops-compass/operations-common';
import { useOperationsApi } from '../useOperationsApi';

function useFeatureState() {
  const api = useOperationsApi();
  const [data, setData] = useState<FeatureResponse>();
  const [error, setError] = useState<Error>();
  const revision = useRef(0);
  const pending = useRef<Promise<FeatureResponse | undefined>>();
  const invalidate = useCallback(() => {
    revision.current++;
  }, []);
  const refresh = useCallback(() => {
    // Share one pending read. Repeated polling must not invalidate every slow
    // response and leave old choices visible indefinitely during an outage.
    if (pending.current) return pending.current;
    const request = ++revision.current;
    const work = async () => {
      try {
        const result = featureResponseSchema.parse(await api('/features'));
        if (request === revision.current) {
          setData(result);
          setError(undefined);
          return result;
        }
      } catch (cause) {
        if (request === revision.current) {
          setData(undefined); // Fail closed: old optional screens must not keep polling.
          setError(
            cause instanceof Error
              ? cause
              : new Error('Feature settings unavailable'),
          );
        }
      }
      return undefined;
    };
    pending.current = work().finally(() => {
      pending.current = undefined;
    });
    return pending.current;
  }, [api]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      invalidate();
    };
  }, [refresh, invalidate]);
  const save = async (version: number, enabled: FeatureFlags) => {
    invalidate();
    const result = featureResponseSchema.parse(
      await api('/features', { version, enabled }),
    );
    invalidate();
    setData(result);
    setError(undefined);
    return result;
  };
  return {
    data,
    error,
    refresh,
    save,
    enabled: (id: FeatureId) => Boolean(data?.enabled[id]),
    workspace: Boolean(data && workspaceFeatures.some(id => data.enabled[id])),
  };
}
const FeatureContext = createContext<
  ReturnType<typeof useFeatureState> | undefined
>(undefined);
export function FeatureProvider({ children }: { children: ReactNode }) {
  return (
    <FeatureContext.Provider value={useFeatureState()}>
      {children}
    </FeatureContext.Provider>
  );
}
export function useFeatures() {
  const value = useContext(FeatureContext);
  if (!value) throw new Error('FeatureProvider is required');
  return value;
}
export function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureId | 'workspace';
  children: ReactNode;
}) {
  const features = useFeatures();
  if (!features.data && !features.error) return <Progress />;
  if (
    features.data &&
    (feature === 'workspace' ? features.workspace : features.enabled(feature))
  )
    return <>{children}</>;
  return (
    <Page themeId="service">
      <Content>
        {features.error ? (
          <ResponseErrorPanel error={features.error} />
        ) : (
          <>
            <Typography variant="h4">Feature disabled</Typography>
            <Typography paragraph>
              This module is turned off for this workspace. Its saved data is
              retained.
            </Typography>
          </>
        )}
        <Link to="/features">Manage workspace features</Link>
      </Content>
    </Page>
  );
}
