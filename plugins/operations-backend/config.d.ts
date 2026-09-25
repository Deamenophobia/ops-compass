export interface Config {
  /** @visibility backend */
  opsCompass: {
    mode: 'unconfigured' | 'demo' | 'snapshot' | 'cloudwatch';
    demoFile?: string;
    demoScenarios?: Array<{
      id: string;
      title: string;
      description: string;
      file: string;
      unavailable?: boolean;
    }>;
    writers?: string[];
    /** Initial optional modules; saved workspace choices take precedence. */
    features?: {
      defaults?: {
        services?: boolean;
        inventory?: boolean;
        connections?: boolean;
        history?: boolean;
        worklogs?: boolean;
        notifications?: boolean;
        costs?: boolean;
        maintenance?: boolean;
        agent?: boolean;
      };
    };
    connections?: {
      testing?: {
        enabled?: boolean;
        aws?: Array<{
          profile: string;
          expectedAccountId: string;
          regions: string[];
        }>;
        sshAliases?: string[];
      };
    };
    pollSeconds?: number;
    inventory?: { file: string; maxAgeSeconds?: number };
    gitlab?: {
      baseUrl: string;
      token: string;
      projects: Array<{ serviceId: string; projectId: string; ref?: string }>;
    };
    costs?: { accountId: string; budgetName: string };
    notifications?: {
      resendApiKey?: string;
      snsTopicArn?: string;
      snsRegion?: string;
    };
    maxAgeSeconds?: number;
    snapshotFile?: string;
    aws?: {
      region: string;
      alarms: Array<{
        name: string;
        id: string;
        label: string;
        entityRef: string;
        environment: string;
      }>;
    };
  };
}
