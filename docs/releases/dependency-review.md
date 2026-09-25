# Dependency review — 26 September 2026

The release audit uses `yarn npm audit --all --recursive --json`, including
development and transitive dependencies. It is a registry-advisory check, not a
complete assessment of exploitability or application security.

The initial lockfile reported 34 security advisories: 1 critical, 14 high,
18 moderate and 1 low. The reviewed lockfile reports **8 advisories: 7 moderate,
1 low, and no high or critical results**. Nineteen separate deprecation records
remain. See [the structured results](dependency-audit.json).

## Changes made

- Pin node-gyp 12.4.0 for root and injected build dependencies. It supports the
  tested Node 22.14 environment and uses the current tar 7 dependency. The old
  tar 6 path and incompatible node-gyp 13 injection are removed.
- Resolve adm-zip 0.6.0 to its 0.6.1 patch.
- Resolve PrismJS's legacy 1.27 selection to 1.30.0.
- Resolve all existing protobufjs 7 ranges to 7.6.6. Retain the separate 8.x
  dependency rather than forcing all consumers onto one major version.

These changes are part of the locked release input. Installation passes with the
existing React/Material UI peer warnings and optional cpu-features compiler failure.

## Remaining advisories

| Package | Remaining advisory |
| --- | --- |
| @octokit/plugin-paginate-rest | [Regular-expression denial of service](https://github.com/advisories/GHSA-h5c3-5r3r-rr8q) |
| @octokit/request | [Regular-expression denial of service](https://github.com/advisories/GHSA-rmvr-2pp2-xj38) |
| @octokit/request-error | [Regular-expression denial of service](https://github.com/advisories/GHSA-xx4v-prfh-6cgc) |
| file-type | [Malformed ASF input loop](https://github.com/advisories/GHSA-5v7r-6r5c-r473) |
| react-router | [Navigation URL handling](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), [SSR error deserialization](https://github.com/advisories/GHSA-337j-9hxr-rhxg) |
| uuid | [Buffer bounds checking](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| elliptic | [Cryptographic implementation concern](https://github.com/advisories/GHSA-848j-6mx2-7j84) |

The unresolved findings involve older transitive/API generations or a package
without a patched release. They are retained visibly rather than suppressed or
forced across major versions during this preview. The installed set is not
advisory-free, and this review does not claim these findings are unreachable.
Framework/provider upgrades and deployment-specific exposure review remain work
before broader hosting. Local examples bind to loopback and integrations begin
unconfigured; that is the intended evaluation scope of this preview.
