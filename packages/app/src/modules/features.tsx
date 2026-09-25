import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
import { FeatureProvider } from '@ops-compass/plugin-operations';

export const featuresModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    AppRootWrapperBlueprint.make({
      name: 'workspace-features',
      params: { component: FeatureProvider },
    }),
  ],
});
