<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { IonButton, IonIcon } from '@ionic/vue'
import { arrowForward, chevronBack, keypadOutline } from 'ionicons/icons'
import { useCapgoQrScanner } from '../composables/useCapgoQrScanner'
import { useFestival } from '../composables/useFestival'
import type { ScanResult } from '../domain/types'
import { setScreenAwake, tapFeedback } from '../native/device'
import { serviceIcon, statusMeta } from '../ui'
import ResultCard from './ResultCard.vue'

const props = defineProps<{ mode: 'scan' | 'join' }>()
const emit = defineEmits<{ close: [] }>()

const { db, activeService, activeServiceId, activeServiceStat, handleScan, joinFromText } = useFestival()
const ready = ref(false)
const result = ref<ScanResult | null>(null)
const scanCount = ref(0)
const manualOpen = ref(!Capacitor.isNativePlatform())
const manualCode = ref('')
let resetTimer: number | undefined

const scanner = useCapgoQrScanner(ready, onScanned, '.camera-viewport')
const frameTone = computed(() => (result.value ? statusMeta(result.value.status).tone : 'idle'))
const hint = computed(() => {
  if (scanner.error.value) {
    return Capacitor.isNativePlatform() ? scanner.error.value : 'Camera scanning runs in the mobile app. Type a code below.'
  }
  if (props.mode === 'join') {
    return 'Point at the invite QR on the host phone'
  }
  return scanner.active.value ? 'Point at a ticket QR code' : 'Starting camera…'
})

let resumeListener: PluginListenerHandle | undefined

onMounted(async () => {
  if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add('camera-active')
  }
  ready.value = true
  void setScreenAwake(true)
  if (Capacitor.isNativePlatform()) {
    // iOS can drop the keep-awake flag while the app is in the background.
    resumeListener = await App.addListener('resume', () => void setScreenAwake(true))
  }
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('camera-active')
  window.clearTimeout(resetTimer)
  void setScreenAwake(false)
  void resumeListener?.remove()
})

async function onScanned(value: string) {
  if (props.mode === 'join') {
    if (await joinFromText(value)) {
      emit('close')
    }
    return
  }
  show(handleScan(value))
}

function show(next: ScanResult) {
  result.value = next
  scanCount.value += 1
  window.clearTimeout(resetTimer)
  resetTimer = window.setTimeout(() => (result.value = null), next.status === 'accepted' ? 2200 : 3500)
}

function submitManual() {
  const code = manualCode.value.trim()
  if (code) {
    void onScanned(code)
    manualCode.value = ''
  }
}

function selectMode(id: string) {
  activeServiceId.value = id
  result.value = null
  void tapFeedback()
}
</script>

<template>
  <div class="camera-screen ion-page" :class="`tone-${frameTone}`">
    <div id="camera-preview" class="camera-viewport" />

    <header class="top">
      <IonButton class="round" fill="clear" aria-label="Close scanner" @click="emit('close')">
        <IonIcon slot="icon-only" :icon="chevronBack" aria-hidden="true" />
      </IonButton>
      <div class="title">
        <small>{{ mode === 'join' ? 'Join device' : db?.name }}</small>
        <strong>{{ mode === 'join' ? 'Scan invite' : activeService?.label }}</strong>
      </div>
      <span v-if="mode === 'scan'" class="counter" aria-label="Scanned of eligible">
        {{ activeServiceStat?.scanned ?? 0 }}/{{ activeServiceStat?.eligible ?? 0 }}
      </span>
    </header>

    <nav v-if="mode === 'scan' && db && db.schema.services.length > 1" class="modes" aria-label="Scan mode">
      <button
        v-for="service in db.schema.services"
        :key="service.id"
        type="button"
        :class="{ active: service.id === activeService?.id }"
        :aria-pressed="service.id === activeService?.id"
        @click="selectMode(service.id)"
      >
        <IonIcon :icon="serviceIcon(service.kind)" aria-hidden="true" />{{ service.label }}
      </button>
    </nav>

    <div class="stage">
      <div class="frame-wrap" aria-hidden="true">
        <div class="frame"><i /><i /><i /><i /></div>
      </div>

      <footer class="bottom">
        <ResultCard v-if="result" :key="scanCount" :result="result" :db="db" :mode="activeService?.label" />
        <p v-else class="hint" role="status">{{ hint }}</p>

        <form v-if="manualOpen" class="manual" @submit.prevent="submitManual">
          <input
            v-model="manualCode"
            aria-label="Ticket code"
            autocomplete="off"
            autocapitalize="characters"
            enterkeyhint="go"
            :placeholder="mode === 'join' ? 'Paste invite code' : 'Type ticket code'"
          />
          <IonButton type="submit" shape="round" :disabled="!manualCode.trim()" aria-label="Check">
            <IonIcon slot="icon-only" :icon="arrowForward" aria-hidden="true" />
          </IonButton>
        </form>
        <IonButton v-else class="manual-toggle" fill="clear" @click="manualOpen = true">
          <IonIcon slot="start" :icon="keypadOutline" aria-hidden="true" />Type a code
        </IonButton>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.camera-screen {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  color: #fff;
  background: #05080f;
}

