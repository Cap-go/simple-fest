import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { createApp } from 'vue'
import { IonicVue } from '@ionic/vue'
import App from './App.vue'
import './index.css'
import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'

const app = createApp(App).use(IonicVue)

app.mount('#app')

if (Capacitor.isNativePlatform()) {
  void CapacitorUpdater.notifyAppReady()
}
