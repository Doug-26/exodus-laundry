import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.exodus.laundry',
  appName: 'Exodus Laundry',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
};

export default config;