.camera-viewport {
  position: absolute;
  inset: 0;
  z-index: -1;
}

.top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(env(safe-area-inset-top) + 8px) max(12px, env(safe-area-inset-right)) 8px max(4px, env(safe-area-inset-left));
  background: linear-gradient(rgba(0, 0, 0, 0.55), transparent);
}

.round {
  --color: #fff;
  margin: 0;
}

.title {
  flex: 1;
  min-width: 0;
  display: grid;
}

.title small {
  overflow: hidden;
  opacity: 0.75;
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title strong {
  font-size: 1.15rem;
}

.counter {
  padding: 6px 12px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.16);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  backdrop-filter: blur(12px);
}

.modes {
  display: flex;
  gap: 8px;
  padding: 4px 16px 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.modes button {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 0;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  backdrop-filter: blur(12px);
}

.modes button.active {
  background: #fff;
  color: #0f172a;
}

.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.frame-wrap {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 16px;
}

.frame {
  --c: rgba(255, 255, 255, 0.95);
  position: relative;
  width: min(72vw, 300px, 42vh);
  aspect-ratio: 1;
  border-radius: 28px;
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.35);
  transition: box-shadow 0.2s;
}

.tone-success .frame {
  --c: var(--ion-color-success);
  box-shadow: 0 0 0 100vmax rgba(var(--ion-color-success-rgb), 0.28);
}

.tone-warning .frame {
  --c: var(--ion-color-warning);
  box-shadow: 0 0 0 100vmax rgba(var(--ion-color-warning-rgb), 0.28);
}

.tone-danger .frame {
  --c: var(--ion-color-danger);
  box-shadow: 0 0 0 100vmax rgba(var(--ion-color-danger-rgb), 0.3);
}

.frame i {
  position: absolute;
  width: 56px;
  height: 56px;
  border: 6px solid var(--c);
}

.frame i:nth-child(1) {
  top: 0;
  left: 0;
  border-right: 0;
  border-bottom: 0;
  border-top-left-radius: 28px;
}

.frame i:nth-child(2) {
  top: 0;
  right: 0;
  border-left: 0;
  border-bottom: 0;
  border-top-right-radius: 28px;
}

.frame i:nth-child(3) {
  bottom: 0;
  left: 0;
  border-right: 0;
  border-top: 0;
  border-bottom-left-radius: 28px;
}

.frame i:nth-child(4) {
  right: 0;
  bottom: 0;
  border-left: 0;
  border-top: 0;
  border-bottom-right-radius: 28px;
}

.bottom {
  display: grid;
  gap: 12px;
  min-height: 210px;
  align-content: end;
  padding: 16px max(16px, env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 16px) max(16px, env(safe-area-inset-left));
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6) 30%);
}

@media (max-height: 720px) {
  .bottom {
    min-height: 0;
  }
}

/* Landscape: frame on the left, feedback on the right. */
@media (orientation: landscape) and (min-width: 600px) {
  .stage {
    flex-direction: row;
  }

  .bottom {
    width: min(420px, 45%);
    align-content: center;
    background: none;
  }

  .frame {
    width: min(300px, 60vh);
  }

}

.bottom > *,
.top,
.modes {
  width: 100%;
  max-width: var(--app-max);
  margin-inline: auto;
}

.hint {
  margin: 0;
  padding: 16px;
  border-radius: var(--app-radius);
  background: rgba(255, 255, 255, 0.14);
  font-size: 1.05rem;
  font-weight: 600;
  text-align: center;
  backdrop-filter: blur(14px);
}

.manual {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 16px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.95);
}

.manual input {
  flex: 1;
  min-width: 0;
  height: 40px;
  border: 0;
  background: transparent;
  color: #0f172a;
  font: inherit;
  font-size: 1rem;
  outline: none;
}

.manual ion-button {
  margin: 0;
}

.manual-toggle {
  --color: #fff;
  justify-self: center;
  width: auto;
}

@media (orientation: landscape) and (min-width: 600px) {
  .top,
  .modes {
    max-width: none;
  }
}
</style>
