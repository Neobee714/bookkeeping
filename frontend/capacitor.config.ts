import type { CapacitorConfig } from '@capacitor/cli';

const liveReloadUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.neobee.bookkeeping',
  appName: '金流',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
      resetWhenUpdate: false,
    },
  },
  ...(liveReloadUrl
    ? {
        server: {
          url: liveReloadUrl,
          cleartext: true,
        },
      }
    : {}),
};

export default config;
