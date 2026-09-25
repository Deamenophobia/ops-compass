import { useEffect, useState } from 'react';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import {
  Content,
  Header,
  Link,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Button,
  Chip,
  Grid,
  MenuItem,
  Paper,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import RefreshIcon from '@material-ui/icons/Refresh';
import { CompassMascot } from './CompassMascot';
import { SavedViews } from './SavedViews';
import { useFeatures } from './features/FeatureContext';
import {
  Overview,
  overviewSchema,
  State,
} from '@ops-compass/operations-common';

const useStyles = makeStyles(theme => ({
  intro: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
    background: '#f2edf8',
    border: '1px solid #e1d6ec',
  },
  toolbar: {
    display: 'flex',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: theme.spacing(3),
  },
  metric: {
    padding: theme.spacing(2.5),
    height: '100%',
    borderRadius: 24,
    boxShadow: '0 4px 0 #e9e1ea',
  },
  metricValue: { fontSize: 36, fontWeight: 700, lineHeight: 1.3 },
  section: { marginTop: theme.spacing(4), marginBottom: theme.spacing(2) },
  check: {
    padding: theme.spacing(3),
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
    minWidth: 0,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  meta: { color: theme.palette.text.secondary, fontSize: 13 },
  summary: { flexGrow: 1, minHeight: 48 },
  footer: {
    marginTop: theme.spacing(4),
    padding: theme.spacing(3),
    background: '#eef5ee',
    border: '1px solid #d7e5db',
  },
  filter: { minWidth: 170 },
  artwork: {
    flexShrink: 0,
    marginLeft: theme.spacing(3),
    [theme.breakpoints.down('xs')]: { display: 'none' },
  },
}));

const stateLabels: Record<State, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};
const stateHelp: Record<State, string> = {
  healthy: 'Within the observed check',
  warning: 'Review the runbook',
  critical: 'Investigate immediately',
  unknown: 'Needs fresh evidence',
};
const modeTitles = {
  unconfigured: 'Connect your first source',
  demo: 'Demo workspace',
  snapshot: 'Collected host observations',
  cloudwatch: 'AWS CloudWatch observations',
};
const modeDescriptions = {
  unconfigured:
    'No observation source is configured. Connect your hosts or AWS CloudWatch to see real checks. Health remains unknown until evidence is available.',
  demo: 'Synthetic examples are replayed for demonstration. These are not measurements from your AWS account.',
  snapshot:
    'A saved SSH collection is evaluated on each refresh. Refreshing this page does not reconnect to your servers.',
  cloudwatch:
    'Read-only status of the configured metric alarms. Alarm state alone does not confirm that an email arrived.',
};
const stateColors: Record<State, { background: string; color: string }> = {
  healthy: { background: '#d7f3e3', color: '#164a30' },
  warning: { background: '#fff0cb', color: '#664300' },
  critical: { background: '#ffdde0', color: '#7d1824' },
  unknown: { background: '#e5e9f0', color: '#344256' },
};

function entityPath(ref: string) {
  const [kind, rest] = ref.split(':');
  const [namespace, name] = rest.split('/');
  return `/catalog/${namespace}/${kind}/${name}`;
}

