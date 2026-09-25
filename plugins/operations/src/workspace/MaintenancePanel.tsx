import { Button, Paper, TextField, Typography } from '@material-ui/core';
import { date, certificateText } from './presentation';
import { WorkspaceModel } from './useWorkspaceModel';

export function MaintenancePanel({ model }: { model: WorkspaceModel }) {
  const {
    classes,
    api,
    tab,
    data,
    documents,
    note,
    setNote,
    verifiedAt,
    setVerifiedAt,
    dueAt,
    setDueAt,
    backupEvidence,
    setBackupEvidence,
    service,
    canWrite,
    run,
    servicePicker,
  } = model;
  if (!data) return null;
  return (
    <>
      {tab === 'maintenance' && (
        <>
          <div className={classes.row}>{servicePicker}</div>
          {!service && (
            <Typography>
              Connect a service before adding maintenance records.
            </Typography>
          )}
          {service && (
            <>
              <Paper className={classes.card}>
                <Typography variant="h5" className={classes.title}>
                  Certificate and backup reminders
                </Typography>
                <Typography variant="h6">TLS certificate</Typography>
                <Typography>{certificateText(service)}</Typography>
                <Typography className={classes.meta}>
                  Expires {date(service.certificate?.expiresAt)} · checked{' '}
                  {date(service.certificate?.checkedAt)}
                </Typography>
                <Typography variant="h6">Last backup verification</Typography>
                {data.backups
                  .filter(b => b.serviceId === service.id)
                  .map(b => (
                    <div key={b.serviceId}>
                      <Typography>
                        {Date.parse(b.dueAt) < Date.now()
                          ? 'Verification overdue'
                          : 'Next verification scheduled'}{' '}
                        · {date(b.dueAt)}
                      </Typography>
                      <Typography className={classes.meta}>
                        User-attested verification {date(b.verifiedAt)} ·
                        recorded by {b.actor}
                      </Typography>
                      <Typography>{b.evidence}</Typography>
                    </div>
                  ))}
                {!data.backups.some(b => b.serviceId === service.id) && (
                  <Typography>
                    No verification recorded. A backup file or successful backup
                    job does not prove restoreability.
                  </Typography>
                )}
              </Paper>
              <Paper className={classes.card}>
                <Typography variant="h6">
                  Record a backup verification
                </Typography>
                <Typography paragraph>
                  Record a restore or other verification you actually performed.
                  Explain the evidence; this form does not run a backup or
                  restore.
                </Typography>
                <div className={classes.row}>
                  <TextField
                    id="ops-verified-at"
                    label="Verified at"
                    type="datetime-local"
                    InputLabelProps={{ shrink: true }}
                    value={verifiedAt}
                    onChange={e => setVerifiedAt(e.target.value)}
                  />
                  <TextField
                    id="ops-next-verification-due"
                    label="Next verification due"
                    type="datetime-local"
                    InputLabelProps={{ shrink: true }}
                    value={dueAt}
                    onChange={e => setDueAt(e.target.value)}
                  />
                </div>
                <TextField
                  id="ops-backup-verification-evidence"
                  label="Backup verification evidence"
                  fullWidth
                  multiline
                  minRows={3}
                  variant="outlined"
                  value={backupEvidence}
                  onChange={e => setBackupEvidence(e.target.value)}
                />
                <Button
                  disabled={
                    !canWrite ||
                    !verifiedAt ||
                    !dueAt ||
                    backupEvidence.trim().length < 10
                  }
                  onClick={() =>
                    run(
                      () =>
                        api('/backups', {
                          serviceId: service.id,
                          verifiedAt: new Date(verifiedAt).toISOString(),
                          dueAt: new Date(dueAt).toISOString(),
                          evidence: backupEvidence,
                        }),
                      'Backup verification recorded.',
                    )
                  }
                >
                  Record verification
                </Button>
              </Paper>
              <Paper className={classes.card}>
                <Typography variant="h6">Maintenance notes</Typography>
                <TextField
                  id="ops-maintenance-note"
                  label="Maintenance note"
                  multiline
                  minRows={3}
                  fullWidth
                  variant="outlined"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  inputProps={{ maxLength: 4000 }}
                />
                <Button
                  disabled={!canWrite || !note.trim()}
                  onClick={() =>
                    run(async () => {
                      await api('/notes', {
                        serviceId: service.id,
                        text: note,
                      });
                      setNote('');
                    }, 'Maintenance note saved.')
                  }
                >
                  Save note
                </Button>
                {documents
                  .filter(d => d.kind === 'note' && d.serviceId === service.id)
                  .map(d => (
                    <div key={d.id}>
                      <Typography className={classes.meta}>
                        {date(d.createdAt)} · {d.actor}
                      </Typography>
                      <pre className={classes.code}>{d.markdown}</pre>
                    </div>
                  ))}
              </Paper>
            </>
          )}
        </>
      )}
    </>
  );
}
