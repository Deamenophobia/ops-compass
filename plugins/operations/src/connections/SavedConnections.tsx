import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@backstage/core-components';
import {
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import {
  ConnectionDraft,
  ConnectionList,
  ConnectionTestInput,
  SavedConnection,
  connectionListSchema,
} from '@ops-compass/operations-common';
import { useOperationsApi } from '../useOperationsApi';

const useStyles = makeStyles(theme => ({
  section: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
    overflowWrap: 'anywhere',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  card: {
    border: '1px solid #ddd8e4',
    borderRadius: 16,
    padding: theme.spacing(2),
    height: '100%',
  },
  editor: {
    marginTop: theme.spacing(3),
    padding: theme.spacing(2),
    borderRadius: 16,
    background: '#f2edf8',
  },
  filter: { width: 280, maxWidth: '100%' },
}));

function label(profile: SavedConnection, now: number) {
  const test = profile.lastTest;
  if (!profile.enabled) return 'Disabled';
  if (!test || test.version !== profile.version) return 'Not tested';
  if (Date.parse(test.finishedAt ?? test.startedAt) > now + 60000)
    return 'Clock mismatch · result unverified';
  if (test.status === 'running')
    return now - Date.parse(test.startedAt) > 70000
      ? 'Interrupted · retest needed'
      : 'Testing saved profile';
  if (test.status === 'passed' && now - Date.parse(test.finishedAt!) > 300000)
    return 'Test expired · retest needed';
  const prefix = test.source === 'simulated' ? 'Simulated · ' : '';
  return `${prefix}${
    {
      passed: 'Access verified',
      failed: 'Test failed',
      blocked: 'Test blocked',
      interrupted: 'Test interrupted',
    }[test.status]
  }`;
}

export function SavedConnections({
  draft,
  onLoad,
}: {
  draft?: ConnectionDraft;
  onLoad: (draft?: ConnectionDraft) => void;
}) {
  const classes = useStyles();
  const api = useOperationsApi();
  const [data, setData] = useState<ConnectionList>();
  const [readError, setReadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<SavedConnection>();
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [filter, setFilter] = useState('');
  const [scenario, setScenario] =
    useState<NonNullable<ConnectionTestInput['scenario']>>('success');
  const [now, setNow] = useState(Date.now());
  const requestRevision = useRef(0);
  const invalidateRequests = useCallback(() => {
    requestRevision.current++;
  }, []);
  const refresh = useCallback(async () => {
    const revision = ++requestRevision.current;
    try {
      const result = connectionListSchema.parse(await api('/connections'));
      if (revision === requestRevision.current) {
        setData(result);
        setReadError('');
      }
    } catch (error) {
      if (revision === requestRevision.current) {
        setData(undefined);
        setReadError(
          error instanceof Error
            ? error.message
            : 'Saved connections unavailable.',
        );
      }
    }
    if (revision === requestRevision.current) setNow(Date.now());
  }, [api]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      window.clearInterval(timer);
      invalidateRequests();
    };
  }, [refresh, invalidateRequests]);
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await work();
      await refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Connection action failed.',
      );
    } finally {
      setBusy(false);
    }
  };
  const edit = (profile?: SavedConnection) => {
    setSelected(profile);
    setName(profile?.name ?? '');
    setEnvironment(profile?.environment ?? '');
    setEnabled(profile?.enabled ?? true);
    setNotice('');
    setActionError('');
    onLoad(profile?.draft);
  };
  const save = () =>
    action(async () => {
      if (!draft)
        throw new Error('Prepare the connection details below before saving.');
      const saved = await api<SavedConnection>(
        selected ? `/connections/${selected.id}` : '/connections',
        {
          name,
          environment,
          enabled,
          draft,
          ...(selected && { version: selected.version }),
        },
      );
      setSelected(saved);
      setNotice(
        'Profile saved. Saving does not start collection or test access.',
      );
    });
  const toggle = (profile: SavedConnection) =>
    action(async () => {
      const saved = await api<SavedConnection>(`/connections/${profile.id}`, {
        name: profile.name,
        environment: profile.environment,
        draft: profile.draft,
        enabled: !profile.enabled,
        version: profile.version,
      });
      // Our enable/disable action changes only this flag. Advance an editor of
      // the same revision without discarding any unsaved form fields.
      if (selected?.id === profile.id && selected.version === profile.version) {
        setSelected(saved);
        setEnabled(saved.enabled);
      }
      setNotice(
        profile.enabled
          ? 'Profile disabled. Further tests are blocked; any running test was cancelled.'
          : 'Profile enabled. Run an explicit test to check access.',
      );
    });
  const runTest = (profile: SavedConnection) =>
    action(async () => {
      await api(`/connections/${profile.id}/test`, {
        version: profile.version,
        ...(data?.testMode === 'simulated' && { scenario }),
      });
      setNotice(
        'Test accepted for the saved revision. Progress and results appear below.',
      );
    });
  return (
    <Paper className={classes.section}>
      <div className={classes.row}>
        <Typography variant="h5">Saved connections</Typography>
        <Button variant="outlined" disabled={busy} onClick={() => edit()}>
          New connection
        </Button>
        <Button onClick={refresh}>Refresh saved connections</Button>
        <TextField
          id="connection-filter"
          className={classes.filter}
          label="Filter by name or environment"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>
      <Typography paragraph>
        Profiles belong to this workspace. Tests use the saved revision and
        check access only; they do not start monitoring or establish application
        health.
      </Typography>
      {data?.testMode === 'disabled' && (
        <Typography paragraph>
          Live tests are disabled. An administrator can approve backend AWS
          profiles and SSH aliases using the{' '}
          <Link to="/docs/default/component/ops-compass/guides/connections#enable-live-tests">
            testing setup guide
          </Link>
          .
        </Typography>
      )}
      {data?.testMode === 'simulated' && (
        <div className={classes.row}>
          <Chip label="Demo tests · No network requests" />
          <TextField
            id="connection-simulation"
            select
            label="Simulation result"
            value={scenario}
            onChange={e => setScenario(e.target.value as typeof scenario)}
          >
            <MenuItem value="success">Successful access</MenuItem>
            <MenuItem value="denied">Access denied</MenuItem>
            <MenuItem value="unreachable">Target unreachable</MenuItem>
          </TextField>
        </div>
      )}
      {readError && <Typography role="alert">{readError}</Typography>}
      {actionError && <Typography role="alert">{actionError}</Typography>}
      {notice && <Typography role="status">{notice}</Typography>}
      {data?.items.length === 0 && (
        <Typography>
          No saved connections. Prepare your own details below, then save a
          profile.
        </Typography>
      )}
      <Grid container spacing={2}>
        {data?.items
          .filter(p =>
            `${p.name} ${p.environment}`
              .toLowerCase()
              .includes(filter.toLowerCase()),
          )
          .map(profile => (
            <Grid item xs={12} md={6} key={profile.id}>
              <div
                className={classes.card}
                role="group"
                aria-label={`Saved connection ${profile.name}`}
              >
                <Typography variant="h6">{profile.name}</Typography>
                <Typography>
                  {profile.environment} ·{' '}
                  {profile.draft.kind === 'aws' ? 'AWS inventory' : 'Linux SSH'}{' '}
                  · Revision {profile.version}
                </Typography>
                <Chip label={label(profile, now)} />
                <Typography variant="body2">
                  Saved {new Date(profile.updatedAt).toLocaleString()} by{' '}
                  {profile.updatedBy}
                </Typography>
                {profile.lastTest && (
                  <>
                    <Typography variant="body2">
                      {profile.lastTest.source === 'simulated'
                        ? 'Simulated test'
                        : 'Live access test'}{' '}
                      ·{' '}
                      {new Date(
                        profile.lastTest.finishedAt ??
                          profile.lastTest.startedAt,
                      ).toLocaleString()}{' '}
                      · {profile.lastTest.actor}
                    </Typography>
                    {profile.lastTest.checks.map((check, i) => (
                      <Typography key={i} variant="body2">
                        {check.target}: {check.status} — {check.detail}
                      </Typography>
                    ))}
                  </>
                )}
                <div className={classes.row}>
                  <Button disabled={busy} onClick={() => edit(profile)}>
                    Edit profile
                  </Button>
                  <Button
                    disabled={!data.canWrite || busy}
                    onClick={() => toggle(profile)}
                  >
                    {profile.enabled ? 'Disable profile' : 'Enable profile'}
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={
                      !data.canWrite ||
                      busy ||
                      !profile.enabled ||
                      data.testMode === 'disabled' ||
                      (profile.lastTest?.status === 'running' &&
                        now - Date.parse(profile.lastTest.startedAt) < 70000)
                    }
                    onClick={() => runTest(profile)}
                  >
                    Test connection
                  </Button>
                </div>
              </div>
            </Grid>
          ))}
      </Grid>
      <div className={classes.editor}>
        <Typography variant="h6">
          {selected
            ? `Editing ${selected.name} · revision ${selected.version}`
            : 'Save the prepared setup'}
        </Typography>
        <Typography paragraph>
          Use Prepare setup below to validate the current details. Saving keeps
          credential references in the private journal; credentials stay in the
          backend client configuration.
        </Typography>
        <div className={classes.row}>
          <TextField
            id="connection-name"
            label="Connection name"
            value={name}
            onChange={e => setName(e.target.value)}
            inputProps={{ maxLength: 80 }}
          />
          <TextField
            id="connection-environment"
            label="Connection environment"
            value={environment}
            onChange={e => setEnvironment(e.target.value)}
            inputProps={{ maxLength: 40 }}
          />
          <FormControlLabel
            label="Enable manual tests"
            control={
              <Checkbox
                color="primary"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
              />
            }
          />
          <Button
            variant="contained"
            color="primary"
            disabled={
              !data?.canWrite ||
              busy ||
              !draft ||
              !name.trim() ||
              !environment.trim()
            }
            onClick={save}
          >
            {selected ? 'Update saved connection' : 'Save new connection'}
          </Button>
        </div>
      </div>
    </Paper>
  );
}
