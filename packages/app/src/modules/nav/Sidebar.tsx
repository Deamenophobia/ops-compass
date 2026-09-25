import {
  Sidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarScrollWrapper,
  SidebarSpace,
} from '@backstage/core-components';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { SidebarLogo } from './SidebarLogo';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import { SidebarSearchModal } from '@backstage/plugin-search';
import { UserSettingsSignInAvatar } from '@backstage/plugin-user-settings';
import { useFeatures } from '@ops-compass/plugin-operations';

export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: function FeatureSidebar({ navItems }) {
      const features = useFeatures();
      const nav = navItems.withComponent(item => (
        <SidebarItem icon={() => item.icon} to={item.href} text={item.title} />
      ));

      // Search uses the modal above the main navigation, so omit its page link.
      nav.take('page:search');
      const optional = {
        workspace: nav.take('page:operations/workspace'),
        inventory: nav.take('page:operations/inventory'),
        connections: nav.take('page:operations/connections'),
        agent: nav.take('page:operations/agent'),
      };
      const settings = nav.take('page:operations/features');
      // Reserve settings before rest() consumes the remaining navigation items.
      const account = nav.take('page:user-settings');
      const developer = nav.take('page:app-visualizer');
      const docs = nav.take('page:techdocs');

      return (
        <Sidebar>
          <SidebarLogo />
          <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
            <SidebarSearchModal />
          </SidebarGroup>
          <SidebarDivider />
          <SidebarGroup label="Menu" icon={<MenuIcon />}>
            {nav.take('page:operations')}
            {features.workspace && optional.workspace}
            {features.enabled('inventory') && optional.inventory}
            {features.enabled('connections') && optional.connections}
            {features.enabled('agent') && optional.agent}
            {nav.take('page:catalog')}
            {docs}
            <SidebarDivider />
            <SidebarScrollWrapper>
              {nav.rest({ sortBy: 'title' })}
            </SidebarScrollWrapper>
          </SidebarGroup>
          <SidebarSpace />
          <SidebarDivider />
          <SidebarGroup
            label="Settings"
            icon={<UserSettingsSignInAvatar />}
            to="/settings"
          >
            {settings}
            {account}
            {developer}
          </SidebarGroup>
        </Sidebar>
      );
    },
  },
});
