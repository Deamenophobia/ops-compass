import { ConfigReader } from '@backstage/config';
import { Integrations } from './integrations';
import { DeliveryError } from './delivery';

const budgetsSend = jest.fn();
const snsSend = jest.fn();
jest.mock('@aws-sdk/client-budgets', () => ({
  BudgetsClient: jest.fn().mockImplementation(() => ({
    send: (...args: unknown[]) => budgetsSend(...args),
    destroy: jest.fn(),
  })),
  DescribeBudgetCommand: jest.fn().mockImplementation(input => ({ input })),
}));
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: (...args: unknown[]) => snsSend(...args),
    destroy: jest.fn(),
  })),
  PublishCommand: jest.fn().mockImplementation(input => ({ input })),
  ListSubscriptionsByTopicCommand: jest
    .fn()
    .mockImplementation(input => ({ input })),
}));

beforeEach(() => {
  budgetsSend.mockReset();
  snsSend.mockReset();
});

it.each([
  [429, '{}', 'retryable'],
  [503, '{}', 'uncertain'],
  [408, '{}', 'uncertain'],
  [401, '{}', 'rejected'],
  [409, '{"name":"concurrent_idempotent_requests"}', 'retryable'],
  [409, '{"name":"invalid_idempotent_request"}', 'uncertain'],
] as const)(
  'classifies Resend HTTP %s without leaking provider details',
  async (status, body, outcome) => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(
        new Response(body, { status, headers: { 'retry-after': '120' } }),
      );
    const adapter = new Integrations(
      new ConfigReader({
        opsCompass: { notifications: { resendApiKey: 'test-only-key' } },
      }),
      fetcher,
    );
    const sending = adapter.send(
      {
        provider: 'resend',
        sender: 'alerts@example.com',
        recipient: 'owner@example.com',
        automatic: false,
      },
      'same-key',
      'Test',
      'Evidence',
    );
    await expect(sending).rejects.toBeInstanceOf(DeliveryError);
    await expect(sending).rejects.toMatchObject({
      outcome,
      retryAfterMs: status === 429 ? 120000 : 0,
    });
  },
);

it('reads a named monthly budget without treating missing spend as zero', async () => {
  const adapter = new Integrations(
    new ConfigReader({
      opsCompass: { costs: { accountId: '000000000000', budgetName: 'test' } },
    }),
  );
  budgetsSend.mockResolvedValue({
    Budget: {
      BudgetName: 'test',
      BudgetType: 'COST',
      TimeUnit: 'MONTHLY',
      BudgetLimit: { Amount: '50', Unit: 'USD' },
      CalculatedSpend: { ActualSpend: { Amount: '12.34', Unit: 'USD' } },
      LastUpdatedTime: new Date('2026-01-01T00:00:00Z'),
    },
  });
  expect(await adapter.budget()).toMatchObject({
    actual: 12.34,
    forecast: null,
    currency: 'USD',
    limit: 50,
  });
  expect(budgetsSend.mock.calls[0][0].input).toEqual({
    AccountId: '000000000000',
    BudgetName: 'test',
  });
  budgetsSend.mockRejectedValueOnce(new Error('Access denied'));
  await expect(adapter.budget()).rejects.toThrow();
});

it('encodes project/ref, rejects redirects and does not expose a token in results', async () => {
  const fetcher = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        sha: 'abcdef1234567',
        status: 'success',
        web_url: 'https://gitlab.example.com/team/project/-/pipelines/1',
        updated_at: new Date().toISOString(),
      }),
    ),
  );
  const adapter = new Integrations(
    new ConfigReader({
      opsCompass: {
        gitlab: {
          baseUrl: 'https://gitlab.example.com',
          token: 'test-only-value',
          projects: [
            {
              projectId: 'team/project',
              serviceId: 'worker',
              ref: 'feature/test',
            },
          ],
        },
      },
    }),
    fetcher,
  );
  const output = await adapter.deployments();
  expect(String(fetcher.mock.calls[0][0])).toContain('team%2Fproject');
  expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  expect(JSON.stringify(output)).not.toContain('test-only-value');
});

it('keeps Resend configuration server-side and uses a fixed HTTPS endpoint with idempotency', async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValue(new Response('{"id":"provider-id"}'));
  const adapter = new Integrations(
    new ConfigReader({
      opsCompass: { notifications: { resendApiKey: 'not-a-real-key' } },
    }),
    fetcher,
  );
  await adapter.send(
    {
      provider: 'resend',
      sender: 'alerts@example.com',
      recipient: 'owner@example.com',
      automatic: false,
    },
    'request-id',
    'Test',
    'Plain text',
  );
  expect(fetcher.mock.calls[0][0]).toBe('https://api.resend.com/emails');
  expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(
    'request-id',
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    from: 'alerts@example.com',
    to: ['owner@example.com'],
    subject: 'Test',
    text: 'Plain text',
  });
});

it('checks SNS subscription pages and publishes only to the configured topic', async () => {
  const adapter = new Integrations(
    new ConfigReader({
      opsCompass: {
        notifications: {
          snsTopicArn: 'arn:aws:sns:eu-west-1:000000000000:test',
          snsRegion: 'eu-west-1',
        },
      },
    }),
  );
  snsSend
    .mockResolvedValueOnce({
      Subscriptions: [
        { Protocol: 'email', SubscriptionArn: 'PendingConfirmation' },
      ],
      NextToken: 'next',
    })
    .mockResolvedValueOnce({
      Subscriptions: [
        { Protocol: 'email', SubscriptionArn: 'arn:subscription' },
      ],
    });
  expect(await adapter.subscriptions()).toEqual({
    status: 'available',
    confirmed: 1,
    pending: 1,
  });
  snsSend.mockResolvedValueOnce({ MessageId: 'accepted' });
  await adapter.send(
    { provider: 'sns', sender: '', recipient: '', automatic: false },
    'id',
    'Test',
    'Message',
  );
  expect(snsSend.mock.calls[2][0].input.TopicArn).toBe(
    'arn:aws:sns:eu-west-1:000000000000:test',
  );
});

it.each([
  [403, 'AuthorizationErrorException', 'rejected'],
  [400, 'KMSThrottlingException', 'retryable'],
  [500, 'InternalErrorException', 'uncertain'],
] as const)(
  'classifies SNS HTTP %s without SDK publish retries',
  async (status, name, outcome) => {
    const adapter = new Integrations(
      new ConfigReader({
        opsCompass: {
          notifications: {
            snsTopicArn: 'arn:aws:sns:eu-west-1:000000000000:test',
            snsRegion: 'eu-west-1',
          },
        },
      }),
    );
    snsSend.mockRejectedValueOnce({
      name,
      $metadata: { httpStatusCode: status },
      message: 'private upstream text',
    });
    await expect(
      adapter.send(
        { provider: 'sns', sender: '', recipient: '', automatic: false },
        'id',
        'Test',
        'Evidence',
      ),
    ).rejects.toMatchObject({ outcome });
    expect(snsSend).toHaveBeenCalledTimes(1);
    adapter.close();
  },
);
