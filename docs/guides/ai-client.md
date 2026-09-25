# Model client and evidence checks

The portal supplies three read-only MCP tools. `scripts/ask-agent.mjs` is an optional
external client: it connects through the real MCP SDK, fetches evidence and can send
that context to the OpenAI Responses API for a cited draft. No training is involved.
The portal never receives the model API key and the client cannot execute remediation.

## First verify the connection without a model

Start the portal with `scripts/start-preview.ps1 -AgentAccess`. Its rotating token
is written only to the ignored `private/agent-client.local.json`. Then:

```sh
node scripts/ask-agent.mjs --context-only --intent incident --output private/context-NEW.local.json
```

The client accepts HTTPS endpoints or local loopback HTTP. It fails on a tool error
and never overwrites an earlier output. Inspect the private context before sharing
it: it can contain infrastructure names and operational summaries.

## Request a model draft

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in the external client's environment. Choose
a model that supports the Responses API and structured output; there is deliberately
no default model or spend assumption. The request sends the selected context to
OpenAI, uses `store: false`, caps output at 2,200 tokens and makes no automatic retries.
This setting does not replace the provider's data-retention policy.

```sh
node scripts/ask-agent.mjs --intent incident --observation YOUR_CURRENT_CHECK_ID --output private/incident-NEW.local.json
node scripts/ask-agent.mjs --intent worklog --observation YOUR_CURRENT_CHECK_ID --output private/worklog-draft-NEW.local.json
```

Omit `--observation` for all checks. The client abstains before calling a model if
evidence is empty, stale, future-dated, unknown or conflicting. An all-check request
can therefore abstain even when one selected check would be usable. Context expires
after one minute, including time spent generating a response.

Outputs separate facts, hypotheses, missing evidence and suggested checks. Every
fact must cite an observation in the supplied context; unknown citation IDs and
completed-action/verification fields are rejected. The client still cannot prove
that each model sentence is supported by its citation. Review the meaning, keep
synthetic sources labeled, and save only reviewed work through the normal worklog
form. No autonomous remediation, email, deployment or trading call is available.
See [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Evaluate before relying on it

```sh
node --test scripts/agent-model.test.mjs
```

The ten deterministic tests cover missing/stale/future/unknown/conflicting evidence,
expired context, invented citations, claimed actions, provider errors/refusals and
the request's no-tools/no-storage contract. These are client contract tests using
mocked responses, not a model-quality or prompt-injection resistance benchmark.
Run a separately recorded live evaluation with your chosen model/key before adopting
its suggestions. No API key was configured during the local implementation, so
live inference is not claimed. Existing MCP access works independently of this client.
