import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ezfest.app',
  appName: 'Ezfest',
  webDir: 'dist',
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
    },
    CameraPreview: {
      disableAudio: true,
    },
    CapacitorUpdater: {
      version: '1.0.0',
      autoUpdate: true,
    },
  },
}

export default config
