import { SignInPage } from '@backstage/core-components';
import {
  configApiRef,
  gitlabAuthApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';

export const signInModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    SignInPageBlueprint.make({
      params: {
        loader: async () => props => {
          const config = useApi(configApiRef);
          const production =
            config.getOptionalString('auth.environment') === 'production';
          return (
            <SignInPage
              {...props}
              providers={
                production
                  ? [
                      {
                        id: 'gitlab-auth-provider',
                        title: 'GitLab',
                        message:
                          'Sign in with your registered GitLab identity.',
                        apiRef: gitlabAuthApiRef,
                      },
                    ]
                  : ['guest']
              }
            />
          );
        },
      },
    }),
  ],
});
