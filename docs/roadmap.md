# Roadmap

The current preview includes configurable observations, AWS/SSH setup, persistent
work records, an email outbox, cost awareness and a read-only MCP interface.
See the [release notes](releases/preview.md) for verification and limits.

Potential follow-up work is driven by actual use:

- Verify selected user-configured AWS, OAuth and email routes in their deployment environments.
- Expand platform verification beyond the current Windows/Node 22 fresh-install check.
- Review framework and dependency upgrades while preserving existing failure semantics.
- Improve collection scheduling guidance and operational history retention.
- Evaluate external model answers for unsupported claims, stale evidence and hostile source text.
- Assess multi-instance storage only when a deployment needs it.

These are possible future changes, not shipped capabilities. No autonomous
remediation or trading control is part of the current project.
