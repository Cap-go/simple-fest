<script setup lang="ts">
import { computed, ref } from 'vue'
import { IonButton, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonNote, IonTitle, IonToolbar } from '@ionic/vue'
import { arrowForward, arrowUndoOutline, chevronForward, scan } from 'ionicons/icons'
import { useFestival } from '../composables/useFestival'
import { tapFeedback } from '../native/device'
import { serviceIcon, statusMeta, timeLabel } from '../ui'

const emit = defineEmits<{ scan: [] }>()
const { db, activeServiceId, activeService, activeServiceStat, statFor, handleScan, scanLog, undoLastScan } = useFestival()
// Lets the gate find a guest by name when the QR is lost or unreadable.
const guestNames = computed(() => {
  const column = db.value?.schema.nameColumn
  return column ? [...new Set(db.value?.records.map((record) => record.values[column]?.trim()).filter(Boolean))].slice(0, 2000) : []
})
const manualCode = ref('')
const recentOpen = ref(false)

const ring = 2 * Math.PI * 54
const progress = computed(() => {
  const stat = activeServiceStat.value
  return stat && stat.eligible > 0 ? Math.min(1, stat.scanned / stat.eligible) : 0
})
const latest = computed(() => scanLog.value[0])

function selectMode(id: string) {
  activeServiceId.value = id
  void tapFeedback()
}

function submitManual() {
  const code = manualCode.value.trim()
  if (code) {
    handleScan(code)
    manualCode.value = ''
  }
}
</script>

<template>
  <div v-if="db" class="scan-screen">
    <nav class="modes" role="radiogroup" aria-label="Scan mode">
      <button
        v-for="service in db.schema.services"
        :key="service.id"
        type="button"
        role="radio"
        :aria-checked="activeService?.id === service.id"
        :class="{ active: activeService?.id === service.id }"
        @click="selectMode(service.id)"
      >
        <IonIcon :icon="serviceIcon(service.kind)" aria-hidden="true" />
        <span>{{ service.label }}</span>
        <small>{{ statFor(service.id)?.scanned ?? 0 }}/{{ statFor(service.id)?.eligible ?? 0 }}</small>
      </button>
    </nav>
    <p v-if="!db.schema.services.length" class="empty">No scan modes yet. Add one in the Event tab.</p>

    <div class="stage">
      <button class="hero" type="button" :disabled="!activeService" @click="emit('scan')">
        <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="54" class="track" />
          <circle cx="60" cy="60" r="54" class="value" :stroke-dasharray="ring" :stroke-dashoffset="ring * (1 - progress)" />
        </svg>
        <span class="hero-center">
          <IonIcon :icon="activeService ? serviceIcon(activeService.kind) : scan" aria-hidden="true" />
          <strong>{{ activeServiceStat?.scanned ?? 0 }}<small> / {{ activeServiceStat?.eligible ?? 0 }}</small></strong>
          <span>{{ activeService?.label ?? 'Scan' }}</span>
        </span>
        <span class="cta"><IonIcon :icon="scan" aria-hidden="true" />Tap to scan</span>
      </button>

      <div class="side">
        <button v-if="latest" type="button" :class="['last', statusMeta(latest.status).tone]" aria-live="polite" @click="recentOpen = true">
          <IonIcon :icon="statusMeta(latest.status).icon" aria-hidden="true" />
          <span>
            <strong>{{ latest.title }}</strong>
            <small>{{ latest.guest ?? latest.payload }} · {{ latest.serviceLabel }}</small>
          </span>
          <IonIcon class="chevron" :icon="chevronForward" aria-hidden="true" />
        </button>

        <IonButton v-if="latest?.status === 'accepted' && latest.event" fill="clear" size="small" @click="undoLastScan(latest.event.id)">
          <IonIcon slot="start" :icon="arrowUndoOutline" aria-hidden="true" />Undo last scan
        </IonButton>

        <form class="manual" @submit.prevent="submitManual">
          <input
            v-model="manualCode"
            aria-label="Ticket code, email or name"
            autocomplete="off"
            autocapitalize="none"
            enterkeyhint="go"
            list="guest-names"
            placeholder="Ticket code, email or name"
          />
          <datalist id="guest-names">
            <option v-for="guestName in guestNames" :key="guestName" :value="guestName" />
          </datalist>
          <IonButton type="submit" shape="round" :disabled="!manualCode.trim()" aria-label="Check ticket">
            <IonIcon slot="icon-only" :icon="arrowForward" aria-hidden="true" />
          </IonButton>
        </form>
      </div>
    </div>

    <IonModal :is-open="recentOpen" :initial-breakpoint="0.6" :breakpoints="[0, 0.6, 1]" @did-dismiss="recentOpen = false">
      <IonHeader>
        <IonToolbar>
          <IonTitle>Recent scans</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList lines="full">
          <IonItem v-for="entry in scanLog" :key="entry.id">
            <IonIcon slot="start" :icon="statusMeta(entry.status).icon" :color="statusMeta(entry.status).tone" aria-hidden="true" />
            <IonLabel>
              <h3>{{ entry.guest ?? entry.payload }}</h3>
              <p>{{ entry.title }} · {{ entry.serviceLabel }}</p>
            </IonLabel>
            <IonNote slot="end">{{ timeLabel(entry.at) }}</IonNote>
          </IonItem>
        </IonList>
      </IonContent>
    </IonModal>
  </div>
