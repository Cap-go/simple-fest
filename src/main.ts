import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { createApp } from 'vue'
import { IonicVue } from '@ionic/vue'
import App from './App.vue'
import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'
import './index.css'

function installMobileZoomGuards() {
  let lastTouchEnd = 0
  const preventDefault = (event: Event) => event.preventDefault()

  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        event.preventDefault()
      }
      lastTouchEnd = now
    },
    { passive: false },
  )
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    },
    { passive: false },
  )
  document.addEventListener('gesturestart', preventDefault, { passive: false })
  document.addEventListener('gesturechange', preventDefault, { passive: false })
}

installMobileZoomGuards()

const app = createApp(App).use(IonicVue)

app.mount('#app')

if (Capacitor.isNativePlatform()) {
  void CapacitorUpdater.notifyAppReady()
}
