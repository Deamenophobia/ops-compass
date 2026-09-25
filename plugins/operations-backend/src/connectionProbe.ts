import { execFile } from 'node:child_process';
import { Config } from '@backstage/config';
import { z } from 'zod/v3';
import {
  ConnectionCheck,
  ConnectionDraft,
  ConnectionTestInput,
} from '@ops-compass/operations-common';

export type ProbeResult = {
  stdout: string;
  stderr: string;
  code: string | number;
  timedOut?: boolean;
};
export type ProbeRunner = (
  file: 'aws' | 'ssh',
  args: string[],
  signal: AbortSignal,
  input?: string,
) => Promise<ProbeResult>;

export const runProbe: ProbeRunner = (file, args, signal, input) =>
  new Promise(resolve => {
    // Executables and remote programs are fixed here. Neither filenames, commands,
    // endpoint URLs nor SSH options can be supplied by a browser request.
    const child = execFile(
      file,
      args,
      {
        timeout: 8000,
        maxBuffer: 65536,
        windowsHide: true,
        signal,
        env: {
          ...process.env,
          AWS_PAGER: '',
          AWS_CLI_AUTO_PROMPT: 'off',
          AWS_MAX_ATTEMPTS: '1',
        },
      },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          code: error?.code ?? 0,
          timedOut: error?.killed || signal.aborted,
        });
      },
    );
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(input);
  });

const policySchema = z
  .object({
    enabled: z.boolean().default(false),
    aws: z
      .array(
        z
          .object({
            profile: z.string(),
            expectedAccountId: z.string().regex(/^\d{12}$/),
            regions: z.array(z.string()).min(1),
          })
          .strict(),
      )
      .default([]),
    sshAliases: z.array(z.string()).default([]),
  })
  .strict();

function failed(target: string, result: ProbeResult): ConnectionCheck {
  // Raw tool output can contain account paths, identities and credentials. Only
  // these fixed diagnostic categories cross the API or persistence boundary.
  let detail =
    'Connection check failed. Review the server-side client configuration and network access.';
  if (result.code === 'ENOENT')
    detail =
      'Required AWS CLI or SSH executable is not installed on the backend PATH.';
  else if (result.timedOut)
    detail = 'The check timed out or was cancelled; access is unverified.';
  else if (
    /ExpiredToken|InvalidClientTokenId|Unable to locate credentials|SSO session.*expired/i.test(
      result.stderr,
    )
  )
    detail =
      'Credentials are missing or expired. Authenticate the backend client and retry.';
  else if (/Host key verification failed/i.test(result.stderr))
    detail =
      'SSH host-key verification failed. Verify the expected host key outside the portal before retrying.';
  else if (/Permission denied/i.test(result.stderr))
    detail =
      'SSH authentication failed. Review the approved alias and backend client identity.';
  else if (/UnauthorizedOperation|AccessDenied/i.test(result.stderr))
    detail =
      'AWS access was denied. Review the configured identity and required read permission.';
  return { target, status: 'failed', detail };
}

export class ConnectionProbe {
  readonly mode: 'disabled' | 'live' | 'simulated';
  private readonly policy: z.infer<typeof policySchema>;
  constructor(config: Config, private readonly runner: ProbeRunner = runProbe) {
    this.policy = policySchema.parse(
      config.getOptional('opsCompass.connections.testing') ?? {},
    );
    // Demo is a hard boundary even if a live testing overlay is supplied by mistake.
    this.mode = this.policy.enabled ? 'live' : 'disabled';
    if (config.getString('opsCompass.mode') === 'demo') this.mode = 'simulated';
  }

