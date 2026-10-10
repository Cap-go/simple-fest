import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Share } from '@capacitor/share'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { CapgoInAppReview } from '@capgo/capacitor-in-app-review'
import { KeepAwake } from '@capgo/capacitor-keep-awake'
import { NativeAudio } from '@capgo/native-audio'
import { toastController } from '@ionic/vue'
import { alertCircle, checkmarkCircle, informationCircle, warning } from 'ionicons/icons'
import type { ScanStatus } from '../domain/types'

const isNative = Capacitor.isNativePlatform()
const sounds = {
  ok: 'assets/sounds/scan-ok.wav',
  warn: 'assets/sounds/scan-warn.wav',
  error: 'assets/sounds/scan-error.wav',
} as const
type SoundId = keyof typeof sounds

const reviewKey = 'simple-festival.review.v1'
let soundsReady: Promise<void> | null = null

export function feedbackTone(status: ScanStatus): SoundId {
  if (status === 'accepted') {
    return 'ok'
  }
  if (status === 'duplicate') {
    return 'warn'
  }
  return 'error'
}

export async function prepareNativeShell() {
  if (!isNative) {
    return
  }
  await SplashScreen.hide().catch(() => undefined)
  await syncStatusBar(window.matchMedia('(prefers-color-scheme: dark)').matches)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => void syncStatusBar(event.matches))
}

export async function syncStatusBar(dark: boolean) {
  if (!isNative) {
    return
  }
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined)
}

function loadSounds() {
  soundsReady ??= (async () => {
    await NativeAudio.configure({ focus: false, background: false, ignoreSilent: false }).catch(() => undefined)
    await Promise.all(
      Object.entries(sounds).map(([assetId, assetPath]) =>
        NativeAudio.preload({ assetId, assetPath, volume: 0.9, audioChannelNum: 1 }).catch(() => undefined),
      ),
    )
  })()
  return soundsReady
}

export async function scanFeedback(status: ScanStatus) {
  const tone = feedbackTone(status)
  void loadSounds().then(() => NativeAudio.play({ assetId: tone }).catch(() => undefined))
  if (!isNative) {
    return
  }
  const type = tone === 'ok' ? NotificationType.Success : tone === 'warn' ? NotificationType.Warning : NotificationType.Error
  await Haptics.notification({ type }).catch(() => undefined)
}

export async function tapFeedback() {
  if (isNative) {
    await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined)
  }
}

export async function setScreenAwake(awake: boolean) {
  if (!isNative) {
    return
  }
  await (awake ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => undefined)
}

// Ionic toast instead of @capgo/capacitor-pretty-toast: its iOS overlay stays on screen when the user
// touches the app while it is showing (8.1.22).
const toastStyle = {
  success: { color: 'success', icon: checkmarkCircle },
  error: { color: 'danger', icon: alertCircle },
  info: { color: 'dark', icon: informationCircle },
  warning: { color: 'warning', icon: warning },
} as const

export async function notify(kind: 'success' | 'error' | 'info' | 'warning', title: string, message?: string) {
  await toastController.dismiss().catch(() => undefined)
  const toast = await toastController.create({
    header: title,
    message,
    duration: message ? 3200 : 2400,
    position: 'top',
    swipeGesture: 'vertical',
    cssClass: 'app-toast',
    ...toastStyle[kind],
  })
  await toast.present()
}

export async function copyText(value: string) {
  await Clipboard.write({ string: value })
}

export async function shareText(title: string, text: string) {
  if ((await Share.canShare()).value) {
    await Share.share({ title, text, dialogTitle: title })
    return
  }
  await copyText(text)
  notify('success', 'Copied to clipboard')
}

export async function saveCsv(fileName: string, csv: string) {
  if (!isNative) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }
  const file = await Filesystem.writeFile({ path: fileName, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8 })
  await Share.share({ title: fileName, url: file.uri, dialogTitle: 'Export scans' })
}

// Ask for a store review once, after a successful scanning session.
export async function maybeRequestReview(acceptedScans: number) {
  if (!isNative || acceptedScans < 20 || localStorage.getItem(reviewKey)) {
    return
  }
  localStorage.setItem(reviewKey, new Date().toISOString())
  await CapgoInAppReview.requestReview().catch(() => undefined)
}
