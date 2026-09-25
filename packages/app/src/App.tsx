import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { navModule } from './modules/nav';
import operationsPlugin from '@ops-compass/plugin-operations';
import { softThemeModule } from './theme/softTheme';
import { signInModule } from './modules/signIn';
import { featuresModule } from './modules/features';

export default createApp({
  features: [
    catalogPlugin,
    navModule,
    softThemeModule,
    signInModule,
    featuresModule,
    operationsPlugin,
  ],
});
