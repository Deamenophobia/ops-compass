import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import ExploreIcon from '@material-ui/icons/Explore';
import ExtensionIcon from '@material-ui/icons/Extension';
import WorkOutlineIcon from '@material-ui/icons/WorkOutline';
import CloudQueueIcon from '@material-ui/icons/CloudQueue';
import TuneIcon from '@material-ui/icons/Tune';
import AccountTreeIcon from '@material-ui/icons/AccountTree';
import { operationsRoutes } from './routes';
import { FeatureGate } from './features/FeatureContext';

// Each lazy page owns its themed Page/Header; suppress the additional native header.
const operationsPage = PageBlueprint.make({
  params: {
    noHeader: true,
    path: '/operations',
    routeRef: operationsRoutes.root,
    title: 'Operations',
    icon: <ExploreIcon />,
    loader: () => import('./OperationsPage').then(m => <m.OperationsPage />),
  },
});

const agentPage = PageBlueprint.make({
  name: 'agent',
  params: {
    noHeader: true,
    path: '/agent',
    routeRef: operationsRoutes.agent,
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
      name: 'dependencies',
      params: {
        noHeader: true,
        path: '/dependencies',
        routeRef: operationsRoutes.dependencies,
        title: 'Dependencies',
        icon: <AccountTreeIcon />,
        loader: () =>
          import('./dependencies/DependenciesPage').then(m => (
            <FeatureGate feature="dependencies">
              <m.DependenciesPage />
            </FeatureGate>
          )),
      },
    }),
    PageBlueprint.make({
      name: 'kubernetes',
      params: {
        noHeader: true,
        path: '/kubernetes',
        routeRef: operationsRoutes.kubernetes,
        title: 'Kubernetes',
        icon: <CloudQueueIcon />,
        loader: () =>
          import('./KubernetesPage').then(m => (
            <FeatureGate feature="kubernetes">
              <m.KubernetesPage />
            </FeatureGate>
          )),
      },
    }),
    PageBlueprint.make({
      name: 'features',
      params: {
        noHeader: true,
        path: '/features',
        routeRef: operationsRoutes.features,
        title: 'Workspace features',
        icon: <TuneIcon />,
        loader: () =>
          import('./features/FeaturesPage').then(m => <m.FeaturesPage />),
      },
    }),
    PageBlueprint.make({
      name: 'connections',
      params: {
        noHeader: true,
        path: '/connections',
        routeRef: operationsRoutes.connections,
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
        noHeader: true,
        path: '/inventory',
        routeRef: operationsRoutes.inventory,
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
        noHeader: true,
        path: '/workspace',
        routeRef: operationsRoutes.workspace,
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
  routes: operationsRoutes,
});
