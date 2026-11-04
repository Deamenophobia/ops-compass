import { createRouteRef } from '@backstage/frontend-plugin-api';

// Keep references independent of plugin.tsx to avoid cycles in lazy page imports.
export const operationsRoutes = {
  root: createRouteRef(),
  agent: createRouteRef(),
  features: createRouteRef(),
  connections: createRouteRef(),
  inventory: createRouteRef(),
  kubernetes: createRouteRef(),
  dependencies: createRouteRef(),
  workspace: createRouteRef(),
};
