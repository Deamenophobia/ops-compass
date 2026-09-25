import { readFile, stat } from 'node:fs/promises';
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  DescribeAlarmsOutput,
} from '@aws-sdk/client-cloudwatch';
import { Config } from '@backstage/config';
import {
  Snapshot,
  State,
  snapshotSchema,
} from '@ops-compass/operations-common';

export type SnapshotProvider = () => Promise<Snapshot>;

async function readSnapshot(file: string): Promise<Snapshot> {
  if ((await stat(file)).size > 1024 * 1024)
    throw new Error('Snapshot too large');
  return snapshotSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

export function demoProvider(
  file: string,
  now: () => Date = () => new Date(),
): SnapshotProvider {
  return async () => {
    const snapshot = await readSnapshot(file);
    if (snapshot.source !== 'demo')
      throw new Error('Demo mode requires synthetic observations');
    // Replay only explicit demo fixtures. Preserve relative ages so stale checks
    // stay stale across presentations; real observations are never time-shifted.
    const newest = Math.max(
      ...snapshot.observations.map(o => Date.parse(o.observedAt)),
      ...(snapshot.services ?? []).map(s => Date.parse(s.observedAt)),
    );
    const shift = Number.isFinite(newest) ? now().getTime() - newest : 0;
    const replayTime = (value: string) =>
      new Date(Date.parse(value) + shift).toISOString();
    return {
      ...snapshot,
      observations: snapshot.observations.map(o => ({
        ...o,
        observedAt: replayTime(o.observedAt),
        ...(o.stateChangedAt && {
          stateChangedAt: replayTime(o.stateChangedAt),
        }),
      })),
      services: snapshot.services?.map(service => ({
        ...service,
        observedAt: replayTime(service.observedAt),
        containers: service.containers.map(container => ({
          ...container,
          observedAt: replayTime(container.observedAt),
          startedAt: container.startedAt && replayTime(container.startedAt),
        })),
        heartbeat: service.heartbeat && {
          ...service.heartbeat,
          lastSeenAt:
            service.heartbeat.lastSeenAt &&
            replayTime(service.heartbeat.lastSeenAt),
        },
        certificate: service.certificate && {
          ...service.certificate,
          checkedAt: replayTime(service.certificate.checkedAt),
          expiresAt:
            service.certificate.expiresAt &&
            replayTime(service.certificate.expiresAt),
        },
      })),
      deployments: snapshot.deployments?.map(deployment => ({
        ...deployment,
        observedAt: replayTime(deployment.observedAt),
        updatedAt: replayTime(deployment.updatedAt),
      })),
      budget: snapshot.budget && {
        ...snapshot.budget,
        observedAt: replayTime(snapshot.budget.observedAt),
      },
    };
  };
}

export function fileProvider(file: string): SnapshotProvider {
  // The path comes from backend configuration, never from an HTTP/MCP argument.
  // Parse every read because the collector atomically replaces this file.
  return async () => {
    const snapshot = await readSnapshot(file);
    if (snapshot.source !== 'ssh')
      throw new Error('Snapshot mode requires SSH observations');
    return snapshot;
  };
}

export type AlarmTarget = {
  name: string;
  id: string;
  label: string;
  entityRef: string;
  environment: string;
};
export interface AlarmReader {
  send(
    command: DescribeAlarmsCommand,
    options?: { abortSignal: AbortSignal },
  ): Promise<DescribeAlarmsOutput>;
}

export function cloudWatchProvider(
  reader: AlarmReader,
  region: string,
  targets: AlarmTarget[],
  now: () => Date = () => new Date(),
): SnapshotProvider {
  if (
    !targets.length ||
    targets.length > 100 ||
    new Set(targets.map(t => t.name)).size !== targets.length
  ) {
    throw new Error('Configure 1 to 100 unique metric alarms');
  }
  return async () => {
    const alarms: NonNullable<DescribeAlarmsOutput['MetricAlarms']> = [];
    let nextToken: string | undefined;
    const signal = AbortSignal.timeout(10_000);
    for (let page = 0; page < 10; page++) {
      const result = await reader.send(
        new DescribeAlarmsCommand({
          AlarmNames: targets.map(t => t.name),
          AlarmTypes: ['MetricAlarm'],
          NextToken: nextToken,
        }),
        { abortSignal: signal },
      );
      alarms.push(...(result.MetricAlarms ?? []));
      nextToken = result.NextToken;
      if (!nextToken) break;
    }
    // Reject incomplete pagination rather than report a healthy partial result.
    if (nextToken) throw new Error('Incomplete CloudWatch response');
    // StateUpdatedTimestamp is a state-transition time, not the time of this read.
    const observedAt = now().toISOString();
    return snapshotSchema.parse({
      schemaVersion: 1,
      source: 'cloudwatch',
      observations: targets.map(target => {
        const alarm = alarms.find(a => a.AlarmName === target.name);
        let state: State = 'unknown';
        if (alarm?.StateValue === 'OK') state = 'healthy';
        else if (alarm?.StateValue === 'ALARM') state = 'critical';
        let summary =
          'Configured alarm was not returned; check region, name, and access.';
        if (alarm)
          summary =
            alarm.StateValue === 'INSUFFICIENT_DATA'
              ? 'CloudWatch reports insufficient data.'
              : `CloudWatch reports ${
                  alarm.StateValue ?? 'an unknown state'
                }. Notification delivery has not been verified by this read.`;
        return {
          id: target.id,
          label: target.label,
          entityRef: target.entityRef,
          environment: target.environment,
          region,
          observedAt,
          state,
          stateChangedAt: alarm?.StateUpdatedTimestamp?.toISOString(),
          // Do not copy raw alarm reasons, which can contain infrastructure details.
          summary,
        };
      }),
    });
  };
}

export function configuredProvider(config: Config): {
  provider: SnapshotProvider;
  close?: () => void;
  scenarios?: Array<{ id: string; title: string; description: string }>;
  activeScenario?: () => string;
  selectScenario?: (id: string) => void;
} {
  const mode = config.getString('opsCompass.mode');
  if (mode === 'unconfigured')
    return {
      provider: async () => ({
        schemaVersion: 1,
        source: 'none',
        observations: [],
      }),
    };
  if (mode === 'demo') {
    const entries =
      config.getOptionalConfigArray('opsCompass.demoScenarios') ?? [];
    const scenarios = entries.map(entry => ({
      id: entry.getString('id'),
      title: entry.getString('title'),
      description: entry.getString('description'),
    }));
    if (new Set(scenarios.map(s => s.id)).size !== scenarios.length)
      throw new Error('Duplicate scenario');
    let active = scenarios[0]?.id ?? 'default';
    let provider = demoProvider(
      entries[0]?.getString('file') ?? config.getString('opsCompass.demoFile'),
    );
    return {
      provider: () => provider(),
      scenarios,
      activeScenario: () => active,
      selectScenario: id => {
        const entry = entries.find(e => e.getString('id') === id);
        if (!entry) throw new Error('Unknown demo scenario');
        // Failure injection exists only in an explicitly configured demo scenario.
        provider = entry.getOptionalBoolean('unavailable')
          ? async () => {
              throw new Error('Simulated collector disconnection');
            }
          : demoProvider(entry.getString('file'));
        active = id;
      },
    };
  }
  if (mode === 'snapshot')
    return {
      provider: fileProvider(config.getString('opsCompass.snapshotFile')),
    };
  if (mode !== 'cloudwatch') throw new Error('Unsupported opsCompass.mode');
  const region = config.getString('opsCompass.aws.region');
  const targets = config.getConfigArray('opsCompass.aws.alarms').map(alarm => ({
    name: alarm.getString('name'),
    id: alarm.getString('id'),
    label: alarm.getString('label'),
    entityRef: alarm.getString('entityRef'),
    environment: alarm.getString('environment'),
  }));
  const client = new CloudWatchClient({ region, maxAttempts: 2 });
  return {
    provider: cloudWatchProvider(client, region, targets),
    close: () => client.destroy(),
  };
}
