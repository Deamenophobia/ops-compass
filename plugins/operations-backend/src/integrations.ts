import { Config } from '@backstage/config';
import { createHash } from 'node:crypto';
import { DeliveryError } from './delivery';
import { BudgetsClient, DescribeBudgetCommand } from '@aws-sdk/client-budgets';
import {
  SNSClient,
  ListSubscriptionsByTopicCommand,
  PublishCommand,
} from '@aws-sdk/client-sns';
import {
  Budget,
  Deployment,
  NotificationSettings,
  budgetSchema,
  deploymentSchema,
} from '@ops-compass/operations-common';

export async function boundedJson(response: Response) {
  if (!response.ok) throw new Error('Integration request failed');
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024)
    throw new Error('Integration response too large');
  return JSON.parse(text);
}

export class Integrations {
  private budgets?: BudgetsClient;
  private sns?: SNSClient;
  constructor(
    private readonly config: Config,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (config.has('opsCompass.costs'))
      this.budgets = new BudgetsClient({ region: 'us-east-1', maxAttempts: 2 });
    if (config.has('opsCompass.notifications.snsTopicArn'))
      this.sns = new SNSClient({
        region: config.getString('opsCompass.notifications.snsRegion'),
        maxAttempts: 1,
      });
  }
  close() {
    this.budgets?.destroy();
    this.sns?.destroy();
  }
  get available() {
    return {
      resend: Boolean(
        this.config.getOptionalString('opsCompass.notifications.resendApiKey'),
      ),
      sns: Boolean(this.sns),
    };
  }
  get hasGitLab() {
    return this.config.has('opsCompass.gitlab');
  }
  notificationRoute(settings: NotificationSettings) {
    // Freeze destinations and credential identity at enqueue time, without storing
    // credentials. A changed route must never silently redirect a pending message.
    return createHash('sha256')
      .update(
        JSON.stringify([
          settings.provider,
          settings.sender,
          settings.recipient,
          settings.provider === 'resend'
            ? this.config.getOptionalString(
                'opsCompass.notifications.resendApiKey',
              )
            : [
                this.config.getOptionalString(
                  'opsCompass.notifications.snsTopicArn',
                ),
                this.config.getOptionalString(
                  'opsCompass.notifications.snsRegion',
                ),
              ],
        ]),
      )
      .digest('hex');
  }
  get hasBudget() {
    return Boolean(this.budgets);
  }

