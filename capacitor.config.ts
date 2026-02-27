import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gutenlib.voice',
  appName: 'Gutenlib Voice',
  webDir: 'out',
  bundledWebRuntime: false,
  server: {
    url: 'http://192.168.1.184:3000',
    cleartext: true,
    androidScheme: 'http',
  },
};

export default config;
