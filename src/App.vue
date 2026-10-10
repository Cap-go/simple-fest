<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { IonApp, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar } from '@ionic/vue'
import { qrCode, qrCodeOutline, settings, settingsOutline, sync as syncIcon, syncOutline } from 'ionicons/icons'
import CameraScreen from './components/CameraScreen.vue'
import ImportModal from './components/ImportModal.vue'
import OnboardingView from './components/OnboardingView.vue'
import ScanTab from './components/ScanTab.vue'
import SetupTab from './components/SetupTab.vue'
import SyncTab from './components/SyncTab.vue'
import { useFestival } from './composables/useFestival'
import { tapFeedback } from './native/device'

type Tab = 'scan' | 'sync' | 'event'

const { db, syncStatus } = useFestival()
const tab = ref<Tab>('scan')
const camera = ref<'scan' | 'join' | null>(null)
const importOpen = ref(false)

const tabs = [
  { id: 'scan' as const, label: 'Scan', icon: qrCodeOutline, activeIcon: qrCode },
  { id: 'sync' as const, label: 'Devices', icon: syncOutline, activeIcon: syncIcon },
  { id: 'event' as const, label: 'Event', icon: settingsOutline, activeIcon: settings },
]
const title = computed(() => (tab.value === 'scan' ? (db.value?.name ?? 'Simple Festival') : tab.value === 'sync' ? 'Devices' : 'Event'))
const syncOn = computed(() => syncStatus.value.mode === 'hosting' || syncStatus.value.mode === 'connected')

watch(db, (value, previous) => {
  if (!value) {
    camera.value = null
    tab.value = 'scan'
  } else if (!previous) {
    tab.value = 'scan'
  }
})

function onImported() {
  importOpen.value = false
  tab.value = 'scan'
}

function selectTab(next: Tab) {
  tab.value = next
  void tapFeedback()
}
</script>

<template>
  <IonApp>
    <CameraScreen v-if="camera" :mode="camera" @close="camera = null" />

    <OnboardingView v-else-if="!db" @import="importOpen = true" @join="camera = 'join'" />

    <IonPage v-else>
      <IonHeader class="ion-no-border">
        <IonToolbar>
          <IonTitle>{{ title }}</IonTitle>
          <IonButtons slot="end">
            <IonButton
              :class="['sync-chip', { on: syncOn }]"
              :aria-label="`Device sync: ${syncStatus.message}`"
              @click="selectTab('sync')"
            >
              <span class="dot" aria-hidden="true" />
              {{ syncOn ? (syncStatus.peers > 0 ? `${syncStatus.peers + 1} devices` : 'Live') : 'Offline' }}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <ScanTab v-if="tab === 'scan'" @scan="camera = 'scan'" />
        <SyncTab v-else-if="tab === 'sync'" @scan-invite="camera = 'join'" />
        <SetupTab v-else @import="importOpen = true" />
      </IonContent>

      <IonFooter class="tab-footer">
        <nav class="tab-bar" aria-label="Sections">
          <button
            v-for="item in tabs"
            :key="item.id"
            type="button"
            :class="{ selected: tab === item.id }"
            :aria-current="tab === item.id ? 'page' : undefined"
            @click="selectTab(item.id)"
          >
            <IonIcon :icon="tab === item.id ? item.activeIcon : item.icon" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </IonFooter>
    </IonPage>

    <ImportModal :open="importOpen" @close="importOpen = false" @imported="onImported" />
  </IonApp>
</template>

<style scoped>
ion-title {
  font-weight: 800;
}

.sync-chip {
  --padding-start: 12px;
  --padding-end: 12px;
  --border-radius: 99px;
  --background: var(--app-surface-2);
  --color: var(--app-muted);
  height: 32px;
  font-size: 0.85rem;
  font-weight: 600;
}

.sync-chip .dot {
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--ion-color-medium);
}

.sync-chip.on {
  --background: rgba(var(--ion-color-success-rgb), 0.14);
  --color: var(--ion-color-success);
}

.sync-chip.on .dot {
  background: var(--ion-color-success);
}

.tab-footer {
  border-top: 1px solid var(--app-line);
  background: var(--ion-tab-bar-background);
  backdrop-filter: saturate(180%) blur(20px);
}

.tab-bar {
  display: flex;
  max-width: var(--app-max);
  margin: 0 auto;
  padding-bottom: env(safe-area-inset-bottom);
}

.tab-bar button {
  flex: 1;
  display: grid;
  justify-items: center;
  gap: 2px;
  min-height: 56px;
  padding: 8px 0 6px;
  border: 0;
  background: transparent;
  color: var(--app-muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.tab-bar ion-icon {
  font-size: 1.5rem;
}

.tab-bar button.selected {
  color: var(--ion-color-primary);
}
</style>
