import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.adka.maada',
  appName: 'Beeramarlara Maada',
  webDir: 'dist',
  android: {
    // The web app talks to the Vercel API over HTTPS only.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: { backgroundColor: '#3A1013', style: 'DARK', overlaysWebView: false },
  },
};

export default config;
