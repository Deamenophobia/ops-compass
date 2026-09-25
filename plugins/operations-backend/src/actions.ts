import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { NotAllowedError } from '@backstage/errors';
import {
  agentContextSchema,
  agentRequestSchema,
  overviewSchema,
  runbookIdSchema,
  runbookSchema,
} from '@ops-compass/operations-common';
import { EvidenceService, runbooks } from './agent';

// These are client hints. The fixed handlers and app-config action allowlist
// enforce the actual capabilities; adding a tool requires reviewing both.
const attributes = { readOnly: true, destructive: false, idempotent: true };

export function registerAgentActions(
  registry: ActionsRegistryService,
  evidence: EvidenceService,
  enabled = () => true,
) {
  const requireEnabled = () => {
    if (!enabled())
      throw new NotAllowedError(
        'AI agent interface is disabled in Workspace features.',
      );
  };
  registry.register({
    name: 'get-overview',
    title: 'Read operations evidence',
    description:
      'Read configured health observations with mode, source, timestamps and freshness. Demo is synthetic; stale and missing evidence are unknown. Does not reconnect SSH or execute commands.',
    attributes,
    schema: {
      input: z => z.object({}).strict(),
      output: z => z.object({ overview: overviewSchema }),
    },
    action: async () => {
      requireEnabled();
      return { output: { overview: await evidence.overview() } };
    },
  });
  registry.register({
    name: 'get-runbook',
    title: 'Read an operations runbook',
    description:
      'Read a curated health or email-alert checklist and a citation to the full handbook. Procedures are guidance, not proof that an action or delivery happened.',
    attributes,
    schema: {
      input: z => z.object({ id: runbookIdSchema }).strict(),
      output: z => z.object({ runbook: runbookSchema }),
    },
    action: async ({ input }) => {
      requireEnabled();
      return {
        output: { runbook: runbooks.find(r => r.id === input.id)! },
      };
    },
  });
  registry.register({
    name: 'prepare-context',
    title: 'Prepare cited incident or worklog context',
    description:
      'Assemble current evaluated evidence, citations, runbooks and a draft outline for an external model. Optional observationId scopes the evidence; unknown IDs fail. No model call, file write, or completed-work claim.',
    attributes,
    schema: {
      input: () => agentRequestSchema,
      output: () => agentContextSchema,
    },
    action: async ({ input }) => {
      requireEnabled();
      return { output: await evidence.context(input) };
    },
  });
}
