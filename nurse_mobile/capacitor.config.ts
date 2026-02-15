import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.healthbridge.app',
  appName: 'HealthBridge',
  webDir: '.output/public',
  server: {
    "androidScheme": "http",
    "cleartext": true
  }
};

export default config;
