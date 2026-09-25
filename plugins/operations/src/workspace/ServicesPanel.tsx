import { Link } from '@backstage/core-components';
import { Chip, Grid, Paper, Typography } from '@material-ui/core';
import { evidenceAge } from '@ops-compass/operations-common';
import { date, catalogLink, heartbeatText, versionText } from './presentation';
import { WorkspaceModel } from './useWorkspaceModel';

export function ServicesPanel({ model }: { model: WorkspaceModel }) {
  const { classes, tab, data, service, servicePicker, latest } = model;
  if (!data) return null;
  return (
    <>
      {tab === 'services' && (
        <>
          <div className={classes.row}>{servicePicker}</div>
          {!service && (
            <Paper className={classes.card}>
              <Typography variant="h6">
                Connect a service to see its containers
              </Typography>
              <Typography>
                Configure named containers in the SSH collector and register the
                service in the catalog.
              </Typography>
              <Link to="/docs/default/component/ops-compass/guides/workspace-setup">
                Service connection guide
              </Link>
            </Paper>
          )}
          {service && (
            <>
              <Paper className={classes.card}>
                <div className={classes.row}>
                  <Typography variant="h5">{service.name}</Typography>
                  <Chip
                    label={
                      evidenceAge(service.observedAt, data.maxAgeSeconds) ===
                      'current'
                        ? 'Current evidence'
                        : 'Unknown · stale or missing evidence'
                    }
                  />
                </div>
                <Typography>
                  {service.host} · {service.environment}
                </Typography>
                <Typography className={classes.meta}>
                  Observed {date(service.observedAt)}
                </Typography>
                <div className={classes.row}>
                  <Link to={catalogLink(service)}>
                    Catalog and dependencies
                  </Link>
                  <Link to="/docs/default/component/ops-compass/runbooks/health">
                    Health runbook
                  </Link>
                </div>
                <Typography variant="h6">Individual containers</Typography>
                <div
                  className={classes.scroll}
                  role="region"
                  aria-label="Container observations"
                  // Keyboard users need focus here to scroll the wide table natively.
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                  tabIndex={0}
                >
                  <table className={classes.table}>
                    <thead>
                      <tr>
                        <th>Container</th>
                        <th>Runtime / health</th>
                        <th>Image and revision</th>
                        <th>Restarts / start time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {service.containers.map(c => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td>
                            {evidenceAge(c.observedAt, data.maxAgeSeconds) ===
                            'current'
                              ? `${c.state} / ${c.health}`
                              : 'Unknown · evidence expired'}
                            <div className={classes.meta}>
                              Observed {date(c.observedAt)}
                            </div>
                          </td>
                          <td>
                            {c.image}
                            <div className={classes.meta}>
                              Revision: {c.revision ?? 'Unknown'}
                            </div>
                            <div className={classes.meta}>{c.imageId}</div>
                          </td>
                          <td>
                            {c.restartCount ?? 'Unknown'}
                            <div className={classes.meta}>
                              {date(c.startedAt)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!service.containers.length && (
                  <Typography>No container observations supplied.</Typography>
                )}
                <Typography className={classes.meta}>
                  A running process without a passing health check does not
                  prove application readiness.
                </Typography>
              </Paper>
              <Grid container spacing={3}>
                <Grid item xs={12} md={5}>
                  <Paper className={classes.card}>
                    <Typography variant="h6">Bot / worker heartbeat</Typography>
                    <Typography>{heartbeatText(service)}</Typography>
                    <Typography className={classes.meta}>
                      Last heartbeat: {date(service.heartbeat?.lastSeenAt)}
                    </Typography>
                    <Typography>
                      A heartbeat is separate evidence from Docker process
                      state.
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={7}>
                  <Paper className={classes.card}>
                    <Typography variant="h6">
                      Pipeline and deployed version
                    </Typography>
                    {latest ? (
                      <>
                        <Typography>
                          Latest pipeline: {latest.status} · {latest.ref}
                        </Typography>
                        <Typography className={classes.meta}>
                          Commit {latest.sha} · retrieved{' '}
                          {date(latest.observedAt)}
                        </Typography>
                        <Link to={latest.webUrl}>Open GitLab pipeline</Link>
                        <Typography>
                          {versionText(service, latest, data.maxAgeSeconds)}
                        </Typography>
                      </>
                    ) : (
                      <Typography>
                        {data.deployments.status === 'unavailable'
                          ? 'Pipeline source unavailable.'
                          : 'No pipeline connected for this service.'}
                      </Typography>
                    )}
                    <Typography className={classes.meta}>
                      A successful pipeline or matching commit does not verify a
                      deployment or endpoint.
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </>
          )}
        </>
      )}
    </>
  );
}
