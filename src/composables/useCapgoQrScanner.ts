import { CameraPreview, type BarcodeScannedEvent } from '@capgo/camera-preview'
import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { nextTick, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'

type ScannerSource = Ref<boolean> | ComputedRef<boolean>

type ListenerHandle = {
  remove: () => Promise<void>
}

type PreviewBounds = {
  x: number
  y: number
  width: number
  height: number
}

const duplicateWindowMs = 1600
const cameraTimeoutMs = 5000
const defaultPreviewSelector = '.scanner-stage'

export function useCapgoQrScanner(enabled: ScannerSource, onScan: (value: string) => void | Promise<void>, previewSelector = defaultPreviewSelector) {
  const active = ref(false)
  const error = ref<string | null>(null)
  const listeners = ref<ListenerHandle[]>([])
  let lastScan = { value: '', time: 0 }
  let task = Promise.resolve()

  function enqueue(nextTask: () => Promise<void>) {
    const next = task.catch(() => undefined).then(nextTask)
    task = next.catch(() => undefined)
    return next
  }

  async function removeListeners() {
    const current = listeners.value
    listeners.value = []
    await Promise.all(current.map((listener) => listener.remove().catch(() => undefined)))
  }

  async function stop() {
    await enqueue(async () => {
      await CameraPreview.stopBarcodeScanner().catch(() => undefined)
      await CameraPreview.stop().catch(() => undefined)
      await removeListeners()
      active.value = false
    })
  }

  async function start() {
    await enqueue(async () => {
      if (Capacitor.getPlatform() === 'web') {
        error.value = 'Native QR scan is available in the mobile app. Use manual input on web.'
        active.value = false
        return
      }

      if (!enabled.value || document.hidden || active.value) {
        return
      }

      error.value = null
      await removeListeners()
      await nextTick()

      const permission = await CameraPreview.requestPermissions({
        disableAudio: true,
        showSettingsAlert: true,
        title: 'Camera permission',
        message: 'Camera access is needed to scan festival QR codes.',
      })

      if (permission.camera !== 'granted') {
        throw new Error('Camera permission denied')
      }

      const barcodeHandle = await CameraPreview.addListener('barcodeScanned', (event: BarcodeScannedEvent) => {
        const value = event.barcodes.find((barcode) => barcode.value)?.value
        if (!value) {
          return
        }

        // A code held in front of the camera keeps refreshing the window, so it counts once until it leaves the frame.
        const now = Date.now()
        if (lastScan.value === value && now - lastScan.time < duplicateWindowMs) {
          lastScan.time = now
          return
        }

        lastScan = { value, time: now }
        void onScan(value)
      })
      const errorHandle = await CameraPreview.addListener('barcodeScanError', ({ message }) => {
        error.value = message
      })
      listeners.value = [barcodeHandle, errorHandle]

      await withTimeout(
        CameraPreview.start({
          parent: 'camera-preview',
          className: 'native-camera-preview',
          ...previewBounds(previewSelector),
          position: 'rear',
          toBack: true,
          aspectMode: 'cover',
          disableAudio: true,
          force: true,
          barcodeScanner: {
            formats: ['qr_code'],
            detectionInterval: 500,
          },
        }),
        cameraTimeoutMs,
      )
      active.value = true
    }).catch((scanError: unknown) => {
      error.value = scanError instanceof Error ? scanError.message : 'Camera scanner failed'
      active.value = false
    })
  }

  watch(
    enabled,
    (isEnabled) => {
      if (isEnabled) {
        void start()
      } else {
        void stop()
      }
    },
    { immediate: true },
  )

  function onVisibilityChange() {
    if (document.hidden) {
      void stop()
    } else if (enabled.value) {
      void start()
    }
  }

  // Release the camera when the phone locks or the app is backgrounded, and reopen it on return.
  document.addEventListener('visibilitychange', onVisibilityChange)
  const appListeners: Promise<PluginListenerHandle>[] = Capacitor.isNativePlatform()
    ? [
        App.addListener('pause', () => void stop()),
        App.addListener('resume', () => {
          if (enabled.value) void start()
        }),
      ]
    : []
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    for (const listener of appListeners) void listener.then((handle) => handle.remove())
    void stop()
  })

  return { active, error, start, stop }
}

function previewBounds(selector: string): PreviewBounds {
  const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
  if (!rect) {
    return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
  }

  return {
    x: Math.max(0, Math.round(rect.left)),
    y: Math.max(0, Math.round(rect.top)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('Camera preview timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
  }
}
