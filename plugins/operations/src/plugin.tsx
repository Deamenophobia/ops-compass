import {
  createFrontendPlugin,
  createRouteRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import ExploreIcon from '@material-ui/icons/Explore';
import ExtensionIcon from '@material-ui/icons/Extension';
import WorkOutlineIcon from '@material-ui/icons/WorkOutline';
import CloudQueueIcon from '@material-ui/icons/CloudQueue';
import TuneIcon from '@material-ui/icons/Tune';
import { FeatureGate } from './features/FeatureContext';

const rootRouteRef = createRouteRef();
const operationsPage = PageBlueprint.make({
  params: {
    path: '/operations',
    routeRef: rootRouteRef,
    title: 'Operations',
    icon: <ExploreIcon />,
    loader: () => import('./OperationsPage').then(m => <m.OperationsPage />),
  },
});

const agentRouteRef = createRouteRef();
const agentPage = PageBlueprint.make({
  name: 'agent',
  params: {
    path: '/agent',
    routeRef: agentRouteRef,
    title: 'Agent access',
    icon: <ExtensionIcon />,
    loader: () =>
      import('./AgentPage').then(m => (
        <FeatureGate feature="agent">
          <m.AgentPage />
        </FeatureGate>
      )),
  },
});

export const operationsPlugin = createFrontendPlugin({
  pluginId: 'operations',
  extensions: [
    PageBlueprint.make({
      name: 'features',
      params: {
        path: '/features',
        routeRef: createRouteRef(),
        title: 'Workspace features',
        icon: <TuneIcon />,
        loader: () =>
          import('./features/FeaturesPage').then(m => <m.FeaturesPage />),
      },
    }),
    PageBlueprint.make({
      name: 'connections',
      params: {
        path: '/connections',
        routeRef: createRouteRef(),
        title: 'Connections',
        icon: <CloudQueueIcon />,
        loader: () =>
          import('./ConnectionsPage').then(m => (
            <FeatureGate feature="connections">
              <m.ConnectionsPage />
            </FeatureGate>
          )),
      },
    }),
    PageBlueprint.make({
      name: 'inventory',
      params: {
        path: '/inventory',
        routeRef: createRouteRef(),
        title: 'AWS inventory',
        icon: <CloudQueueIcon />,
        loader: () =>
          import('./InventoryPage').then(m => (
            <FeatureGate feature="inventory">
              <m.InventoryPage />
            </FeatureGate>
          )),
      },
    }),
    operationsPage,
    agentPage,
    PageBlueprint.make({
      name: 'workspace',
      params: {
        path: '/workspace',
        routeRef: createRouteRef(),
        title: 'Workspace',
        icon: <WorkOutlineIcon />,
        loader: () =>
          import('./WorkspacePage').then(m => (
            <FeatureGate feature="workspace">
              <m.WorkspacePage />
            </FeatureGate>
          )),
      },
    }),
  ],
  routes: { root: rootRouteRef, agent: agentRouteRef },
});