export function OperationsPage() {
  const features = useFeatures();
  const classes = useStyles();
  const discovery = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [overview, setOverview] = useState<Overview>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const timer = window.setInterval(
      () => setRevision(value => value + 1),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    let active = true;
    setLoading(true);
    const load = async () => {
      try {
        const baseUrl = await discovery.getBaseUrl('operations');
        const response = await fetchApi.fetch(`${baseUrl}/overview`, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? 'Sign in to read operations data.'
              : 'Observation source unavailable. Check collection and configuration; previous results are no longer displayed.',
          );
        const result = overviewSchema.parse(await response.json());
        if (active) {
          setOverview(result);
          setError(undefined);
        }
      } catch (cause) {
        if (active) {
          // Old green cards must disappear when their source can no longer be checked.
          setOverview(undefined);
          setError(
            cause instanceof Error
              ? cause
              : new Error('Could not read observations'),
          );
        }
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      // Ignore late replies after navigation or a newer refresh takes over.
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [discovery, fetchApi, revision]);

  const observations =
    overview?.observations.filter(
      o =>
        `${o.label} ${o.entityRef} ${o.region}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'attention'
            ? o.state !== 'healthy'
            : o.state === filter)),
    ) ?? [];

  return (
    <Page themeId="service">
      <Header
        title="Operations"
        subtitle="A little clarity for your services. Check in, follow the evidence, take the next step."
      >
        <div className={classes.artwork}>
          <CompassMascot size={150} />
        </div>
      </Header>
      <Content>
        {loading && <Progress />}
        <div className={classes.toolbar}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            disabled={loading}
            onClick={() => setRevision(value => value + 1)}
          >
            Refresh observations
          </Button>
          <Link to="/catalog">Software catalog</Link>
          {features.workspace && <Link to="/workspace">Service workspace</Link>}
          {features.enabled('connections') && (
            <Link to="/connections">Connections</Link>
          )}
          <Link to="/features">Choose workspace features</Link>
          <Link to="/docs/default/component/ops-compass">
            Operations handbook
          </Link>
        </div>
        {error && <ResponseErrorPanel error={error} />}
        {overview && (
          <>
            <Paper className={classes.intro}>
              <div className={classes.row}>
                <Typography variant="h5">
                  {modeTitles[overview.mode]}
                </Typography>
                <Chip
                  label={stateLabels[overview.overall]}
                  style={stateColors[overview.overall]}
                />
              </div>
              <Typography paragraph>
                {modeDescriptions[overview.mode]}
              </Typography>
              {overview.mode === 'unconfigured' && (
                <div className={classes.toolbar}>
                  <Link to="/docs/default/component/ops-compass/guides/host-observations">
                    Connect host observations
                  </Link>
                  <Link to="/docs/default/component/ops-compass/guides/cloudwatch">
                    Connect AWS CloudWatch
                  </Link>
                </div>
              )}
              <Typography className={classes.meta}>
                Evaluated {new Date(overview.evaluatedAt).toLocaleString()} ·
                source: {overview.source} · evidence expires after{' '}
                {overview.maxAgeSeconds} seconds · refreshes every 30 seconds
              </Typography>
            </Paper>
            <Grid container spacing={3}>
              {(Object.keys(stateLabels) as State[]).map(state => (
                <Grid item xs={6} md={3} key={state}>
                  <Paper className={classes.metric} style={stateColors[state]}>
                    <Typography className={classes.meta}>
                      {stateLabels[state]} checks
                    </Typography>
                    <Typography className={classes.metricValue}>
                      {overview.counts[state]}
                    </Typography>
                    <Typography variant="body2">{stateHelp[state]}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            <Typography variant="h5" className={classes.section}>
              Runtime evidence
            </Typography>
            <div className={classes.toolbar}>
              <TextField
                id="operations-query"
                label="Find a check or service"
                variant="outlined"
                size="small"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <TextField
                select
                id="operations-status"
                label="Status"
                variant="outlined"
                size="small"
                className={classes.filter}
                value={filter}
                onChange={e => setFilter(e.target.value)}
              >
                <MenuItem value="all">All checks</MenuItem>
                <MenuItem value="attention">Needs attention</MenuItem>
                {(Object.keys(stateLabels) as State[]).map(state => (
                  <MenuItem key={state} value={state}>
                    {stateLabels[state]}
                  </MenuItem>
                ))}
              </TextField>
              <Typography className={classes.meta}>
                {observations.length} of {overview.observations.length} checks
              </Typography>
            </div>
            {!observations.length && (
              <Typography role="status">
                {overview.observations.length
                  ? 'No checks match your filters.'
                  : 'No observations yet. An empty result is not evidence of a healthy system.'}
              </Typography>
            )}
            <SavedViews
              query={query}
              status={filter}
              scope={overview.mode}
              apply={(value, status) => {
                setQuery(value);
                setFilter(status);
              }}
            />
            <Grid container spacing={3}>
              {observations.map(o => (
                <Grid item xs={12} md={6} lg={4} key={o.id}>
                  <Paper component="article" className={classes.check}>
                    <div className={classes.row}>
                      <Typography variant="h6">{o.label}</Typography>
                      <Chip
                        size="small"
                        label={stateLabels[o.state]}
                        style={stateColors[o.state]}
                      />
                    </div>
                    <Typography className={classes.meta}>
                      {o.environment} · {o.region}
                    </Typography>
                    <Typography className={classes.meta}>
                      Observation ID: {o.id}
                    </Typography>
                    <Typography className={classes.summary}>
                      {o.summary}
                    </Typography>
                    {o.freshness !== 'current' && (
                      <Typography variant="body2" role="status">
                        <strong>
                          {o.freshness === 'stale'
                            ? 'Stale evidence'
                            : 'Clock mismatch'}
                          .
                        </strong>{' '}
                        Last reported state: {stateLabels[o.reportedState]}.
                        Collect again before relying on it.
                      </Typography>
                    )}
                    <Typography className={classes.meta}>
                      Observed {new Date(o.observedAt).toLocaleString()}
                    </Typography>
                    {o.stateChangedAt && (
                      <Typography className={classes.meta}>
                        Alarm changed{' '}
                        {new Date(o.stateChangedAt).toLocaleString()}
                      </Typography>
                    )}
                    <div className={classes.row}>
                      <Link to={entityPath(o.entityRef)}>
                        Open catalog entity
                      </Link>
                      <Link to="/docs/default/component/ops-compass/runbooks/health">
                        Health runbook
                      </Link>
                    </div>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            <Paper className={classes.footer}>
              <Typography variant="h6">Follow the evidence</Typography>
              <Typography>
                Check the source and timestamp, open the affected service, and
                use its runbook. Record the observation, action, and verified
                outcome in the worklog. Unknown checks need collection before
                diagnosis.
              </Typography>
              <Link to="/docs/default/component/ops-compass/runbooks/email-alerts">
                Email monitoring guide
              </Link>
            </Paper>
          </>
        )}
      </Content>
    </Page>
  );
}
