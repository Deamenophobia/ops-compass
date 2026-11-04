import {
  coreServices,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import { mockCredentials, mockServices } from '@backstage/backend-test-utils';

// Backstage 1.55's test service-token decoder drops the delegated user's actor.
// Its real permission registry requires that actor for apply-conditions. Keep the
// official mock user token format, adding the actor that real plugin tokens carry.
export const delegatedTestAuth = createServiceFactory({
  service: coreServices.auth,
  deps: { metadata: coreServices.pluginMetadata },
  async factory({ metadata }) {
    const auth = mockServices.auth({ pluginId: metadata.getId() });
    const issue = auth.getPluginRequestToken.bind(auth);
    auth.getPluginRequestToken = async options => {
      if (auth.isPrincipal(options.onBehalfOf, 'user')) {
        return {
          token: mockCredentials.user.token(
            options.onBehalfOf.principal.userEntityRef,
            { actor: { subject: `plugin:${metadata.getId()}` } },
          ),
        };
      }
      return issue(options);
    };
    return auth;
  },
});
