# Engineering guide

This guide describes the engineering practices used by Ops Compass.

1. Describe the user behavior, failure behavior, and evidence needed before coding.
2. Complete the connection from frontend to backend to data source and documentation.
3. Test meaningful boundaries: authentication, stale data, source failure, invalid
   configuration, and external-service behavior. A green test is not a live deployment.
4. Keep commands, credentials, and operations server-side. Prefer explicit targets.
5. Separate public examples from private inventory, configuration, and raw evidence.
6. Record decisions with reasons and tradeoffs. Write worklogs as evidence, including
   failed attempts and limits. Never describe planned features as complete.
7. Keep dependencies pinned by lockfile. Review upgrades and run affected checks.
8. Make ordinary local development autonomous. Identify production target, cost,
   rollback, and verification before introducing consequential operational changes.

## Documentation and code notes

Keep the README short: what to run, where to open the portal, and the main things
to do. Put framework explanations, architecture and detailed instructions in the
handbook. The versioned documentation is the public reference.

Use comments for decisions that a future reader could reasonably get wrong:
freshness precedence, authentication boundaries, error redaction, request cleanup,
fixed SSH commands and atomic snapshot writes. Use docstrings on key entry points.
Avoid comments that merely repeat a variable name or obvious statement. Update
notes with the code, and use the [code walkthrough](guides/code-walkthrough.md)
for explanations that cross several files.

## Definition of done

The feature works through its real interface, meaningful checks pass, documentation
matches the behavior, and known limitations are recorded with a source revision.
Provider mocks verify a contract; they do not establish actual credentials or delivery.

## Log entry

Date, intent, changes, decisions, verification commands and results, remaining gaps,
and next action. Add source revision and runtime environment when available.

## Decision entry

Context → decision → alternatives considered → consequences → evidence that would
cause a revisit. Do not create layers of approvals for reversible solo development.
