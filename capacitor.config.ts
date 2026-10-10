import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ee.forgr.festivalscan',
  appName: 'Simple Festival',
  webDir: 'dist',
  plugins: {
    CameraPreview: {
      disableAudio: true,
    },
    CapacitorUpdater: {
      autoUpdate: true,
    },
    SplashScreen: {
      // Hidden from main.ts once Vue has mounted.
      launchAutoHide: false,
      backgroundColor: '#0f172a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    NativeAudio: {
      // Only short local scan sounds; skip the HLS player.
      hls: false,
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
}

export default config
