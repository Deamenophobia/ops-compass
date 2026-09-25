import { useCallback, useEffect, useState } from 'react';
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
  Paper,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { Inventory } from '@ops-compass/operations-common';
import { useOperationsApi } from './useOperationsApi';
import { CompassMascot } from './CompassMascot';

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
}));
export function InventoryPage() {
  const classes = useStyles();
  const api = useOperationsApi();
  const [data, setData] = useState<Inventory>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const title =
    data?.source === 'none'
      ? 'Connect your AWS inventory'
      : 'Collected AWS inventory';
  const refresh = useCallback(async () => {
    setData(undefined);
    setError(undefined);
    setLoading(true);
    try {
      setData(await api<Inventory>('/inventory'));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause : new Error('Inventory unavailable'),
      );
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <Page themeId="tool">
      <Header
        title="AWS inventory"
        subtitle="Connect cloud identity to the services you maintain."
      >
        <CompassMascot size={110} />
      </Header>
      <Content>
        <div className={classes.row}>
          <Button variant="outlined" disabled={loading} onClick={refresh}>
            Refresh inventory
          </Button>
          <TextField
            label="Find an instance or service"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <Link to="/connections">Set up a connection</Link>
        </div>
        {loading && <Progress />}
        {error && <ResponseErrorPanel error={error} />}
        {data && (
          <>
            <Paper className={classes.card}>
              <Typography variant="h5">
                {data.source === 'demo' ? 'Synthetic AWS inventory' : title}
              </Typography>
              <div className={classes.row}>
                <Chip label={`Source: ${data.source}`} />
                <Chip label={`Evidence: ${data.freshness}`} />
                <Chip label={`${data.instances.length} instances`} />
              </div>
              <Typography>
                Collected:{' '}
                {data.collectedAt
                  ? new Date(data.collectedAt).toLocaleString()
                  : 'Not collected'}
                . Refresh reads the saved collection. Run the collector to
                obtain new evidence.
              </Typography>
              <Typography>
                Instance state describes EC2 lifecycle, not application health.
                Metadata identifies a host; it does not verify AWS API access,
                alarms or account-wide coverage.
              </Typography>
              {data.coverage.map((c, index) => (
                <Typography key={`${c.region}-${index}`}>
                  {c.region}: {c.status} — {c.detail}
                </Typography>
              ))}
            </Paper>
            <Grid container spacing={3}>
              {data.instances
                .filter(i =>
                  JSON.stringify(i).toLowerCase().includes(query.toLowerCase()),
                )
                .map(i => (
                  <Grid
                    item
                    xs={12}
                    md={6}
                    key={`${i.accountId}/${i.region}/${i.instanceId}`}
                  >
                    <Paper className={classes.card}>
                      <Typography variant="h6">{i.name}</Typography>
                      <Typography>
                        {i.instanceId} · {i.region} · {i.instanceType}
                      </Typography>
                      <Typography>Account: {i.accountId}</Typography>
                      <Typography>
                        Reported lifecycle: {i.state} · Evidence: {i.freshness}
                      </Typography>
                      <Typography>
                        Detailed EC2 monitoring: {i.monitoring}
                      </Typography>
                      <Typography>
                        Observed: {new Date(i.observedAt).toLocaleString()}
                      </Typography>
                      <Typography>
                        Mapped services:{' '}
                        {i.serviceIds.join(', ') ||
                          'No service mapping supplied'}
                      </Typography>
                      <Link to="/workspace">
                        Inspect service containers and deployed revisions
                      </Link>
                    </Paper>
                  </Grid>
                ))}
            </Grid>
          </>
        )}
      </Content>
    </Page>
  );
}
