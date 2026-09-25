# Ops Compass backend

The backend wires Backstage authentication, catalog, search, TechDocs, user settings,
and the Operations plugin. Infrastructure access and MCP are read-only; authenticated
owners can save journal records and configure notifications. Start from the repository
root so configuration paths and the frontend/backend development processes are consistent.

```sh
node .yarn/releases/yarn-4.13.0.cjs start
```

See the root handbook for setup and verification. Guest identity and the in-memory
SQLite databases for the standard plugins are local development choices. Operations
uses a separate private SQLite file to retain its journal. Production identity,
database deployment and external TechDocs storage remain setup work; the Dockerfile
is not a deployment claim.
