import { NotificationSettings } from '@ops-compass/operations-common';
import { DeliveryError, maxDeliveryAttempts, retryWindowMs } from './delivery';
import { Integrations } from './integrations';
import {
  NotificationJob,
  OutboxStore,
  PendingNotification,
} from './outboxStore';

export class NotificationWorker {
  static readonly intervalSeconds = 5;
  private pending?: Promise<void>;
  private stopped = false;
  lastRunAt?: string;
  constructor(
    private readonly outbox: OutboxStore,
    private readonly integrations: Integrations,
    private readonly settings: () => Promise<NotificationSettings>,
    private readonly simulated: boolean,
    private readonly now = Date.now,
    private readonly enabled = () => true,
  ) {}

  run() {
    if (this.stopped || !this.enabled()) return Promise.resolve();
    if (!this.pending)
      this.pending = this.tick().finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  async stop() {
    this.stopped = true;
    await this.pending;
  }
  async drain() {
    await this.pending;
  }

  private retryAllowed(
    job: NotificationJob,
    payload: PendingNotification,
    now: number,
  ) {
    return (
      job.attemptCount < maxDeliveryAttempts &&
      (!job.firstAttemptAt ||
        now - Date.parse(job.firstAttemptAt) < retryWindowMs) &&
      (payload.simulated ||
        payload.settings.provider === 'resend' ||
        !job.hadUncertainty)
    );
  }

  private async tick() {
    // A two-minute lease exceeds the provider's ten-second timeout. A crashed SNS
    // call is ambiguous; Resend can be replayed only inside its idempotency window.
    for (const job of await this.outbox.abandoned(this.now())) {
      const payload: PendingNotification = JSON.parse(job.payload);
      const recoverable =
        (payload.simulated || payload.settings.provider === 'resend') &&
        this.retryAllowed(job, payload, this.now());
      await this.outbox.update(job, {
        status: recoverable ? 'retrying' : 'uncertain',
        hadUncertainty: true,
        nextAttemptAt: recoverable ? new Date(this.now()).toISOString() : null,
        error: recoverable
          ? 'Interrupted delivery; retrying the same request.'
          : 'Interrupted delivery; provider acceptance needs review. No automatic retry.',
      });
    }
    // Bound each tick and yield between batches; collection and HTTP requests do
    // not wait for remote delivery. Multiple calls in this process share one run.
    for (
      let count = 0;
      count < 10 && !this.stopped && this.enabled();
      count++
    ) {
      const job = await this.outbox.next(this.now());
      if (!job) break;
      const payload: PendingNotification = JSON.parse(job.payload);
      const settings = await this.settings();
      if (
        payload.simulated !== this.simulated ||
        (!payload.simulated &&
          (payload.settings.provider !== settings.provider ||
            payload.settings.sender !== settings.sender ||
            payload.settings.recipient !== settings.recipient)) ||
        (!payload.simulated && settings.provider === 'disabled') ||
        (payload.kind === 'transition' &&
          (!settings.automatic || settings.provider === 'disabled'))
      ) {
        await this.outbox.cancel(job.id);
        continue;
      }
      if (!this.retryAllowed(job, payload, this.now())) {
        await this.outbox.update(job, {
          status: job.hadUncertainty ? 'uncertain' : 'failed',
          nextAttemptAt: null,
          error:
            'Delivery retry limit or time window reached. Review the provider before sending a new message.',
        });
        continue;
      }
      if (
        !job.firstAttemptAt &&
        this.now() - Date.parse(job.createdAt) >= 24 * 60 * 60 * 1000
      ) {
        await this.outbox.update(job, {
          status: 'failed',
          nextAttemptAt: null,
          error:
            'Queued message expired after 24 hours without a delivery attempt.',
        });
        continue;
      }
      if (!payload.simulated) {
        if (
          settings.provider === 'disabled' ||
          !this.integrations.available[settings.provider]
        ) {
          await this.outbox.update(job, {
            nextAttemptAt: new Date(this.now() + 60000).toISOString(),
            error: 'Waiting for the configured backend provider credentials.',
          });
          continue;
        }
        if (
          payload.routeHash !== this.integrations.notificationRoute(settings)
        ) {
          await this.outbox.cancel(job.id);
          continue;
        }
      }
      if (!this.enabled()) break;
      const claimed = await this.outbox.claim(job, this.now());
      if (!claimed) continue;
      try {
        if (!payload.simulated)
          await this.integrations.send(
            payload.settings,
            claimed.id,
            payload.subject,
            payload.text,
          );
      } catch (error) {
        const outcome =
          error instanceof DeliveryError ? error.outcome : 'uncertain';
        const uncertain =
          Boolean(claimed.hadUncertainty) || outcome === 'uncertain';
        const failedJob = { ...claimed, hadUncertainty: uncertain };
        const delay = Math.max(
          30000 * 4 ** (claimed.attemptCount - 1),
          error instanceof DeliveryError ? error.retryAfterMs : 0,
        );
        const next = this.now() + delay;
        const retry =
          outcome !== 'rejected' && this.retryAllowed(failedJob, payload, next);
        const terminalStatus = uncertain ? 'uncertain' : 'failed';
        const terminalMessage = uncertain
          ? 'Acceptance unverified. Check the provider; no automatic retry remains.'
          : 'Provider rejected delivery. Check configuration before creating a new message.';
        await this.outbox.update(claimed, {
          status: retry ? 'retrying' : terminalStatus,
          hadUncertainty: uncertain,
          nextAttemptAt: retry ? new Date(next).toISOString() : null,
          error: retry
            ? 'Provider unavailable or rate limited; retry scheduled with the same message ID.'
            : terminalMessage,
        });
        continue;
      }
      // Keep this write outside the provider-error catch. If persistence fails
      // after acceptance, leave the claim for crash recovery instead of resending.
      await this.outbox.update(claimed, {
        status: payload.simulated ? 'simulated' : 'accepted',
        nextAttemptAt: null,
        error: null,
      });
    }
    this.lastRunAt = new Date(this.now()).toISOString();
  }
}
