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
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { MenuItem, TextField } from '@material-ui/core';
import {
  DEFAULT_WORKSPACE_ID,
  WorkspacesResponse,
  workspacesResponseSchema,
} from '@ops-compass/core';

function useWorkspaceState() {
  const discovery = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [data, setData] = useState<WorkspacesResponse>();
  const [error, setError] = useState<Error>();
  const [selectedId, setSelectedId] = useState(DEFAULT_WORKSPACE_ID);
  const selected = useRef(DEFAULT_WORKSPACE_ID);
  const identity = useRef<string>();
  const directory = useRef<WorkspacesResponse>();
  const revision = useRef(0);
  const pending = useRef<Promise<WorkspacesResponse>>();
  const invalidate = useCallback(() => {
    revision.current++;
    directory.current = undefined;
    pending.current = undefined;
  }, []);
  const request = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const base = await discovery.getBaseUrl('operations');
      const response = await fetchApi.fetch(`${base}/workspaces${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        ...(body !== undefined && {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? 'Workspaces unavailable');
      return result;
    },
    [discovery, fetchApi],
  );
  const refresh = useCallback(() => {
    // An explicit refresh after a mutation supersedes an older poll. Ignore both
    // late successes and failures; neither may restore revoked/stale membership.
    const current = ++revision.current;
    const work = async () => {
      const result = workspacesResponseSchema.parse(await request(''));
      if (current !== revision.current) return result;
      let preferred = selected.current;
      if (identity.current !== result.userEntityRef) {
        identity.current = result.userEntityRef;
        preferred = DEFAULT_WORKSPACE_ID;
        try {
          preferred =
            localStorage.getItem(
              `ops-compass:workspace:${result.userEntityRef}`,
            ) ?? DEFAULT_WORKSPACE_ID;
        } catch {
          /* Storage is optional. */
        }
      }
      selected.current =
        result.items.find(item => item.id === preferred)?.id ??
        result.items[0]?.id ??
        DEFAULT_WORKSPACE_ID;
      directory.current = result;
      setSelectedId(selected.current);
      setData(result);
      setError(undefined);
      return result;
    };
    const operation = work()
      .catch(cause => {
        if (current === revision.current) {
          directory.current = undefined;
          setData(undefined);
          setError(
            cause instanceof Error
              ? cause
              : new Error('Workspaces unavailable'),
          );
        }
        throw cause;
      })
      .finally(() => {
        if (pending.current === operation) pending.current = undefined;
      });
    pending.current = operation;
    return operation;
  }, [request]);
  useEffect(() => {
    const poll = () => {
      // Polling shares admission with manual refreshes, so it cannot supersede
      // a slow post-mutation read that the caller is waiting to select from.
      if (!pending.current) void refresh().catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 10000);
    return () => {
      invalidate();
      window.clearInterval(timer);
    };
  }, [refresh, invalidate]);
  const select = (id: string) => {
    const latest = directory.current;
    if (!latest?.items.some(item => item.id === id)) return;
    selected.current = id;
    setSelectedId(id);
    try {
      localStorage.setItem(`ops-compass:workspace:${latest.userEntityRef}`, id);
    } catch {
      /* Storage is optional. */
    }
  };
  return { data, error, selectedId, select, refresh, request };
}
const WorkspaceContext = createContext<
  ReturnType<typeof useWorkspaceState> | undefined
>(undefined);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return (
    <WorkspaceContext.Provider value={useWorkspaceState()}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspaces() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider is required');
  return value;
}
export function WorkspaceSelector() {
  const { data, selectedId, select } = useWorkspaces();
  if (!data || data.profile === 'personal' || !data.items.length) return null;
  return (
    <div style={{ padding: 12 }}>
      <TextField
        select
        fullWidth
        variant="outlined"
        size="small"
        id="core-workspace-selector"
        label="Active workspace"
        value={selectedId}
        onChange={event => select(event.target.value)}
      >
        {data.items.map(item => (
          <MenuItem key={item.id} value={item.id}>
            {item.name}
          </MenuItem>
        ))}
      </TextField>
    </div>
  );
}
