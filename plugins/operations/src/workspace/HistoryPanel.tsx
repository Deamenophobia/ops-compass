import {
  Button,
  Checkbox,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@material-ui/core';
import { OperationEvent } from '@ops-compass/operations-common';
import { date } from './presentation';
import { WorkspaceModel } from './useWorkspaceModel';

export function HistoryPanel({ model }: { model: WorkspaceModel }) {
  const {
    classes,
    api,
    tab,
    data,
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
    setMarkdown,
    canWrite,
    selectTab,
    run,
    shownEvents,
  } = model;
  if (!data) return null;
  return (
    <>
      {tab === 'history' && (
        <Paper className={classes.card}>
          <Typography variant="h5" className={classes.title}>
            Operations timeline
          </Typography>
          <Typography paragraph>
            State transitions, runtime version changes and your records persist
            across restarts. These are historical observations, not current
            health.
          </Typography>
          <div className={classes.row}>
            <TextField
              id="ops-event-type"
              select
              label="Event type"
              value={eventKind}
              className={classes.field}
              onChange={e => setEventKind(e.target.value)}
            >
              {[
                'all',
                'health',
                'deployment',
                'source',
                'note',
                'backup',
                'worklog',
                'notification',
                'scenario',
              ].map(value => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              id="ops-filter-service"
              select
              label="Filter service"
              value={eventService}
              className={classes.field}
              onChange={e => setEventService(e.target.value)}
            >
              <MenuItem value="all">All services</MenuItem>
              {data.services.map(s => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              disabled={!canWrite || !selected.length}
              onClick={() => {
                selectTab('worklogs');
                void run(
                  async () => {
                    const result = await api<{ markdown: string }>(
                      '/worklogs/draft',
                      { title, eventIds: selected },
                    );
                    setMarkdown(result.markdown);
                  },
                  'Draft prepared. Review before saving.',
                  false,
                );
              }}
            >
              Draft worklog from selection
            </Button>
          </div>
          {!shownEvents.length && (
            <Typography>
              No matching events yet. Connect a source, collect evidence or add
              a maintenance note.
            </Typography>
          )}
          {shownEvents.map(event => (
            <div key={event.id} className={classes.row}>
              <Checkbox
                inputProps={{ 'aria-label': `Select event ${event.id}` }}
                checked={selected.includes(event.id)}
                disabled={
                  !canWrite ||
                  (!selected.includes(event.id) && selected.length >= 100)
                }
                onChange={(_e, checked) =>
                  setSelected(values =>
                    checked
                      ? [...values, event.id]
                      : values.filter(id => id !== event.id),
                  )
                }
              />
              <div>
                <Typography variant="subtitle1">{event.title}</Typography>
                <Typography>{event.detail}</Typography>
                <Typography className={classes.meta}>
                  Event {event.id} · {event.kind} · recorded{' '}
                  {date(event.createdAt)} · source: {event.source} ·{' '}
                  {event.actor}
                </Typography>
                {event.observedAt && (
                  <Typography className={classes.meta}>
                    Observed {date(event.observedAt)}
                  </Typography>
                )}
              </div>
            </div>
          ))}
          {events.length >= 100 && (
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  async () => {
                    const older = await api<{ items: OperationEvent[] }>(
                      `/events?before=${events[events.length - 1].id}`,
                    );
                    setEvents(values => [...values, ...older.items]);
                  },
                  'Older events loaded.',
                  false,
                )
              }
            >
              Load older events
            </Button>
          )}
        </Paper>
      )}
    </>
  );
}
