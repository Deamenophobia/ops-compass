# Applications and core packages

- `app/`: React application, Backstage plugin registration, navigation and theme.
- `backend/`: Node application that registers authentication and backend plugins.

- `ops-compass-core/`: browser-safe workspace contracts and permission definitions.
- `ops-compass-core-node/`: memberships, access checks and replaceable Backstage policy.

Domain behavior lives in `plugins/`. See the
[code walkthrough](../docs/guides/code-walkthrough.md) for request flows and checks.
