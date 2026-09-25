import { z } from 'zod/v3';

const alias = z
  .string()
  .trim()
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/,
    'Use 1–64 letters, numbers or hyphens, starting with a letter or number.',
  );
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      value =>
        [...value].every(
          char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
        ),
      'Use a single line without control characters.',
    );
const directory = text(500)
  .refine(
    value => /^(\/|[a-zA-Z]:[\\/])/.test(value),
    'Use an absolute directory on the portal backend.',
  )
  .refine(
    value => !value.includes('${'),
    'Use a literal path, without environment substitutions.',
  );

export const connectionDraftSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('aws'),
      snapshotDirectory: directory,
      expectedAccountId: z
        .string()
        .trim()
        .regex(/^\d{12}$/, 'Enter the expected 12-digit AWS account ID.'),
      regions: z
        .array(
          z
            .string()
            .trim()
            .regex(/^[a-z]{2}(-[a-z]+)+-\d$/, 'Use an AWS region code.'),
        )
        .min(1)
        .max(20)
        .refine(
          values => new Set(values).size === values.length,
          'Remove duplicate regions.',
        ),
      profile: z
        .string()
        .trim()
        .max(128)
        .regex(
          /^(?:[a-zA-Z0-9][a-zA-Z0-9_.-]*)?$/,
          'Use a profile name, or leave blank for the default credential chain.',
        ),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ssh'),
      snapshotDirectory: directory,
      targets: z
        .array(
          z
            .object({
              id: alias,
              sshAlias: alias,
              label: text(100),
              entityRef: z
                .string()
                .trim()
                .regex(
                  /^(resource|component|system):[a-z0-9-]+\/[a-z0-9-]+$/,
                  'Use kind:namespace/name, for example resource:default/my-server.',
                ),
              environment: text(40),
              region: text(40),
              checkDocker: z.boolean(),
              minimumRunning: z.number().int().min(1).max(10000),
            })
            .strict(),
        )
        .min(1)
        .max(20)
        .refine(
          targets =>
            new Set(targets.map(t => t.id.toLowerCase())).size ===
            targets.length,
          'Each server needs a unique ID.',
        )
        .refine(
          targets =>
            new Set(targets.map(t => t.sshAlias.toLowerCase())).size ===
            targets.length,
          'Each SSH alias should be listed once.',
        ),
    })
    .strict(),
]);

export type ConnectionDraft = z.infer<typeof connectionDraftSchema>;
export type ConnectionSetup = {
  collectorFilename: string;
  collectorJson: string;
  portalJson: string;
  command: string;
};

export function prepareConnection(input: unknown): ConnectionSetup {
  const draft = connectionDraftSchema.parse(input);
  const dir = draft.snapshotDirectory.replace(/\\/g, '/').replace(/\/+$/, '');
  const aws = draft.kind === 'aws';
  // The generated files contain references only. Preparing a draft cannot read
  // credentials, contact a host, or change the portal's active configuration.
  const collector = aws
    ? {
        expectedAccountId: draft.expectedAccountId,
        regions: draft.regions,
        ...(draft.profile ? { profile: draft.profile } : {}),
        serviceMappings: {},
      }
    : { targets: draft.targets };
  const opsCompass = aws
    ? {
        mode: 'unconfigured',
        inventory: { file: `${dir}/inventory.local.json`, maxAgeSeconds: 300 },
      }
    : {
        mode: 'snapshot',
        maxAgeSeconds: 300,
        snapshotFile: `${dir}/observations.local.json`,
      };
  return {
    collectorFilename: aws ? 'aws-inventory.local.json' : 'hosts.local.json',
    collectorJson: `${JSON.stringify(collector, null, 2)}\n`,
    // JSON is also valid YAML. Serialization keeps labels and paths as data.
    portalJson: `${JSON.stringify({ opsCompass }, null, 2)}\n`,
    // Never interpolate form input into an executable command.
    command: aws
      ? 'python scripts/collect-aws.py --mode api --config private/aws-inventory.local.json --output private/inventory.local.json'
      : 'python scripts/collect-ssh.py --config private/hosts.local.json --output private/observations.local.json',
  };
}
