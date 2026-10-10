<script setup lang="ts">
import { ref } from 'vue'
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote } from '@ionic/vue'
import { arrowForward, scanOutline } from 'ionicons/icons'
import { useFestival } from '../composables/useFestival'
import { tapFeedback } from '../native/device'
import { serviceIcon, statusMeta, timeLabel } from '../ui'
import ResultCard from './ResultCard.vue'

const emit = defineEmits<{ scan: [] }>()
const { db, activeServiceId, activeService, statFor, handleScan, lastResult, scanLog } = useFestival()
const manualCode = ref('')

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

function progress(id: string) {
  const stat = statFor(id)
  return stat && stat.eligible > 0 ? Math.min(100, Math.round((stat.scanned / stat.eligible) * 100)) : 0
}
</script>

<template>
  <div v-if="db" class="page-width scan-tab">
    <h2 id="modes-title" class="section-title">Scan mode</h2>
    <div class="mode-grid" role="radiogroup" aria-labelledby="modes-title">
      <button
        v-for="service in db.schema.services"
        :key="service.id"
        :class="['mode-card', { active: activeService?.id === service.id }]"
        type="button"
        role="radio"
        :aria-checked="activeService?.id === service.id"
        @click="selectMode(service.id)"
      >
        <span class="mode-icon"><IonIcon :icon="serviceIcon(service.kind)" aria-hidden="true" /></span>
        <strong>{{ service.label }}</strong>
        <span class="mode-count">{{ statFor(service.id)?.scanned ?? 0 }} / {{ statFor(service.id)?.eligible ?? 0 }}</span>
        <span class="bar" aria-hidden="true"><span :style="{ width: `${progress(service.id)}%` }" /></span>
      </button>
    </div>
    <p v-if="!db.schema.services.length" class="muted empty">No scan modes yet. Add one in the Event tab.</p>

    <IonButton class="tall start" expand="block" :disabled="!activeService" @click="emit('scan')">
      <IonIcon slot="start" :icon="scanOutline" aria-hidden="true" />
      Scan {{ activeService?.label ?? 'tickets' }}
    </IonButton>

    <form class="manual card" @submit.prevent="submitManual">
      <label for="manual-code" class="sr-only">Ticket code or email</label>
      <input
        id="manual-code"
        v-model="manualCode"
        autocomplete="off"
        autocapitalize="characters"
        enterkeyhint="go"
        placeholder="Type ticket code or email"
      />
      <IonButton type="submit" shape="round" :disabled="!manualCode.trim()" aria-label="Check ticket">
        <IonIcon slot="icon-only" :icon="arrowForward" aria-hidden="true" />
      </IonButton>
    </form>

    <ResultCard v-if="lastResult" class="last" :result="lastResult" :db="db" :mode="activeService?.label" />

    <template v-if="scanLog.length">
      <h2 class="section-title">Recent scans</h2>
      <IonList class="inset" lines="full">
        <IonItem v-for="entry in scanLog.slice(0, 12)" :key="entry.id">
          <IonIcon slot="start" :icon="statusMeta(entry.status).icon" :color="statusMeta(entry.status).tone" aria-hidden="true" />
          <IonLabel>
            <h3>{{ entry.guest ?? entry.payload }}</h3>
            <p>{{ entry.title }} · {{ entry.serviceLabel }}</p>
          </IonLabel>
          <IonNote slot="end">{{ timeLabel(entry.at) }}</IonNote>
        </IonItem>
      </IonList>
    </template>
  </div>
</template>

<style scoped>
.scan-tab {
  padding: 0 16px 24px;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (min-width: 640px) {
  .mode-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.mode-card {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'icon count'
    'label label'
    'bar bar';
  align-items: center;
  gap: 10px 8px;
  min-height: 112px;
  padding: 14px;
  border: 2px solid var(--app-line);
  border-radius: var(--app-radius);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
  color: var(--ion-text-color);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
}

.mode-card:active {
  transform: scale(0.98);
}

.mode-card.active {
  border-color: var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.08);
}

.mode-icon {
  grid-area: icon;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--app-surface-2);
  color: var(--ion-color-primary);
  font-size: 1.2rem;
}

.active .mode-icon {
  background: var(--ion-color-primary);
  color: var(--ion-color-primary-contrast);
}

.mode-card strong {
  grid-area: label;
  font-size: 1rem;
  line-height: 1.2;
}

.mode-count {
  grid-area: count;
  justify-self: end;
  color: var(--app-muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.bar {
  grid-area: bar;
  height: 5px;
  overflow: hidden;
  border-radius: 99px;
  background: var(--app-surface-2);
}

.bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ion-color-primary);
}

.empty {
  margin: 8px 4px;
}

.start {
  margin: 20px 0 12px;
}

.manual {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 16px;
}

.manual input {
  flex: 1;
  min-width: 0;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--ion-text-color);
  font: inherit;
  font-size: 1rem;
  outline: none;
}

.manual ion-button {
  margin: 0;
  --padding-start: 12px;
  --padding-end: 12px;
}

.last {
  margin-top: 16px;
}

ion-item ion-icon[slot='start'] {
  font-size: 1.6rem;
  margin-inline-end: 14px;
}

ion-item h3 {
  font-weight: 600;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
