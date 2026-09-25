import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { ThemeBlueprint } from '@backstage/plugin-app-react';
import {
  createBaseThemeOptions,
  createUnifiedTheme,
  defaultTypography,
  palettes,
  UnifiedThemeProvider,
} from '@backstage/theme';
import WbSunnyIcon from '@material-ui/icons/WbSunny';

const fontFamily =
  'ui-rounded, "Segoe UI", "Arial Rounded MT Bold", sans-serif';

// UnifiedTheme keeps the older Material UI plugins and newer Backstage plugins
// on the same palette. Page-specific layout belongs in the operations plugin.
const softTheme = createUnifiedTheme({
  ...createBaseThemeOptions({
    palette: {
      ...palettes.light,
      primary: { main: '#70509a' },
      secondary: { main: '#36756a' },
      background: { default: '#faf7f2', paper: '#fffefd' },
      text: { primary: '#3d354b', secondary: '#6c6278' },
      navigation: {
        background: '#fffdf9',
        indicator: '#9270b6',
        color: '#71647d',
        selectedColor: '#563a7a',
        navItem: { hoverBackground: '#f4edf9' },
      },
      border: '#e7dfeb',
      divider: '#e7dfeb',
      link: '#65448e',
      linkHover: '#4b306f',
      tabbar: { indicator: '#8e69b3' },
    },
    typography: {
      ...defaultTypography,
      fontFamily,
      h1: { fontSize: 36, fontWeight: 750, marginBottom: 12 },
      h2: { fontSize: 30, fontWeight: 750, marginBottom: 12 },
      h3: { fontSize: 32, fontWeight: 750, marginBottom: 8 },
      h4: { fontSize: 26, fontWeight: 700, marginBottom: 8 },
      h5: { fontSize: 23, fontWeight: 700, marginBottom: 8 },
      h6: { fontSize: 19, fontWeight: 700, marginBottom: 6 },
    },
  }),
  fontFamily,
  defaultPageTheme: 'home',
  pageTheme: {
    home: {
      colors: ['#f1eafb', '#eef5ed'],
      shape: '',
      backgroundImage: 'linear-gradient(115deg, #f1eafb, #f8f0e7 60%, #eef5ed)',
      fontColor: '#3d354b',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 22 },
        elevation1: {
          boxShadow: '0 4px 0 #eee7f0',
          border: '1px solid #e7dfeb',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          textTransform: 'none',
          fontWeight: 700,
          padding: '9px 18px',
        },
        contained: { boxShadow: '0 3px 0 #d5c5e7' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: '#eee7f6',
          color: '#594273',
        },
        label: { fontWeight: 600 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 14, backgroundColor: '#fffefd' },
      },
    },
    MuiLink: { styleOverrides: { root: { textUnderlineOffset: 3 } } },
    BackstageHeader: {
      styleOverrides: {
        header: {
          boxShadow: 'none',
          padding: '28px 32px',
          borderBottom: '1px solid #e7dfeb',
          minHeight: 150,
        },
        title: { color: '#3d354b' },
        subtitle: { color: '#65586f', opacity: 1 },
      },
    },
    BackstageSidebar: {
      styleOverrides: { drawer: { borderRight: '1px solid #e7dfeb' } },
    },
    BackstageSidebarItem: {
      styleOverrides: {
        root: { borderRadius: '0 16px 16px 0', margin: '3px 0' },
        selected: { backgroundColor: '#eee5f7' },
        label: { fontWeight: 650 },
      },
    },
  },
});

export const softThemeModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    ThemeBlueprint.make({
      name: 'soft',
      params: {
        theme: {
          id: 'soft',
          title: 'Soft daylight',
          variant: 'light',
          icon: <WbSunnyIcon />,
          Provider: ({ children }) => (
            <UnifiedThemeProvider theme={softTheme}>
              {children}
            </UnifiedThemeProvider>
          ),
        },
      },
    }),
  ],
});
