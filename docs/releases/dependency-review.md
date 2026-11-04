# Dependency review — 4 November 2026

The full registry audit (`yarn npm audit --all --recursive --json`) covers runtime,
development and transitive dependencies. It reports advisory records, not unique
packages or verified exploitable paths. See [structured results](dependency-audit.json).

The starting lockfile reported **88 advisories: 4 critical, 33 high, 37 moderate,
14 low**. After compatible updates it reports **13: 0 critical, 2 high, 9 moderate,
2 low**. This supersedes the September audit; newly published advisories make that
historical result unsuitable for assessing this candidate.

## Changes made

- Refresh affected compatible lockfile ranges, including catalog-backend 4.0.2,
  Azure identity/MSAL, DOMPurify, Handlebars, Hono and shell-quote.
- Update the MCP SDK pin to 1.32.0 and direct Zod pins to 4.6.7. Keep the shared
  Backstage Zod v3 compatibility imports aligned to avoid duplicate-type failures.
- Update catalog-model to 1.10.2, including the frontend's exact pin and compatible
  transitive ranges, plus compatible CLI auth/new module patches. These remove Zod
  3.25.76 from the lockfile. The earlier report's CLI-only attribution was incomplete:
  catalog-model 1.10.1 also retained that version. Audit parent lists are not an
  exhaustive dependency-path inventory.
- Resolve the federation plugin's exact undici 7.29.0 dependency to 7.30.1.
- Preserve the existing node-gyp, adm-zip, PrismJS and protobufjs resolutions and
  the three-day minimum package age setting.

Installation retains known React/Material UI peer warnings and the optional Windows
`cpu-features` compiler failure. Verification is recorded in
[release preparation](../guides/release-preparation.md).

## Remaining findings

| Package / severity | Required follow-up |
| --- | --- |
| [@graphql-tools/utils — high](https://github.com/advisories/GHSA-7mx3-vvmw-hjmv) | Versions 8.9.0/8.13.1 through mockttp and GraphQL schema dependencies. Upgrade their parents to a generation using patched utils (12.0.1 or later). |
| [basic-ftp — high](https://github.com/advisories/GHSA-c475-qrg2-pj4r) | get-uri retains 5.3.1; patched 6.2.1 is outside its current major range. Review the proxy/URI dependency upgrade. |
| @octokit/plugin-paginate-rest, request, request-error — moderate | Older Octokit generations remain; see advisory links and parent paths in the structured report. |
| file-type, glob, minimatch, react-router, uuid — moderate | Patched versions cross dependency/API generations. React Router has two advisory records. |
| deepmerge, elliptic — low | Retained transitive findings; review upstream remediation. |

## Exposure assessment for this preview

The two high findings are installed through production dependencies:
catalog/search backend → backend-openapi-utils → mockttp. They must not be
dismissed as absent merely because their intended use is testing.

- GraphQL utils is reached through mockttp/schema utilities. The advisory concerns
  merging attacker-controlled GraphQL results. This portal does not configure a
  GraphQL supergraph or Mockttp administrative server.
- basic-ftp is reached through mockttp → pac-proxy-agent → get-uri. Its vulnerable
  directory parser consumes a malicious FTP server's listing. This portal does not
  configure FTP/PAC sources.
- Inspection of backend-openapi-utils 0.7.2/0.7.3 separates the normal router export
  from `testUtils`, which imports and starts the Mockttp proxy. A fresh Node process
  importing the normal entry point loaded **zero** mockttp, GraphQL Tools, get-uri
  or basic-ftp modules in its CommonJS cache. This is a bounded entry-point check,
  not proof of unreachability throughout every dependency or future configuration.

The [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) no longer
matches an installed package version. However, Backstage and this application still
use `zod/v3` compatibility APIs. A bounded probe with 128 invalid array elements
and `.max(2)` produced 129 issues: length validation alone does not stop per-item
work in this API. No general resource-exhaustion fix is claimed. Existing operation
routes have explicit JSON body limits; observation files have byte limits before
schema validation. These limits do not prove every upstream catalog path bounded.

Accept these residual risks only for the documented local, trusted-input source
preview. Keep integrations unconfigured until reviewed, restrict catalog writers,
and assess request/rate limits before exposing an installation. Follow up on the
upstream proxy dependencies and compatibility validation before a hosted production
release. No finding is suppressed, no untested major override is forced, and this
record does not claim production readiness or an advisory-free installation.
