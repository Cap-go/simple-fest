import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.riderx.festivalscan',
  appName: 'Simple Festival',
  webDir: 'dist',
  plugins: {
    CameraPreview: {
      disableAudio: true,
    },
    CapacitorUpdater: {
      autoUpdate: true,
    },
  },
}

export default config
