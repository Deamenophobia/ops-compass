import { useState } from 'react';
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
  Paper,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { useKubernetesSnapshot } from './useKubernetesSnapshot';

const useStyles = makeStyles(theme => ({
  card: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(2),
    overflowWrap: 'anywhere',
  },
  row: {
    display: 'flex',
    gap: theme.spacing(2),
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  table: {
    width: '100%',
    minWidth: 480,
    borderCollapse: 'collapse',
    '& th, & td': {
      textAlign: 'left',
      padding: theme.spacing(1),
      borderBottom: '1px solid #ddd',
    },
  },
  scroll: { overflowX: 'auto', marginBlock: theme.spacing(2) },
  search: { width: 360, maxWidth: '100%' },
}));
const coverageHelp: Record<string, string> = {
  unauthorized:
    'Credential rejected. Renew the token and confirm the intended cluster.',
  forbidden:
    'Access denied. Check the namespace Role and its binding to the collector identity.',
  'tls-error':
    'TLS verification failed. Check the cluster CA and API hostname.',
  unavailable:
    'Collection failed. Check connectivity and the private credential files, then rerun the collector.',
  invalid:
    'The collector could not validate this resource. Check its configuration and API compatibility.',
  limit:
    'Collection exceeded a bounded list limit. Narrow the selector or namespace.',
};

export function KubernetesPage() {
  const classes = useStyles();
  const { data, error, loading, refresh } = useKubernetesSnapshot();
  const [query, setQuery] = useState('');
  const targets =
    data?.targets.filter(target =>
      `${target.cluster} ${target.namespace} ${target.entityRef}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ) ?? [];
  return (
    <Page themeId="tool">
      <Header
        title="Kubernetes"
        subtitle="Collected workload evidence, connected to your service catalog."
      />
      <Content>
        <div className={classes.row}>
          <Button variant="outlined" disabled={loading} onClick={refresh}>
            Refresh snapshot
          </Button>
          <TextField
            className={classes.search}
            label="Find a cluster, namespace or service"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        <Typography paragraph>
          Refresh reads a saved snapshot. Run the collector to obtain new
          evidence.
        </Typography>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {error && data && data.source !== 'none' && (
          <Typography role="status" paragraph>
            Refresh failed. Showing previous observations; current workload
            status is unknown.
          </Typography>
        )}
        {data?.source === 'none' && (
          <Paper className={classes.card}>
            <Typography variant="h5">
              Connect Kubernetes observations
            </Typography>
            <Typography>
              Configure cluster credentials and service label selectors in a
              private collector file. Run scripts/collect-kubernetes.py, then
              set opsCompass.kubernetes.file for this workspace.
            </Typography>
            <Typography>
              <Link to="/docs/default/component/ops-compass/guides/kubernetes">
                Kubernetes setup guide
              </Link>
              . Cluster credentials stay outside the portal.
            </Typography>
          </Paper>
        )}
        {data && data.source !== 'none' && (
          <>
            <Paper className={classes.card}>
              <div className={classes.row}>
                <Chip
                  label={
                    data.source === 'demo'
                      ? 'Synthetic Kubernetes demo'
                      : 'Kubernetes API snapshot'
                  }
                />
                <Chip label={`Evidence: ${data.freshness}`} />
              </div>
              <Typography>
                Collected: {new Date(data.collectedAt).toLocaleString()}.{' '}
                {data.targets.length} configured service targets.
              </Typography>
              <Typography>
                Readiness reports Kubernetes conditions, not end-to-end
                application health. Stale observations have unknown current
                status. Empty lists do not prove a healthy service.
              </Typography>
            </Paper>
            {!targets.length && (
              <Typography role="status">
                {data.targets.length
                  ? 'No matching services. Try another cluster, namespace or service name.'
                  : 'No configured service targets in this snapshot. Add a target and rerun the collector.'}
              </Typography>
            )}
            {targets.map(target => {
              const [catalogNamespace, serviceName] = target.entityRef
                .slice('component:'.length)
                .split('/');
              return (
                <Paper
                  className={classes.card}
                  key={`${target.cluster}/${target.namespace}/${target.entityRef}`}
                >
                  <Typography variant="h6">
                    <Link
                      to={`/catalog/${catalogNamespace}/component/${serviceName}`}
                    >
                      {target.entityRef}
                    </Link>
                  </Typography>
                  <Typography>
                    {target.cluster} / {target.namespace} · Selector:{' '}
                    {target.selector}
                  </Typography>
                  <Typography>
                    Collection — deployments: {target.coverage.deployments};
                    pods: {target.coverage.pods}; events:{' '}
                    {target.coverage.events}
                  </Typography>
                  {Object.entries(target.coverage)
                    .filter(([, state]) => state !== 'available')
                    .map(([kind, state]) => (
                      <Typography key={kind} role="status">
                        {kind}: {coverageHelp[state]}
                      </Typography>
                    ))}
                  {target.dashboardUrl && (
                    <a
                      href={target.dashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open cluster dashboard ↗
                    </a>
                  )}
                  <div className={classes.scroll}>
                    <table
                      className={classes.table}
                      aria-label={`Deployments for ${target.entityRef}`}
                    >
                      <thead>
                        <tr>
                          <th>Deployment</th>
                          <th>Status</th>
                          <th>Ready / desired</th>
                          <th>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {target.deployments.map(item => (
                          <tr key={item.name}>
                            <td>{item.name}</td>
                            <td>{item.status}</td>
                            <td>
                              {item.ready} / {item.desired}
                            </td>
                            <td>{item.updated}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!target.deployments.length && (
                    <Typography>
                      No deployment evidence. Check the selector and collection
                      coverage.
                    </Typography>
                  )}
                  <div className={classes.scroll}>
                    <table
                      className={classes.table}
                      aria-label={`Pods for ${target.entityRef}`}
                    >
                      <thead>
                        <tr>
                          <th>Pod</th>
                          <th>Phase</th>
                          <th>Status</th>
                          <th>Restarts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {target.pods.map(item => (
                          <tr key={item.name}>
                            <td>{item.name}</td>
                            <td>{item.phase}</td>
                            <td>{item.status}</td>
                            <td>{item.restarts ?? 'Unknown'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!target.pods.length && (
                    <Typography>
                      No pod evidence. Check the selector and collection
                      coverage.
                    </Typography>
                  )}
                  <Typography variant="subtitle1">
                    Warning events for observed pods and deployments
                  </Typography>
                  {target.warnings.length ? (
                    <ul>
                      {target.warnings.map((event, index) => (
                        <li key={index}>
                          {event.object}: {event.reason} · {event.count}{' '}
                          occurrence(s) ·{' '}
                          {event.lastSeen
                            ? new Date(event.lastSeen).toLocaleString()
                            : 'Time unknown'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Typography>
                      No warning events in this snapshot; see event coverage
                      above.
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </>
        )}
      </Content>
    </Page>
  );
}
