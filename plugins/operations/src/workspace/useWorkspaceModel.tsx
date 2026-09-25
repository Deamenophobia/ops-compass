import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MenuItem, TextField } from '@material-ui/core';
import {
  Notifications,
  OperationDocument,
  OperationEvent,
  Workspace,
  evidenceAge,
} from '@ops-compass/operations-common';
import { useOperationsApi } from '../useOperationsApi';
import { useStyles, tabs, emptySettings } from './presentation';
import { useFeatures } from '../features/FeatureContext';

export function useWorkspaceModel() {
  const features = useFeatures();
  const flags = features.data!.enabled;
  const visibleTabs = tabs.filter(id => flags[id]);
  const classes = useStyles();
  const api = useOperationsApi();
  const [params, setParams] = useSearchParams();
  const tab = visibleTabs.some(id => id === params.get('tab'))
    ? params.get('tab')!
    : visibleTabs[0];
  const [data, setData] = useState<Workspace>();
  const [events, setEvents] = useState<OperationEvent[]>([]);
  const [documents, setDocuments] = useState<OperationDocument[]>([]);
  const [notifications, setNotifications] = useState<Notifications>();
  const [settings, setSettings] = useState(emptySettings);
  const [error, setError] = useState<Error>();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [eventKind, setEventKind] = useState('all');
  const [eventService, setEventService] = useState('all');
  const [title, setTitle] = useState('Operations worklog');
  const [markdown, setMarkdown] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [verifiedAt, setVerifiedAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [backupEvidence, setBackupEvidence] = useState('');
  const service = params.get('service')
    ? data?.services.find(s => s.id === params.get('service'))
    : data?.services[0];
  const canWrite = Boolean(data?.canWrite) && !busy;
  const selectTab = (value: string) =>
    setParams({ ...Object.fromEntries(params), tab: value });

  const load = useCallback(async () => {
    const [workspace, history, docs, alerts] = await Promise.all([
      api<Workspace>('/workspace'),
      flags.history || flags.worklogs
        ? api<{ items: OperationEvent[] }>('/events')
        : Promise.resolve({ items: [] }),
      flags.worklogs || flags.maintenance
        ? api<{ items: OperationDocument[] }>('/documents')
        : Promise.resolve({ items: [] }),
      flags.notifications
        ? api<Notifications>('/notifications')
        : Promise.resolve(undefined),
    ]);
    return { workspace, history, docs, alerts };
  }, [
    api,
    flags.history,
    flags.worklogs,
    flags.maintenance,
    flags.notifications,
  ]);
  const apply = useCallback((result: Awaited<ReturnType<typeof load>>) => {
    setData(result.workspace);
    setEvents(result.history.items);
    setDocuments(result.docs.items);
    setNotifications(result.alerts);
    setSettings(result.alerts?.settings ?? emptySettings);
    setAmount(result.workspace.costs.preference?.amount.toString() ?? '');
    setCurrency(result.workspace.costs.preference?.currency ?? 'USD');
  }, []);
  useEffect(() => {
    let active = true;
    setBusy(true);
    void load()
      .then(result => {
        if (active) apply(result);
      })
      .catch(cause => {
        if (active) {
          setError(cause);
          setData(undefined);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [load, apply, flags.services, flags.costs]);
  useEffect(() => {
    if (tab !== 'notifications' || !flags.notifications) return undefined;
    let active = true;
    let pending = false;
    // Refresh delivery progress without replacing unsaved recipient/form edits.
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void api<Pick<Notifications, 'attempts' | 'queue' | 'worker'>>(
        '/notifications/progress',
      )
        .then(result => {
          if (active)
            setNotifications(current =>
              current ? { ...current, ...result } : current,
            );
        })
        .catch(cause => {
          if (active) setError(cause);
        })
        .finally(() => {
          pending = false;
        });
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, tab, flags.notifications]);
  async function run(
    action: () => Promise<unknown>,
    success: string,
    reload = true,
  ) {
    setBusy(true);
    setError(undefined);
    setNotice('');
    try {
      await action();
      if (reload) apply(await load());
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Action failed'));
    } finally {
      setBusy(false);
    }
  }
  const servicePicker = (
    <TextField
      id="ops-service"
      select
      label="Service"
      variant="outlined"
      size="small"
      className={classes.field}
      value={service?.id ?? ''}
      onChange={e => setParams({ tab, service: e.target.value })}
    >
      {!data?.services.length && (
        <MenuItem value="">No services connected</MenuItem>
      )}
      {data?.services.map(s => (
        <MenuItem key={s.id} value={s.id}>
          {s.name}
        </MenuItem>
      ))}
    </TextField>
  );
  const shownEvents = events.filter(
    e =>
      (eventKind === 'all' || e.kind === eventKind) &&
      (eventService === 'all' || e.serviceId === eventService),
  );
  const latest = data?.deployments.items.find(p => p.serviceId === service?.id);
  const budget = data?.costs.budget;
  const budgetLimit =
    data?.costs.preference?.currency === budget?.currency
      ? data?.costs.preference?.amount
      : budget?.limit;
  const budgetCurrent = evidenceAge(budget?.observedAt, 86400) === 'current';

  return {
    visibleTabs,
    flags,
    classes,
    tab,
    data,
    service,
    servicePicker,
    latest,
    api,
    events,
    setEvents,
    busy,
    selected,
    setSelected,
    eventKind,
    setEventKind,
    eventService,
    setEventService,
    title,
    markdown,
    setMarkdown,
    note,
    canWrite,
    selectTab,
    run,
    shownEvents,
    documents,
    setTitle,
    notifications,
    settings,
    setSettings,
    error,
    amount,
    setAmount,
    currency,
    setCurrency,
    budget,
    budgetLimit,
    budgetCurrent,
    setNote,
    verifiedAt,
    setVerifiedAt,
    dueAt,
    setDueAt,
    backupEvidence,
    setBackupEvidence,
    notice,
  };
}
export type WorkspaceModel = ReturnType<typeof useWorkspaceModel>;
