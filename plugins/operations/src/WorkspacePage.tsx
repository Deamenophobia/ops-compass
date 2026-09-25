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
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@material-ui/core';
import { CompassMascot } from './CompassMascot';
import { date, workspaceTitle } from './workspace/presentation';
import { useWorkspaceModel } from './workspace/useWorkspaceModel';
import { ServicesPanel } from './workspace/ServicesPanel';
import { HistoryPanel } from './workspace/HistoryPanel';
import { WorklogsPanel } from './workspace/WorklogsPanel';
import { NotificationsPanel } from './workspace/NotificationsPanel';
import { CostsPanel } from './workspace/CostsPanel';
import { MaintenancePanel } from './workspace/MaintenancePanel';

export function WorkspacePage() {
  const model = useWorkspaceModel();
  const {
    classes,
    api,
    tab,
    data,
    error,
    notice,
    busy,
    canWrite,
    selectTab,
    run,
    visibleTabs,
    flags,
  } = model;
  return (
    <Page themeId="service">
      <Header
        title="Workspace"
        subtitle="Know what is running, keep the evidence, and record what you verified."
      >
        <div className={classes.artwork}>
          <CompassMascot size={140} />
        </div>
      </Header>
      <Content>
        {busy && <Progress />}
        <div className={classes.row}>
          <Button
            variant="outlined"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  data?.canWrite
                    ? api('/workspace/refresh', {})
                    : Promise.resolve(),
                'Workspace refreshed.',
              )
            }
          >
            Refresh workspace
          </Button>
          <Link to="/">Operations overview</Link>
          <Link to="/features">Choose workspace features</Link>
          <Link to="/docs/default/component/ops-compass/guides/user-manual">
            User manual
          </Link>
        </div>
        {error && <ResponseErrorPanel error={error} />}
        {notice && (
          <div className={classes.notice} role="status">
            {notice}
          </div>
        )}
        {data && (
          <>
            <Paper className={classes.intro}>
              <div className={classes.row}>
                <Typography variant="h5">
                  {workspaceTitle(data.source)}
                </Typography>
                <Chip label={`Source: ${data.source}`} />
              </div>
              <Typography>
                {data.source === 'demo'
                  ? 'All runtime examples are synthetic. Scenario changes and email tests stay inside this demo.'
                  : 'Runtime sources are read-only. Notes, worklogs and preferences are saved to your private operations database.'}
              </Typography>
              {data.sourceStatus === 'unavailable' && (
                <Typography role="alert">
                  Observation source unavailable. Current service details have
                  been cleared; journal entries below remain historical.
                </Typography>
              )}
              <Typography className={classes.meta}>
                Retrieved {date(data.evaluatedAt)} · Refresh reads configured
                sources. Run host collectors separately for a new snapshot.
              </Typography>
              {data.scenarios.length > 0 && (
                <TextField
                  id="ops-demo-scenario"
                  select
                  label="Demo scenario"
                  value={data.activeScenario ?? ''}
                  disabled={!canWrite}
                  className={classes.field}
                  onChange={e =>
                    run(
                      () => api('/workspace/scenario', { id: e.target.value }),
                      'Demo scenario changed.',
                    )
                  }
                >
                  {data.scenarios.map(s => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.title}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {data.scenarios.find(s => s.id === data.activeScenario)
                ?.description && (
                <Typography className={classes.meta}>
                  {
                    data.scenarios.find(s => s.id === data.activeScenario)
                      ?.description
                  }
                </Typography>
              )}
            </Paper>
            <Tabs
              value={tab}
              onChange={(_e, value) => selectTab(value)}
              variant="scrollable"
              scrollButtons="auto"
              className={classes.tabs}
              aria-label="Workspace features"
            >
              {visibleTabs.map(value => (
                <Tab key={value} value={value} label={value} />
              ))}
            </Tabs>

            {flags.services && <ServicesPanel model={model} />}
            {flags.history && <HistoryPanel model={model} />}
            {flags.worklogs && <WorklogsPanel model={model} />}
            {flags.notifications && <NotificationsPanel model={model} />}
            {flags.costs && <CostsPanel model={model} />}
            {flags.maintenance && <MaintenancePanel model={model} />}
          </>
        )}
      </Content>
    </Page>
  );
}
