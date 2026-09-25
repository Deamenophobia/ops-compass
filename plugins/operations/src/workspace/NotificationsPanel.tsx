import { Link } from '@backstage/core-components';
import {
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@material-ui/core';
import { NotificationSettings } from '@ops-compass/operations-common';
import { date } from './presentation';
import { WorkspaceModel } from './useWorkspaceModel';

export function NotificationsPanel({ model }: { model: WorkspaceModel }) {
  const {
    data,
    classes,
    api,
    tab,
    notifications,
    settings,
    setSettings,
    canWrite,
    run,
  } = model;
  if (!data) return null;
  return (
    <>
      {tab === 'notifications' && notifications && (
        <>
          <Paper className={classes.card}>
            <Typography variant="h5" className={classes.title}>
              Configure email monitoring
            </Typography>
            <Typography paragraph>
              Recipients start blank. Provider credentials stay on the backend.
              Automatic messages cover observed warnings, critical or unknown
              states, and recovery transitions.
            </Typography>
            <div className={classes.row}>
              <TextField
                id="ops-email-provider"
                select
                label="Email provider"
                value={settings.provider}
                onChange={e =>
                  setSettings({
                    ...settings,
                    provider: e.target
                      .value as NotificationSettings['provider'],
                  })
                }
                className={classes.field}
              >
                {['disabled', 'resend', 'sns'].map(value => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                id="ops-recipient-email"
                label="Recipient email"
                placeholder="you@example.com"
                value={settings.recipient}
                onChange={e =>
                  setSettings({ ...settings, recipient: e.target.value })
                }
              />
              <TextField
                id="ops-verified-sender-email"
                label="Verified sender email"
                placeholder="alerts@example.com"
                value={settings.sender}
                onChange={e =>
                  setSettings({ ...settings, sender: e.target.value })
                }
              />
            </div>
            <FormControlLabel
              label="Automatically notify on observed state changes"
              control={
                <Checkbox
                  checked={settings.automatic}
                  onChange={(_e, checked) =>
                    setSettings({ ...settings, automatic: checked })
                  }
                />
              }
            />
            <Typography className={classes.meta}>
              Resend key:{' '}
              {notifications.available.resend
                ? 'configured on backend'
                : 'not configured'}{' '}
              · SNS topic:{' '}
              {notifications.available.sns
                ? 'configured on backend'
                : 'not configured'}
            </Typography>
            {settings.provider === 'sns' && (
              <Typography>
                SNS sends to all subscribers of the backend-configured topic.
                Manage recipients and confirm subscriptions in AWS; the
                recipient field above is used by Resend.
              </Typography>
            )}
            {notifications.subscriptions.status === 'available' && (
              <Typography>
                SNS email subscriptions: {notifications.subscriptions.confirmed}{' '}
                confirmed, {notifications.subscriptions.pending} pending.
              </Typography>
            )}
            {notifications.subscriptions.status === 'unavailable' && (
              <Typography>
                Subscription status unavailable. Check AWS access.
              </Typography>
            )}
            <div className={classes.row}>
              <Button
                disabled={!canWrite}
                onClick={() =>
                  run(
                    () => api('/notifications/settings', settings),
                    'Notification settings saved.',
                  )
                }
              >
                Save notification settings
              </Button>
              <Button
                variant="outlined"
                disabled={
                  !canWrite ||
                  (!notifications.simulated &&
                    (notifications.settings.provider === 'disabled' ||
                      !notifications.available[
                        notifications.settings.provider
                      ]))
                }
                onClick={() =>
                  run(
                    () => api('/notifications/test', {}),
                    notifications.simulated
                      ? 'Test queued for simulation. No email will be sent.'
                      : 'Test queued. Delivery status updates automatically.',
                  )
                }
              >
                {notifications.simulated
                  ? 'Simulate email test'
                  : 'Send test email'}
              </Button>
              <Link to="/docs/default/component/ops-compass/guides/workspace-setup">
                Provider setup
              </Link>
            </div>
          </Paper>
          <Paper className={classes.card}>
            <Typography variant="h6">Background delivery queue</Typography>
            <Typography>
              {notifications.queue.queued} queued ·{' '}
              {notifications.queue.sending} sending ·{' '}
              {notifications.queue.retrying} waiting to retry ·{' '}
              {notifications.queue.uncertain} uncertain ·{' '}
              {notifications.queue.failed} failed ·{' '}
              {notifications.queue.cancelled} cancelled
            </Typography>
            <Typography className={classes.meta}>
              Worker last checked: {date(notifications.worker.lastRunAt)}.
              Checks every {notifications.worker.intervalSeconds} seconds while
              the backend runs.
            </Typography>
            <Typography>
              Waiting messages survive restarts. Resend retries reuse the same
              request; uncertain SNS sends need review. Cancel waiting work to
              stop further attempts. Cancellation cannot recall a message
              already accepted by the provider.
            </Typography>
            <Link to="/docs/default/component/ops-compass/guides/storage-and-delivery">
              Delivery recovery and database upgrades
            </Link>
          </Paper>
          <Paper className={classes.card}>
            <Typography variant="h6">
              Email attempts and receipt checks
            </Typography>
            <Typography paragraph>
              Acceptance means the provider accepted a request. Receipt below is
              a user confirmation, not an automatic inbox check.
            </Typography>
            {!notifications.attempts.length && (
              <Typography>No attempts yet.</Typography>
            )}
            {notifications.attempts.map(a => (
              <div key={a.id} className={classes.row}>
                <div>
                  <Typography>{a.subject}</Typography>
                  <Typography className={classes.meta}>
                    {date(a.createdAt)} · {a.status} · {a.attemptCount} delivery
                    attempts
                  </Typography>
                  {a.nextAttemptAt && (
                    <Typography className={classes.meta}>
                      Next check: {date(a.nextAttemptAt)}
                    </Typography>
                  )}
                  {a.error && <Typography>{a.error}</Typography>}
                  <Typography>
                    {a.receivedAt
                      ? `${
                          a.status === 'simulated'
                            ? 'Simulated receipt'
                            : 'User-confirmed receipt'
                        }: ${date(a.receivedAt)} · ${a.receivedBy}`
                      : 'Receipt unverified'}
                  </Typography>
                </div>
                {['queued', 'retrying'].includes(a.status) && (
                  <Button
                    disabled={!canWrite}
                    onClick={() =>
                      run(
                        () => api(`/notifications/${a.id}/cancel`, {}),
                        'Waiting delivery cancelled. Check its final status.',
                      )
                    }
                  >
                    Cancel waiting delivery
                  </Button>
                )}
                {!a.receivedAt &&
                  ['accepted', 'simulated'].includes(a.status) && (
                    <Button
                      disabled={!canWrite}
                      onClick={() =>
                        run(
                          () => api(`/notifications/${a.id}/receipt`, {}),
                          'Receipt confirmation recorded.',
                        )
                      }
                    >
                      {a.status === 'simulated'
                        ? 'Simulate receipt confirmation'
                        : 'I received this email'}
                    </Button>
                  )}
              </div>
            ))}
          </Paper>
        </>
      )}
    </>
  );
}
