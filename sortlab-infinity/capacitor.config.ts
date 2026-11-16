import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sortlab.infinity',
  appName: 'SortLab Infinity',
  webDir: 'dist',
  backgroundColor: '#050507',
  android: {
    backgroundColor: '#050507',
    // Keep content out from under the status/navigation bars on Android 15+.
    adjustMarginsForEdgeToEdge: 'auto',
  },
};

export default config;
