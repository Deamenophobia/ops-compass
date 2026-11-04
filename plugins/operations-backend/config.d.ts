export interface OperationsSettings {
  mode: 'unconfigured' | 'demo' | 'snapshot' | 'cloudwatch';
  demoFile?: string;
  demoScenarios?: Array<{
    id: string;
    title: string;
    description: string;
    file: string;
    unavailable?: boolean;
  }>;
  /** Initial optional modules; saved workspace choices take precedence. */
  features?: {
    defaults?: {
      dependencies?: boolean;
      kubernetes?: boolean;
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
  kubernetes?: { file: string; maxAgeSeconds?: number };
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
}

export interface Config {
  /** @visibility backend */
  opsCompass: OperationsSettings & {
    profile?: 'personal' | 'team';
    /** Bootstrap administrators for the existing personal workspace, on first migration only. */
    writers?: string[];
    workspaceSources?: Array<{
      workspaceId: string;
      settings: OperationsSettings;
    }>;
  };
}