  async deployments(): Promise<Deployment[]> {
    if (!this.hasGitLab) return [];
    const config = this.config.getConfig('opsCompass.gitlab');
    const base = new URL(config.getString('baseUrl'));
    if (base.protocol !== 'https:' || base.username || base.password)
      throw new Error('GitLab requires HTTPS');
    const projects = config.getConfigArray('projects');
    if (projects.length > 20) throw new Error('Configure at most 20 projects');
    const result: Deployment[] = [];
    for (const project of projects) {
      const ref = project.getOptionalString('ref') ?? 'main';
      const url = new URL(
        `/api/v4/projects/${encodeURIComponent(
          project.getString('projectId'),
        )}/pipelines/latest`,
        base,
      );
      url.searchParams.set('ref', ref);
      const response = await this.fetcher(url, {
        headers: { 'PRIVATE-TOKEN': config.getString('token') },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      const pipeline = await boundedJson(response);
      const webUrl = new URL(pipeline.web_url);
      if (webUrl.origin !== base.origin)
        throw new Error('Unexpected pipeline origin');
      result.push(
        deploymentSchema.parse({
          serviceId: project.getString('serviceId'),
          project: project.getString('projectId'),
          ref,
          sha: pipeline.sha,
          status: pipeline.status,
          webUrl: webUrl.href,
          updatedAt: pipeline.updated_at,
          observedAt: new Date().toISOString(),
        }),
      );
    }
    return result;
  }

  async budget(): Promise<Budget | undefined> {
    if (!this.budgets) return undefined;
    const response = await this.budgets.send(
      new DescribeBudgetCommand({
        AccountId: this.config.getString('opsCompass.costs.accountId'),
        BudgetName: this.config.getString('opsCompass.costs.budgetName'),
      }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    const budget = response.Budget;
    if (
      !budget ||
      budget.BudgetType !== 'COST' ||
      budget.TimeUnit !== 'MONTHLY' ||
      !budget.BudgetLimit
    )
      throw new Error('A monthly cost budget is required');
    const currency = budget.BudgetLimit.Unit;
    const money = (value: { Amount?: string; Unit?: string } | undefined) => {
      if (!value?.Amount) return null;
      if (value.Unit !== currency) throw new Error('Budget currency mismatch');
      return Number(value.Amount);
    };
    return budgetSchema.parse({
      name: budget.BudgetName,
      currency,
      limit: Number(budget.BudgetLimit.Amount),
      actual: money(budget.CalculatedSpend?.ActualSpend),
      forecast: money(budget.CalculatedSpend?.ForecastedSpend),
      // This is the budget configuration update, not a timestamp for billing usage.
      updatedAt: budget.LastUpdatedTime?.toISOString(),
      observedAt: new Date().toISOString(),
    });
  }

  async subscriptions() {
    if (!this.sns) return { status: 'not-applicable' as const };
    let nextToken: string | undefined;
    let confirmed = 0;
    let pending = 0;
    for (let page = 0; page < 10; page++) {
      const response = await this.sns.send(
        new ListSubscriptionsByTopicCommand({
          TopicArn: this.config.getString(
            'opsCompass.notifications.snsTopicArn',
          ),
          NextToken: nextToken,
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      for (const sub of response.Subscriptions ?? []) {
        if (sub.Protocol !== 'email' && sub.Protocol !== 'email-json') continue;
        if (sub.SubscriptionArn === 'PendingConfirmation') pending++;
        else if (sub.SubscriptionArn?.startsWith('arn:')) confirmed++;
      }
      nextToken = response.NextToken;
      if (!nextToken)
        return { status: 'available' as const, confirmed, pending };
    }
    throw new Error('Incomplete subscription list');
  }

  async send(
    settings: NotificationSettings,
    id: string,
    subject: string,
    text: string,
  ) {
    if (settings.provider === 'resend' && this.available.resend) {
      // Credentials stay on the backend; no default sender, recipient or raw
      // provider response is exposed through the public application.
      const response = await this.fetcher('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${this.config.getString(
            'opsCompass.notifications.resendApiKey',
          )}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': id,
        },
        body: JSON.stringify({
          from: settings.sender,
          to: [settings.recipient],
          subject,
          text,
        }),
      });
      if (!response.ok) {
        const wait = response.headers.get('retry-after');
        let waitMs = 0;
        if (wait)
          waitMs = /^\d+$/.test(wait)
            ? Number(wait) * 1000
            : Date.parse(wait) - Date.now();
        if (response.status === 429)
          throw new DeliveryError(
            'retryable',
            Number.isFinite(waitMs) ? Math.max(0, waitMs) : 0,
          );
        if (response.status >= 500 || response.status === 408)
          throw new DeliveryError('uncertain');
        // Only the documented concurrent-idempotency conflict is retryable.
        if (response.status === 409) {
          const body = await response.text();
          if (
            body.length <= 8192 &&
            JSON.parse(body).name === 'concurrent_idempotent_requests'
          )
            throw new DeliveryError('retryable');
          throw new DeliveryError('uncertain');
        }
        throw new DeliveryError('rejected');
      }
      const result = await boundedJson(response);
      if (typeof result.id !== 'string')
        throw new Error('Provider did not confirm acceptance');
      return;
    }
    if (settings.provider === 'sns' && this.sns) {
      let response;
      try {
        response = await this.sns.send(
          new PublishCommand({
            TopicArn: this.config.getString(
              'opsCompass.notifications.snsTopicArn',
            ),
            Subject: subject
              .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
              .slice(0, 99),
            Message: text,
          }),
          { abortSignal: AbortSignal.timeout(10000) },
        );
      } catch (error) {
        const failure = error as
          | { name?: string; $metadata?: { httpStatusCode?: number } }
          | undefined;
        const status = failure?.$metadata?.httpStatusCode;
        if (status && status >= 400 && status < 500) {
          if (
            status === 429 ||
            [
              'Throttled',
              'Throttling',
              'ThrottlingException',
              'KMSThrottling',
              'KMSThrottlingException',
            ].includes(failure?.name ?? '')
          )
            throw new DeliveryError('retryable');
          throw new DeliveryError('rejected');
        }
        throw new DeliveryError('uncertain');
      }
      if (!response.MessageId)
        throw new Error('Provider did not confirm acceptance');
      return;
    }
    throw new Error('Notification provider is not configured');
  }
}
