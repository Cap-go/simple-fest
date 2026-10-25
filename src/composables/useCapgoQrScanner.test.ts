import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, ref, type App as VueApp } from 'vue'
import { CameraPreview } from '@capgo/camera-preview'
import { useCapgoQrScanner } from './useCapgoQrScanner'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isNativePlatform: () => true },
}))
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })) },
}))
vi.mock('@capgo/camera-preview', () => ({
  CameraPreview: {
    requestPermissions: vi.fn(async () => ({ camera: 'granted' })),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    stopBarcodeScanner: vi.fn(async () => undefined),
    setPreviewSize: vi.fn(async () => undefined),
  },
}))

describe('native scanner resizing', () => {
  let app: VueApp
  let scanner: ReturnType<typeof useCapgoQrScanner>
  let bounds: { left: number; top: number; width: number; height: number }
  let notifyResize: () => void
  let pendingFrame: FrameRequestCallback | undefined
  const disconnect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    bounds = { left: 0, top: 0, width: 466, height: 678 }
    pendingFrame = undefined
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notifyResize = callback }
      observe = vi.fn()
      disconnect = disconnect
    })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      pendingFrame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { pendingFrame = undefined })
    const viewport = document.createElement('div')
    viewport.className = 'camera-viewport'
    viewport.getBoundingClientRect = () => bounds as DOMRect
    document.body.append(viewport)
    const container = document.createElement('div')
    document.body.append(container)
    app = createApp(defineComponent({
      setup() {
        scanner = useCapgoQrScanner(ref(true), vi.fn(), '.camera-viewport')
        return () => null
      },
    }))
    app.mount(container)
  })

  afterEach(async () => {
    app.unmount()
    await scanner.stop()
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function flushResize() {
    const callback = pendingFrame
    pendingFrame = undefined
    callback?.(0)
    await scanner.start()
  }

  it('remeasures after startup and follows outer to inner to outer resizing', async () => {
    bounds = { left: 0, top: 0, width: 669, height: 951 }
    await vi.waitFor(() => expect(scanner.active.value).toBe(true))
    await flushResize()
    expect(CameraPreview.setPreviewSize).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 669, height: 951 })
    bounds = { left: 0, top: 0, width: 466, height: 678 }
    notifyResize()
    await flushResize()
    expect(CameraPreview.setPreviewSize).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 466, height: 678 })
    expect(CameraPreview.start).toHaveBeenCalledTimes(1)
  })

  it('coalesces rotation updates and uses the latest layout bounds', async () => {
    await vi.waitFor(() => expect(scanner.active.value).toBe(true))
    await flushResize()
    vi.mocked(CameraPreview.setPreviewSize).mockClear()
    bounds = { left: 59, top: 0, width: 951, height: 669 }
    notifyResize()
    window.dispatchEvent(new Event('resize'))
    await flushResize()
    expect(CameraPreview.setPreviewSize).toHaveBeenCalledExactlyOnceWith({ x: 59, y: 0, width: 951, height: 669 })
  })

  it('disconnects and cancels pending updates when stopped', async () => {
    await vi.waitFor(() => expect(scanner.active.value).toBe(true))
    await scanner.stop()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(pendingFrame).toBeUndefined()
    window.dispatchEvent(new Event('resize'))
    expect(pendingFrame).toBeUndefined()
    expect(scanner.active.value).toBe(false)
  })
})
