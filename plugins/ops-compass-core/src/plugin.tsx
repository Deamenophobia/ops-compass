import {
  createFrontendPlugin,
  createRouteRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import PeopleOutlineIcon from '@material-ui/icons/PeopleOutline';

export const corePlugin = createFrontendPlugin({
  pluginId: 'ops-compass-core',
  extensions: [
    PageBlueprint.make({
      params: {
        // WorkspacesPage already supplies its themed Backstage header.
        noHeader: true,
        path: '/workspaces',
        routeRef: createRouteRef(),
        title: 'Workspaces',
        icon: <PeopleOutlineIcon />,
        loader: () =>
          import('./WorkspacesPage').then(m => <m.WorkspacesPage />),
      },
    }),
  ],
});
