import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
import { WorkspaceProvider, useWorkspaces } from '@ops-compass/plugin-core';
import { ReactNode } from 'react';
import { FeatureProvider } from '@ops-compass/plugin-operations';

function WorkspaceFeatures({ children }: { children: ReactNode }) {
  const { selectedId, data } = useWorkspaces();
  return (
    <FeatureProvider key={`${data?.userEntityRef ?? 'pending'}:${selectedId}`}>
      {children}
    </FeatureProvider>
  );
}
function Providers({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <WorkspaceFeatures>{children}</WorkspaceFeatures>
    </WorkspaceProvider>
  );
}

export const featuresModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    AppRootWrapperBlueprint.make({
      name: 'workspace-features',
      params: { component: Providers },
    }),
  ],
});
