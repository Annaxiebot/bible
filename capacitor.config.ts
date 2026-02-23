import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.annaxie.bible',
  appName: 'Anna Bible',
  webDir: 'dist',
  server: {
    // For development, you can use a live reload URL:
    // url: 'http://YOUR_LOCAL_IP:3000/bible/',
    // cleartext: true,
  },
};

export default config;