</template>

<style scoped>
.scan-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0 12px;
}

.modes {
  flex: none;
  display: flex;
  gap: 8px;
  padding: 0 16px;
  overflow-x: auto;
  scrollbar-width: none;
}

.modes::-webkit-scrollbar {
  display: none;
}

.modes button {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: 99px;
  background: var(--app-surface);
  color: var(--ion-text-color);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
}

.modes button ion-icon {
  color: var(--app-muted);
  font-size: 1.1rem;
}

.modes button small {
  color: var(--app-muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.modes button.active {
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
}

.modes button.active ion-icon,
.modes button.active small {
  color: inherit;
}

.empty {
  margin: 0 16px;
  color: var(--app-muted);
}

.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px;
}

.hero {
  flex: 1;
  min-height: 0;
  position: relative;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 28px;
  background: var(--app-surface);
  color: var(--ion-text-color);
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s;
}

.hero:active {
  transform: scale(0.985);
}

.ring {
  position: absolute;
  top: 50%;
  left: 50%;
  height: min(64%, 300px);
  aspect-ratio: 1;
  translate: -50% -56%;
  rotate: -90deg;
}

.ring circle {
  fill: none;
  stroke-width: 7;
}

.ring .track {
  stroke: var(--app-surface-2);
}

.ring .value {
  stroke: var(--ion-color-primary);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.4s ease;
}

.hero-center {
  display: grid;
  justify-items: center;
  gap: 4px;
  translate: 0 -6%;
}

.hero-center ion-icon {
  font-size: 1.8rem;
  color: var(--app-muted);
}

.hero-center strong {
  font-size: 2.6rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.hero-center strong small {
  color: var(--app-muted);
  font-size: 1.2rem;
  font-weight: 600;
}

.hero-center > span {
  color: var(--app-muted);
  font-size: 1rem;
  font-weight: 600;
}

.cta {
  position: absolute;
  bottom: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border-radius: 99px;
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
  font-weight: 700;
}

.side {
  flex: none;
  display: grid;
  gap: 12px;
}

.last {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 60px;
  padding: 10px 14px;
  border: 0;
  border-radius: 18px;
  background: var(--tone);
  color: var(--tone-contrast);
  font: inherit;
  text-align: left;
}

.last.success {
  --tone: var(--ion-color-success);
  --tone-contrast: var(--ion-color-success-contrast);
}

.last.warning {
  --tone: var(--ion-color-warning);
  --tone-contrast: var(--ion-color-warning-contrast);
}

.last.danger {
  --tone: var(--ion-color-danger);
  --tone-contrast: var(--ion-color-danger-contrast);
}

.last > ion-icon:first-child {
  flex: none;
  font-size: 1.8rem;
}

.last span {
  flex: 1;
  min-width: 0;
  display: grid;
}

.last strong {
  font-size: 1.05rem;
}

.last small {
  overflow: hidden;
  opacity: 0.9;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.last .chevron {
  opacity: 0.7;
}

.manual {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 6px 0 16px;
  border-radius: 99px;
  background: var(--app-surface);
}

.manual input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--ion-text-color);
  font: inherit;
  font-size: 1rem;
  outline: none;
}

.manual ion-button {
  margin: 0;
}

/* Wide windows (iPhone Duo inner display, iPad, landscape): hero beside the controls. */
@media (min-width: 840px), (orientation: landscape) and (min-width: 640px) {
  .stage {
    flex-direction: row;
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
  }

  .side {
    width: min(380px, 42%);
    align-content: end;
  }
}

ion-item ion-icon[slot='start'] {
  font-size: 1.6rem;
  margin-inline-end: 14px;
}
</style>