  async test(
    draft: ConnectionDraft,
    signal: AbortSignal,
    scenario: ConnectionTestInput['scenario'] = 'success',
  ): Promise<ConnectionCheck[]> {
    if (this.mode === 'simulated')
      return [
        {
          target:
            draft.kind === 'aws'
              ? 'AWS identity and regional access'
              : 'SSH authentication and prerequisites',
          status: scenario === 'success' ? 'passed' : 'failed',
          detail: {
            success:
              'Simulation: checks passed. No cloud or SSH request was sent.',
            denied:
              'Simulation: access denied. No cloud or SSH request was sent.',
            unreachable:
              'Simulation: target unreachable. No cloud or SSH request was sent.',
          }[scenario],
        },
      ];
    if (this.mode === 'disabled')
      return [
        {
          target: 'Testing policy',
          status: 'blocked',
          detail:
            'Live testing is disabled. An administrator must enable approved targets in backend configuration.',
        },
      ];
    const allowed =
      draft.kind === 'aws'
        ? this.policy.aws.some(
            binding =>
              binding.profile === draft.profile &&
              binding.expectedAccountId === draft.expectedAccountId &&
              draft.regions.every(region => binding.regions.includes(region)),
          )
        : draft.targets.every(target =>
            this.policy.sshAliases.includes(target.sshAlias),
          );
    // Check the complete target set before the first subprocess, including STS.
    if (!allowed)
      return [
        {
          target: 'Testing policy',
          status: 'blocked',
          detail:
            'This profile or target set is not approved for backend testing. Ask the administrator to configure the exact account, regions or SSH aliases.',
        },
      ];
    const results: ConnectionCheck[] = [];
    const execute = async (
      file: 'aws' | 'ssh',
      args: string[],
      input?: string,
    ) => {
      if (signal.aborted)
        return { stdout: '', stderr: '', code: 'ABORT_ERR', timedOut: true };
      return this.runner(file, args, signal, input);
    };
    if (draft.kind === 'aws') {
      const prefix = draft.profile ? ['--profile', draft.profile] : [];
      const options = [
        '--output',
        'json',
        '--no-cli-pager',
        '--no-cli-auto-prompt',
        '--cli-connect-timeout',
        '5',
        '--cli-read-timeout',
        '5',
      ];
      const identity = await execute('aws', [
        ...prefix,
        'sts',
        'get-caller-identity',
        '--region',
        draft.regions[0],
        '--query',
        'Account',
        ...options,
      ]);
      if (identity.code !== 0) return [failed('AWS identity', identity)];
      let account;
      try {
        account = JSON.parse(identity.stdout);
      } catch {
        /* malformed output is unverified */
      }
      if (account !== draft.expectedAccountId)
        return [
          {
            target: 'AWS identity',
            status: 'failed',
            detail:
              'The returned AWS account does not match the expected account. No EC2 permission checks were attempted.',
          },
        ];
      results.push({
        target: 'AWS identity',
        status: 'passed',
        detail: 'The authenticated AWS account matches the saved profile.',
      });
      for (const region of draft.regions) {
        const result = await execute('aws', [
          ...prefix,
          'ec2',
          'describe-instances',
          '--region',
          region,
          '--dry-run',
          '--page-size',
          '5',
          ...options,
        ]);
        // AWS reports an authorized dry run as a nonzero DryRunOperation error.
        results.push(
          !result.timedOut && /\(DryRunOperation\)/.test(result.stderr)
            ? {
                target: region,
                status: 'passed',
                detail:
                  'EC2 DescribeInstances permission verified by dry run. No inventory was collected.',
              }
            : failed(region, result),
        );
      }
    } else {
      for (const target of draft.targets) {
        const program = [
          'import json, sys, subprocess',
          'result = {"python": sys.version_info[0]}',
          ...(target.checkDocker
            ? [
                'try:',
                '    result["docker"] = subprocess.run(["docker", "ps", "--format", "{{.ID}}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3).returncode == 0',
                'except (OSError, subprocess.SubprocessError):',
                '    result["docker"] = False',
              ]
            : []),
          'print(json.dumps(result))',
        ].join('\n');
        const result = await execute(
          'ssh',
          [
            '-T',
            '-S',
            'none',
            '-o',
            'BatchMode=yes',
            '-o',
            'StrictHostKeyChecking=yes',
            '-o',
            'ConnectTimeout=5',
            '-o',
            'ConnectionAttempts=1',
            '-o',
            'ClearAllForwardings=yes',
            '-o',
            'ForwardAgent=no',
            '-o',
            'ForwardX11=no',
            '-o',
            'PermitLocalCommand=no',
            target.sshAlias,
            'python3',
            '-',
          ],
          program,
        );
        if (result.code !== 0) {
          results.push(failed(target.sshAlias, result));
          continue;
        }
        let facts;
        try {
          facts = JSON.parse(result.stdout);
        } catch {
          /* treat non-JSON shell output as a failed probe */
        }
        results.push(
          facts?.python === 3 && (!target.checkDocker || facts.docker === true)
            ? {
                target: target.sshAlias,
                status: 'passed',
                detail: `SSH authentication and Python 3 verified${
                  target.checkDocker
                    ? '; Docker listing access also verified'
                    : ''
                }. Application health was not checked.`,
              }
            : {
                target: target.sshAlias,
                status: 'failed',
                detail:
                  'SSH returned unexpected output or the required Python/Docker prerequisite was unavailable.',
              },
        );
      }
    }
    return results;
  }
}
