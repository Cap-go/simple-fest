import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { NativeNavigation, type NativeNavigationIcon } from '@capgo/capacitor-native-navigation'
import { onBeforeUnmount, onMounted, ref, watchEffect, type Ref } from 'vue'
import { qrCode, qrCodeOutline, settings, settingsOutline, sync, syncOutline } from 'ionicons/icons'

// Native navbar and tab bar on iOS/Android; the web build keeps the Ionic header and footer.
export const nativeChrome = Capacitor.isNativePlatform()

export type ChromeTab = 'scan' | 'sync' | 'event'

type ChromeState = {
  visible: Ref<boolean>
  title: Ref<string>
  tab: Ref<ChromeTab>
  syncLabel: Ref<string>
  syncOn: Ref<boolean>
  // True once the page is scrolled: the large title collapses into the small centered one.
  collapsed: Ref<boolean>
}

// Native bars follow the neutral ink of the web UI: black in light mode, white in dark mode.
const darkScheme = window.matchMedia('(prefers-color-scheme: dark)')
const dark = ref(darkScheme.matches)
darkScheme.addEventListener('change', (event) => (dark.value = event.matches))
const overlayEvents = ['Modal', 'Alert', 'ActionSheet', 'Popover', 'Picker']

// Ionicons ship as data URLs styled by CSS classes; inline those styles for native rendering.
function svg(dataUrl: string) {
  return decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml;utf8,/, ''))
    .replace("class='ionicon'", "fill='currentColor' stroke='currentColor'")
    .replaceAll("class='ionicon-fill-none ionicon-stroke-width'", "fill='none' stroke-width='32'")
    .replaceAll("class='ionicon-fill-none'", "fill='none'")
    .replaceAll("class='ionicon-stroke-width'", "stroke-width='32'")
}

// iOS uses SF Symbols (a top-level svg would win over them), Android renders the ionicon.
function icon(sfSymbol: string, ionicon: string): NativeNavigationIcon {
  return { ios: { sfSymbol }, android: { svg: svg(ionicon) } }
}

const tabs = [
  { id: 'scan', title: 'Scan', icon: icon('qrcode.viewfinder', qrCodeOutline), selectedIcon: icon('qrcode.viewfinder', qrCode) },
  { id: 'sync', title: 'Devices', icon: icon('arrow.triangle.2.circlepath', syncOutline), selectedIcon: icon('arrow.triangle.2.circlepath', sync) },
  { id: 'event', title: 'Event', icon: icon('gearshape', settingsOutline), selectedIcon: icon('gearshape.fill', settings) },
]

export function useNativeChrome(state: ChromeState, onTab: (tab: ChromeTab) => void) {
  // Ionic overlays render inside the WebView, below native bars, so hide the bars while one is open.
  const overlays = ref(0)
  const listeners: PluginListenerHandle[] = []
  const onPresent = () => (overlays.value += 1)
  const onDismiss = () => (overlays.value = Math.max(0, overlays.value - 1))

  if (!nativeChrome) {
    return
  }

  onMounted(async () => {
    for (const name of overlayEvents) {
      document.addEventListener(`ion${name}WillPresent`, onPresent)
      document.addEventListener(`ion${name}WillDismiss`, onDismiss)
    }
    await NativeNavigation.configure({ contentInsetMode: 'css', platformStyle: 'auto' })
    listeners.push(
      await NativeNavigation.addListener('tabSelect', ({ id }) => onTab(id as ChromeTab)),
      await NativeNavigation.addListener('navbarItemTap', ({ id }) => id === 'sync' && onTab('sync')),
    )
  })

  onBeforeUnmount(() => {
    for (const name of overlayEvents) {
      document.removeEventListener(`ion${name}WillPresent`, onPresent)
      document.removeEventListener(`ion${name}WillDismiss`, onDismiss)
    }
    for (const listener of listeners) void listener.remove()
  })

  watchEffect(() => {
    const tint = dark.value ? '#ffffff' : '#111111'
    const hidden = !state.visible.value || overlays.value > 0
    void NativeNavigation.setNavbar({
      hidden,
      title: state.title.value,
      large: !state.collapsed.value,
      animated: true,
      backButton: { visible: false },
      rightItems: [
        {
          id: 'sync',
          title: state.syncLabel.value,
          icon: { ios: { sfSymbol: state.syncOn.value ? 'dot.radiowaves.left.and.right' : 'wifi.slash' } },
        },
      ],
      colors: { tint, dynamic: true },
    })
    void NativeNavigation.setTabbar({
      hidden,
      selectedId: state.tab.value,
      labelVisibilityMode: 'labeled',
      colors: { tint, dynamic: true },
      tabs,
    })
  })
}
