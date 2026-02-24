import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.annaxiebot.scriptureScholar',
  appName: 'Scripture Scholar',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    // For production, use GitHub Pages URL
    // For dev, use localhost
    // androidScheme: 'https',
    // iosScheme: 'capacitor'
  },
  ios: {
    contentInset: 'always',
    scrollEnabled: true
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#6366f1',
      showSpinner: false
    }
  }
};

export default config;
