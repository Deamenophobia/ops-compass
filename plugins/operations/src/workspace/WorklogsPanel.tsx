import { Button, Paper, TextField, Typography } from '@material-ui/core';
import { date, download } from './presentation';
import { WorkspaceModel } from './useWorkspaceModel';

export function WorklogsPanel({ model }: { model: WorkspaceModel }) {
  const {
    data,
    classes,
    api,
    tab,
    events,
    documents,
    selected,
    setSelected,
    title,
    setTitle,
    markdown,
    setMarkdown,
    canWrite,
    run,
  } = model;
  if (!data) return null;
  return (
    <>
      {tab === 'worklogs' && (
        <>
          <Paper className={classes.card}>
            <Typography variant="h5" className={classes.title}>
              Draft, review and save a worklog
            </Typography>
            <Typography paragraph>
              Select timeline events or use the latest ten. The draft contains
              facts and citations; you supply actions and verification.
            </Typography>
            <div className={classes.row}>
              <TextField
                id="ops-worklog-title"
                label="Worklog title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className={classes.field}
                inputProps={{ maxLength: 120 }}
              />
              <Button
                disabled={!canWrite || !events.length}
                onClick={() => setSelected(events.slice(0, 10).map(e => e.id))}
              >
                Use latest 10 events
              </Button>
              <Typography>{selected.length} events selected</Typography>
              <Button
                variant="contained"
                color="primary"
                disabled={!canWrite || !selected.length || !title.trim()}
                onClick={() =>
                  run(
                    async () => {
                      const result = await api<{ markdown: string }>(
                        '/worklogs/draft',
                        { title, eventIds: selected },
                      );
                      setMarkdown(result.markdown);
                    },
                    'Draft prepared. Review before saving.',
                    false,
                  )
                }
              >
                Generate worklog draft
              </Button>
            </div>
            <TextField
              id="ops-worklog-markdown"
              label="Worklog Markdown"
              multiline
              minRows={12}
              fullWidth
              variant="outlined"
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              inputProps={{ maxLength: 32000 }}
            />
            <Button
              disabled={!canWrite || !markdown.trim() || !selected.length}
              color="primary"
              onClick={() =>
                run(
                  () =>
                    api('/worklogs', {
                      title,
                      markdown,
                      eventIds: selected,
                    }),
                  'Worklog saved to private storage.',
                )
              }
            >
              Save reviewed worklog
            </Button>
          </Paper>
          <Paper className={classes.card}>
            <Typography variant="h6">Saved worklogs</Typography>
            {documents
              .filter(d => d.kind === 'worklog')
              .map(d => (
                <div key={d.id} className={classes.row}>
                  <div>
                    <Typography>{d.title}</Typography>
                    <Typography className={classes.meta}>
                      {date(d.createdAt)} · {d.actor}
                    </Typography>
                  </div>
                  <Button onClick={() => download(d)}>Download Markdown</Button>
                  <Button
                    onClick={() => {
                      setMarkdown(d.markdown);
                      setTitle(d.title);
                      setSelected([]);
                    }}
                  >
                    Read saved worklog
                  </Button>
                </div>
              ))}
            {!documents.some(d => d.kind === 'worklog') && (
              <Typography>No worklogs saved yet.</Typography>
            )}
          </Paper>
        </>
      )}
    </>
  );
}
